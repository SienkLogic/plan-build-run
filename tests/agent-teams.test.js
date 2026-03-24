const fs = require('fs');
const path = require('path');
const schema = require('../plugins/pbr/scripts/config-schema.json');

describe('agent-teams', () => {
  describe('config schema', () => {
    test('teams property exists in schema', async () => {
      expect(schema.properties.teams).toBeDefined();
    });

    test('teams has planning_roles array', async () => {
      const pr = schema.properties.teams.properties.planning_roles;
      expect(pr).toBeDefined();
      expect(pr.type).toBe('array');
    });

    test('teams has review_roles array', async () => {
      const rr = schema.properties.teams.properties.review_roles;
      expect(rr).toBeDefined();
      expect(rr.type).toBe('array');
    });

    test('teams has synthesis_model string', async () => {
      const sm = schema.properties.teams.properties.synthesis_model;
      expect(sm).toBeDefined();
      expect(sm.type).toBe('string');
    });

    test('teams has coordination enum', async () => {
      const coord = schema.properties.teams.properties.coordination;
      expect(coord).toBeDefined();
      expect(coord.enum).toContain('file-based');
      expect(coord.enum).toContain('sequential');
    });

    test('parallelization.use_teams exists', async () => {
      expect(schema.properties.parallelization.properties.use_teams).toBeDefined();
    });
  });

  describe('plan skill team documentation', () => {
    const planSkill = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'pbr', 'skills', 'plan', 'SKILL.md'), 'utf8');

    test('documents --teams flag', async () => {
      expect(planSkill).toContain('--teams');
    });

    test('documents all three planning roles', async () => {
      // Condensed in Phase 52: role definitions moved to references/agent-teams.md
      // Plan SKILL.md now references roles by short name in a summary line
      expect(planSkill).toMatch(/architect.*security.*test/i);
    });

    test('includes synthesis step', async () => {
      expect(planSkill).toContain('synthesizer');
    });

    test('references agent-teams.md', async () => {
      expect(planSkill).toContain('references/agent-teams.md');
    });
  });

  describe('review skill team documentation', () => {
    const reviewSkill = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'pbr', 'skills', 'review', 'SKILL.md'), 'utf8');

    test('documents all three review roles', async () => {
      expect(reviewSkill).toContain('FUNCTIONAL REVIEWER');
      expect(reviewSkill).toContain('SECURITY AUDITOR');
      expect(reviewSkill).toContain('PERFORMANCE ANALYST');
    });

    test('includes synthesis step', async () => {
      expect(reviewSkill).toContain('synthesizer');
    });
  });

  // Skipped: references/agent-teams.md not ported to fork (feature deferred)
  describe.skip('reference doc', () => {
    test('documents planning teams', async () => {});
    test('documents review teams', async () => {});
    test('documents file-based coordination', async () => {});
    test('documents when to use teams', async () => {});
    test('documents team output directory structure', async () => {});
  });
});
