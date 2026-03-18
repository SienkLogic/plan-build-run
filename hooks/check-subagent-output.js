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
const { KNOWN_AGENTS, sessionLoad } = require('./pbr-tools');
const { resolveConfig } = require('./local-llm/health');
const { classifyError } = require('./local-llm/operations/classify-error');
const { resolveSessionPath } = require('./lib/core');
const { logEvent } = require('./event-logger');
const { recordOutcome } = require('./trust-tracker');
const { detectConventions, writeConventions } = require('./lib/convention-detector');

/**
 * Load a feature flag value from config.json.
 * @param {string} planningDir - Path to .planning directory
 * @param {string} flagName - Feature flag name (e.g. 'trust_tracking')
 * @returns {*} Flag value or undefined if not found
 */
function loadFeatureFlag(planningDir, flagName) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.features?.[flagName];
  } catch (_e) {
    return undefined;
  }
}

/**
 * Check whether trust tracking is enabled in config.
 * @param {string} planningDir - Path to .planning directory
 * @returns {boolean} True if trust_tracking is not explicitly disabled
 */
function shouldTrackTrust(planningDir) {
  const flag = loadFeatureFlag(planningDir, 'trust_tracking');
  return flag !== false;
}

/**
 * Extract verification outcome from the most recent VERIFICATION.md
 * in the current phase directory.
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ passed: boolean, category: string, mustHavesPassed: number|undefined, mustHavesTotal: number|undefined }|null}
 */
function extractVerificationOutcome(planningDir) {
  try {
    const verFiles = findInPhaseDir(planningDir, /^VERIFICATION\.md$/i);
    if (verFiles.length === 0) return null;

    const verPath = path.join(planningDir, verFiles[0]);
    const content = fs.readFileSync(verPath, 'utf8');
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return null;

    const fm = fmMatch[1];
    const statusMatch = fm.match(/^status:\s*(\S+)/mi);
    if (!statusMatch) return null;

    const status = statusMatch[1];
    const passed = status === 'passed';

    // Extract must_haves counts
    const passedMatch = fm.match(/^must_haves_passed:\s*(\d+)/mi);
    const totalMatch = fm.match(/^must_haves_total:\s*(\d+)/mi);
    const mustHavesPassed = passedMatch ? parseInt(passedMatch[1], 10) : undefined;
    const mustHavesTotal = totalMatch ? parseInt(totalMatch[1], 10) : undefined;

    // Extract category from STATE.md phase_slug
    let category = 'unknown';
    const stateFile = path.join(planningDir, 'STATE.md');
    if (fs.existsSync(stateFile)) {
      const stateContent = fs.readFileSync(stateFile, 'utf8');
      const slugMatch = stateContent.match(/^phase_slug:\s*"?([^"\n]+)"?/mi);
      if (slugMatch) {
        category = slugMatch[1].trim();
      }
    }

    return { passed, category, mustHavesPassed, mustHavesTotal };
  } catch (_e) {
    return null;
  }
}

/**
 * Check if a file was modified recently (within thresholdMs).
 * Returns false if file doesn't exist or on error.
 */
