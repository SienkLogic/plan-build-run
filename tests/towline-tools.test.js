const {
  parseStateMd,
  parseRoadmapMd,
  parseYamlFrontmatter,
  parseMustHaves,
  countMustHaves
} = require('../plugins/dev/scripts/towline-tools');

describe('towline-tools.js', () => {
  describe('parseStateMd', () => {
    test('extracts phase number and total', () => {
      const content = 'Phase: 3 of 10\n-- Auth System\nProgress: 45%\nStatus: building';
      const result = parseStateMd(content);
      expect(result.current_phase).toBe(3);
      expect(result.total_phases).toBe(10);
    });

    test('extracts phase name after --', () => {
      const content = 'Phase: 2 of 8\n-- Database Setup\n50%';
      const result = parseStateMd(content);
      expect(result.phase_name).toBe('Database Setup');
    });

    test('extracts progress percentage', () => {
      const content = 'Phase: 1 of 5\nOverall: 72% complete';
      const result = parseStateMd(content);
      expect(result.progress).toBe(72);
    });

    test('extracts status', () => {
      const content = 'Phase: 1 of 5\nStatus: planned\n';
      const result = parseStateMd(content);
      expect(result.status).toBe('planned');
    });

    test('handles missing phase info', () => {
      const content = 'Some random content\nNo phase data here\n';
      const result = parseStateMd(content);
      expect(result.current_phase).toBeNull();
      expect(result.total_phases).toBeUndefined();
    });

    test('handles missing status', () => {
      const content = 'Phase: 1 of 3\nNo status line here';
      const result = parseStateMd(content);
      expect(result.status).toBeNull();
    });

    test('handles missing phase name', () => {
      const content = 'Phase: 1 of 3\nStatus: building';
      const result = parseStateMd(content);
      expect(result.phase_name).toBeNull();
    });

    test('counts lines', () => {
      const content = 'line1\nline2\nline3';
      const result = parseStateMd(content);
      expect(result.line_count).toBe(3);
    });

    test('legacy format sets format to "legacy"', () => {
      const content = 'Phase: 1 of 5\nStatus: building\nProgress: 20%';
      const result = parseStateMd(content);
      expect(result.format).toBe('legacy');
    });

    test('parses YAML frontmatter format (version 2)', () => {
      const content = `---
version: 2
current_phase: 3
total_phases: 10
phase_slug: "auth-system"
status: "building"
progress_percent: 30
plans_total: 4
plans_complete: 1
last_activity: "2026-02-10"
last_command: "/dev:build 3"
blockers: []
---
# Project State

## Current Position
Phase: 3 of 10 (Auth System)
Status: building`;
      const result = parseStateMd(content);
      expect(result.format).toBe('frontmatter');
      expect(result.current_phase).toBe(3);
      expect(result.total_phases).toBe(10);
      expect(result.phase_name).toBe('auth-system');
      expect(result.status).toBe('building');
      expect(result.progress).toBe(30);
      expect(result.plans_total).toBe(4);
      expect(result.plans_complete).toBe(1);
      expect(result.last_command).toBe('/dev:build 3');
      expect(result.blockers).toEqual([]);
    });

    test('frontmatter with blockers', () => {
      const content = `---
version: 2
current_phase: 5
status: "blocked"
blockers:
  - Missing API key
  - Database migration pending
---
# Project State`;
      const result = parseStateMd(content);
      expect(result.format).toBe('frontmatter');
      expect(result.blockers).toEqual(['Missing API key', 'Database migration pending']);
    });

    test('backward compatible — old format without frontmatter still works', () => {
      const content = `# Project State
Version: 1

## Current Position
Phase: 7 of 12 (Dashboard)
Plan: 2 of 3 in current phase
Status: Building
Progress: [██████████████░░░░░░] 58%`;
      const result = parseStateMd(content);
      expect(result.format).toBe('legacy');
      expect(result.current_phase).toBe(7);
      expect(result.total_phases).toBe(12);
      expect(result.status).toBe('Building');
      expect(result.progress).toBe(58);
    });
  });

  describe('parseRoadmapMd', () => {
    test('parses Phase Overview table rows', () => {
      const content = `## Phase Overview
| Phase | Name | Goal | Plans | Wave | Status |
|-------|------|------|-------|------|--------|
| 01 | Setup | Init project | 2 | 1 | planned |
| 02 | Auth | Add login | 3 | 1 | pending |
`;
      const result = parseRoadmapMd(content);
      expect(result.phases).toHaveLength(2);
      expect(result.phases[0].number).toBe('01');
      expect(result.phases[0].name).toBe('Setup');
      expect(result.phases[0].goal).toBe('Init project');
      expect(result.phases[0].status).toBe('planned');
      expect(result.phases[1].number).toBe('02');
      expect(result.phases[1].name).toBe('Auth');
    });

    test('detects progress table', () => {
      const content = `## Phase Overview
| Phase | Name | Goal |
|-------|------|------|
| 01 | Setup | Init |

## Progress
Some progress data
`;
      const result = parseRoadmapMd(content);
      expect(result.has_progress_table).toBe(true);
    });

    test('returns false for missing progress table', () => {
      const content = `## Phase Overview
| Phase | Name | Goal |
|-------|------|------|
| 01 | Setup | Init |
`;
      const result = parseRoadmapMd(content);
      expect(result.has_progress_table).toBe(false);
    });

    test('returns empty phases for missing table', () => {
      const content = '# Roadmap\n\nNo table here\n';
      const result = parseRoadmapMd(content);
      expect(result.phases).toEqual([]);
    });

    test('returns empty phases for empty content', () => {
      const result = parseRoadmapMd('');
      expect(result.phases).toEqual([]);
    });

    test('defaults missing status column to pending', () => {
      const content = `## Phase Overview
| Phase | Name | Goal | Plans | Wave |
|-------|------|------|-------|------|
| 01 | Setup | Init | 2 | 1 |
`;
      const result = parseRoadmapMd(content);
      expect(result.phases[0].status).toBe('pending');
    });
  });

  describe('parseYamlFrontmatter', () => {
    test('parses basic key-value pairs', () => {
      const content = '---\nphase: 03-auth\nplan: 01\nwave: 1\n---\nBody';
      const result = parseYamlFrontmatter(content);
      expect(result.phase).toBe('03-auth');
      expect(result.plan).toBe(1);
      expect(result.wave).toBe(1);
    });

    test('coerces boolean true', () => {
      const content = '---\nautonomous: true\n---\n';
      const result = parseYamlFrontmatter(content);
      expect(result.autonomous).toBe(true);
    });

    test('coerces boolean false', () => {
      const content = '---\nautonomous: false\n---\n';
      const result = parseYamlFrontmatter(content);
      expect(result.autonomous).toBe(false);
    });

    test('coerces integer values', () => {
      const content = '---\nwave: 3\nmax_tokens: 500\n---\n';
      const result = parseYamlFrontmatter(content);
      expect(result.wave).toBe(3);
      expect(result.max_tokens).toBe(500);
    });

    test('parses inline arrays', () => {
      const content = '---\ndepends_on: [plan-01, plan-02]\n---\n';
      const result = parseYamlFrontmatter(content);
      expect(result.depends_on).toEqual(['plan-01', 'plan-02']);
    });

    test('parses multi-line arrays', () => {
      const content = '---\nfiles_modified:\n  - src/auth.ts\n  - src/login.ts\n---\n';
      const result = parseYamlFrontmatter(content);
      expect(result.files_modified).toEqual(['src/auth.ts', 'src/login.ts']);
    });

    test('strips quotes from values', () => {
      const content = '---\nstatus: "complete"\nname: \'auth\'\n---\n';
      const result = parseYamlFrontmatter(content);
      expect(result.status).toBe('complete');
      expect(result.name).toBe('auth');
    });

    test('returns empty object for missing frontmatter', () => {
      const content = 'No frontmatter here';
      const result = parseYamlFrontmatter(content);
      expect(result).toEqual({});
    });

    test('handles empty inline array', () => {
      const content = '---\ndepends_on: []\n---\n';
      const result = parseYamlFrontmatter(content);
      expect(result.depends_on).toEqual([]);
    });

    test('parses must_haves as nested object', () => {
      const content = `---
plan: 01
must_haves:
  truths:
    - Users can log in
  artifacts:
    - src/auth.ts
  key_links: []
---
Body`;
      const result = parseYamlFrontmatter(content);
      expect(result.must_haves).toBeDefined();
      expect(result.must_haves.truths).toContain('Users can log in');
      expect(result.must_haves.artifacts).toContain('src/auth.ts');
    });
  });

  describe('parseMustHaves', () => {
    test('parses all three categories', () => {
      const yaml = `plan: 01
must_haves:
  truths:
    - Users can authenticate
    - Sessions are secure
  artifacts:
    - src/auth.ts
    - src/middleware.ts
  key_links:
    - /login -> POST handler`;
      const result = parseMustHaves(yaml);
      expect(result.truths).toHaveLength(2);
      expect(result.artifacts).toHaveLength(2);
      expect(result.key_links).toHaveLength(1);
    });

    test('handles empty sections', () => {
      const yaml = `must_haves:
  truths:
  artifacts:
  key_links:
next_field: value`;
      const result = parseMustHaves(yaml);
      expect(result.truths).toEqual([]);
      expect(result.artifacts).toEqual([]);
      expect(result.key_links).toEqual([]);
    });

    test('handles missing must_haves', () => {
      const yaml = 'plan: 01\nwave: 1';
      const result = parseMustHaves(yaml);
      // parseMustHaves always returns the structure, but with empty arrays
      expect(result.truths).toEqual([]);
      expect(result.artifacts).toEqual([]);
      expect(result.key_links).toEqual([]);
    });

    test('stops at next top-level key', () => {
      const yaml = `must_haves:
  truths:
    - Truth 1
  artifacts:
    - art.ts
  key_links:
    - /link
next_top_level: something`;
      const result = parseMustHaves(yaml);
      expect(result.truths).toHaveLength(1);
      expect(result.artifacts).toHaveLength(1);
      expect(result.key_links).toHaveLength(1);
    });
  });

  describe('countMustHaves', () => {
    test('counts across all categories', () => {
      const mustHaves = {
        truths: ['a', 'b'],
        artifacts: ['c'],
        key_links: ['d', 'e', 'f']
      };
      expect(countMustHaves(mustHaves)).toBe(6);
    });

    test('returns 0 for null input', () => {
      expect(countMustHaves(null)).toBe(0);
    });

    test('returns 0 for undefined input', () => {
      expect(countMustHaves(undefined)).toBe(0);
    });

    test('handles missing categories', () => {
      expect(countMustHaves({ truths: ['a'] })).toBe(1);
      expect(countMustHaves({})).toBe(0);
    });
  });
});
