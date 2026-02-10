#!/usr/bin/env node

/**
 * PreCompact hook: Preserves current state to STATE.md before
 * lossy context compaction.
 *
 * Updates STATE.md with:
 * - Timestamp of last compaction
 * - ROADMAP progress summary (phase list, status)
 * - Current plan context (objective from latest PLAN.md)
 * - Config highlights (depth, mode, models, gates)
 * - Active operation context
 *
 * Also outputs additionalContext for post-compaction recovery.
 *
 * Exit codes:
 *   0 = always (informational hook, never blocks)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');

function main() {
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');
  const stateFile = path.join(planningDir, 'STATE.md');

  // Not a Towline project or no STATE.md
  if (!fs.existsSync(stateFile)) {
    process.exit(0);
  }

  try {
    let content = fs.readFileSync(stateFile, 'utf8');
    const timestamp = new Date().toISOString();

    // Gather context from multiple sources
    const activeOp = readActiveOperation(planningDir);
    const roadmapSummary = readRoadmapSummary(planningDir);
    const currentPlan = readCurrentPlan(planningDir, content);
    const configHighlights = readConfigHighlights(planningDir);

    // Build continuity section
    const continuityParts = [
      `Last session: ${timestamp}`,
      'Compaction occurred: context was auto-compacted at this point'
    ];

    if (activeOp) {
      continuityParts.push(`Active operation at compaction: ${activeOp}`);
    }
    if (roadmapSummary) {
      continuityParts.push(`Roadmap progress:\n${roadmapSummary}`);
    }
    if (currentPlan) {
      continuityParts.push(`Current plan: ${currentPlan}`);
    }
    if (configHighlights) {
      continuityParts.push(`Config: ${configHighlights}`);
    }

    continuityParts.push('Note: Some conversation context may have been lost. Check STATE.md and SUMMARY.md files for ground truth.');

    // Update or add Session Continuity section
    const continuityHeader = '## Session Continuity';
    const continuityContent = continuityParts.join('\n');

    if (content.includes(continuityHeader)) {
      // Replace existing section
      content = content.replace(
        /## Session Continuity[\s\S]*?(?=\n## |\n---|\s*$)/,
        `${continuityHeader}\n${continuityContent}\n`
      );
    } else {
      // Append section
      content = content.trimEnd() + `\n\n${continuityHeader}\n${continuityContent}\n`;
    }

    fs.writeFileSync(stateFile, content, 'utf8');

    // Output additionalContext for post-compaction recovery
    const recoveryContext = buildRecoveryContext(activeOp, roadmapSummary, currentPlan, configHighlights);
    if (recoveryContext) {
      const output = {
        additionalContext: recoveryContext
      };
      process.stdout.write(JSON.stringify(output));
    }

    logHook('context-budget-check', 'PreCompact', 'saved', {
      stateFile: 'STATE.md',
      hasRoadmap: !!roadmapSummary,
      hasPlan: !!currentPlan,
      hasConfig: !!configHighlights
    });
    logEvent('workflow', 'compaction', { timestamp });
  } catch (e) {
    logHook('context-budget-check', 'PreCompact', 'error', { error: e.message });
  }

  process.exit(0);
}

function readActiveOperation(planningDir) {
  const activeOpFile = path.join(planningDir, '.active-operation');
  if (!fs.existsSync(activeOpFile)) return '';
  try {
    return fs.readFileSync(activeOpFile, 'utf8').trim();
  } catch (_e) {
    return '';
  }
}

function readRoadmapSummary(planningDir) {
  const roadmapFile = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapFile)) return '';

  try {
    const roadmap = fs.readFileSync(roadmapFile, 'utf8');

    // Extract progress table
    const progressMatch = roadmap.match(/## Progress[\s\S]*?\|[\s\S]*?(?=\n##|\s*$)/);
    if (!progressMatch) return '';

    const rows = progressMatch[0].split('\n').filter(r => r.includes('|'));
    // Skip header and separator rows
    const dataRows = rows.filter(r => !r.includes('---') && !r.toLowerCase().includes('phase'));

    if (dataRows.length === 0) return '';

    // Build compact summary
    const phases = [];
    for (const row of dataRows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 4) {
        const num = cols[0];
        const name = cols[1] || '';
        const status = cols[3] || '';
        if (num && /^\d+/.test(num)) {
          phases.push(`  Phase ${num} (${name.substring(0, 30)}): ${status}`);
        }
      }
    }

    return phases.join('\n');
  } catch (_e) {
    return '';
  }
}

function readCurrentPlan(planningDir, stateContent) {
  // Extract current phase from STATE.md
  const phaseMatch = stateContent.match(/Phase:\s*(\d+)\s+of\s+\d+/);
  if (!phaseMatch) return '';

  const currentPhase = phaseMatch[1].padStart(2, '0');

  // Find the phase directory
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) return '';

  try {
    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(currentPhase));
    if (dirs.length === 0) return '';

    const phaseDir = path.join(phasesDir, dirs[0]);

    // Find PLAN.md files
    const planFiles = fs.readdirSync(phaseDir).filter(f => f.endsWith('PLAN.md'));
    if (planFiles.length === 0) return 'No PLAN.md found in current phase';

    // Read the last plan's objective only (frontmatter + objective tag)
    const planFile = path.join(phaseDir, planFiles[planFiles.length - 1]);
    const planContent = fs.readFileSync(planFile, 'utf8');

    const objMatch = planContent.match(/<objective>([\s\S]*?)<\/objective>/);
    const objective = objMatch ? objMatch[1].trim().substring(0, 150) : '';

    return `${dirs[0]}/${planFiles[planFiles.length - 1]}${objective ? ' — ' + objective : ''}`;
  } catch (_e) {
    return '';
  }
}

function readConfigHighlights(planningDir) {
  const configFile = path.join(planningDir, 'config.json');
  if (!fs.existsSync(configFile)) return '';

  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const parts = [];
    if (config.depth) parts.push(`depth=${config.depth}`);
    if (config.mode) parts.push(`mode=${config.mode}`);
    if (config.models && config.models.executor) parts.push(`executor=${config.models.executor}`);
    if (config.gates && config.gates.verification !== undefined) parts.push(`verify=${config.gates.verification}`);
    if (config.git && config.git.auto_commit !== undefined) parts.push(`auto_commit=${config.git.auto_commit}`);
    return parts.join(', ');
  } catch (_e) {
    return '';
  }
}

function buildRecoveryContext(activeOp, roadmapSummary, currentPlan, configHighlights) {
  const parts = ['[Post-Compaction Recovery] Context was auto-compacted. Key state preserved:'];

  if (activeOp) parts.push(`Active operation: ${activeOp}`);
  if (currentPlan) parts.push(`Current plan: ${currentPlan}`);
  if (configHighlights) parts.push(`Config: ${configHighlights}`);
  if (roadmapSummary) parts.push(`Progress:\n${roadmapSummary}`);

  parts.push('Read .planning/STATE.md for full context.');

  // Only return if we have something meaningful beyond header and footer
  return parts.length > 2 ? parts.join('\n') : '';
}

module.exports = { readRoadmapSummary, readCurrentPlan, readConfigHighlights, buildRecoveryContext };
if (require.main === module) { main(); }
