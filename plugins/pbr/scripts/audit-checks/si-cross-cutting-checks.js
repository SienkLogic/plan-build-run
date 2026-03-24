#!/usr/bin/env node

/**
 * SI-13 through SI-15: Cross-cutting self-integrity checks.
 *
 * SI-13: Dispatch chain completeness — documented sub-hooks vs actual requires.
 * SI-14: CRITICAL marker coverage — failure-prone skill steps need markers.
 * SI-15: Cross-platform path safety — no hardcoded separators in hooks/scripts.
 *
 * Each check returns { status, evidence, message } matching the audit result contract.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Documented dispatch chains from CLAUDE.md hook table.
 * Maps dispatcher filename to the documented sub-hook script names.
 */
const DOCUMENTED_CHAINS = {
  'post-write-dispatch.js': [
    'check-plan-format',
    'check-roadmap-sync',
    'check-state-sync'
  ],
  'pre-bash-dispatch.js': [
    'validate-commit',
    'check-dangerous-commands',
    'check-phase-boundary'
  ],
  'pre-write-dispatch.js': [
    'check-skill-workflow',
    'check-summary-gate',
    'check-phase-boundary',
    'check-doc-sprawl'
  ]
};

/**
 * SI-13: Check that dispatch scripts call all documented sub-hooks.
 *
 * Reads each dispatcher source and verifies that every documented sub-hook
 * appears as a require() or function call reference.
 *
 * @param {string} pluginRoot - Path to the plugin root (e.g., './plugins/pbr')
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkDispatchChainCompleteness(pluginRoot) {
  const evidence = [];
  const scriptsDir = path.join(pluginRoot, 'scripts');

  for (const [dispatcher, subHooks] of Object.entries(DOCUMENTED_CHAINS)) {
    const dispatcherPath = path.join(scriptsDir, dispatcher);

    if (!fs.existsSync(dispatcherPath)) {
      evidence.push(`${dispatcher}: file not found`);
      continue;
    }

    const source = fs.readFileSync(dispatcherPath, 'utf8');

    for (const subHook of subHooks) {
      // Check for require('./sub-hook-name') or require('./sub-hook-name.js')
      // Also check for the sub-hook name as a function call pattern (camelCase version)
      const requirePattern = new RegExp(
        `require\\(['"\`]\\.\\/` + subHook.replace(/-/g, '[-]') + `(?:\\.js)?['"\`]\\)`,
        'i'
      );
      // Also accept the camelCase function name derived from the sub-hook
      const camelName = subHook.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const fnPattern = new RegExp(`\\b${camelName}\\b`, 'i');

      if (!requirePattern.test(source) && !fnPattern.test(source)) {
        evidence.push(`${dispatcher}: documented sub-hook '${subHook}' not found in source`);
      }
    }
  }

  return {
    status: evidence.length > 0 ? 'warn' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} documented sub-hook(s) missing from dispatcher source`
      : 'All documented sub-hooks found in dispatch scripts'
  };
}

/**
 * SI-14: Check that known failure-prone skill steps have CRITICAL/STOP markers.
 *
 * Scans SKILL.md files for steps that create directories or write required
 * artifacts, then checks if those steps have a preceding or inline CRITICAL
 * or STOP marker within 5 lines.
 *
 * @param {string} pluginRoot - Path to the plugin root
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkCriticalMarkerCoverage(pluginRoot) {
  const evidence = [];
  const skillsDir = path.join(pluginRoot, 'skills');

  if (!fs.existsSync(skillsDir)) {
    return { status: 'warn', evidence: ['skills/ directory not found'], message: 'Cannot check CRITICAL markers — skills dir missing' };
  }

  // Patterns that indicate failure-prone steps
  const dangerousPatterns = [
    /\bmkdir\b/i,
    /\bCreate\s+(the\s+)?directory/i,
    /\bCreate\s+(the\s+)?`.planning/i,
    /\bWrite\s+(the\s+)?.*\bPLAN\b/i,
    /\bWrite\s+(the\s+)?.*\bSUMMARY\b/i,
    /\bWrite\s+(the\s+)?.*\bVERIFICATION\b/i,
    /\bWrite\s+(the\s+)?.*\bROADMAP\b/i,
    /\bWrite\s+(the\s+)?.*\bSTATE\b/i
  ];

  const criticalPattern = /\bCRITICAL\b|\bSTOP\b/;

  // Recursively find SKILL.md files
  function findSkillFiles(dir) {
    const results = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'shared') {
          results.push(...findSkillFiles(fullPath));
        } else if (entry.name === 'SKILL.md') {
          results.push(fullPath);
        }
      }
    } catch (_e) {
      // intentionally silent: directory may not exist
    }
    return results;
  }

  const skillFiles = findSkillFiles(skillsDir);

  for (const skillPath of skillFiles) {
    const content = fs.readFileSync(skillPath, 'utf8');
    const lines = content.split('\n');
    const skillName = path.basename(path.dirname(skillPath));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matchesDangerous = dangerousPatterns.some(p => p.test(line));

      if (matchesDangerous) {
        // Check the 5 lines before and the current line for CRITICAL/STOP
        const windowStart = Math.max(0, i - 5);
        const windowEnd = i + 1; // inclusive of current line
        const window = lines.slice(windowStart, windowEnd).join('\n');

        if (!criticalPattern.test(window)) {
          const relPath = path.relative(pluginRoot, skillPath).replace(/\\/g, '/');
          evidence.push(`${relPath}:${i + 1}: failure-prone step without CRITICAL/STOP marker: "${line.trim().substring(0, 80)}"`);
        }
      }
    }
  }

  return {
    status: evidence.length > 0 ? 'warn' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} failure-prone step(s) lack CRITICAL/STOP markers`
      : 'All failure-prone skill steps have CRITICAL/STOP markers'
  };
}

/**
 * SI-15: Check for hardcoded path separators in hook/script files.
 *
 * Scans .js files under scripts/ and hooks/ for hardcoded path separators
 * that would break cross-platform compatibility.
 *
 * @param {string} pluginRoot - Path to the plugin root
 * @returns {{ status: string, evidence: Array<string>, message: string }}
 */
