import { Router } from 'express';
import { getHomepage } from '../services/project.service.js';
import { getDashboardData } from '../services/dashboard.service.js';
import { listPendingTodos } from '../services/todo.service.js';

const router = Router();

router.get('/', async (req, res) => {
  const projectDir = req.app.locals.projectDir;

  const [homepageData, dashboardData, pendingTodos] = await Promise.all([
    getHomepage(projectDir),
    getDashboardData(projectDir),
    listPendingTodos(projectDir).catch(() => [])
  ]);

  const templateData = {
    ...homepageData,
    ...dashboardData,
    pendingTodoCount: pendingTodos.length,
    activePage: 'dashboard',
    currentPath: '/',
    breadcrumbs: []
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/dashboard-content', templateData);
  } else {
    res.render('index', templateData);
  }
});

export default router;
