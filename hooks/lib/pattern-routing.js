#!/usr/bin/env node

/**
 * Pattern-based file routing module.
 *
 * Matches file writes against configurable patterns and returns
 * context-appropriate advisory messages. Used as a lowest-priority
 * fallback in post-write-dispatch.js.
 *
 * Pure function — no side effects, no file writes.
 */

/**
 * Default pattern rules, ordered by priority (first match wins).
 * Security patterns come first to catch auth-related test files correctly.
 */
const DEFAULT_PATTERNS = [
  { pattern: /\.(env|secret|credential)/i, advisory: 'Security-sensitive file — consider /pbr:review for thorough review' },
  { pattern: /\b(auth|permission|rbac|acl)\b/i, advisory: 'Security-sensitive file — consider /pbr:review for thorough review' },
  { pattern: /\.(test|spec)\.(js|ts|jsx|tsx|cjs|mjs)$/i, advisory: 'Test file modified — ensure corresponding source file is updated' },
  { pattern: /(schema|migration)\b/i, advisory: 'Schema change detected — check for required migrations' },
  { pattern: /(config|tsconfig|jest\.config|vite\.config)\.(json|js|ts|cjs|mjs)$/i, advisory: 'Config change — verify downstream consumers' },
  { pattern: /hooks[/\\].*\.js$/i, advisory: 'Hook script modified — run npm test to verify cross-platform' },
];

/**
 * Check if a file path matches any defined pattern and return an advisory.
 *
 * @param {string} filePath - Path to the file being written
 * @param {object} config - Loaded config object
 * @returns {{ pattern: string, advisory: string } | null}
 */
function checkPatternRouting(filePath, config) {
  // Feature gate
  if (config && config.features && config.features.pattern_routing === false) {
    return null;
  }

  // Normalize path: replace backslashes with forward slashes
  const normalized = filePath.replace(/\\/g, '/');

  // Iterate patterns in priority order, return first match
  for (const rule of DEFAULT_PATTERNS) {
    if (rule.pattern.test(normalized)) {
      return {
        pattern: rule.pattern.source,
        advisory: rule.advisory
      };
    }
  }

  return null;
}

module.exports = { checkPatternRouting, DEFAULT_PATTERNS };
