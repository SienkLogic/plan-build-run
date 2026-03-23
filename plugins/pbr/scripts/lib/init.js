/**
 * lib/init.cjs — Compound init commands for Plan-Build-Run tools.
 *
 * These aggregate state from multiple sources into single JSON payloads
 * for skill initialization. Each init function returns everything a skill
 * needs to start work without additional file reads.
 *
 * Hybrid module merging PBR reference features with GSD-unique init commands.
 */

const fs = require('fs');
const path = require('path');
const { stateLoad, stateCheckProgress } = require('./state');
const { configLoad, configResolveDepth } = require('./config');
const { phaseInfo, phasePlanIndex } = require('./phase');
const { resolveSessionPath } = require('./core');
const { suggestNext } = require('./suggest-next');

/**
 * Detect drift between STATE.md and filesystem-derived progress.
 * Compares plans_complete and progress_percent.
 *
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ drift_detected: boolean, stale_fields: string[] }}
 */
function detectDrift(planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  try {
    const progress = stateCheckProgress(dir);
    const state = stateLoad(dir);
    const stale_fields = [];

    if (state.exists && state.state) {
      const stPlansComplete = Number(state.state.plans_complete || 0);
      const fsPlansComplete = progress.completed_plans;
      if (stPlansComplete !== fsPlansComplete) {
        stale_fields.push('plans_complete');
      }

      const stProgress = Number(state.state.progress || 0);
      const fsProgress = progress.percentage;
      if (stProgress !== fsProgress) {
        stale_fields.push('progress_percent');
      }
    }

    return { drift_detected: stale_fields.length > 0, stale_fields };
  } catch (_e) {
    return { drift_detected: false, stale_fields: [] };
  }
}

/**
 * Initialize context for executing a phase (building plans).
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 * @param {string} [overrideModel] - Optional model override from --model CLI flag (sonnet|opus|haiku|inherit)
 */
function initExecutePhase(phaseNum, planningDir, overrideModel) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const state = stateLoad(dir);
  if (!state.exists) return { error: "No .planning/ directory found" };
  const phase = phaseInfo(phaseNum, dir);
  if (phase.error) return { error: phase.error };
  const plans = phasePlanIndex(phaseNum, dir);
  const config = configLoad(dir) || {};
  const depthProfile = configResolveDepth(dir);
  const models = config.models || {};
  let gitState = { branch: null, clean: null };
  try {
    const { execSync } = require("child_process");
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", timeout: 5000 }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf8", timeout: 5000 }).trim();
    gitState = { branch, clean: status === "" };
  } catch (_e) { /* not a git repo */ }
  return {
    executor_model: overrideModel || models.executor || "sonnet",
    verifier_model: overrideModel || models.verifier || "sonnet",
    config: { depth: depthProfile.depth || 'standard', mode: config.mode || "interactive", parallelization: config.parallelization || { enabled: false }, planning: config.planning || {}, gates: config.gates || {}, features: config.features || {} },
    phase: { num: phaseNum, dir: phase.phase, name: phase.name, goal: phase.goal, has_context: phase.has_context, status: phase.filesystem_status, plan_count: phase.plan_count, completed: phase.completed },
    plans: (plans.plans || []).map(p => ({ file: p.file, plan_id: p.plan_id, wave: p.wave, autonomous: p.autonomous, has_summary: p.has_summary, must_haves_count: p.must_haves_count, depends_on: p.depends_on })),
    waves: plans.waves || {},
    branch_name: gitState.branch, git_clean: gitState.clean,
    drift: detectDrift(dir)
  };
}

/**
 * Initialize context for planning a phase.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 * @param {string} [overrideModel] - Optional model override from --model CLI flag (sonnet|opus|haiku|inherit)
 */
