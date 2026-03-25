'use strict';

/**
 * lib/handoff-validators.js — Content-quality validators for handoff artifacts.
 *
 * These go beyond file-existence checks (handled by subagent-validators.js)
 * to validate that artifacts contain enough substance to be useful for
 * downstream consumers. Returns advisory warnings, never blocks.
 *
 * Implements REQ-HI-03 (Handoff Artifact Completeness).
 *
 * Each validator returns { adequate: boolean, warnings: string[] }.
 */

const fs = require('fs');

/**
 * Extract frontmatter string and body from file content.
 * @param {string} content - Full file content
 * @returns {{ frontmatter: string, body: string } | null}
 */
function parseSections(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const frontmatter = match[1];
  const body = content.slice(match[0].length).trim();
  return { frontmatter, body };
}

/**
 * Count words in text after stripping markdown headers and blank lines.
 * @param {string} text
 * @returns {number}
 */
function countBodyWords(text) {
  const lines = text.split(/\r?\n/)
    .filter(l => !l.match(/^\s*#+\s/) && l.trim().length > 0);
  return lines.join(' ').split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Read file content safely.
 * @param {string} filePath
 * @returns {{ content: string } | { error: string }}
 */
function safeRead(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { error: 'File not found' };
    }
    return { content: fs.readFileSync(filePath, 'utf8') };
  } catch (e) {
    return { error: `Read error: ${e.message}` };
  }
}

/**
 * Validate PLAN.md content quality.
 * Checks: must_haves presence and non-empty truths, task elements, files_modified.
 *
 * @param {string} filePath - Absolute path to PLAN.md
 * @returns {{ adequate: boolean, warnings: string[] }}
 */
function validatePlanCompleteness(filePath) {
  const warnings = [];
  const result = safeRead(filePath);
  if (result.error) return { adequate: false, warnings: [result.error] };

  const content = result.content;
  const sections = parseSections(content);

  if (!sections) {
    warnings.push('PLAN.md has no valid frontmatter');
    return { adequate: false, warnings };
  }

  const { frontmatter } = sections;

  // Check must_haves exists
  if (!/^must_haves:/m.test(frontmatter)) {
    warnings.push('PLAN.md frontmatter missing must_haves: field');
  } else {
    // Check truths has at least one non-empty entry
    const truthsMatch = frontmatter.match(/truths:\s*\r?\n((?:\s+-\s+.+\r?\n?)*)/m);
    if (!truthsMatch || !truthsMatch[1] || truthsMatch[1].trim().length === 0) {
      warnings.push('PLAN.md must_haves has zero truths entries — verifier cannot validate');
    }
  }

  // Check for task XML elements
  const taskCount = (content.match(/<task\s/gi) || []).length;
  if (taskCount === 0) {
    warnings.push('PLAN.md has zero task elements — executor has nothing to execute');
  }

  // Check files_modified
  if (!/^files_modified:/m.test(frontmatter)) {
    warnings.push('PLAN.md frontmatter missing files_modified: field');
  }

  return { adequate: warnings.length === 0, warnings };
}

/**
 * Validate SUMMARY.md content quality.
 * Checks: requires/key_files/deferred fields, body word count >= 50.
 *
 * @param {string} filePath - Absolute path to SUMMARY.md
 * @returns {{ adequate: boolean, warnings: string[] }}
 */
function validateSummaryCompleteness(filePath) {
  const warnings = [];
  const result = safeRead(filePath);
  if (result.error) return { adequate: false, warnings: [result.error] };

  const content = result.content;
  const sections = parseSections(content);

  if (!sections) {
    warnings.push('SUMMARY.md has no valid frontmatter');
    return { adequate: false, warnings };
  }

  const { frontmatter, body } = sections;

  // Check required frontmatter fields
  const requiredFields = ['requires:', 'key_files:', 'deferred:'];
  for (const field of requiredFields) {
    if (!frontmatter.includes(field)) {
      warnings.push(`SUMMARY.md frontmatter missing ${field.replace(':', '')} field`);
    }
  }

  // Check body word count
  const wordCount = countBodyWords(body);
  if (wordCount < 50) {
    warnings.push(`SUMMARY.md body has ${wordCount} words (minimum: 50) — may not provide sufficient context`);
  }

  return { adequate: warnings.length === 0, warnings };
}

/**
 * Validate VERIFICATION.md content quality.
 * Checks: status field, must_haves_total > 0, per-criterion verdict lines.
 *
 * @param {string} filePath - Absolute path to VERIFICATION.md
 * @returns {{ adequate: boolean, warnings: string[] }}
 */
function validateVerificationCompleteness(filePath) {
  const warnings = [];
  const result = safeRead(filePath);
  if (result.error) return { adequate: false, warnings: [result.error] };

  const content = result.content;
  const sections = parseSections(content);

  if (!sections) {
    warnings.push('VERIFICATION.md has no valid frontmatter');
    return { adequate: false, warnings };
  }

  const { frontmatter, body } = sections;

  // Check status field (accept both "status:" and "result:" variants)
  if (!/^(status|result):\s*\S+/m.test(frontmatter)) {
    warnings.push('VERIFICATION.md frontmatter missing status:/result: field');
  }

  // Check must-have count > 0 (accept both "must_haves_total:" and "must_haves_checked:")
  const totalMatch = frontmatter.match(/^must_haves_(total|checked|passed):\s*(\d+)/m);
  if (!totalMatch) {
    warnings.push('VERIFICATION.md frontmatter missing must_haves_total:/must_haves_checked: field');
  } else if (parseInt(totalMatch[2], 10) === 0) {
    warnings.push('VERIFICATION.md has must_haves count: 0 — no criteria were checked');
  }

  // Check for per-criterion verdict lines in body (table rows, markers, or inline verdicts)
  const hasVerdicts = /\b(PASS|FAIL|SKIP)\b/mi.test(body);
  if (!hasVerdicts) {
    warnings.push('VERIFICATION.md has no per-criterion verdict lines (expected table rows or markers with PASS/FAIL/SKIP)');
  }

  return { adequate: warnings.length === 0, warnings };
}

/**
 * Validate CONTEXT.md content quality.
 * Checks: frontmatter existence, body has at least one section with >10 words.
 *
 * @param {string} filePath - Absolute path to CONTEXT.md
 * @returns {{ adequate: boolean, warnings: string[] }}
 */
function validateContextCompleteness(filePath) {
  const warnings = [];
  const result = safeRead(filePath);
  if (result.error) return { adequate: false, warnings: [result.error] };

  const content = result.content;

  // Check frontmatter exists
  if (!content.startsWith('---')) {
    warnings.push('CONTEXT.md has no frontmatter');
  }

  // Extract body
  const sections = parseSections(content);
  const body = sections ? sections.body : content;

  // Check that at least one section has >10 words of content
  const bodyWords = countBodyWords(body);
  if (bodyWords <= 10) {
    warnings.push(`CONTEXT.md body has only ${bodyWords} words of content — too thin to be useful`);
  }

  return { adequate: warnings.length === 0, warnings };
}

module.exports = {
  validatePlanCompleteness,
  validateSummaryCompleteness,
  validateVerificationCompleteness,
  validateContextCompleteness
};
