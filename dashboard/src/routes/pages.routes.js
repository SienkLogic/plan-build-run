import { Router } from 'express';
import { getPhaseDetail, getPhaseDocument } from '../services/phase.service.js';
import { getRoadmapData, generateDependencyMermaid } from '../services/roadmap.service.js';
import { parseStateFile, derivePhaseStatuses } from '../services/dashboard.service.js';
import { listPendingTodos, getTodoDetail, createTodo, completeTodo, listDoneTodos } from '../services/todo.service.js';
import { getAllMilestones, getMilestoneDetail } from '../services/milestone.service.js';
import { getProjectAnalytics } from '../services/analytics.service.js';
import { getLlmMetrics } from '../services/local-llm-metrics.service.js';
import { listNotes, getNoteBySlug } from '../services/notes.service.js';
import { listQuickTasks, getQuickTask } from '../services/quick.service.js';
import { listAuditReports, getAuditReport } from '../services/audit.service.js';
import { readConfig, writeConfig } from '../services/config.service.js';

/**
 * Merge flat HTML form fields back into a nested config object.
 * Form field names use dot-notation: "features.autoVerify", "models.default".
 * Boolean checkboxes arrive as "on"/"off" or are absent when unchecked.
 * @param {object} existing - current config object from disk
 * @param {object} form - req.body from express.urlencoded
 * @returns {object}
 */
function mergeFormIntoConfig(existing, form) {
  const result = JSON.parse(JSON.stringify(existing)); // deep clone
  for (const [key, value] of Object.entries(form)) {
    const parts = key.split('.');
    let target = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (target[parts[i]] == null || typeof target[parts[i]] !== 'object') {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    // Coerce booleans: checkboxes send "on", absent means false
    if (typeof existing?.[parts[0]]?.[leaf] === 'boolean' || (parts.length === 2 && typeof (existing?.[parts[0]] ?? {})[leaf] === 'boolean')) {
      target[leaf] = value === 'on' || value === 'true';
    } else if (typeof target[leaf] === 'number') {
      target[leaf] = Number(value);
    } else {
      target[leaf] = value;
    }
  }
  // Uncheck all feature booleans not present in form (unchecked checkboxes are absent)
  if (result.features && typeof result.features === 'object') {
    for (const k of Object.keys(result.features)) {
      if (typeof result.features[k] === 'boolean' && !(`features.${k}` in form)) {
        result.features[k] = false;
      }
    }
  }
  if (result.gates && typeof result.gates === 'object') {
    for (const k of Object.keys(result.gates)) {
      if (typeof result.gates[k] === 'boolean' && !(`gates.${k}` in form)) {
        result.gates[k] = false;
      }
    }
  }
  if (result.safety && typeof result.safety === 'object') {
    for (const k of Object.keys(result.safety)) {
      if (typeof result.safety[k] === 'boolean' && !(`safety.${k}` in form)) {
        result.safety[k] = false;
      }
    }
  }
  return result;
}

const router = Router();

router.get('/phases', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const [roadmapData, stateData] = await Promise.all([
    getRoadmapData(projectDir),
    parseStateFile(projectDir)
  ]);

  const templateData = {
    title: 'Phases',
    activePage: 'phases',
    currentPath: '/phases',
    phases: derivePhaseStatuses(roadmapData.phases, stateData.currentPhase),
    milestones: roadmapData.milestones,
    breadcrumbs: [{ label: 'Phases' }]
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/phases-content', templateData);
  } else {
    res.render('phases', templateData);
  }
});

router.get('/phases/:phaseId', async (req, res) => {
  const { phaseId } = req.params;

  // Validate phaseId: two digits, optionally followed by decimal (e.g., 01, 05, 3.1)
  if (!/^\d{1,2}(\.\d+)?$/.test(phaseId)) {
    const err = new Error('Phase ID must be a number (e.g., 01, 05, 3.1)');
    err.status = 404;
    throw err;
  }

  const projectDir = req.app.locals.projectDir;
  const [phaseData, roadmapData] = await Promise.all([
    getPhaseDetail(projectDir, phaseId),
    getRoadmapData(projectDir)
  ]);

  const phaseIdNum = parseInt(phaseId, 10);
  const allPhases = roadmapData.phases || [];
  const currentIdx = allPhases.findIndex(p => String(p.id) === String(phaseIdNum));
  const prevPhase = currentIdx > 0 ? allPhases[currentIdx - 1] : null;
  const nextPhase = currentIdx >= 0 && currentIdx < allPhases.length - 1
    ? allPhases[currentIdx + 1]
    : null;

  const templateData = {
    title: `Phase ${phaseId}: ${phaseData.phaseName}`,
    activePage: 'phases',
    currentPath: '/phases/' + phaseId,
    breadcrumbs: [{ label: 'Phases', url: '/phases' }, { label: 'Phase ' + phaseId }],
    prevPhase,
    nextPhase,
    ...phaseData
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/phase-content', templateData);
  } else {
    res.render('phase-detail', templateData);
  }
});

