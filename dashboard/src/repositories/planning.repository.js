import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, relative, normalize } from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ gfm: true, breaks: false });

/**
 * Strip UTF-8 BOM (Byte Order Mark) if present.
 * Windows editors (Notepad, older VS Code) may prepend BOM to UTF-8 files.
 * gray-matter will fail to detect frontmatter delimiters if BOM is present.
 * @param {string} content - Raw file content
 * @returns {string} Content without BOM
 */
function stripBOM(content) {
  return content.replace(/^\uFEFF/, '');
}

/**
 * Validate that a resolved path stays within the base directory.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 *
 * @param {string} basePath - Absolute base directory path
 * @param {string} userPath - User-provided path (may be relative)
 * @returns {string} Validated absolute path
 * @throws {Error} With status 403 if path escapes base directory
 */
export function validatePath(basePath, userPath) {
  const resolvedBase = normalize(resolve(basePath));
  const resolvedUser = normalize(resolve(basePath, userPath));

  // Compute the relative path from base to target
  const rel = relative(resolvedBase, resolvedUser);

  // If relative path starts with '..' it escaped the base directory.
  // If rel resolves to an absolute path, it was an absolute path injection.
  if (rel.startsWith('..') || resolve(rel) === rel) {
    const err = new Error('Path traversal attempt detected');
    err.status = 403;
    err.code = 'PATH_TRAVERSAL';
    throw err;
  }

  return resolvedUser;
}

/**
 * Read and parse a single markdown file with YAML frontmatter.
 *
 * @param {string} filePath - Absolute path to the markdown file
 * @returns {Promise<{frontmatter: object, html: string, rawContent: string}>}
 * @throws {Error} ENOENT if file does not exist, parse error if YAML is malformed
 */
export async function readMarkdownFile(filePath) {
  const fileContent = await readFile(filePath, 'utf-8');
  const cleanContent = stripBOM(fileContent);

  let data, content;
  try {
    ({ data, content } = matter(cleanContent, {
      engines: {
        javascript: false
      }
    }));
  } catch (error) {
    // gray-matter throws YAMLException for malformed frontmatter.
    // Wrap it in a user-friendly error with status 400.
    if (error.name === 'YAMLException' || (error.constructor && error.constructor.name === 'YAMLException')) {
      const wrapped = new Error(`Invalid YAML frontmatter in ${filePath}: ${error.message}`);
      wrapped.status = 400;
      wrapped.cause = error;
      throw wrapped;
    }
    throw error;
  }

  const html = marked.parse(content);

  const sanitizedHtml = sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'img', 'details', 'summary', 'del', 'ins',
      'sup', 'sub', 'abbr', 'kbd', 'mark'
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      'a': ['href', 'name', 'target', 'rel'],
      'img': ['src', 'alt', 'title', 'width', 'height'],
      'code': ['class'],
      'pre': ['class'],
      'span': ['class'],
      'div': ['class'],
      'td': ['align'],
      'th': ['align', 'scope'],
      'h1': ['id'], 'h2': ['id'], 'h3': ['id'],
      'h4': ['id'], 'h5': ['id'], 'h6': ['id']
    }
  });

  return {
    frontmatter: data,
    html: sanitizedHtml,
    rawContent: content
  };
}

/**
 * Read and parse multiple markdown files in parallel (fail-fast).
 * If any file fails, the entire operation rejects immediately.
 *
 * @param {string[]} filePaths - Array of absolute file paths
 * @returns {Promise<Array<{frontmatter: object, html: string, rawContent: string}>>}
 */
export async function readMarkdownFiles(filePaths) {
  return Promise.all(
    filePaths.map(filePath => readMarkdownFile(filePath))
  );
}

/**
 * Read and parse multiple markdown files with partial failure tolerance.
 * All reads complete even if some fail. Returns settled results.
 *
 * @param {string[]} filePaths - Array of absolute file paths
 * @returns {Promise<Array<{status: 'fulfilled', value: object} | {status: 'rejected', reason: Error}>>}
 */
export async function readMarkdownFilesSettled(filePaths) {
  return Promise.allSettled(
    filePaths.map(filePath => readMarkdownFile(filePath))
  );
}

/**
 * List all markdown files under the .planning/ directory recursively.
 * Uses native fs.readdir with recursive option (Node.js 18.17+).
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<string[]>} Array of absolute file paths to .md files
 * @throws {Error} ENOENT if .planning/ directory does not exist
 */
export async function listPlanningFiles(projectDir) {
  const planningDir = join(projectDir, '.planning');
  const entries = await readdir(planningDir, {
    recursive: true,
    withFileTypes: true
  });

  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => join(entry.parentPath || entry.path, entry.name));
}
