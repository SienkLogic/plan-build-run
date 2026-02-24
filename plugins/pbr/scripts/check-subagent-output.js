#!/usr/bin/env node

/**
 * PostToolUse hook on Task: Validates that subagent outputs exist.
 *
 * Maps agent types to expected output files and warns if they're missing
 * after the agent completes. This catches silent agent failures early
 * rather than discovering them during verification.
 *
 * Agent → Expected output mapping:
 *   executor   → SUMMARY-{plan_id}.md (or SUMMARY.md) in the phase directory
 *   planner    → PLAN-{MM}.md in the phase directory
 *   verifier   → VERIFICATION.md in the phase directory
 *   researcher → RESEARCH.md (or domain-specific .md) in research/
 *
 * Exit codes:
 *   0 = always (informational hook, never blocks — PostToolUse can only warn)
 */

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { resolveConfig } = require('./local-llm/health');
const { classifyError } = require('./local-llm/operations/classify-error');

/**
 * Check if a file was modified recently (within thresholdMs).
 * Returns false if file doesn't exist or on error.
 */
function isRecent(filePath, thresholdMs = 300000) {
  try {
    const stat = fs.statSync(filePath);
    return (Date.now() - stat.mtimeMs) < thresholdMs;
  } catch (_e) {
    return false;
  }
}

// Agent type → expected output patterns
const AGENT_OUTPUTS = {
  'pbr:executor': {
    description: 'SUMMARY.md in the phase or quick directory',
    check: (planningDir) => {
      // Check phase directory first, then quick directory
      const phaseMatches = findInPhaseDir(planningDir, /^SUMMARY.*\.md$/i);
      if (phaseMatches.length > 0) return phaseMatches;
      return findInQuickDir(planningDir, /^SUMMARY.*\.md$/i);
    }
  },
  'pbr:planner': {
    description: 'PLAN.md in the phase directory',
    check: (planningDir) => findInPhaseDir(planningDir, /^PLAN.*\.md$/i)
  },
  'pbr:verifier': {
    description: 'VERIFICATION.md in the phase directory',
    check: (planningDir) => findInPhaseDir(planningDir, /^VERIFICATION\.md$/i)
  },
  'pbr:researcher': {
    description: 'research file in .planning/research/',
    check: (planningDir) => {
      const researchDir = path.join(planningDir, 'research');
      if (!fs.existsSync(researchDir)) return [];
      try {
        const allFiles = fs.readdirSync(researchDir)
          .filter(f => f.endsWith('.md'))
          .map(f => path.join('research', f));
        if (allFiles.length === 0) return [];
        const recentFiles = allFiles.filter(f => isRecent(path.join(planningDir, f)));
        if (recentFiles.length === 0) {
          // Files exist but none are recent — return them but flag staleness
          allFiles._stale = true;
        }
        return allFiles;
      } catch (_e) {
        return [];
      }
    }
  },
  'pbr:synthesizer': {
    description: 'synthesis file in .planning/research/ or CONTEXT.md update',
    check: (planningDir) => {
      const researchDir = path.join(planningDir, 'research');
      if (fs.existsSync(researchDir)) {
        try {
          const files = fs.readdirSync(researchDir).filter(f => f.endsWith('.md'));
          if (files.length > 0) {
            const allFiles = files.map(f => path.join('research', f));
            const recentFiles = allFiles.filter(f => isRecent(path.join(planningDir, f)));
            if (recentFiles.length === 0) {
              allFiles._stale = true;
            }
            return allFiles;
          }
        } catch (_e) { /* best-effort */ }
      }
      const contextFile = path.join(planningDir, 'CONTEXT.md');
      if (fs.existsSync(contextFile)) {
        try {
          const stat = fs.statSync(contextFile);
          if (stat.size > 0) {
            const result = ['CONTEXT.md'];
            if (!isRecent(contextFile)) {
              result._stale = true;
            }
            return result;
          }
        } catch (_e) { /* best-effort */ }
      }
      return [];
    }
  },
  'pbr:plan-checker': {
    description: 'advisory output (no file expected)',
    noFileExpected: true,
    check: () => []
  },
  'pbr:integration-checker': {
    description: 'advisory output (no file expected)',
    noFileExpected: true,
    check: () => []
  },
  'pbr:debugger': {
    description: 'debug file in .planning/debug/',
    check: (planningDir) => {
      const debugDir = path.join(planningDir, 'debug');
      if (!fs.existsSync(debugDir)) return [];
      try {
        return fs.readdirSync(debugDir)
          .filter(f => f.endsWith('.md'))
          .map(f => path.join('debug', f));
      } catch (_e) {
        return [];
      }
    }
  },
  'pbr:codebase-mapper': {
    description: 'codebase map in .planning/codebase/',
    check: (planningDir) => {
      const codebaseDir = path.join(planningDir, 'codebase');
      if (!fs.existsSync(codebaseDir)) return [];
      try {
        return fs.readdirSync(codebaseDir)
          .filter(f => f.endsWith('.md'))
          .map(f => path.join('codebase', f));
      } catch (_e) {
        return [];
      }
    }
  },
  'pbr:general': {
    description: 'advisory output (no file expected)',
    noFileExpected: true,
    check: () => []
  }
};

