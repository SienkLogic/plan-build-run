'use strict';

/**
 * Session briefing module — extracted from progress-tracker.js.
 * Contains all session briefing, context building, and state awareness functions.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { logHook } = require('../hook-logger');
const { configLoad } = require('../pbr-tools');
const { intelStatus } = require('../../plan-build-run/bin/lib/intel.cjs');
const { loadLatestSnapshot, formatSnapshotBriefing } = require('./snapshot-manager');
const { loadConventions, formatConventionBriefing } = require('./convention-detector');

const FAILURE_DECISIONS = /^(block|error|warn|warning|block-coauthor|block-sensitive|unlink-failed)$/;
const HOOK_HEALTH_MAX_ENTRIES = 50;

function extractSection(content, heading) {
  const regex = new RegExp(`##\\s+${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const match = content.match(regex);
  if (!match) return null;
  const section = match[1].trim();
  // Return first 5 lines max
  return section.split('\n').slice(0, 5).join('\n');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findContinueFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findContinueFiles(fullPath));
      } else if (entry.name.includes('.continue-here')) {
        results.push(path.relative(dir, fullPath));
      }
    }
  } catch (_e) {
    // Ignore permission errors
  }
  return results;
}

function countNotes(notesDir) {
  try {
    if (!fs.existsSync(notesDir)) return 0;
    const files = fs.readdirSync(notesDir).filter(f => f.endsWith('.md'));
    let count = 0;
    for (const file of files) {
      const content = fs.readFileSync(path.join(notesDir, file), 'utf8');
      if (!content.includes('promoted: true')) count++;
    }
    return count;
  } catch (_e) {
    return 0;
  }
}

/**
 * Return arch.md content as context injection when intel.inject_on_start is true.
 * Truncates to ~2000 chars (~500 tokens) to keep context lean.
 */
function getIntelContext(planningDir, config) {
  if (!config || config.intel?.enabled === false) return '';
  if (config.intel?.inject_on_start !== true) return '';

  const archPath = path.join(planningDir, 'intel', 'arch.md');
  try {
    if (!fs.existsSync(archPath)) return '';
    let content = fs.readFileSync(archPath, 'utf8');
    if (content.length > 2000) {
      content = content.substring(0, 2000);
    }
    return '\n## Codebase Intelligence\n' + content;
  } catch (_e) {
    return '';
  }
}

/**
 * Return a staleness warning when any intel file is >24h old.
 */
function getIntelStalenessWarning(planningDir, config) {
  if (!config || config.intel?.enabled === false) return '';

  try {
    const result = intelStatus(planningDir);
    if (result.disabled) return '';
    if (!result.overall_stale) return '';

    const staleFiles = Object.entries(result.files)
      .filter(([_name, info]) => info.stale)
      .map(([name]) => name);

    return `\nWarning: Intel data is stale (${staleFiles.join(', ')}). Run /pbr:intel update to refresh.`;
  } catch (_e) {
    return '';
  }
}

function getHookHealthSummary(planningDir) {
  const logPath = path.join(planningDir, 'logs', 'hooks.jsonl');
  try {
    if (!fs.existsSync(logPath)) return null;
    const content = fs.readFileSync(logPath, 'utf8').trim();
    if (!content) return null;

    const lines = content.split('\n');
    const recent = lines.slice(-HOOK_HEALTH_MAX_ENTRIES);

    const failuresByHook = {};
    let totalFailures = 0;

    for (const line of recent) {
      try {
        const entry = JSON.parse(line);
        if (entry.decision && FAILURE_DECISIONS.test(entry.decision)) {
          const hookName = entry.hook || 'unknown';
          failuresByHook[hookName] = (failuresByHook[hookName] || 0) + 1;
          totalFailures++;
        }
      } catch (_e) {
        // Skip malformed lines
      }
    }

    if (totalFailures === 0) return null;

    const sorted = Object.entries(failuresByHook)
      .sort((a, b) => b[1] - a[1])
      .map(([hook, count]) => `${hook}: ${count}`)
      .join(', ');

    return `Hook health: ${totalFailures} failure${totalFailures !== 1 ? 's' : ''} in last ${recent.length} entries (${sorted})`;
  } catch (_e) {
    return null;
  }
}

/**
 * Check learnings deferral thresholds and return notification strings.
 */
