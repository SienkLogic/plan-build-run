const fs = require('fs');
const path = require('path');

describe('Advanced Execution Features in Build SKILL.md', () => {
  let skillContent;

  beforeAll(() => {
    skillContent = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'pbr', 'skills', 'build', 'SKILL.md'),
      'utf8'
    );
  });

  describe('Phase Replay (REQ-AE-001)', () => {
    test('Step 6d contains phase replay enrichment section', async () => {
      expect(skillContent).toContain('Phase Replay Enrichment');
      expect(skillContent).toContain('workflow.phase_replay');
    });

    test('replay includes all 4 context sources', async () => {
      expect(skillContent).toContain('Original Plan Summary');
      expect(skillContent).toContain('Prior Attempt Results');
      expect(skillContent).toContain('Verification Failures');
      expect(skillContent).toContain('Code Diffs From Failed Attempt');
    });

    test('replay context has 30% budget cap', async () => {
      expect(skillContent).toContain('30%');
      expect(skillContent).toMatch(/context budget/i);
    });

    test('replay is no-op when config is false', async () => {
      expect(skillContent).toMatch(/phase_replay.*false|false.*phase_replay/s);
    });
  });

  describe('Confidence-Gated Verification Skip (REQ-AE-002)', () => {
    test('Step 7 contains confidence gate section', async () => {
      expect(skillContent).toContain('Confidence-Gated Verification Skip');
      expect(skillContent).toContain('verification.confidence_gate');
      expect(skillContent).toContain('verification.confidence_threshold');
    });

    test('confidence gate checks 3 signals', async () => {
      expect(skillContent).toContain('completion_met');
      expect(skillContent).toContain('shas_verified');
      expect(skillContent).toContain('tests_passed');
    });

    test('passed gate still spawns verifier (advisory only)', async () => {
      expect(skillContent).toContain('Confidence gate passed');
      expect(skillContent).toContain('spawning verifier in light mode');
      // Confidence gate no longer writes VERIFICATION.md or skips the verifier
      expect(skillContent).not.toContain('Skip the verifier spawn');
    });

    test('failed gate falls through to normal verifier', async () => {
      expect(skillContent).toContain('Confidence gate not met');
      expect(skillContent).toContain('spawning verifier');
    });

    test('gate is no-op when config is false', async () => {
      expect(skillContent).toMatch(/confidence_gate.*false|false.*confidence_gate/s);
    });
  });

  describe('Speculative Planning (REQ-AE-003, REQ-AE-004)', () => {
    test('Step 8e contains speculative planning section', async () => {
      expect(skillContent).toContain('Speculative Planning (conditional)');
      expect(skillContent).toContain('workflow.speculative_planning');
    });

    test('checks ROADMAP.md for phase independence', async () => {
      expect(skillContent).toContain('Depends on');
      expect(skillContent).toContain('independent');
    });

    test('spawns planner in background', async () => {
      expect(skillContent).toContain('run_in_background');
      expect(skillContent).toContain('pbr:planner');
    });

    test('deviation threshold of 2 triggers discard', async () => {
      expect(skillContent).toContain('deviation count > 2');
      expect(skillContent).toContain('threshold: 2');
    });

    test('discarded plans are cleaned up', async () => {
      expect(skillContent).toContain('.speculative/');
      expect(skillContent).toContain('discarded');
    });

    test('speculative planning is no-op when config is false', async () => {
      expect(skillContent).toMatch(/speculative_planning.*false|false.*speculative_planning/s);
    });
  });

  describe('Config Gating (REQ-AE-005)', () => {
    test('all 3 features have independent config gates', async () => {
      expect(skillContent).toContain('workflow.phase_replay');
      expect(skillContent).toContain('verification.confidence_gate');
      expect(skillContent).toContain('workflow.speculative_planning');
    });
  });

});
