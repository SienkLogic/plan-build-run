/**
 * Cross-cutting test: validates all blocking hook denial messages
 * follow the structured 3-part format:
 *   {One-line summary}\n\n{Explanation}\n\n{Remediation}
 *
 * Only checks `decision: 'block'` reason strings (the user-facing denial).
 * Skips logHook reasons, BLOCK_PATTERNS inner reasons, and other non-blocking uses.
 */

const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts');

/**
 * Extract reason strings that are part of `decision: 'block'` objects.
 * Looks for patterns like:
 *   decision: 'block', reason: '...'
 *   decision: 'block',\n  reason: '...'
 *   { decision: 'block', reason: `...` }
 *
 * Returns array of { reason, lineNum } objects.
 */
function extractBlockingReasons(content) {
  const results = [];

  // Pattern 1: reason field in objects that also have decision: 'block'
  // Match reason strings that appear within ~5 lines of decision: 'block'
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line contains decision: 'block' (or "block")
    if (!/decision:\s*['"]block['"]/.test(line)) continue;

    // Look for reason on same line or within next 3 lines
    for (let j = i; j < Math.min(i + 4, lines.length); j++) {
      const reasonMatch = lines[j].match(/reason:\s*([`'])([\s\S]*?)\1/);
      if (reasonMatch) {
        results.push({ reason: reasonMatch[2], lineNum: j + 1 });
        break;
      }

      // Multi-line template literal: reason: `...`
      const templateStart = lines[j].match(/reason:\s*`(.*)/);
      if (templateStart) {
        let reasonStr = templateStart[1];
        for (let k = j + 1; k < lines.length; k++) {
          if (lines[k].includes('`')) {
            reasonStr += '\n' + lines[k].split('`')[0];
            break;
          }
          reasonStr += '\n' + lines[k];
        }
        results.push({ reason: reasonStr, lineNum: j + 1 });
        break;
      }
    }
  }

  // Pattern 2: return { block: true, reason: '...' } (validate-task gate functions)
  for (let i = 0; i < lines.length; i++) {
    if (!/block:\s*true/.test(lines[i])) continue;

    for (let j = i; j < Math.min(i + 4, lines.length); j++) {
      const reasonMatch = lines[j].match(/reason:\s*([`'])([\s\S]*?)\1/);
      if (reasonMatch) {
        // Avoid double-counting if already found via decision: 'block'
        const alreadyFound = results.some(r => r.lineNum === j + 1);
        if (!alreadyFound) {
          results.push({ reason: reasonMatch[2], lineNum: j + 1 });
        }
        break;
      }

      const templateStart = lines[j].match(/reason:\s*`(.*)/);
      if (templateStart) {
        const alreadyFound = results.some(r => r.lineNum === j + 1);
        if (alreadyFound) break;
        let reasonStr = templateStart[1];
        for (let k = j + 1; k < lines.length; k++) {
          if (lines[k].includes('`')) {
            reasonStr += '\n' + lines[k].split('`')[0];
            break;
          }
          reasonStr += '\n' + lines[k];
        }
        results.push({ reason: reasonStr, lineNum: j + 1 });
        break;
      }
    }
  }

  return results;
}

/**
 * Check if a reason string has the 3-part format (at least 2 \n\n separators).
 * Handles both literal \\n\\n in source and actual newlines.
 */
function hasThreePartFormat(reason) {
  // In source code, \n\n appears as literal \\n\\n
  const literalCount = (reason.match(/\\n\\n/g) || []).length;
  // Also check actual newlines (for multi-line template literals)
  const actualCount = (reason.match(/\n\n/g) || []).length;
  return literalCount >= 2 || actualCount >= 2;
}

/**
 * Check if the summary (first part) is under 100 characters.
 */
function summaryUnder100(reason) {
  // Split on first \n\n (literal or actual)
  let summary;
  if (reason.includes('\\n\\n')) {
    summary = reason.split('\\n\\n')[0];
  } else if (reason.includes('\n\n')) {
    summary = reason.split('\n\n')[0];
  } else {
    return true; // Can't check if no separator
  }
  return summary.length <= 100;
}

const SCRIPTS_TO_CHECK = [
  'validate-task.js',
  'check-agent-state-write.js',
  'check-dangerous-commands.js',
  'check-roadmap-sync.js',
  'check-plan-format.js',
];

describe('Structured denial messages', () => {
  const scriptReasons = {};

  beforeAll(() => {
    for (const script of SCRIPTS_TO_CHECK) {
      const content = fs.readFileSync(path.join(SCRIPTS_DIR, script), 'utf8');
      scriptReasons[script] = extractBlockingReasons(content);
    }
  });

  test.each(SCRIPTS_TO_CHECK)('%s has blocking reasons', (script) => {
    const reasons = scriptReasons[script];
    expect(reasons.length).toBeGreaterThan(0);
  });

  test.each(SCRIPTS_TO_CHECK)('%s blocking reasons use 3-part format', (script) => {
    const reasons = scriptReasons[script];
    const failures = [];

    for (const { reason, lineNum } of reasons) {
      if (!hasThreePartFormat(reason)) {
        failures.push(`Line ${lineNum}: ${reason.substring(0, 80)}...`);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `${failures.length} blocking reason(s) in ${script} lack 3-part format (need 2+ \\n\\n separators):\n` +
        failures.join('\n')
      );
    }
  });

  test.each(SCRIPTS_TO_CHECK)('%s blocking reason summaries are under 100 chars', (script) => {
    const reasons = scriptReasons[script];
    const failures = [];

    for (const { reason, lineNum } of reasons) {
      if (!summaryUnder100(reason)) {
        const summary = reason.split(/\\n\\n|\n\n/)[0];
        failures.push(`Line ${lineNum} (${summary.length} chars): ${summary}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `${failures.length} blocking reason(s) in ${script} have summaries over 100 chars:\n` +
        failures.join('\n')
      );
    }
  });
});
