'use strict';

const fs = require('fs');
const path = require('path');

const SCAN_ROOTS = ['src', 'lib', 'plugins', 'tests', 'hooks', 'scripts'];
const MAX_FILES = 50;
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', 'coverage', '.planning'];
const CODE_EXTS = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'];
const MIN_OCCURRENCES = 3;

/**
 * Scan directories for code files, returning up to maxFiles file paths.
 */
function scanFiles(projectRoot, roots, maxFiles) {
  const files = [];

  function walk(dir, depth) {
    if (files.length >= maxFiles || depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      if (SKIP_DIRS.includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (CODE_EXTS.includes(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  for (const root of roots) {
    const rootPath = path.join(projectRoot, root);
    if (fs.existsSync(rootPath)) {
      walk(rootPath, 0);
    }
  }

  // Also scan project root level files
  try {
    const topEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
    for (const entry of topEntries) {
      if (files.length >= maxFiles) break;
      if (!entry.isDirectory() && CODE_EXTS.includes(path.extname(entry.name).toLowerCase())) {
        files.push(path.join(projectRoot, entry.name));
      }
    }
  } catch (_e) { /* ignore */ }

  return files.slice(0, maxFiles);
}

/**
 * Detect naming conventions from file contents.
 */
function detectNaming(contents) {
  const signals = { camelCase: [], PascalCase: [], snake_case: [] };

  // Match function declarations and const arrow functions
  const funcRegex = /(?:function\s+|const\s+|let\s+|var\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=\s*(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>|\()/g;
  // Match class declarations
  const classRegex = /class\s+([A-Z][a-zA-Z0-9]*)/g;

  for (const { content, filePath } of contents) {
    let match;

    funcRegex.lastIndex = 0;
    while ((match = funcRegex.exec(content)) !== null) {
      const name = match[1];
      if (/^[a-z][a-zA-Z0-9]*$/.test(name) && name.length > 2 && /[A-Z]/.test(name)) {
        signals.camelCase.push(name);
      } else if (/^[a-z]+_[a-z]/.test(name)) {
        signals.snake_case.push(name);
      }
    }

    classRegex.lastIndex = 0;
    while ((match = classRegex.exec(content)) !== null) {
      signals.PascalCase.push(match[1]);
    }
  }

  const patterns = [];
  if (signals.camelCase.length >= MIN_OCCURRENCES) {
    patterns.push({
      pattern: 'camelCase functions',
      evidence: signals.camelCase.slice(0, 5),
      count: signals.camelCase.length,
    });
  }
  if (signals.PascalCase.length >= MIN_OCCURRENCES) {
    patterns.push({
      pattern: 'PascalCase classes',
      evidence: signals.PascalCase.slice(0, 5),
      count: signals.PascalCase.length,
    });
  }
  if (signals.snake_case.length >= MIN_OCCURRENCES) {
    patterns.push({
      pattern: 'snake_case variables',
      evidence: signals.snake_case.slice(0, 5),
      count: signals.snake_case.length,
    });
  }

  return patterns;
}

/**
 * Detect testing structure patterns.
 */
function detectTesting(projectRoot) {
  const testsDir = path.join(projectRoot, 'tests');
  const testDir = path.join(projectRoot, 'test');
  const srcDir = path.join(projectRoot, 'src');
  const libDir = path.join(projectRoot, 'lib');

  const patterns = [];
  const activeTestDir = fs.existsSync(testsDir) ? testsDir : (fs.existsSync(testDir) ? testDir : null);
  const activeSrcDir = fs.existsSync(srcDir) ? srcDir : (fs.existsSync(libDir) ? libDir : null);

  if (activeTestDir && activeSrcDir) {
    let testFiles;
    try {
      testFiles = fs.readdirSync(activeTestDir).filter(f => /\.test\.[jt]sx?$/.test(f));
    } catch (_e) {
      testFiles = [];
    }

    let srcFiles;
    try {
      srcFiles = fs.readdirSync(activeSrcDir).filter(f => CODE_EXTS.includes(path.extname(f)));
    } catch (_e) {
      srcFiles = [];
    }

    const mirrors = [];
    for (const tf of testFiles) {
      const base = tf.replace(/\.test\.[jt]sx?$/, '');
      const srcMatch = srcFiles.find(sf => sf.replace(/\.[jt]sx?$/, '') === base);
      if (srcMatch) {
        mirrors.push(`${tf} <-> ${srcMatch}`);
      }
    }

    if (mirrors.length >= MIN_OCCURRENCES) {
      patterns.push({
        pattern: 'tests/ mirrors src/ structure',
        evidence: mirrors.slice(0, 5),
        count: mirrors.length,
      });
    }
  }

  return patterns;
}

/**
 * Detect import patterns.
 */
function detectImports(contents) {
  const signals = { cjs: [], esm: [] };

  for (const { content, _filePath } of contents) {
    const requireMatches = content.match(/(?:const|let|var)\s+\w+\s*=\s*require\s*\(/g);
    if (requireMatches) {
      signals.cjs.push(...requireMatches.map(m => m.trim()));
    }
    const esmMatches = content.match(/^import\s+/gm);
    if (esmMatches) {
      signals.esm.push(...esmMatches.map(m => m.trim()));
    }
  }

  const patterns = [];
  if (signals.cjs.length >= MIN_OCCURRENCES) {
    patterns.push({
      pattern: 'CommonJS require',
      evidence: signals.cjs.slice(0, 5),
      count: signals.cjs.length,
    });
  }
  if (signals.esm.length >= MIN_OCCURRENCES) {
    patterns.push({
      pattern: 'ES module import',
      evidence: signals.esm.slice(0, 5),
      count: signals.esm.length,
    });
  }

  return patterns;
}

/**
 * Detect error handling patterns.
 */
function detectErrorHandling(contents) {
  const signals = { tryCatch: 0, errorFirst: 0 };

  for (const { content } of contents) {
    const tryCatches = (content.match(/try\s*\{/g) || []).length;
    signals.tryCatch += tryCatches;

    const errorFirst = (content.match(/function\s*\w*\s*\(\s*err(?:or)?\s*[,)]/g) || []).length;
    signals.errorFirst += errorFirst;
  }

  const patterns = [];
  if (signals.tryCatch >= MIN_OCCURRENCES) {
    patterns.push({
      pattern: 'try/catch blocks',
      evidence: [`${signals.tryCatch} occurrences across files`],
      count: signals.tryCatch,
    });
  }
  if (signals.errorFirst >= MIN_OCCURRENCES) {
    patterns.push({
      pattern: 'error-first callbacks',
      evidence: [`${signals.errorFirst} occurrences across files`],
      count: signals.errorFirst,
    });
  }

  return patterns;
}

/**
 * Detect export patterns.
 */
function detectExports(contents) {
  const signals = { moduleExports: 0, exportDefault: 0 };

  for (const { content } of contents) {
    const me = (content.match(/module\.exports\s*=/g) || []).length;
    signals.moduleExports += me;
    const ed = (content.match(/export\s+default/g) || []).length;
    signals.exportDefault += ed;
  }

  const patterns = [];
  if (signals.moduleExports >= MIN_OCCURRENCES) {
    patterns.push({
      pattern: 'module.exports (CommonJS)',
      evidence: [`${signals.moduleExports} files use module.exports`],
      count: signals.moduleExports,
    });
  }
  if (signals.exportDefault >= MIN_OCCURRENCES) {
    patterns.push({
      pattern: 'export default (ESM)',
      evidence: [`${signals.exportDefault} files use export default`],
      count: signals.exportDefault,
    });
  }

  return patterns;
}

/**
 * Detect conventions from a project root directory.
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {{ naming: Array, testing: Array, imports: Array, error_handling: Array, exports: Array }}
 */
function detectConventions(projectRoot) {
  const filePaths = scanFiles(projectRoot, SCAN_ROOTS, MAX_FILES);

  const contents = [];
  for (const fp of filePaths) {
    try {
      const content = fs.readFileSync(fp, 'utf8');
      contents.push({ content, filePath: fp });
    } catch (_e) { /* skip unreadable */ }
  }

  return {
    naming: detectNaming(contents),
    testing: detectTesting(projectRoot),
    imports: detectImports(contents),
    error_handling: detectErrorHandling(contents),
    exports: detectExports(contents),
  };
}

/**
 * Write conventions to .planning/conventions/ as markdown files.
 * @param {string} planningDir - Absolute path to .planning directory
 * @param {object} conventions - Output from detectConventions
 */
function writeConventions(planningDir, conventions) {
  const convDir = path.join(planningDir, 'conventions');
  fs.mkdirSync(convDir, { recursive: true });

  const now = new Date().toISOString();
  const categories = ['naming', 'testing', 'imports', 'error_handling', 'exports'];

  for (const cat of categories) {
    const patterns = conventions[cat] || [];
    const fileName = cat === 'error_handling' ? 'error-handling.md' : `${cat}.md`;
    const lines = [
      '---',
      `detected: "${now}"`,
      `count: ${patterns.length}`,
      '---',
      '',
      `# ${cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Conventions`,
      '',
    ];

    if (patterns.length === 0) {
      lines.push('No patterns detected.');
    } else {
      for (const p of patterns) {
        lines.push(`## ${p.pattern}`);
        lines.push('');
        lines.push(`Occurrences: ${p.count}`);
        lines.push('');
        lines.push('Evidence:');
        for (const e of p.evidence) {
          lines.push(`- ${e}`);
        }
        lines.push('');
      }
    }

    fs.writeFileSync(path.join(convDir, fileName), lines.join('\n'));
  }
}

/**
 * Load conventions from .planning/conventions/.
 * @param {string} planningDir - Absolute path to .planning directory
 * @returns {object} Keyed by filename stem, values are { frontmatter, body }
 */
function loadConventions(planningDir) {
  const convDir = path.join(planningDir, 'conventions');
  if (!fs.existsSync(convDir)) {
    return {};
  }

  const result = {};
  let files;
  try {
    files = fs.readdirSync(convDir).filter(f => f.endsWith('.md'));
  } catch (_e) {
    return {};
  }

  for (const file of files) {
    const content = fs.readFileSync(path.join(convDir, file), 'utf8');
    const stem = file.replace(/\.md$/, '');

    // Parse frontmatter
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (fmMatch) {
      const frontmatter = {};
      for (const line of fmMatch[1].split(/\r?\n/)) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim();
          const val = line.slice(colonIdx + 1).trim().replace(/^"|"$/g, '');
          frontmatter[key] = val;
        }
      }
      result[stem] = { frontmatter, body: fmMatch[2].trim() };
    } else {
      result[stem] = { frontmatter: {}, body: content.trim() };
    }
  }

  return result;
}

module.exports = { detectConventions, writeConventions, loadConventions, scanFiles };
