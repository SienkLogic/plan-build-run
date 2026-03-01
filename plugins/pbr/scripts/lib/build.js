'use strict';

/**
 * lib/build.js — Build helper functions for Plan-Build-Run orchestrator.
 *
 * Provides deterministic CLI-callable utilities for the build skill, replacing
 * inline procedural blocks that the LLM is prone to skipping or misimplementing.
 *
 * Exported functions:
 *   stalenessCheck(phaseSlug, planningDir)   — Check if phase plans are stale
 *   summaryGate(phaseSlug, planId, planningDir) — Verify SUMMARY.md validity gates
 *   checkpointInit(phaseSlug, plans, planningDir) — Initialize checkpoint manifest
 *   checkpointUpdate(phaseSlug, opts, planningDir) — Update checkpoint manifest
 *   seedsMatch(phaseSlug, phaseNumber, planningDir) — Find matching seed files
 */

const fs = require('fs');
const path = require('path');

/**
 * Resolve the .planning directory from the given planningDir or env/cwd fallback.
 * @param {string} [planningDir]
 * @returns {string}
 */
function resolvePlanningDir(planningDir) {
  if (planningDir) return planningDir;
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  return path.join(cwd, '.planning');
}

// ---------------------------------------------------------------------------
// stalenessCheck
// ---------------------------------------------------------------------------

/**
 * Check whether any plans in a phase are stale relative to their dependencies.
 *
 * Staleness detection logic (two modes):
 *   1. If any PLAN.md has a `dependency_fingerprints` field: compare the referenced
 *      SUMMARY.md files' current byte size and mtime to the stored values.
 *   2. Fallback: read ROADMAP.md for the phase's `depends_on`, then compare
 *      the mtime of dependency SUMMARY.md files vs the current PLAN.md files.
 *
 * @param {string} phaseSlug  — Phase directory name (e.g. "52-skill-prompt-slimming")
 * @param {string} [planningDir]
 * @returns {{ stale: boolean, plans: Array<{ id: string, stale: boolean, reason: string }> }
 *          | { error: string }}
 */
