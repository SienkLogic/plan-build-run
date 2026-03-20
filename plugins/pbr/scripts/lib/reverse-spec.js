'use strict';
/**
 * reverse-spec.cjs — Generates PLAN.md-compatible specs from existing source files.
 *
 * Analyzes source files to extract exports, test blocks, and structure,
 * then produces a StructuredPlan object representing what the code does.
 */

const fs = require('fs');
const path = require('path');
const { serializeSpec } = require('./spec-engine');

// ─── Module System Detection ──────────────────────────────────────────────────

/**
 * Detect whether a file uses CJS, ESM, or is a test file.
 * @param {string} content
 * @param {string} filePath
 * @returns {'cjs'|'esm'|'test'}
 */
function detectModuleSystem(content, filePath) {
  const basename = path.basename(filePath);
  // Test files: .test.js, .spec.js, or in tests/ directory
  if (/\.(test|spec)\.(js|cjs|mjs|ts)$/.test(basename) ||
      /[/\\]tests?[/\\]/.test(filePath) ||
      content.match(/\bdescribe\s*\(/) ||
      content.match(/\bit\s*\(/) ||
      content.match(/\btest\s*\(/)) {
    return 'test';
  }
  // ESM: has export keyword
  if (content.match(/^export\s+(function|const|let|var|default|class)/m) ||
      content.match(/^export\s+\{/m)) {
    return 'esm';
  }
  // Default to CJS
  return 'cjs';
}

// ─── Signature Extraction ─────────────────────────────────────────────────────

/**
 * Extract module signature from file content.
 * @param {string} content - File content
 * @param {string} filePath - File path (used for type detection)
 * @returns {{ filePath: string, exports: string[], tests: string[], type: 'cjs'|'esm'|'test' }}
 */
function extractModuleSignature(content, filePath) {
  const type = detectModuleSystem(content, filePath);
  const exports = [];
  const tests = [];

  if (type === 'test') {
    // Extract describe and it/test block names
    const describeRe = /\bdescribe\s*\(\s*["'`]([^"'`]+)["'`]/g;
    const itRe = /\b(?:it|test)\s*\(\s*["'`]([^"'`]+)["'`]/g;
    let m;
    while ((m = describeRe.exec(content)) !== null) {
      tests.push(`describe: ${m[1]}`);
    }
    while ((m = itRe.exec(content)) !== null) {
      tests.push(m[1]);
    }
  } else if (type === 'esm') {
    // Extract export function/const/let/var/default/class names
    const namedRe = /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/gm;
    const defaultRe = /^export\s+default\s+(?:class|function)?\s*(\w+)?/gm;
    let m;
    while ((m = namedRe.exec(content)) !== null) {
      if (m[1]) exports.push(m[1]);
    }
    while ((m = defaultRe.exec(content)) !== null) {
      exports.push(m[1] || 'default');
    }
  } else {
    // CJS: look for exports.X = and module.exports = { ... }
    const exportsRe = /exports\.(\w+)\s*=/g;
    const moduleExportsObj = content.match(/module\.exports\s*=\s*\{([^}]+)\}/);
    const moduleExportsFn = content.match(/module\.exports\s*=\s*(\w+)\s*;?/);
    let m;
    while ((m = exportsRe.exec(content)) !== null) {
      exports.push(m[1]);
    }
    if (moduleExportsObj) {
      // Extract keys from object literal
      const objContent = moduleExportsObj[1];
      const keyRe = /(\w+)\s*[,:\n]/g;
      while ((m = keyRe.exec(objContent)) !== null) {
        if (!exports.includes(m[1])) exports.push(m[1]);
      }
    } else if (moduleExportsFn && moduleExportsFn[1] && !moduleExportsObj) {
      exports.push(moduleExportsFn[1]);
    }
  }

  return { filePath, exports, tests, type };
}

// ─── File Grouping ────────────────────────────────────────────────────────────

/**
 * Group implementation files with their matching test files.
 * Pairing convention: src/foo.cjs + tests/foo.test.cjs or tests/foo.test.js
 * @param {string[]} filePaths
 * @returns {Array<{impl: string[], test: string[]}>}
 */
function groupFiles(filePaths) {
  const testFiles = new Set(filePaths.filter(f => {
    const b = path.basename(f);
    return /\.(test|spec)\.(js|cjs|mjs|ts)$/.test(b) || /[/\\]tests?[/\\]/.test(f);
  }));
  const implFiles = filePaths.filter(f => !testFiles.has(f));

  // Try to pair each impl file with its test
  const groups = [];
  const usedTests = new Set();

  for (const impl of implFiles) {
    const implBase = path.basename(impl).replace(/\.(js|cjs|mjs|ts)$/, '');
    // Find matching test files
    const matched = [];
    for (const test of testFiles) {
      const testBase = path.basename(test);
      if (testBase.startsWith(implBase + '.') || testBase.startsWith(implBase + '-')) {
        matched.push(test);
        usedTests.add(test);
      }
    }
    groups.push({ impl: [impl], test: matched });
  }

  // Remaining test files without impl pairs
  const unmatchedTests = [...testFiles].filter(t => !usedTests.has(t));
  if (unmatchedTests.length > 0) {
    groups.push({ impl: [], test: unmatchedTests });
  }

  // If no impl files, just group all tests together
  if (groups.length === 0 && testFiles.size > 0) {
    groups.push({ impl: [], test: filePaths });
  }

  return groups.length > 0 ? groups : [{ impl: filePaths, test: [] }];
}

// ─── Reverse Spec Generator ───────────────────────────────────────────────────

/**
 * Generate a StructuredPlan from a set of source file paths.
 * @param {string[]} filePaths - Absolute or relative file paths to analyze
 * @param {Object} options
 * @param {string} [options.phaseSlug] - Phase slug for frontmatter
 * @param {string} [options.planId] - Plan ID for frontmatter
 * @param {Function} [options.readFile] - File reader (defaults to fs.readFileSync)
 * @returns {{ frontmatter: Object, tasks: Object[] }}
 */
function generateReverseSpec(filePaths, options) {
  const opts = options || {};
  const readFile = opts.readFile || ((p) => fs.readFileSync(p, 'utf-8'));

  // Extract signature from each file
  const signatures = filePaths.map(fp => {
    try {
      const content = readFile(fp);
      return extractModuleSignature(content, fp);
    } catch (_e) {
      return { filePath: fp, exports: [], tests: [], type: 'cjs' };
    }
  });

  // Build frontmatter
  const relPaths = filePaths.map(fp => {
    // Use basename with a plausible relative path
    return fp;
  });

  // Derive must_haves from signatures
  const artifacts = signatures
    .filter(s => s.type !== 'test')
    .map(s => `${s.filePath}: ${s.exports.length} exports`);

  const truths = signatures
    .filter(s => s.type === 'test')
    .flatMap(s => s.tests.slice(0, 3).map(t => t.replace(/^describe:\s*/, '')));

  const frontmatter = {
    phase: opts.phaseSlug || 'generated',
    plan: opts.planId || '00-01',
    type: 'feature',
    wave: '1',
    depends_on: [],
    files_modified: relPaths,
    autonomous: 'true',
    must_haves: {
      truths: truths.length > 0 ? truths : ['Module exports verified'],
      artifacts: artifacts.length > 0 ? artifacts : [],
    },
    provides: signatures
      .filter(s => s.type !== 'test')
      .flatMap(s => s.exports.slice(0, 3).map(e => `${e}()`)),
    consumes: [],
    implements: [],
  };

  // Build tasks from file groups
  const groups = groupFiles(filePaths);
  const tasks = groups.map((group, idx) => {
    const allFiles = [...group.impl, ...group.test];
    const implSigs = group.impl.map(f => signatures.find(s => s.filePath === f)).filter(Boolean);
    const testSigs = group.test.map(f => signatures.find(s => s.filePath === f)).filter(Boolean);

    const allExports = implSigs.flatMap(s => s.exports);
    const allTests = testSigs.flatMap(s => s.tests);

    const taskName = allFiles.length > 0
      ? `${path.basename(allFiles[0]).replace(/\.(js|cjs|mjs|ts)$/, '')} module`
      : `Task ${idx + 1}`;

    const actionLines = [];
    if (allExports.length > 0) {
      actionLines.push(`Exports: ${allExports.join(', ')}`);
    }
    if (allTests.length > 0) {
      actionLines.push(`Tests: ${allTests.slice(0, 3).join('; ')}`);
    }
    if (actionLines.length === 0) {
      actionLines.push('Implementation file — no exports detected');
    }

    const verifyCmd = testSigs.length > 0
      ? `npm test -- --testPathPattern="${path.basename(group.test[0] || 'test')}" --no-coverage`
      : 'npm test --no-coverage';

    return {
      id: `${opts.planId || '00-01'}-T${idx + 1}`,
      type: 'auto',
      tdd: testSigs.length > 0 ? 'true' : 'false',
      complexity: 'medium',
      name: taskName,
      files: allFiles,
      action: actionLines.join('\n'),
      verify: verifyCmd,
      done: allExports.length > 0
        ? `${allExports[0]}() and related exports verified`
        : `${taskName} verified`,
    };
  });

  return { frontmatter, tasks };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  extractModuleSignature,
  generateReverseSpec,
  detectModuleSystem,
  groupFiles,
};
