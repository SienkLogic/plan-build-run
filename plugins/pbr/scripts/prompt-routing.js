#!/usr/bin/env node

/**
 * UserPromptSubmit hook: Detects PBR-relevant intent in user prompts
 * and injects routing hints when the user isn't using /pbr:* commands.
 *
 * Only activates for PBR projects (has .planning/ directory).
 * Skips prompts that already start with /pbr: or other slash commands.
 *
 * Intent detection patterns:
 *   - Bug/error reports → suggests /pbr:debug
 *   - Feature requests or task descriptions → suggests /pbr:do
 *   - Planning/architecture discussion → suggests /pbr:explore
 *   - Status/progress queries → suggests /pbr:progress
 *
 * Exit codes:
 *   0 = always (advisory only, never blocks user input)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');

// NL routing: try to load classifyIntent from intent-router.cjs
let classifyIntent = null;
try {
  const intentRouter = require(path.join(__dirname, 'intent-router.cjs'));
  classifyIntent = intentRouter.classifyIntent;
} catch (_e) {
  // intent-router.cjs not available — NL routing disabled gracefully
}

/**
 * Load NL routing config from .planning/config.json.
 * Returns { nlEnabled: boolean } based on features.natural_language_routing toggle.
 * Defaults to true if config missing or toggle absent.
 */
function loadNLConfig(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    if (!fs.existsSync(configPath)) return { nlEnabled: true };
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const features = config.features || {};
    return { nlEnabled: features.natural_language_routing !== false };
  } catch (_e) {
    return { nlEnabled: true };
  }
}

/**
 * Intent patterns ranked by specificity. First match wins.
 * Each pattern maps user intent to a PBR command suggestion.
 */
const INTENT_PATTERNS = [
  {
    pattern: /\b(bug|error|crash|exception|stack\s*trace|failing|broken|doesn'?t\s+work|not\s+working)\b/i,
    command: '/pbr:debug',
    hint: 'This looks like a bug report. Use /pbr:debug for systematic investigation with hypothesis tracking.'
  },
  {
    pattern: /\b(status|progress|where\s+(are|were)\s+we|what'?s\s+next|current\s+phase)\b/i,
    command: '/pbr:progress',
    hint: 'Use /pbr:progress to see project status and next steps.'
  },
  {
    pattern: /\b(explore|research|how\s+(does|do|should|would)|what\s+if|compare|pros\s+and\s+cons|trade-?offs?)\b/i,
    command: '/pbr:explore',
    hint: 'This sounds exploratory. Use /pbr:explore for Socratic investigation.'
  },
  {
    pattern: /\b(refactor|migrate|redesign|architect|restructure|overhaul|rewrite)\b/i,
    command: '/pbr:plan-phase add',
    hint: 'Complex work like this benefits from full planning. Use /pbr:plan-phase add.'
  },
  {
    // Generic task — anything actionable that doesn't match above
    pattern: /\b(add|create|implement|build|write|update|change|fix|remove|delete|set\s+up|configure|install)\b/i,
    command: '/pbr:do',
    hint: 'Use /pbr:do to auto-route this to the right PBR skill.'
  }
];

/**
 * Analyze a user prompt and return a routing suggestion if applicable.
 * Returns null if no suggestion is warranted.
 *
 * @param {string} prompt - The user's raw prompt text
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {{ command: string, hint: string }|null}
 */
function analyzePrompt(prompt, planningDir) {
  if (!prompt || typeof prompt !== 'string') return null;

  const trimmed = prompt.trim();

  // Skip slash commands — user already knows what they want
  if (trimmed.startsWith('/')) return null;

  // Skip very short prompts (likely follow-up responses like "yes", "ok", "3")
  if (trimmed.length < 15) return null;

  // Skip if .planning/ doesn't exist (not a PBR project)
  if (!fs.existsSync(planningDir)) return null;

  // Skip if no active PBR project (no STATE.md)
  if (!fs.existsSync(path.join(planningDir, 'STATE.md'))) return null;

  // NL routing: use classifyIntent when available and enabled
  const { nlEnabled } = loadNLConfig(planningDir);
  if (nlEnabled && classifyIntent) {
    try {
      const hasRoadmap = fs.existsSync(path.join(planningDir, 'ROADMAP.md'));
      const result = classifyIntent(trimmed, { hasRoadmap });

      if (result && result.confidence >= 0.7) {
        // Map intent-router route names to /pbr: commands
        const routeCommandMap = {
          'debug': '/pbr:debug',
          'explore': '/pbr:explore',
          'plan-phase': '/pbr:plan-phase add',
          'quick': '/pbr:do',
          'note': '/pbr:note',
          'verify-work': '/pbr:review'
        };
        const command = routeCommandMap[result.route] || '/pbr:do';
        return {
          command,
          hint: `This looks like a ${result.route} task. Consider using /pbr:do for automatic routing, or ${command} directly.`,
          nlRoute: { route: result.route, confidence: result.confidence }
        };
      }
      // Low confidence from classifyIntent — fall through to pattern matching
    } catch (_e) {
      // classifyIntent error — fall through to pattern matching
    }
  }

  // Fallback: pattern-based routing (always available)
  for (const intent of INTENT_PATTERNS) {
    if (intent.pattern.test(trimmed)) {
      return { command: intent.command, hint: intent.hint };
    }
  }

  return null;
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const prompt = data.prompt || data.user_prompt || data.content || '';
      const cwd = data.cwd || process.env.PBR_PROJECT_ROOT || process.cwd();
      const planningDir = path.join(cwd, '.planning');

      const suggestion = analyzePrompt(prompt, planningDir);

      if (suggestion) {
        logHook('prompt-routing', 'UserPromptSubmit', 'suggest', {
          command: suggestion.command
        });
        process.stdout.write(JSON.stringify({
          additionalContext: `[pbr] ${suggestion.hint}\n\`${suggestion.command}\``
        }));
      }

      process.exit(0);
    } catch (_e) {
      // Never block on errors
      process.stdout.write(JSON.stringify({ additionalContext: '⚠ [PBR] prompt-routing failed: ' + _e.message }));
      process.exit(0);
    }
  });
}

/**
 * HTTP handler for hook-server.js.
 * @param {Object} reqBody - { event, tool, data, planningDir }
 * @returns {{ additionalContext: string }|null}
 */
function handleHttp(reqBody) {
  try {
    const data = reqBody.data || {};
    const prompt = data.prompt || data.user_prompt || data.content || '';
    const planningDir = reqBody.planningDir || path.join(process.cwd(), '.planning');

    const suggestion = analyzePrompt(prompt, planningDir);
    if (suggestion) {
      logHook('prompt-routing', 'UserPromptSubmit', 'suggest', {
        command: suggestion.command
      });
      return {
        additionalContext: `[pbr] ${suggestion.hint}\n\`${suggestion.command}\``
      };
    }
  } catch (_e) {
    // Never propagate
  }
  return null;
}

module.exports = { analyzePrompt, handleHttp, INTENT_PATTERNS };
if (require.main === module || process.argv[1] === __filename) { main(); }