router.get('/phases/:phaseId/:planId/:docType', async (req, res) => {
  const { phaseId, planId, docType } = req.params;

  // Validate phaseId
  if (!/^\d{1,2}(\.\d+)?$/.test(phaseId)) {
    const err = new Error('Phase ID must be a number (e.g., 01, 05, 3.1)');
    err.status = 404;
    throw err;
  }

  // Validate planId: NN-NN format
  if (!/^\d{2}-\d{2}$/.test(planId)) {
    const err = new Error('Plan ID must be in NN-NN format (e.g., 04-01)');
    err.status = 404;
    throw err;
  }

  // Validate docType
  if (docType !== 'plan' && docType !== 'summary' && docType !== 'verification') {
    const err = new Error('Document type must be "plan", "summary", or "verification"');
    err.status = 404;
    throw err;
  }

  const projectDir = req.app.locals.projectDir;
  const doc = await getPhaseDocument(projectDir, phaseId, planId, docType);

  if (!doc) {
    const labels = { plan: 'Plan', summary: 'Summary', verification: 'Verification' };
    const err = new Error(`${labels[docType] || docType} ${planId} not found for phase ${phaseId}`);
    err.status = 404;
    throw err;
  }

  const docLabel = docType === 'plan' ? 'Plan' : docType === 'verification' ? 'Verification' : 'Summary';
  const templateData = {
    title: `${docLabel} ${planId} — Phase ${phaseId}: ${doc.phaseName}`,
    activePage: 'phases',
    currentPath: `/phases/${phaseId}/${planId}/${docType}`,
    breadcrumbs: [{ label: 'Phases', url: '/phases' }, { label: 'Phase ' + phaseId, url: '/phases/' + phaseId }, { label: docLabel + ' ' + planId }],
    ...doc
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/phase-doc-content', templateData);
  } else {
    res.render('phase-doc', templateData);
  }
});

router.get('/todos', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const { priority, status, q } = req.query;
  const filters = {};
  if (priority) filters.priority = priority;
  if (status) filters.status = status;
  if (q) filters.q = q;
  const todos = await listPendingTodos(projectDir, filters);

  const templateData = {
    title: 'Todos',
    activePage: 'todos',
    currentPath: '/todos',
    breadcrumbs: [{ label: 'Todos' }],
    todos,
    filters: { priority: priority || '', status: status || '', q: q || '' }
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/todos-content', templateData);
  } else {
    res.render('todos', templateData);
  }
});

router.post('/todos/bulk-complete', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const { priority, status, q } = req.query;
  const filters = {};
  if (priority) filters.priority = priority;
  if (status) filters.status = status;
  if (q) filters.q = q;

  const todos = await listPendingTodos(projectDir, filters);
  for (const todo of todos) {
    await completeTodo(projectDir, todo.id);
  }

  if (req.get('HX-Request') === 'true') {
    const remaining = await listPendingTodos(projectDir);
    res.render('partials/todos-content', {
      title: 'Todos',
      activePage: 'todos',
      currentPath: '/todos',
      breadcrumbs: [{ label: 'Todos' }],
      todos: remaining,
      filters: { priority: '', status: '', q: '' }
    });
  } else {
    res.redirect('/todos');
  }
});

router.get('/todos/new', (req, res) => {
  const templateData = {
    title: 'Create Todo',
    activePage: 'todos',
    currentPath: '/todos/new',
    breadcrumbs: [{ label: 'Todos', url: '/todos' }, { label: 'Create' }]
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/todo-create-content', templateData);
  } else {
    res.render('todo-create', templateData);
  }
});

router.get('/todos/done', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const todos = await listDoneTodos(projectDir);

  const templateData = {
    title: 'Completed Todos',
    activePage: 'todos',
    currentPath: '/todos/done',
    breadcrumbs: [{ label: 'Todos', url: '/todos' }, { label: 'Completed' }],
    todos
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/todos-done-content', templateData);
  } else {
    res.render('todos-done', templateData);
  }
});

router.get('/todos/:id', async (req, res) => {
  const { id } = req.params;

  // Validate ID format: must be exactly three digits
  if (!/^\d{3}$/.test(id)) {
    const err = new Error('Todo ID must be a three-digit number (e.g., 001, 005, 042)');
    err.status = 404;
    throw err;
  }

  const projectDir = req.app.locals.projectDir;
  const todo = await getTodoDetail(projectDir, id);

  const templateData = {
    title: `Todo ${todo.id}: ${todo.title}`,
    activePage: 'todos',
    currentPath: '/todos/' + id,
    breadcrumbs: [{ label: 'Todos', url: '/todos' }, { label: 'Todo ' + id }],
    ...todo
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/todo-detail-content', templateData);
  } else {
    res.render('todo-detail', templateData);
  }
});

