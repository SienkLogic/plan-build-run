/**
 * Requirements — Living requirements status updater
 *
 * Reads REQUIREMENTS.md and toggles checkbox status for REQ-IDs
 * based on verification results. Used by phase completion flow
 * when features.living_requirements is enabled.
 */

const fs = require('fs');
const path = require('path');

// Pattern: - [ ] **REQ-ID** or - [x] **REQ-ID** with optional trailing text
const REQ_LINE_PATTERN = /^(\s*-\s*\[)([ x])(\]\s*\*\*)([\w-]+)(\*\*.*)$/;

/**
 * Update requirement checkbox status in REQUIREMENTS.md
 * @param {string} planningDir - Path to .planning directory (or dir containing REQUIREMENTS.md)
 * @param {string[]} reqIds - Array of REQ-IDs to update
 * @param {'done'|'reset'} status - Target status
 * @returns {{ updated: number, skipped: number, notFound: string[] }}
 */
function updateRequirementStatus(planningDir, reqIds, status) {
  const reqPath = path.join(planningDir, 'REQUIREMENTS.md');
  const result = { updated: 0, skipped: 0, notFound: [] };

  if (!fs.existsSync(reqPath)) {
    result.notFound = [...reqIds];
    return result;
  }

  const content = fs.readFileSync(reqPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const targetSet = new Set(reqIds);
  const foundSet = new Set();

  const targetCheck = status === 'done' ? 'x' : ' ';
  const sourceCheck = status === 'done' ? ' ' : 'x';

  const updated = lines.map(line => {
    const m = line.match(REQ_LINE_PATTERN);
    if (!m) return line;

    const reqId = m[4];
    if (!targetSet.has(reqId)) return line;

    foundSet.add(reqId);
    const currentCheck = m[2];

    if (currentCheck === sourceCheck) {
      result.updated++;
      return `${m[1]}${targetCheck}${m[3]}${m[4]}${m[5]}`;
    } else {
      result.skipped++;
      return line;
    }
  });

  for (const id of reqIds) {
    if (!foundSet.has(id)) {
      result.notFound.push(id);
    }
  }

  if (result.updated > 0) {
    fs.writeFileSync(reqPath, updated.join('\n'), 'utf-8');
  }

  return result;
}

/**
 * Get status of all requirements in REQUIREMENTS.md
 * @param {string} planningDir - Path to directory containing REQUIREMENTS.md
 * @returns {Map<string, {checked: boolean, text: string}>}
 */
function getRequirementStatus(planningDir) {
  const reqPath = path.join(planningDir, 'REQUIREMENTS.md');
  const statusMap = new Map();

  if (!fs.existsSync(reqPath)) {
    return statusMap;
  }

  const content = fs.readFileSync(reqPath, 'utf-8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const m = line.match(REQ_LINE_PATTERN);
    if (!m) continue;

    const checked = m[2] === 'x';
    const reqId = m[4];
    // Extract text after **REQ-ID**: or **REQ-ID**:
    const trailing = m[5];
    // trailing looks like "**: description" or "**" or "**: "
    const textMatch = trailing.match(/\*\*:?\s*(.*)/);
    const text = textMatch ? textMatch[1].trim() : '';

    statusMap.set(reqId, { checked, text });
  }

  return statusMap;
}

/**
 * Mark requirements as done for a phase based on its PLAN files and verification status
 * @param {string} planningDir - Path to directory containing REQUIREMENTS.md
 * @param {string} phaseDir - Path to the phase directory
 * @returns {{ updated: number, skipped: number, notFound: string[], skipped_reason?: string }}
 */
function markPhaseRequirements(planningDir, phaseDir) {
  // Check for VERIFICATION.md
  const verifyPath = path.join(phaseDir, 'VERIFICATION.md');
  if (!fs.existsSync(verifyPath)) {
    return { updated: 0, skipped: 0, notFound: [], skipped_reason: 'no verification file' };
  }

  // Check verification status
  const verifyContent = fs.readFileSync(verifyPath, 'utf-8');
  const statusMatch = verifyContent.match(/status:\s*(\w+)/);
  if (!statusMatch || statusMatch[1] !== 'passed') {
    return { updated: 0, skipped: 0, notFound: [], skipped_reason: 'verification not passed' };
  }

  // Collect all implements: REQ-IDs from PLAN-*.md files
  const reqIds = [];
  const files = fs.readdirSync(phaseDir).filter(f => /^PLAN-\d+\.md$/i.test(f));

  for (const file of files) {
    const content = fs.readFileSync(path.join(phaseDir, file), 'utf-8');
    // Extract implements array from frontmatter
    const fmMatch = content.match(/^---\n([\s\S]+?)\n---/);
    if (!fmMatch) continue;

    const fm = fmMatch[1];
    // Find implements: section and collect items
    const implMatch = fm.match(/implements:\s*\n((?:\s+-\s*"?[\w-]+"?\n?)*)/);
    if (!implMatch) continue;

    const items = implMatch[1].matchAll(/\s+-\s*"?([\w-]+)"?/g);
    for (const item of items) {
      reqIds.push(item[1]);
    }
  }

  if (reqIds.length === 0) {
    return { updated: 0, skipped: 0, notFound: [], skipped_reason: 'no implements found' };
  }

  return updateRequirementStatus(planningDir, reqIds, 'done');
}

module.exports = { updateRequirementStatus, getRequirementStatus, markPhaseRequirements };
