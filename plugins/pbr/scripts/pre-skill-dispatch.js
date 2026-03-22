#!/usr/bin/env node

/**
 * PreToolUse dispatcher for Skill hooks.
 *
 * Consolidates enforce-context-budget.js and validate-skill-args.js
 * into a single process, reading stdin once and routing to both
 * checks sequentially. Budget check runs first (cheap) and
 * short-circuits before skill argument validation.
 *
 * ── Dispatch Order & Rationale ──────────────────────────────────
 *
 *   1. enforce-context-budget — Blocks Skill invocations when context
 *      usage exceeds the hard_stop_percent threshold. Runs first
 *      because it is a cheap file read that can short-circuit before
 *      argument validation.
 *
 *   2. validate-skill-args   — Validates skill arguments (phase
 *      number existence, freeform text detection for /pbr:plan-phase).
 *      Can block (exit 2) or allow (exit 0).
 *
 * Exit codes:
 *   0 = allowed or warning only
 *   2 = blocked (budget exceeded or invalid skill args)
 */

const path = require('path');
const { logHook } = require('./hook-logger');
const { checkBudget } = require('./enforce-context-budget');
const { checkSkillArgs } = require('./validate-skill-args');

/**
 * Core dispatch logic for PreToolUse:Skill events.
 *
 * Step 1: Budget check (cheap, fast — short-circuits on block)
 * Step 2: Skill argument validation
 * Step 3: All clear
 *
 * @param {Object} data - Parsed hook event data
 * @returns {Object} { decision: 'block'|'allow', reason?: string, additionalContext?: string }
 */
async function processEvent(data) {
  // Step 1 — Budget check (cheap, fast)
  const planningDir = path.join(data.cwd || process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const budgetResult = checkBudget({ toolName: 'Skill', planningDir });
  if (budgetResult) {
    logHook('pre-skill-dispatch', 'PreToolUse', 'blocked', { handler: 'enforce-context-budget' });
    return budgetResult; // already { decision: 'block', reason: '...' }
  }

  // Step 2 — Skill argument validation
  const skillResult = checkSkillArgs(data);
  if (skillResult) {
    if (skillResult.exitCode === 2) {
      // Blocking result
      logHook('pre-skill-dispatch', 'PreToolUse', 'blocked', { handler: 'validate-skill-args' });
      return skillResult.output; // { decision: 'block', reason: '...' }
    }
    // Advisory result (exitCode 0 with output)
    if (skillResult.output) {
      logHook('pre-skill-dispatch', 'PreToolUse', 'warn', { handler: 'validate-skill-args' });
      return skillResult.output;
    }
  }

  // Step 3 — All clear
  logHook('pre-skill-dispatch', 'PreToolUse', 'allow', {});
  return { decision: 'allow' };
}

/**
 * HTTP handler for hook-server integration.
 *
 * @param {Object} reqBody - HTTP request body with { data: {...} }
 * @param {Object} _cache - Hook server cache (unused)
 * @returns {Object|null} Hook result or null on error
 */
async function handleHttp(reqBody, _cache) {
  try {
    const data = reqBody.data || {};
    return await processEvent(data);
  } catch (_e) {
    return null;
  }
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);
      const result = await processEvent(data);

      if (result && result.decision === 'block') {
        process.stdout.write(JSON.stringify(result));
        process.exit(2);
        return;
      }

      process.stdout.write(JSON.stringify(result || {}));
      process.exit(0);
    } catch (_e) {
      process.stderr.write(`[pbr] pre-skill-dispatch error: ${_e.message}\n`);
      process.stdout.write(JSON.stringify({ decision: 'allow', additionalContext: '[PBR] pre-skill-dispatch failed: ' + _e.message }));
      process.exit(0);
    }
  });
}

module.exports = { handleHttp, processEvent };
if (require.main === module || process.argv[1] === __filename) { main(); }
