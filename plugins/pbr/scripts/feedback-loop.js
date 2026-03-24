#!/usr/bin/env node

'use strict';

/**
 * Agent Feedback Loop — Reflexion-inspired verification feedback extraction.
 *
 * Reads VERIFICATION.md from a phase directory, extracts actionable gap
 * descriptions, and formats them into a compact prompt for executor agents
 * on retry attempts. This closes the loop between verification and execution.
 *
 * Exports:
 *   extractFeedback(phaseDir)       — Parse VERIFICATION.md gaps
 *   formatFeedbackPrompt(feedback)  — Format feedback as markdown (<500 tokens)
 *   isEnabled(planningDir)          — Check config toggle
 *
 * Used by: check-subagent-output.js (PostToolUse on Task)
 * Config: features.agent_feedback_loop (default: true)
 */

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('./lib/frontmatter');

/**
 * Parse frontmatter and body from markdown content.
 * Delegates YAML parsing to canonical extractFrontmatter.
 * @param {string} content - Full file content
 * @returns {{ frontmatter: object, body: string }}
 */
function extractFrontmatterWithBody(content) {
  const frontmatter = extractFrontmatter(content);
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---/);
  const body = match ? content.slice(match[0].length).trim() : content;
  return { frontmatter, body };
}

/**
 * Extract actionable feedback from VERIFICATION.md in a phase directory.
 *
 * @param {string} phaseDir - Absolute path to the phase directory
 * @returns {{ status: string, attempt: number, pass_rate: number, gaps: Array<{ name: string, category: string, evidence: string, suggested_fix: string }> }|null}
 */
function extractFeedback(phaseDir) {
  const verPath = path.join(phaseDir, 'VERIFICATION.md');
  if (!fs.existsSync(verPath)) return null;

  let content;
  try {
    content = fs.readFileSync(verPath, 'utf8');
  } catch (_e) {
    return null;
  }

  const { frontmatter, body } = extractFrontmatterWithBody(content);

  const status = frontmatter.status;
  if (!status) return null;

  // No feedback needed if verification passed
  if (status === 'passed' || status === 'all_passed') return null;

  const attempt = frontmatter.attempt ? parseInt(frontmatter.attempt, 10) || 1 : 1;
  const passed = frontmatter.must_haves_passed ? parseInt(frontmatter.must_haves_passed, 10) || 0 : 0;
  const total = frontmatter.must_haves_total ? parseInt(frontmatter.must_haves_total, 10) || 1 : 1;
  const pass_rate = total > 0 ? passed / total : 0;

  // Parse gap sections from body
  const gaps = [];
  const gapPattern = /### Gap:\s*(.+)/g;
  let gapMatch;
  const gapStarts = [];

  while ((gapMatch = gapPattern.exec(body)) !== null) {
    gapStarts.push({ name: gapMatch[1].trim(), index: gapMatch.index });
  }

  for (let i = 0; i < gapStarts.length; i++) {
    const start = gapStarts[i].index;
    const end = i + 1 < gapStarts.length ? gapStarts[i + 1].index : body.length;
    const section = body.slice(start, end);

    const categoryMatch = section.match(/\*\*Category:\*\*\s*(.+)/);
    const evidenceMatch = section.match(/\*\*Evidence:\*\*\s*(.+)/);
    const fixMatch = section.match(/\*\*Suggested Fix:\*\*\s*(.+)/);

    gaps.push({
      name: gapStarts[i].name,
      category: categoryMatch ? categoryMatch[1].trim() : 'unknown',
      evidence: evidenceMatch ? evidenceMatch[1].trim() : '',
      suggested_fix: fixMatch ? fixMatch[1].trim() : ''
    });
  }

  // Log feedback extraction for audit trail (REQ-XC-007)
  try {
    const { logEvent } = require('./event-logger');
    logEvent('feedback_loop', 'feedback_extracted', {
      phaseDir: path.basename(phaseDir),
      status,
      attempt,
      pass_rate: Math.round(pass_rate * 100),
      gap_count: gaps.length
    });
  } catch (_e) {
    // Best-effort logging — never fail the caller
  }

  return { status, attempt, pass_rate, gaps };
}

/**
 * Format feedback into a compact markdown prompt for executor agents.
 * Output is kept under 500 tokens (~2000 chars) to preserve agent context budget.
 *
 * @param {{ status: string, attempt: number, pass_rate: number, gaps: Array }|null} feedback
 * @returns {string}
 */
function formatFeedbackPrompt(feedback) {
  if (!feedback) return '';

  const lines = [];
  lines.push(`## Previous Verification Feedback (Attempt ${feedback.attempt})`);
  lines.push('');
  lines.push(`Pass rate: ${Math.round(feedback.pass_rate * 100)}%`);
  lines.push('');

  for (const gap of feedback.gaps) {
    lines.push(`### ${gap.name}`);
    lines.push(`**Category:** ${gap.category}`);
    if (gap.evidence) lines.push(`**Evidence:** ${gap.evidence}`);
    if (gap.suggested_fix) lines.push(`**Fix:** ${gap.suggested_fix}`);
    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Check if the agent feedback loop is enabled in config.
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {boolean}
 */
function isEnabled(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config?.features?.agent_feedback_loop !== false;
  } catch (_e) {
    return true; // Default enabled
  }
}

module.exports = { extractFeedback, formatFeedbackPrompt, isEnabled };
