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

/**
 * Parse YAML-ish frontmatter from markdown content.
 * Lightweight parser — no dependency on pbr-tools to avoid circular deps.
 * @param {string} content - Full file content
 * @returns {{ frontmatter: object, body: string }}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { frontmatter: {}, body: content };

  const fm = {};
  const lines = match[1].split(/\r?\n/);
  for (const line of lines) {
    const kvMatch = line.match(/^(\w[\w_]*):\s*(.+)/);
    if (kvMatch) {
      const key = kvMatch[1];
      let val = kvMatch[2].trim();
      // Parse numbers
      if (/^\d+$/.test(val)) val = parseInt(val, 10);
      // Strip quotes
      if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      fm[key] = val;
    }
  }

  const body = content.slice(match[0].length).trim();
  return { frontmatter: fm, body };
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

  const { frontmatter, body } = parseFrontmatter(content);

  const status = frontmatter.status;
  if (!status) return null;

  // No feedback needed if verification passed
  if (status === 'passed' || status === 'all_passed') return null;

  const attempt = typeof frontmatter.attempt === 'number' ? frontmatter.attempt : 1;
  const passed = typeof frontmatter.must_haves_passed === 'number' ? frontmatter.must_haves_passed : 0;
  const total = typeof frontmatter.must_haves_total === 'number' ? frontmatter.must_haves_total : 1;
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
