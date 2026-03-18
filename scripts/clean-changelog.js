#!/usr/bin/env node

/**
 * Changelog generator for Plan-Build-Run.
 *
 * Generates CHANGELOG.md grouped by component (Hooks, Skills, Agents, CLI, etc.)
 * instead of flat lists under commit types.
 *
 * Features:
 *   - Groups entries by component scope or keyword detection
 *   - Strips internal phase-plan scopes (01-01, 03-02) from output
 *   - Removes TDD markers (RED/GREEN/REFACTOR prefixes)
 *   - Deduplicates entries that differ only by scope
 *   - Rebrands GSD references to PBR
 *   - Drops entries for removed features
 *
 * Usage:
 *   node scripts/clean-changelog.js                    # generate full CHANGELOG.md to stdout
 *   node scripts/clean-changelog.js --write            # write CHANGELOG.md in place
 *   node scripts/clean-changelog.js --latest           # show only latest version
 *   node scripts/clean-changelog.js --post-process     # clean an existing CHANGELOG.md (legacy mode)
 *
 * Also exported as cleanChangelog() for programmatic use.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Component Detection ────────────────────────────────────────────────────

// Explicit scope → component mapping (new-style scopes)
const SCOPE_TO_COMPONENT = {
  hooks: 'Hooks',
  skills: 'Skills',
  agents: 'Agents',
  cli: 'CLI Tools',
  dashboard: 'Dashboard',
  templates: 'Templates',
  plugin: 'Plugin',
  config: 'Configuration',
  ci: 'CI/CD',
  tests: 'Testing',
  commands: 'Plugin',
  refs: 'Documentation',
  changelog: 'CI/CD',
  release: 'CI/CD',
};

// Keyword → component mapping for commits without explicit component scopes
// Order matters: first match wins. More specific patterns come first.
const KEYWORD_RULES = [
  [/\bhook[s]?\b|\bPostToolUse\b|\bPreToolUse\b|\bSessionStart\b|\bdispatch\b|\bhook-logger\b|\bevent-handler\b|\bsession-cleanup\b|\bprogress-tracker\b|\bcheck-plan-format\b|\bcheck-state\b|\bcheck-subagent\b|\btrack-context\b|\bsuggest-compact\b|\bauto-continue\b|\bpre-bash\b|\bpre-write\b|\bpost-write\b|\bvalidate-task\b|\bvalidate-commit\b|\bresolve-root\b|\bsession-tracker/i, 'Hooks'],
  [/\bagent[s]?\b|\bsubagent\b|\bexecutor\b|\bplanner\b|\bverifier\b|\bresearcher\b|\bplan-checker\b|\bcodebase-mapper\b|\bsynthesizer\b|\bintel-updater\b|\bcheckpoint\b.*\bagent/i, 'Agents'],
  [/\bskill[s]?\b|\bSKILL\.md\b/i, 'Skills'],
  [/\bpbr-tools\b|\bstatePhaseComplete\b|\bstateRederive\b|\bconfigLoad\b|\bstateLoad\b|\bfrontmatter\b|\blockedFileUpdate\b|\binitResume\b|\bdetectDrift\b|\bclassify-artifact\b|\blearnings\b|\bnegative-knowledge\b|\bverify\.cjs\b|\bstate\.cjs\b|\binit\.cjs\b|\bconfig\.cjs\b|\bspec /i, 'CLI Tools'],
  [/\bdashboard\b|\brecharts\b|\bvite\b|\bchokidar/i, 'Dashboard'],
  [/\btemplate\b|\btmpl\b|\b\.tmpl\b/i, 'Templates'],
  [/\bconfig-schema\b|\bconfig\.json\b|\bdepth_profiles\b|\bmodel_profiles\b|\bmodel profile/i, 'Configuration'],
  [/\bplugin\.json\b|\bCLAUDE\.md\b|\bcommands\/\b|\breferences\/\b/i, 'Plugin'],
  [/\bci\b.*\bjob\b|\bworkflow\b|\bgithub action\b|\bcoverage\b|\blint\b|\bmarkdownlint\b|\beslint\b|\bCI\b/i, 'CI/CD'],
  [/\btest[s]?\b|\bfixture[s]?\b|\bjest\b|\bvitest/i, 'Testing'],
  [/\bcontext\b.*\b(?:budget|quality|scoring|ledger)\b|\bcompact\b|\btoken[s]?\b|\b1M\b|\bscale\b|\bthreshold/i, 'Context Management'],
];

// Phase-plan scope pattern (internal, should be stripped)
const PHASE_PLAN_SCOPE = /^\d{1,2}-\d{1,2}$/;

// TDD markers at start of description
const TDD_MARKER_PATTERN = /^(RED|GREEN|REFACTOR)\s*[-–—]\s*/i;

// Conventional commit parsing
const COMMIT_REGEX = /^([a-f0-9]+)\s+(feat|fix|refactor|test|docs|chore|wip|revert|perf|ci|build)(\([^)]*\))?!?:\s+(.+)/;