function checkLearningsDeferrals(_planningDir) {
  try {
    const { checkDeferralThresholds } = require('./learnings');
    const triggered = checkDeferralThresholds();
    return triggered.map(t => `  - ${t.key}: ${t.trigger} met -- consider implementing deferred feature`);
  } catch (_e) {
    return [];
  }
}

/**
 * Detect other active sessions by scanning .sessions/ directory.
 */
function detectOtherSessions(planningDir, ownSessionId) {
  const sessionsDir = path.join(planningDir, '.sessions');
  if (!fs.existsSync(sessionsDir)) return [];

  const results = [];
  try {
    const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ownSessionId) continue;

      const dirPath = path.join(sessionsDir, entry.name);
      let age = 0;
      let pid = null;
      let skill = null;

      const metaPath = path.join(dirPath, 'meta.json');
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        age = Math.round((Date.now() - new Date(meta.created).getTime()) / 60000);
        pid = meta.pid || null;
      } catch (_e) {
        try {
          const stats = fs.statSync(dirPath);
          age = Math.round((Date.now() - stats.mtimeMs) / 60000);
        } catch (_statErr) {
          continue;
        }
      }

      const skillPath = path.join(dirPath, '.active-skill');
      try {
        skill = fs.readFileSync(skillPath, 'utf8').trim() || null;
      } catch (_e) {
        // No active skill
      }

      results.push({ sessionId: entry.name, skill, age, pid });
    }
  } catch (_e) {
    // Best-effort
  }

  return results;
}

/**
 * Build an enhanced structured briefing for SessionStart.
 */
function buildEnhancedBriefing(planningDir, config) {
  if (!config || config.features?.enhanced_session_start !== true) {
    return null;
  }

  const lines = [];
  lines.push('[PBR Session Briefing]');

  const stateFile = path.join(planningDir, 'STATE.md');
  let stateContent = null;
  try {
    if (fs.existsSync(stateFile)) {
      stateContent = fs.readFileSync(stateFile, 'utf8');
    }
  } catch (_e) { /* non-fatal */ }

  if (stateContent) {
    try {
      const fm = {};
      const fmMatch = stateContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        const fmBlock = fmMatch[1];
        const fields = ['current_phase', 'total_phases', 'phase_name', 'status', 'progress_percent', 'plans_total', 'plans_complete'];
        for (const field of fields) {
          const m = fmBlock.match(new RegExp(`${field}:\\s*"?([^"\\n]+)"?`));
          if (m) fm[field] = m[1].trim();
        }
      }
      if (fm.current_phase && fm.total_phases) {
        const phaseName = fm.phase_name ? `"${fm.phase_name}"` : '';
        const status = fm.status || 'unknown';
        const plansComplete = fm.plans_complete || '?';
        const plansTotal = fm.plans_total || '?';
        const progress = fm.progress_percent || '?';
        lines.push(`Phase ${fm.current_phase}/${fm.total_phases}: ${phaseName} -- ${status}, plan ${plansComplete}/${plansTotal} (${progress}%)`);
      }
    } catch (_e) { /* non-fatal */ }
  }

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 3000 }).trim();
    const porcelain = execSync('git status --porcelain', { encoding: 'utf8', timeout: 3000 }).trim();
    const uncommitted = porcelain ? porcelain.split('\n').length : 0;
    const recentLog = execSync('git log -5 --oneline', { encoding: 'utf8', timeout: 3000 }).trim();
    const commits = recentLog ? recentLog.split('\n').map(l => l.trim()).filter(Boolean) : [];
    const commitSummary = commits.slice(0, 3).join(', ');
    lines.push(`Git: ${branch} (${uncommitted} uncommitted) | Last: ${commitSummary}`);
  } catch (_e) {
    lines.push('Git: unavailable');
  }

  try {
    const decisionsDir = path.join(planningDir, 'decisions');
    if (fs.existsSync(decisionsDir)) {
      const decFiles = fs.readdirSync(decisionsDir).filter(f => f.endsWith('.md'));
      const pending = [];
      for (const file of decFiles) {
        const content = fs.readFileSync(path.join(decisionsDir, file), 'utf8');
        if (!content.includes('status: resolved') && !content.includes('status: closed')) {
          const titleMatch = content.match(/title:\s*(.+)/);
          pending.push(titleMatch ? titleMatch[1].trim() : file);
        }
      }
      if (pending.length > 0) {
        lines.push(`Pending decisions: ${pending.join('; ')}`);
      }
    }
  } catch (_e) { /* non-fatal */ }

  try {
    const trackerFile = path.join(planningDir, '.context-tracker');
    if (fs.existsSync(trackerFile)) {
      const tracker = JSON.parse(fs.readFileSync(trackerFile, 'utf8'));
      const files = Array.isArray(tracker.files) ? tracker.files.slice(0, 5) : [];
      if (files.length > 0) {
        lines.push(`Working set: ${files.join(', ')}`);
      }
    }
  } catch (_e) { /* non-fatal */ }

  try {
    const { isSkipRagEligible } = require('../context-quality');
    const skipRag = isSkipRagEligible(planningDir);
    if (skipRag.eligible) {
      lines.push(`Skip-RAG: eligible (${skipRag.line_count} lines). Full codebase fits in context.`);
    }
  } catch (_e) { /* non-fatal */ }

  if (stateContent) {
    try {
      const blockersSection = extractSection(stateContent, 'Blockers/Concerns');
      if (blockersSection && !blockersSection.includes('None')) {
        lines.push(`Blockers: ${blockersSection.split('\n').map(l => l.trim()).filter(Boolean).join('; ')}`);
      }
    } catch (_e) { /* non-fatal */ }
  }

  let output = lines.join('\n');
  if (output.length > 2500) {
    output = output.substring(0, 2497) + '...';
  }

  logHook('progress-tracker', 'SessionStart', 'briefing-injected', {
    tokens: Math.ceil(output.length / 5)
  });

  return output;
}

