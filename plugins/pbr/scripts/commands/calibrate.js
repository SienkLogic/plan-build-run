'use strict';

/**
 * commands/calibrate.js - Agent calibration command handler.
 *
 * Scans milestone artifacts to analyze evaluation patterns,
 * gap distributions, and trust scores for any evaluative agent.
 * Writes advisory findings to .planning/intel/{agent}-calibration.md.
 *
 * Usage:
 *   pbr-tools.js calibrate verifier
 *   pbr-tools.js calibrate audit
 *   pbr-tools.js calibrate integration-checker
 *   pbr-tools.js calibrate plan-checker
 *   pbr-tools.js calibrate all
 */

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('../lib/frontmatter');
const { loadScores } = require('../trust-tracker');

// ---------------------------------------------------------------------------
// Supported calibration targets and their corpus sources
// ---------------------------------------------------------------------------

const CALIBRATION_TARGETS = {
  'verifier': {
    description: 'Verification quality analysis',
    corpusPattern: 'VERIFICATION*.md',
    corpusLocations: ['milestones'],
    parseFile: parseVerification,
    reportTitle: 'Verifier Calibration Report'
  },
  'audit': {
    description: 'Session audit quality analysis',
    corpusPattern: '*session-audit*.md',
    corpusLocations: ['audits'],
    parseFile: parseAuditReport,
    reportTitle: 'Audit Agent Calibration Report'
  },
  'integration-checker': {
    description: 'Integration check quality analysis',
    corpusPattern: '*MILESTONE-AUDIT*.md',
    corpusLocations: [''],
    parseFile: parseIntegrationReport,
    reportTitle: 'Integration Checker Calibration Report'
  },
  'plan-checker': {
    description: 'Plan checking quality analysis (limited corpus)',
    corpusPattern: 'PLAN*.md',
    corpusLocations: ['milestones'],
    parseFile: parsePlanForCheckerSignals,
    reportTitle: 'Plan Checker Calibration Report'
  }
};

const VALID_TARGETS = Object.keys(CALIBRATION_TARGETS);

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively find files matching a pattern under a directory.
 * @param {string} dir - Directory to search
 * @param {string} pattern - Glob-like pattern (simple: prefix*suffix)
 * @returns {string[]} Array of absolute paths
 */