// Types that appear in changelog (others are hidden)
const VISIBLE_TYPES = new Set(['feat', 'fix', 'revert', 'perf']);

// Features removed from PBR v2 — entries matching these are dropped
const DEAD_FEATURE_PATTERNS = [
  /\bintel-index\b/i,
  /\bgraph\s*database\b|\bsql\.js\b|\bSQLite\s*graph\b/i,
  /\bquery-intel\b|\banalyze-codebase\b/i,
  /\bentity-generator\b|\bpbr-indexer\b|\bgsd-indexer\b/i,
  /\bintel\s*directory\b|\bintel\s*hooks?\b/i,
  /\bgraph\s*query\b|\bgraph-backed\b|\bgraph\s*summary\b/i,
  /\bsync\s*entity\s*files\b/i,
  /\bsemantic\s*entity\b/i,
  /\bcodebase\s*intel(?:ligence)?\b/i,
  /\bintel\s*injection\b/i,
  /\bconvention\s*detection\b/i,
  /\bMistral\s*Vibe\b|\bvibe\s*CLI\b/i,
  /\bAntigravity\b/i,
  /\bJules\b/i,
  /\/pbr:add-tests\b|\/gsd:add-tests\b|\badd-tests\b.*command\b/i,
  /\bBrave\s*Search\b/i,
  /\bcross-project\s*knowledge\b|\bPBR\s*Memory\s*cross/i,
  /\bDiscord\s*invite\s*link\s*in\s*install\b/i,
  /\bPBR\s*logo\s*for\s*Moonshot\b|\bGSD\s*logo\b/i,
  /\bpbr-gemini\s*link\b|\bgsd-gemini\s*link\b/i,
];

// GSD → PBR rebranding
const GSD_REPLACEMENTS = [
  [/\/gsd:/g, '/pbr:'],
  [/\bgsd-tools\b/g, 'pbr-tools'],
  [/~\/\.gsd\//g, '~/.claude/'],
  [/\bgsd-(?=[a-z])/g, 'pbr-'],
  [/\bGSD\b(?![^(]*\))/g, 'PBR'],
];

// ─── Core Logic ─────────────────────────────────────────────────────────────

function detectComponent(scope, description) {
  // 1. Check explicit scope mapping
  if (scope && SCOPE_TO_COMPONENT[scope.toLowerCase()]) {
    return SCOPE_TO_COMPONENT[scope.toLowerCase()];
  }

  // 2. Skip phase-plan scopes for mapping (fall through to keywords)
  // 3. Check keyword rules against description
  for (const [pattern, component] of KEYWORD_RULES) {
    if (pattern.test(description)) {
      return component;
    }
  }

  return 'Other';
}

function cleanDescription(desc) {
  let cleaned = desc;

  // Remove TDD markers
  cleaned = cleaned.replace(TDD_MARKER_PATTERN, '');

  // Rebrand GSD
  for (const [pattern, replacement] of GSD_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // Capitalize first letter
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  return cleaned;
}

function getVersionTags() {
  try {
    const tags = execSync('git tag -l "plan-build-run-v*" --sort=-version:refname', {
      encoding: 'utf8',
      cwd: process.cwd(),
    }).trim().split('\n').filter(Boolean);
    return tags;
  } catch (_e) {
    return [];
  }
}

function getCommitsBetween(from, to) {
  const range = from ? `${from}..${to}` : to;
  try {
    const log = execSync(`git log --oneline --no-merges ${range}`, {
      encoding: 'utf8',
      cwd: process.cwd(),
    }).trim();
    return log ? log.split('\n') : [];
  } catch (_e) {
    return [];
  }
}

function getTagDate(tag) {
  try {
    return execSync(`git log -1 --format=%ai ${tag}`, {
      encoding: 'utf8',
      cwd: process.cwd(),
    }).trim().slice(0, 10);
  } catch (_e) {
    return new Date().toISOString().slice(0, 10);
  }
}

function parseCommit(line) {
  const m = line.match(COMMIT_REGEX);
  if (!m) return null;

  const [, hash, type, scopeRaw, description] = m;
  const scope = scopeRaw ? scopeRaw.slice(1, -1) : '';

  return { hash, type, scope, description };
}

function generateVersionSection(version, fromTag, toTag, repo) {
  const commits = getCommitsBetween(fromTag, toTag);
  if (commits.length === 0) return '';

  const date = getTagDate(toTag);
  const versionNum = version.replace('plan-build-run-v', '');
  const compare = fromTag
    ? `${repo}/compare/${fromTag}...${version}`
    : `${repo}/commits/${version}`;

  // Group commits by component
  const groups = {};
  const seen = new Set();

  for (const line of commits) {
    const parsed = parseCommit(line);
    if (!parsed) continue;
    if (!VISIBLE_TYPES.has(parsed.type)) continue;

    // Skip dead features
    if (DEAD_FEATURE_PATTERNS.some(p => p.test(parsed.description))) continue;

    const component = detectComponent(parsed.scope, parsed.description);
    const desc = cleanDescription(parsed.description);

    // Deduplicate by normalized description
    const normalized = desc.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (!groups[component]) groups[component] = [];
    groups[component].push({ desc, hash: parsed.hash, type: parsed.type });
  }

  if (Object.keys(groups).length === 0) return '';

  // Build section
  let section = `## [${versionNum}](${compare}) — ${date}\n\n`;

  // Sort component groups: alphabetical, but "Other" last
  const sortedComponents = Object.keys(groups).sort((a, b) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });

  for (const component of sortedComponents) {
    section += `### ${component}\n\n`;
    for (const { desc, hash } of groups[component]) {
      section += `* ${desc} ([${hash.slice(0, 8)}](${repo}/commit/${hash}))\n`;
    }
    section += '\n';
  }

  return section;
}

function generateChangelog() {
  const repo = 'https://github.com/SienkLogic/plan-build-run';
  const tags = getVersionTags();

  let changelog = `# Changelog\n\nAll notable changes to Plan-Build-Run will be documented in this file.\n\n`;

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    const prevTag = i + 1 < tags.length ? tags[i + 1] : null;
    const section = generateVersionSection(tag, prevTag, tag, repo);
    if (section) changelog += section;
  }

  return changelog;
}