/**
 * Build a concise briefing of recent active decisions for SessionStart injection.
 */
function getDecisionBriefing(planningDir, config) {
  if (!config) {
    const configPath = path.join(planningDir, 'config.json');
    try {
      if (!fs.existsSync(configPath)) return '';
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (_e) {
      return '';
    }
  }

  if (!config || !config.features || !config.features.decision_journal) return '';

  const decisionsDir = path.join(planningDir, 'decisions');
  if (!fs.existsSync(decisionsDir)) return '';

  let files;
  try {
    files = fs.readdirSync(decisionsDir).filter(f => f.endsWith('.md'));
  } catch (_e) {
    return '';
  }

  if (files.length === 0) return '';

  const decisions = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(decisionsDir, file), 'utf8');
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fmMatch) continue;

      const fmText = fmMatch[1];
      const getField = (name) => {
        const m = fmText.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
        return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
      };

      const status = getField('status');
      if (status !== 'active') continue;

      decisions.push({
        date: getField('date'),
        decision: getField('decision'),
        agent: getField('agent'),
        phase: getField('phase'),
      });
    } catch (_e) {
      // Skip unparseable files
    }
  }

  if (decisions.length === 0) return '';

  decisions.sort((a, b) => b.date.localeCompare(a.date));
  const top = decisions.slice(0, 5);

  const lines = top.map(d => {
    let title = d.decision;
    if (title.length > 60) title = title.slice(0, 57) + '...';
    return `- ${d.date}: ${title} (agent: ${d.agent || 'unknown'}, phase: ${d.phase || '?'})`;
  });

  return '\nRecent decisions:\n' + lines.join('\n');
}

/**
 * Build a briefing of past failures in related files (negative knowledge).
 */
