'use strict';

/**
 * commands/todo.js — Command handlers for todo, history, and auto-cleanup commands.
 *
 * Extracted from pbr-tools.js to reduce monolith size. Each handler receives
 * (args, ctx) where ctx provides { planningDir, cwd, output(), error() }.
 */

const fs = require('fs');
const path = require('path');

const {
  todoList: _todoList,
  todoGet: _todoGet,
  todoAdd: _todoAdd,
  todoDone: _todoDone
} = require('../lib/todo');

const {
  historyAppend: _historyAppend,
  historyLoad: _historyLoad
} = require('../lib/history');

const {
  autoCloseTodos: _autoCloseTodos,
  autoArchiveNotes: _autoArchiveNotes
} = require('../lib/auto-cleanup');

const {
  parseYamlFrontmatter
} = require('../lib/core');

// --- Private function extracted from pbr-tools.js lines 644-684 ---

/**
 * Build cleanup context from phase SUMMARY files and git log.
 *
 * @param {string|number} phaseNum - Phase number (e.g. "38")
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ phaseName: string, phaseNum: string, keyFiles: string[], commitMessages: string[], summaryDescriptions: string[] }}
 */
function buildCleanupContext(phaseNum, planningDir) {
  const padded = String(phaseNum).padStart(2, '0');
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) throw new Error('No phases directory found');

  const phaseDir = fs.readdirSync(phasesDir).find(d => d.startsWith(padded + '-'));
  if (!phaseDir) throw new Error(`Phase ${phaseNum} directory not found`);

  const phaseName = phaseDir.replace(/^\d+-/, '').replace(/-/g, ' ');
  const phaseDirPath = path.join(phasesDir, phaseDir);

  // Collect key_files and descriptions from all SUMMARY files
  const keyFiles = [];
  const summaryDescriptions = [];
  const summaryFiles = fs.readdirSync(phaseDirPath).filter(f => /^SUMMARY/i.test(f) && f.endsWith('.md'));
  for (const sf of summaryFiles) {
    try {
      const content = fs.readFileSync(path.join(phaseDirPath, sf), 'utf8');
      const fm = parseYamlFrontmatter(content);
      if (fm.key_files && Array.isArray(fm.key_files)) {
        keyFiles.push(...fm.key_files.map(kf => typeof kf === 'string' ? kf.split(':')[0].trim() : ''));
      }
      if (fm.provides && Array.isArray(fm.provides)) {
        summaryDescriptions.push(...fm.provides);
      }
    } catch (_e) { /* skip unreadable summaries */ }
  }

  // Get recent commit messages
  let commitMessages = [];
  try {
    const { execSync } = require('child_process');
    const log = execSync('git log --oneline -20', { encoding: 'utf8', cwd: path.join(planningDir, '..') });
    commitMessages = log.split('\n').filter(l => l.trim()).map(l => {
      const parts = l.match(/^[0-9a-f]+\s+(.*)/);
      return parts ? parts[1] : '';
    }).filter(Boolean);
  } catch (_e) { /* git not available */ }

  return { phaseName, phaseNum: String(phaseNum), keyFiles, commitMessages, summaryDescriptions };
}

// --- Exported command handlers ---

/**
 * Handle todo subcommands: list, get, add, done.
 *
 * @param {string[]} args - CLI args (args[0] is 'todo', args[1] is subcommand)
 * @param {object} ctx - { planningDir, output(), error() }
 */
