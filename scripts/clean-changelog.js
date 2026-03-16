#!/usr/bin/env node

/**
 * Post-processes CHANGELOG.md to clean up PBR internal scopes.
 *
 * Transforms:
 *   * **01-01:** add config schema → * add config schema
 *   * **quick-003:** fix bug → * fix bug
 *   * **hooks:** add logging → * **hooks:** add logging (keeps descriptive scopes)
 *
 * Also removes TDD markers (RED/GREEN/REFACTOR prefixes) and deduplicates
 * entries that differ only by phase-plan scope.
 *
 * Usage:
 *   node scripts/clean-changelog.js                    # dry-run (prints to stdout)
 *   node scripts/clean-changelog.js --write            # modifies CHANGELOG.md in place
 *   node scripts/clean-changelog.js --file RELEASE.md  # process a different file
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Phase-plan scopes: NN-MM, quick-NNN, or bare NN
const INTERNAL_SCOPE_PATTERN = /\*\*(\d{1,2}-\d{1,2}|\d{1,2}|quick-\d{1,3}):\*\*\s*/g;

// TDD markers at start of description
const TDD_MARKER_PATTERN = /^(RED|GREEN|REFACTOR)\s*[-–—]\s*/i;

function cleanChangelog(content) {
  // Normalize line endings to LF for consistent regex matching
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const seen = new Set();
  const result = [];

  for (const line of lines) {
    let cleaned = line;

    // Strip internal scopes (phase-plan numbers) but keep descriptive scopes
    cleaned = cleaned.replace(INTERNAL_SCOPE_PATTERN, '');

    // Remove TDD markers from descriptions
    cleaned = cleaned.replace(/^(\* )(.*)$/, (match, prefix, desc) => {
      return prefix + desc.replace(TDD_MARKER_PATTERN, '');
    });

    // Capitalize first letter after "* " if it's lowercase
    cleaned = cleaned.replace(/^(\* )([a-z])/, (match, prefix, letter) => {
      return prefix + letter.toUpperCase();
    });

    // Deduplicate: if same description appears with different scopes, keep first
    if (cleaned.startsWith('* ')) {
      // Normalize for dedup: lowercase, strip commit hash links
      const normalized = cleaned
        .toLowerCase()
        .replace(/\(\[[a-f0-9]+\]\([^)]+\)\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (seen.has(normalized)) continue;
      seen.add(normalized);
    }

    result.push(cleaned);
  }

  return result.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const writeMode = args.includes('--write');
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx !== -1
    ? args[fileIdx + 1]
    : path.resolve(process.cwd(), 'CHANGELOG.md');

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const cleaned = cleanChangelog(content);

  if (writeMode) {
    fs.writeFileSync(filePath, cleaned, 'utf8');
    console.log(`Cleaned: ${filePath}`);
  } else {
    process.stdout.write(cleaned);
  }
}

module.exports = { cleanChangelog };
if (require.main === module) main();
