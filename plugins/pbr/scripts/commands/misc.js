/**
 * commands/misc.js — Handler for all remaining CLI commands not covered by
 * state.js, config.js, roadmap.js, phase.js, verify.js, or todo.js.
 *
 * Covers: intel, requirements, event, learnings, migrate, data, graph, hooks perf,
 * spec, help, skill-metadata, session, claim, context-triage, reference,
 * skill-section, step-verify, build-preview, suggest-alternatives, tmux, quick init,
 * generate-slug, parse-args, status fingerprint, status render, suggest-next,
 * quick-status, ci-fix, ci-poll, rollback, nk.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeMsysPath } = require('../lib/msys-path');

// --- Plugin root resolution ---

/**
 * Resolve the PBR plugin root directory.
 * __dirname is commands/, so plugin root is two levels up.
 */
function _resolvePluginRoot() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
  return normalizeMsysPath(pluginRoot);
}

// --- Spec subcommand handler ---

/**
 * Handle spec subcommands: parse, diff, reverse, impact.
 * @param {string[]} args - raw CLI args (args[0] is 'spec', args[1] is subcommand)
 * @param {string} pDir - planningDir
 * @param {string} projectRoot - cwd
 * @param {Function} outputFn - output function
 * @param {Function} errorFn - error function
 */
