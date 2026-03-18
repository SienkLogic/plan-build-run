'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect all SKILL.md file paths under pluginRoot/skills/<dir>/SKILL.md
 * and all .md files under pluginRoot/skills/shared/.
 */
function collectSkillFiles(pluginRoot) {
  const skillsDir = path.join(pluginRoot, 'skills');
  const files = [];

  if (!fs.existsSync(skillsDir)) return files;

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'shared') {
      // Collect all .md files in shared/
      const sharedDir = path.join(skillsDir, 'shared');
      const sharedFiles = fs.readdirSync(sharedDir).filter(f => f.endsWith('.md'));
      for (const sf of sharedFiles) {
        files.push(path.join(sharedDir, sf));
      }
    } else {
      const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        files.push(skillPath);
      }
    }
  }
  return files;
}

/**
 * Collect only SKILL.md files (not shared fragments).
 */
function collectSkillMdOnly(pluginRoot) {
  const skillsDir = path.join(pluginRoot, 'skills');
  const files = [];

  if (!fs.existsSync(skillsDir)) return files;

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'shared') continue;
    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      files.push(skillPath);
    }
  }
  return files;
}

/**
 * Get a relative label for a file path (from pluginRoot).
 */
function relLabel(pluginRoot, filePath) {
  return path.relative(pluginRoot, filePath).replace(/\\/g, '/');
}

/**
 * Strip trailing punctuation from a captured filename reference.
 * Handles trailing periods, commas, semicolons, colons that aren't part of filenames.
 */
function cleanRef(ref) {
  return ref.replace(/[.,;:]+$/, '');
}

// ---------------------------------------------------------------------------
// SI-01: Skill Template Reference Validation
// ---------------------------------------------------------------------------

/**
 * Scans SKILL.md files and shared fragments for template references.
 * Verifies each referenced template file exists under pluginRoot/templates/.
 *
 * Patterns matched:
 *   ${CLAUDE_SKILL_DIR}/templates/<filename>
 *   ${CLAUDE_PLUGIN_ROOT}/templates/<filename>
 *   bare templates/<filename> references
 */
