/**
 * Strip UTF-8 BOM (Byte Order Mark) if present.
 * @param {string} content
 * @returns {string}
 */
export function stripBOM(content) {
  return content.replace(/^\uFEFF/, '');
}
