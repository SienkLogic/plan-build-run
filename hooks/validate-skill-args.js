#!/usr/bin/env node

/**
 * PreToolUse hook: Validates Skill tool arguments before execution.
 *
 * Currently validates:
 *   - /pbr:plan-phase — blocks freeform text arguments that don't match
 *     valid patterns (phase number, subcommand, flags).
 *
 * When freeform text is detected, analyzes it to suggest the most
 * appropriate skill (quick, debug, explore, todo, plan).
 *
 * Exit codes:
 *   0 = allowed (valid args or non-plan skill)
 *   2 = blocked (freeform text detected for /pbr:plan-phase)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

/**
 * Skills that accept a phase number as their first argument.
 */
const PHASE_SKILLS = new Set([
  'pbr:plan-phase', 'pbr:execute-phase', 'pbr:discuss-phase',
  'pbr:research-phase', 'pbr:list-phase-assumptions',
  'pbr:insert-phase', 'pbr:remove-phase'
]);

/**
 * Validate that a phase number exists in ROADMAP.md.
 * Returns null if valid or no roadmap, or an advisory string if phase not found.
 */
function validatePhaseExists(phaseNum) {
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  try {
    if (!fs.existsSync(roadmapPath)) return null;
    const roadmap = fs.readFileSync(roadmapPath, 'utf8');
    // Look for phase number in roadmap (e.g., "| 03 |" or "## Phase 3")
    const padded = String(phaseNum).padStart(2, '0');
    const patterns = [
      new RegExp(`\\|\\s*${phaseNum}\\s*\\|`),
      new RegExp(`\\|\\s*${padded}\\s*\\|`),
      new RegExp(`##\\s+Phase\\s+${phaseNum}\\b`),
      new RegExp(`##\\s+Phase\\s+${padded}\\b`),
      new RegExp(`${padded}-[a-z]`)
    ];
    if (patterns.some(p => p.test(roadmap))) return null;
    // Phase not found — extract valid phase numbers
    const phaseNums = [];
    const tableRows = roadmap.match(/\|\s*(\d+(?:\.\d+)?)\s*\|/g);
    if (tableRows) {
      for (const row of tableRows) {
        const m = row.match(/\|\s*(\d+(?:\.\d+)?)\s*\|/);
        if (m) phaseNums.push(m[1]);
      }
    }
    const validList = phaseNums.length > 0 ? ` Valid phases: ${phaseNums.join(', ')}.` : '';
    return `Phase ${phaseNum} not found in ROADMAP.md.${validList}`;
  } catch (_e) {
    return null; // Can't read roadmap — don't block
  }
}

/**
 * Valid argument patterns for /pbr:plan-phase.
 *
 * Matches:
 *   - Empty / whitespace only
 *   - Phase number: "3", "03", "3.1"
 *   - Phase number + flags: "3 --skip-research", "3 --assumptions", "3 --gaps", "3 --teams"
 *   - Subcommands: "add", "insert 3", "remove 3"
 *   - Legacy: "check"
 */
const PLAN_VALID_PATTERN = /^\s*$|^\s*\d+(\.\d+)?\s*(--(?:skip-research|assumptions|gaps|teams)\s*)*$|^\s*(?:add|check)\s*$|^\s*(?:insert|remove)\s+\d+(\.\d+)?\s*$/i;

/**
 * Keyword patterns for routing freeform text to the right skill.
 * Order matters — first match wins.
 */
const ROUTE_PATTERNS = [
  {
    pattern: /\b(bugs?|fix(es|ing)?|errors?|crash(es|ing)?|fails?|failing|broken|issues?|debug(ging)?|diagnos(e|ing)|stack\s*trace|exceptions?|regress(ion|ing)?)\b/i,
    skill: '/pbr:debug',
    reason: 'Looks like a bug or debugging task'
  },
  {
    pattern: /\b(explore|research|understand|how does|what is|analy[zs]e|evaluate|compare|pros and cons|trade-?offs?|approach(es)?)\b/i,
    skill: '/pbr:explore',
    reason: 'Looks like exploration or research'
  },
  {
    pattern: /\b(refactor|redesign|architect|migrate|restructure|overhaul|rewrite|multi-?phase|complex|system|infrastructure)\b/i,
    skill: '/pbr:plan-phase add',
    reason: 'Looks like a complex task that needs full planning'
  },
  {
    // Default: anything actionable goes to quick
    pattern: /./,
    skill: '/pbr:quick',
    reason: 'Looks like a straightforward task'
  }
];