function initPlanPhase(phaseNum, planningDir, overrideModel) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const state = stateLoad(dir);
  if (!state.exists) return { error: "No .planning/ directory found" };
  const config = configLoad(dir) || {};
  const models = config.models || {};
  const depthProfile = configResolveDepth(dir);
  const phasesDir = path.join(dir, "phases");
  const paddedPhase = String(phaseNum).padStart(2, "0");
  let existingArtifacts = [], phaseDirName = null;
  if (fs.existsSync(phasesDir)) {
    const dirs = fs.readdirSync(phasesDir).filter(d => d.startsWith(paddedPhase + "-"));
    if (dirs.length > 0) { phaseDirName = dirs[0]; existingArtifacts = fs.readdirSync(path.join(phasesDir, phaseDirName)).filter(f => f.endsWith(".md")); }
  }
  let phaseGoal = null, phaseDeps = null;
  if (state.roadmap && state.roadmap.phases) {
    const rp = state.roadmap.phases.find(p => p.number === paddedPhase);
    if (rp) { phaseGoal = rp.goal; phaseDeps = rp.depends_on; }
  }
  return {
    researcher_model: overrideModel || models.researcher || "sonnet", planner_model: overrideModel || models.planner || "sonnet", checker_model: overrideModel || models.planner || "sonnet",
    config: { depth: depthProfile.depth || 'standard', profile: depthProfile.profile || 'balanced', features: config.features || {}, planning: config.planning || {} },
    phase: { num: phaseNum, dir: phaseDirName, goal: phaseGoal, depends_on: phaseDeps },
    existing_artifacts: existingArtifacts,
    workflow: { research_phase: (config.features || {}).research_phase !== false, plan_checking: (config.features || {}).plan_checking !== false },
    drift: detectDrift(dir)
  };
}

/**
 * Initialize context for a quick task.
 *
 * @param {string} description - Task description
 * @param {string} [planningDir] - Path to .planning directory
 */
function initQuick(description, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const config = configLoad(dir) || {};
  const quickDir = path.join(dir, "quick");
  let nextNum = 1;
  if (fs.existsSync(quickDir)) {
    const dirs = fs.readdirSync(quickDir).filter(d => /^\d{3}-/.test(d)).sort();
    if (dirs.length > 0) { nextNum = parseInt(dirs[dirs.length - 1].substring(0, 3), 10) + 1; }
  }
  const slug = (description || "task").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 30);
  const paddedNum = String(nextNum).padStart(3, "0");
  return {
    next_task_number: paddedNum, slug, dir: path.join(".planning", "quick", paddedNum + "-" + slug),
    dir_name: paddedNum + "-" + slug, timestamp: new Date().toISOString(),
    config: { depth: config.depth || "standard", mode: config.mode || "interactive", models: config.models || {}, planning: config.planning || {} }
  };
}

/**
 * Initialize context for verifying phase work.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 * @param {string} [overrideModel] - Optional model override from --model CLI flag (sonnet|opus|haiku|inherit)
 */
function initVerifyWork(phaseNum, planningDir, overrideModel) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const phase = phaseInfo(phaseNum, dir);
  if (phase.error) return { error: phase.error };
  const config = configLoad(dir) || {};
  const models = config.models || {};
  let priorAttempts = 0;
  if (phase.verification) { priorAttempts = parseInt(phase.verification.attempt, 10) || 0; }
  return {
    verifier_model: overrideModel || models.verifier || "sonnet",
    phase: { num: phaseNum, dir: phase.phase, name: phase.name, goal: phase.goal, plan_count: phase.plan_count, completed: phase.completed },
    has_verification: !!phase.verification, prior_attempts: priorAttempts,
    prior_status: phase.verification ? (phase.verification.status || "unknown") : null,
    summaries: phase.summaries || []
  };
}

/**
 * Initialize context for resuming work.
 *
 * @param {string} [planningDir] - Path to .planning directory
 * @param {string} [sessionId] - Session identifier for session-scoped paths
 */