router.post('/todos', async (req, res) => {
  const { title, priority, phase, description } = req.body;
  const projectDir = req.app.locals.projectDir;

  const todoId = await createTodo(projectDir, {
    title,
    priority,
    phase: phase || '',
    description
  });

  if (req.get('HX-Request') === 'true') {
    // For HTMX: fetch the new todo and render its detail as a fragment
    const todo = await getTodoDetail(projectDir, todoId);
    res.render('partials/todo-detail-content', {
      title: `Todo ${todo.id}: ${todo.title}`,
      activePage: 'todos',
      currentPath: '/todos/' + todoId,
      breadcrumbs: [{ label: 'Todos', url: '/todos' }, { label: 'Todo ' + todoId }],
      ...todo
    });
  } else {
    res.redirect(`/todos/${todoId}`);
  }
});

router.post('/todos/:id/done', async (req, res) => {
  const { id } = req.params;

  if (!/^\d{3}$/.test(id)) {
    const err = new Error('Todo ID must be a three-digit number');
    err.status = 404;
    throw err;
  }

  const projectDir = req.app.locals.projectDir;
  await completeTodo(projectDir, id);

  if (req.get('HX-Request') === 'true') {
    // For HTMX: re-render the full todo list as a fragment
    const todos = await listPendingTodos(projectDir);
    res.render('partials/todos-content', {
      title: 'Todos',
      activePage: 'todos',
      currentPath: '/todos',
      breadcrumbs: [{ label: 'Todos' }],
      todos
    });
  } else {
    res.redirect('/todos');
  }
});

router.get('/milestones', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const [milestoneData, roadmapData, stateData] = await Promise.all([
    getAllMilestones(projectDir),
    getRoadmapData(projectDir),
    parseStateFile(projectDir)
  ]);

  const phases = derivePhaseStatuses(roadmapData.phases, stateData.currentPhase);

  const templateData = {
    title: 'Milestones',
    activePage: 'milestones',
    currentPath: '/milestones',
    breadcrumbs: [{ label: 'Milestones' }],
    phases,
    ...milestoneData
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/milestones-content', templateData);
  } else {
    res.render('milestones', templateData);
  }
});

router.get('/milestones/:version', async (req, res) => {
  const { version } = req.params;

  // Validate version: alphanumeric with dots and dashes
  if (!/^[\w.-]+$/.test(version)) {
    const err = new Error('Invalid milestone version format');
    err.status = 404;
    throw err;
  }

  const projectDir = req.app.locals.projectDir;
  const detail = await getMilestoneDetail(projectDir, version);

  if (detail.sections.length === 0) {
    const err = new Error(`No archived files found for milestone v${version}`);
    err.status = 404;
    throw err;
  }

  const templateData = {
    title: `Milestone v${version}`,
    activePage: 'milestones',
    currentPath: '/milestones/' + version,
    breadcrumbs: [{ label: 'Milestones', url: '/milestones' }, { label: 'v' + version }],
    ...detail
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/milestone-detail-content', templateData);
  } else {
    res.render('milestone-detail', templateData);
  }
});

router.get('/dependencies', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const mermaidCode = await generateDependencyMermaid(projectDir);

  const templateData = {
    title: 'Dependencies',
    activePage: 'dependencies',
    currentPath: '/dependencies',
    breadcrumbs: [{ label: 'Dependencies' }],
    mermaidCode
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/dependencies-content', templateData);
  } else {
    res.render('dependencies', templateData);
  }
});

router.get('/analytics', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const [analytics, llmMetrics] = await Promise.all([
    getProjectAnalytics(projectDir),
    getLlmMetrics(projectDir)
  ]);

  const templateData = {
    title: 'Analytics',
    activePage: 'analytics',
    currentPath: '/analytics',
    breadcrumbs: [{ label: 'Analytics' }],
    analytics,
    llmMetrics
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/analytics-content', templateData);
  } else {
    res.render('analytics', templateData);
  }
});

router.get('/notes', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const notes = await listNotes(projectDir);

  const templateData = {
    title: 'Notes',
    activePage: 'notes',
    currentPath: '/notes',
    breadcrumbs: [{ label: 'Notes' }],
    notes
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/notes-content', templateData);
  } else {
    res.render('notes', templateData);
  }
});

