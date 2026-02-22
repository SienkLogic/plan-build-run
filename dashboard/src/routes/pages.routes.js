import { Router } from 'express';
import { getPhaseDetail, getPhaseDocument } from '../services/phase.service.js';
import { getRoadmapData, generateDependencyMermaid } from '../services/roadmap.service.js';
import { parseStateFile, derivePhaseStatuses } from '../services/dashboard.service.js';
import { listPendingTodos, getTodoDetail, createTodo, completeTodo } from '../services/todo.service.js';
import { getAllMilestones, getMilestoneDetail } from '../services/milestone.service.js';
import { getProjectAnalytics } from '../services/analytics.service.js';

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
  const phaseData = await getPhaseDetail(projectDir, phaseId);

  const templateData = {
    title: `Phase ${phaseId}: ${phaseData.phaseName}`,
    activePage: 'phases',
    currentPath: '/phases/' + phaseId,
    breadcrumbs: [{ label: 'Phases', url: '/phases' }, { label: 'Phase ' + phaseId }],
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
  if (docType !== 'plan' && docType !== 'summary') {
    const err = new Error('Document type must be "plan" or "summary"');
    err.status = 404;
    throw err;
  }

  const projectDir = req.app.locals.projectDir;
  const doc = await getPhaseDocument(projectDir, phaseId, planId, docType);

  if (!doc) {
    const err = new Error(`${docType === 'plan' ? 'Plan' : 'Summary'} ${planId} not found for phase ${phaseId}`);
    err.status = 404;
    throw err;
  }

  const docLabel = docType === 'plan' ? 'Plan' : 'Summary';
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
  const milestoneData = await getAllMilestones(projectDir);

  const templateData = {
    title: 'Milestones',
    activePage: 'milestones',
    currentPath: '/milestones',
    breadcrumbs: [{ label: 'Milestones' }],
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
  const analytics = await getProjectAnalytics(projectDir);

  const templateData = {
    title: 'Analytics',
    activePage: 'analytics',
    currentPath: '/analytics',
    breadcrumbs: [{ label: 'Analytics' }],
    analytics
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/analytics-content', templateData);
  } else {
    res.render('analytics', templateData);
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

export default router;
