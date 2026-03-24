/**
 * Tests for decision injection into SessionStart briefing.
 * Validates that progress-tracker.js includes recent active decisions
 * in the briefing output when decision journal is enabled.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let getDecisionBriefing;

beforeAll(() => {
  const mod = require('../plugins/pbr/scripts/progress-tracker');
  getDecisionBriefing = mod.getDecisionBriefing;
});

function makeTempPlanning(opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-decision-inj-'));
  const planningDir = path.join(tmp, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  const features = opts.features || { decision_journal: true };
  fs.writeFileSync(
    path.join(planningDir, 'config.json'),
    JSON.stringify({ features }),
    'utf-8'
  );

  return { tmp, planningDir };
}

function writeDecisionFile(planningDir, filename, frontmatter) {
  const decisionsDir = path.join(planningDir, 'decisions');
  fs.mkdirSync(decisionsDir, { recursive: true });

  const fm = Object.entries(frontmatter).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}:\n${v.map(i => `  - ${i}`).join('\n')}`;
    return `${k}: ${v}`;
  }).join('\n');

  const content = `---\n${fm}\n---\n\n## Context\n\nTest context.\n`;
  fs.writeFileSync(path.join(decisionsDir, filename), content, 'utf-8');
}

function cleanup(tmp) {
  fs.rmSync(tmp, { recursive: true, force: true });
}

describe('getDecisionBriefing', () => {
  test('includes recent active decisions in briefing output', async () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      writeDecisionFile(planningDir, '2026-03-17-use-postgres.md', {
        date: '2026-03-17',
        decision: 'Use PostgreSQL for persistence',
        status: 'active',
        agent: 'executor',
        phase: '5',
        tags: []
      });
      writeDecisionFile(planningDir, '2026-03-16-use-typescript.md', {
        date: '2026-03-16',
        decision: 'Use TypeScript strict mode',
        status: 'active',
        agent: 'planner',
        phase: '3',
        tags: []
      });

      const result = getDecisionBriefing(planningDir);
      expect(result).toContain('Recent decisions:');
      expect(result).toContain('Use PostgreSQL');
      expect(result).toContain('Use TypeScript');
    } finally {
      cleanup(tmp);
    }
  });

  test('excludes superseded decisions', async () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      writeDecisionFile(planningDir, '2026-03-17-use-redis.md', {
        date: '2026-03-17',
        decision: 'Use Redis for caching',
        status: 'active',
        agent: 'executor',
        phase: '5',
        tags: []
      });
      writeDecisionFile(planningDir, '2026-03-15-use-memcached.md', {
        date: '2026-03-15',
        decision: 'Use Memcached for caching',
        status: 'superseded',
        agent: 'executor',
        phase: '3',
        tags: []
      });

      const result = getDecisionBriefing(planningDir);
      expect(result).toContain('Use Redis');
      expect(result).not.toContain('Use Memcached');
    } finally {
      cleanup(tmp);
    }
  });

  test('limits to 5 most recent decisions', async () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      for (let i = 0; i < 7; i++) {
        const day = String(10 + i).padStart(2, '0');
        writeDecisionFile(planningDir, `2026-03-${day}-decision-${i}.md`, {
          date: `2026-03-${day}`,
          decision: `Decision number ${i}`,
          status: 'active',
          agent: 'executor',
          phase: '5',
          tags: []
        });
      }

      const result = getDecisionBriefing(planningDir);
      // Count the bullet points
      const bulletCount = (result.match(/^- /gm) || []).length;
      expect(bulletCount).toBeLessThanOrEqual(5);
      // Should include the most recent ones (higher numbers)
      expect(result).toContain('Decision number 6');
      expect(result).toContain('Decision number 5');
      // Should NOT include the oldest
      expect(result).not.toContain('Decision number 0');
    } finally {
      cleanup(tmp);
    }
  });

  test('returns empty string when no decisions exist', async () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const result = getDecisionBriefing(planningDir);
      expect(result).toBe('');
    } finally {
      cleanup(tmp);
    }
  });

  test('returns empty string when features.decision_journal is false', async () => {
    const { tmp, planningDir } = makeTempPlanning({ features: { decision_journal: false } });
    try {
      writeDecisionFile(planningDir, '2026-03-17-some-decision.md', {
        date: '2026-03-17',
        decision: 'Some decision',
        status: 'active',
        agent: 'executor',
        phase: '5',
        tags: []
      });

      const result = getDecisionBriefing(planningDir);
      expect(result).toBe('');
    } finally {
      cleanup(tmp);
    }
  });

  test('truncates long decision titles to 60 chars', async () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const longTitle = 'A'.repeat(100);
      writeDecisionFile(planningDir, '2026-03-17-long-title.md', {
        date: '2026-03-17',
        decision: longTitle,
        status: 'active',
        agent: 'executor',
        phase: '5',
        tags: []
      });

      const result = getDecisionBriefing(planningDir);
      // The full 100-char title should be truncated
      expect(result).not.toContain(longTitle);
      expect(result.length).toBeLessThan(300); // Keep total injection small
    } finally {
      cleanup(tmp);
    }
  });
});