/**
 * Extract current phase number from STATE.md, preferring frontmatter over body.
 * @param {string} stateContent - Full STATE.md content
 * @returns {string|null} Phase number string or null
 */
function getCurrentPhase(stateContent) {
  // Prefer frontmatter (always up-to-date)
  const fmMatch = stateContent.match(/^current_phase:\s*(\d+)/m);
  if (fmMatch) return fmMatch[1];
  // Fall back to body text
  const bodyMatch = stateContent.match(/Phase:\s*(\d+)\s+of\s+\d+/);
  return bodyMatch ? bodyMatch[1] : null;
}

/**
 * Check if ROADMAP.md is stale after executor/verifier completion.
 * Detects: (1) no Progress table for current milestone, (2) table exists but
 * phase row is out of date vs. phase artifacts on disk.
 *
 * @param {string} planningDir - Path to .planning/
 * @returns {string|null} Warning message or null if in sync
 */
function checkRoadmapStaleness(planningDir) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) return null;

  try {
    const content = fs.readFileSync(roadmapPath, 'utf8');

    // Check if there's a Progress table at all
    const hasProgressTable = /Plans\s*Complete/i.test(content);
    if (!hasProgressTable) {
      return 'ROADMAP.md has no Progress table for the current milestone. The orchestrator should add a Progress table with columns: Phase | Plans Complete | Status | Completed. See skills/shared/state-update.md for format.';
    }

    // If table exists, check if current phase row is present
    const stateFile = path.join(planningDir, 'STATE.md');
    if (fs.existsSync(stateFile)) {
      const stateContent = fs.readFileSync(stateFile, 'utf8');
      const currentPhase = getCurrentPhase(stateContent);
      if (currentPhase) {
        const paddedPhase = currentPhase.padStart(2, '0');
        const phaseInTable = new RegExp(`\\|\\s*${paddedPhase}\\.`).test(content) ||
          new RegExp(`\\|\\s*${parseInt(currentPhase, 10)}\\.`).test(content);
        if (!phaseInTable) {
          return `ROADMAP.md Progress table exists but has no row for Phase ${currentPhase}. Add a row for the current phase.`;
        }
      }
    }
  } catch (_e) {
    // best-effort
  }
  return null;
}

function findInPhaseDir(planningDir, pattern) {
  const matches = [];
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) return matches;

  try {
    // Find the active phase from STATE.md (prefer frontmatter over body)
    const stateFile = path.join(planningDir, 'STATE.md');
    if (!fs.existsSync(stateFile)) return matches;

    const stateContent = fs.readFileSync(stateFile, 'utf8');
    const phaseNum = getCurrentPhase(stateContent);
    if (!phaseNum) return matches;

    const currentPhase = phaseNum.padStart(2, '0');
    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(currentPhase));
    if (dirs.length === 0) return matches;

    const phaseDir = path.join(phasesDir, dirs[0]);
    const files = fs.readdirSync(phaseDir);
    for (const file of files) {
      if (pattern.test(file)) {
        // Check it's non-empty
        const filePath = path.join(phaseDir, file);
        const stat = fs.statSync(filePath);
        if (stat.size > 0) {
          matches.push(path.join('phases', dirs[0], file));
        }
      }
    }
  } catch (_e) {
    // best-effort
  }
  return matches;
}

function findInQuickDir(planningDir, pattern) {
  const matches = [];
  const quickDir = path.join(planningDir, 'quick');
  if (!fs.existsSync(quickDir)) return matches;

  try {
    // Find the most recent quick task directory (highest NNN)
    const dirs = fs.readdirSync(quickDir)
      .filter(d => /^\d{3}-/.test(d))
      .sort()
      .reverse();
    if (dirs.length === 0) return matches;

    const latestDir = path.join(quickDir, dirs[0]);
    const stat = fs.statSync(latestDir);
    if (!stat.isDirectory()) return matches;

    const files = fs.readdirSync(latestDir);
    for (const file of files) {
      if (pattern.test(file)) {
        const filePath = path.join(latestDir, file);
        const fileStat = fs.statSync(filePath);
        if (fileStat.size > 0) {
          matches.push(path.join('quick', dirs[0], file));
        }
      }
    }
  } catch (_e) {
    // best-effort
  }
  return matches;
}