router.get('/notes/:slug', async (req, res) => {
  const { slug } = req.params;

  // Validate slug: lowercase alphanumeric and dashes only
  if (!/^[a-z0-9-]+$/.test(slug)) {
    const err = new Error('Invalid note slug format');
    err.status = 404;
    throw err;
  }

  const projectDir = req.app.locals.projectDir;
  const note = await getNoteBySlug(projectDir, slug);

  if (!note) {
    const err = new Error(`Note "${slug}" not found`);
    err.status = 404;
    throw err;
  }

  const templateData = {
    title: note.title,
    activePage: 'notes',
    currentPath: '/notes/' + slug,
    breadcrumbs: [{ label: 'Notes', url: '/notes' }, { label: note.title }],
    ...note
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/note-detail-content', templateData);
  } else {
    res.render('note-detail', templateData);
  }
});

router.get('/roadmap', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const [roadmapData, stateData] = await Promise.all([
    getRoadmapData(projectDir),
    parseStateFile(projectDir)
  ]);

  const templateData = {
    title: 'Roadmap',
    activePage: 'roadmap',
    currentPath: '/roadmap',
    phases: derivePhaseStatuses(roadmapData.phases, stateData.currentPhase),
    milestones: roadmapData.milestones,
    breadcrumbs: [{ label: 'Roadmap' }]
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/roadmap-content', templateData);
  } else {
    res.render('roadmap', templateData);
  }
});

router.get('/quick', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const tasks = await listQuickTasks(projectDir);

  const templateData = {
    title: 'Quick Tasks',
    activePage: 'quick',
    currentPath: '/quick',
    breadcrumbs: [{ label: 'Quick Tasks' }],
    tasks
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/quick-content', templateData);
  } else {
    res.render('quick', templateData);
  }
});

router.get('/quick/:id', async (req, res) => {
  const { id } = req.params;

  // Validate ID format: must be exactly three digits
  if (!/^\d{3}$/.test(id)) {
    const err = new Error('Quick Task ID must be a three-digit number (e.g., 001, 005, 042)');
    err.status = 404;
    throw err;
  }

  const projectDir = req.app.locals.projectDir;
  const task = await getQuickTask(projectDir, id);

  if (!task) {
    const err = new Error(`Quick task ${id} not found`);
    err.status = 404;
    throw err;
  }

  const templateData = {
    title: `Quick Task ${task.id}: ${task.title}`,
    activePage: 'quick',
    currentPath: '/quick/' + id,
    breadcrumbs: [{ label: 'Quick Tasks', url: '/quick' }, { label: 'Task ' + id }],
    ...task
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/quick-detail-content', templateData);
  } else {
    res.render('quick-detail', templateData);
  }
});

router.get('/audits', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const reports = await listAuditReports(projectDir);

  const templateData = {
    title: 'Audit Reports',
    activePage: 'audits',
    currentPath: '/audits',
    breadcrumbs: [{ label: 'Audit Reports' }],
    reports
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/audits-content', templateData);
  } else {
    res.render('audits', templateData);
  }
});

router.get('/audits/:filename', async (req, res) => {
  const { filename } = req.params;

  // Validate filename: safe characters only, must end in .md
  if (!/^[\w.-]+\.md$/.test(filename)) {
    const err = new Error('Invalid audit report filename');
    err.status = 404;
    throw err;
  }

  const projectDir = req.app.locals.projectDir;
  const report = await getAuditReport(projectDir, filename);

  if (!report) {
    const err = new Error(`Audit report "${filename}" not found`);
    err.status = 404;
    throw err;
  }

  const templateData = {
    title: report.title,
    activePage: 'audits',
    currentPath: '/audits/' + filename,
    breadcrumbs: [{ label: 'Audit Reports', url: '/audits' }, { label: report.title }],
    ...report
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/audit-detail-content', templateData);
  } else {
    res.render('audit-detail', templateData);
  }
});

router.get('/config', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const config = await readConfig(projectDir);

  const templateData = {
    title: 'Config',
    activePage: 'config',
    currentPath: '/config',
    breadcrumbs: [{ label: 'Config' }],
    config: config ?? {}
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/config-content', templateData);
  } else {
    res.render('config', templateData);
  }
});

router.post('/api/config', async (req, res) => {
  const projectDir = req.app.locals.projectDir;

  // Accept either JSON body (raw editor) or form-encoded (hybrid form)
  let incoming = req.body;

  // If the request carries a `rawJson` field, parse it as the full config
  if (typeof incoming.rawJson === 'string') {
    try {
      incoming = JSON.parse(incoming.rawJson);
    } catch {
      return res.status(400).send('<span class="config-feedback config-feedback--error">Invalid JSON</span>');
    }
  } else {
    // Merge form fields into existing config to avoid clobbering unrendered keys
    const existing = await readConfig(projectDir) ?? {};
    incoming = mergeFormIntoConfig(existing, incoming);
  }

  try {
    await writeConfig(projectDir, incoming);
    res.send('<span class="config-feedback config-feedback--success">Saved</span>');
  } catch (err) {
    res.status(400).send(`<span class="config-feedback config-feedback--error">${err.message}</span>`);
  }
});

export default router;
