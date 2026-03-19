'use strict';

/**
 * insights-parser.js — Parse /insights HTML reports and convert findings
 * to PBR learnings entries (dual-write to learnings.jsonl and KNOWLEDGE.md).
 *
 * Usage (library):
 *   const { parseInsightsHtml, insightsImport } = require('./lib/insights-parser');
 *
 * Usage (CLI via pbr-tools.js dispatch):
 *   node pbr-tools.js insights import <html-file> [--project <name>]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { learningsIngest } = require('./learnings');

// --- Category detection ---

/**
 * Category keywords map. Each category has an array of trigger words/phrases.
 */
const CATEGORY_KEYWORDS = {
  friction: ['friction', 'repeated', 'manual', 'tedious', 'workaround', 'repetitive', 'copy-paste', 'boilerplate'],
  workflow: ['workflow', 'process', 'pipeline', 'improvement', 'automation', 'streamline', 'efficiency'],
  rules: ['rule', 'constraint', 'must', 'always', 'never', 'convention', 'standard', 'enforce'],
  patterns: ['pattern', 'recurring', 'reusable', 'convention', 'idiom', 'approach', 'technique']
};

/**
 * Category-to-learning-type mapping.
 */
const CATEGORY_TYPE_MAP = {
  friction: 'process-failure',
  workflow: 'process-win',
  rules: 'tech-pattern',
  patterns: 'tech-pattern'
};

/**
 * Category-specific tags.
 */
const CATEGORY_TAGS = {
  friction: ['friction'],
  workflow: ['workflow', 'process'],
  rules: ['planning'],
  patterns: ['estimation']
};

/**
 * Detect the category of a text block based on keyword matches.
 * @param {string} text
 * @returns {string} One of: friction, workflow, rules, patterns
 */
function detectCategory(text) {
  const lower = text.toLowerCase();
  let bestCategory = 'patterns'; // default
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

// --- HTML parsing ---

/**
 * Parse an insights HTML report and extract structured findings.
 * Uses regex-based parsing (no external HTML parser dependency).
 *
 * @param {string} htmlContent - Raw HTML string from /insights report
 * @returns {{ findings: object[], metadata: { source: string, extractedAt: string, totalFindings: number } }}
 */
function parseInsightsHtml(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string' || htmlContent.trim().length === 0) {
    return {
      findings: [],
      metadata: { source: 'insights-html', extractedAt: new Date().toISOString(), totalFindings: 0 }
    };
  }

  // Strip HTML tags, preserving section breaks at headings
  const withBreaks = htmlContent
    .replace(/<h[23][^>]*>/gi, '\n###HEADING###')
    .replace(/<\/h[23]>/gi, '###/HEADING###\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  const decoded = withBreaks
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Split into sections by heading markers
  const sections = decoded.split('###HEADING###');
  const findings = [];

  for (const section of sections) {
    if (!section.trim()) continue;

    // Extract heading text
    const headingEnd = section.indexOf('###/HEADING###');
    let heading = '';
    let body = section;

    if (headingEnd !== -1) {
      heading = section.slice(0, headingEnd).trim();
      body = section.slice(headingEnd + '###/HEADING###'.length).trim();
    }

    if (!body || body.trim().length < 10) continue;

    // Split body into individual findings (by list items or paragraphs)
    const items = body
      .split(/\n\s*-\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);

    if (items.length === 0) {
      // Treat entire body as one finding
      items.push(body.replace(/\s+/g, ' ').trim());
    }

    for (const item of items) {
      const cleanItem = item.replace(/\s+/g, ' ').trim();
      if (cleanItem.length < 10) continue;

      const category = detectCategory(heading + ' ' + cleanItem);
      const summary = cleanItem.length > 200 ? cleanItem.slice(0, 197) + '...' : cleanItem;
      const categoryTags = CATEGORY_TAGS[category] || [];

      findings.push({
        category,
        summary,
        detail: cleanItem,
        tags: ['insights', ...categoryTags]
      });
    }
  }

  return {
    findings,
    metadata: {
      source: 'insights-html',
      extractedAt: new Date().toISOString(),
      totalFindings: findings.length
    }
  };
}

// --- KNOWLEDGE.md helpers (reused from milestone-learnings.js pattern) ---

/**
 * Count existing rows with a given prefix (K, P, L) in KNOWLEDGE.md content.
 * @param {string} content
 * @param {string} prefix
 * @returns {number}
 */
function countExistingRows(content, prefix) {
  const regex = new RegExp(`^\\| ${prefix}\\d+`, 'gm');
  return (content.match(regex) || []).length;
}

/**
 * Insert a table row at the end of a table section in KNOWLEDGE.md.
 * @param {string} content
 * @param {string} sectionHeading
 * @param {string} row
 * @returns {string}
 */
function insertTableRow(content, sectionHeading, row) {
  const lines = content.split('\n');
  let sectionFound = false;
  let lastTableRowIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(sectionHeading)) {
      sectionFound = true;
      continue;
    }
    if (sectionFound) {
      if (lines[i].startsWith('|')) {
        lastTableRowIdx = i;
      }
      if (lines[i].startsWith('## ') && lastTableRowIdx !== -1) {
        break;
      }
    }
  }

  if (lastTableRowIdx !== -1) {
    lines.splice(lastTableRowIdx + 1, 0, row);
    return lines.join('\n');
  }

  return content + '\n' + row + '\n';
}

