#!/usr/bin/env node

/**
 * PostToolUse hook on Read: Tracks cumulative file reads per skill invocation.
 *
 * Maintains a session-scoped counter in .planning/.context-tracker.
 * Warns when reads exceed thresholds (15 reads or 30k chars).
 * Resets when .active-skill changes (new skill invocation).
 *
 * Exit codes:
 *   0 = always (PostToolUse hook, advisory only)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

const READ_THRESHOLD = 20;
const CHAR_THRESHOLD = 30000;

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const cwd = process.cwd();
      const planningDir = path.join(cwd, '.planning');
      if (!fs.existsSync(planningDir)) {
        process.exit(0);
      }

      const data = JSON.parse(input);
      const filePath = data.tool_input?.file_path || '';
      if (!filePath) {
        process.exit(0);
      }

      // Estimate chars read (use limit if provided, otherwise assume ~2000 lines × 40 chars avg)
      const limit = data.tool_input?.limit;
      const estimatedChars = limit ? limit * 40 : 80000;
      // Use actual output length if available
      const actualChars = data.tool_output ? String(data.tool_output).length : estimatedChars;

      const trackerPath = path.join(planningDir, '.context-tracker');
      const skillPath = path.join(planningDir, '.active-skill');

      // Check if active skill changed (reset tracker)
      const currentSkill = readFileSafe(skillPath);
      let tracker = loadTracker(trackerPath);

      if (tracker.skill !== currentSkill) {
        tracker = { skill: currentSkill, reads: 0, total_chars: 0, files: [] };
      }

      // Update tracker
      tracker.reads += 1;
      tracker.total_chars += actualChars;
      if (!tracker.files.includes(filePath)) {
        tracker.files.push(filePath);
      }

      // Save tracker
      try {
        fs.writeFileSync(trackerPath, JSON.stringify(tracker), 'utf8');
      } catch (_e) {
        // Best-effort
      }

      // Check thresholds
      if (tracker.reads >= READ_THRESHOLD || tracker.total_chars >= CHAR_THRESHOLD) {
        const warnings = [];
        if (tracker.reads >= READ_THRESHOLD) {
          warnings.push(`${tracker.reads} file reads (threshold: ${READ_THRESHOLD})`);
        }
        if (tracker.total_chars >= CHAR_THRESHOLD) {
          const kChars = Math.round(tracker.total_chars / 1000);
          warnings.push(`~${kChars}k chars read (threshold: ${CHAR_THRESHOLD / 1000}k)`);
        }

        logHook('track-context-budget', 'PostToolUse', 'warn', {
          reads: tracker.reads,
          total_chars: tracker.total_chars,
          unique_files: tracker.files.length,
        });

        const output = {
          additionalContext: `[Context Budget Warning] ${warnings.join(', ')}. ${tracker.files.length} unique files read. Consider delegating remaining reads to a Task() subagent to protect orchestrator context.`
        };
        process.stdout.write(JSON.stringify(output));
      }

      process.exit(0);
    } catch (_e) {
      // Never block on tracking errors
      process.exit(0);
    }
  });
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (_e) {
    return '';
  }
}

function loadTracker(trackerPath) {
  try {
    const content = fs.readFileSync(trackerPath, 'utf8');
    return JSON.parse(content);
  } catch (_e) {
    return { skill: '', reads: 0, total_chars: 0, files: [] };
  }
}

main();