function _handleSpec(args, pDir, projectRoot, outputFn, errorFn) {
  const subcommand = args[1];

  // Parse common flags
  const formatIdx = args.indexOf('--format');
  const format = formatIdx !== -1 ? args[formatIdx + 1] : 'json';
  const projectRootIdx = args.indexOf('--project-root');
  const effectiveRoot = projectRootIdx !== -1 ? args[projectRootIdx + 1] : projectRoot;

  // Load config for feature toggle checks
  let config = {};
  try {
    const configPath = path.join(pDir, 'config.json');
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (_e) {
    // Config unreadable — use defaults
  }
  const features = config.features || {};

  // Audit log helper
  function writeAuditLog(cmd, featureName, status, fileCount) {
    try {
      const logDir = path.join(pDir, 'logs');
      if (fs.existsSync(logDir)) {
        const logFile = path.join(logDir, 'spec-engine.jsonl');
        const entry = JSON.stringify({
          ts: new Date().toISOString(),
          cmd: `spec.${cmd}`,
          feature: featureName,
          status,
          files: fileCount || 0,
        });
        fs.appendFileSync(logFile, entry + '\n', 'utf-8');
      }
    } catch (_e2) {
      // No-op if log dir missing or unwritable
    }
  }

  if (!subcommand || subcommand === '--help' || subcommand === 'help') {
    const usageText = [
      'Usage: spec <subcommand> [args] [--format json|markdown]',
      '',
      'Subcommands:',
      '  parse <plan-file>           Parse PLAN.md into structured JSON',
      '  diff <file-a> <file-b>      Semantic diff between two PLAN.md versions',
      '  reverse <file...>           Generate spec from source files',
      '  impact <file...>            Predict impact of changed files',
      '',
      'Flags:',
      '  --format json|markdown      Output format (default: json)',
      '  --project-root <path>       Project root for impact analysis',
    ].join('\n');
    outputFn(null, true, usageText);
    return;
  }

  if (subcommand === 'parse') {
    const planFile = args[2];
    if (!planFile) { errorFn('Usage: spec parse <plan-file>'); return; }
    const { parsePlanToSpec } = require('../lib/spec-engine');
    let content;
    try {
      content = fs.readFileSync(planFile, 'utf-8');
    } catch (e) {
      errorFn(`Cannot read file: ${planFile}: ${e.message}`);
      return;
    }
    const spec = parsePlanToSpec(content);
    writeAuditLog('parse', 'machine_executable_plans', 'ok', 1);
    outputFn({ frontmatter: spec.frontmatter, tasks: spec.tasks });
    return;
  }

  if (subcommand === 'diff') {
    if (features.spec_diffing === false) {
      outputFn({ error: 'Feature disabled. Enable features.spec_diffing in config.json' });
      return;
    }
    const fileA = args[2];
    const fileB = args[3];
    if (!fileA || !fileB) { errorFn('Usage: spec diff <file-a> <file-b>'); return; }
    const { diffPlanFiles, formatDiff } = require('../lib/spec-diff');
    let contentA, contentB;
    try {
      contentA = fs.readFileSync(fileA, 'utf-8');
      contentB = fs.readFileSync(fileB, 'utf-8');
    } catch (e) {
      errorFn(`Cannot read file: ${e.message}`);
      return;
    }
    const diff = diffPlanFiles(contentA, contentB);
    writeAuditLog('diff', 'spec_diffing', 'ok', 2);
    if (format === 'markdown') {
      outputFn(null, true, formatDiff(diff, 'markdown'));
    } else {
      outputFn(diff);
    }
    return;
  }

  if (subcommand === 'reverse') {
    if (features.reverse_spec === false) {
      outputFn({ error: 'Feature disabled. Enable features.reverse_spec in config.json' });
      return;
    }
    const files = [];
    for (let i = 2; i < args.length; i++) {
      if (!args[i].startsWith('--')) files.push(args[i]);
    }
    if (files.length === 0) { errorFn('Usage: spec reverse <file...>'); return; }
    const { generateReverseSpec } = require('../lib/reverse-spec');
    const { serializeSpec } = require('../lib/spec-engine');
    const spec = generateReverseSpec(files, { readFile: (p) => fs.readFileSync(p, 'utf-8') });
    writeAuditLog('reverse', 'reverse_spec', 'ok', files.length);
    if (format === 'markdown') {
      outputFn(null, true, serializeSpec(spec));
    } else {
      outputFn(spec);
    }
    return;
  }

  if (subcommand === 'impact') {
    if (features.predictive_impact === false) {
      outputFn({ error: 'Feature disabled. Enable features.predictive_impact in config.json' });
      return;
    }
    const files = [];
    for (let i = 2; i < args.length; i++) {
      if (!args[i].startsWith('--') && args[i - 1] !== '--project-root') files.push(args[i]);
    }
    if (files.length === 0) { errorFn('Usage: spec impact <file...>'); return; }
    const { analyzeImpact } = require('../lib/impact-analysis');
    const report = analyzeImpact(files, effectiveRoot);
    writeAuditLog('impact', 'predictive_impact', 'ok', files.length);
    outputFn(report);
    return;
  }

  errorFn(`Unknown spec subcommand: ${subcommand}\nAvailable: parse, diff, reverse, impact`);
}

// --- Main handler ---

/**
 * Handle all misc commands not covered by state/config/roadmap/phase/verify/todo modules.
 * @param {string[]} args - process.argv.slice(2) equivalent
 * @param {{ planningDir: string, cwd: string, output: Function, error: Function }} ctx
 */
async function handleMisc(args, ctx) {
  const { planningDir, cwd, output, error } = ctx;
  const command = args[0];
  const subcommand = args[1];

  // --- Intel ---
  if (command === 'intel') {
    const { intelQuery: _intelQuery, intelStatus: _intelStatus, intelDiff: _intelDiff } = require('../lib/intel');
    if (subcommand === 'query') {
      const term = args[2];
      if (!term) { error('Usage: intel query <term>'); return; }
      output(_intelQuery(term, planningDir));
    } else if (subcommand === 'status') {
      output(_intelStatus(planningDir));
    } else if (subcommand === 'diff') {
      output(_intelDiff(planningDir));
    } else {
      error('Usage: intel <query|status|diff>');
    }
    return;
  }

  // --- Requirements ---
  if (command === 'requirements' && subcommand === 'mark-complete') {
    const ids = args[2];
    if (!ids) { error('Usage: requirements mark-complete <comma-separated-REQ-IDs>'); return; }
    const idList = ids.split(',').map(s => s.trim());
    const { updateRequirementStatus } = require('../lib/requirements');
    output(updateRequirementStatus(planningDir, idList, 'done'));
    return;
  }

  // --- Event ---
  if (command === 'event') {
    const category = args[1];
    const event = args[2];
    let details = {};
    if (args[3]) {
      try { details = JSON.parse(args[3]); } catch (_e) { details = { raw: args[3] }; }
    }
    if (!category || !event) {
      error('Usage: pbr-tools.js event <category> <event> [JSON-details]');
      return;
    }
    const { logEvent } = require('../event-logger');
    logEvent(category, event, details);
    output({ logged: true, category, event });
    return;
  }

  // --- Learnings ---
  if (command === 'learnings') {
    const {
      learningsIngest: _learningsIngest,
      learningsQuery: _learningsQuery,
      checkDeferralThresholds: _checkDeferralThresholds,
      copyToGlobal: _copyToGlobal,
      queryGlobal: _queryGlobal
    } = require('../lib/learnings');
    const subCmd = args[1];

    if (subCmd === 'ingest') {
      const jsonFile = args[2];
      if (!jsonFile) { error('Usage: learnings ingest <json-file>'); return; }
      const raw = fs.readFileSync(jsonFile, 'utf8');
      const entry = JSON.parse(raw);
      output(_learningsIngest(entry));
    } else if (subCmd === 'query') {
      const filters = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--tags' && args[i + 1]) { filters.tags = args[++i].split(',').map(t => t.trim()); }
        else if (args[i] === '--min-confidence' && args[i + 1]) { filters.minConfidence = args[++i]; }
        else if (args[i] === '--stack' && args[i + 1]) { filters.stack = args[++i]; }
        else if (args[i] === '--type' && args[i + 1]) { filters.type = args[++i]; }
      }
      output(_learningsQuery(filters));
    } else if (subCmd === 'check-thresholds') {
      output(_checkDeferralThresholds());
    } else if (subCmd === 'copy-global') {
      const filePath = args[2];
      const projectName = args[3];
      if (!filePath || !projectName) { error('Usage: learnings copy-global <learnings-md-path> <project-name>'); return; }
      output(_copyToGlobal(filePath, projectName));
    } else if (subCmd === 'query-global') {
      const filters = {};
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--tags' && args[i + 1]) { filters.tags = args[++i].split(',').map(t => t.trim()); }
        else if (args[i] === '--project' && args[i + 1]) { filters.project = args[++i]; }
      }
      output(_queryGlobal(filters));
    } else {
      error('Usage: learnings <ingest|query|check-thresholds|copy-global|query-global>');
    }
    return;
  }

  // --- Migrate ---
  if (command === 'migrate') {
    const { applyMigrations: _applyMigrations } = require('../lib/migrate');
    const dryRun = args.includes('--dry-run');
    const force = args.includes('--force');
    const result = await _applyMigrations(planningDir, { dryRun, force });
    output(result);
    return;
  }

  // --- Data ---
  if (command === 'data') {
    const { dataStatus: _dataStatus, dataPrune: _dataPrune } = require('../lib/data-hygiene');
    const sub = args[1];
    if (sub === 'status') {
      output(_dataStatus(planningDir));
    } else if (sub === 'prune') {
      const beforeIdx = args.indexOf('--before');
      const before = beforeIdx !== -1 ? args[beforeIdx + 1] : null;
      const dryRun = args.includes('--dry-run');
      if (!before) {
        error('Usage: pbr-tools.js data prune --before <ISO-date> [--dry-run]');
        return;
      }
      output(_dataPrune(planningDir, { before, dryRun }));
    } else {
      error('Usage: pbr-tools.js data <status|prune>\n  data status — freshness report for research/, intel/, codebase/\n  data prune --before <ISO-date> [--dry-run] — archive stale files');
    }
    return;
  }

  // --- Graph ---
  if (command === 'graph') {
    const graphCli = require('../lib/graph-cli');
    graphCli.handleGraphCommand(subcommand, args, planningDir, cwd, output, error);
    return;
  }

  // --- Hooks Perf ---
  if (command === 'hooks' && subcommand === 'perf') {
    const { summarizeHookPerf, formatPerfTable, loadPerfEntries } = require('../lib/perf');
    const lastIdx = args.indexOf('--last');
    const last = lastIdx !== -1 ? parseInt(args[lastIdx + 1], 10) : undefined;
    const jsonFlag = args.includes('--json');
    const entries = loadPerfEntries(planningDir, { last });
    const summary = summarizeHookPerf(entries);
    if (jsonFlag) {
      output(summary);
    } else {
      const table = formatPerfTable(summary);
      process.stdout.write(table + '\n');
      process.stdout.write(`\nEntries analyzed: ${entries.length}\n`);
    }
    return;
  }

  // --- Spec ---
  if (command === 'spec') {
    _handleSpec(args, planningDir, cwd, output, error);
    return;
  }

  // --- Help ---
  if (command === 'help') {
    const root = _resolvePluginRoot();
    const { helpList: _helpList } = require('../lib/help');
    output(_helpList(root));
    return;
  }

  // --- Skill Metadata ---
  if (command === 'skill-metadata') {
    const skillName = args[1];
    if (!skillName) { error('Usage: pbr-tools.js skill-metadata <name>'); return; }
    const root = _resolvePluginRoot();
    const { skillMetadata: _skillMetadata } = require('../lib/help');
    const result = _skillMetadata(skillName, root);
    output(result);
    if (result.error) process.exit(1);
    return;
  }

  // --- Session ---
  if (command === 'session') {
    const {
      sessionLoad,
      sessionSave,
      resolveSessionPath
    } = require('../lib/session');
    const { SESSION_ALLOWED_KEYS } = require('../lib/constants');
    const sub = args[1];
    // Extract --session-id flag from remaining args
    const sessionIdIdx = args.indexOf('--session-id');
    const sessionId = sessionIdIdx !== -1 ? args[sessionIdIdx + 1] : null;
    // Filter out --session-id and its value from positional args
    const positional = sessionIdIdx !== -1
      ? args.filter((_a, i) => i !== sessionIdIdx && i !== sessionIdIdx + 1)
      : args;
    const key = positional[2];
    const value = positional[3];
    const dir = planningDir;
    if (sub === 'get') {
      if (!key) { error('Usage: pbr-tools.js session get <key> [--session-id <id>]'); return; }
      if (!SESSION_ALLOWED_KEYS.includes(key)) { error(`Unknown session key: ${key}. Allowed: ${SESSION_ALLOWED_KEYS.join(', ')}`); return; }
      const data = sessionLoad(dir, sessionId);
      const val = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      output({ key, value: val });
    } else if (sub === 'set') {
      if (!key || value === undefined) { error('Usage: pbr-tools.js session set <key> <value> [--session-id <id>]'); return; }
      if (!SESSION_ALLOWED_KEYS.includes(key)) { error(`Unknown session key: ${key}. Allowed: ${SESSION_ALLOWED_KEYS.join(', ')}`); return; }
      // Coerce numeric strings
      let coerced = value;
      if (/^\d+$/.test(value)) coerced = parseInt(value, 10);
      else if (value === 'null') coerced = null;
      const result = sessionSave(dir, { [key]: coerced }, sessionId);
      if (!result.success) { error(result.error || 'Failed to save session'); return; }
      output({ ok: true });
    } else if (sub === 'clear') {
      if (key) {
        // Clear a specific key
        if (!SESSION_ALLOWED_KEYS.includes(key)) { error(`Unknown session key: ${key}. Allowed: ${SESSION_ALLOWED_KEYS.join(', ')}`); return; }
        const result = sessionSave(dir, { [key]: null }, sessionId);
        if (!result.success) { error(result.error || 'Failed to clear session key'); return; }
      } else {
        // Clear entire session file
        const sessionPath = sessionId
          ? resolveSessionPath(dir, '.session.json', sessionId)
          : path.join(dir, '.session.json');
        try { if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath); } catch (e) { error(e.message); return; }
      }
      output({ ok: true });
    } else if (sub === 'dump') {
      const data = sessionLoad(dir, sessionId);
      output(data);
    } else {
      error('Usage: pbr-tools.js session get|set|clear|dump <key> [value] [--session-id <id>]');
    }
    return;
  }

  // --- Claim ---
  if (command === 'claim') {
    const { acquireClaim, releaseClaim, listClaims: _listClaims } = require('../lib/session');
    if (subcommand === 'acquire') {
      const phaseSlug = args[2];
      const sidIdx = args.indexOf('--session-id');
      const sessionId = sidIdx !== -1 ? args[sidIdx + 1] : null;
      const skillIdx = args.indexOf('--skill');
      const skill = skillIdx !== -1 ? args[skillIdx + 1] : 'unknown';
      if (!phaseSlug || !sessionId) {
        error('Usage: pbr-tools.js claim acquire <phase-slug> --session-id <id> --skill <name>');
        return;
      }
      const phaseDir = path.join(planningDir, 'phases', phaseSlug);
      if (!fs.existsSync(phaseDir)) { output({ error: `Phase directory not found: ${phaseSlug}` }); return; }
      output(acquireClaim(planningDir, phaseDir, sessionId, skill));
    } else if (subcommand === 'release') {
      const phaseSlug = args[2];
      const sidIdx = args.indexOf('--session-id');
      const sessionId = sidIdx !== -1 ? args[sidIdx + 1] : null;
      if (!phaseSlug || !sessionId) {
        error('Usage: pbr-tools.js claim release <phase-slug> --session-id <id>');
        return;
      }
      const phaseDir = path.join(planningDir, 'phases', phaseSlug);
      if (!fs.existsSync(phaseDir)) { output({ error: `Phase directory not found: ${phaseSlug}` }); return; }
      output(releaseClaim(planningDir, phaseDir, sessionId));
    } else if (subcommand === 'list') {
      const { listClaims: _listClaimsLocal } = require('../lib/session');
      output(_listClaimsLocal(planningDir));
    } else {
      error('Usage: pbr-tools.js claim acquire|release|list');
    }
    return;
  }

  // --- Context Triage ---
  if (command === 'context-triage') {
    const { contextTriage: _contextTriage } = require('../lib/context');
    const options = {};
    const agentsIdx = args.indexOf('--agents-done');
    if (agentsIdx !== -1) options.agentsDone = parseInt(args[agentsIdx + 1], 10);
    const plansIdx = args.indexOf('--plans-total');
    if (plansIdx !== -1) options.plansTotal = parseInt(args[plansIdx + 1], 10);
    const stepIdx = args.indexOf('--step');
    if (stepIdx !== -1) options.currentStep = args[stepIdx + 1];
    output(_contextTriage(options, planningDir));
    return;
  }

  // --- Reference ---
  if (command === 'reference') {
    const name = args[1];
    if (!name) { error('Usage: pbr-tools.js reference <name> [--section <heading>] [--list]'); return; }
    const listFlag = args.includes('--list');
    const sectionIdx = args.indexOf('--section');
    const section = sectionIdx !== -1 ? args.slice(sectionIdx + 1).join(' ') : null;
    const root = _resolvePluginRoot();
    const { referenceGet: _referenceGet } = require('../lib/reference');
    output(_referenceGet(name, { section, list: listFlag }, root));
    return;
  }

  // --- Skill Section ---
  if (command === 'skill-section') {
    const root = _resolvePluginRoot();
    const { skillSection: _skillSection, listAvailableSkills: _listAvailableSkills } = require('../lib/skill-section');
    // skill-section --list <skill>
    if (args[1] === '--list') {
      const skillName = args[2];
      if (!skillName) { error('Usage: pbr-tools.js skill-section --list <skill>'); return; }
      const { listHeadings } = require('../lib/reference');
      const skillPath = path.join(root, 'skills', skillName, 'SKILL.md');
      if (!fs.existsSync(skillPath)) {
        output({ error: `Skill not found: ${skillName}`, available: _listAvailableSkills(root) });
        process.exit(1);
      }
      const content = fs.readFileSync(skillPath, 'utf8');
      output({ skill: skillName, headings: listHeadings(content) });
      return;
    }
    // skill-section <skill> <section...>
    const skillName = args[1];
    const sectionQuery = args.slice(2).join(' ');
    if (!skillName || !sectionQuery) {
      error('Usage: pbr-tools.js skill-section <skill> <section>');
      return;
    }
    const secResult = _skillSection(skillName, sectionQuery, root);
    output(secResult);
    if (secResult.error) process.exit(1);
    return;
  }

  // --- Step Verify ---
  if (command === 'step-verify') {
    const { stepVerify: _stepVerify } = require('../lib/step-verify');
    const skill = args[1];
    const step = args[2];
    const checklistStr = args[3] || '[]';
    let checklist;
    try {
      checklist = JSON.parse(checklistStr);
    } catch (_e) {
      output({ error: 'Invalid checklist JSON' });
      process.exit(1);
      return;
    }
    const svContext = {
      planningDir,
      phaseSlug: process.env.PBR_PHASE_SLUG || '',
      planId: process.env.PBR_PLAN_ID || ''
    };
    const svResult = _stepVerify(skill, step, checklist, svContext);
    output(svResult);
    if (svResult.error || svResult.all_passed === false) process.exit(1);
    return;
  }

  // --- Build Preview ---
  if (command === 'build-preview') {
    const { buildPreview: _buildPreview } = require('../lib/preview');
    const phaseSlug = args[1];
    if (!phaseSlug) {
      error('Usage: pbr-tools.js build-preview <phase-slug>');
      return;
    }
    const previewPluginRoot = path.resolve(__dirname, '..', '..');
    const result = _buildPreview(phaseSlug, {}, planningDir, previewPluginRoot);
    if (result && result.error) {
      output(result);
      process.exit(1);
    }
    output(result);
    return;
  }

  // --- Suggest Alternatives ---
  if (command === 'suggest-alternatives') {
    const {
      phaseAlternatives: _phaseAlternatives,
      prerequisiteAlternatives: _prereqAlternatives,
      configAlternatives: _configAlternatives
    } = require('../lib/alternatives');
    const errorType = args[1];
    if (errorType === 'phase-not-found') {
      output(_phaseAlternatives(args[2] || '', planningDir));
    } else if (errorType === 'missing-prereq') {
      output(_prereqAlternatives(args[2] || '', planningDir));
    } else if (errorType === 'config-invalid') {
      output(_configAlternatives(args[2] || '', args[3] || '', planningDir));
    } else {
      output({ error: 'Unknown error type. Valid: phase-not-found, missing-prereq, config-invalid' });
      process.exit(1);
    }
    return;
  }

  // --- Tmux Detect ---
  if (command === 'tmux' && subcommand === 'detect') {
    const tmuxEnv = process.env.TMUX || '';
    const result = {
      in_tmux: !!tmuxEnv,
      pane: process.env.TMUX_PANE || null,
      session: null
    };
    if (tmuxEnv) {
      const parts = tmuxEnv.split(',');
      if (parts.length >= 1) {
        result.session = parts[0].split('/').pop() || null;
      }
    }
    output(result);
    return;
  }

  // --- Quick Init ---
  if (command === 'quick' && subcommand === 'init') {
    const desc = args.slice(2).join(' ') || '';
    const quickInitMod = require('../lib/quick-init.js');
    output(quickInitMod.quickInit(desc, planningDir));
    return;
  }

  // --- Slug Generation ---
  if (command === 'generate-slug' || command === 'slug-generate') {
    const text = args.slice(1).join(' ');
    if (!text) { error('Usage: pbr-tools.js generate-slug <text>'); return; }
    const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    output({ slug });
    return;
  }

  // --- Parse Args ---
  if (command === 'parse-args') {
    const type = args[1];
    const rawInput = args.slice(2).join(' ');
    if (!type) { error('Usage: pbr-tools.js parse-args <type> <args>\nTypes: plan, quick'); return; }
    const { parseArgs } = require('../lib/parse-args');
    output(parseArgs(type, rawInput));
    return;
  }

  // --- Status Fingerprint ---
  if (command === 'status' && subcommand === 'fingerprint') {
    const files = {};
    let combinedContent = '';
    for (const name of ['STATE.md', 'ROADMAP.md']) {
      const filePath = path.join(planningDir, name);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const stat = fs.statSync(filePath);
        const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
        files[name] = {
          hash,
          mtime: stat.mtime.toISOString(),
          lines: content.split('\n').length
        };
        combinedContent += content;
      } catch {
        files[name] = { hash: null, mtime: null, lines: 0 };
      }
    }
    const fingerprint = combinedContent
      ? crypto.createHash('sha256').update(combinedContent).digest('hex').slice(0, 8)
      : null;
    let phaseDirs = 0;
    const phasesDir = path.join(planningDir, 'phases');
    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      phaseDirs = entries.filter(e => e.isDirectory()).length;
    } catch { /* no phases dir */ }
    output({
      fingerprint,
      files,
      phase_dirs: phaseDirs,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // --- Status Render ---
  if (command === 'status' && subcommand === 'render') {
    const { statusRender: _statusRender } = require('../lib/status-render');
    output(_statusRender(planningDir));
    return;
  }

  // --- Suggest Next ---
  if (command === 'suggest-next') {
    const { suggestNext: _suggestNext } = require('../lib/suggest-next');
    output(_suggestNext(planningDir));
    return;
  }

  // --- Quick Status ---
  if (command === 'quick-status') {
    const { quickStatus: _quickStatus } = require('../quick-status');
    const result = _quickStatus(planningDir);
    process.stdout.write(result.text + '\n');
    return;
  }

  // --- CI Fix ---
  if (command === 'ci-fix') {
    const { runCiFixLoop: _runCiFixLoop } = require('../lib/ci-fix-loop');
    const dryRun = args.includes('--dry-run');
    const maxIterIdx = args.indexOf('--max-iterations');
    const maxIterations = maxIterIdx !== -1 ? parseInt(args[maxIterIdx + 1], 10) : 3;
    output(_runCiFixLoop({ dryRun, maxIterations, cwd: path.resolve('.') }));
    return;
  }

  // --- CI Poll ---
  if (command === 'ci-poll') {
    const { ciPoll: _ciPoll } = require('../lib/build');
    const runId = args[1];
    const timeoutIdx = args.indexOf('--timeout');
    const timeoutSecs = timeoutIdx !== -1 ? parseInt(args[timeoutIdx + 1], 10) : 300;
    if (!runId) { error('Usage: pbr-tools.js ci-poll <run-id> [--timeout <seconds>]'); return; }
    output(_ciPoll(runId, timeoutSecs, planningDir));
    return;
  }

  // --- Rollback ---
  if (command === 'rollback') {
    const { rollback: _rollback } = require('../lib/build');
    const manifestPath = args[1];
    if (!manifestPath) { error('Usage: pbr-tools.js rollback <manifest-path>'); return; }
    output(_rollback(manifestPath, planningDir));
    return;
  }

  // --- Negative Knowledge ---
  if (command === 'nk') {
    const nkLib = require(path.join(__dirname, '..', 'lib', 'negative-knowledge'));

    if (subcommand === 'record') {
      const titleIdx = args.indexOf('--title');
      const categoryIdx = args.indexOf('--category');
      const filesIdx = args.indexOf('--files');
      const triedIdx = args.indexOf('--tried');
      const failedIdx = args.indexOf('--failed');
      const workedIdx = args.indexOf('--worked');
      const phaseIdx = args.indexOf('--phase');

      const title = titleIdx !== -1 ? args[titleIdx + 1] : null;
      const category = categoryIdx !== -1 ? args[categoryIdx + 1] : null;
      const tried = triedIdx !== -1 ? args[triedIdx + 1] : null;
      const failed = failedIdx !== -1 ? args[failedIdx + 1] : null;

      if (!title || !category || !tried || !failed) {
        error('Usage: pbr-tools.js nk record --title "..." --category "build-failure" --files "f1,f2" --tried "..." --failed "..."\nRequired: --title, --category, --tried, --failed\nCategories: build-failure, verification-gap, plan-revision, debug-finding');
        return;
      }

      const filesInvolved = filesIdx !== -1 ? (args[filesIdx + 1] || '').split(',').filter(Boolean) : [];
      const whatWorked = workedIdx !== -1 ? args[workedIdx + 1] : '';
      const phase = phaseIdx !== -1 ? args[phaseIdx + 1] : '';

      const result = nkLib.recordFailure(planningDir, {
        title, category, filesInvolved,
        whatTried: tried, whyFailed: failed,
        whatWorked, phase
      });
      output({ ok: true, path: result.path, slug: result.slug });
    } else if (subcommand === 'list') {
      const catIdx = args.indexOf('--category');
      const phIdx = args.indexOf('--phase');
      const stIdx = args.indexOf('--status');
      const filters = {};
      if (catIdx !== -1) filters.category = args[catIdx + 1];
      if (phIdx !== -1) filters.phase = args[phIdx + 1];
      if (stIdx !== -1) filters.status = args[stIdx + 1];
      output(nkLib.listFailures(planningDir, filters));
    } else if (subcommand === 'resolve') {
      const slug = args[2];
      if (!slug) {
        error('Usage: pbr-tools.js nk resolve <slug>');
        return;
      }
      nkLib.resolveEntry(planningDir, slug);
      output({ ok: true });
    } else {
      error('Usage: pbr-tools.js nk <record|list|resolve>\n  nk record --title "..." --category "..." --files "f1,f2" --tried "..." --failed "..."\n  nk list [--category X] [--phase X] [--status X]\n  nk resolve <slug>');
    }
    return;
  }

  // --- Not handled by this module ---
  return 'NOT_HANDLED';
}

module.exports = { handleMisc };