function initResume(planningDir, sessionId) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const state = stateLoad(dir);
  if (!state.exists) return { error: "No .planning/ directory found" };
  let autoNext = null, continueHere = null, activeSkill = null;
  const autoNextPath = sessionId
    ? resolveSessionPath(dir, '.auto-next', sessionId)
    : path.join(dir, '.auto-next');
  const activeSkillPath = sessionId
    ? resolveSessionPath(dir, '.active-skill', sessionId)
    : path.join(dir, '.active-skill');
  try { autoNext = fs.readFileSync(autoNextPath, "utf8").trim(); } catch (_e) { /* file not found */ }
  try { continueHere = fs.readFileSync(path.join(dir, ".continue-here"), "utf8").trim(); } catch (_e) { /* file not found */ }
  try { activeSkill = fs.readFileSync(activeSkillPath, "utf8").trim(); } catch (_e) { /* file not found */ }

  // Drift detection and auto-repair
  const drift = detectDrift(dir);
  let rederived = false;
  let corrections = [];
  let rederive_error = undefined;

  if (drift.drift_detected) {
    try {
      const { stateRederive } = require('./state');
      const rederiveResult = stateRederive(dir);
      if (rederiveResult.success) {
        rederived = true;
        corrections = rederiveResult.corrected || [];
      } else {
        rederive_error = rederiveResult.error || 'stateRederive returned failure';
      }
    } catch (e) {
      rederived = false;
      corrections = [];
      rederive_error = e.message;
    }
  }

  const result = { state: state.state, auto_next: autoNext, continue_here: continueHere, active_skill: activeSkill, current_phase: state.current_phase, progress: state.progress, drift, rederived, corrections };
  if (rederive_error) result.rederive_error = rederive_error;
  return result;
}

/**
 * Initialize context for progress display.
 *
 * @param {string} [planningDir] - Path to .planning directory
 */
function initProgress(planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const state = stateLoad(dir);
  if (!state.exists) return { error: "No .planning/ directory found" };
  const progress = stateCheckProgress(dir);
  return { current_phase: state.current_phase, total_phases: state.phase_count, status: state.state ? state.state.status : null, phases: progress.phases, total_plans: progress.total_plans, completed_plans: progress.completed_plans, percentage: progress.percentage, drift: detectDrift(dir) };
}

/**
 * Aggregate all state an orchestrator skill needs to begin work on a phase.
 * Replaces 5-10 individual file reads with a single CLI call returning ~1,500 tokens of JSON.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 */
