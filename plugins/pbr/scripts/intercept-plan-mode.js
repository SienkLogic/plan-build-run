#!/usr/bin/env node

/**
 * PreToolUse hook on EnterPlanMode: Warns users in PBR projects that
 * native plan mode won't integrate with PBR's planning system.
 *
 * Suggests /pbr:plan instead. Does NOT block — just advises.
 *
 * Exit codes:
 *   0 = always (advisory only, never blocks)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

function main() {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', () => {});
  process.stdin.on('end', () => {
    try {
      const cwd = process.cwd();
      const planningDir = path.join(cwd, '.planning');

      // Only relevant for Plan-Build-Run projects
      if (!fs.existsSync(planningDir)) {
        process.exit(0);
      }

      logHook('intercept-plan-mode', 'PreToolUse', 'warn', {
        reason: 'native plan mode used in PBR project'
      });

      const output = {
        decision: 'block',
        reason: 'This is a Plan-Build-Run project. Native plan mode stores plans outside .planning/ and won\'t integrate with PBR\'s workflow.\n\nUse instead:\n  /pbr:plan <phase>  — Create a PBR-formatted plan for a phase\n  /pbr:quick         — Plan and execute an ad-hoc task\n  /pbr:import        — Import an external plan document into PBR format\n\nIf you already generated a plan in native plan mode, paste it into /pbr:import to convert it.'
      };
      process.stdout.write(JSON.stringify(output));
      process.exit(2);
    } catch (_e) {
      process.exit(0);
    }
  });
}

if (require.main === module || process.argv[1] === __filename) { main(); }
module.exports = { main };
