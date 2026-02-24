import type { MiddlewareHandler } from 'hono';
import { parseStateFile } from '../services/dashboard.service.js';

export const currentPhaseMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    const projectDir = c.get('projectDir') as string;
    const state = await parseStateFile(projectDir);
    const cp = state.currentPhase;
    if (cp && cp.id > 0) {
      c.set('currentPhase', {
        number: cp.id,
        name: cp.name,
        status: cp.status,
        nextAction: state.nextAction || null,
      });
    } else {
      c.set('currentPhase', null);
    }
  } catch {
    c.set('currentPhase', null);
  }
  await next();
};