function findFiles(dir, pattern) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  // Convert simple glob to regex
  const regexStr = '^' + pattern.replace(/\*/g, '.*') + '$';
  const regex = new RegExp(regexStr);

  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch (_e) { return; }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (regex.test(entry.name)) {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

// Backward compat alias
function findVerificationFiles(dir) {
  return findFiles(dir, 'VERIFICATION*.md');
}

// ---------------------------------------------------------------------------
// Parsers per agent type
// ---------------------------------------------------------------------------

/**
 * Parse a VERIFICATION.md file into a structured record.
 */
function parseVerification(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fm = extractFrontmatter(content);

  const total = parseInt(fm.must_haves_checked || fm.must_haves_total || '0', 10);
  const passed = parseInt(fm.must_haves_passed || '0', 10);
  const failed = parseInt(fm.must_haves_failed || '0', 10);
  const status = (fm.result || fm.status || 'unknown').toLowerCase();

  const gaps = extractGaps(content);

  return { path: filePath, status, total, passed, failed, gapCount: gaps.length || failed, gaps };
}

/**
 * Parse an audit report into a structured record.
 */
function parseAuditReport(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fm = extractFrontmatter(content);

  const status = (fm.result || fm.status || fm.overall_score || 'unknown').toLowerCase();
  const total = parseInt(fm.dimensions_checked || fm.checks_total || '0', 10);
  const passed = parseInt(fm.dimensions_passed || fm.checks_passed || '0', 10);

  // Extract findings as gaps
  const gaps = [];
  const findingsMatch = content.match(/## (?:Findings|Issues|Violations)([\s\S]*?)(?=\n## [^#]|\n---|\Z)/);
  if (findingsMatch) {
    const lines = findingsMatch[1].split('\n').filter(l => /^[-*]\s/.test(l.trim()));
    for (const line of lines) {
      gaps.push(line.replace(/^[-*]\s+/, '').trim());
    }
  }

  return { path: filePath, status, total, passed, failed: total - passed, gapCount: gaps.length, gaps };
}

/**
 * Parse a MILESTONE-AUDIT.md into a structured record.
 */
function parseIntegrationReport(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fm = extractFrontmatter(content);

  const status = (fm.result || fm.status || 'unknown').toLowerCase();

  // Extract integration gaps
  const gaps = [];
  const gapMatches = content.match(/(?:gap|issue|warning|missing)[^.\n]*\./gi) || [];
  for (const m of gapMatches.slice(0, 20)) {
    gaps.push(m.trim());
  }

  return { path: filePath, status, total: 0, passed: 0, failed: 0, gapCount: gaps.length, gaps };
}

/**
 * Parse PLAN.md files for signals about plan-checker quality.
 * Since plan-checker output is ephemeral, we infer from plan structure.
 */
function parsePlanForCheckerSignals(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fm = extractFrontmatter(content);

  const gaps = [];

  // Check for common plan quality issues the checker should catch
  const mustHaves = fm.must_haves || {};
  const truths = mustHaves.truths || [];
  const artifacts = mustHaves.artifacts || [];
  const keyLinks = mustHaves.key_links || [];

  if (truths.length === 0 && typeof mustHaves === 'object') {
    gaps.push('Plan has no truths in must_haves');
  }
  if (artifacts.length === 0 && typeof mustHaves === 'object') {
    gaps.push('Plan has no artifacts in must_haves');
  }
  if (keyLinks.length === 0 && typeof mustHaves === 'object') {
    gaps.push('Plan has no key_links in must_haves');
  }

  // Check for vague criteria
  const allCriteria = [...truths, ...artifacts, ...keyLinks].join(' ');
  if (/should be good|properly handles|clean code/i.test(allCriteria)) {
    gaps.push('Plan contains vague criteria');
  }

  const status = gaps.length === 0 ? 'pass' : 'issues_found';
  return { path: filePath, status, total: 3, passed: 3 - gaps.length, failed: gaps.length, gapCount: gaps.length, gaps };
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

/**
 * Extract gap descriptions from content body.
 */
function extractGaps(content) {
  const gaps = [];

  // Look for "## Gaps" section
  const gapSectionMatch = content.match(/## Gaps\s*\n([\s\S]*?)(?=\n## [^#]|\n---)/);
  if (gapSectionMatch) {
    const gapHeaders = gapSectionMatch[1].match(/### Gap \d+:?\s*(.+)/g) || [];
    for (const header of gapHeaders) {
      const descMatch = header.match(/### Gap \d+:?\s*(.+)/);
      if (descMatch) gaps.push(descMatch[1].trim());
    }
  }

  // Also look for FAILED items in tables
  const failedLines = content.match(/\|.*FAIL(?:ED)?\b.*\|/gi) || [];
  for (const line of failedLines) {
    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length >= 2) {
      const desc = cells.find(c => c.length > 20 && !/FAIL/i.test(c)) || cells[1];
      if (desc && !gaps.includes(desc)) gaps.push(desc);
    }
  }

  return gaps;
}

/**
 * Categorize a gap description into a standard category.
 */
function categorizeGap(desc) {
  const lower = desc.toLowerCase();
  if (lower.includes('missing') && (lower.includes('artifact') || lower.includes('file'))) {
    return 'missing artifact';
  }
  if (lower.includes('stub') || lower.includes('incomplete') || lower.includes('placeholder')) {
    return 'stub/incomplete';
  }
  if (lower.includes('wir') || lower.includes('reference') || lower.includes('link') || lower.includes('import')) {
    return 'missing wiring';
  }
  if (lower.includes('fail') || lower.includes('error') || lower.includes('broken')) {
    return 'failed verification';
  }
  if (lower.includes('test')) {
    return 'missing tests';
  }
  if (lower.includes('vague') || lower.includes('ambiguous')) {
    return 'vague criteria';
  }
  if (lower.includes('config') || lower.includes('schema')) {
    return 'config mismatch';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Core calibration engine (agent-agnostic)
// ---------------------------------------------------------------------------

/**
 * Run calibration for a specific agent type.
 * @param {string} target - Agent name (verifier, audit, integration-checker, plan-checker)
 * @param {string} planningDir - Path to .planning directory
 * @returns {object} Calibration findings
 */
function calibrateAgent(target, planningDir) {
  const config = CALIBRATION_TARGETS[target];
  if (!config) return { success: false, error: 'Unknown target: ' + target };

  // Find corpus files
  const allFiles = [];
  for (const loc of config.corpusLocations) {
    const searchDir = path.join(planningDir, loc);
    const found = findFiles(searchDir, config.corpusPattern);
    allFiles.push(...found);
  }

  if (allFiles.length === 0) {
    return {
      success: true,
      target,
      corpus_size: 0,
      pass_rate: 0,
      recommendations_count: 0,
      recommendations: ['No corpus data found for ' + target + '. Run more workflows to generate data.'],
      output_path: null
    };
  }

  // Parse all files
  const records = [];
  for (const f of allFiles) {
    try {
      records.push(config.parseFile(f));
    } catch (_e) {
      // Skip unparseable files
    }
  }

  const corpusSize = records.length;
  const passedCount = records.filter(r =>
    r.status === 'passed' || r.status === 'pass' || r.status === 'pass_with_notes'
  ).length;
  const passRate = corpusSize > 0 ? Math.round((passedCount / corpusSize) * 100) / 100 : 0;

  // Gap category distribution
  const gapCategories = {};
  const allGaps = [];
  for (const r of records) {
    for (const gap of r.gaps) {
      allGaps.push(gap);
      const cat = categorizeGap(gap);
      gapCategories[cat] = (gapCategories[cat] || 0) + 1;
    }
  }

  // Common patterns
  const patternCounts = {};
  for (const gap of allGaps) {
    const words = gap.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    const key = words.slice(0, 4).join(' ');
    if (key) {
      patternCounts[key] = (patternCounts[key] || 0) + 1;
    }
  }
  const commonPatterns = Object.entries(patternCounts)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pattern, count]) => ({ pattern, count }));

  // Trust scores
  const trustScores = loadScores(planningDir);
  const agentTrust = trustScores[target] || {};

  // Generate recommendations
  const recommendations = generateRecommendations(target, passRate, gapCategories, commonPatterns, agentTrust);

  // Write report
  const intelDir = path.join(planningDir, 'intel');
  fs.mkdirSync(intelDir, { recursive: true });
  const outputPath = path.join(intelDir, target + '-calibration.md');

  writeCalibrationReport(outputPath, {
    target,
    title: config.reportTitle,
    corpusSize,
    passRate,
    allGaps,
    gapCategories,
    commonPatterns,
    agentTrust,
    recommendations
  });

  return {
    success: true,
    target,
    corpus_size: corpusSize,
    pass_rate: passRate,
    recommendations_count: recommendations.length,
    output_path: outputPath
  };
}

/**
 * Generate recommendations based on calibration data.
 */
function generateRecommendations(target, passRate, gapCategories, commonPatterns, agentTrust) {
  const recommendations = [];
  const agentLabel = target.charAt(0).toUpperCase() + target.slice(1).replace(/-/g, ' ');

  if (passRate < 0.8) {
    recommendations.push(agentLabel + ' pass rate is below 80% -- consider adding more few-shot examples');
  }

  const sortedCategories = Object.entries(gapCategories).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedCategories) {
    if (count >= 2) {
      recommendations.push(agentLabel + ' consistently finds "' + cat + '" gaps (' + count + ' occurrences) -- consider adding few-shot example for this pattern');
    }
  }

  for (const cp of commonPatterns) {
    if (cp.count >= 3) {
      recommendations.push('Recurring gap pattern: "' + cp.pattern + '" (' + cp.count + ' times)');
    }
  }

  if (Object.keys(agentTrust).length > 0) {
    for (const [category, data] of Object.entries(agentTrust)) {
      if (data.rate !== undefined && data.rate < 0.7) {
        recommendations.push('Trust score for ' + target + '/' + category + ' is ' + (data.rate * 100).toFixed(0) + '% -- below 70% threshold');
      }
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('No actionable patterns detected -- ' + agentLabel + ' performance appears healthy');
  }

  return recommendations;
}

/**
 * Write a calibration report to disk.
 */
function writeCalibrationReport(outputPath, data) {
  const sortedCategories = Object.entries(data.gapCategories).sort((a, b) => b[1] - a[1]);

  const gapTable = sortedCategories.length > 0
    ? sortedCategories.map(function(pair) { return '| ' + pair[0] + ' | ' + pair[1] + ' |'; }).join('\n')
    : '| (none) | 0 |';

  const patternList = data.commonPatterns.length > 0
    ? data.commonPatterns.map(function(p) { return '- "' + p.pattern + '" (' + p.count + ' occurrences)'; }).join('\n')
    : '- No recurring patterns detected';

  const recList = data.recommendations.map(function(r) { return '- ' + r; }).join('\n');

  const trustSection = Object.keys(data.agentTrust).length > 0
    ? Object.entries(data.agentTrust).map(function(pair) {
      var cat2 = pair[0], data2 = pair[1];
      return '- **' + cat2 + '**: ' + (data2.pass || 0) + ' pass / ' + (data2.fail || 0) + ' fail (rate: ' + (data2.rate !== undefined ? (data2.rate * 100).toFixed(0) + '%' : 'N/A') + ')';
    }).join('\n')
    : '- No trust data available for ' + data.target + ' agent';

  const lines = [
    '---',
    'generated: "' + new Date().toISOString() + '"',
    'target: "' + data.target + '"',
    'corpus_size: ' + data.corpusSize,
    'pass_rate: ' + data.passRate,
    '---',
    '',
    '# ' + data.title,
    '',
    '## Corpus Summary',
    '',
    '- **Total entries analyzed:** ' + data.corpusSize,
    '- **Pass rate:** ' + (data.passRate * 100).toFixed(0) + '%',
    '- **Total gaps found:** ' + data.allGaps.length,
    '',
    '## Gap Category Distribution',
    '',
    '| Category | Count |',
    '|----------|-------|',
    gapTable,
    '',
    '## Common Patterns',
    '',
    patternList,
    '',
    '## Trust Scores',
    '',
    trustSection,
    '',
    '## Recommendations',
    '',
    recList,
    ''
  ];

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
}

// ---------------------------------------------------------------------------
// Backward compat: calibrateVerifier wraps calibrateAgent
// ---------------------------------------------------------------------------

function calibrateVerifier(planningDir, _cwd) {
  return calibrateAgent('verifier', planningDir);
}

// ---------------------------------------------------------------------------
// CLI handler
// ---------------------------------------------------------------------------

/**
 * Handle calibrate CLI command.
 * @param {string[]} args - CLI args (args[0] is 'calibrate', args[1] is target)
 * @param {object} ctx - { planningDir, cwd, output(), error() }
 */
function handleCalibrate(args, ctx) {
  var target = args[1];

  if (!target) {
    ctx.error('Usage: calibrate <target>\nAvailable targets: ' + VALID_TARGETS.join(', ') + ', all');
    return;
  }

  if (target === 'all') {
    var results = {};
    for (var t of VALID_TARGETS) {
      results[t] = calibrateAgent(t, ctx.planningDir);
    }
    ctx.output(results);
    return;
  }

  if (!CALIBRATION_TARGETS[target]) {
    ctx.error('Unknown calibration target: "' + target + '". Available targets: ' + VALID_TARGETS.join(', ') + ', all');
    return;
  }

  var result = calibrateAgent(target, ctx.planningDir);
  ctx.output(result);
}

module.exports = {
  handleCalibrate,
  calibrateAgent,
  calibrateVerifier,
  findVerificationFiles,
  findFiles,
  parseVerification,
  parseAuditReport,
  parseIntegrationReport,
  parsePlanForCheckerSignals,
  categorizeGap,
  CALIBRATION_TARGETS,
  VALID_TARGETS
};
