/**
 * lib/init.js — Compound init commands for Plan-Build-Run tools.
 *
 * These aggregate state from multiple sources into single JSON payloads
 * for skill initialization. Each init function returns everything a skill
 * needs to start work without additional file reads.
 */

const fs = require('fs');
const path = require('path');
const { stateLoad, stateCheckProgress } = require('./state');
const { configLoad, resolveDepthProfile } = require('./config');
const { phaseInfo, planIndex } = require('./phase');

/**
 * Initialize context for executing a phase (building plans).
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 */
function initExecutePhase(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const state = stateLoad(dir);
  if (!state.exists) return { error: "No .planning/ directory found" };
  const phase = phaseInfo(phaseNum, dir);
  if (phase.error) return { error: phase.error };
  const plans = planIndex(phaseNum, dir);
  const config = configLoad(dir) || {};
  const depthProfile = resolveDepthProfile(config);
  const models = config.models || {};
  let gitState = { branch: null, clean: null };
  try {
    const { execSync } = require("child_process");
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", timeout: 5000 }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf8", timeout: 5000 }).trim();
    gitState = { branch, clean: status === "" };
  } catch (_e) { /* not a git repo */ }
  return {
    executor_model: models.executor || "sonnet",
    verifier_model: models.verifier || "sonnet",
    config: { depth: depthProfile.depth, mode: config.mode || "interactive", parallelization: config.parallelization || { enabled: false }, planning: config.planning || {}, gates: config.gates || {}, features: config.features || {} },
    phase: { num: phaseNum, dir: phase.phase, name: phase.name, goal: phase.goal, has_context: phase.has_context, status: phase.filesystem_status, plan_count: phase.plan_count, completed: phase.completed },
    plans: (plans.plans || []).map(p => ({ file: p.file, plan_id: p.plan_id, wave: p.wave, autonomous: p.autonomous, has_summary: p.has_summary, must_haves_count: p.must_haves_count, depends_on: p.depends_on })),
    waves: plans.waves || {},
    branch_name: gitState.branch, git_clean: gitState.clean
  };
}

/**
 * Initialize context for planning a phase.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 */
function initPlanPhase(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const state = stateLoad(dir);
  if (!state.exists) return { error: "No .planning/ directory found" };
  const config = configLoad(dir) || {};
  const models = config.models || {};
  const depthProfile = resolveDepthProfile(config);
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
    researcher_model: models.researcher || "sonnet", planner_model: models.planner || "sonnet", checker_model: models.planner || "sonnet",
    config: { depth: depthProfile.depth, profile: depthProfile.profile, features: config.features || {}, planning: config.planning || {} },
    phase: { num: phaseNum, dir: phaseDirName, goal: phaseGoal, depends_on: phaseDeps },
    existing_artifacts: existingArtifacts,
    workflow: { research_phase: (config.features || {}).research_phase !== false, plan_checking: (config.features || {}).plan_checking !== false }
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
 */
function initVerifyWork(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const phase = phaseInfo(phaseNum, dir);
  if (phase.error) return { error: phase.error };
  const config = configLoad(dir) || {};
  const models = config.models || {};
  let priorAttempts = 0;
  if (phase.verification) { priorAttempts = parseInt(phase.verification.attempt, 10) || 0; }
  return {
    verifier_model: models.verifier || "sonnet",
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
 */
function initResume(planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const state = stateLoad(dir);
  if (!state.exists) return { error: "No .planning/ directory found" };
  let autoNext = null, continueHere = null, activeSkill = null;
  try { autoNext = fs.readFileSync(path.join(dir, ".auto-next"), "utf8").trim(); } catch (_e) { /* file not found */ }
  try { continueHere = fs.readFileSync(path.join(dir, ".continue-here"), "utf8").trim(); } catch (_e) { /* file not found */ }
  try { activeSkill = fs.readFileSync(path.join(dir, ".active-skill"), "utf8").trim(); } catch (_e) { /* file not found */ }
  return { state: state.state, auto_next: autoNext, continue_here: continueHere, active_skill: activeSkill, current_phase: state.current_phase, progress: state.progress };
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
  return { current_phase: state.current_phase, total_phases: state.phase_count, status: state.state ? state.state.status : null, phases: progress.phases, total_plans: progress.total_plans, completed_plans: progress.completed_plans, percentage: progress.percentage };
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
  const depthProfile = resolveDepthProfile(config);
  const models = config.models || {};
  const config_summary = {
    depth: depthProfile.depth,
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
  const plansResult = planIndex(phaseNum, dir);
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

  // 5. Prior summaries — scan all phase directories for SUMMARY*.md, extract frontmatter only
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

module.exports = {
  initExecutePhase,
  initPlanPhase,
  initQuick,
  initVerifyWork,
  initResume,
  initProgress,
  initStateBundle
};