// ─── Legacy: Post-process existing CHANGELOG.md ─────────────────────────────

function cleanChangelog(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const seen = new Set();
  const result = [];

  const INTERNAL_SCOPE_PATTERN = /\*\*(\d{1,2}-\d{1,2}|\d{1,2}|quick-\d{1,3}):\*\*\s*/g;

  for (const line of lines) {
    let cleaned = line;

    if (cleaned.startsWith('* ') && DEAD_FEATURE_PATTERNS.some(p => p.test(cleaned))) {
      continue;
    }

    cleaned = cleaned.replace(INTERNAL_SCOPE_PATTERN, '');

    for (const [pattern, replacement] of GSD_REPLACEMENTS) {
      cleaned = cleaned.replace(pattern, replacement);
    }

    cleaned = cleaned.replace(/^(\* )(.*)$/, (_match, prefix, desc) => {
      return prefix + desc.replace(TDD_MARKER_PATTERN, '');
    });

    if (/^\* [^*]/.test(cleaned) && !/^\* \*\*/.test(cleaned)) {
      for (const [pattern, component] of KEYWORD_RULES) {
        if (pattern.test(cleaned)) {
          const scope = Object.entries(SCOPE_TO_COMPONENT)
            .find(([, v]) => v === component)?.[0] || component.toLowerCase();
          cleaned = cleaned.replace(/^\* /, `* **${scope}:** `);
          break;
        }
      }
    }

    cleaned = cleaned.replace(/^(\* (?:\*\*[^*]+:\*\* )?)([a-z])/, (_match, prefix, letter) => {
      return prefix + letter.toUpperCase();
    });

    if (cleaned.startsWith('* ')) {
      const norm = cleaned.toLowerCase().replace(/\(\[[a-f0-9]+\]\([^)]+\)\)/g, '').replace(/\s+/g, ' ').trim();
      if (seen.has(norm)) continue;
      seen.add(norm);
    }

    result.push(cleaned);
  }

  return result.join('\n');
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const writeMode = args.includes('--write');
  const latestOnly = args.includes('--latest');
  const postProcess = args.includes('--post-process');

  if (postProcess) {
    // Legacy: clean an existing CHANGELOG.md
    const fileIdx = args.indexOf('--file');
    const filePath = fileIdx !== -1 ? args[fileIdx + 1] : path.resolve(process.cwd(), 'CHANGELOG.md');
    if (!fs.existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1); }
    const content = fs.readFileSync(filePath, 'utf8');
    const cleaned = cleanChangelog(content);
    if (writeMode) { fs.writeFileSync(filePath, cleaned, 'utf8'); console.log(`Cleaned: ${filePath}`); }
    else { process.stdout.write(cleaned); }
    return;
  }

  if (latestOnly) {
    const repo = 'https://github.com/SienkLogic/plan-build-run';
    const tags = getVersionTags();
    if (tags.length === 0) { console.log('No tags found.'); return; }
    const section = generateVersionSection(tags[0], tags[1] || null, tags[0], repo);
    process.stdout.write(section || 'No visible changes.\n');
    return;
  }

  // Full changelog generation
  const changelog = generateChangelog();
  if (writeMode) {
    fs.writeFileSync(path.resolve(process.cwd(), 'CHANGELOG.md'), changelog, 'utf8');
    console.log('Generated: CHANGELOG.md');
  } else {
    process.stdout.write(changelog);
  }
}

module.exports = { cleanChangelog, generateChangelog, detectComponent, cleanDescription };
if (require.main === module) main();
