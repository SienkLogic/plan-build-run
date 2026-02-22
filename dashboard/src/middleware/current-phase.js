import { parseStateFile } from '../services/dashboard.service.js';

/**
 * Middleware that reads STATE.md and sets res.locals.currentPhase
 * for use in sidebar and other templates.
 */
export default async function currentPhaseMiddleware(req, res, next) {
  try {
    const state = await parseStateFile(req.app.locals.projectDir);
    const cp = state.currentPhase;
    if (cp && cp.id > 0) {
      res.locals.currentPhase = {
        number: cp.id,
        name: cp.name,
        status: cp.status
      };
    } else {
      res.locals.currentPhase = null;
    }
  } catch (_err) {
    res.locals.currentPhase = null;
  }
  next();
}
