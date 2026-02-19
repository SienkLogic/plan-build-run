#!/usr/bin/env node

/**
 * PreToolUse hook: Validates Task() calls before execution.
 *
 * Advisory checks (exit 0 always, logs warnings):
 *   - description exists and is non-empty
 *   - description is reasonably short (<=100 chars)
 *   - subagent_type is a known pbr: agent type when applicable
 *
 * Exit codes:
 *   0 = always (advisory only, never blocks)
 */

const { logHook } = require('./hook-logger');

const KNOWN_AGENTS = [
  'researcher',
  'planner',
  'plan-checker',
  'executor',
  'verifier',
  'integration-checker',
  'debugger',
  'codebase-mapper',
  'synthesizer',
  'general'
];

const MAX_DESCRIPTION_LENGTH = 100;

/**
 * Check a parsed hook data object for Task() validation issues.
 * Returns an array of warning strings (empty if all good).
 */
function checkTask(data) {
  const warnings = [];
  const toolInput = data.tool_input || {};

  const description = toolInput.description;
  const subagentType = toolInput.subagent_type;

  // Check description exists and is non-empty
  if (!description || (typeof description === 'string' && !description.trim())) {
    warnings.push('Task() called without a description. Descriptions help track agent purpose.');
  } else if (typeof description === 'string') {
    // Check description length
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      warnings.push(
        `Task() description is ${description.length} chars (recommended <=100). ` +
        'Keep descriptions to 3-5 words.'
      );
    }

    // If description mentions pbr: patterns but no subagent_type is set
    if (/\bpbr:/.test(description) && !subagentType) {
      warnings.push(
        'Task() description contains "pbr:" but no subagent_type is set. ' +
        'Use subagent_type: "pbr:{name}" for automatic agent loading.'
      );
    }
  }

  // Validate subagent_type if it starts with pbr:
  if (typeof subagentType === 'string' && subagentType.startsWith('pbr:')) {
    const agentName = subagentType.slice(4);
    if (!KNOWN_AGENTS.includes(agentName)) {
      warnings.push(
        `Unknown pbr agent type: "${subagentType}". ` +
        `Known types: ${KNOWN_AGENTS.map(a => 'pbr:' + a).join(', ')}`
      );
    }
  }

  return warnings;
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const warnings = checkTask(data);

      if (warnings.length > 0) {
        for (const warning of warnings) {
          logHook('validate-task', 'PreToolUse', 'warn', { warning });
        }
        process.stdout.write(JSON.stringify({
          additionalContext: 'Task() validation warnings:\n' + warnings.map(w => '- ' + w).join('\n')
        }));
      }

      process.exit(0);
    } catch (_e) {
      // Parse error — don't block
      process.exit(0);
    }
  });
}

module.exports = { checkTask, KNOWN_AGENTS, MAX_DESCRIPTION_LENGTH };
if (require.main === module || process.argv[1] === __filename) { main(); }
