/**
 * generate-derivatives.js
 *
 * Deterministic generator for cursor-pbr and copilot-pbr derivative plugins.
 * Reads plugins/pbr/ as the canonical source and writes transformed output to
 * plugins/cursor-pbr/ and plugins/copilot-pbr/.
 *
 * Usage:
 *   node scripts/generate-derivatives.js            # generate both
 *   node scripts/generate-derivatives.js --verify   # verify, exit 1 on drift
 *   node scripts/generate-derivatives.js --dry-run  # show what would be written, no disk writes
 *   node scripts/generate-derivatives.js cursor     # generate cursor-pbr only
 *   node scripts/generate-derivatives.js copilot    # generate copilot-pbr only
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');
const PBR_DIR = path.join(ROOT, 'plugins', 'pbr');
const CURSOR_DIR = path.join(ROOT, 'plugins', 'cursor-pbr');
const COPILOT_DIR = path.join(ROOT, 'plugins', 'copilot-pbr');

// ---------------------------------------------------------------------------
// Transformation functions (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Transform SKILL.md frontmatter for a given target.
 * - cursor: remove `allowed-tools` line; keep `argument-hint`
 * - copilot: remove `allowed-tools` AND `argument-hint` lines
 * Does NOT modify the body — call transformBody separately.
 *
 * @param {string} content  Full SKILL.md file content
 * @param {'cursor'|'copilot'} target
 * @returns {string}
 */
function transformFrontmatter(content, target) {
  // Match the YAML frontmatter block (--- ... ---)
  return content.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (_match, fm) => {
    let lines = fm.split(/\r?\n/);

    // Remove allowed-tools for both targets
    lines = lines.filter(l => !/^allowed-tools\s*:/.test(l));

    // Remove argument-hint for copilot only
    if (target === 'copilot') {
      lines = lines.filter(l => !/^argument-hint\s*:/.test(l));
    }

    return '---\n' + lines.join('\n') + '\n---';
  });
}

/**
 * Transform body text (and inline frontmatter text) for derivatives.
 * - Replace ${CLAUDE_PLUGIN_ROOT}/dashboard with ../../dashboard (relative path for derivatives)
 * - Replace ${CLAUDE_PLUGIN_ROOT} with ${PLUGIN_ROOT}
 * - Replace word "subagents" with "agents" (preserves subagent_type)
 *
 * Applied to both SKILL.md body and agent .md body.
 *
 * @param {string} content
 * @param {'cursor'|'copilot'} _target  (unused; same transform for both)
 * @returns {string}
 */
function transformBody(content, _target) {
  // Replace ${CLAUDE_PLUGIN_ROOT}/dashboard → ../../dashboard
  // Derivatives are at plugins/{name}/ so ../../dashboard resolves to root/dashboard.
  // Must happen BEFORE the generic CLAUDE_PLUGIN_ROOT → PLUGIN_ROOT replacement
  // to avoid producing ${PLUGIN_ROOT}/dashboard (which compat tests reject).
  let result = content.replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/dashboard/g, '../../dashboard');

  // Replace remaining ${CLAUDE_PLUGIN_ROOT} → ${PLUGIN_ROOT}
  result = result.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, '${PLUGIN_ROOT}');

  // Replace "subagents" → "agents" (word-boundary, case-sensitive)
  // Must NOT replace "subagent_type" or "subagent" inside compound words.
  // Strategy: replace "subagents" as a whole word first, then "Subagents".
  result = result.replace(/\bsubagents\b/g, 'agents');
  result = result.replace(/\bSubagents\b/g, 'Agents');

  return result;
}

/**
 * Transform agent .md frontmatter for a given target.
 *
 * cursor: remove `memory` and `tools` lines; keep `name`, `description`, `model`;
 *   add `readonly: false` (required by cursor-plugin-validation.test.js).
 * copilot: remove `model`, `memory`, `tools` lines; keep only `name` and `description`.
 *
 * Agent files do NOT carry allowed-tools or argument-hint.
 *
 * @param {string} content  Full agent .md file content
 * @param {'cursor'|'copilot'} target
 * @returns {string}
 */