// --- Import function ---

/**
 * Import findings from an insights HTML file into both learnings.jsonl and KNOWLEDGE.md.
 *
 * @param {string} htmlFilePath - Path to the HTML report file
 * @param {string} [projectName] - Project name (default: basename of cwd)
 * @param {string} [planningDir] - Path to .planning/ directory (default: cwd/.planning)
 * @param {{ learningsFilePath?: string }} [options] - Optional overrides for testing
 * @returns {{ imported: number, findings: string[], knowledgeUpdated: boolean }}
 */
function insightsImport(htmlFilePath, projectName, planningDir, options = {}) {
  if (!htmlFilePath) {
    throw new Error('htmlFilePath is required');
  }

  const resolvedPath = path.resolve(htmlFilePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`HTML file not found: ${resolvedPath}`);
  }

  const project = projectName || path.basename(process.cwd());
  const planning = planningDir || path.join(process.cwd(), '.planning');
  const knowledgePath = path.join(planning, 'KNOWLEDGE.md');

  // Read and parse HTML
  const htmlContent = fs.readFileSync(resolvedPath, 'utf8');
  const { findings } = parseInsightsHtml(htmlContent);

  if (findings.length === 0) {
    return { imported: 0, findings: [], knowledgeUpdated: false };
  }

  // Prepare learnings ingest options
  const ingestOpts = {};
  if (options.learningsFilePath) {
    ingestOpts.filePath = options.learningsFilePath;
  }

  // Write to learnings.jsonl
  let imported = 0;
  const summaries = [];

  for (const finding of findings) {
    const type = CATEGORY_TYPE_MAP[finding.category] || 'tech-pattern';

    try {
      learningsIngest({
        source_project: project,
        type,
        tags: finding.tags,
        confidence: 'low',
        occurrences: 1,
        summary: finding.summary.slice(0, 200),
        detail: finding.detail
      }, ingestOpts);
      imported++;
      summaries.push(finding.summary);
    } catch (_e) {
      // Skip entries that fail validation
    }
  }

  // Write to KNOWLEDGE.md
  let knowledgeUpdated = false;

  if (fs.existsSync(knowledgePath)) {
    let content = fs.readFileSync(knowledgePath, 'utf8');
    const today = new Date().toISOString().split('T')[0];

    let kCount = countExistingRows(content, 'K');
    let pCount = countExistingRows(content, 'P');
    let lCount = countExistingRows(content, 'L');

    for (const finding of findings) {
      const escapedSummary = finding.summary.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const type = CATEGORY_TYPE_MAP[finding.category] || 'tech-pattern';

      if (finding.category === 'rules') {
        kCount++;
        const id = `K${String(kCount).padStart(3, '0')}`;
        const row = `| ${id} | ${escapedSummary} | ${type} | insights-import | ${today} |`;
        content = insertTableRow(content, '## Key Rules', row);
      } else if (finding.category === 'patterns') {
        pCount++;
        const id = `P${String(pCount).padStart(3, '0')}`;
        const row = `| ${id} | ${escapedSummary} | ${type} | insights-import | ${today} |`;
        content = insertTableRow(content, '## Patterns', row);
      } else {
        lCount++;
        const id = `L${String(lCount).padStart(3, '0')}`;
        const row = `| ${id} | ${escapedSummary} | ${type} | insights-import | ${today} |`;
        content = insertTableRow(content, '## Lessons Learned', row);
      }
    }

    // Update frontmatter date
    content = content.replace(/^(updated:\s*)"[^"]*"/m, `$1"${today}"`);
    fs.writeFileSync(knowledgePath, content, 'utf8');
    knowledgeUpdated = true;
  }

  return { imported, findings: summaries, knowledgeUpdated };
}

module.exports = { parseInsightsHtml, insightsImport };
