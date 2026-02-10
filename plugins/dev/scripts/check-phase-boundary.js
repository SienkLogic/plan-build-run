#!/usr/bin/env node

// PreToolUse hook (Write|Edit): Warns or blocks when editing files
// outside the current active phase.
//
// Reads STATE.md for current phase number. If the file being written
// is under .planning/phases/NN-<slug>/ and NN does not match the
// current phase, issues a warning or blocks depending on config.
//
// Config: safety.enforce_phase_boundaries
//   - true  = block cross-phase writes (exit 2)
//   - false = warn only (default)
//   - absent = warn only
//
// Files outside .planning/phases/ are always allowed (source code,
// config files, etc.).
//
// Exit codes:
//   0 = allowed or not applicable
//   2 = blocked (only when enforce_phase_boundaries is true)

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

      if (!filePath) {
        process.exit(0);
      }

      const cwd = process.cwd();
      const planningDir = path.join(cwd, '.planning');
      const phasesDir = path.join(planningDir, 'phases');

      // Only check files under .planning/phases/
      const normalizedPath = filePath.replace(/\\/g, '/');
      const normalizedPhasesDir = phasesDir.replace(/\\/g, '/');

      if (!normalizedPath.startsWith(normalizedPhasesDir)) {
        process.exit(0);
      }

      // Extract phase number from file path
      // Path pattern: .planning/phases/NN-slug/...
      const relativePath = normalizedPath.substring(normalizedPhasesDir.length + 1);
      const phaseMatch = relativePath.match(/^(\d+)-/);
      if (!phaseMatch) {
        process.exit(0);
      }
      const filePhase = parseInt(phaseMatch[1], 10);

      // Get current phase from STATE.md
      const stateFile = path.join(planningDir, 'STATE.md');
      if (!fs.existsSync(stateFile)) {
        process.exit(0);
      }

      const state = fs.readFileSync(stateFile, 'utf8');
      const currentPhaseMatch = state.match(/Phase:\s*(\d+)\s+of\s+\d+/);
      if (!currentPhaseMatch) {
        process.exit(0);
      }
      const currentPhase = parseInt(currentPhaseMatch[1], 10);

      // Same phase — always allowed
      if (filePhase === currentPhase) {
        process.exit(0);
      }

      // Cross-phase write detected — check config
      const enforce = getEnforceSetting(planningDir);

      logHook('check-phase-boundary', 'PreToolUse', enforce ? 'block' : 'warn', {
        filePhase,
        currentPhase,
        file: path.basename(filePath)
      });
      logEvent('workflow', 'phase-boundary', {
        filePhase,
        currentPhase,
        file: path.basename(filePath),
        action: enforce ? 'block' : 'warn'
      });

      if (enforce) {
        const output = {
          decision: 'block',
          reason: `Cross-phase write blocked: editing phase ${filePhase} file but current phase is ${currentPhase}.\n\nFile: ${filePath}\n\nIf this is intentional, either:\n  1. Update STATE.md to reflect the correct phase\n  2. Set safety.enforce_phase_boundaries: false in config.json`
        };
        process.stdout.write(JSON.stringify(output));
        process.exit(2);
      } else {
        const output = {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            additionalContext: `Warning: editing phase ${filePhase} file but current phase is ${currentPhase}. Ensure this cross-phase edit is intentional.`
          }
        };
        process.stdout.write(JSON.stringify(output));
      }

      process.exit(0);
    } catch (_e) {
      // Don't block on errors
      process.exit(0);
    }
  });
}

function getEnforceSetting(planningDir) {
  const configFile = path.join(planningDir, 'config.json');
  if (!fs.existsSync(configFile)) return false;

  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    return !!(config.safety && config.safety.enforce_phase_boundaries);
  } catch (_e) {
    return false;
  }
}

module.exports = { getEnforceSetting };
if (require.main === module) { main(); }