function transformAgentFrontmatter(content, target) {
  return content.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (_match, fm) => {
    let lines = fm.split(/\r?\n/);

    // Fields to remove depend on target
    const keepLines = [];
    let inToolsList = false;

    for (const line of lines) {
      if (/^model\s*:/.test(line)) {
        inToolsList = false;
        if (target === 'cursor') {
          keepLines.push(line); // cursor keeps model
        }
        continue;
      }
      if (/^memory\s*:/.test(line)) {
        inToolsList = false;
        continue; // both targets remove memory
      }
      if (/^tools\s*:/.test(line)) {
        inToolsList = true;
        continue; // both targets remove tools
      }
      // If we're in the tools list, skip indented lines (list items)
      if (inToolsList && /^\s+-/.test(line)) {
        continue;
      }
      // Any non-indented non-empty line ends the tools list
      if (inToolsList && line.trim() !== '') {
        inToolsList = false;
      }
      keepLines.push(line);
    }

    // cursor requires `readonly: false`
    if (target === 'cursor' && !keepLines.some(l => /^readonly\s*:/.test(l))) {
      keepLines.push('readonly: false');
    }

    return '---\n' + keepLines.join('\n') + '\n---';
  });
}

/**
 * Transform hooks/hooks.json for cursor-pbr.
 * The only structural difference is the script path segment:
 *   pbr:    r,'scripts','run-hook.js'
 *   cursor: r,'..','pbr','scripts','run-hook.js'
 *
 * Copilot hooks.json is maintained as a separate template — always skip.
 *
 * @param {string} content  Raw JSON string of pbr hooks.json
 * @param {'cursor'|'copilot'} target
 * @returns {string|null}  Transformed JSON string, or null if target === 'copilot'
 */
function transformHooksJson(content, target) {
  if (target === 'copilot') {
    return null;
  }

  // Replace the script path pattern:
  // From: r,'scripts','run-hook.js'
  // To:   r,'..','pbr','scripts','run-hook.js'
  let result = content.replace(
    /r,'scripts','run-hook\.js'/g,
    "r,'..','pbr','scripts','run-hook.js'"
  );

  // Also update the $schema path and description
  result = result.replace(
    '"$schema": "../scripts/hooks-schema.json"',
    '"$schema": "../../pbr/scripts/hooks-schema.json"'
  );
  result = result.replace(
    '"description": "Plan-Build-Run workflow hooks for state tracking, validation, and auto-continuation"',
    '"description": "Plan-Build-Run workflow hooks for Cursor plugin — delegates to shared scripts in plugins/pbr/scripts/"'
  );

  // Remove the $bootstrap key (cursor doesn't need the explanatory block)
  const parsed = JSON.parse(result);
  delete parsed['$bootstrap'];
  return JSON.stringify(parsed, null, 2);
}

// ---------------------------------------------------------------------------
// Process functions
// ---------------------------------------------------------------------------

/**
 * Ensure a directory exists (mkdir -p equivalent).
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Write a file, creating parent directories as needed.
 * In dry-run mode, just record the path.
 *
 * @param {string} filePath
 * @param {string|Buffer} content
 * @param {boolean} dryRun
 * @param {string[]} written  Accumulator for dry-run output
 */
