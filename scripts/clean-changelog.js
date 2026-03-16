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

// Keyword → scope mapping for entries that lost their scope after stripping phase numbers.
// Order matters: first match wins. More specific patterns come first.
const SCOPE_INFERENCE_RULES = [
  [/\bhook[s]?\b|\bPostToolUse\b|\bPreToolUse\b|\bSessionStart\b|\bdispatch\b/i, 'hooks'],
  [/\bagent[s]?\b|\bsubagent\b|\bcheckpoint\b|\bspawn/i, 'agents'],
  [/\bconfig\b|\bprofile[s]?\b|\bsetting[s]?\b|\bdepth\b|\bmodel profile/i, 'config'],
  [/\bskill[s]?\b|\bSKILL\.md\b|\bfrontmatter\b|\ballowed-tools/i, 'skills'],
  [/\bdashboard\b|\bVite\b|\bReact\b|\bWebSocket/i, 'dashboard'],
  [/\btest[s]?\b|\bcoverage\b|\bfixture[s]?\b|\bjest\b|\bvitest/i, 'tests'],
  [/\binstall\b|\bnpx\b|\bsetup\.sh\b|\buninstall/i, 'install'],
  [/\bCLI\b|\bpbr-tools\b|\bgsd-tools\b|\bcommand extraction/i, 'cli'],
  [/\bgraph\b|\bSQLite\b|\bentit(?:y|ies)\b|\bintel/i, 'intel'],
  [/\bcontext\b|\bbudget\b|\bcompact\b|\btoken[s]?\b|\b1M\b|\bscale\b|\bthreshold/i, 'context'],
  [/\bverif(?:y|ication)\b|\bVERIFICATION\.md/i, 'verification'],
  [/\bplan(?:ner)?\b|\bPLAN\.md\b|\bwave[s]?\b|\bexecut/i, 'workflow'],
  [/\bresearch\b|\bsynthesize/i, 'research'],
  [/\bgit\b|\bbranch\b|\bcommit\b|\btag\b|\bsquash/i, 'git'],
  [/\bREADME\b|\bdoc[s]?\b|\bchangelog\b|\bCONTRIBUTING/i, 'docs'],
  [/\bcodex\b/i, 'codex'],
  [/\bcopilot\b/i, 'copilot'],
  [/\bcursor\b/i, 'cursor'],
  [/\bopencode\b|\bgemini\b/i, 'platforms'],
  [/\bmilestone\b|\broadmap\b|\barchive/i, 'milestone'],
  [/\bstatus\s*line\b|\bstatusline/i, 'statusline'],
  [/\blearning[s]?\b/i, 'learnings'],
];

// GSD → PBR rebranding: scopes, commands, paths, tool names
const GSD_REPLACEMENTS = [
  // Bold scopes: **gsd-tools:** → **pbr-tools:**
  [/\*\*gsd-/g, '**pbr-'],
  // Bold scopes: **gsd:** → **pbr:**
  [/\*\*gsd:\*\*/g, '**pbr:**'],
  // Slash commands: /gsd: → /pbr:
  [/\/gsd:/g, '/pbr:'],
  // Tool names: gsd-tools → pbr-tools
  [/\bgsd-tools\b/g, 'pbr-tools'],
  // Config paths: ~/.gsd/ → ~/.claude/
  [/~\/\.gsd\//g, '~/.claude/'],
  // Agent/tool names: gsd-{name} → pbr-{name} (broad catch for all gsd- prefixed names)
  [/\bgsd-(?=[a-z])/g, 'pbr-'],
  // Generic "GSD" in descriptive text (but not in URLs or commit hashes)
  [/\bGSD\b(?![^(]*\))/g, 'PBR'],
];

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

    // Rebrand GSD references to PBR
    for (const [pattern, replacement] of GSD_REPLACEMENTS) {
      cleaned = cleaned.replace(pattern, replacement);
    }

    // Remove TDD markers from descriptions
    cleaned = cleaned.replace(/^(\* )(.*)$/, (match, prefix, desc) => {
      return prefix + desc.replace(TDD_MARKER_PATTERN, '');
    });

    // Infer scope for entries that have none (after phase-number stripping)
    if (/^\* [^*]/.test(cleaned) && !/^\* \*\*/.test(cleaned)) {
      for (const [pattern, scope] of SCOPE_INFERENCE_RULES) {
        if (pattern.test(cleaned)) {
          cleaned = cleaned.replace(/^\* /, `* **${scope}:** `);
          break;
        }
      }
    }

    // Capitalize first letter after "* " or "* **scope:** " if it's lowercase
    cleaned = cleaned.replace(/^(\* (?:\*\*[^*]+:\*\* )?)([a-z])/, (match, prefix, letter) => {
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
