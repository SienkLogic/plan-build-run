#!/usr/bin/env node

/**
 * Release script for Plan-Build-Run.
 * Replaces release-please with a simpler flow:
 *   1. Calculate next version from conventional commits (via git-cliff)
 *   2. Update package.json + 3 plugin.json manifests
 *   3. Generate CHANGELOG.md via git-cliff
 *   4. Commit, tag, push
 *   5. Create GitHub Release
 *
 * Usage:
 *   node scripts/release.js              # auto-detect version bump
 *   node scripts/release.js --minor      # force minor bump
 *   node scripts/release.js --major      # force major bump
 *   node scripts/release.js --patch      # force patch bump
 *   node scripts/release.js --dry-run    # show what would happen
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_FILES = [
  'plugins/pbr/.claude-plugin/plugin.json',
  'plugins/cursor-pbr/.cursor-plugin/plugin.json',
  'plugins/copilot-pbr/plugin.json',
];

function run(cmd, opts = {}) {
  const result = execSync(cmd, { encoding: 'utf8', cwd: ROOT, ...opts });
  return result.trim();
}

function getCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

function getNextVersion(forceLevel) {
  if (forceLevel) {
    const [major, minor, patch] = getCurrentVersion().split('.').map(Number);
    if (forceLevel === 'major') return `${major + 1}.0.0`;
    if (forceLevel === 'minor') return `${major}.${minor + 1}.0`;
    return `${major}.${minor}.${patch + 1}`;
  }

  // Use git-cliff to calculate next version from conventional commits
  try {
    const bumped = run('npx git-cliff --bumped-version 2>/dev/null').replace(/^v/, '');
    if (bumped && bumped !== getCurrentVersion()) return bumped;
  } catch (_e) {
    // Fallback: check commit types since last tag
  }

  // Fallback: scan commits since last tag
  const lastTag = run('git describe --tags --abbrev=0 2>/dev/null || echo ""');
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const log = run(`git log --oneline --no-merges ${range}`);

  if (!log) {
    console.error('No commits since last release. Nothing to do.');
    process.exit(0);
  }

  const hasBreaking = log.includes('!:');
  const hasFeat = /^[a-f0-9]+ feat/m.test(log);

  const [major, minor, patch] = getCurrentVersion().split('.').map(Number);
  if (hasBreaking) return `${major + 1}.0.0`;
  if (hasFeat) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function updateVersion(newVersion) {
  // Update package.json
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  package.json → ${newVersion}`);

  // Update package-lock.json
  try {
    run('npm install --package-lock-only --ignore-scripts 2>/dev/null');
    console.log(`  package-lock.json → ${newVersion}`);
  } catch (_e) {
    // Non-fatal
  }

  // Update plugin manifests
  for (const relPath of MANIFEST_FILES) {
    const fullPath = path.join(ROOT, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    manifest.version = newVersion;
    fs.writeFileSync(fullPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`  ${relPath} → ${newVersion}`);
  }

  // Update .release-please-manifest.json (backward compat)
  const manifestPath = path.join(ROOT, '.release-please-manifest.json');
  if (fs.existsSync(manifestPath)) {
    const rpManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    rpManifest['.'] = newVersion;
    fs.writeFileSync(manifestPath, JSON.stringify(rpManifest, null, 2) + '\n');
    console.log(`  .release-please-manifest.json → ${newVersion}`);
  }
}

function generateChangelog() {
  run('node scripts/clean-changelog.js --write');
  console.log('  CHANGELOG.md regenerated');
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const forceLevel = args.includes('--major') ? 'major'
    : args.includes('--minor') ? 'minor'
    : args.includes('--patch') ? 'patch'
    : null;

  const currentVersion = getCurrentVersion();
  const nextVersion = getNextVersion(forceLevel);
  const tagName = `plan-build-run-v${nextVersion}`;

  console.log(`\nPlan-Build-Run Release`);
  console.log(`  Current: v${currentVersion}`);
  console.log(`  Next:    v${nextVersion}`);
  console.log(`  Tag:     ${tagName}`);
  console.log('');

  if (currentVersion === nextVersion) {
    console.log('Version unchanged. No release needed.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('[dry-run] Would update versions, generate changelog, commit, tag, and push.');
    process.exit(0);
  }

  // Check for clean working tree
  const status = run('git status --porcelain');
  if (status) {
    console.error('Working tree is not clean. Commit or stash changes first.');
    process.exit(1);
  }

  console.log('Updating versions...');
  updateVersion(nextVersion);

  console.log('\nGenerating changelog...');
  generateChangelog();

  console.log('\nCommitting and tagging...');
  run('git add package.json package-lock.json .release-please-manifest.json CHANGELOG.md');
  for (const relPath of MANIFEST_FILES) {
    if (fs.existsSync(path.join(ROOT, relPath))) {
      run(`git add "${relPath}"`);
    }
  }
  run(`git commit -m "chore(release): v${nextVersion}"`);
  run(`git tag ${tagName}`);

  console.log('\nPushing...');
  run('git push');
  run(`git push origin ${tagName}`);

  console.log('\nCreating GitHub Release...');
  try {
    const notes = run('node scripts/clean-changelog.js --latest');
    const notesFile = path.join(ROOT, '.release-notes.tmp');
    fs.writeFileSync(notesFile, notes);
    run(`gh release create ${tagName} --title "v${nextVersion}" --notes-file "${notesFile}"`);
    fs.unlinkSync(notesFile);
  } catch (_e) {
    try {
      run(`gh release create ${tagName} --title "v${nextVersion}" --generate-notes`);
    } catch (_e2) {
      console.log('  Warning: Could not create GitHub Release. Create manually.');
    }
  }

  console.log(`\nReleased v${nextVersion}`);
}

main();
