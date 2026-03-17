/**
 * Intent router tests — classifyIntent with confidence scoring
 */
const { classifyIntent, ROUTE_MAP } = require('../plugins/pbr/scripts/intent-router.cjs');

describe('intent-router', () => {
  describe('ROUTE_MAP', () => {
    it('exports ROUTE_MAP object', () => {
      expect(ROUTE_MAP).toBeDefined();
      expect(typeof ROUTE_MAP).toBe('object');
    });
  });

  describe('high-confidence routing (>= 0.7)', () => {
    it('"fix the auth bug" routes to debug', () => {
      const result = classifyIntent('fix the auth bug');
      expect(result.route).toBe('debug');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('"add a login button" routes to quick', () => {
      const result = classifyIntent('add a login button');
      expect(result.route).toBe('quick');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('"explore how the hook system works" routes to explore', () => {
      const result = classifyIntent('explore how the hook system works');
      expect(result.route).toBe('explore');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('"plan a new authentication system" routes to plan-phase', () => {
      const result = classifyIntent('plan a new authentication system');
      expect(result.route).toBe('plan-phase');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('"remember to update the docs" routes to note', () => {
      const result = classifyIntent('remember to update the docs');
      expect(result.route).toBe('note');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('ambiguous routing (< 0.7)', () => {
    it('"refactor auth" returns candidates array with length >= 2', () => {
      const result = classifyIntent('refactor auth');
      expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('context-aware routing', () => {
    it('"fix it" with recentError routes to debug', () => {
      const result = classifyIntent('fix it', { recentError: 'TypeError in auth.js' });
      expect(result.route).toBe('debug');
    });

    it('text with no context still produces a valid route', () => {
      const result = classifyIntent('do something');
      expect(result.route).toBeDefined();
      expect(typeof result.route).toBe('string');
    });
  });

  describe('return shape', () => {
    it('result has route (string), confidence (number 0-1), candidates (array)', () => {
      const result = classifyIntent('fix the auth bug');
      expect(typeof result.route).toBe('string');
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(result.candidates)).toBe(true);
    });

    it('each candidate has route and confidence', () => {
      const result = classifyIntent('refactor auth');
      for (const candidate of result.candidates) {
        expect(typeof candidate.route).toBe('string');
        expect(typeof candidate.confidence).toBe('number');
      }
    });
  });
});
