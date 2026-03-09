const fs = require('fs');
const path = require('path');
const schema = require('../plan-build-run/bin/config-schema.json');

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
      path.join(__dirname, '..', 'plan-build-run', 'skills', 'plan', 'SKILL.md'), 'utf8');

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
      path.join(__dirname, '..', 'plan-build-run', 'skills', 'review', 'SKILL.md'), 'utf8');

    test('documents all three review roles', () => {
      expect(reviewSkill).toContain('FUNCTIONAL REVIEWER');
      expect(reviewSkill).toContain('SECURITY AUDITOR');
      expect(reviewSkill).toContain('PERFORMANCE ANALYST');
    });

    test('includes synthesis step', () => {
      expect(reviewSkill).toContain('synthesizer');
    });
  });

  // Skipped: references/agent-teams.md not ported to fork (feature deferred)
  describe.skip('reference doc', () => {
    test('documents planning teams', () => {});
    test('documents review teams', () => {});
    test('documents file-based coordination', () => {});
    test('documents when to use teams', () => {});
    test('documents team output directory structure', () => {});
  });
});