function handleTodo(args, ctx) {
  const subcommand = args[1];

  if (subcommand === 'list') {
    const opts = {};
    const themeIdx = args.indexOf('--theme');
    if (themeIdx !== -1 && args[themeIdx + 1]) opts.theme = args[themeIdx + 1];
    const statusIdx = args.indexOf('--status');
    if (statusIdx !== -1 && args[statusIdx + 1]) opts.status = args[statusIdx + 1];
    ctx.output(_todoList(ctx.planningDir, opts));
  } else if (subcommand === 'get') {
    const num = args[2];
    if (!num) { ctx.error('Usage: todo get <NNN>'); return; }
    ctx.output(_todoGet(ctx.planningDir, num));
  } else if (subcommand === 'add') {
    const titleParts = [];
    const opts = {};
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--priority' && args[i + 1]) { opts.priority = args[++i]; }
      else if (args[i] === '--theme' && args[i + 1]) { opts.theme = args[++i]; }
      else if (args[i] === '--source' && args[i + 1]) { opts.source = args[++i]; }
      else { titleParts.push(args[i]); }
    }
    const title = titleParts.join(' ');
    if (!title) { ctx.error('Usage: todo add <title> [--priority P1|P2|P3] [--theme <theme>]'); return; }
    ctx.output(_todoAdd(ctx.planningDir, title, opts));
  } else if (subcommand === 'done') {
    const num = args[2];
    if (!num) { ctx.error('Usage: todo done <NNN>'); return; }
    ctx.output(_todoDone(ctx.planningDir, num));
  } else {
    ctx.error('Usage: todo list|get|add|done');
  }
}

/**
 * Handle history subcommands: append, load.
 *
 * @param {string[]} args - CLI args (args[0] is 'history', args[1] is subcommand)
 * @param {object} ctx - { planningDir, output(), error() }
 */
function handleHistory(args, ctx) {
  const subcommand = args[1];

  if (subcommand === 'append') {
    const type = args[2];
    const title = args[3];
    const body = args[4] || '';
    if (!type || !title) { ctx.error('Usage: history append <milestone|phase> <title> [body]'); return; }
    ctx.output(_historyAppend({ type, title, body }, ctx.planningDir));
  } else if (subcommand === 'load') {
    ctx.output(_historyLoad(ctx.planningDir));
  } else {
    ctx.error('Usage: history append|load');
  }
}

/**
 * Handle auto-cleanup command with --phase N or --milestone vN flags.
 *
 * @param {string[]} args - CLI args (args[0] is 'auto-cleanup')
 * @param {object} ctx - { planningDir, output(), error() }
 */
function handleAutoCleanup(args, ctx) {
  const phaseFlag = args.indexOf('--phase');
  const milestoneFlag = args.indexOf('--milestone');

  if (phaseFlag !== -1 && args[phaseFlag + 1]) {
    const phaseNum = args[phaseFlag + 1];
    const context = buildCleanupContext(phaseNum, ctx.planningDir);
    const todoResult = _autoCloseTodos(ctx.planningDir, context);
    const noteResult = _autoArchiveNotes(ctx.planningDir, context);
    ctx.output({ phase: phaseNum, todos: todoResult, notes: noteResult });
  } else if (milestoneFlag !== -1 && args[milestoneFlag + 1]) {
    const version = args[milestoneFlag + 1];
    // Parse ROADMAP.md to find phases in this milestone
    const roadmapPath = path.join(ctx.planningDir, 'ROADMAP.md');
    if (!fs.existsSync(roadmapPath)) { ctx.error('ROADMAP.md not found'); return; }
    const roadmap = fs.readFileSync(roadmapPath, 'utf8');
    const milestoneMatch = roadmap.match(new RegExp('Milestone.*' + version.replace(/\./g, '\\.') + '[\\s\\S]*?Phases:\\s*(\\d+)\\s*-\\s*(\\d+)'));
    if (!milestoneMatch) { ctx.error('Milestone ' + version + ' not found in ROADMAP.md'); return; }
    const startPhase = parseInt(milestoneMatch[1]);
    const endPhase = parseInt(milestoneMatch[2]);
    const allResults = { milestone: version, phases: [] };
    for (let p = startPhase; p <= endPhase; p++) {
      try {
        const context = buildCleanupContext(String(p), ctx.planningDir);
        const todoRes = _autoCloseTodos(ctx.planningDir, context);
        const noteRes = _autoArchiveNotes(ctx.planningDir, context);
        allResults.phases.push({ phase: p, todos: todoRes, notes: noteRes });
      } catch (_e) { /* skip phases without SUMMARY */ }
    }
    ctx.output(allResults);
  } else {
    ctx.error('Usage: auto-cleanup --phase N | --milestone vN');
  }
}

module.exports = { handleTodo, handleHistory, handleAutoCleanup };