function getNegativeKnowledgeBriefing(planningDir, config, workingSet) {
  if (!config || !config.features || !config.features.negative_knowledge) return '';

  if (!workingSet) {
    workingSet = [];
    const wsPath = path.join(planningDir, 'sessions', 'working-set.json');
    try {
      if (fs.existsSync(wsPath)) {
        const ws = JSON.parse(fs.readFileSync(wsPath, 'utf8'));
        if (Array.isArray(ws.files)) workingSet = ws.files;
      }
    } catch (_e) { /* ignore */ }

    if (workingSet.length === 0) {
      try {
        const stateFile = path.join(planningDir, 'STATE.md');
        if (fs.existsSync(stateFile)) {
          const stateContent = fs.readFileSync(stateFile, 'utf8');
          const phaseMatch = stateContent.match(/Phase:\s*(\d+)\s+of\s+\d+/);
          if (phaseMatch) {
            const phasesDir = path.join(planningDir, 'phases');
            if (fs.existsSync(phasesDir)) {
              const phaseDirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(String(phaseMatch[1]).padStart(2, '0')));
              for (const pd of phaseDirs) {
                const planFiles = fs.readdirSync(path.join(phasesDir, pd)).filter(f => /^PLAN/i.test(f));
                for (const pf of planFiles) {
                  const planContent = fs.readFileSync(path.join(phasesDir, pd, pf), 'utf8');
                  const fmMatch = planContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                  if (fmMatch) {
                    const filesBlock = fmMatch[1].match(/files_modified:\s*\n((?:\s+-\s+.+\n?)*)/);
                    if (filesBlock) {
                      const filesList = filesBlock[1].match(/^\s+-\s+"?(.+?)"?\s*$/gm);
                      if (filesList) workingSet.push(...filesList.map(f => f.replace(/^\s+-\s+"?|"?\s*$/g, '')));
                    }
                  }
                }
              }
            }
          }
        }
      } catch (_e) { /* ignore */ }
    }
  }

  if (workingSet.length === 0) return '';

  const nkDir = path.join(planningDir, 'negative-knowledge');
  if (!fs.existsSync(nkDir)) return '';

  let nkFiles;
  try { nkFiles = fs.readdirSync(nkDir).filter(f => f.endsWith('.md')); } catch (_e) { return ''; }
  if (nkFiles.length === 0) return '';

  const fileSet = new Set(workingSet);
  const matches = [];

  for (const file of nkFiles) {
    try {
      const content = fs.readFileSync(path.join(nkDir, file), 'utf8');
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fmMatch) continue;
      const fmText = fmMatch[1];
      const getField = (name) => { const m = fmText.match(new RegExp(`^${name}:\\s*(.+)$`, 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };
      const status = getField('status');
      if (status !== 'active') continue;
      const filesBlock = fmText.match(/files_involved:\s*\n((?:\s+-\s+.+\n?)*)/);
      const filesInvolved = [];
      if (filesBlock) { const fileLines = filesBlock[1].match(/^\s+-\s+(.+)$/gm); if (fileLines) filesInvolved.push(...fileLines.map(l => l.replace(/^\s+-\s+/, '').trim())); }
      if (!filesInvolved.some(f => fileSet.has(f))) continue;
      const date = getField('date');
      const title = getField('title');
      const whyMatch = content.match(/## Why It Failed\s*\n([\s\S]*?)(?=\n##|$)/);
      const whyFailed = whyMatch ? whyMatch[1].trim() : '';
      const whySummary = whyFailed.length > 80 ? whyFailed.slice(0, 77) + '...' : whyFailed;
      matches.push({ date, title, whySummary, filesInvolved });
    } catch (_e) { /* Skip */ }
  }

  if (matches.length === 0) return '';
  matches.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const top = matches.slice(0, 3);
  const lines = top.map(m => { let title = m.title; if (title.length > 60) title = title.slice(0, 57) + '...'; return `- ${m.date}: ${title} -- ${m.whySummary} (files: ${m.filesInvolved.join(', ')})`; });
  return '\nPast failures in related files:\n' + lines.join('\n');
}

/**
 * Build the full context string for SessionStart injection.
 */
function buildContext(planningDir, stateFile) {
  const parts = [];

  parts.push('[Plan-Build-Run Project Detected]');

  const _briefingConfig = configLoad(planningDir);
  const briefing = buildEnhancedBriefing(planningDir, _briefingConfig);

  if (briefing) {
    parts.push('\n' + briefing);
  } else {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 3000 }).trim();
      const porcelain = execSync('git status --porcelain', { encoding: 'utf8', timeout: 3000 }).trim();
      const uncommitted = porcelain ? porcelain.split('\n').length : 0;
      const recentCommits = execSync('git log -5 --oneline', { encoding: 'utf8', timeout: 3000 }).trim();
      parts.push(`\nGit: ${branch} (${uncommitted} uncommitted file${uncommitted !== 1 ? 's' : ''})`);
      if (recentCommits) {
        parts.push(`Recent commits:\n${recentCommits}`);
      }
    } catch (_e) {
      // Not a git repo or git not available
    }
  }

  if (fs.existsSync(stateFile)) {
    const state = fs.readFileSync(stateFile, 'utf8');

    if (!briefing) {
      const position = extractSection(state, 'Current Position');
      if (position) {
        parts.push(`\nPosition:\n${position}`);
      }

      const blockers = extractSection(state, 'Blockers/Concerns');
      if (blockers && !blockers.includes('None')) {
        parts.push(`\nBlockers:\n${blockers}`);
      }

      const continuity = extractSection(state, 'Session Continuity');
      if (continuity) {
        parts.push(`\nLast Session:\n${continuity}`);
      }

      const fmMatch = state.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        const fm = fmMatch[1];
        const sessionLast = fm.match(/^session_last:\s*["']?([^"'\r\n]+)["']?/m);
        const sessionStoppedAt = fm.match(/^session_stopped_at:\s*["']?([^"'\r\n]+)["']?/m);
        const sessionResume = fm.match(/^session_resume:\s*["']?([^"'\r\n]+)["']?/m);

        if (sessionLast || sessionStoppedAt || sessionResume) {
          const continuityParts = [];
          if (sessionLast) continuityParts.push(`Last session: ${sessionLast[1].trim()}`);
          if (sessionStoppedAt) continuityParts.push(`Stopped at: ${sessionStoppedAt[1].trim()}`);
          if (sessionResume) continuityParts.push(`Resume: ${sessionResume[1].trim()}`);
          parts.push(`\nSession continuity:\n${continuityParts.join('\n')}`);
        }
      }
    }

    const statusMatch = state.match(/\*{0,2}(?:Phase\s+)?Status\*{0,2}:\s*["']?([a-z_]+)["']?/i);
    if (statusMatch && (statusMatch[1].toLowerCase() === 'building' || statusMatch[1].toLowerCase() === 'ready_to_execute')) {
      try {
        const stateStat = fs.statSync(stateFile);
        const ageMs = Date.now() - stateStat.mtimeMs;
        const ageMinutes = Math.round(ageMs / 60000);
        if (ageMinutes > 30) {
          const staleStatus = statusMatch[1].toLowerCase();
          try {
            const { stateUpdate } = require('../pbr-tools');
            stateUpdate(planningDir, { status: 'planned' });
            parts.push(`\nAuto-repaired: STATE.md was stuck in "${staleStatus}" for ${ageMinutes} minutes (likely crashed executor). Reset to "planned". Run /pbr:build to retry.`);
            logHook('progress-tracker', 'SessionStart', 'stale-status-repaired', { ageMinutes, staleStatus });
          } catch (_repairErr) {
            parts.push(`\nWarning: STATE.md shows status "${staleStatus}" but was last modified ${ageMinutes} minutes ago. This may indicate a crashed executor. Run /pbr:health to diagnose.`);
            logHook('progress-tracker', 'SessionStart', 'stale-status', { ageMinutes, staleStatus });
          }
        }
      } catch (_e) { /* best-effort */ }
    }
  } else {
    parts.push('\nNo STATE.md found. Run /pbr:new-project to initialize or /pbr:progress to check.');
  }

  const waitingPath = path.join(planningDir, 'WAITING.json');
  if (fs.existsSync(waitingPath)) {
    try {
      const waiting = JSON.parse(fs.readFileSync(waitingPath, 'utf8'));
      parts.push(`\nProject is in WAITING state: ${waiting.reason || 'unknown reason'}`);
      if (waiting.created_at) {
        parts.push(`Waiting since: ${waiting.created_at}`);
      }
      parts.push('Run /pbr:resume to clear waiting state and continue.');
    } catch (_e) {
      parts.push('\nWAITING.json exists but could not be parsed.');
    }
  }

  const handoffPath = path.join(planningDir, 'HANDOFF.json');
  if (fs.existsSync(handoffPath)) {
    try {
      const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
      const nextAction = handoff.next_action || 'unknown';
      parts.push(`\nPrevious session left a handoff: ${nextAction}`);
      parts.push('Run /pbr:resume to restore context.');
    } catch (_e) {
      parts.push('\nHANDOFF.json exists but could not be parsed.');
    }
  }

  const phasesDir = path.join(planningDir, 'phases');
  if (fs.existsSync(phasesDir)) {
    const continueFiles = findContinueFiles(phasesDir);
    if (continueFiles.length > 0) {
      parts.push(`\nPaused work found: ${continueFiles.join(', ')}`);
      parts.push('Run /pbr:resume-work to pick up where you left off.');
    }
  }

  const config = configLoad(planningDir);
  if (config) {
    parts.push(`\nConfig: depth=${config.depth || 'standard'}, mode=${config.mode || 'interactive'}`);

    const schemaPath = path.join(__dirname, '..', 'config-schema.json');
    if (fs.existsSync(schemaPath)) {
      const { configValidate } = require('../pbr-tools');
      const validation = configValidate(config);
      if (validation.warnings.length > 0) {
        parts.push(`\nConfig warnings: ${validation.warnings.join('; ')}`);
      }
      if (validation.errors.length > 0) {
        parts.push(`\nConfig errors: ${validation.errors.join('; ')}`);
      }
    }
  }

  const projectNotesDir = path.join(planningDir, 'notes');
  const globalNotesDir = path.join(os.homedir(), '.claude', 'notes');
  const projectNoteCount = countNotes(projectNotesDir);
  const globalNoteCount = countNotes(globalNotesDir);
  if (projectNoteCount > 0 || globalNoteCount > 0) {
    const noteParts = [];
    if (projectNoteCount > 0) noteParts.push(`${projectNoteCount} project`);
    if (globalNoteCount > 0) noteParts.push(`${globalNoteCount} global`);
    parts.push(`\nNotes: ${noteParts.join(', ')}. \`/pbr:note list\` to review.`);
  }

  try {
    const seedsDir = path.join(planningDir, 'seeds');
    if (fs.existsSync(seedsDir)) {
      const seeds = fs.readdirSync(seedsDir).filter(f => f.endsWith('.md'));
      if (seeds.length > 0) {
        parts.push(`\nSeeds: ${seeds.length} dormant. \`/pbr:explore\` to review triggers.`);
      }
    }
  } catch (_e) { /* non-fatal */ }

  try {
    let deferredCount = 0;
    const _phasesDir = path.join(planningDir, 'phases');
    if (fs.existsSync(_phasesDir)) {
      const phaseDirs = fs.readdirSync(_phasesDir, { withFileTypes: true });
      for (const dir of phaseDirs) {
        if (!dir.isDirectory()) continue;
        try {
          const phaseFiles = fs.readdirSync(path.join(_phasesDir, dir.name));
          for (const file of phaseFiles) {
            if (/^SUMMARY.*\.md$/i.test(file)) {
              const content = fs.readFileSync(path.join(_phasesDir, dir.name, file), 'utf8');
              const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
              if (fmMatch) {
                const deferredItems = fmMatch[1].match(/^\s+-\s+/gm);
                const hasDeferred = /^deferred:/m.test(fmMatch[1]);
                if (hasDeferred && deferredItems) {
                  const lines = fmMatch[1].split(/\r?\n/);
                  let inDeferred = false;
                  for (const line of lines) {
                    if (/^deferred:/i.test(line)) { inDeferred = true; continue; }
                    if (inDeferred && /^\s+-\s+/.test(line)) { deferredCount++; }
                    if (inDeferred && /^\w/.test(line)) { inDeferred = false; }
                  }
                }
              }
            }
          }
        } catch (_e) { /* skip individual phase dirs */ }
      }
    }
    if (deferredCount > 0) {
      parts.push(`\nDeferred: ${deferredCount} items across phase summaries.`);
    }
  } catch (_e) { /* non-fatal */ }

  try {
    const auditFiles = fs.readdirSync(planningDir).filter(f => f.endsWith('-MILESTONE-AUDIT.md'));
    if (auditFiles.length > 0) {
      const latestAudit = auditFiles.sort().pop();
      const content = fs.readFileSync(path.join(planningDir, latestAudit), 'utf8');
      const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (fmMatch) {
        let techDebtCount = 0;
        const lines = fmMatch[1].split(/\r?\n/);
        let inTechDebt = false;
        for (const line of lines) {
          if (/^tech_debt:/i.test(line)) { inTechDebt = true; continue; }
          if (inTechDebt && /^\s+-\s+/.test(line)) { techDebtCount++; }
          if (inTechDebt && /^\w/.test(line)) { inTechDebt = false; }
        }
        if (techDebtCount > 0) {
          parts.push(`\nTech debt: ${techDebtCount} items from milestone audit.`);
        }
      }
    }
  } catch (_e) { /* non-fatal */ }

  try {
    const questionsPath = path.join(planningDir, 'research', 'questions.md');
    if (fs.existsSync(questionsPath)) {
      const content = fs.readFileSync(questionsPath, 'utf-8');
      const openQuestions = (content.match(/- \[ \]/g) || []).length;
      if (openQuestions > 0) {
        parts.push(`\nResearch: ${openQuestions} open question(s) in .planning/research/questions.md`);
      }
    }
  } catch (_e) { /* non-fatal */ }

  try {
    const knowledgePath = path.join(planningDir, 'KNOWLEDGE.md');
    if (fs.existsSync(knowledgePath)) {
      const content = fs.readFileSync(knowledgePath, 'utf-8');
      const rules = (content.match(/^\| K\d+/gm) || []).length;
      const patterns = (content.match(/^\| P\d+/gm) || []).length;
      const lessons = (content.match(/^\| L\d+/gm) || []).length;
      if (rules + patterns + lessons > 0) {
        parts.push(`\nKnowledge: ${rules} rules, ${patterns} patterns, ${lessons} lessons.`);
      }
    }
  } catch (_e) { /* non-fatal */ }

  const roadmapFile = path.join(planningDir, 'ROADMAP.md');
  if (fs.existsSync(stateFile) && fs.existsSync(roadmapFile)) {
    try {
      const roadmap = fs.readFileSync(roadmapFile, 'utf8');
      const state = fs.readFileSync(stateFile, 'utf8');

      const phaseMatch = state.match(/Phase:\s*(\d+)\s+of\s+\d+/);
      if (phaseMatch) {
        const currentPhase = parseInt(phaseMatch[1], 10);
        const strippedRoadmap = roadmap
          .replace(/<\/?details>/gi, '')
          .replace(/<\/?summary>/gi, '');
        const progressTable = strippedRoadmap.match(/## Progress[\s\S]*?\|[\s\S]*?(?=\n##|\s*$)/);
        if (progressTable) {
          const rows = progressTable[0].split('\n').filter(r => r.includes('|'));
          let statusColIdx = -1;
          let phaseColIdx = 0;
          const headerRow = rows.find(r => /Plans?\s*Complete/i.test(r) || /Status/i.test(r));
          if (headerRow) {
            const headers = headerRow.split('|').map(h => h.trim().toLowerCase()).filter(Boolean);
            const pIdx = headers.findIndex(h => /phase/i.test(h));
            if (pIdx !== -1) phaseColIdx = pIdx;
            statusColIdx = headers.findIndex(h => /status/i.test(h));
          }
          for (const row of rows) {
            const cols = row.split('|').map(c => c.trim()).filter(Boolean);
            if (cols.length >= 2 && statusColIdx !== -1 && statusColIdx < cols.length) {
              const phaseNum = parseInt(cols[phaseColIdx], 10);
              const status = cols[statusColIdx] ? cols[statusColIdx].toLowerCase() : '';
              if (phaseNum === currentPhase && (status === 'verified' || status === 'complete')) {
                parts.push(`\nWarning: STATE.md may be outdated -- ROADMAP.md shows phase ${currentPhase} as ${status}.`);
              }
            }
          }
        }
      }
    } catch (_e) {
      // Ignore parse errors
    }
  }

  const activeSkillFile = path.join(planningDir, '.active-skill');
  const { sessionLoad: _sessionLoad } = require('../pbr-tools');
  const sessionData = _sessionLoad(planningDir);
  const sessionActiveSkill = sessionData.activeSkill || null;

  if (fs.existsSync(activeSkillFile)) {
    try {
      const stats = fs.statSync(activeSkillFile);
      const ageMs = Date.now() - stats.mtimeMs;
      const ageMinutes = Math.floor(ageMs / 60000);
      if (ageMinutes > 60) {
        const skill = sessionActiveSkill || fs.readFileSync(activeSkillFile, 'utf8').trim();
        try {
          fs.unlinkSync(activeSkillFile);
          parts.push(`\nAuto-cleaned: Stale .active-skill lock removed (skill: "${skill}", age: ${ageMinutes} minutes). Was likely from a crashed or abandoned session.`);
          logHook('progress-tracker', 'SessionStart', 'stale-active-skill-cleaned', { ageMinutes, skill });
        } catch (_cleanupErr) {
          parts.push(`\nWarning: .active-skill is ${ageMinutes} minutes old (skill: "${skill}"). Could not auto-remove -- delete .planning/.active-skill manually.`);
          logHook('progress-tracker', 'SessionStart', 'stale-active-skill', { ageMinutes, skill });
        }
      }
    } catch (_e) {
      // Ignore errors
    }
  }

  const autoNextFile = path.join(planningDir, '.auto-next');
  if (fs.existsSync(autoNextFile)) {
    try {
      const stats = fs.statSync(autoNextFile);
      const ageMs = Date.now() - stats.mtimeMs;
      const ageMinutes = Math.floor(ageMs / 60000);
      if (ageMinutes > 10) {
        parts.push(`\nWarning: Stale .auto-next signal found (${ageMinutes} minutes old). This may trigger an unexpected command. Consider deleting .planning/.auto-next.`);
        logHook('progress-tracker', 'SessionStart', 'stale-auto-next', { ageMinutes });
      }
    } catch (_e) {
      // Ignore errors
    }
  }

  const hookHealth = getHookHealthSummary(planningDir);
  if (hookHealth) {
    parts.push(`\n${hookHealth}`);
  }

  const learningsThresholds = checkLearningsDeferrals(planningDir);
  if (learningsThresholds.length > 0) {
    parts.push(`\nLearnings deferral triggers ready:\n${learningsThresholds.join('\n')}`);
  }

  const intelContext = getIntelContext(planningDir, config);
  if (intelContext) parts.push(intelContext);

  const stalenessWarning = getIntelStalenessWarning(planningDir, config);
  if (stalenessWarning) parts.push(stalenessWarning);

  const decisionBriefing = getDecisionBriefing(planningDir, config);
  if (decisionBriefing) parts.push(decisionBriefing);

  const nkBriefing = getNegativeKnowledgeBriefing(planningDir, config);
  if (nkBriefing) parts.push(nkBriefing);

  try {
    const snapshotsEnabled = config && config.features && config.features.mental_model_snapshots !== false;
    if (snapshotsEnabled) {
      const snapshot = loadLatestSnapshot(planningDir, { maxAgeHours: 48 });
      const snapshotBrief = formatSnapshotBriefing(snapshot);
      if (snapshotBrief) {
        parts.push('\n' + snapshotBrief);
      }
    }
  } catch (_e) { /* never crash SessionStart for optional features */ }

  try {
    const conventionsEnabled = config && config.features && config.features.convention_memory !== false;
    if (conventionsEnabled) {
      const conventions = loadConventions(planningDir);
      if (conventions && Object.keys(conventions).length > 0) {
        const convBrief = formatConventionBriefing(conventions);
        if (convBrief) {
          parts.push(convBrief);
        }
      }
    }
  } catch (_e) { /* never crash SessionStart for optional features */ }

  try {
    const { checkPreResearch } = require('./pre-research');
    const preResearchResult = checkPreResearch(planningDir, config);
    if (preResearchResult) {
      parts.push(`\n[Pre-Research] Phase ${preResearchResult.nextPhase} (${preResearchResult.name}) is next -- consider running ${preResearchResult.command} to pre-research.`);
    }
  } catch (_e) { /* non-fatal */ }

  parts.push('\n[PBR WORKFLOW REQUIRED -- Route all work through PBR commands]\n- Fix a bug or small task \u2192 /pbr:quick\n- Plan a feature \u2192 /pbr:plan-phase N\n- Build from a plan \u2192 /pbr:execute-phase N\n- Explore or research \u2192 /pbr:explore\n- Freeform request \u2192 /pbr:do\n- Do NOT write source code or spawn generic agents without an active PBR skill.\n- Use PBR agents (pbr:researcher, pbr:executor, etc.) not Explore/general-purpose.');

  return parts.join('\n');
}

module.exports = {
  buildEnhancedBriefing,
  buildContext,
  getHookHealthSummary,
  getDecisionBriefing,
  getNegativeKnowledgeBriefing,
  getIntelContext,
  getIntelStalenessWarning,
  checkLearningsDeferrals,
  detectOtherSessions,
  extractSection,
  escapeRegex,
  findContinueFiles,
  countNotes,
  FAILURE_DECISIONS,
  HOOK_HEALTH_MAX_ENTRIES,
};