/**
 * Suggest the best skill for freeform text.
 * Returns { skill, reason }.
 */
function suggestSkill(text) {
  for (const route of ROUTE_PATTERNS) {
    if (route.pattern.test(text)) {
      return { skill: route.skill, reason: route.reason };
    }
  }
  return { skill: '/pbr:quick', reason: 'Default routing' };
}

/**
 * Check whether a Skill tool call has valid arguments.
 * Returns null if valid, or { output, exitCode } if blocked.
 */
function checkSkillArgs(data) {
  const toolInput = data.tool_input || {};
  const skill = toolInput.skill || '';
  const args = toolInput.args || '';

  // Phase number existence check for all phase-taking skills
  const fullSkillName = skill.startsWith('pbr:') ? skill : `pbr:${skill}`;
  if (PHASE_SKILLS.has(fullSkillName) && args) {
    const phaseMatch = args.trim().match(/^(\d+(?:\.\d+)?)/);
    if (phaseMatch) {
      const warning = validatePhaseExists(phaseMatch[1]);
      if (warning) {
        logHook('validate-skill-args', 'PreToolUse', 'phase-not-found', {
          skill, phase: phaseMatch[1]
        });
        return {
          output: {
            decision: 'block',
            reason: `[pbr] ${warning} Check your ROADMAP.md or use /pbr:progress to see current phases.`
          },
          exitCode: 2
        };
      }
    }
  }

  // Only validate pbr:plan (invoked as /pbr:plan-phase) arg format for now
  if (skill !== 'pbr:plan') {
    return null;
  }

  // Test against valid patterns
  if (PLAN_VALID_PATTERN.test(args)) {
    return null;
  }

  // Freeform text detected — suggest the right skill
  const suggestion = suggestSkill(args);

  logHook('validate-skill-args', 'PreToolUse', 'blocked', {
    skill,
    args: args.substring(0, 100),
    reason: 'freeform-text',
    suggested: suggestion.skill
  });

  return {
    output: {
      decision: 'block',
      reason: [
        'BLOCKED: /pbr:plan-phase received freeform text instead of a phase number.',
        '',
        'The arguments "' + args.substring(0, 80) + (args.length > 80 ? '...' : '') + '" do not match any valid pattern.',
        '',
        'Valid /pbr:plan-phase usage:',
        '  /pbr:plan-phase <N>              Plan phase N',
        '  /pbr:plan-phase <N> --gaps       Create gap-closure plans',
        '  /pbr:plan-phase add              Add a new phase',
        '  /pbr:plan-phase insert <N>       Insert a phase at position N',
        '  /pbr:plan-phase remove <N>       Remove phase N',
        '',
        'Suggested skill for this text:',
        '  ' + suggestion.skill + ' — ' + suggestion.reason,
        '',
        'Or use /pbr:do to auto-route freeform text to the right skill.'
      ].join('\n')
    },
    exitCode: 2
  };
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const result = checkSkillArgs(data);

      if (result) {
        process.stdout.write(JSON.stringify(result.output));
        process.exit(result.exitCode);
      }

      process.exit(0);
    } catch (_e) {
      // Don't block on errors — emit valid output for Claude Code
      process.stderr.write(`[pbr] validate-skill-args error: ${_e.message}
`);
      process.stdout.write(JSON.stringify({ decision: "allow", additionalContext: '⚠ [PBR] validate-skill-args failed: ' + _e.message }));
      process.exit(0);
    }
  });
}

module.exports = { checkSkillArgs, suggestSkill, validatePhaseExists, PLAN_VALID_PATTERN, ROUTE_PATTERNS, PHASE_SKILLS };
if (require.main === module || process.argv[1] === __filename) { main(); }