function initStateBundle(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const { parseYamlFrontmatter } = require('./core');

  // 1. State
  const stateResult = stateLoad(dir);
  if (!stateResult.exists) return { error: 'No .planning/ directory found' };
  const st = stateResult.state || {};
  const state = {
    current_phase: stateResult.current_phase,
    status: st.status || stateResult.status || null,
    progress: stateResult.progress,
    total_phases: stateResult.phase_count || null,
    last_activity: st.last_activity || null,
    blockers: st.blockers || []
  };

  // 2. Config summary
  const config = configLoad(dir) || {};
  const depthProfile = configResolveDepth(dir);
  const models = config.models || {};
  const config_summary = {
    depth: depthProfile.depth || 'standard',
    mode: config.mode || 'interactive',
    parallelization: config.parallelization || { enabled: false },
    gates: config.gates || {},
    features: config.features || {},
    models: { executor: models.executor || 'sonnet', verifier: models.verifier || 'sonnet', planner: models.planner || 'sonnet' }
  };

  // 3. Phase info
  const phaseResult = phaseInfo(phaseNum, dir);
  if (phaseResult.error) return { error: phaseResult.error };
  const phase = {
    num: phaseNum,
    dir: phaseResult.phase,
    name: phaseResult.name,
    goal: phaseResult.goal,
    has_context: phaseResult.has_context,
    status: phaseResult.filesystem_status,
    plan_count: phaseResult.plan_count,
    completed: phaseResult.completed
  };

  // 4. Plans
  const plansResult = phasePlanIndex(phaseNum, dir);
  const plans = (plansResult.plans || []).map(p => ({
    file: p.file,
    plan_id: p.plan_id,
    wave: p.wave,
    autonomous: p.autonomous,
    has_summary: p.has_summary,
    must_haves_count: p.must_haves_count,
    depends_on: p.depends_on
  }));
  const waves = plansResult.waves || {};

  // 5. Prior summaries -- scan all phase directories for SUMMARY*.md, extract frontmatter only
  const prior_summaries = [];
  const phasesDir = path.join(dir, 'phases');
  if (fs.existsSync(phasesDir)) {
    const phaseDirs = fs.readdirSync(phasesDir).filter(d => {
      try { return fs.statSync(path.join(phasesDir, d)).isDirectory(); } catch (_e) { return false; }
    }).sort();
    for (const pd of phaseDirs) {
      if (prior_summaries.length >= 10) break;
      const pdPath = path.join(phasesDir, pd);
      let summaryFiles;
      try { summaryFiles = fs.readdirSync(pdPath).filter(f => /^SUMMARY.*\.md$/i.test(f)).sort(); } catch (_e) { continue; }
      for (const sf of summaryFiles) {
        if (prior_summaries.length >= 10) break;
        try {
          const content = fs.readFileSync(path.join(pdPath, sf), 'utf8');
          const fm = parseYamlFrontmatter(content);
          if (fm && !fm.error) {
            const entry = {
              phase: fm.phase !== undefined ? fm.phase : null,
              plan: fm.plan !== undefined ? fm.plan : null,
              status: fm.status || null,
              provides: fm.provides || [],
              requires: fm.requires || [],
              key_files: fm.key_files || []
            };
            if (fm.key_decisions !== undefined) entry.key_decisions = fm.key_decisions;
            prior_summaries.push(entry);
          }
        } catch (_e) { /* skip unreadable */ }
      }
    }
  }

  // 6. Context file existence
  const has_project_context = fs.existsSync(path.join(dir, 'CONTEXT.md'));
  const has_phase_context = phaseResult.has_context || false;

  // 7. Git state
  let git = { branch: null, clean: null };
  try {
    const { execSync } = require('child_process');
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
    const status = execSync('git status --porcelain', { encoding: 'utf8', timeout: 5000 }).trim();
    git = { branch, clean: status === '' };
  } catch (_e) { /* not a git repo */ }

  return {
    state,
    config_summary,
    phase,
    plans,
    waves,
    prior_summaries,
    git,
    has_project_context,
    has_phase_context
  };
}

/**
 * Initialize context for the continue workflow.
 *
 * @param {string} [planningDir] - Path to .planning directory
 */
function initContinue(planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const state = stateLoad(dir);
  if (!state.exists) return { error: "No .planning/ directory found" };
  const config = configLoad(dir) || {};

  let autoNext = null, continueHere = null, activeSkill = null;
  try { autoNext = fs.readFileSync(path.join(dir, '.auto-next'), 'utf8').trim(); } catch (_e) { /* missing */ }
  try { continueHere = fs.readFileSync(path.join(dir, '.continue-here'), 'utf8').trim(); } catch (_e) { /* missing */ }
  try { activeSkill = fs.readFileSync(path.join(dir, '.active-skill'), 'utf8').trim(); } catch (_e) { /* missing */ }

  const routing = suggestNext(dir);
  const drift = detectDrift(dir);

  let currentPhase = null;
  if (state.current_phase) {
    try {
      const pi = phaseInfo(state.current_phase, dir);
      if (!pi.error) {
        currentPhase = { num: pi.num || state.current_phase, dir: pi.phase, name: pi.name, goal: pi.goal, status: pi.filesystem_status, plan_count: pi.plan_count, completed: pi.completed };
      }
    } catch (_e) { /* phase not found */ }
  }

  return {
    state: state.state,
    config: { mode: config.mode || 'interactive', features: config.features || {}, gates: config.gates || {}, parallelization: config.parallelization || { enabled: false }, workflow: config.workflow || {} },
    current_phase: currentPhase,
    auto_next: autoNext,
    continue_here: continueHere,
    active_skill: activeSkill,
    routing,
    drift
  };
}

/**
 * Initialize context for the milestone workflow.
 *
 * @param {string} [planningDir] - Path to .planning directory
 */