function checkSkillTemplateRefs(pluginRoot) {
  const absRoot = path.resolve(pluginRoot);
  const files = collectSkillFiles(absRoot);
  const evidence = [];

  // Also scan skill-local templates that reference plugin-root templates
  const skillsDir = path.join(absRoot, 'skills');
  if (fs.existsSync(skillsDir)) {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'shared') continue;
      const templatesDir = path.join(skillsDir, entry.name, 'templates');
      if (fs.existsSync(templatesDir)) {
        const tFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md') || f.endsWith('.tmpl'));
        for (const tf of tFiles) {
          files.push(path.join(templatesDir, tf));
        }
      }
    }
  }

  // Regex patterns for template references
  const patterns = [
    /\$\{CLAUDE_SKILL_DIR\}\/templates\/([^\s`"')\]]+)/g,
    /\$\{CLAUDE_PLUGIN_ROOT\}\/templates\/([^\s`"')\]]+)/g,
    // Bare templates/ references — only at word boundary (not after skills/xxx/)
    /(?<=^|[\s`"'(])templates\/([^\s`"')\]]+)/gm,
  ];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const label = relLabel(absRoot, filePath);
    const seen = new Set();

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const templateRef = cleanRef(match[1]);
        // Skip template variable placeholders like {TOPIC}.md.tmpl
        if (templateRef.includes('{')) continue;
        // Skip duplicates within same file
        if (seen.has(templateRef)) continue;
        seen.add(templateRef);

        // For CLAUDE_SKILL_DIR refs, resolve relative to skill's own templates dir
        // For CLAUDE_PLUGIN_ROOT and bare refs, resolve to pluginRoot/templates/
        let resolved;
        if (match[0].includes('CLAUDE_SKILL_DIR')) {
          // Skill-local template: resolve relative to the skill's directory
          const skillDir = path.dirname(filePath);
          // If the file is inside a templates/ subdir, go up one level
          const baseDir = path.basename(skillDir) === 'templates' ? path.dirname(skillDir) : skillDir;
          resolved = path.join(baseDir, 'templates', templateRef);
          // Also check plugin-root templates as fallback
          if (!fs.existsSync(resolved)) {
            resolved = path.join(absRoot, 'templates', templateRef);
          }
        } else {
          resolved = path.join(absRoot, 'templates', templateRef);
        }

        if (!fs.existsSync(resolved)) {
          evidence.push(`${label} -> templates/${templateRef} (MISSING)`);
        }
      }
    }
  }

  return {
    status: evidence.length > 0 ? 'fail' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} missing template reference(s) found`
      : 'All template references resolve to existing files',
  };
}

// ---------------------------------------------------------------------------
// SI-02: Skill Shared Fragment Reference Validation
// ---------------------------------------------------------------------------

/**
 * Scans SKILL.md files for references to skills/shared/ fragments.
 * Verifies each referenced fragment file exists.
 */
function checkSkillSharedFragmentRefs(pluginRoot) {
  const absRoot = path.resolve(pluginRoot);
  const files = collectSkillFiles(absRoot);
  const evidence = [];

  const patterns = [
    /\$\{CLAUDE_SKILL_DIR\}\/skills\/shared\/([^\s`"')\]]+)/g,
    /(?<!\$\{[A-Z_]+\}\/)skills\/shared\/([^\s`"')\]]+)/g,
  ];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const label = relLabel(absRoot, filePath);
    const seen = new Set();

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const fragmentRef = cleanRef(match[1]);
        if (seen.has(fragmentRef)) continue;
        seen.add(fragmentRef);

        const resolved = path.join(absRoot, 'skills', 'shared', fragmentRef);
        if (!fs.existsSync(resolved)) {
          evidence.push(`${label} -> skills/shared/${fragmentRef} (MISSING)`);
        }
      }
    }
  }

  return {
    status: evidence.length > 0 ? 'fail' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} missing shared fragment reference(s) found`
      : 'All shared fragment references resolve to existing files',
  };
}

// ---------------------------------------------------------------------------
// SI-03: Skill Reference File Link Validation
// ---------------------------------------------------------------------------

/**
 * Scans SKILL.md files for references to references/ files.
 * Verifies each referenced file exists under pluginRoot/references/.
 */
function checkSkillReferenceFileLinks(pluginRoot) {
  const absRoot = path.resolve(pluginRoot);
  const files = collectSkillFiles(absRoot);
  const evidence = [];

  const patterns = [
    /\$\{CLAUDE_SKILL_DIR\}\/references\/([^\s`"')\]]+)/g,
    /\$\{CLAUDE_PLUGIN_ROOT\}\/references\/([^\s`"')\]]+)/g,
    // Bare references/ patterns (backtick-quoted or in text)
    /(?<!\$\{[A-Z_]+\}\/)references\/([^\s`"')\]]+\.md)/g,
    // @references/ shorthand pattern
    /@references\/([^\s`"')\]]+)/g,
  ];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const label = relLabel(absRoot, filePath);
    const seen = new Set();

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        let refFile = cleanRef(match[1]);
        // Strip trailing backtick if captured
        refFile = refFile.replace(/`$/, '');
        if (seen.has(refFile)) continue;
        seen.add(refFile);

        const resolved = path.join(absRoot, 'references', refFile);
        if (!fs.existsSync(resolved)) {
          evidence.push(`${label} -> references/${refFile} (MISSING)`);
        }
      }
    }
  }

  return {
    status: evidence.length > 0 ? 'fail' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} missing reference file link(s) found`
      : 'All reference file links resolve to existing files',
  };
}

// ---------------------------------------------------------------------------
// SI-04: Skill -> Agent Type Reference Validation
// ---------------------------------------------------------------------------

/**
 * Scans SKILL.md files for subagent_type: "pbr:X" patterns.
 * Also scans for pbr:{name} references in Task() spawn descriptions.
 * Verifies each referenced agent file exists under pluginRoot/agents/.
 */
function checkSkillAgentTypeRefs(pluginRoot) {
  const absRoot = path.resolve(pluginRoot);
  const files = collectSkillMdOnly(absRoot);
  const evidence = [];

  // Match both subagent_type: "pbr:name" and pbr:name in backtick-quoted refs
  const patterns = [
    /subagent_type:\s*"pbr:([^"]+)"/g,
    /subagent_type:\s*['"]pbr:([^'"]+)['"]/g,
  ];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const label = relLabel(absRoot, filePath);
    const seen = new Set();

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const agentName = match[1];
        if (seen.has(agentName)) continue;
        seen.add(agentName);

        const agentPath = path.join(absRoot, 'agents', `${agentName}.md`);
        if (!fs.existsSync(agentPath)) {
          evidence.push(`${label} -> agents/${agentName}.md (MISSING)`);
        }
      }
    }
  }

  return {
    status: evidence.length > 0 ? 'fail' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} missing agent type reference(s) found`
      : 'All subagent_type references map to existing agent files',
  };
}

// ---------------------------------------------------------------------------
// SI-05: Skill <-> Agent Completion Marker Contract Verification
// ---------------------------------------------------------------------------

/**
 * For each skill that spawns a subagent_type, extracts completion markers
 * the skill checks for and compares against markers documented in the agent file.
 *
 * Uses a proximity heuristic: markers within 50 lines of an agent spawn are
 * associated with that agent. Markers in structured_returns or completion
 * protocol sections of the agent file are the expected contract.
 *
 * Status is 'warn' (not 'fail') since marker detection is heuristic.
 */
function checkSkillAgentCompletionMarkers(pluginRoot) {
  const absRoot = path.resolve(pluginRoot);
  const files = collectSkillMdOnly(absRoot);
  const evidence = [];

  // Completion marker keywords
  const MARKER_KEYWORDS = ['COMPLETE', 'FAILED', 'INCONCLUSIVE', 'CHECKPOINT'];
  const markerPattern = /##\s+([\w-]+\s+)?(COMPLETE|FAILED|INCONCLUSIVE|CHECKPOINT)/g;

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const label = relLabel(absRoot, filePath);
    const lines = content.split(/\r?\n/);

    // Find agent spawn locations (line numbers)
    const agentSpawns = []; // { name, line }
    const agentPattern = /subagent_type:\s*"pbr:([^"]+)"/;
    for (let i = 0; i < lines.length; i++) {
      const m = agentPattern.exec(lines[i]);
      if (m) agentSpawns.push({ name: m[1], line: i });
    }

    if (agentSpawns.length === 0) continue;

    // Extract all markers from the skill with line numbers
    const skillMarkerLocs = []; // { keyword, line }
    for (let i = 0; i < lines.length; i++) {
      markerPattern.lastIndex = 0;
      let mkMatch;
      while ((mkMatch = markerPattern.exec(lines[i])) !== null) {
        skillMarkerLocs.push({ keyword: mkMatch[2], line: i });
      }
    }

    if (skillMarkerLocs.length === 0) continue;

    // For each agent, find markers within 50 lines of any of its spawn points
    // If no proximity match, fall back to all markers in the skill
    const PROXIMITY = 50;
    const checkedPairs = new Set();

    for (const spawn of agentSpawns) {
      const agentPath = path.join(absRoot, 'agents', `${spawn.name}.md`);
      if (!fs.existsSync(agentPath)) continue; // SI-04 handles missing agents

      const agentContent = fs.readFileSync(agentPath, 'utf8');

      // Find markers near this spawn
      let nearbyMarkers = skillMarkerLocs.filter(
        m => Math.abs(m.line - spawn.line) <= PROXIMITY
      );

      // Fall back to all skill markers if none nearby
      if (nearbyMarkers.length === 0) {
        nearbyMarkers = skillMarkerLocs;
      }

      const uniqueKeywords = [...new Set(nearbyMarkers.map(m => m.keyword))];

      for (const keyword of uniqueKeywords) {
        const pairKey = `${spawn.name}:${keyword}`;
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);

        // Check if the agent documents this marker (case-insensitive)
        const markerRegex = new RegExp(keyword, 'i');
        if (!markerRegex.test(agentContent)) {
          evidence.push(`${label} expects '${keyword}' but agents/${spawn.name}.md does not document it`);
        }
      }
    }
  }

  return {
    status: evidence.length > 0 ? 'warn' : 'pass',
    evidence,
    message: evidence.length > 0
      ? `${evidence.length} completion marker mismatch(es) found (heuristic)`
      : 'All skill/agent completion marker contracts align',
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkSkillTemplateRefs,
  checkSkillSharedFragmentRefs,
  checkSkillReferenceFileLinks,
  checkSkillAgentTypeRefs,
  checkSkillAgentCompletionMarkers,
};
