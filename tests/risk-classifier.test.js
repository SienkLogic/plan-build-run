/**
 * Risk classifier tests — classifyRisk with ceremony mapping
 */
const { classifyRisk, CEREMONY_MAP, RISK_LEVELS } = require('../plugins/pbr/scripts/risk-classifier.cjs');

describe('risk-classifier', () => {
  describe('low risk', () => {
    it('"fix typo in README" is low risk', () => {
      expect(classifyRisk('fix typo in README').risk).toBe('low');
    });

    it('"update config value" is low risk', () => {
      expect(classifyRisk('update config value').risk).toBe('low');
    });

    it('"rename variable in utils.js" is low risk', () => {
      expect(classifyRisk('rename variable in utils.js').risk).toBe('low');
    });
  });

  describe('medium risk', () => {
    it('"add login button to the dashboard" is medium risk', () => {
      expect(classifyRisk('add login button to the dashboard').risk).toBe('medium');
    });

    it('"write tests for auth module" is medium risk', () => {
      expect(classifyRisk('write tests for auth module').risk).toBe('medium');
    });

    it('"implement a new API endpoint" is medium risk', () => {
      expect(classifyRisk('implement a new API endpoint').risk).toBe('medium');
    });
  });

  describe('high risk', () => {
    it('"refactor the entire authentication system across 10 files" is high risk', () => {
      expect(classifyRisk('refactor the entire authentication system across 10 files').risk).toBe('high');
    });

    it('"migrate database from MySQL to PostgreSQL" is high risk', () => {
      expect(classifyRisk('migrate database from MySQL to PostgreSQL').risk).toBe('high');
    });

    it('"redesign the plugin hook architecture" is high risk', () => {
      expect(classifyRisk('redesign the plugin hook architecture').risk).toBe('high');
    });
  });

  describe('context influence', () => {
    it('fileCount >= 8 pushes risk to at least medium', () => {
      const result = classifyRisk('update a value', { fileCount: 8 });
      expect(['medium', 'high']).toContain(result.risk);
    });

    it('subsystems >= 3 pushes risk to high', () => {
      const result = classifyRisk('update a value', { subsystems: 3 });
      expect(result.risk).toBe('high');
    });
  });

  describe('ceremony mapping', () => {
    it('CEREMONY_MAP.low === "inline"', () => {
      expect(CEREMONY_MAP.low).toBe('inline');
    });

    it('CEREMONY_MAP.medium === "lightweight-plan"', () => {
      expect(CEREMONY_MAP.medium).toBe('lightweight-plan');
    });

    it('CEREMONY_MAP.high === "full-plan-build-verify"', () => {
      expect(CEREMONY_MAP.high).toBe('full-plan-build-verify');
    });
  });

  describe('return shape', () => {
    it('result has risk (string), ceremony (string), signals (array)', () => {
      const result = classifyRisk('fix typo in README');
      expect(typeof result.risk).toBe('string');
      expect(typeof result.ceremony).toBe('string');
      expect(Array.isArray(result.signals)).toBe(true);
    });
  });

  describe('RISK_LEVELS constant', () => {
    it('has LOW, MEDIUM, HIGH', () => {
      expect(RISK_LEVELS.LOW).toBe('low');
      expect(RISK_LEVELS.MEDIUM).toBe('medium');
      expect(RISK_LEVELS.HIGH).toBe('high');
    });
  });
});