function checkCrossPlatformPathSafety(pluginRoot) {
  const evidence = [];

  const dirsToScan = [
    path.join(pluginRoot, 'scripts'),
    path.join(pluginRoot, 'hooks')
  ];

  // Patterns that indicate hardcoded path separators
  // __dirname + '/' or __dirname + '\\' — should use path.join
  const unsafePatterns = [
    {
      pattern: /__dirname\s*\+\s*['"`][/\\]/,
      desc: '__dirname + separator (use path.join)'
    },
    {
      pattern: /\bdir\s*\+\s*['"`]\//,
      desc: 'dir + "/" concatenation (use path.join)'
    },
    {
      pattern: /\bfolder\s*\+\s*['"`]\//,
      desc: 'folder + "/" concatenation (use path.join)'
    }
  ];

  // Lines to exclude: comments, require() paths, URLs, regex patterns
  function shouldExcludeLine(line) {
    const trimmed = line.trim();
    // Single-line comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
    // URL strings
    if (/https?:\/\//.test(line)) return true;
    // require() paths (these use forward slash by convention)
    if (/require\s*\(['"`]/.test(line)) return true;
    // Regex literals (common to use \/ or \\)
    if (/new\s+RegExp\(/.test(line) || /\/[^/]+\/[gimsuvy]*/.test(trimmed)) return true;
    return false;
  }

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue;
          scanDir(fullPath);
        } else if (entry.name.endsWith('.js')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (shouldExcludeLine(line)) continue;

            for (const { pattern, desc } of unsafePatterns) {
              if (pattern.test(line)) {
                const relPath = path.relative(pluginRoot, fullPath).replace(/\\/g, '/');
                evidence.push(`${relPath}:${i + 1}: ${desc}`);
              }
            }
          }
        }
      }
    } catch (_e) {
      // intentionally silent: directory may not exist
    }
  }

  for (const dir of dirsToScan) {
    scanDir(dir);
  }

  return {
    status: evidence.length > 0 ? 'warn' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} hardcoded path separator(s) found`
      : 'No hardcoded path separators found in hook/script files'
  };
}

module.exports = {
  checkDispatchChainCompleteness,
  checkCriticalMarkerCoverage,
  checkCrossPlatformPathSafety
};