function stalenessCheck(phaseSlug, planningDir) {
  const pd = resolvePlanningDir(planningDir);
  const phasesDir = path.join(pd, 'phases');
  const phaseDir = path.join(phasesDir, phaseSlug);

  if (!fs.existsSync(phaseDir)) {
    return { error: 'Phase not found: ' + phaseSlug };
  }

  // Find all PLAN-*.md files in the phase directory
  let planFiles;
  try {
    planFiles = fs.readdirSync(phaseDir).filter(f => /^PLAN.*\.md$/i.test(f));
  } catch (_e) {
    return { error: 'Cannot read phase directory: ' + phaseSlug };
  }

  if (planFiles.length === 0) {
    return { stale: false, plans: [] };
  }

  const planResults = [];
  let anyStale = false;

  for (const planFile of planFiles) {
    const planPath = path.join(phaseDir, planFile);
    let planContent;
    try {
      planContent = fs.readFileSync(planPath, 'utf8');
    } catch (_e) {
      planResults.push({ id: planFile, stale: false, reason: 'unreadable' });
      continue;
    }

    // Extract plan_id from frontmatter
    const idMatch = planContent.match(/^plan:\s*["']?([^"'\n]+)["']?/m);
    const planId = idMatch ? idMatch[1].trim() : planFile.replace(/\.md$/i, '');

    // Check for dependency_fingerprints in frontmatter
    const fpMatch = planContent.match(/^dependency_fingerprints:\s*\n([\s\S]*?)(?=\n\w|\n---)/m);
    if (fpMatch) {
      // Mode 1: fingerprint-based check
      const staleResult = checkFingerprintStaleness(planId, fpMatch[1], pd);
      if (staleResult.stale) anyStale = true;
      planResults.push(staleResult);
    } else {
      // Mode 2: timestamp-based fallback — check once (not per-plan)
      // We'll do it per plan but only if there's a depends_on
      const depsMatch = planContent.match(/^depends_on:\s*\[([^\]]*)\]/m);
      if (!depsMatch || depsMatch[1].trim() === '') {
        planResults.push({ id: planId, stale: false, reason: 'no dependencies' });
        continue;
      }
      const deps = depsMatch[1].split(',').map(d => d.trim().replace(/['"]/g, '')).filter(Boolean);
      const staleResult = checkTimestampStaleness(planId, planPath, deps, pd, phasesDir);
      if (staleResult.stale) anyStale = true;
      planResults.push(staleResult);
    }
  }

  return { stale: anyStale, plans: planResults };
}

/**
 * Check staleness via dependency_fingerprints field.
 * @param {string} planId
 * @param {string} fingerprintBlock — raw YAML block content under dependency_fingerprints
 * @param {string} pd — planningDir
 * @returns {{ id: string, stale: boolean, reason: string }}
 */
function checkFingerprintStaleness(planId, fingerprintBlock, pd) {
  // Parse entries like:  - path: ...\n    size: N\n    mtime: N
  const entries = [];
  const entryRegex = /-\s+path:\s*(.+?)(?:\n|$)[\s\S]*?size:\s*(\d+)[\s\S]*?mtime:\s*(\d+)/g;
  let m;
  while ((m = entryRegex.exec(fingerprintBlock)) !== null) {
    entries.push({ filePath: m[1].trim(), size: parseInt(m[2], 10), mtime: parseInt(m[3], 10) });
  }

  for (const entry of entries) {
    const absPath = path.isAbsolute(entry.filePath)
      ? entry.filePath
      : path.join(pd, '..', entry.filePath);
    try {
      const stat = fs.statSync(absPath);
      if (stat.size !== entry.size || Math.round(stat.mtimeMs) !== entry.mtime) {
        return { id: planId, stale: true, reason: `dependency ${entry.filePath} changed (size or mtime mismatch)` };
      }
    } catch (_e) {
      return { id: planId, stale: true, reason: `dependency ${entry.filePath} not found` };
    }
  }

  return { id: planId, stale: false, reason: 'fingerprints match' };
}

/**
 * Check staleness via ROADMAP depends_on + timestamp comparison.
 * @param {string} planId
 * @param {string} planPath — absolute path to PLAN.md file
 * @param {string[]} deps — dependency phase slugs/IDs
 * @param {string} pd — planningDir
 * @param {string} phasesDir
 * @returns {{ id: string, stale: boolean, reason: string }}
 */
function checkTimestampStaleness(planId, planPath, deps, pd, phasesDir) {
  let planMtime;
  try {
    planMtime = fs.statSync(planPath).mtimeMs;
  } catch (_e) {
    return { id: planId, stale: false, reason: 'cannot stat plan file' };
  }

  for (const dep of deps) {
    // Find the dependency phase directory
    let depDir = null;
    try {
      const allDirs = fs.readdirSync(phasesDir);
      // dep might be a plan ID like "51-01" — find phase dirs that start with the phase number
      const phaseNumMatch = dep.match(/^(\d+)/);
      if (phaseNumMatch) {
        const phaseNum = phaseNumMatch[1].padStart(2, '0');
        depDir = allDirs.find(d => d.startsWith(phaseNum + '-'));
      }
      if (!depDir) {
        depDir = allDirs.find(d => d === dep || d.includes(dep));
      }
    } catch (_e) { continue; }

    if (!depDir) continue;

    const depPhaseDir = path.join(phasesDir, depDir);
    let summaryFiles;
    try {
      summaryFiles = fs.readdirSync(depPhaseDir).filter(f => /^SUMMARY.*\.md$/i.test(f));
    } catch (_e) { continue; }

    for (const sf of summaryFiles) {
      try {
        const sfMtime = fs.statSync(path.join(depPhaseDir, sf)).mtimeMs;
        if (sfMtime > planMtime) {
          return { id: planId, stale: true, reason: `dependency phase ${depDir} was modified after planning (${sf} is newer)` };
        }
      } catch (_e) { continue; }
    }
  }

  return { id: planId, stale: false, reason: 'timestamps ok' };
}

// ---------------------------------------------------------------------------
// summaryGate
// ---------------------------------------------------------------------------

/**
 * Verify that a SUMMARY.md file passes all three gates before STATE.md update.
 *
 * Gate 1: file exists
 * Gate 2: file is non-empty (size > 0)
 * Gate 3: file contains `---` delimiter AND a `status:` field
 *
 * @param {string} phaseSlug
 * @param {string} planId
 * @param {string} [planningDir]
 * @returns {{ ok: boolean, gate: string|null, detail: string }}
 */
function summaryGate(phaseSlug, planId, planningDir) {
  const pd = resolvePlanningDir(planningDir);
  const summaryPath = path.join(pd, 'phases', phaseSlug, `SUMMARY-${planId}.md`);

  // Gate 1: exists
  if (!fs.existsSync(summaryPath)) {
    return { ok: false, gate: 'exists', detail: `SUMMARY-${planId}.md not found in phase ${phaseSlug}` };
  }

  // Gate 2: non-empty
  let stat;
  try {
    stat = fs.statSync(summaryPath);
  } catch (_e) {
    return { ok: false, gate: 'exists', detail: 'Cannot stat SUMMARY file' };
  }
  if (stat.size === 0) {
    return { ok: false, gate: 'nonempty', detail: `SUMMARY-${planId}.md is empty` };
  }

  // Gate 3: valid frontmatter
  let content;
  try {
    content = fs.readFileSync(summaryPath, 'utf8');
  } catch (_e) {
    return { ok: false, gate: 'valid-frontmatter', detail: 'Cannot read SUMMARY file' };
  }

  const lines = content.split(/\r?\n/).slice(0, 30);
  const hasDashes = lines.some(l => l.trim() === '---');
  const hasStatus = lines.some(l => /^status\s*:/i.test(l.trim()));

  if (!hasDashes || !hasStatus) {
    return { ok: false, gate: 'valid-frontmatter', detail: `SUMMARY-${planId}.md missing frontmatter (needs --- delimiters and status: field)` };
  }

  return { ok: true, gate: null, detail: 'all gates passed' };
}

// ---------------------------------------------------------------------------
// checkpointInit
// ---------------------------------------------------------------------------

/**
 * Initialize the checkpoint manifest for a phase before entering the wave loop.
 *
 * @param {string} phaseSlug
 * @param {string|string[]} plans — comma-separated string or array of plan IDs
 * @param {string} [planningDir]
 * @returns {{ ok: boolean, path: string } | { error: string }}
 */
function checkpointInit(phaseSlug, plans, planningDir) {
  const pd = resolvePlanningDir(planningDir);
  const phaseDir = path.join(pd, 'phases', phaseSlug);
  const manifestPath = path.join(phaseDir, '.checkpoint-manifest.json');

  // Normalize plans to array
  let planIds;
  if (Array.isArray(plans)) {
    planIds = plans.filter(Boolean);
  } else if (typeof plans === 'string' && plans.trim()) {
    planIds = plans.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    planIds = [];
  }

  const manifest = {
    plans: planIds,
    checkpoints_resolved: [],
    checkpoints_pending: [],
    wave: 1,
    deferred: [],
    commit_log: [],
    last_good_commit: null
  };

  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return { ok: true, path: manifestPath };
  } catch (e) {
    return { error: 'Failed to write checkpoint manifest: ' + e.message };
  }
}

// ---------------------------------------------------------------------------
// checkpointUpdate
// ---------------------------------------------------------------------------

/**
 * Update the checkpoint manifest after a wave completes.
 *
 * @param {string} phaseSlug
 * @param {{ wave: number, resolved: string, sha: string }} opts
 * @param {string} [planningDir]
 * @returns {{ ok: boolean } | { error: string }}
 */
function checkpointUpdate(phaseSlug, opts, planningDir) {
  const pd = resolvePlanningDir(planningDir);
  const phaseDir = path.join(pd, 'phases', phaseSlug);
  const manifestPath = path.join(phaseDir, '.checkpoint-manifest.json');

  let manifest;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(raw);
  } catch (e) {
    return { error: 'Cannot read checkpoint manifest: ' + e.message };
  }

  const { wave, resolved, sha } = opts || {};

  // Move resolved plan from plans → checkpoints_resolved
  if (resolved) {
    manifest.plans = (manifest.plans || []).filter(p => p !== resolved);
    if (!manifest.checkpoints_resolved) manifest.checkpoints_resolved = [];
    manifest.checkpoints_resolved.push(resolved);
  }

  // Advance wave
  if (typeof wave === 'number' && !isNaN(wave)) {
    manifest.wave = wave;
  }

  // Append to commit_log and update last_good_commit
  if (sha) {
    if (!manifest.commit_log) manifest.commit_log = [];
    manifest.commit_log.push({ plan: resolved || null, sha, timestamp: new Date().toISOString() });
    manifest.last_good_commit = sha;
  }

  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    return { error: 'Failed to write checkpoint manifest: ' + e.message };
  }
}

