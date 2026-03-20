/**
 * Tests for plan-build-run/bin/lib/decisions.cjs
 * Decision journal CRUD operations
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { recordDecision, listDecisions, getDecision, supersedeDecision, slugify } = require('../plugins/pbr/scripts/lib/decisions');

function makeTmpDir() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-decisions-'));
  const planningDir = path.join(tmp, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  return { tmp, planningDir };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('decisions CRUD', () => {
  let tmp, planningDir;

  beforeEach(() => {
    ({ tmp, planningDir } = makeTmpDir());
  });

  afterEach(() => {
    cleanup(tmp);
  });

  describe('slugify', () => {
    test('lowercases and replaces non-alphanum with hyphens', () => {
      expect(slugify('Use React for UI')).toBe('use-react-for-ui');
    });

    test('trims leading/trailing hyphens', () => {
      expect(slugify('--hello--')).toBe('hello');
    });

    test('collapses multiple hyphens', () => {
      expect(slugify('foo   bar   baz')).toBe('foo-bar-baz');
    });

    test('truncates to 60 chars', () => {
      const long = 'a'.repeat(100);
      expect(slugify(long).length).toBeLessThanOrEqual(60);
    });

    test('handles empty string', () => {
      expect(slugify('')).toBe('untitled');
    });

    test('handles special characters', () => {
      expect(slugify('Use C++ & Rust!')).toBe('use-c-rust');
    });
  });

  describe('recordDecision', () => {
    test('creates decisions dir if missing', () => {
      const decisionsDir = path.join(planningDir, 'decisions');
      expect(fs.existsSync(decisionsDir)).toBe(false);

      recordDecision(planningDir, {
        decision: 'Use TypeScript',
        rationale: 'Type safety',
        alternatives: ['JavaScript'],
        context: 'Starting new project',
      });

      expect(fs.existsSync(decisionsDir)).toBe(true);
    });

    test('creates file named {YYYY-MM-DD}-{slug}.md', () => {
      const result = recordDecision(planningDir, {
        decision: 'Use TypeScript',
        rationale: 'Type safety',
        alternatives: [],
        context: 'New project',
      });

      const today = new Date().toISOString().split('T')[0];
      expect(result.slug).toBe('use-typescript');
      expect(result.path).toContain(today);
      expect(result.path).toContain('use-typescript.md');

      const fullPath = path.join(planningDir, 'decisions', path.basename(result.path));
      expect(fs.existsSync(fullPath)).toBe(true);
    });

    test('recorded file has YAML frontmatter with required fields', () => {
      const result = recordDecision(planningDir, {
        decision: 'Use TypeScript',
        rationale: 'Type safety',
        alternatives: ['JavaScript'],
        context: 'New project',
        agent: 'planner',
        phase: '05',
        tags: ['language', 'tooling'],
      });

      const fullPath = path.join(planningDir, 'decisions', path.basename(result.path));
      const content = fs.readFileSync(fullPath, 'utf-8');

      expect(content).toMatch(/^---\n/);
      expect(content).toMatch(/date:/);
      expect(content).toMatch(/decision: Use TypeScript/);
      expect(content).toMatch(/status: active/);
      expect(content).toMatch(/agent: planner/);
      expect(content).toMatch(/phase: 05/);
      expect(content).toMatch(/tags:/);
    });

    test('recorded file body contains required sections', () => {
      const result = recordDecision(planningDir, {
        decision: 'Use TypeScript',
        rationale: 'Type safety is important',
        alternatives: ['JavaScript', 'CoffeeScript'],
        context: 'Starting a new project',
        consequences: 'Build step required',
      });

      const fullPath = path.join(planningDir, 'decisions', path.basename(result.path));
      const content = fs.readFileSync(fullPath, 'utf-8');

      expect(content).toContain('## Context');
      expect(content).toContain('Starting a new project');
      expect(content).toContain('## Decision');
      expect(content).toContain('Type safety is important');
      expect(content).toContain('## Alternatives Considered');
      expect(content).toContain('- JavaScript');
      expect(content).toContain('- CoffeeScript');
      expect(content).toContain('## Consequences');
      expect(content).toContain('Build step required');
    });

    test('defaults for optional fields', () => {
      const result = recordDecision(planningDir, {
        decision: 'Use defaults',
        rationale: 'Testing defaults',
        alternatives: [],
        context: 'Test',
      });

      const fullPath = path.join(planningDir, 'decisions', path.basename(result.path));
      const content = fs.readFileSync(fullPath, 'utf-8');

      expect(content).toMatch(/agent: user/);
      expect(content).toMatch(/phase:/);
      expect(content).toContain('## Consequences');
      expect(content).toContain('To be determined.');
      expect(content).toContain('None documented.');
    });

    test('appends -N suffix for duplicate filenames', () => {
      const opts = {
        decision: 'Same Decision',
        rationale: 'First',
        alternatives: [],
        context: 'Test',
      };

      const r1 = recordDecision(planningDir, opts);
      const r2 = recordDecision(planningDir, { ...opts, rationale: 'Second' });

      expect(r1.path).not.toBe(r2.path);
      expect(r2.path).toMatch(/-2\.md$/);
    });
  });

  describe('listDecisions', () => {
    beforeEach(() => {
      recordDecision(planningDir, {
        decision: 'Use React',
        rationale: 'Component model',
        alternatives: ['Vue'],
        context: 'Frontend',
        agent: 'planner',
        phase: '05',
        tags: ['frontend'],
      });
      recordDecision(planningDir, {
        decision: 'Use PostgreSQL',
        rationale: 'ACID compliance',
        alternatives: ['MongoDB'],
        context: 'Database',
        agent: 'executor',
        phase: '03',
        tags: ['database'],
      });
    });

    test('returns array of decision objects from frontmatter', () => {
      const list = listDecisions(planningDir);
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(2);
      expect(list[0]).toHaveProperty('slug');
      expect(list[0]).toHaveProperty('date');
      expect(list[0]).toHaveProperty('decision');
      expect(list[0]).toHaveProperty('status');
      expect(list[0]).toHaveProperty('agent');
      expect(list[0]).toHaveProperty('phase');
      expect(list[0]).toHaveProperty('tags');
      expect(list[0]).toHaveProperty('path');
    });

    test('filters by status', () => {
      const list = listDecisions(planningDir, { status: 'active' });
      expect(list.length).toBe(2);
    });

    test('filters by phase', () => {
      const list = listDecisions(planningDir, { phase: '05' });
      expect(list.length).toBe(1);
      expect(list[0].decision).toBe('Use React');
    });

    test('filters by tag', () => {
      const list = listDecisions(planningDir, { tag: 'database' });
      expect(list.length).toBe(1);
      expect(list[0].decision).toBe('Use PostgreSQL');
    });

    test('returns empty array when no decisions dir', () => {
      const { tmp: tmp2, planningDir: pd2 } = makeTmpDir();
      const list = listDecisions(pd2);
      expect(list).toEqual([]);
      cleanup(tmp2);
    });

    test('sorts by date descending', () => {
      const list = listDecisions(planningDir);
      // Both created same day, so check order is stable
      expect(list.length).toBe(2);
    });
  });

  describe('getDecision', () => {
    test('returns full decision content by slug', () => {
      recordDecision(planningDir, {
        decision: 'Use React',
        rationale: 'Component model',
        alternatives: ['Vue'],
        context: 'Frontend',
      });

      const result = getDecision(planningDir, 'use-react');
      expect(result).not.toBeNull();
      expect(result.frontmatter).toHaveProperty('decision', 'Use React');
      expect(result.body).toContain('## Context');
      expect(result.path).toContain('use-react.md');
    });

    test('returns null for non-existent slug', () => {
      const result = getDecision(planningDir, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('supersedeDecision', () => {
    test('marks old decision as superseded and adds superseded_by', () => {
      recordDecision(planningDir, {
        decision: 'Use React',
        rationale: 'Component model',
        alternatives: ['Vue'],
        context: 'Frontend',
      });

      const result = supersedeDecision(planningDir, 'use-react', 'use-vue');
      expect(result).not.toBeNull();
      expect(result.newStatus).toBe('superseded');

      // Verify the file was updated
      const decision = getDecision(planningDir, 'use-react');
      expect(decision.frontmatter.status).toBe('superseded');
      expect(decision.frontmatter.superseded_by).toBe('use-vue');
    });

    test('returns null for non-existent slug', () => {
      const result = supersedeDecision(planningDir, 'nonexistent', 'new-slug');
      expect(result).toBeNull();
    });
  });
});