function checkSummaryCommits(planningDir, foundFiles, warnings) {
  // Look for SUMMARY files in found list
  const summaryFiles = foundFiles.filter(f => /SUMMARY/i.test(f));
  for (const relPath of summaryFiles) {
    try {
      const fullPath = path.join(planningDir, relPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      // Parse frontmatter for commits field
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fmMatch) continue;
      const fm = fmMatch[1];
      const commitsMatch = fm.match(/commits:\s*(\[.*?\]|.*)/);
      if (!commitsMatch) {
        warnings.push(`${relPath}: No "commits" field in frontmatter. Executor should record commit hashes.`);
        continue;
      }
      const commitsVal = commitsMatch[1].trim();
      if (commitsVal === '[]' || commitsVal === '' || commitsVal === '~' || commitsVal === 'null') {
        warnings.push(`${relPath}: "commits" field is empty. Executor may have failed to commit changes.`);
      }
    } catch (_e) { /* best-effort */ }
  }
}

function readStdin() {
  try {
    const input = fs.readFileSync(0, 'utf8').trim();
    if (input) return JSON.parse(input);
  } catch (_e) {
    // empty or non-JSON stdin
  }
  return {};
}

function loadLocalLlmConfig(cwd) {
  try {
    const configPath = path.join(cwd, '.planning', 'config.json');
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return resolveConfig(parsed.local_llm);
  } catch (_) {
    return resolveConfig(undefined);
  }
}

