import express from 'express';
import helmet from 'helmet';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import indexRouter from './routes/index.routes.js';
import pagesRouter from './routes/pages.routes.js';
import eventsRouter from './routes/events.routes.js';
import notFoundHandler from './middleware/notFoundHandler.js';
import errorHandler from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createApp(config) {
  const app = express();

  // Security headers via Helmet
  // CSP allows CDN scripts (HTMX, Pico.css, htmx-ext-sse) and inline styles
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net"]
      }
    }
  }));
  app.disable('x-powered-by');

  // Store config for access in routes/services
  app.locals.projectDir = config.projectDir;

  // View engine setup -- all paths use path.join (cross-platform)
  app.set('views', join(__dirname, 'views'));
  app.set('view engine', 'ejs');

  // Built-in middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Handle common browser auto-requests cleanly (no stack traces in logs)
  app.get('/favicon.ico', (req, res) => res.status(204).end());
  app.get('/sw.js', (req, res) => res.status(404).end());

  // Static files
  app.use(express.static(join(__dirname, '..', 'public')));

  // Auto-set HX-Title on HTMX partial responses so document.title stays current
  app.use((req, res, next) => {
    if (req.get('HX-Request') === 'true') {
      const originalRender = res.render.bind(res);
      res.render = function(view, options, callback) {
        if (options && options.title && !res.getHeader('HX-Title')) {
          res.setHeader('HX-Title', `${options.title} - Plan-Build-Run`);
        }
        return originalRender(view, options, callback);
      };
    }
    next();
  });

  // Routes
  app.use('/', indexRouter);
  app.use('/', pagesRouter);
  app.use('/api/events', eventsRouter);

  // 404 catch-all (after routes, before error handler)
  app.use(notFoundHandler);

  // Error handler MUST be registered last
  app.use(errorHandler);

  return app;
}