function initMilestone(planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const state = stateLoad(dir);
  if (!state.exists) return { error: "No .planning/ directory found" };
  const config = configLoad(dir) || {};

  let roadmapContent = null;
  try { roadmapContent = fs.readFileSync(path.join(dir, 'ROADMAP.md'), 'utf8'); } catch (_e) { /* missing */ }

  let hasProject = false;
  try { hasProject = fs.existsSync(path.join(dir, 'PROJECT.md')); } catch (_e) { /* */ }

  let existingArchives = [];
  const milestonesDir = path.join(dir, 'milestones');
  try {
    if (fs.existsSync(milestonesDir)) {
      existingArchives = fs.readdirSync(milestonesDir).filter(d => {
        try { return fs.statSync(path.join(milestonesDir, d)).isDirectory(); } catch (_e) { return false; }
      });
    }
  } catch (_e) { /* missing */ }

  // Extract milestone sections from ROADMAP.md
  const milestones = [];
  if (roadmapContent) {
    const lines = roadmapContent.replace(/\r\n/g, '\n').split('\n');
    let currentMs = null;
    for (const line of lines) {
      const msMatch = line.match(/^##\s+Milestone[:\s]+(.+)/i);
      if (msMatch) {
        if (currentMs) milestones.push(currentMs);
        currentMs = { name: msMatch[1].trim(), phases_range: null };
        continue;
      }
      if (currentMs) {
        const phaseMatch = line.match(/###\s+Phase\s+(\d+)/i) || line.match(/^\|\s*(\d+)\.\s/) || line.match(/^-\s*\[.\]\s*(?:Phase\s+)?(\d+)/i);
        if (phaseMatch) {
          const num = parseInt(phaseMatch[1], 10);
          if (!currentMs._min || num < currentMs._min) currentMs._min = num;
          if (!currentMs._max || num > currentMs._max) currentMs._max = num;
        }
      }
    }
    if (currentMs) milestones.push(currentMs);
    for (const ms of milestones) {
      if (ms._min != null && ms._max != null) {
        ms.phases_range = `${ms._min}-${ms._max}`;
      }
      delete ms._min;
      delete ms._max;
    }
  }

  const st = state.state || {};
  return {
    state: {
      current_phase: state.current_phase,
      status: st.status || null,
      last_milestone_version: st.last_milestone_version || null,
      last_milestone_completed: st.last_milestone_completed || null
    },
    config: { mode: config.mode || 'interactive', planning: config.planning || {}, git: config.git || {} },
    milestones,
    existing_archives: existingArchives,
    has_roadmap: roadmapContent !== null,
    has_project: hasProject,
    phase_count: state.phase_count || 0
  };
}

/**
 * Initialize context for the begin workflow.
 *
 * @param {string} [planningDir] - Path to .planning directory
 */
function initBegin(planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const hasPlanning = fs.existsSync(dir);

  let state = null, config = null, existingPhases = 0;
  if (hasPlanning) {
    const stateResult = stateLoad(dir);
    if (stateResult.exists) state = stateResult.state;
    config = configLoad(dir) || null;
    const phasesDir = path.join(dir, 'phases');
    try {
      if (fs.existsSync(phasesDir)) {
        existingPhases = fs.readdirSync(phasesDir, { withFileTypes: true }).filter(d => d.isDirectory()).length;
      }
    } catch (_e) { /* */ }
  }

  // Brownfield detection — check project root (parent of .planning)
  const projectRoot = path.dirname(dir);
  const indicators = ['package.json', 'requirements.txt', 'go.mod', 'Cargo.toml', 'CMakeLists.txt', 'src', 'lib', 'app'];
  const brownfieldIndicators = indicators.filter(f => {
    try { return fs.existsSync(path.join(projectRoot, f)); } catch (_e) { return false; }
  });

  let hasGit = false;
  try { hasGit = fs.existsSync(path.join(projectRoot, '.git')); } catch (_e) { /* */ }

  return {
    has_planning: hasPlanning,
    has_existing_code: brownfieldIndicators.length > 0,
    brownfield_indicators: brownfieldIndicators,
    has_git: hasGit,
    existing_phases: existingPhases,
    state,
    config
  };
}

/**
 * Initialize context for the status workflow.
 *
 * @param {string} [planningDir] - Path to .planning directory
 */
function initStatus(planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const state = stateLoad(dir);
  if (!state.exists) return { error: "No .planning/ directory found" };
  const config = configLoad(dir) || {};
  const progress = stateCheckProgress(dir);
  const routing = suggestNext(dir);
  const drift = detectDrift(dir);

  // Count pending todos
  let pendingTodos = 0;
  const todosDir = path.join(dir, 'todos', 'pending');
  try {
    if (fs.existsSync(todosDir)) {
      pendingTodos = fs.readdirSync(todosDir).filter(f => f.endsWith('.md')).length;
    }
  } catch (_e) { /* */ }

  // Count notes
  let notes = 0;
  const notesDir = path.join(dir, 'notes');
  try {
    if (fs.existsSync(notesDir)) {
      notes = fs.readdirSync(notesDir).filter(f => f.endsWith('.md')).length;
    }
  } catch (_e) { /* */ }

  // Count active debug sessions
  let activeDebug = 0;
  const debugDir = path.join(dir, 'debug');
  try {
    if (fs.existsSync(debugDir)) {
      activeDebug = fs.readdirSync(debugDir, { withFileTypes: true }).filter(d => d.isDirectory()).length;
    }
  } catch (_e) { /* */ }

  // Check for paused work
  let hasPausedWork = false;
  try { hasPausedWork = fs.existsSync(path.join(dir, '.continue-here')); } catch (_e) { /* */ }

  const st = state.state || {};
  return {
    state: st,
    progress,
    routing,
    drift,
    config: { mode: config.mode || 'interactive', features: config.features || {}, workflow: config.workflow || {} },
    counts: { pending_todos: pendingTodos, notes, active_debug: activeDebug },
    has_paused_work: hasPausedWork,
    current_phase: state.current_phase,
    phase_count: state.phase_count || 0
  };
}

/**
 * Initialize context for the map-codebase (scan) workflow.
 * Lightweight metadata: config, model, paths, existing maps.
 * Mapper agents do their own exploration — no upfront recon file.
 *
 * @param {string} [planningDir] - Path to .planning directory
 * @returns {object} Init metadata for scan skill
 */
function initMapCodebase(planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const config = configLoad(dir) || {};

  // Resolve mapper model from config
  const models = config.models || {};
  const mapperModel = models.mapper || models.executor || 'sonnet';

  // Check for existing codebase maps
  const codebaseDir = path.join(dir, 'codebase');
  let existingMaps = [];
  try {
    existingMaps = fs.readdirSync(codebaseDir).filter(f => f.endsWith('.md'));
  } catch (_e) { /* */ }

  // Resolve depth profile for mapper count/areas
  let depthProfile = {};
  try {
    depthProfile = configResolveDepth(dir) || {};
  } catch (_e) { /* */ }

  // Check intel status
  const intelDir = path.join(dir, 'intel');
  let intelEnabled = true;
  try {
    if (config.intel && config.intel.enabled === false) intelEnabled = false;
  } catch (_e) { /* */ }
  const hasIntelDir = fs.existsSync(intelDir);

  return {
    mapper_model: mapperModel,
    commit_docs: (config.planning || {}).commit_docs || false,
    search_gitignored: (config.planning || {}).search_gitignored || false,
    codebase_dir: '.planning/codebase',
    existing_maps: existingMaps,
    has_maps: existingMaps.length > 0,
    planning_exists: fs.existsSync(dir),
    codebase_dir_exists: fs.existsSync(codebaseDir),
    intel_enabled: intelEnabled,
    has_intel_dir: hasIntelDir,
    depth_profile: depthProfile
  };
}

module.exports = {
  detectDrift,
  initExecutePhase,
  initPlanPhase,
  initQuick,
  initVerifyWork,
  initResume,
  initProgress,
  initStateBundle,
  initContinue,
  initMilestone,
  initBegin,
  initStatus,
  initMapCodebase
};