function writeFile(filePath, content, dryRun, written) {
  written.push(filePath);
  if (dryRun) {
    return;
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

/**
 * Process skills/ directory.
 * For each skill subdir (non-shared): apply transformFrontmatter + transformBody to SKILL.md
 * For shared/ fragments: apply transformBody only.
 *
 * @param {string} srcDir   plugins/pbr/
 * @param {string} destDir  plugins/cursor-pbr/ or plugins/copilot-pbr/
 * @param {'cursor'|'copilot'} target
 * @param {boolean} dryRun
 * @param {string[]} written
 */
function processSkills(srcDir, destDir, target, dryRun, written) {
  const skillsDir = path.join(srcDir, 'skills');
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    if (entry.name === 'shared') {
      // Process shared fragments: transformBody only (no frontmatter strip)
      const sharedSrc = path.join(skillsDir, 'shared');
      const sharedDest = path.join(destDir, 'skills', 'shared');
      const sharedFiles = fs.readdirSync(sharedSrc, { withFileTypes: true });

      for (const file of sharedFiles) {
        if (!file.isFile()) continue;
        const srcFile = path.join(sharedSrc, file.name);
        const destFile = path.join(sharedDest, file.name);
        const raw = fs.readFileSync(srcFile, 'utf8');
        const transformed = transformBody(raw, target);
        writeFile(destFile, transformed, dryRun, written);
      }
    } else {
      // Normal skill directory — process SKILL.md
      const skillSrc = path.join(skillsDir, entry.name, 'SKILL.md');
      const skillDest = path.join(destDir, 'skills', entry.name, 'SKILL.md');

      if (!fs.existsSync(skillSrc)) continue;

      const raw = fs.readFileSync(skillSrc, 'utf8');
      let transformed = transformFrontmatter(raw, target);
      transformed = transformBody(transformed, target);
      writeFile(skillDest, transformed, dryRun, written);
    }
  }
}

/**
 * Process agents/ directory.
 * cursor: {name}.md → {name}.md
 * copilot: {name}.md → {name}.agent.md
 *
 * @param {string} srcDir
 * @param {string} destDir
 * @param {'cursor'|'copilot'} target
 * @param {boolean} dryRun
 * @param {string[]} written
 */
function processAgents(srcDir, destDir, target, dryRun, written) {
  const agentsDir = path.join(srcDir, 'agents');
  const entries = fs.readdirSync(agentsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const srcFile = path.join(agentsDir, entry.name);
    const stem = entry.name.slice(0, -'.md'.length);
    const destFilename = target === 'copilot' ? stem + '.agent.md' : stem + '.md';
    const destFile = path.join(destDir, 'agents', destFilename);

    const raw = fs.readFileSync(srcFile, 'utf8');
    let transformed = transformAgentFrontmatter(raw, target);
    transformed = transformBody(transformed, target);
    writeFile(destFile, transformed, dryRun, written);
  }
}

/**
 * Copy all .md files from references/ byte-for-byte.
 * The compat test strips a `<!-- canonical: ... -->` header when comparing,
 * so we write content as-is (no header added).
 *
 * @param {string} srcDir
 * @param {string} destDir
 * @param {boolean} dryRun
 * @param {string[]} written
 */
function processReferences(srcDir, destDir, dryRun, written) {
  const refsDir = path.join(srcDir, 'references');
  const entries = fs.readdirSync(refsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const srcFile = path.join(refsDir, entry.name);
    const destFile = path.join(destDir, 'references', entry.name);
    const content = fs.readFileSync(srcFile);
    writeFile(destFile, content, dryRun, written);
  }
}

/**
 * Copy all files from templates/ recursively, byte-for-byte.
 *
 * @param {string} srcDir
 * @param {string} destDir
 * @param {boolean} dryRun
 * @param {string[]} written
 */
function processTemplates(srcDir, destDir, dryRun, written) {
  function walk(currentSrc, currentDest) {
    const entries = fs.readdirSync(currentSrc, { withFileTypes: true });
    for (const entry of entries) {
      const srcFile = path.join(currentSrc, entry.name);
      const destFile = path.join(currentDest, entry.name);
      if (entry.isDirectory()) {
        walk(srcFile, destFile);
      } else {
        const content = fs.readFileSync(srcFile);
        writeFile(destFile, content, dryRun, written);
      }
    }
  }
  walk(path.join(srcDir, 'templates'), path.join(destDir, 'templates'));
}

/**
 * Copy all .md files from commands/ byte-for-byte.
 * Command files are already compatible across plugins.
 *
 * @param {string} srcDir
 * @param {string} destDir
 * @param {boolean} dryRun
 * @param {string[]} written
 */
function processCommands(srcDir, destDir, dryRun, written) {
  const commandsDir = path.join(srcDir, 'commands');
  const entries = fs.readdirSync(commandsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const srcFile = path.join(commandsDir, entry.name);
    const destFile = path.join(destDir, 'commands', entry.name);
    const content = fs.readFileSync(srcFile);
    writeFile(destFile, content, dryRun, written);
  }
}

/**
 * Process hooks/hooks.json.
 * cursor: transform (replace script path pattern)
 * copilot: skip entirely (maintained as a separate template)
 *
 * @param {string} srcDir
 * @param {string} destDir
 * @param {'cursor'|'copilot'} target
 * @param {boolean} dryRun
 * @param {string[]} written
 */
function processHooks(srcDir, destDir, target, dryRun, written) {
  if (target === 'copilot') {
    return; // copilot hooks.json maintained separately
  }

  const srcFile = path.join(srcDir, 'hooks', 'hooks.json');
  const destFile = path.join(destDir, 'hooks', 'hooks.json');
  const raw = fs.readFileSync(srcFile, 'utf8');
  const transformed = transformHooksJson(raw, target);
  if (transformed !== null) {
    writeFile(destFile, transformed, dryRun, written);
  }
}

// ---------------------------------------------------------------------------
// Top-level orchestrators
// ---------------------------------------------------------------------------

/**
 * Generate derivative plugin for one target.
 *
 * @param {'cursor'|'copilot'} target
 * @param {boolean} dryRun
 * @returns {string[]}  List of files written (or would-be-written in dry-run)
 */
function generate(target, dryRun) {
  dryRun = dryRun || false;
  const destDir = target === 'cursor' ? CURSOR_DIR : COPILOT_DIR;
  const written = [];

  processSkills(PBR_DIR, destDir, target, dryRun, written);
  processAgents(PBR_DIR, destDir, target, dryRun, written);
  processReferences(PBR_DIR, destDir, dryRun, written);
  processTemplates(PBR_DIR, destDir, dryRun, written);
  processCommands(PBR_DIR, destDir, dryRun, written);
  processHooks(PBR_DIR, destDir, target, dryRun, written);

  return written;
}

/**
 * Verify that the existing derivative plugin matches what generate() would produce.
 * Returns a { ok, drifted } result.
 *
 * @param {'cursor'|'copilot'} target
 * @returns {{ ok: boolean, drifted: string[] }}
 */
function verify(target) {
  const destDir = target === 'cursor' ? CURSOR_DIR : COPILOT_DIR;

  // Run generate in dry-run mode to collect expected file paths
  const wouldWrite = generate(target, true);
  const drifted = [];

  for (const filePath of wouldWrite) {
    // Compute relative path from destDir to reconstruct from srcDir
    const rel = path.relative(destDir, filePath);
    const srcFile = path.join(PBR_DIR, rel);

    // Determine what content generate() would produce for this file
    let expected;
    if (rel.startsWith(path.join('skills', 'shared') + path.sep) || rel === path.join('skills', 'shared')) {
      // shared fragment
      if (fs.existsSync(srcFile)) {
        expected = transformBody(fs.readFileSync(srcFile, 'utf8'), target);
      }
    } else if (rel.match(/^skills[/\\][^/\\]+[/\\]SKILL\.md$/)) {
      // skill SKILL.md
      if (fs.existsSync(srcFile)) {
        let t = transformFrontmatter(fs.readFileSync(srcFile, 'utf8'), target);
        expected = transformBody(t, target);
      }
    } else if (rel.startsWith('agents' + path.sep)) {
      // agent file — map back to src name
      const agentFilename = path.basename(rel);
      const stem = agentFilename.endsWith('.agent.md')
        ? agentFilename.slice(0, -'.agent.md'.length)
        : agentFilename.slice(0, -'.md'.length);
      const agentSrc = path.join(PBR_DIR, 'agents', stem + '.md');
      if (fs.existsSync(agentSrc)) {
        let t = transformAgentFrontmatter(fs.readFileSync(agentSrc, 'utf8'), target);
        expected = transformBody(t, target);
      }
    } else if (rel.startsWith('references' + path.sep) || rel.startsWith('templates' + path.sep) || rel.startsWith('commands' + path.sep)) {
      // byte-for-byte files
      if (fs.existsSync(srcFile)) {
        expected = fs.readFileSync(srcFile);
      }
    } else if (rel === path.join('hooks', 'hooks.json') && target === 'cursor') {
      const hooksSrc = path.join(PBR_DIR, 'hooks', 'hooks.json');
      expected = transformHooksJson(fs.readFileSync(hooksSrc, 'utf8'), target);
    }

    if (expected === undefined) continue;

    // Compare with existing file
    if (!fs.existsSync(filePath)) {
      drifted.push(filePath + ' (missing)');
      continue;
    }

    const actual = typeof expected === 'string'
      ? fs.readFileSync(filePath, 'utf8')
      : fs.readFileSync(filePath);

    const matches = Buffer.isBuffer(expected)
      ? expected.equals(actual)
      : expected === actual;

    if (!matches) {
      drifted.push(path.relative(ROOT, filePath));
    }
  }

  return { ok: drifted.length === 0, drifted };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isVerify = args.includes('--verify');
  const targets = [];

  for (const arg of args) {
    if (arg === 'cursor') targets.push('cursor');
    if (arg === 'copilot') targets.push('copilot');
  }

  if (targets.length === 0) {
    targets.push('cursor', 'copilot');
  }

  if (isVerify) {
    let anyDrift = false;
    for (const target of targets) {
      const result = verify(target);
      if (result.ok) {
        console.log(`[verify] ${target}-pbr: OK (no drift)`);
      } else {
        console.error(`[verify] ${target}-pbr: DRIFT detected in ${result.drifted.length} file(s):`);
        for (const f of result.drifted) {
          console.error(`  - ${f}`);
        }
        anyDrift = true;
      }
    }
    process.exit(anyDrift ? 1 : 0);
    return;
  }

  for (const target of targets) {
    const written = generate(target, isDryRun);
    const label = isDryRun ? '[dry-run]' : '[generate]';
    console.log(`${label} ${target}-pbr: ${written.length} files ${isDryRun ? 'would be written' : 'written'}`);
    if (isDryRun) {
      for (const f of written) {
        console.log(`  ${path.relative(ROOT, f)}`);
      }
    }
  }

  if (!isDryRun) {
    console.log('Done. Run --verify to confirm derivatives match.');
  }
}

// Export transformation functions for unit tests
module.exports = {
  transformFrontmatter,
  transformBody,
  transformAgentFrontmatter,
  transformHooksJson,
  generate,
  verify,
};

if (require.main === module || process.argv[1] === __filename) {
  main();
}
