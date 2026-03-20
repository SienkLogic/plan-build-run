'use strict';

/**
 * lib/onboarding-generator.cjs — Team onboarding guide generator.
 *
 * Reads ROADMAP.md, CONTEXT.md, PROJECT.md, conventions/, STATE.md, and notes/
 * to produce a structured walkthrough document for new team members.
 *
 * Provides:
 *   generateOnboardingGuide(planningDir, config) — structured guide with markdown
 */

const fs = require('fs');
const path = require('path');

// ─── Disabled stub ────────────────────────────────────────────────────────────

const DISABLED_STUB = {
  enabled: false,
  sections: [],
  markdown: '',
};

// ─── Section builders ─────────────────────────────────────────────────────────

/**
 * Build project overview section from PROJECT.md.
 */
function buildOverviewSection(planningDir) {
  const projectPath = path.join(planningDir, 'PROJECT.md');
  if (!fs.existsSync(projectPath)) return null;

  const content = fs.readFileSync(projectPath, 'utf8');
  // Extract first heading as project name
  const nameMatch = content.match(/^#\s+(.+)/m);
  const projectName = nameMatch ? nameMatch[1].trim() : 'This Project';

  // Extract a few key sections
  const sections = [];
  const whatMatch = content.match(/##\s+What This Is\s*\n+([\s\S]*?)(?=\n##|\n#|$)/);
  const valueMatch = content.match(/##\s+Core Value\s*\n+([\s\S]*?)(?=\n##|\n#|$)/);

  if (whatMatch) sections.push(whatMatch[1].trim());
  if (valueMatch) sections.push(`**Core Value:** ${valueMatch[1].trim().split('\n')[0]}`);

  const summaryContent = sections.join('\n\n') || content.slice(0, 500);

  return {
    title: 'Project Overview',
    content: `**${projectName}**\n\n${summaryContent}`,
    source: projectPath,
  };
}

/**
 * Build development phases section from ROADMAP.md.
 */
function buildPhasesSection(planningDir) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return null;

  const content = fs.readFileSync(roadmapPath, 'utf8');

  // Extract phase headings
  const phases = [];
  const phaseRe = /^#{2,4}\s*Phase\s+(\d+(?:\.\d+)*)\s*:\s*([^\n]+)/gim;
  let m;
  while ((m = phaseRe.exec(content)) !== null) {
    phases.push(`- Phase ${m[1]}: ${m[2].trim()}`);
  }

  if (phases.length === 0) return null;

  return {
    title: 'Development Phases',
    content: `The project is organized into ${phases.length} phases:\n\n${phases.join('\n')}`,
    source: roadmapPath,
  };
}

/**
 * Build key decisions section from CONTEXT.md.
 */
function buildDecisionsSection(planningDir) {
  const contextPath = path.join(planningDir, 'CONTEXT.md');
  if (!fs.existsSync(contextPath)) return null;

  const content = fs.readFileSync(contextPath, 'utf8');

  // Extract locked decisions section
  const lockedMatch = content.match(/##\s+Locked\s+Decisions?\s*\n+([\s\S]*?)(?=\n##|\n#|$)/i);
  const decisionsMatch = content.match(/##\s+Decisions?\s*\n+([\s\S]*?)(?=\n##|\n#|$)/i);

  const decisionsContent = (lockedMatch || decisionsMatch);
  if (!decisionsContent) {
    // If no specific section, include first non-empty content
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 10);
    if (lines.length === 0) return null;
    return {
      title: 'Key Decisions',
      content: lines.join('\n'),
      source: contextPath,
    };
  }

  return {
    title: 'Key Decisions',
    content: decisionsContent[1].trim(),
    source: contextPath,
  };
}

/**
 * Build conventions section from .planning/conventions/ directory.
 */
function buildConventionsSection(planningDir) {
  const conventionsDir = path.join(planningDir, 'conventions');
  if (!fs.existsSync(conventionsDir)) return null;

  let files;
  try {
    files = fs.readdirSync(conventionsDir).filter(f => f.endsWith('.md'));
  } catch (_e) {
    return null;
  }

  if (files.length === 0) return null;

  const items = files.map(f => {
    const filePath = path.join(conventionsDir, f);
    const content = fs.readFileSync(filePath, 'utf8');
    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : f.replace('.md', '');
    // Get first non-heading, non-empty line as summary
    const summary = content.split('\n').filter(l => l.trim() && !l.startsWith('#'))[0] || '';
    return `- **${title}**: ${summary}`;
  });

  return {
    title: 'Conventions',
    content: items.join('\n'),
    source: conventionsDir,
  };
}

/**
 * Build current status section from STATE.md.
 */
function buildStatusSection(planningDir) {
  const statePath = path.join(planningDir, 'STATE.md');
  if (!fs.existsSync(statePath)) return null;

  const content = fs.readFileSync(statePath, 'utf8');

  // Extract frontmatter status
  const statusMatch = content.match(/^status:\s*["']?([^"'\r\n]+)["']?/m);
  const currentStatus = statusMatch ? statusMatch[1].trim() : 'unknown';

  // Extract current phase reference
  const phaseMatch = content.match(/Phase:\s*(\d+[^\n]*)/);
  const currentPhase = phaseMatch ? phaseMatch[1].trim() : null;

  const lines = [`**Current Status:** ${currentStatus}`];
  if (currentPhase) lines.push(`**Current Phase:** ${currentPhase}`);
  lines.push('');
  lines.push('Run `/pbr:status` for full project details, or `/pbr:build` to continue building.');

  return {
    title: 'Current Status',
    content: lines.join('\n'),
    source: statePath,
  };
}

/**
 * Build important notes section from .planning/notes/.
 */
function buildNotesSection(planningDir) {
  const notesDir = path.join(planningDir, 'notes');
  if (!fs.existsSync(notesDir)) return null;

  let files;
  try {
    files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));
  } catch (_e) {
    return null;
  }

  if (files.length === 0) return null;

  const items = files.slice(0, 10).map(f => `- ${f.replace('.md', '')}`);

  return {
    title: 'Important Notes',
    content: `${items.length} note(s) available in .planning/notes/:\n\n${items.join('\n')}`,
    source: notesDir,
  };
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

/**
 * Render sections into a markdown onboarding document.
 *
 * @param {string} projectName - Name of the project
 * @param {Array<{title: string, content: string, source: string}>} sections
 * @returns {string}
 */
function renderMarkdown(projectName, sections) {
  const lines = [`# Getting Started with ${projectName}`, ''];

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(section.content);
    lines.push('');
    lines.push(`*Source: ${section.source}*`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Main function ─────────────────────────────────────────────────────────────

/**
 * Generate a structured onboarding guide from available .planning/ files.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object|null} config  - Parsed config object
 * @returns {{ enabled: boolean, sections: Array, markdown: string, generatedAt: string }}
 */
function generateOnboardingGuide(planningDir, config) {
  const features = (config && config.features) || {};

  // Check feature toggle (default: enabled)
  if (features.team_onboarding === false) {
    return { ...DISABLED_STUB };
  }

  // Build sections from available files
  const rawSections = [
    buildOverviewSection(planningDir),
    buildPhasesSection(planningDir),
    buildDecisionsSection(planningDir),
    buildConventionsSection(planningDir),
    buildStatusSection(planningDir),
    buildNotesSection(planningDir),
  ].filter(Boolean);

  // Determine project name
  const projectPath = path.join(planningDir, 'PROJECT.md');
  let projectName = 'the Project';
  if (fs.existsSync(projectPath)) {
    const content = fs.readFileSync(projectPath, 'utf8');
    const m = content.match(/^#\s+(.+)/m);
    if (m) projectName = m[1].trim();
  }

  const markdown = renderMarkdown(projectName, rawSections);

  // Log audit evidence
  try {
    const { logAuditEvidence } = require('./progress-visualization');
    logAuditEvidence(planningDir, 'team_onboarding', 'ok');
  } catch (_e) {
    // Non-fatal
  }

  return {
    enabled: true,
    sections: rawSections,
    markdown,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  generateOnboardingGuide,
  buildOverviewSection,
  buildPhasesSection,
  buildDecisionsSection,
  buildConventionsSection,
  buildStatusSection,
  buildNotesSection,
};
