/**
 * lib/security-scan.cjs — OWASP-style security scanning for Plan-Build-Run.
 *
 * Checks changed files against security rules inspired by the OWASP Top 10
 * and common vulnerability patterns. Reports findings with severity levels.
 * Controlled by config.features.security_scanning.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Security rules ───────────────────────────────────────────────────────────

/**
 * OWASP-inspired security rules.
 * Each rule specifies a regex pattern and associated metadata.
 */
const SECURITY_RULES = [
  {
    id: 'SEC-001',
    name: 'hardcoded-secret',
    // Matches: const/let/var KEY = "value", assignment with key-like name containing long strings
    pattern: /(?:api[_-]?key|secret|password|token|auth|credential|passwd|pwd)\s*[=:]\s*["'][^"']{8,}["']/i,
    severity: 'high',
    message: 'Potential hardcoded secret',
  },
  {
    id: 'SEC-002',
    name: 'eval-usage',
    pattern: /\beval\s*\(/,
    severity: 'high',
    message: 'eval() with dynamic input — potential code injection',
  },
  {
    id: 'SEC-003',
    name: 'shell-injection',
    // exec/spawn/execSync with string concatenation
    pattern: /(?:exec|spawn|execSync|execFileSync)\s*\(\s*(?:[^)]*\+|`[^`]*\${)/,
    severity: 'high',
    message: 'Potential shell injection via string concatenation in exec/spawn',
  },
  {
    id: 'SEC-004',
    name: 'unsafe-regex',
    // Nested quantifiers that can cause catastrophic backtracking
    pattern: /\/[^/]*(?:\([^)]*[+*][^)]*\)[+*]|\([^)]*[+*][^)]*\)\{)/,
    severity: 'medium',
    message: 'Potentially catastrophic regex backtracking (nested quantifiers)',
  },
  {
    id: 'SEC-005',
    name: 'path-traversal',
    // path.join/resolve with user input (variables named req, user, input, param, etc.)
    pattern: /path\.(?:join|resolve)\s*\([^)]*(?:req\.|user|input|param|query|body)[^)]*\)/,
    severity: 'medium',
    message: 'Potential path traversal — unsanitized path with user input',
  },
  {
    id: 'SEC-006',
    name: 'prototype-pollution',
    // Object bracket notation with dynamic keys that could be __proto__ or constructor
    pattern: /(?:obj|target|dest|result)\s*\[\s*(?:key|prop|k)\s*\]\s*=/,
    severity: 'high',
    message: 'Potential prototype pollution via dynamic property assignment',
  },
  {
    id: 'SEC-007',
    name: 'insecure-random',
    pattern: /Math\.random\(\)/,
    severity: 'low',
    message: 'Math.random() is not cryptographically secure — use crypto.randomBytes() for security-sensitive contexts',
  },
  {
    id: 'SEC-008',
    name: 'unvalidated-redirect',
    // res.redirect with variable input
    pattern: /res\.redirect\s*\(\s*(?:req\.|user|input|param|query|body|url)/,
    severity: 'medium',
    message: 'Potential open redirect — redirect destination should be validated',
  },
];

// ─── Binary file extensions to skip ──────────────────────────────────────────

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.zip', '.gz', '.tar', '.7z',
  '.mp3', '.mp4', '.avi', '.mov',
  '.exe', '.dll', '.so', '.dylib',
  '.pyc', '.class',
]);

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Scan a list of files against all security rules.
 *
 * @param {string[]} changedFiles - File paths to scan (absolute or relative)
 * @param {object} config - The .planning/config.json contents
 * @returns {{ findings: Array, scanned: number }}
 */
function scanFiles(changedFiles, config) {
  if (!config || !config.features || !config.features.security_scanning) {
    return { findings: [], scanned: 0 };
  }

  const findings = [];
  let scanned = 0;

  for (const filePath of changedFiles) {
    const ext = path.extname(filePath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (_e) {
      // File unreadable (permissions, doesn't exist) — skip
      continue;
    }

    scanned++;
    const isTestFile = /test/i.test(filePath);
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      for (const rule of SECURITY_RULES) {
        if (rule.pattern.test(line)) {
          const severity = isTestFile ? 'info' : rule.severity;
          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            file: filePath,
            line: line.trim(),
            lineNumber: lineIndex + 1,
            severity,
            message: rule.message,
          });
        }
      }
    }
  }

  return { findings, scanned };
}

/**
 * Format scan results into a human-readable report.
 *
 * @param {{ findings: Array, scanned: number }} scanResult
 * @returns {string} Formatted report string
 */
function formatFindings(scanResult) {
  const { findings, scanned } = scanResult;

  if (!findings || findings.length === 0) {
    return `Security scan: ${scanned} file(s) scanned — no findings (clean)`;
  }

  // Group by severity
  const bySeverity = { high: [], medium: [], low: [], info: [] };
  for (const finding of findings) {
    const bucket = bySeverity[finding.severity] || bySeverity.info;
    bucket.push(finding);
  }

  const lines = [
    `Security scan: ${scanned} file(s) scanned, ${findings.length} finding(s)`,
    `  high: ${bySeverity.high.length}  medium: ${bySeverity.medium.length}  low: ${bySeverity.low.length}  info: ${bySeverity.info.length}`,
    '',
  ];

  const severityOrder = ['high', 'medium', 'low', 'info'];
  for (const sev of severityOrder) {
    if (bySeverity[sev].length > 0) {
      lines.push(`[${sev.toUpperCase()}]`);
      for (const f of bySeverity[sev]) {
        lines.push(`  ${f.ruleId} ${f.file}:${f.lineNumber} — ${f.message}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  SECURITY_RULES,
  scanFiles,
  formatFindings,
};
