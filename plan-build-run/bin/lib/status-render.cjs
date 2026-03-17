/**
 * lib/status-render.cjs -- Deterministic, pre-formatted status output for Plan-Build-Run.
 *
 * Produces a single JSON object containing all project status information.
 * Called by: `node pbr-tools.cjs status render`
 *
 * Reads: config.json, STATE.md, ROADMAP.md, PROJECT.md, phases/, todos/, notes/, quick/
 * Output: JSON with project state, progress bar, routing recommendations, document inventory.
 */

const fs = require('fs');
const path = require('path');
const { parseYamlFrontmatter, findFiles } = require('./core.cjs');

// ---- Progress bar ----

/**
 * Generate a 20-character Unicode progress bar.
 * @param {number} pct - Percentage 0-100
 * @returns {string} e.g. "[████████████████░░░░] 80%"
 */
function progressBar(pct) {
  const width = 20;
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${pct}%`;
}

// ---- Helpers ----

function safeReadFile(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  } catch (_e) {
    return null;
  }
}

function safeParseFrontmatter(content) {
  if (!content) return {};
  try {
    return parseYamlFrontmatter(content) || {};
  } catch (_e) {
    return {};
  }
}

function countFilesIn(dirPath, filterFn) {
  if (!fs.existsSync(dirPath)) return 0;
  try {
    const entries = fs.readdirSync(dirPath);
    return filterFn ? entries.filter(filterFn).length : entries.length;
  } catch (_e) {
    return 0;
  }
}

// ---- Milestone parsing from ROADMAP.md ----

function parseMilestones(roadmapContent) {
  if (!roadmapContent) return { milestones: [], current: null };

  const lines = roadmapContent.replace(/\r\n/g, '\n').split('\n');
  const milestones = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detect ## Milestone: Name (vX.Y) or ## Milestone N: Name (vX.Y)
    const msMatch = line.match(/^##\s+Milestone[:\s]+(.+)/i);
    if (!msMatch) continue;

    const raw = msMatch[1].trim();
    // Extract version: (vX.Y) or vX.Y
    const versionMatch = raw.match(/\(?(v[\d.]+)\)?/i);
    const version = versionMatch ? versionMatch[1] : null;
    // Clean name: remove version tag and COMPLETED marker
    let name = raw
      .replace(/\(v[\d.]+\)/i, '')
      .replace(/\bCOMPLETED\b/i, '')
      .replace(/[[\]]/g, '')
      .replace(/—\s*$/, '')
      .replace(/-+\s*$/, '')
      .trim()
      .replace(/\s+/g, ' ');

    // Check if completed (contains COMPLETED marker or all-checked phases)
    const isCompleted = /COMPLETED/i.test(raw);

    const ms = {
      name: name || 'Unnamed',
      version,
      status: isCompleted ? 'completed' : 'active',
      phase_count: 0,
      completed: null
    };

    // Scan content under this milestone heading
    for (let j = i + 1; j < lines.length; j++) {
      if (/^##\s/.test(lines[j]) && j !== i) break; // next milestone or section
      // Count phases: ### Phase N or table rows like "| 1. Name |"
      if (/^###\s+Phase\s+\d+/i.test(lines[j])) {
        ms.phase_count++;
      }
      // Table rows: "| N. Name | Status |" or "| Phase N |"
      if (/^\|\s*\d+\.\s/.test(lines[j])) {
        ms.phase_count++;
      }
      // Completion date: "Completed: YYYY-MM-DD"
      const dateMatch = lines[j].match(/Completed:\s*([\d-]+)/i);
      if (dateMatch) {
        ms.completed = dateMatch[1];
      }
    }

    milestones.push(ms);
    if (!isCompleted && !current) {
      current = ms;
    }
  }

  return { milestones, current };
}

// ---- Phase scanning ----

function scanPhases(planningDir) {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) return [];

  const phases = [];
  let entries;
  try {
    entries = fs.readdirSync(phasesDir, { withFileTypes: true });
  } catch (_e) {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^(\d+)-(.+)/);
    if (!match) continue;

    const phaseNum = parseInt(match[1], 10);
    const phaseName = match[2].replace(/-/g, ' ');
    const phaseDir = path.join(phasesDir, entry.name);

    const plans = findFiles(phaseDir, /^PLAN.*\.md$/i);
    const summaries = findFiles(phaseDir, /^SUMMARY.*\.md$/i);
    const verificationPath = path.join(phaseDir, 'VERIFICATION.md');
    let hasVerification = false;
    let verificationResult = null;

    if (fs.existsSync(verificationPath)) {
      hasVerification = true;
      const vContent = safeReadFile(verificationPath);
      if (vContent) {
        const fm = safeParseFrontmatter(vContent);
        verificationResult = fm.result || null;
      }
    }

    // Determine status
    let status = 'empty';
    if (hasVerification && verificationResult === 'passed') {
      status = 'verified';
    } else if (summaries.length > 0 && summaries.length >= plans.length && plans.length > 0) {
      status = 'built';
    } else if (summaries.length > 0) {
      status = 'building';
    } else if (plans.length > 0) {
      status = 'planned';
    }

    phases.push({
      number: phaseNum,
      name: phaseName,
      status,
      plans_total: plans.length,
      plans_complete: summaries.length,
      has_verification: hasVerification,
      verification_result: verificationResult,
      dir_name: entry.name
    });
  }

  phases.sort((a, b) => a.number - b.number);
  return phases;
}

// ---- Quick task scanning ----

function scanQuickTasks(planningDir) {
  const quickDir = path.join(planningDir, 'quick');
  if (!fs.existsSync(quickDir)) return [];

  const tasks = [];
  let entries;
  try {
    entries = fs.readdirSync(quickDir, { withFileTypes: true });
  } catch (_e) {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^(\d{3})-(.+)/);
    if (!match) continue;

    const id = match[1];
    const slug = match[2];
    const taskDir = path.join(quickDir, entry.name);

    // Check for SUMMARY.md to determine completion
    const hasSummary = fs.existsSync(path.join(taskDir, 'SUMMARY.md'));
    const hasPlan = fs.existsSync(path.join(taskDir, 'PLAN.md'));

    let description = slug.replace(/-/g, ' ');
    // Try to get title from PLAN.md frontmatter
    const planContent = safeReadFile(path.join(taskDir, 'PLAN.md'));
    if (planContent) {
      const fm = safeParseFrontmatter(planContent);
      if (fm.title) description = fm.title;
      else if (fm.description) description = fm.description;
    }

    tasks.push({
      id,
      description,
      status: hasSummary ? 'complete' : hasPlan ? 'in-progress' : 'empty'
    });
  }

  return tasks;
}

// ---- Routing logic ----

function determineRouting(phases, stateFm, todosCount, notesCount, hasPausedWork, milestones) {
  const primary = { command: null, reason: null };
  const alternatives = [];

  // 1. Paused work -> resume
  if (hasPausedWork) {
    primary.command = '/pbr:resume';
    primary.reason = 'Paused work detected';
  }

  // Find phase states
  const builtNotVerified = phases.filter(p => p.status === 'built');
  const plannedNotBuilt = phases.filter(p => p.status === 'planned');
  const building = phases.filter(p => p.status === 'building');
  const verified = phases.filter(p => p.status === 'verified');
  const empty = phases.filter(p => p.status === 'empty');
  const allVerified = phases.length > 0 && verified.length === phases.length;

  if (!primary.command) {
    // 2. Verification gaps
    if (builtNotVerified.length > 0) {
      primary.command = '/pbr:review';
      primary.reason = `Phase ${builtNotVerified[0].number} built but not verified`;
    }
    // 3. Planned but not built
    else if (plannedNotBuilt.length > 0) {
      primary.command = '/pbr:build';
      primary.reason = `Phase ${plannedNotBuilt[0].number} planned, ready to build`;
    }
    // 3b. Currently building
    else if (building.length > 0) {
      primary.command = '/pbr:build';
      primary.reason = `Phase ${building[0].number} build in progress`;
    }
    // 4. All verified -> next milestone or complete
    else if (allVerified) {
      const hasActiveMilestone = milestones.some(m => m.status === 'active');
      if (hasActiveMilestone) {
        primary.command = '/pbr:plan';
        primary.reason = 'All phases verified, plan next phase';
      } else {
        primary.command = '/pbr:new-milestone';
        primary.reason = 'All milestones complete';
      }
    }
    // 5. Empty phases exist -> discuss or plan
    else if (empty.length > 0 || phases.length === 0) {
      if (phases.length === 0) {
        // Check if milestone just completed vs no project at all
        if (stateFm && stateFm.status === 'milestone-complete') {
          primary.command = '/pbr:new-milestone';
          primary.reason = 'All milestones complete, start next milestone';
        } else if (stateFm && stateFm.current_phase != null) {
          primary.command = '/pbr:plan';
          primary.reason = 'No phases found, start planning';
        } else {
          primary.command = '/pbr:new-project';
          primary.reason = 'No project initialized';
        }
      } else {
        primary.command = '/pbr:plan';
        primary.reason = `Phase ${empty[0].number} needs planning`;
      }
    }
    // Fallback
    else {
      primary.command = '/pbr:status';
      primary.reason = 'Review current state';
    }
  }

  // Alternatives
  if (todosCount > 0) {
    alternatives.push({
      command: '/pbr:todo list',
      reason: `${todosCount} pending todo${todosCount > 1 ? 's' : ''}`
    });
  }
  if (notesCount > 0) {
    alternatives.push({
      command: '/pbr:note list',
      reason: `${notesCount} active note${notesCount > 1 ? 's' : ''} to review`
    });
  }
  alternatives.push({
    command: '/pbr:quick',
    reason: 'Run an ad-hoc task'
  });

  return { primary, alternatives };
}

// ---- Main render function ----

/**
 * Render full project status as a deterministic JSON object.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {object} Complete status object
 */
function statusRender(planningDir) {
  if (!fs.existsSync(planningDir)) {
    return {
      error: null,
      project_name: null,
      milestone: null,
      milestones: [],
      current_phase: null,
      phases: [],
      progress: { total_plans: 0, completed_plans: 0, percentage: 0 },
      progress_bar: progressBar(0),
      todos_pending: 0,
      notes_active: 0,
      quick_tasks: [],
      paused_work: null,
      state_line_count: 0,
      state_warning: null,
      routing: {
        primary: { command: '/pbr:new-project', reason: 'No .planning/ directory found' },
        alternatives: []
      },
      documents: {
        'PROJECT.md': false,
        'REQUIREMENTS.md': false,
        'ROADMAP.md': false,
        'STATE.md': false,
        'config.json': false
      }
    };
  }

  // ---- Load documents ----
  const configContent = safeReadFile(path.join(planningDir, 'config.json'));
  const stateContent = safeReadFile(path.join(planningDir, 'STATE.md'));
  const roadmapContent = safeReadFile(path.join(planningDir, 'ROADMAP.md'));
  const projectContent = safeReadFile(path.join(planningDir, 'PROJECT.md'));

  let config = null;
  if (configContent) {
    try { config = JSON.parse(configContent); } catch (_e) { config = null; }
  }

  const stateFm = safeParseFrontmatter(stateContent);
  const roadmapFm = safeParseFrontmatter(roadmapContent);

  // ---- Project name ----
  const projectName = (config && config.project_name)
    || (roadmapFm && roadmapFm.project)
    || (stateFm && stateFm.project)
    || null;

  // ---- Milestones from ROADMAP.md ----
  const { milestones, current: currentMilestone } = parseMilestones(roadmapContent);

  // ---- Phases from disk ----
  const phases = scanPhases(planningDir);

  // ---- Current phase from STATE.md ----
  let currentPhase = null;
  if (stateFm && stateFm.current_phase != null) {
    const cpNum = typeof stateFm.current_phase === 'number'
      ? stateFm.current_phase
      : parseInt(stateFm.current_phase, 10);
    const matchedPhase = phases.find(p => p.number === cpNum);
    if (matchedPhase) {
      currentPhase = {
        number: matchedPhase.number,
        name: matchedPhase.name,
        status: matchedPhase.status,
        plans_total: matchedPhase.plans_total,
        plans_complete: matchedPhase.plans_complete
      };
    } else if (!isNaN(cpNum)) {
      currentPhase = {
        number: cpNum,
        name: stateFm.phase_slug || stateFm.phase_name || null,
        status: stateFm.status || 'unknown',
        plans_total: stateFm.plans_total || 0,
        plans_complete: stateFm.plans_complete || 0
      };
    }
  }

  // ---- Progress ----
  let totalPlans = 0;
  let completedPlans = 0;
  for (const p of phases) {
    totalPlans += p.plans_total;
    completedPlans += p.plans_complete;
  }
  const percentage = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;

  // ---- Todos ----
  const todosPending = countFilesIn(
    path.join(planningDir, 'todos', 'pending'),
    f => f.endsWith('.md')
  );

  // ---- Notes ----
  const notesActive = countFilesIn(
    path.join(planningDir, 'notes'),
    f => f.endsWith('.md')
  );

  // ---- Quick tasks ----
  const quickTasks = scanQuickTasks(planningDir);

  // ---- Paused work ----
  const continueHerePath = path.join(planningDir, '..', '.continue-here.md');
  const pausedWork = fs.existsSync(continueHerePath)
    ? safeReadFile(continueHerePath)
    : null;

  // ---- State line count + warning ----
  const stateLineCount = stateContent ? stateContent.replace(/\r\n/g, '\n').split('\n').length : 0;
  const stateWarning = stateLineCount > 150
    ? `STATE.md is ${stateLineCount} lines (threshold: 150). Consider trimming history.`
    : null;

  // ---- Documents inventory ----
  const documents = {
    'PROJECT.md': projectContent !== null,
    'REQUIREMENTS.md': fs.existsSync(path.join(planningDir, 'REQUIREMENTS.md')),
    'ROADMAP.md': roadmapContent !== null,
    'STATE.md': stateContent !== null,
    'config.json': configContent !== null
  };

  // ---- Routing ----
  const routing = determineRouting(
    phases, stateFm, todosPending, notesActive, pausedWork !== null, milestones
  );

  // ---- Tech Debt ----
  let techDebt = { enabled: false };
  if (config && config.features && config.features.tech_debt_surfacing !== false) {
    try {
      const scannerPath = path.resolve(__dirname, '..', '..', '..', 'plugins', 'pbr', 'scripts', 'lib', 'tech-debt-scanner');
      const { scanTechDebt } = require(scannerPath);
      // planningDir is .planning/, project root is one level up
      const projectRoot = path.dirname(planningDir);
      const result = scanTechDebt(projectRoot, { limit: 3 });
      techDebt = { enabled: true, hotspots: result.hotspots, largeFiles: result.largeFiles, total: result.total };
    } catch (_e) {
      techDebt = { enabled: true, error: 'Scanner module not available' };
    }
  }

  // ---- Milestone output ----
  const milestoneOut = currentMilestone
    ? { name: currentMilestone.name, status: currentMilestone.status, version: currentMilestone.version }
    : null;

  // ---- Clean phases for output (remove internal fields) ----
  const phasesOut = phases.map(p => ({
    number: p.number,
    name: p.name,
    status: p.status,
    plans_total: p.plans_total,
    plans_complete: p.plans_complete
  }));

  return {
    project_name: projectName,
    milestone: milestoneOut,
    milestones: milestones.map(m => ({
      name: m.name,
      version: m.version,
      status: m.status,
      phase_count: m.phase_count,
      completed: m.completed
    })),
    current_phase: currentPhase,
    phases: phasesOut,
    progress: { total_plans: totalPlans, completed_plans: completedPlans, percentage },
    progress_bar: progressBar(percentage),
    todos_pending: todosPending,
    notes_active: notesActive,
    quick_tasks: quickTasks,
    paused_work: pausedWork,
    state_line_count: stateLineCount,
    state_warning: stateWarning,
    routing,
    documents,
    techDebt
  };
}

module.exports = { statusRender, progressBar };
