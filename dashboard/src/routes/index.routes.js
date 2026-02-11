import { Router } from 'express';
import { getHomepage } from '../services/project.service.js';
import { getDashboardData } from '../services/dashboard.service.js';

const router = Router();

router.get('/', async (req, res) => {
  const projectDir = req.app.locals.projectDir;

  const [homepageData, dashboardData] = await Promise.all([
    getHomepage(projectDir),
    getDashboardData(projectDir)
  ]);

  const templateData = {
    ...homepageData,
    ...dashboardData,
    activePage: 'dashboard',
    currentPath: '/'
  };

  res.setHeader('Vary', 'HX-Request');

  if (req.get('HX-Request') === 'true') {
    res.render('partials/dashboard-content', templateData);
  } else {
    res.render('index', templateData);
  }
});

export default router;