// ---------------------------------------------------------------------------
// seedsMatch
// ---------------------------------------------------------------------------

/**
 * Find seed files in .planning/seeds/ that match the given phase.
 *
 * A seed matches if ANY of these conditions are true:
 *   1. trigger === phaseSlug (exact)
 *   2. trigger is a substring of phaseSlug
 *   3. trigger === String(phaseNumber)
 *   4. trigger === '*'
 *
 * @param {string} phaseSlug    — e.g. "03-authentication"
 * @param {string|number} phaseNumber — e.g. "3" or 3
 * @param {string} [planningDir]
 * @returns {{ matched: Array<{ name: string, description: string, trigger: string, path: string }> }}
 */
function seedsMatch(phaseSlug, phaseNumber, planningDir) {
  const pd = resolvePlanningDir(planningDir);
  const seedsDir = path.join(pd, 'seeds');

  if (!fs.existsSync(seedsDir)) {
    return { matched: [] };
  }

  let seedFiles;
  try {
    seedFiles = fs.readdirSync(seedsDir).filter(f => f.endsWith('.md'));
  } catch (_e) {
    return { matched: [] };
  }

  const phaseNumStr = String(phaseNumber);
  const matched = [];

  for (const seedFile of seedFiles) {
    const seedPath = path.join(seedsDir, seedFile);
    let content;
    try {
      content = fs.readFileSync(seedPath, 'utf8');
    } catch (_e) { continue; }

    // Parse frontmatter
    const fm = parseSeedFrontmatter(content);
    if (!fm || !fm.trigger) continue;

    const trigger = String(fm.trigger).replace(/^["']|["']$/g, '');

    const matches =
      trigger === phaseSlug ||
      phaseSlug.includes(trigger) ||
      trigger === phaseNumStr ||
      trigger === '*';

    if (matches) {
      matched.push({
        name: fm.name || seedFile,
        description: fm.description || '',
        trigger,
        path: seedPath
      });
    }
  }

  return { matched };
}

/**
 * Minimal YAML frontmatter parser for seed files.
 * Extracts trigger, name, description fields.
 * @param {string} content
 * @returns {{ trigger?: string, name?: string, description?: string } | null}
 */
function parseSeedFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const block = match[1];
  const result = {};

  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) {
      result[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  stalenessCheck,
  summaryGate,
  checkpointInit,
  checkpointUpdate,
  seedsMatch
};
