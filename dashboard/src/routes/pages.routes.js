import { Router } from 'express';
import { getPhaseDetail } from '../services/phase.service.js';
import { getRoadmapData } from '../services/roadmap.service.js';
import { listPendingTodos, getTodoDetail, createTodo, completeTodo } from '../services/todo.service.js';

const router = Router();

router.get('/phases', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const roadmapData = await getRoadmapData(projectDir);

  const templateData = {
    title: 'Phases',
    activePage: 'phases',
    currentPath: '/phases',
    phases: roadmapData.phases,
    milestones: roadmapData.milestones
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

  // Validate phaseId is exactly two digits
  if (!/^\d{2}$/.test(phaseId)) {
    const err = new Error('Phase ID must be a two-digit number (e.g., 01, 05, 12)');
    err.status = 404;
    throw err;
  }

  const projectDir = req.app.locals.projectDir;
  const phaseData = await getPhaseDetail(projectDir, phaseId);

  const templateData = {
    title: `Phase ${phaseId}: ${phaseData.phaseName}`,
    activePage: 'phases',
    currentPath: '/phases/' + phaseId,
    ...phaseData
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/phase-content', templateData);
  } else {
    res.render('phase-detail', templateData);
  }
});

router.get('/todos', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const todos = await listPendingTodos(projectDir);

  const templateData = {
    title: 'Todos',
    activePage: 'todos',
    currentPath: '/todos',
    todos
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/todos-content', templateData);
  } else {
    res.render('todos', templateData);
  }
});

router.get('/todos/new', (req, res) => {
  const templateData = {
    title: 'Create Todo',
    activePage: 'todos',
    currentPath: '/todos/new'
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
      todos
    });
  } else {
    res.redirect('/todos');
  }
});

router.get('/roadmap', async (req, res) => {
  const projectDir = req.app.locals.projectDir;
  const roadmapData = await getRoadmapData(projectDir);

  const templateData = {
    title: 'Roadmap',
    activePage: 'roadmap',
    currentPath: '/roadmap',
    phases: roadmapData.phases,
    milestones: roadmapData.milestones
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/roadmap-content', templateData);
  } else {
    res.render('roadmap', templateData);
  }
});

export default router;
