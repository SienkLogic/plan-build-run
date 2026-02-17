const fs = require('fs');
const path = require('path');
const schema = require('../plugins/dev/scripts/config-schema.json');

describe('agent-teams', () => {
  describe('config schema', () => {
    test('teams property exists in schema', () => {
      expect(schema.properties.teams).toBeDefined();
    });

    test('teams has planning_roles array', () => {
      const pr = schema.properties.teams.properties.planning_roles;
      expect(pr).toBeDefined();
      expect(pr.type).toBe('array');
    });

    test('teams has review_roles array', () => {
      const rr = schema.properties.teams.properties.review_roles;
      expect(rr).toBeDefined();
      expect(rr.type).toBe('array');
    });

    test('teams has synthesis_model string', () => {
      const sm = schema.properties.teams.properties.synthesis_model;
      expect(sm).toBeDefined();
      expect(sm.type).toBe('string');
    });

    test('teams has coordination enum', () => {
      const coord = schema.properties.teams.properties.coordination;
      expect(coord).toBeDefined();
      expect(coord.enum).toContain('file-based');
      expect(coord.enum).toContain('sequential');
    });

    test('parallelization.use_teams exists', () => {
      expect(schema.properties.parallelization.properties.use_teams).toBeDefined();
    });
  });

  describe('plan skill team documentation', () => {
    const planSkill = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'dev', 'skills', 'plan', 'SKILL.md'), 'utf8');

    test('documents --teams flag', () => {
      expect(planSkill).toContain('--teams');
    });

    test('documents all three planning roles', () => {
      expect(planSkill).toContain('ARCHITECT role');
      expect(planSkill).toContain('SECURITY REVIEWER role');
      expect(planSkill).toContain('TEST DESIGNER role');
    });

    test('includes synthesis step', () => {
      expect(planSkill).toContain('towline-synthesizer');
    });

    test('references agent-teams.md', () => {
      expect(planSkill).toContain('references/agent-teams.md');
    });
  });

  describe('review skill team documentation', () => {
    const reviewSkill = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'dev', 'skills', 'review', 'SKILL.md'), 'utf8');

    test('documents all three review roles', () => {
      expect(reviewSkill).toContain('FUNCTIONAL REVIEWER');
      expect(reviewSkill).toContain('SECURITY AUDITOR');
      expect(reviewSkill).toContain('PERFORMANCE ANALYST');
    });

    test('includes synthesis step', () => {
      expect(reviewSkill).toContain('towline-synthesizer');
    });
  });

  describe('reference doc', () => {
    const ref = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'dev', 'references', 'agent-teams.md'), 'utf8');

    test('documents planning teams', () => {
      expect(ref).toContain('Planning Teams');
    });

    test('documents review teams', () => {
      expect(ref).toContain('Review Teams');
    });

    test('documents file-based coordination', () => {
      expect(ref).toContain('File-Based Coordination');
    });

    test('documents when to use teams', () => {
      expect(ref).toContain('When to Use Teams');
    });

    test('documents team output directory structure', () => {
      expect(ref).toContain('team/');
    });
  });
});
