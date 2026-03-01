const fs = require('fs');
const path = require('path');
const schema = require('../plugins/pbr/scripts/config-schema.json');

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
      path.join(__dirname, '..', 'plugins', 'pbr', 'skills', 'plan', 'SKILL.md'), 'utf8');

    test('documents --teams flag', () => {
      expect(planSkill).toContain('--teams');
    });

    test('documents all three planning roles', () => {
      // Condensed in Phase 52: role definitions moved to references/agent-teams.md
      // Plan SKILL.md now references roles by short name in a summary line
      expect(planSkill).toMatch(/architect.*security.*test/i);
    });

    test('includes synthesis step', () => {
      expect(planSkill).toContain('synthesizer');
    });

    test('references agent-teams.md', () => {
      expect(planSkill).toContain('references/agent-teams.md');
    });
  });

  describe('review skill team documentation', () => {
    const reviewSkill = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'pbr', 'skills', 'review', 'SKILL.md'), 'utf8');

    test('documents all three review roles', () => {
      expect(reviewSkill).toContain('FUNCTIONAL REVIEWER');
      expect(reviewSkill).toContain('SECURITY AUDITOR');
      expect(reviewSkill).toContain('PERFORMANCE ANALYST');
    });

    test('includes synthesis step', () => {
      expect(reviewSkill).toContain('synthesizer');
    });
  });

  describe('reference doc', () => {
    const ref = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'pbr', 'references', 'agent-teams.md'), 'utf8');

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