function isRecent(filePath, thresholdMs = 1800000) {
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
    description: 'INTEGRATION-REPORT.md in the phase directory',
    check: (planningDir) => findInPhaseDir(planningDir, /^INTEGRATION-REPORT\.md$/i)
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
  },
  'pbr:audit': {
    description: 'audit report in .planning/audits/',
    check: (planningDir) => {
      const auditsDir = path.join(planningDir, 'audits');
      if (!fs.existsSync(auditsDir)) return [];
      try {
        return fs.readdirSync(auditsDir)
          .filter(f => f.endsWith('.md'))
          .map(f => path.join('audits', f));
      } catch (_e) {
        return [];
      }
    }
  },
  'pbr:dev-sync': {
    description: 'advisory output (no file expected)',
    noFileExpected: true,
    check: () => []
  },
  'pbr:intel-updater': {
    description: 'intel files in .planning/intel/',
    check: (planningDir) => {
      const intelDir = path.join(planningDir, 'intel');
      if (!fs.existsSync(intelDir)) return [];
      try {
        return fs.readdirSync(intelDir)
          .filter(f => f.endsWith('.md') || f.endsWith('.json'))
          .map(f => path.join('intel', f));
      } catch (_e) {
        return [];
      }
    }
  },
  'pbr:ui-checker': {
    description: 'UI-REVIEW.md in the phase directory',
    check: (planningDir) => findInPhaseDir(planningDir, /^UI-REVIEW\.md$/i)
  },
  'pbr:ui-researcher': {
    description: 'UI-SPEC.md in the phase directory',
    check: (planningDir) => findInPhaseDir(planningDir, /^UI-SPEC\.md$/i)
  },
  'pbr:roadmapper': {
    description: 'ROADMAP.md in .planning/',
    check: (planningDir) => {
      const roadmapPath = path.join(planningDir, 'ROADMAP.md');
      if (fs.existsSync(roadmapPath)) {
        const result = ['ROADMAP.md'];
        if (!isRecent(roadmapPath)) {
          result._stale = true;
        }
        return result;
      }
      return [];
    }
  },
  'pbr:nyquist-auditor': {
    description: 'test files generated for phase coverage',
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

/**
 * Check SUMMARY.md deviations for Rule 3/4 (action: "ask") that require user review.
 * These deviations were flagged by the executor as needing human decision.
 *
 * @param {string} planningDir - Path to .planning/
 * @param {string[]} foundFiles - List of found output files (relative to planningDir)
 * @param {string[]} warnings - Array to push warnings into
 */
function checkDeviationsRequiringReview(planningDir, foundFiles, warnings) {
  const summaryFiles = foundFiles.filter(f => /SUMMARY/i.test(f));
  for (const relPath of summaryFiles) {
    try {
      const fullPath = path.join(planningDir, relPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fmMatch) continue;
      const fm = fmMatch[1];

      // Parse deviations block for items with action: "ask"
      const deviationsIdx = fm.indexOf('deviations:');
      if (deviationsIdx === -1) continue;

      const afterDeviations = fm.substring(deviationsIdx + 'deviations:'.length);
      const firstLine = afterDeviations.split(/\r?\n/)[0].trim();
      if (firstLine === '[]' || firstLine === 'none' || firstLine === '~' || firstLine === 'null') continue;

      const askDeviations = [];
      const lines = afterDeviations.split(/\r?\n/);
      let currentItem = null;

      for (const line of lines) {
        if (/^\s+-\s+rule:/.test(line)) {
          if (currentItem && currentItem.action === 'ask') askDeviations.push(currentItem);
          currentItem = {};
          const ruleMatch = line.match(/rule:\s*(\d+)/);
          if (ruleMatch) currentItem.rule = ruleMatch[1];
        } else if (currentItem) {
          if (/^[a-zA-Z_][a-zA-Z0-9_]*:/.test(line)) {
            if (currentItem.action === 'ask') askDeviations.push(currentItem);
            currentItem = null;
            break;
          }
          const actionMatch = line.match(/^\s+action:\s*["']?(\w+)/);
          if (actionMatch) currentItem.action = actionMatch[1];
          const descMatch = line.match(/^\s+description:\s*["']?(.+?)["']?\s*$/);
          if (descMatch) currentItem.description = descMatch[1];
        }
      }
      if (currentItem && currentItem.action === 'ask') askDeviations.push(currentItem);

      if (askDeviations.length > 0) {
        const descriptions = askDeviations
          .map(d => d.description || `Rule ${d.rule || '?'}`)
          .join('; ');
        warnings.push(`Executor flagged ${askDeviations.length} deviation(s) requiring review: ${descriptions}`);
      }
    } catch (_e) { /* best-effort */ }
  }
}

/**
 * Log a compliance violation to .planning/logs/compliance.jsonl.
 * These are surfaced to the user at session end by session-cleanup.js.
 * @param {string} planningDir - Path to .planning/
 * @param {string} agentType - Agent that violated
 * @param {string} violation - What was missing or wrong
 * @param {string} severity - 'required' or 'advisory'
 */
function logCompliance(planningDir, agentType, violation, severity) {
  try {
    const logsDir = path.join(planningDir, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(logsDir, 'compliance.jsonl');
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      agent: agentType,
      violation,
      severity
    });
    fs.appendFileSync(logFile, entry + '\n', 'utf8');
  } catch (_e) {
    // Best-effort — never crash the hook
  }
}

/**
 * Check that LEARNINGS.md exists in the current phase directory.
 * LEARNINGS.md is REQUIRED for all agents — every agent must document what it learned.
 * @param {string} planningDir - Path to .planning/
 * @param {string[]} warnings - Mutable warnings array to push into
 * @param {string} agentLabel - Human-readable agent label for the warning message
 */
function checkLearningsRequired(planningDir, warnings, agentLabel) {
  const learningsFiles = findInPhaseDir(planningDir, /^LEARNINGS\.md$/i);
  if (learningsFiles.length === 0) {
    warnings.push(`[REQUIRED] No LEARNINGS.md found in phase directory. The ${agentLabel} agent MUST write LEARNINGS.md documenting what it learned — patterns discovered, pitfalls avoided, decisions made. This is required for cross-phase knowledge transfer.`);
  }
}

// Skill-specific check lookup table keyed by 'activeSkill:agentType'
const SKILL_CHECKS = {
  'begin:pbr:planner': {
    description: 'begin planner core files',
    check: (planningDir, _found, warnings) => {
      const coreFiles = ['REQUIREMENTS.md', 'ROADMAP.md', 'STATE.md'];
      for (const f of coreFiles) {
        if (!fs.existsSync(path.join(planningDir, f))) {
          warnings.push(`Begin planner: ${f} was not created. The project may be in an incomplete state.`);
        }
      }
    }
  },
  'plan:pbr:researcher': {
    description: 'plan researcher phase-level RESEARCH.md and LEARNINGS.md',
    check: (planningDir, found, warnings) => {
      const phaseResearch = findInPhaseDir(planningDir, /^RESEARCH\.md$/i);
      if (found.length === 0 && phaseResearch.length === 0) {
        warnings.push('Plan researcher: No research output found in .planning/research/ or in the phase directory.');
      }
      checkLearningsRequired(planningDir, warnings, 'researcher');
    }
  },
  'plan:pbr:planner': {
    description: 'plan planner LEARNINGS.md',
    check: (planningDir, _found, warnings) => {
      checkLearningsRequired(planningDir, warnings, 'planner');
    }
  },
  'scan:pbr:codebase-mapper': {
    description: 'scan codebase-mapper 4 focus areas',
    check: (planningDir, _found, warnings) => {
      const expectedAreas = ['tech', 'arch', 'quality', 'concerns'];
      const codebaseDir = path.join(planningDir, 'codebase');
      if (fs.existsSync(codebaseDir)) {
        try {
          const files = fs.readdirSync(codebaseDir).map(f => f.toLowerCase());
          for (const area of expectedAreas) {
            if (!files.some(f => f.includes(area))) {
              warnings.push(`Scan mapper: No output file containing "${area}" found in .planning/codebase/. One of the 4 mappers may have failed.`);
            }
          }
        } catch (_e) { /* best-effort */ }
      }
    }
  },
  'review:pbr:verifier': {
    description: 'review verifier VERIFICATION.md status, LEARNINGS.md, and trust update',
    check: (planningDir, _found, warnings) => {
      const verFiles = findInPhaseDir(planningDir, /^VERIFICATION\.md$/i);
      for (const vf of verFiles) {
        try {
          const content = fs.readFileSync(path.join(planningDir, vf), 'utf8');
          const statusMatch = content.match(/^status:\s*(\S+)/mi);
          if (statusMatch && statusMatch[1] === 'gaps_found') {
            warnings.push('Review verifier: VERIFICATION.md has status "gaps_found" — ensure gaps are surfaced to the user.');
          }
        } catch (_e) { /* best-effort */ }
      }
      checkLearningsRequired(planningDir, warnings, 'verifier');

      // Trust score update: record verification outcome
      try {
        if (!shouldTrackTrust(planningDir)) return;
        const outcome = extractVerificationOutcome(planningDir);
        if (!outcome) return;
        recordOutcome(planningDir, 'pbr:executor', outcome.category, outcome.passed);
        recordOutcome(planningDir, 'pbr:verifier', outcome.category, true);
        logHook('check-subagent-output', 'PostToolUse', 'trust-updated', {
          agent: 'pbr:executor',
          category: outcome.category,
          passed: outcome.passed
        });
      } catch (_e) {
        // Never crash the hook for trust tracking failures
      }
    }
  },
  'build:pbr:executor': {
    description: 'build executor SUMMARY commits, self-check, LEARNINGS.md, and convention update',
    check: (planningDir, found, warnings) => {
      checkSummaryCommits(planningDir, found, warnings);
      // Check for deviations requiring user review (Rule 3/4 with action: "ask")
      checkDeviationsRequiringReview(planningDir, found, warnings);
      // Validate self-verification ran when feature is enabled
      const summaryFiles = found.filter(f => /SUMMARY/i.test(f));
      for (const relPath of summaryFiles) {
        try {
          const fullPath = path.join(planningDir, relPath);
          const { resolveConfig } = require('./lib/config');
          const config = resolveConfig(planningDir);
          const selfCheckWarnings = validateSelfCheck(fullPath, config);
          warnings.push(...selfCheckWarnings);
        } catch (_e) { /* best-effort */ }
      }
      // Extract feedback for agent prompt enrichment
      try {
        const { extractFeedback, isEnabled } = require('./feedback-loop');
        if (isEnabled(planningDir)) {
          const phaseDirMatches = found.filter(f => /^phases[/\\]/.test(f));
          const phaseDir = phaseDirMatches.length > 0
            ? path.join(planningDir, phaseDirMatches[0].split(/[/\\]/).slice(0, 2).join(path.sep))
            : null;
          if (phaseDir) {
            const feedback = extractFeedback(phaseDir);
            if (feedback) {
              warnings.push(`Feedback loop: ${feedback.summary || 'verification feedback recorded'}`);
            }
          }
        }
      } catch (_e) { /* best-effort */ }
      checkLearningsRequired(planningDir, warnings, 'executor');
      // Log post-hoc skip for non-quick executors (audit evidence)
      logEvent('post_hoc', 'post_hoc_skipped', { reason: 'not_quick_task', feature: 'post_hoc_artifacts' });
      // Update conventions after successful build
      updateConventionsAfterBuild(planningDir);
      // Log inline execution decision for audit
      try {
        const inlineSignal = path.join(planningDir, '.inline-active');
        const wasInline = fs.existsSync(inlineSignal);
        logInlineDecision(planningDir, {
          inline: wasInline,
          decision: wasInline ? 'inline' : 'delegate',
          reason: wasInline ? 'signal file present' : 'normal task spawn',
          taskCount: found.filter(f => /SUMMARY/i.test(f)).length,
          fileCount: 0
        });
      } catch (_e) { /* best-effort — never crash for audit logging */ }
    }
  },
  'quick:pbr:executor': {
    description: 'quick executor SUMMARY commits and post-hoc generation',
    check: (planningDir, found, warnings) => {
      checkSummaryCommits(planningDir, found, warnings);
      // Post-hoc SUMMARY.md generation for quick tasks
      const postHocEnabled = loadFeatureFlag(planningDir, 'post_hoc_artifacts');
      if (postHocEnabled === false) {
        logEvent('post_hoc', 'post_hoc_skipped', { reason: 'feature_disabled', feature: 'post_hoc_artifacts' });
        return;
      }
      // Check if SUMMARY.md is missing in the quick dir
      const quickSummaries = findInQuickDir(planningDir, /^SUMMARY.*\.md$/i);
      if (quickSummaries.length > 0) return; // Already exists, no need for post-hoc
      // Find the latest quick task directory
      const quickDir = path.join(planningDir, 'quick');
      if (!fs.existsSync(quickDir)) return;
      try {
        const dirs = fs.readdirSync(quickDir)
          .filter(d => /^\d{3}-/.test(d))
          .sort()
          .reverse();
        if (dirs.length === 0) return;
        const taskDir = path.join(quickDir, dirs[0]);
        const taskSlug = dirs[0];
        // Attempt post-hoc generation
        try {
          const { generateSummary } = require('../../../plan-build-run/bin/lib/post-hoc.cjs');
          const projectRoot = path.resolve(planningDir, '..');
          const result = generateSummary(projectRoot, taskDir, {
            commitPattern: taskSlug.replace(/^(\d{3})-.*/, 'quick-$1')
          });
          logEvent('post_hoc', 'post_hoc_summary_generated', {
            taskDir: taskSlug,
            commitCount: result.commitCount,
            feature: 'post_hoc_artifacts',
            timestamp: new Date().toISOString()
          });
          warnings.push(`SUMMARY.md auto-generated post-hoc for quick task ${taskSlug} (${result.commitCount} commits found)`);
        } catch (_genErr) {
          logEvent('post_hoc', 'post_hoc_generation_failed', {
            taskDir: taskSlug,
            error: _genErr.message,
            feature: 'post_hoc_artifacts'
          });
        }
      } catch (_e) { /* best-effort */ }
    }
  },
  'begin:pbr:researcher': {
    description: 'begin researcher YAML frontmatter validation',
    check: (planningDir, found, warnings) => {
      const EXPECTED_NAMES = ['STACK.md', 'FEATURES.md', 'ARCHITECTURE.md', 'PITFALLS.md'];
      for (const relPath of found) {
        const basename = path.basename(relPath);
        // Skip SUMMARY.md -- that's synthesizer output
        if (basename.toUpperCase() === 'SUMMARY.MD') continue;
        try {
          // Warn if unexpected filename
          if (!EXPECTED_NAMES.includes(basename)) {
            warnings.push(`${basename}: unexpected research file name. Expected one of: ${EXPECTED_NAMES.join(', ')}`);
          }
          // Read and validate YAML frontmatter
          const fullPath = path.join(planningDir, relPath);
          const content = fs.readFileSync(fullPath, 'utf8');
          const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (!fmMatch) {
            warnings.push(`${basename}: YAML frontmatter is missing. Researcher output must include frontmatter with confidence and sources_checked fields.`);
            continue;
          }
          const fm = fmMatch[1];
          if (!/confidence\s*:/i.test(fm)) {
            warnings.push(`${basename}: frontmatter missing "confidence" field.`);
          }
          if (!/sources_checked\s*:/i.test(fm)) {
            warnings.push(`${basename}: frontmatter missing "sources_checked" field.`);
          }
        } catch (_e) { /* best-effort */ }
      }
    }
  },
  'begin:pbr:roadmapper': {
    description: 'begin roadmapper LEARNINGS.md',
    check: (planningDir, _found, warnings) => {
      checkLearningsRequired(planningDir, warnings, 'roadmapper');
    }
  },
  'debug:pbr:debugger': {
    description: 'debug agent LEARNINGS.md',
    check: (planningDir, _found, warnings) => {
      // Debugger writes to .planning/debug/ — check LEARNINGS there
      const debugDir = path.join(planningDir, 'debug');
      if (!fs.existsSync(debugDir)) return;
      try {
        const files = fs.readdirSync(debugDir);
        const hasLearnings = files.some(f => /^LEARNINGS/i.test(f));
        if (!hasLearnings) {
          warnings.push('[REQUIRED] No LEARNINGS.md found in .planning/debug/. The debugger agent MUST document what it learned — root causes found, debugging approaches that worked, environment quirks discovered.');
        }
      } catch (_e) { /* best-effort */ }
    }
  },
  'begin:pbr:synthesizer': {
    description: 'begin synthesizer SUMMARY.md structure validation',
    check: (planningDir, found, warnings) => {
      // Check for SUMMARY.md in research directory
      const researchDir = path.join(planningDir, 'research');
      const summaryPath = path.join(researchDir, 'SUMMARY.md');
      try {
        if (!fs.existsSync(summaryPath)) {
          warnings.push('SUMMARY.md not found in .planning/research/. Synthesizer must produce a SUMMARY.md.');
          return;
        }
        const content = fs.readFileSync(summaryPath, 'utf8');
        // Check for Research Coverage table
        if (!/research\s+coverage/i.test(content)) {
          warnings.push('SUMMARY.md missing "Research Coverage" table.');
        }
        // Check for Confidence Assessment table
        if (!/confidence\s+assessment/i.test(content)) {
          warnings.push('SUMMARY.md missing "Confidence Assessment" table.');
        }
        // Check all 4 dimensions are referenced
        const dimensions = ['Stack', 'Features', 'Architecture', 'Pitfalls'];
        for (const dim of dimensions) {
          if (!new RegExp(dim, 'i').test(content)) {
            warnings.push(`SUMMARY.md missing dimension: ${dim}. All 4 research dimensions must be covered.`);
          }
        }
      } catch (_e) { /* best-effort */ }
    }
  },
  'milestone:pbr:general': {
    description: 'milestone archive completeness validation',
    check: (planningDir, _found, warnings) => {
      // After milestone completion, verify the archive structure
      const milestonesDir = path.join(planningDir, 'milestones');
      if (!fs.existsSync(milestonesDir)) return;

      try {
        // Find the most recent milestone archive (highest version)
        const archiveDirs = fs.readdirSync(milestonesDir)
          .filter(d => d.startsWith('v') && fs.statSync(path.join(milestonesDir, d)).isDirectory())
          .sort()
          .reverse();

        if (archiveDirs.length === 0) return;

        const latestArchive = path.join(milestonesDir, archiveDirs[0]);
        const archiveFiles = fs.readdirSync(latestArchive);

        // Check for required archive files
        if (!archiveFiles.includes('ROADMAP.md')) {
          warnings.push(`[REQUIRED] Milestone archive ${archiveDirs[0]}: missing ROADMAP.md snapshot`);
        }
        if (!archiveFiles.includes('STATS.md')) {
          warnings.push(`[REQUIRED] Milestone archive ${archiveDirs[0]}: missing STATS.md summary`);
        }

        // Check for phases/ subdirectory with per-phase artifacts
        const archivePhasesDir = path.join(latestArchive, 'phases');
        if (fs.existsSync(archivePhasesDir)) {
          const phaseDirs = fs.readdirSync(archivePhasesDir)
            .filter(d => fs.statSync(path.join(archivePhasesDir, d)).isDirectory());

          for (const pd of phaseDirs) {
            const phaseFiles = fs.readdirSync(path.join(archivePhasesDir, pd));
            const hasPlan = phaseFiles.some(f => /^PLAN/i.test(f));
            const hasSummary = phaseFiles.some(f => /^SUMMARY/i.test(f));
            const hasVerification = phaseFiles.some(f => f === 'VERIFICATION.md');

            if (!hasPlan) warnings.push(`[REQUIRED] Archive phase ${pd}: missing PLAN.md`);
            if (!hasSummary) warnings.push(`[REQUIRED] Archive phase ${pd}: missing SUMMARY.md`);
            if (!hasVerification) warnings.push(`[REQUIRED] Archive phase ${pd}: missing VERIFICATION.md`);
          }
        } else {
          warnings.push(`[REQUIRED] Milestone archive ${archiveDirs[0]}: missing phases/ subdirectory`);
        }
      } catch (_e) { /* best-effort */ }
    }
  }
};

/**
 * Update convention patterns after a build executor completes.
 * Gated by features.convention_memory config toggle.
 * Non-fatal — convention detection failure never crashes the hook.
 *
 * @param {string} planningDir - Path to .planning directory
 */
function updateConventionsAfterBuild(planningDir) {
  try {
    const config = loadFeatureFlag(planningDir, 'convention_memory');
    if (config === false) return;

    const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
    const conventions = detectConventions(cwd);
    const totalPatterns = Object.values(conventions).reduce((sum, arr) => sum + arr.length, 0);
    if (totalPatterns > 0) {
      writeConventions(planningDir, conventions);
      logHook('check-subagent-output', 'PostToolUse', 'conventions-updated', { patterns: totalPatterns });
    }
  } catch (_e) {
    // Convention detection failure is non-fatal
    logHook('check-subagent-output', 'PostToolUse', 'conventions-failed', { error: _e.message });
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
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const planningDir = path.join(cwd, '.planning');

  // Only relevant for Plan-Build-Run projects
  if (!fs.existsSync(planningDir)) {
    process.exit(0);
  }

  // Extract agent type from the Task completion data
  const agentType = data.agent_type || data.tool_input?.subagent_type || data.subagent_type || '';

  // Only check known Plan-Build-Run agent types
  const outputSpec = AGENT_OUTPUTS[agentType];
  if (!outputSpec) {
    // Log when agent is in KNOWN_AGENTS but missing from AGENT_OUTPUTS
    const shortName = agentType.startsWith('pbr:') ? agentType.slice(4) : agentType;
    if (KNOWN_AGENTS && KNOWN_AGENTS.includes && KNOWN_AGENTS.includes(shortName)) {
      logHook('check-subagent-output', 'PostToolUse', 'missing-output-spec', {
        agent_type: agentType,
        message: `Agent ${agentType} is in KNOWN_AGENTS but has no AGENT_OUTPUTS entry. Add one to check-subagent-output.js.`
      });
    }
    process.exit(0);
  }

  // Read active skill — session-scoped when session_id available
  const sessionId = data.session_id || null;
  let activeSkill = sessionLoad(planningDir, sessionId).activeSkill || '';
  if (!activeSkill) {
    const skillPath = sessionId
      ? resolveSessionPath(planningDir, '.active-skill', sessionId)
      : path.join(planningDir, '.active-skill');
    try { activeSkill = fs.readFileSync(skillPath, 'utf8').trim(); } catch (_) { /* file missing */ }
  }

  // Check for expected outputs
  const found = outputSpec.check(planningDir);

  const genericMissing = found.length === 0 && !outputSpec.noFileExpected;

  // Skill-specific post-completion validation
  const skillWarnings = [];

  // ACTIVE-SKILL ENFORCEMENT: Auto-create .active-skill when missing.
  // Skills are instructed (with CRITICAL markers) to write this file, but LLMs
  // skip it under cognitive load. Instead of just warning, we now auto-create
  // the file by inferring the skill from the agent type.
  if (!activeSkill && agentType !== 'pbr:general' && agentType !== 'pbr:plan-checker' && agentType !== 'pbr:integration-checker') {
    // Infer skill from agent type: pbr:executor -> "build", pbr:planner -> "plan", etc.
    const AGENT_TO_SKILL = {
      'pbr:executor': 'build', 'pbr:planner': 'plan', 'pbr:verifier': 'review',
      'pbr:researcher': 'plan', 'pbr:synthesizer': 'plan', 'pbr:roadmapper': 'begin',
      'pbr:debugger': 'debug', 'pbr:codebase-mapper': 'begin', 'pbr:nyquist-auditor': 'test'
    };
    const inferredSkill = AGENT_TO_SKILL[agentType];
    if (inferredSkill) {
      try {
        const skillPath = sessionId
          ? resolveSessionPath(planningDir, '.active-skill', sessionId)
          : path.join(planningDir, '.active-skill');
        fs.writeFileSync(skillPath, inferredSkill, 'utf8');
        activeSkill = inferredSkill;
        logHook('check-subagent-output', 'PostToolUse', 'active-skill-auto-created', { skill: inferredSkill, agent: agentType });
        skillWarnings.push(`.active-skill was missing — auto-created as "${inferredSkill}" (inferred from ${agentType}). Skill-specific enforcement is now active for subsequent agents.`);
      } catch (_writeErr) {
        skillWarnings.push('.active-skill file is missing and auto-creation failed. Skill-workflow guards were inactive for this operation.');
      }
    } else {
      skillWarnings.push('.active-skill file is missing — the orchestrating skill never wrote it. This means skill-workflow guards were inactive for this entire operation. CRITICAL: Write the skill name to .planning/.active-skill BEFORE spawning agents.');
    }
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

  // Skill-specific dispatch via SKILL_CHECKS lookup
  const skillCheckKey = `${activeSkill}:${agentType}`;
  const skillCheck = SKILL_CHECKS[skillCheckKey];
  if (skillCheck) {
    skillCheck.check(planningDir, found, skillWarnings);
  }

  // Completion marker validation for executor agents
  if (agentType === 'pbr:executor') {
    const toolOutput = data.tool_output || '';
    const hasCompletionMarker = /## PLAN COMPLETE|## PLAN FAILED|## CHECKPOINT:/i.test(toolOutput);
    if (toolOutput && !hasCompletionMarker) {
      skillWarnings.push('Executor did not return a completion marker (expected ## PLAN COMPLETE, ## PLAN FAILED, or ## CHECKPOINT:). Build skill may not route correctly.');
    }

    // Self-Check section validation in SUMMARY.md body
    if (found.length > 0) {
      const summaryFiles = found.filter(f => /SUMMARY/i.test(f));
      let hasSelfCheckSection = false;
      for (const relPath of summaryFiles) {
        try {
          const fullPath = path.join(planningDir, relPath);
          const content = fs.readFileSync(fullPath, 'utf8');
          if (/^## Self-Check:\s*(PASSED|FAILED)/mi.test(content)) {
            hasSelfCheckSection = true;
            break;
          }
        } catch (_e) { /* best-effort */ }
      }
      if (!hasSelfCheckSection) {
        skillWarnings.push('Executor SUMMARY.md missing ## Self-Check section. Self-verification may have been skipped.');
      }
    }
  }

  // Log compliance violations for tracking and session-end summary
  if (genericMissing) {
    logCompliance(planningDir, agentType, `Missing expected output: ${outputSpec.description}`, 'required');
  }
  for (const w of skillWarnings) {
    if (w.startsWith('[REQUIRED]')) {
      logCompliance(planningDir, agentType, w.replace('[REQUIRED] ', ''), 'required');
    }
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

/**
 * HTTP handler for hook-server.js integration.
 * Called as handleHttp(reqBody, cache) where reqBody = { event, tool, data, planningDir, cache }.
 * Must NOT call process.exit().
 * @param {{ data: object, planningDir: string }} reqBody
 * @returns {Promise<{ additionalContext: string }|null>}
 */
async function handleHttp(reqBody) {
  const data = reqBody.data || {};
  const planningDir = reqBody.planningDir;
  if (!planningDir || !fs.existsSync(planningDir)) return null;

  const agentType = data.agent_type || data.tool_input?.subagent_type || data.subagent_type || '';
  const outputSpec = AGENT_OUTPUTS[agentType];
  if (!outputSpec) {
    const shortName = agentType.startsWith('pbr:') ? agentType.slice(4) : agentType;
    if (KNOWN_AGENTS && KNOWN_AGENTS.includes && KNOWN_AGENTS.includes(shortName)) {
      logHook('check-subagent-output', 'PostToolUse', 'missing-output-spec', {
        agent_type: agentType,
        message: `Agent ${agentType} is in KNOWN_AGENTS but has no AGENT_OUTPUTS entry. Add one to check-subagent-output.js.`
      });
    }
    return null;
  }

  const sessionId = data.session_id || null;
  let activeSkill = sessionLoad(planningDir, sessionId).activeSkill || '';
  if (!activeSkill) {
    const skillPath = sessionId
      ? resolveSessionPath(planningDir, '.active-skill', sessionId)
      : path.join(planningDir, '.active-skill');
    try { activeSkill = fs.readFileSync(skillPath, 'utf8').trim(); } catch (_) { /* file missing */ }
  }

  const found = outputSpec.check(planningDir);
  const genericMissing = found.length === 0 && !outputSpec.noFileExpected;
  const skillWarnings = [];

  if (!activeSkill && agentType !== 'pbr:general' && agentType !== 'pbr:plan-checker' && agentType !== 'pbr:integration-checker') {
    const AGENT_TO_SKILL = {
      'pbr:executor': 'build', 'pbr:planner': 'plan', 'pbr:verifier': 'review',
      'pbr:researcher': 'plan', 'pbr:synthesizer': 'plan', 'pbr:roadmapper': 'begin',
      'pbr:debugger': 'debug', 'pbr:codebase-mapper': 'begin', 'pbr:nyquist-auditor': 'test'
    };
    const inferredSkill = AGENT_TO_SKILL[agentType];
    if (inferredSkill) {
      try {
        const skillPath = sessionId
          ? resolveSessionPath(planningDir, '.active-skill', sessionId)
          : path.join(planningDir, '.active-skill');
        fs.writeFileSync(skillPath, inferredSkill, 'utf8');
        activeSkill = inferredSkill;
        logHook('check-subagent-output', 'PostToolUse', 'active-skill-auto-created', { skill: inferredSkill, agent: agentType });
        skillWarnings.push(`.active-skill was missing — auto-created as "${inferredSkill}" (inferred from ${agentType}).`);
      } catch (_writeErr) {
        skillWarnings.push('.active-skill file is missing and auto-creation failed.');
      }
    } else {
      skillWarnings.push('.active-skill file is missing — the orchestrating skill never wrote it. CRITICAL: Write the skill name to .planning/.active-skill BEFORE spawning agents.');
    }
  }

  if (agentType === 'pbr:executor' || agentType === 'pbr:verifier') {
    const roadmapWarning = checkRoadmapStaleness(planningDir);
    if (roadmapWarning) skillWarnings.push(roadmapWarning);
  }

  if (found._stale && (agentType === 'pbr:researcher' || agentType === 'pbr:synthesizer')) {
    const label = agentType === 'pbr:researcher' ? 'Researcher' : 'Synthesizer';
    skillWarnings.push(`${label} output may be stale — no recent output files detected.`);
  }

  const skillCheckKey = `${activeSkill}:${agentType}`;
  const skillCheck = SKILL_CHECKS[skillCheckKey];
  if (skillCheck) skillCheck.check(planningDir, found, skillWarnings);

  // Completion marker validation for executor agents
  if (agentType === 'pbr:executor') {
    const toolOutput = data.tool_output || '';
    const hasCompletionMarker = /## PLAN COMPLETE|## PLAN FAILED|## CHECKPOINT:/i.test(toolOutput);
    if (toolOutput && !hasCompletionMarker) {
      skillWarnings.push('Executor did not return a completion marker (expected ## PLAN COMPLETE, ## PLAN FAILED, or ## CHECKPOINT:). Build skill may not route correctly.');
    }

    // Self-Check section validation in SUMMARY.md body
    if (found.length > 0) {
      const summaryFiles = found.filter(f => /SUMMARY/i.test(f));
      let hasSelfCheckSection = false;
      for (const relPath of summaryFiles) {
        try {
          const fullPath = path.join(planningDir, relPath);
          const content = fs.readFileSync(fullPath, 'utf8');
          if (/^## Self-Check:\s*(PASSED|FAILED)/mi.test(content)) {
            hasSelfCheckSection = true;
            break;
          }
        } catch (_e) { /* best-effort */ }
      }
      if (!hasSelfCheckSection) {
        skillWarnings.push('Executor SUMMARY.md missing ## Self-Check section. Self-verification may have been skipped.');
      }
    }
  }

  // LLM classification helper (advisory, never throws)
  async function getLlmNote() {
    try {
      const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
      const llmConfig = loadLocalLlmConfig(cwd);
      const errorText = (data.tool_output || '').substring(0, 500);
      if (!errorText) return '';
      const llmResult = await classifyError(llmConfig, planningDir, errorText, agentType, data.session_id);
      if (llmResult && llmResult.category) {
        return `\nLLM error category: ${llmResult.category} (confidence: ${(llmResult.confidence * 100).toFixed(0)}%)`;
      }
    } catch (_e) { /* never propagate */ }
    return '';
  }

  if (genericMissing && skillWarnings.length > 0) {
    logHook('check-subagent-output', 'PostToolUse', 'skill-warning', { skill: activeSkill, agent_type: agentType, warnings: skillWarnings });
    const llmCategoryNote = await getLlmNote();
    const msg = `Warning: Agent ${agentType} completed but no ${outputSpec.description} was found.\nSkill-specific warnings:\n` +
      skillWarnings.map(w => `- ${w}`).join('\n') + llmCategoryNote;
    return { additionalContext: msg };
  } else if (genericMissing) {
    logHook('check-subagent-output', 'PostToolUse', 'warning', { agent_type: agentType, expected: outputSpec.description, found: 'none' });
    const llmCategoryNote = await getLlmNote();
    return {
      additionalContext: `[WARN] Agent ${agentType} completed but no ${outputSpec.description} was found. Likely causes: (1) agent hit an error mid-run, (2) wrong working directory. To fix: re-run the parent skill — the executor gate will block until the output is present. Check the Task() output above for error details.` + llmCategoryNote
    };
  } else if (skillWarnings.length > 0) {
    logHook('check-subagent-output', 'PostToolUse', 'skill-warning', { skill: activeSkill, agent_type: agentType, warnings: skillWarnings });
    return { additionalContext: 'Skill-specific warnings:\n' + skillWarnings.map(w => `- ${w}`).join('\n') };
  } else {
    logHook('check-subagent-output', 'PostToolUse', 'verified', { agent_type: agentType, found: found });
    return null;
  }
}

/**
 * Log an inline execution decision to .planning/logs/hooks.jsonl for audit evidence.
 * Called by the build skill orchestrator after running shouldInlineExecution.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} decision - Result from shouldInlineExecution
 * @param {boolean} decision.inline - Whether inline execution was chosen
 * @param {string} [decision.reason] - Reason for the decision
 * @param {number} [decision.taskCount] - Number of tasks in the plan
 * @param {number} [decision.fileCount] - Number of files in the plan
 * @param {number} [decision.estimatedLines] - Estimated lines of code
 */
function logInlineDecision(planningDir, decision) {
  try {
    const logsDir = path.join(planningDir, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(logsDir, 'hooks.jsonl');
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      hook: 'inline-execution-gate',
      decision: decision.inline ? 'inline' : 'delegate',
      reason: decision.reason || null,
      taskCount: decision.taskCount || 0,
      fileCount: decision.fileCount || 0,
      estimatedLines: decision.estimatedLines || 0
    });
    fs.appendFileSync(logFile, entry + '\n', 'utf8');
  } catch (_e) {
    // Best-effort — never crash the caller
  }
}

/**
 * Validate self-verification data in an executor SUMMARY.md file.
 */
function validateSelfCheck(summaryPath, config) {
  if (!config || !config.features || !config.features.self_verification) {
    return [];
  }
  const warnings = [];
  try {
    const content = fs.readFileSync(summaryPath, 'utf8');
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) {
      warnings.push('Executor SUMMARY.md missing self_check field — self-verification may not have run');
      return warnings;
    }
    const fm = fmMatch[1];
    if (!/self_check\s*:/i.test(fm)) {
      warnings.push('Executor SUMMARY.md missing self_check field — self-verification may not have run');
      return warnings;
    }
    const failedMatch = fm.match(/failed\s*:\s*(\d+)/);
    const retriesMatch = fm.match(/retries\s*:\s*(\d+)/);
    if (failedMatch && parseInt(failedMatch[1], 10) > 0) {
      const failed = failedMatch[1];
      const retries = retriesMatch ? retriesMatch[1] : '0';
      warnings.push(`Executor self-check reported ${failed} failed must-haves after ${retries} retries`);
    }
  } catch (_e) { /* skip gracefully */ }
  return warnings;
}

module.exports = { AGENT_OUTPUTS, SKILL_CHECKS, findInPhaseDir, findInQuickDir, checkSummaryCommits, checkDeviationsRequiringReview, isRecent, getCurrentPhase, checkRoadmapStaleness, logInlineDecision, handleHttp, extractVerificationOutcome, shouldTrackTrust, loadFeatureFlag, updateConventionsAfterBuild, validateSelfCheck };
if (require.main === module || process.argv[1] === __filename) { main(); }
