/**
 * lib/validation.cjs — Multi-layer validation orchestration for Plan-Build-Run.
 *
 * Provides BugBot-style parallel review passes that scan code changes from
 * multiple perspectives (correctness, security, performance, etc.).
 * Controlled by config.features.multi_layer_validation and config.validation_passes.
 */

'use strict';

// ─── Pass definitions ─────────────────────────────────────────────────────────

/**
 * All 8 standard validation pass definitions.
 * Each pass targets a specific quality dimension.
 */
const PASS_DEFINITIONS = {
  correctness: {
    focus: 'Logic errors, edge cases, off-by-one, null handling',
    severity: 'high',
    description: 'Checks for functional bugs and correctness issues',
  },
  security: {
    focus: 'Injection, auth bypass, secrets exposure, OWASP Top 10',
    severity: 'high',
    description: 'Checks for security vulnerabilities and risky patterns',
  },
  performance: {
    focus: 'O(n^2) loops, unnecessary allocations, blocking I/O',
    severity: 'medium',
    description: 'Identifies performance bottlenecks and inefficiencies',
  },
  style: {
    focus: 'Naming conventions, code organization, consistency with codebase',
    severity: 'low',
    description: 'Checks code style, naming, and organizational consistency',
  },
  tests: {
    focus: 'Missing test coverage, weak assertions, flaky test patterns',
    severity: 'medium',
    description: 'Evaluates test coverage and quality',
  },
  accessibility: {
    focus: 'ARIA labels, keyboard nav, screen reader compat',
    severity: 'medium',
    description: 'Checks UI accessibility compliance',
  },
  docs: {
    focus: 'Missing JSDoc, outdated comments, README drift',
    severity: 'low',
    description: 'Checks documentation completeness and accuracy',
  },
  deps: {
    focus: 'Outdated deps, unused imports, license conflicts, CVEs',
    severity: 'medium',
    description: 'Checks dependency health, usage, and security',
  },
};

// ─── Prompt template ──────────────────────────────────────────────────────────

const VALIDATION_PROMPT_TEMPLATE = `You are a code reviewer performing a focused validation pass.

## Pass: {passName}
## Focus Area: {focus}

Review the following diff and identify issues related to your focus area only.

## Changed Files
{contextInfo}

## Diff
\`\`\`
{diffContent}
\`\`\`

## Instructions
- Focus exclusively on: {focus}
- Ignore issues outside your focus area
- Be specific: include file name and line number for each finding
- Severity levels: high (blocking), medium (should fix), low (nice to fix), info (observation)

Return your findings as JSON:
{
  "pass": "{passName}",
  "findings": [
    { "file": "path/to/file", "line": 42, "severity": "high|medium|low|info", "message": "description" }
  ],
  "summary": "One-sentence summary of findings"
}

If no issues found, return findings: [] with an appropriate summary.`;

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Get the list of validation passes to run based on config.
 *
 * @param {object} config - The .planning/config.json contents
 * @returns {Array<{ name: string, focus: string, severity: string }>}
 */
function getValidationPasses(config) {
  if (!config || !config.features || !config.features.multi_layer_validation) {
    return [];
  }

  const passList = config.validation_passes || ['correctness', 'security'];

  return passList
    .filter(name => Object.prototype.hasOwnProperty.call(PASS_DEFINITIONS, name))
    .map(name => ({
      name,
      focus: PASS_DEFINITIONS[name].focus,
      severity: PASS_DEFINITIONS[name].severity,
    }));
}

/**
 * Build a structured validation prompt for a specific pass.
 *
 * @param {string} passName - Name of the validation pass (e.g., 'security')
 * @param {string} diffContent - Git diff content to review
 * @param {object} contextInfo - Optional context (files, phase, etc.)
 * @returns {string} Formatted prompt string
 */
function buildValidationPrompt(passName, diffContent, contextInfo) {
  const passDef = PASS_DEFINITIONS[passName] || {
    focus: 'General code quality',
    severity: 'medium',
  };

  const contextStr = contextInfo && Object.keys(contextInfo).length > 0
    ? Object.entries(contextInfo)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('\n')
    : 'No additional context';

  return VALIDATION_PROMPT_TEMPLATE
    .replace(/{passName}/g, passName)
    .replace(/{focus}/g, passDef.focus)
    .replace(/{contextInfo}/g, contextStr)
    .replace(/{diffContent}/g, diffContent);
}

/**
 * Aggregate results from multiple validation passes.
 *
 * @param {Array<{ pass: string, findings: Array, summary: string }>} passResults
 * @returns {{ totalFindings: number, bySeverity: object, passes: string[], blocked: boolean }}
 */
function getValidationSummary(passResults) {
  const bySeverity = { high: 0, medium: 0, low: 0, info: 0 };
  let totalFindings = 0;
  const passes = [];

  for (const result of passResults) {
    passes.push(result.pass);
    const findings = result.findings || [];
    for (const finding of findings) {
      totalFindings++;
      const sev = finding.severity || 'info';
      if (Object.prototype.hasOwnProperty.call(bySeverity, sev)) {
        bySeverity[sev]++;
      } else {
        bySeverity.info++;
      }
    }
  }

  const blocked = bySeverity.high > 0;

  return {
    totalFindings,
    bySeverity,
    passes,
    blocked,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  PASS_DEFINITIONS,
  getValidationPasses,
  buildValidationPrompt,
  getValidationSummary,
};
