#!/usr/bin/env node

/**
 * PreToolUse check: Advisory scan of .planning/ writes for prompt injection patterns.
 *
 * Scans content being written to .planning/ files for common prompt injection
 * techniques. ADVISORY ONLY — never blocks, always exits 0.
 *
 * Pattern categories:
 *   1. INSTRUCTION_OVERRIDE — "ignore previous instructions" etc.
 *   2. ROLE_MANIPULATION — "you are now a" etc.
 *   3. SYSTEM_PROMPT_EXTRACTION — "repeat your system prompt" etc.
 *   4. XML_TAG_MIMICKING — fake <system>, <tool_result> etc.
 *   5. INVISIBLE_UNICODE — zero-width chars, directional overrides
 *
 * Called by pre-write-dispatch.js — not wired directly in hooks.json.
 *
 * Exit codes:
 *   0 = always (advisory only, never blocks)
 */

const { logHook } = require('./hook-logger');

/**
 * Paths that legitimately contain XML examples and tag references.
 * These are excluded from XML_TAG_MIMICKING checks.
 */
const XML_ALLOWLIST_SEGMENTS = ['/skills/', '/agents/', '/templates/', '/references/'];

const PATTERN_CATEGORIES = {
  INSTRUCTION_OVERRIDE: [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /disregard\s+(all\s+)?prior/i,
    /forget\s+everything\s+(above|before|you)/i,
    /do\s+not\s+follow\s+(the|your)\s+(previous|above|prior)/i,
  ],
  ROLE_MANIPULATION: [
    /you\s+are\s+now\s+a/i,
    /act\s+as\s+(a|an|if)\b/i,
    /pretend\s+(to\s+be|you\s+are)/i,
    /from\s+now\s+on[,\s]+(you|your)\s+(are|role)/i,
  ],
  SYSTEM_PROMPT_EXTRACTION: [
    /repeat\s+your\s+(system\s+)?prompt/i,
    /show\s+me\s+your\s+(instructions|system\s+prompt)/i,
    /what\s+(are|is)\s+your\s+(system\s+)?instructions/i,
    /output\s+your\s+(entire\s+)?(system\s+)?prompt/i,
  ],
  XML_TAG_MIMICKING: [
    /<\/?system>/,
    /<\/?tool_result>/,
    /<\/?function_calls>/,
    /<\/?antml:/,
    /<\/?human>/,
    /<\/?assistant>/,
  ],
  INVISIBLE_UNICODE: [
    /\u200B|\u200C|\u200D|\uFEFF/,
    /[\u202A-\u202E]/,
    /[\u2066-\u2069]/,
  ],
};

/**
 * Scan content written to .planning/ for prompt injection patterns.
 * @param {Object} data - Parsed hook input (tool_input, etc.)
 * @returns {null|{exitCode: number, output: Object}} null if clean, advisory result otherwise
 */
function checkPromptInjection(data) {
  const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
  if (!filePath) return null;

  const normalized = filePath.replace(/\\/g, '/');

  // Only scan .planning/ writes
  if (!normalized.includes('.planning/')) return null;

  // Get content from Write (content) or Edit (new_string)
  const content = data.tool_input?.content || data.tool_input?.new_string || '';
  if (!content) return null;

  // Check if this path is allowlisted for XML tag patterns
  const isXmlAllowlisted = XML_ALLOWLIST_SEGMENTS.some((seg) => normalized.includes(seg));

  const matches = [];

  for (const [category, patterns] of Object.entries(PATTERN_CATEGORIES)) {
    // Skip XML tag check for allowlisted paths
    if (category === 'XML_TAG_MIMICKING' && isXmlAllowlisted) continue;

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        matches.push({ category, pattern: pattern.source });
        break; // One match per category is enough
      }
    }
  }

  if (matches.length === 0) return null;

  const categories = [...new Set(matches.map((m) => m.category))].join(', ');
  const file = normalized.split('/').pop();

  logHook('prompt-guard', 'PreToolUse', 'warn', { file, categories });

  return {
    exitCode: 0,
    output: {
      additionalContext: `[pbr:prompt-guard] Advisory: detected ${matches.length} potential prompt injection pattern(s) in .planning/ write: ${categories}. Review content for safety.`
    }
  };
}

module.exports = { checkPromptInjection, PATTERN_CATEGORIES };