async function main() {
  const data = readStdin();
  const cwd = process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only relevant for Plan-Build-Run projects
  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  // Extract agent type from the Task completion data
  const agentType = data.tool_input?.subagent_type || data.subagent_type || '';

  // Only check known Plan-Build-Run agent types
  const outputSpec = AGENT_OUTPUTS[agentType];
  if (!outputSpec) {
    process.exit(0);
  }

  // Read active skill
  let activeSkill = '';
  try {
    activeSkill = fs.readFileSync(path.join(planningDir, '.active-skill'), 'utf8').trim();
  } catch (_e) { /* no active skill */ }

  // Check for expected outputs
  const found = outputSpec.check(planningDir);

  const genericMissing = found.length === 0 && !outputSpec.noFileExpected;

  // Skill-specific post-completion validation
  const skillWarnings = [];

  // ACTIVE-SKILL ENFORCEMENT: Warn when no .active-skill file exists.
  // Skills are instructed (with CRITICAL markers) to write this file, but LLMs
  // skip it under cognitive load. This warning reminds the orchestrator.
  if (!activeSkill && agentType !== 'pbr:general' && agentType !== 'pbr:plan-checker' && agentType !== 'pbr:integration-checker') {
    skillWarnings.push('.active-skill file is missing — the orchestrating skill never wrote it. This means skill-workflow guards were inactive for this entire operation. CRITICAL: Write the skill name to .planning/.active-skill BEFORE spawning agents.');
  }

  // ROADMAP.md SYNC: After executor or verifier completes, check if ROADMAP.md
  // needs updating. Subagent writes (SUMMARY/VERIFICATION) trigger check-state-sync
  // in the subagent context, but the main context ROADMAP.md may still be stale.
  if (agentType === 'pbr:executor' || agentType === 'pbr:verifier') {
    const roadmapWarning = checkRoadmapStaleness(planningDir);
    if (roadmapWarning) {
      skillWarnings.push(roadmapWarning);
    }
  }

  // Mtime-based recency check for researcher and synthesizer
  if (found._stale && (agentType === 'pbr:researcher' || agentType === 'pbr:synthesizer')) {
    const label = agentType === 'pbr:researcher' ? 'Researcher' : 'Synthesizer';
    skillWarnings.push(`${label} output may be stale — no recent output files detected.`);
  }

  // GAP-04: Begin planner must produce core files
  if (activeSkill === 'begin' && agentType === 'pbr:planner') {
    const coreFiles = ['REQUIREMENTS.md', 'ROADMAP.md', 'STATE.md'];
    for (const f of coreFiles) {
      if (!fs.existsSync(path.join(planningDir, f))) {
        skillWarnings.push(`Begin planner: ${f} was not created. The project may be in an incomplete state.`);
      }
    }
  }

  // GAP-05: Plan researcher should produce phase-level RESEARCH.md
  if (activeSkill === 'plan' && agentType === 'pbr:researcher') {
    const phaseResearch = findInPhaseDir(planningDir, /^RESEARCH\.md$/i);
    if (found.length === 0 && phaseResearch.length === 0) {
      skillWarnings.push('Plan researcher: No research output found in .planning/research/ or in the phase directory.');
    }
  }

  // GAP-08: Scan codebase-mapper should produce all 4 focus areas
  if (activeSkill === 'scan' && agentType === 'pbr:codebase-mapper') {
    const expectedAreas = ['tech', 'arch', 'quality', 'concerns'];
    const codebaseDir = path.join(planningDir, 'codebase');
    if (fs.existsSync(codebaseDir)) {
      try {
        const files = fs.readdirSync(codebaseDir).map(f => f.toLowerCase());
        for (const area of expectedAreas) {
          if (!files.some(f => f.includes(area))) {
            skillWarnings.push(`Scan mapper: No output file containing "${area}" found in .planning/codebase/. One of the 4 mappers may have failed.`);
          }
        }
      } catch (_e) { /* best-effort */ }
    }
  }

  // GAP-07: Review verifier should produce meaningful VERIFICATION.md status
  if (activeSkill === 'review' && agentType === 'pbr:verifier') {
    const verFiles = findInPhaseDir(planningDir, /^VERIFICATION\.md$/i);
    for (const vf of verFiles) {
      try {
        const content = fs.readFileSync(path.join(planningDir, vf), 'utf8');
        const statusMatch = content.match(/^status:\s*(\S+)/mi);
        if (statusMatch && statusMatch[1] === 'gaps_found') {
          skillWarnings.push('Review verifier: VERIFICATION.md has status "gaps_found" — ensure gaps are surfaced to the user.');
        }
      } catch (_e) { /* best-effort */ }
    }
  }

  // GAP-06: Build/quick executor SUMMARY should have commits
  if ((activeSkill === 'build' || activeSkill === 'quick') && agentType === 'pbr:executor') {
    checkSummaryCommits(planningDir, found, skillWarnings);
  }

  // Output logic: avoid duplicating warnings
  if (genericMissing && skillWarnings.length > 0) {
    logHook('check-subagent-output', 'PostToolUse', 'skill-warning', {
      skill: activeSkill,
      agent_type: agentType,
      warnings: skillWarnings
    });
    // LLM error classification — advisory enrichment
    let llmCategoryNote = '';
    try {
      const llmConfig = loadLocalLlmConfig(cwd);
      const errorText = (data.tool_output || '').substring(0, 500);
      if (errorText) {
        const llmResult = await classifyError(llmConfig, planningDir, errorText, agentType, data.session_id);
        if (llmResult && llmResult.category) {
          llmCategoryNote = `\nLLM error category: ${llmResult.category} (confidence: ${(llmResult.confidence * 100).toFixed(0)}%)`;
        }
      }
    } catch (_llmErr) {
      // Never propagate
    }
    const msg = `Warning: Agent ${agentType} completed but no ${outputSpec.description} was found.\nSkill-specific warnings:\n` +
      skillWarnings.map(w => `- ${w}`).join('\n') + llmCategoryNote;
    process.stdout.write(JSON.stringify({ additionalContext: msg }));
  } else if (genericMissing) {
    logHook('check-subagent-output', 'PostToolUse', 'warning', {
      agent_type: agentType,
      expected: outputSpec.description,
      found: 'none'
    });
    // LLM error classification — advisory enrichment
    let llmCategoryNote = '';
    try {
      const llmConfig = loadLocalLlmConfig(cwd);
      const errorText = (data.tool_output || '').substring(0, 500);
      if (errorText) {
        const llmResult = await classifyError(llmConfig, planningDir, errorText, agentType, data.session_id);
        if (llmResult && llmResult.category) {
          llmCategoryNote = `\nLLM error category: ${llmResult.category} (confidence: ${(llmResult.confidence * 100).toFixed(0)}%)`;
        }
      }
    } catch (_llmErr) {
      // Never propagate
    }
    const output = {
      additionalContext: `[WARN] Agent ${agentType} completed but no ${outputSpec.description} was found. Likely causes: (1) agent hit an error mid-run, (2) wrong working directory. To fix: re-run the parent skill — the executor gate will block until the output is present. Check the Task() output above for error details.` + llmCategoryNote
    };
    process.stdout.write(JSON.stringify(output));
  } else if (skillWarnings.length > 0) {
    logHook('check-subagent-output', 'PostToolUse', 'skill-warning', {
      skill: activeSkill,
      agent_type: agentType,
      warnings: skillWarnings
    });
    process.stdout.write(JSON.stringify({
      additionalContext: 'Skill-specific warnings:\n' + skillWarnings.map(w => `- ${w}`).join('\n')
    }));
  } else {
    logHook('check-subagent-output', 'PostToolUse', 'verified', {
      agent_type: agentType,
      found: found
    });
  }

  process.exit(0);
}

module.exports = { AGENT_OUTPUTS, findInPhaseDir, findInQuickDir, checkSummaryCommits, isRecent, getCurrentPhase, checkRoadmapStaleness };
if (require.main === module || process.argv[1] === __filename) { main(); }
