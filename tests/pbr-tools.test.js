const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  parseStateMd,
  parseRoadmapMd,
  parseYamlFrontmatter,
  parseMustHaves,
  countMustHaves,
  atomicWrite,
  configLoad,
  configClearCache,
  updateLegacyStateField,
  updateFrontmatterField,
  updateTableRow,
  findRoadmapRow,
  resolveDepthProfile,
  historyAppend,
  historyLoad,
  VALID_STATUS_TRANSITIONS,
  validateStatusTransition
} = require('../plugins/pbr/scripts/pbr-tools');

describe('pbr-tools.js', () => {
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
last_command: "/pbr:build 3"
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
      expect(result.last_command).toBe('/pbr:build 3');
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

  describe('atomicWrite', () => {
    const os = require('os');

    function makeTmpFile() {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-aw-'));
      const filePath = path.join(tmpDir, 'test-file.md');
      return { tmpDir, filePath };
    }

    function cleanupDir(tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    test('writes content to new file', () => {
      const { tmpDir, filePath } = makeTmpFile();
      const result = atomicWrite(filePath, '# New Content');
      expect(result.success).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('# New Content');
      cleanupDir(tmpDir);
    });

    test('overwrites existing file', () => {
      const { tmpDir, filePath } = makeTmpFile();
      fs.writeFileSync(filePath, '# Old Content');
      const result = atomicWrite(filePath, '# Updated Content');
      expect(result.success).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('# Updated Content');
      cleanupDir(tmpDir);
    });

    test('cleans up .bak file after successful write', () => {
      const { tmpDir, filePath } = makeTmpFile();
      fs.writeFileSync(filePath, '# Original');
      atomicWrite(filePath, '# Updated');
      const bakPath = filePath + '.bak';
      // .bak should be cleaned up on success (no stale .bak accumulation)
      expect(fs.existsSync(bakPath)).toBe(false);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('# Updated');
      cleanupDir(tmpDir);
    });

    test('cleans up .tmp file on success', () => {
      const { tmpDir, filePath } = makeTmpFile();
      atomicWrite(filePath, '# Content');
      const tmpFilePath = filePath + '.tmp';
      expect(fs.existsSync(tmpFilePath)).toBe(false);
      cleanupDir(tmpDir);
    });

    test('no .bak when writing to new file (no original to backup)', () => {
      const { tmpDir, filePath } = makeTmpFile();
      atomicWrite(filePath, '# Brand New');
      const bakPath = filePath + '.bak';
      expect(fs.existsSync(bakPath)).toBe(false);
      cleanupDir(tmpDir);
    });

    test('returns error for invalid directory', () => {
      const result = atomicWrite('/nonexistent/dir/file.md', '# Content');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('preserves content on multiple successive writes', () => {
      const { tmpDir, filePath } = makeTmpFile();
      atomicWrite(filePath, 'Version 1');
      atomicWrite(filePath, 'Version 2');
      atomicWrite(filePath, 'Version 3');
      expect(fs.readFileSync(filePath, 'utf8')).toBe('Version 3');
      // .bak should be cleaned up after each successful write
      expect(fs.existsSync(filePath + '.bak')).toBe(false);
      cleanupDir(tmpDir);
    });
  });

  describe('updateLegacyStateField', () => {
    const legacyContent = '# Project State\n\nPhase: 2 of 6 -- Authentication\nStatus: built\nProgress: 33%\n\n## Current Work\nPlan: 1 of 2\nWave: 1\n';

    test('updates current_phase', () => {
      const result = updateLegacyStateField(legacyContent, 'current_phase', '3');
      expect(result).toContain('Phase: 3 of 6');
      expect(result).not.toContain('Phase: 2 of 6');
    });

    test('updates status', () => {
      const result = updateLegacyStateField(legacyContent, 'status', 'building');
      expect(result).toContain('Status: building');
      expect(result).not.toContain('Status: built');
    });

    test('updates plans_complete', () => {
      const result = updateLegacyStateField(legacyContent, 'plans_complete', '2');
      expect(result).toContain('Plan: 2 of 2');
      expect(result).not.toContain('Plan: 1 of 2');
    });

    test('adds last_activity when not present', () => {
      const result = updateLegacyStateField(legacyContent, 'last_activity', '2026-02-10');
      expect(result).toContain('Last Activity: 2026-02-10');
    });

    test('updates last_activity when already present', () => {
      const content = legacyContent.replace('Status: built', 'Status: built\nLast Activity: 2026-02-09');
      const result = updateLegacyStateField(content, 'last_activity', '2026-02-10');
      expect(result).toContain('Last Activity: 2026-02-10');
      expect(result).not.toContain('Last Activity: 2026-02-09');
    });

    test('adds status when not present', () => {
      const noStatus = '# Project State\n\nPhase: 2 of 6 -- Authentication\nProgress: 33%\n';
      const result = updateLegacyStateField(noStatus, 'status', 'building');
      expect(result).toContain('Status: building');
    });
  });

  describe('updateFrontmatterField', () => {
    const fmContent = '---\nversion: 2\ncurrent_phase: 3\nstatus: "building"\nplans_complete: 1\n---\n# Project State\n';

    test('updates existing string field', () => {
      const result = updateFrontmatterField(fmContent, 'status', 'verified');
      expect(result).toContain('status: "verified"');
      expect(result).not.toContain('status: "building"');
    });

    test('updates existing integer field', () => {
      const result = updateFrontmatterField(fmContent, 'current_phase', '5');
      expect(result).toContain('current_phase: 5');
      expect(result).not.toContain('current_phase: 3');
    });

    test('adds new field when not present', () => {
      const result = updateFrontmatterField(fmContent, 'last_activity', '2026-02-10');
      expect(result).toContain('last_activity: "2026-02-10"');
    });

    test('preserves content after frontmatter', () => {
      const result = updateFrontmatterField(fmContent, 'status', 'verified');
      expect(result).toContain('# Project State');
    });

    test('returns content unchanged if no frontmatter', () => {
      const noFm = '# No frontmatter here\nJust content';
      const result = updateFrontmatterField(noFm, 'status', 'verified');
      expect(result).toBe(noFm);
    });
  });

  describe('updateTableRow', () => {
    const row = '| 02 | Auth | Authentication system | 2 | 2 | planned |';

    test('updates status column (index 5)', () => {
      const result = updateTableRow(row, 5, 'building');
      expect(result).toContain('| building |');
      expect(result).not.toContain('| planned |');
    });

    test('updates plans column (index 3)', () => {
      const result = updateTableRow(row, 3, '1/2');
      expect(result).toContain('| 1/2 |');
    });

    test('updates phase column (index 0)', () => {
      const result = updateTableRow(row, 0, '03');
      expect(result).toContain('| 03 |');
    });

    test('preserves other columns', () => {
      const result = updateTableRow(row, 5, 'verified');
      expect(result).toContain('| Auth |');
      expect(result).toContain('| Authentication system |');
    });
  });

  describe('resolveDepthProfile', () => {
    test('returns standard defaults when config is null', () => {
      const result = resolveDepthProfile(null);
      expect(result.depth).toBe('standard');
      expect(result.profile['features.research_phase']).toBe(true);
      expect(result.profile['features.plan_checking']).toBe(true);
      expect(result.profile['scan.mapper_count']).toBe(4);
    });

    test('returns quick profile with reduced spawns', () => {
      const result = resolveDepthProfile({ depth: 'quick' });
      expect(result.depth).toBe('quick');
      expect(result.profile['features.research_phase']).toBe(false);
      expect(result.profile['features.plan_checking']).toBe(false);
      expect(result.profile['features.goal_verification']).toBe(false);
      expect(result.profile['scan.mapper_count']).toBe(2);
      expect(result.profile['scan.mapper_areas']).toEqual(['tech', 'arch']);
      expect(result.profile['debug.max_hypothesis_rounds']).toBe(3);
    });

    test('returns comprehensive profile with all spawns', () => {
      const result = resolveDepthProfile({ depth: 'comprehensive' });
      expect(result.depth).toBe('comprehensive');
      expect(result.profile['features.research_phase']).toBe(true);
      expect(result.profile['features.inline_verify']).toBe(true);
      expect(result.profile['scan.mapper_count']).toBe(4);
      expect(result.profile['debug.max_hypothesis_rounds']).toBe(10);
    });

    test('user overrides merge with defaults', () => {
      const config = {
        depth: 'quick',
        depth_profiles: {
          quick: {
            'features.plan_checking': true  // override: keep plan-checking in quick mode
          }
        }
      };
      const result = resolveDepthProfile(config);
      expect(result.profile['features.plan_checking']).toBe(true);  // overridden
      expect(result.profile['features.research_phase']).toBe(false);  // still default
    });

    test('unknown depth falls back to standard', () => {
      const result = resolveDepthProfile({ depth: 'nonexistent' });
      expect(result.depth).toBe('nonexistent');
      expect(result.profile['features.research_phase']).toBe(true);  // standard default
    });

    test('config without depth field defaults to standard', () => {
      const result = resolveDepthProfile({});
      expect(result.depth).toBe('standard');
      expect(result.profile['scan.mapper_count']).toBe(4);
    });
  });

  describe('findRoadmapRow', () => {
    const lines = [
      '## Phase Overview',
      '| Phase | Name | Goal | Plans | Wave | Status |',
      '|-------|------|------|-------|------|--------|',
      '| 01 | Setup | Project scaffolding | 1 | 1 | verified |',
      '| 02 | Auth | Authentication system | 2 | 2 | planned |',
      '| 03 | API | REST API endpoints | 0 | 0 | pending |',
    ];

    test('finds phase 01 at correct row', () => {
      expect(findRoadmapRow(lines, '1')).toBe(3);
    });

    test('finds phase 02 at correct row', () => {
      expect(findRoadmapRow(lines, '2')).toBe(4);
    });

    test('returns -1 for nonexistent phase', () => {
      expect(findRoadmapRow(lines, '99')).toBe(-1);
    });

    test('handles already-padded input', () => {
      expect(findRoadmapRow(lines, '03')).toBe(5);
    });
  });

  describe('historyAppend and historyLoad', () => {
    let tmpDir;
    let origCwd;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-history-'));
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      origCwd = process.cwd();
      process.chdir(tmpDir);
    });

    afterEach(() => {
      process.chdir(origCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('historyAppend creates HISTORY.md with header on first call', () => {
      const dir = path.join(tmpDir, '.planning');
      const result = historyAppend({ type: 'phase', title: 'Phase 1 (Setup)', body: 'Verified. Basic scaffolding complete.' }, dir);
      expect(result.success).toBe(true);

      const content = fs.readFileSync(path.join(dir, 'HISTORY.md'), 'utf8');
      expect(content).toContain('# Project History');
      expect(content).toContain('## Phase: Phase 1 (Setup)');
      expect(content).toContain('Verified. Basic scaffolding complete.');
    });

    test('historyAppend appends to existing HISTORY.md without duplicating header', () => {
      const dir = path.join(tmpDir, '.planning');
      historyAppend({ type: 'phase', title: 'Phase 1', body: 'Done.' }, dir);
      historyAppend({ type: 'milestone', title: 'v1.0', body: 'Phases 1-4 complete.' }, dir);

      const content = fs.readFileSync(path.join(dir, 'HISTORY.md'), 'utf8');
      const headerCount = (content.match(/# Project History/g) || []).length;
      expect(headerCount).toBe(1);
      expect(content).toContain('## Phase: Phase 1');
      expect(content).toContain('## Milestone: v1.0');
    });

    test('historyAppend includes completion date', () => {
      const dir = path.join(tmpDir, '.planning');
      historyAppend({ type: 'phase', title: 'Phase 2', body: 'Auth done.' }, dir);

      const content = fs.readFileSync(path.join(dir, 'HISTORY.md'), 'utf8');
      const today = new Date().toISOString().slice(0, 10);
      expect(content).toContain(`_Completed: ${today}_`);
    });

    test('historyLoad returns null when HISTORY.md missing', () => {
      const result = historyLoad(path.join(tmpDir, '.planning'));
      expect(result).toBeNull();
    });

    test('historyLoad parses records from HISTORY.md', () => {
      const dir = path.join(tmpDir, '.planning');
      historyAppend({ type: 'phase', title: 'Phase 1 (Setup)', body: 'Scaffolding complete.' }, dir);
      historyAppend({ type: 'milestone', title: 'v1.0 Auth', body: 'Phases 1-4. All verified.' }, dir);

      const result = historyLoad(dir);
      expect(result).not.toBeNull();
      expect(result.records).toHaveLength(2);
      expect(result.records[0].type).toBe('phase');
      expect(result.records[0].title).toBe('Phase 1 (Setup)');
      expect(result.records[0].body).toContain('Scaffolding complete.');
      expect(result.records[1].type).toBe('milestone');
      expect(result.records[1].title).toBe('v1.0 Auth');
      expect(result.line_count).toBeGreaterThan(0);
    });
  });

  describe('VALID_STATUS_TRANSITIONS', () => {
    test('defines transitions for all known statuses', () => {
      const expectedStatuses = ['pending', 'planned', 'building', 'built', 'partial', 'verified', 'needs_fixes', 'skipped'];
      for (const status of expectedStatuses) {
        expect(VALID_STATUS_TRANSITIONS).toHaveProperty(status);
        expect(Array.isArray(VALID_STATUS_TRANSITIONS[status])).toBe(true);
        expect(VALID_STATUS_TRANSITIONS[status].length).toBeGreaterThan(0);
      }
    });

    test('pending can transition to planned and skipped', () => {
      expect(VALID_STATUS_TRANSITIONS.pending).toEqual(['planned', 'skipped']);
    });

    test('planned can transition to building', () => {
      expect(VALID_STATUS_TRANSITIONS.planned).toEqual(['building']);
    });

    test('building can transition to built, partial, or needs_fixes', () => {
      expect(VALID_STATUS_TRANSITIONS.building).toEqual(['built', 'partial', 'needs_fixes']);
    });

    test('built can transition to verified or needs_fixes', () => {
      expect(VALID_STATUS_TRANSITIONS.built).toEqual(['verified', 'needs_fixes']);
    });

    test('verified can transition to building (re-execution)', () => {
      expect(VALID_STATUS_TRANSITIONS.verified).toEqual(['building']);
    });

    test('needs_fixes can transition to planned or building', () => {
      expect(VALID_STATUS_TRANSITIONS.needs_fixes).toEqual(['planned', 'building']);
    });

    test('skipped can transition to pending (unskip)', () => {
      expect(VALID_STATUS_TRANSITIONS.skipped).toEqual(['pending']);
    });
  });

  describe('validateStatusTransition', () => {
    test('valid transition returns { valid: true }', () => {
      expect(validateStatusTransition('pending', 'planned')).toEqual({ valid: true });
      expect(validateStatusTransition('planned', 'building')).toEqual({ valid: true });
      expect(validateStatusTransition('building', 'built')).toEqual({ valid: true });
      expect(validateStatusTransition('built', 'verified')).toEqual({ valid: true });
      expect(validateStatusTransition('verified', 'building')).toEqual({ valid: true });
      expect(validateStatusTransition('needs_fixes', 'building')).toEqual({ valid: true });
      expect(validateStatusTransition('skipped', 'pending')).toEqual({ valid: true });
    });

    test('invalid transition returns { valid: false, warning }', () => {
      const result = validateStatusTransition('pending', 'verified');
      expect(result.valid).toBe(false);
      expect(result.warning).toContain('Suspicious status transition');
      expect(result.warning).toContain('"pending"');
      expect(result.warning).toContain('"verified"');
      expect(result.warning).toContain('planned, skipped');
    });

    test('pending -> built is invalid', () => {
      const result = validateStatusTransition('pending', 'built');
      expect(result.valid).toBe(false);
    });

    test('planned -> verified is invalid (skips building)', () => {
      const result = validateStatusTransition('planned', 'verified');
      expect(result.valid).toBe(false);
    });

    test('skipped -> building is invalid (must unskip first)', () => {
      const result = validateStatusTransition('skipped', 'building');
      expect(result.valid).toBe(false);
    });

    test('same status is always valid (no-op)', () => {
      expect(validateStatusTransition('building', 'building')).toEqual({ valid: true });
      expect(validateStatusTransition('pending', 'pending')).toEqual({ valid: true });
    });

    test('unknown old status is treated as valid (cannot validate)', () => {
      expect(validateStatusTransition('some_custom_status', 'building')).toEqual({ valid: true });
    });

    test('handles whitespace and case normalization', () => {
      expect(validateStatusTransition('  Pending ', ' Planned ')).toEqual({ valid: true });
      expect(validateStatusTransition('BUILDING', 'BUILT')).toEqual({ valid: true });
    });

    test('handles null/undefined old status gracefully', () => {
      expect(validateStatusTransition(null, 'planned')).toEqual({ valid: true });
      expect(validateStatusTransition(undefined, 'building')).toEqual({ valid: true });
    });

    test('handles null/undefined new status gracefully', () => {
      // empty string from null won't match any allowed transition from pending
      const result = validateStatusTransition('pending', null);
      expect(result.valid).toBe(false);
    });
  });

  describe('llm subcommands', () => {
    const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'pbr-tools.js');
    const { execFileSync } = require('child_process');
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-llm-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function runTool(args) {
      try {
        const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
          encoding: 'utf8',
          timeout: 10000,
          cwd: tmpDir,
        });
        return { status: 0, stdout, stderr: '' };
      } catch (e) {
        return { status: e.status || 1, stdout: e.stdout || '', stderr: e.stderr || '' };
      }
    }

    test('llm status returns JSON with enabled field', () => {
      const result = runTool(['llm', 'status']);
      expect(result.status).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('enabled');
      expect(json).toHaveProperty('model');
      expect(json).toHaveProperty('features');
    });

    test('llm classify exits with error when no args', () => {
      const result = runTool(['llm', 'classify']);
      expect(result.status).toBe(1);
      expect(result.stdout).toMatch(/Usage|fileType/i);
    });

    test('llm classify PLAN returns null result when LLM disabled', () => {
      // Write a minimal PLAN.md to tmp dir
      const tmpPlan = path.join(tmpDir, 'TEST-PLAN.md');
      fs.writeFileSync(tmpPlan, '---\nphase: test\n---\n# Test\n');
      const result = runTool(['llm', 'classify', 'PLAN', tmpPlan]);
      // Should exit 0 and return JSON (null classification when disabled)
      expect(result.status).toBe(0);
      const json = JSON.parse(result.stdout);
      // When LLM is disabled (default), classification is null
      expect(json).toHaveProperty('classification');
    });
  });

  describe('learnings subcommands', () => {
    const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'pbr-tools.js');
    const { execFileSync } = require('child_process');
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-learnings-cli-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function runTool(args, env = {}) {
      try {
        const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
          encoding: 'utf8',
          timeout: 10000,
          cwd: tmpDir,
          env: Object.assign({}, process.env, env),
        });
        return { status: 0, stdout, stderr: '' };
      } catch (e) {
        return { status: e.status || 1, stdout: e.stdout || '', stderr: e.stderr || '' };
      }
    }

    test('learnings query with no args returns JSON array (may be empty)', () => {
      const result = runTool(['learnings', 'query']);
      expect(result.status).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json)).toBe(true);
    });

    test('learnings query --tags estimation returns filtered results or empty array', () => {
      const result = runTool(['learnings', 'query', '--tags', 'estimation']);
      expect(result.status).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json)).toBe(true);
      // All returned entries must have the estimation tag
      for (const entry of json) {
        expect(entry.tags).toContain('estimation');
      }
    });

    test('learnings ingest with missing input file exits with non-zero', () => {
      const missingFile = path.join(tmpDir, 'nonexistent.json');
      const result = runTool(['learnings', 'ingest', missingFile]);
      expect(result.status).not.toBe(0);
    });

    test('learnings check-thresholds returns JSON array of triggered thresholds', () => {
      const result = runTool(['learnings', 'check-thresholds']);
      expect(result.status).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(Array.isArray(json)).toBe(true);
      // Each triggered threshold has key and trigger fields
      for (const item of json) {
        expect(item).toHaveProperty('key');
        expect(item).toHaveProperty('trigger');
      }
    });
  });

  describe('configClearCache', () => {
    test('resets cache so next configLoad reads fresh data', () => {
      const tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-cache1-'));
      const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-cache2-'));

      try {
        fs.writeFileSync(path.join(tmpDir1, 'config.json'), JSON.stringify({ version: 1, name: 'first' }));
        fs.writeFileSync(path.join(tmpDir2, 'config.json'), JSON.stringify({ version: 2, name: 'second' }));

        const result1 = configLoad(tmpDir1);
        expect(result1.name).toBe('first');

        configClearCache();

        const result2 = configLoad(tmpDir2);
        expect(result2.name).toBe('second');
      } finally {
        fs.rmSync(tmpDir1, { recursive: true, force: true });
        fs.rmSync(tmpDir2, { recursive: true, force: true });
      }
    });

    test('does not throw when called before any configLoad', () => {
      expect(() => configClearCache()).not.toThrow();
    });
  });
});


// ─── reference module tests ────────────────────────────────────────────────

const { listHeadings, extractSection, resolveReferencePath, referenceGet: referenceGetLib } = require('../plugins/pbr/scripts/lib/reference');

describe('referenceGet / lib/reference', () => {
  const PLUGIN_ROOT = path.join(__dirname, '..', 'plugins', 'pbr');

  // ── listHeadings ──────────────────────────────────────────────────────────

  test('listHeadings extracts H2 and H3 headings', () => {
    const content = [
      '# Title',
      '',
      '## Section One',
      'Some text.',
      '',
      '### Sub-section A',
      'Sub text.',
      '',
      '## Section Two',
      'More text.',
      '',
      '### Sub-section B',
      'More sub text.',
    ].join('\n');

    const headings = listHeadings(content);
    expect(headings.length).toBe(4);
    expect(headings[0]).toEqual({ level: 2, heading: 'Section One' });
    expect(headings[1]).toEqual({ level: 3, heading: 'Sub-section A' });
    expect(headings[2]).toEqual({ level: 2, heading: 'Section Two' });
    expect(headings[3]).toEqual({ level: 3, heading: 'Sub-section B' });
    const h1Items = headings.filter(h => h.level === 1);
    expect(h1Items.length).toBe(0);
  });

  // ── extractSection ────────────────────────────────────────────────────────

  test('extractSection with exact match', () => {
    const content = [
      '## YAML Frontmatter',
      '',
      'This is the YAML frontmatter section.',
      '',
      '## Next Section',
      'Different content.',
    ].join('\n');

    const result = extractSection(content, 'YAML Frontmatter');
    expect(result).not.toBeNull();
    expect(result.heading).toBe('YAML Frontmatter');
    expect(result.level).toBe(2);
    expect(result.content).toContain('YAML frontmatter section');
    expect(result.content).not.toContain('Different content');
    expect(result.char_count).toBeGreaterThan(0);
  });

  test('extractSection with fuzzy starts-with match', () => {
    const content = [
      '## YAML Frontmatter',
      '',
      'Description of YAML.',
      '',
      '## Other',
      'Other content.',
    ].join('\n');

    const result = extractSection(content, 'yaml');
    expect(result).not.toBeNull();
    expect(result.heading).toBe('YAML Frontmatter');
  });

  test('extractSection with contains match', () => {
    const content = [
      '## Contract: Researcher -> Synthesizer',
      '',
      'The researcher feeds the synthesizer.',
      '',
      '## Other Section',
      'Unrelated.',
    ].join('\n');

    const result = extractSection(content, 'Researcher');
    expect(result).not.toBeNull();
    expect(result.heading).toBe('Contract: Researcher -> Synthesizer');
    expect(result.content).toContain('researcher feeds the synthesizer');
  });

  test('extractSection with word-boundary match', () => {
    const content = [
      '## Rule 1: Bug Discovered',
      '',
      'Auto-fix immediately.',
      '',
      '## Rule 2: Missing Dependency',
      'Install it.',
    ].join('\n');

    const result = extractSection(content, 'rule 1');
    expect(result).not.toBeNull();
    expect(result.heading).toBe('Rule 1: Bug Discovered');
    expect(result.content).toContain('Auto-fix immediately');
    expect(result.content).not.toContain('Install it');
  });

  test('extractSection for H3 stops at next H3 or H2', () => {
    const content = [
      '## Parent Section',
      '',
      'Parent intro.',
      '',
      '### Child One',
      '',
      'First child content.',
      '',
      '### Child Two',
      '',
      'Second child content.',
      '',
      '## Another H2',
      'H2 content.',
    ].join('\n');

    const result = extractSection(content, 'Child One');
    expect(result).not.toBeNull();
    expect(result.heading).toBe('Child One');
    expect(result.level).toBe(3);
    expect(result.content).toContain('First child content');
    expect(result.content).not.toContain('Second child content');
    expect(result.content).not.toContain('H2 content');
  });

  test('extractSection for H2 includes nested H3s', () => {
    const content = [
      '## Parent Section',
      '',
      'Parent intro.',
      '',
      '### Child H3',
      '',
      'Child content here.',
      '',
      '## Next H2',
      'Different section.',
    ].join('\n');

    const result = extractSection(content, 'Parent Section');
    expect(result).not.toBeNull();
    expect(result.level).toBe(2);
    expect(result.content).toContain('Child H3');
    expect(result.content).toContain('Child content here');
    expect(result.content).not.toContain('Different section');
  });

  test('returns null when section not found', () => {
    const content = [
      '## Section One',
      'Content one.',
      '',
      '## Section Two',
      'Content two.',
    ].join('\n');

    const result = extractSection(content, 'Nonexistent Section XYZ');
    expect(result).toBeNull();
  });

  test('handles CRLF line endings', () => {
    const content = [
      '## CRLF Section',
      '',
      'Content with Windows line endings.',
      '',
      '## Next Section',
      'Other.',
    ].join('\r\n');

    const headings = listHeadings(content);
    expect(headings.length).toBe(2);
    expect(headings[0].heading).toBe('CRLF Section');
    expect(headings[0].heading).not.toMatch(/\r$/);

    const result = extractSection(content, 'CRLF Section');
    expect(result).not.toBeNull();
    expect(result.heading).toBe('CRLF Section');
    expect(result.content).toContain('Content with Windows line endings');
  });

  // ── resolveReferencePath ──────────────────────────────────────────────────

  test('resolveReferencePath lists available refs when name not found', () => {
    const result = resolveReferencePath('nonexistent-ref-xyz', PLUGIN_ROOT);
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('available');
    expect(Array.isArray(result.available)).toBe(true);
    expect(result.available).toContain('plan-format');
  });

  test('resolveReferencePath resolves known reference', () => {
    const result = resolveReferencePath('plan-format', PLUGIN_ROOT);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/plan-format\.md$/);
  });

  // ── referenceGet integration ──────────────────────────────────────────────

  test('referenceGet --list returns headings array', () => {
    const result = referenceGetLib('plan-format', { list: true }, PLUGIN_ROOT);
    expect(result).toHaveProperty('name', 'plan-format');
    expect(result).toHaveProperty('headings');
    expect(Array.isArray(result.headings)).toBe(true);
    expect(result.headings.length).toBeGreaterThan(0);
  });

  test('referenceGet --section extracts matching content', () => {
    const result = referenceGetLib('plan-format', { section: 'YAML Frontmatter' }, PLUGIN_ROOT);
    expect(result).toHaveProperty('name', 'plan-format');
    expect(result).toHaveProperty('heading', 'YAML Frontmatter');
    expect(result.content).toBeTruthy();
  });

  test('referenceGet returns error with available headings on missing section', () => {
    const result = referenceGetLib('plan-format', { section: 'Nonexistent XYZ Section' }, PLUGIN_ROOT);
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('available');
    expect(Array.isArray(result.available)).toBe(true);
  });
});

// ─── milestoneStats tests ────────────────────────────────────────────────────
// Uses PBR_PROJECT_ROOT + configClearCache() to redirect module-level planningDir

const { milestoneStats } = require('../plugins/pbr/scripts/pbr-tools');

describe('milestoneStats', () => {
  let tmpDir;
  let origRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-milestone-stats-'));
    origRoot = process.env.PBR_PROJECT_ROOT;
    process.env.PBR_PROJECT_ROOT = tmpDir;
    configClearCache();
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning', 'milestones'), { recursive: true });
  });

  afterEach(() => {
    if (origRoot !== undefined) {
      process.env.PBR_PROJECT_ROOT = origRoot;
    } else {
      delete process.env.PBR_PROJECT_ROOT;
    }
    configClearCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSummary(dir, filename, frontmatter, body) {
    fs.mkdirSync(dir, { recursive: true });
    const fm = Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('\n');
    const content = `---\n${fm}\n---\n\n${body || ''}`;
    fs.writeFileSync(path.join(dir, filename), content, 'utf8');
  }

  function writeRoadmap(content) {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), content, 'utf8');
  }

  test('extracts frontmatter from active phases', () => {
    writeRoadmap('## Milestone: Test Milestone (v1.0)\n\n### Phase 1: first-phase\n**Goal:** test\n\n### Phase 2: second-phase\n**Goal:** test\n');
    const phase1Dir = path.join(tmpDir, '.planning', 'phases', '01-first-phase');
    const phase2Dir = path.join(tmpDir, '.planning', 'phases', '02-second-phase');
    writeSummary(phase1Dir, 'SUMMARY-01.md', { plan: '01', status: 'complete', provides: ['feature-a'], key_files: ['src/a.js'] }, 'Body text that should not appear.');
    writeSummary(phase2Dir, 'SUMMARY-01.md', { plan: '01', status: 'complete', provides: ['feature-b'], key_files: ['src/b.js'] }, 'Another body.');

    const result = milestoneStats('1.0');
    expect(result.version).toBe('1.0');
    expect(result.phase_count).toBe(2);
    expect(result.phases[0].number).toBe('01');
    expect(result.phases[0].summaries[0].provides).toEqual(['feature-a']);
    expect(result.phases[1].number).toBe('02');
    expect(result.phases[1].summaries[0].provides).toEqual(['feature-b']);
  });

  test('reads from milestone archive if phases are archived', () => {
    const archiveDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', '01-test');
    writeSummary(archiveDir, 'SUMMARY-01.md', { plan: '01', status: 'complete', provides: ['archived-feature'], key_files: ['src/archived.js'] }, 'Body should be ignored.');

    const result = milestoneStats('1.0');
    expect(result.version).toBe('1.0');
    expect(result.phase_count).toBe(1);
    expect(result.phases[0].name).toBe('test');
    expect(result.phases[0].summaries[0].provides).toEqual(['archived-feature']);
    expect(result.phases[0].summaries[0].key_files).toEqual(['src/archived.js']);
  });

  test('aggregated fields are deduplicated', () => {
    writeRoadmap('## Milestone: Dedup Test (v2.0)\n\n### Phase 1: phase-a\n### Phase 2: phase-b\n');
    const phase1Dir = path.join(tmpDir, '.planning', 'phases', '01-phase-a');
    const phase2Dir = path.join(tmpDir, '.planning', 'phases', '02-phase-b');
    writeSummary(phase1Dir, 'SUMMARY-01.md', { plan: '01', status: 'complete', provides: ['shared-feature', 'unique-a'], key_files: ['src/shared.js'] }, '');
    writeSummary(phase2Dir, 'SUMMARY-01.md', { plan: '01', status: 'complete', provides: ['shared-feature', 'unique-b'], key_files: ['src/shared.js', 'src/extra.js'] }, '');

    const result = milestoneStats('2.0');
    expect(result.aggregated.all_provides).toContain('shared-feature');
    expect(result.aggregated.all_provides).toContain('unique-a');
    expect(result.aggregated.all_provides).toContain('unique-b');
    expect(result.aggregated.all_provides.filter(v => v === 'shared-feature').length).toBe(1);
    expect(result.aggregated.all_key_files.filter(f => f === 'src/shared.js').length).toBe(1);
  });

  test('handles milestone with no matching phases', () => {
    writeRoadmap('## Milestone: Other Milestone (v9.0)\n\n### Phase 99: nonexistent\n');

    const result = milestoneStats('9.0');
    expect(result.version).toBe('9.0');
    expect(result.phase_count).toBe(0);
    expect(result.phases).toEqual([]);
    expect(result.aggregated.all_provides).toEqual([]);
    expect(result.aggregated.total_metrics.tasks_completed).toBe(0);
  });

  test('never includes SUMMARY body content in output', () => {
    const archiveDir = path.join(tmpDir, '.planning', 'milestones', 'v3.0', 'phases', '01-body-test');
    const longBody = 'This is a long body section with lots of content. '.repeat(50);
    writeSummary(archiveDir, 'SUMMARY-01.md', { plan: '01', status: 'complete', provides: ['something'] }, longBody);

    const result = milestoneStats('3.0');
    const jsonOutput = JSON.stringify(result);
    expect(jsonOutput).not.toContain('This is a long body section');
    expect(result.phases[0].summaries[0].provides).toEqual(['something']);
  });
});

// --- stateBundle / initStateBundle tests ---

const { initStateBundle } = require('../plugins/pbr/scripts/pbr-tools');
const { contextTriage: contextTriageLib } = require('../plugins/pbr/scripts/lib/context');

const BUNDLE_STATE_FM = [
  '---', 'version: 2', 'current_phase: 3', 'total_phases: 5',
  'phase_slug: auth', 'status: executing', 'progress_percent: 40',
  'plans_total: 2', 'plans_complete: 1', 'last_activity: 2026-02-20',
  'last_command: /pbr:build 3', 'blockers: []', '---',
  '# Project State', '', '## Current Position',
  'Phase: 3 of 5 -- Auth', 'Status: executing', 'Progress: 40%',
].join('\n');

const BUNDLE_CONFIG_JSON = JSON.stringify({
  version: 1, depth: 'standard', mode: 'interactive',
  models: { executor: 'sonnet', verifier: 'sonnet', planner: 'sonnet' },
  features: {}, planning: {}, gates: {}, parallelization: { enabled: false },
});

const BUNDLE_PLAN_MD = [
  '---', 'plan: 01', 'wave: 1', 'autonomous: false',
  'type: implementation', 'depends_on: []', 'must_haves:',
  '  truths:', '    - Item A',
  '  artifacts:', '    - src/foo.ts', '  key_links: []',
  '---', '# Plan 01',
].join('\n');

const BUNDLE_SUMMARY_MD = [
  '---', 'phase: 2', 'plan: setup-01', 'status: complete',
  'provides:', '  - base project structure',
  'requires: []', 'key_files:', '  - src/index.js', 'deferred: []',
  '---', '# Summary', 'Done.',
].join('\n');

function buildBundleFixture(tmpDir, opts) {
  opts = opts || {};
  const planningDir = path.join(tmpDir, '.planning');
  const phaseDir = path.join(planningDir, 'phases', '03-auth');
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), BUNDLE_STATE_FM);
  fs.writeFileSync(path.join(planningDir, 'config.json'), BUNDLE_CONFIG_JSON);
  if (!opts.skipPlan) {
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), BUNDLE_PLAN_MD);
  }
  if (opts.summaryCount) {
    for (let i = 1; i <= opts.summaryCount; i++) {
      const pd = String(i).padStart(2, '0') + '-phase' + i;
      const pdPath = path.join(planningDir, 'phases', pd);
      fs.mkdirSync(pdPath, { recursive: true });
      const sm = ['---', 'phase: ' + i, 'plan: p0' + i, 'status: complete',
        'provides:', '  - item' + i, 'requires: []',
        'key_files:', '  - src/f' + i + '.ts', 'deferred: []', '---', '# S'].join('\n');
      fs.writeFileSync(path.join(pdPath, 'SUMMARY-0' + i + '.md'), sm);
    }
  }
  if (opts.withSummary) {
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-03.md'), BUNDLE_SUMMARY_MD);
  }
}

describe('stateBundle / initStateBundle', () => {
  let bundleTmpDir;
  let bundleOrigCwd;
  let bundleOrigRoot;

  beforeEach(() => {
    bundleTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-bundle-test-'));
    bundleOrigCwd = process.cwd();
    bundleOrigRoot = process.env.PBR_PROJECT_ROOT;
    process.chdir(bundleTmpDir);
    delete process.env.PBR_PROJECT_ROOT;
    configClearCache();
  });

  afterEach(() => {
    process.chdir(bundleOrigCwd);
    if (bundleOrigRoot !== undefined) {
      process.env.PBR_PROJECT_ROOT = bundleOrigRoot;
    } else {
      delete process.env.PBR_PROJECT_ROOT;
    }
    fs.rmSync(bundleTmpDir, { recursive: true, force: true });
    configClearCache();
  });

  test('returns complete state bundle for existing phase', () => {
    buildBundleFixture(bundleTmpDir);
    const result = initStateBundle('3');
    expect(result.error).toBeUndefined();
    expect(result).toHaveProperty('state');
    expect(result).toHaveProperty('config_summary');
    expect(result).toHaveProperty('phase');
    expect(result).toHaveProperty('plans');
    expect(result).toHaveProperty('waves');
    expect(result).toHaveProperty('prior_summaries');
    expect(result).toHaveProperty('git');
    expect(result).toHaveProperty('has_project_context');
    expect(result).toHaveProperty('has_phase_context');
    expect(result.state).toHaveProperty('current_phase');
    expect(result.state).toHaveProperty('status');
    expect(result.state).toHaveProperty('progress');
    expect(result.state).toHaveProperty('total_phases');
    expect(result.state).toHaveProperty('last_activity');
    expect(result.state).toHaveProperty('blockers');
    expect(result.config_summary).toHaveProperty('depth');
    expect(result.config_summary).toHaveProperty('mode');
    expect(result.config_summary).toHaveProperty('models');
    expect(result.phase.num).toBe('3');
    expect(result.phase.dir).toBe('03-auth');
    expect(result.git).toHaveProperty('branch');
    expect(result.git).toHaveProperty('clean');
  });

  test('prior_summaries contains only frontmatter fields', () => {
    buildBundleFixture(bundleTmpDir, { withSummary: true });
    const result = initStateBundle('3');
    for (const entry of result.prior_summaries) {
      const keys = Object.keys(entry);
      const allowed = ['phase', 'plan', 'status', 'provides', 'requires', 'key_files', 'key_decisions'];
      for (const k of keys) {
        expect(allowed).toContain(k);
      }
      expect(JSON.stringify(entry)).not.toContain('Done.');
      expect(JSON.stringify(entry)).not.toContain('# Summary');
    }
  });

  test('prior_summaries capped at 10', () => {
    buildBundleFixture(bundleTmpDir, { summaryCount: 12 });
    const result = initStateBundle('3');
    expect(result.prior_summaries.length).toBeLessThanOrEqual(10);
  });

  test('handles missing phase gracefully', () => {
    buildBundleFixture(bundleTmpDir);
    const result = initStateBundle('99');
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
  });

  test('handles empty .planning/ directory', () => {
    const result = initStateBundle('3');
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/No .planning/);
  });

  test('config_summary includes resolved depth profile', () => {
    buildBundleFixture(bundleTmpDir);
    const result = initStateBundle('3');
    expect(result.config_summary).toHaveProperty('depth');
    expect(result.config_summary.depth).toBe('standard');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// contextTriage / lib/context
// ─────────────────────────────────────────────────────────────────────────────

describe('contextTriage', () => {
  let tmpDir;
  let origRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-context-triage-'));
    origRoot = process.env.PBR_PROJECT_ROOT;
    process.env.PBR_PROJECT_ROOT = tmpDir;
    // Create .planning/ dir
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    if (origRoot !== undefined) {
      process.env.PBR_PROJECT_ROOT = origRoot;
    } else {
      delete process.env.PBR_PROJECT_ROOT;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeBridge(planningDir, data, mtime) {
    const bridgePath = path.join(planningDir, '.context-budget.json');
    fs.writeFileSync(bridgePath, JSON.stringify(data), 'utf8');
    if (mtime) {
      fs.utimesSync(bridgePath, mtime / 1000, mtime / 1000);
    }
  }

  function writeTracker(planningDir, data) {
    fs.writeFileSync(path.join(planningDir, '.context-tracker'), JSON.stringify(data), 'utf8');
  }

  test('returns PROCEED when bridge shows low percentage', () => {
    const planningDir = path.join(tmpDir, '.planning');
    writeBridge(planningDir, { percentage: 30, tier: 'PEAK', timestamp: new Date().toISOString() });
    const result = contextTriageLib({}, planningDir);
    expect(result.recommendation).toBe('PROCEED');
    expect(result.data_source).toBe('bridge');
    expect(result.percentage).toBe(30);
  });

  test('returns CHECKPOINT when bridge shows 50-70%', () => {
    const planningDir = path.join(tmpDir, '.planning');
    writeBridge(planningDir, { percentage: 60, tier: 'DEGRADING', timestamp: new Date().toISOString() });
    const result = contextTriageLib({}, planningDir);
    expect(result.recommendation).toBe('CHECKPOINT');
    expect(result.data_source).toBe('bridge');
  });

  test('returns COMPACT when bridge shows >70%', () => {
    const planningDir = path.join(tmpDir, '.planning');
    writeBridge(planningDir, { percentage: 80, tier: 'POOR', timestamp: new Date().toISOString() });
    const result = contextTriageLib({}, planningDir);
    expect(result.recommendation).toBe('COMPACT');
    expect(result.data_source).toBe('bridge');
  });

  test('falls back to heuristic when bridge is missing', () => {
    const planningDir = path.join(tmpDir, '.planning');
    writeTracker(planningDir, { total_chars: 15000, unique_files: 3, reads: 5 });
    const result = contextTriageLib({}, planningDir);
    expect(result.recommendation).toBe('PROCEED');
    expect(result.data_source).toBe('heuristic');
  });

  test('falls back to heuristic when bridge is stale', () => {
    const planningDir = path.join(tmpDir, '.planning');
    // Set mtime to 120 seconds ago
    const staleMtime = Date.now() - 120 * 1000;
    writeBridge(planningDir, { percentage: 40, tier: 'GOOD', timestamp: new Date(staleMtime).toISOString() }, staleMtime);
    writeTracker(planningDir, { total_chars: 20000, unique_files: 4, reads: 6 });
    const result = contextTriageLib({}, planningDir);
    expect(result.data_source).toBe('stale_bridge');
    // Stale bridge with 20k chars → PROCEED
    expect(result.recommendation).toBe('PROCEED');
  });

  test('relaxes threshold near completion', () => {
    const planningDir = path.join(tmpDir, '.planning');
    // 55% would normally give CHECKPOINT, but agentsDone/plansTotal > 0.8 relaxes to PROCEED
    // Use 5/6 = 0.833 which is strictly > 0.8
    writeBridge(planningDir, { percentage: 55, tier: 'DEGRADING', timestamp: new Date().toISOString() });
    const result = contextTriageLib({ agentsDone: 5, plansTotal: 6 }, planningDir);
    expect(result.recommendation).toBe('PROCEED');
    expect(result.reason).toMatch(/Near completion/);
  });

  test('always PROCEED during cleanup step', () => {
    const planningDir = path.join(tmpDir, '.planning');
    // 75% would normally give COMPACT, but finalize step overrides
    writeBridge(planningDir, { percentage: 75, tier: 'POOR', timestamp: new Date().toISOString() });
    const result = contextTriageLib({ currentStep: 'finalize' }, planningDir);
    expect(result.recommendation).toBe('PROCEED');
    expect(result.reason).toMatch(/Cleanup\/finalize/);
  });

  test('handles completely empty .planning/ directory', () => {
    // No bridge, no tracker
    const planningDir = path.join(tmpDir, '.planning');
    const result = contextTriageLib({}, planningDir);
    expect(result.recommendation).toBe('PROCEED');
    expect(result.data_source).toBe('heuristic');
  });

  test('reason field includes human-readable explanation with percentage and tier', () => {
    const planningDir = path.join(tmpDir, '.planning');
    writeBridge(planningDir, { percentage: 42, tier: 'GOOD', timestamp: new Date().toISOString() });
    const result = contextTriageLib({}, planningDir);
    expect(result.reason).toContain('42%');
    expect(result.reason).toContain('GOOD');
  });
});

// ============================================================
// Build helpers (lib/build.js) — tests written RED-first (TDD)
// ============================================================

describe('build helpers', () => {
  const {
    stalenessCheck,
    summaryGate,
    checkpointInit,
    checkpointUpdate,
    seedsMatch
  } = require('../plugins/pbr/scripts/lib/build');

  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-build-'));
    fs.mkdirSync(path.join(tmpDir, 'phases'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── summaryGate ──────────────────────────────────────────

  describe('summaryGate', () => {
    test('returns gate:"exists" when SUMMARY file does not exist', () => {
      const planningDir = tmpDir;
      fs.mkdirSync(path.join(tmpDir, 'phases', '01-test'), { recursive: true });
      const result = summaryGate('01-test', '01-01', planningDir);
      expect(result.ok).toBe(false);
      expect(result.gate).toBe('exists');
    });

    test('returns gate:"nonempty" when SUMMARY file is empty', () => {
      const planningDir = tmpDir;
      const phaseDir = path.join(tmpDir, 'phases', '01-test');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), '');
      const result = summaryGate('01-test', '01-01', planningDir);
      expect(result.ok).toBe(false);
      expect(result.gate).toBe('nonempty');
    });

    test('returns gate:"valid-frontmatter" when SUMMARY has content but no frontmatter', () => {
      const planningDir = tmpDir;
      const phaseDir = path.join(tmpDir, 'phases', '01-test');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), '# Just a heading\n\nNo frontmatter here.');
      const result = summaryGate('01-test', '01-01', planningDir);
      expect(result.ok).toBe(false);
      expect(result.gate).toBe('valid-frontmatter');
    });

    test('returns ok:true when SUMMARY has valid frontmatter with status', () => {
      const planningDir = tmpDir;
      const phaseDir = path.join(tmpDir, 'phases', '01-test');
      fs.mkdirSync(phaseDir, { recursive: true });
      const content = '---\nplan: "01-01"\nstatus: complete\n---\n\n## Task Results\n';
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01-01.md'), content);
      const result = summaryGate('01-test', '01-01', planningDir);
      expect(result.ok).toBe(true);
      expect(result.gate).toBeNull();
    });
  });

  // ── checkpointInit ───────────────────────────────────────

  describe('checkpointInit', () => {
    test('creates .checkpoint-manifest.json with correct structure', () => {
      const planningDir = tmpDir;
      const phaseDir = path.join(tmpDir, 'phases', '02-alpha');
      fs.mkdirSync(phaseDir, { recursive: true });
      const result = checkpointInit('02-alpha', '02-01,02-02', planningDir);
      expect(result.ok).toBe(true);
      expect(result.path).toContain('.checkpoint-manifest.json');

      const manifest = JSON.parse(fs.readFileSync(path.join(phaseDir, '.checkpoint-manifest.json'), 'utf8'));
      expect(manifest.plans).toEqual(['02-01', '02-02']);
      expect(manifest.checkpoints_resolved).toEqual([]);
      expect(manifest.checkpoints_pending).toEqual([]);
      expect(manifest.wave).toBe(1);
      expect(manifest.deferred).toEqual([]);
      expect(manifest.commit_log).toEqual([]);
      expect(manifest.last_good_commit).toBeNull();
    });

    test('accepts an array of plan IDs', () => {
      const planningDir = tmpDir;
      const phaseDir = path.join(tmpDir, 'phases', '02-beta');
      fs.mkdirSync(phaseDir, { recursive: true });
      const result = checkpointInit('02-beta', ['02-01', '02-03'], planningDir);
      expect(result.ok).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(path.join(phaseDir, '.checkpoint-manifest.json'), 'utf8'));
      expect(manifest.plans).toEqual(['02-01', '02-03']);
    });

    test('handles empty plans string', () => {
      const planningDir = tmpDir;
      const phaseDir = path.join(tmpDir, 'phases', '03-empty');
      fs.mkdirSync(phaseDir, { recursive: true });
      const result = checkpointInit('03-empty', '', planningDir);
      expect(result.ok).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(path.join(phaseDir, '.checkpoint-manifest.json'), 'utf8'));
      expect(manifest.plans).toEqual([]);
    });
  });

  // ── checkpointUpdate ─────────────────────────────────────

  describe('checkpointUpdate', () => {
    test('moves resolved plan from plans to checkpoints_resolved', () => {
      const planningDir = tmpDir;
      const phaseDir = path.join(tmpDir, 'phases', '04-update');
      fs.mkdirSync(phaseDir, { recursive: true });
      checkpointInit('04-update', '04-01,04-02', planningDir);

      const result = checkpointUpdate('04-update', { wave: 1, resolved: '04-01', sha: 'abc1234' }, planningDir);
      expect(result.ok).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(path.join(phaseDir, '.checkpoint-manifest.json'), 'utf8'));
      expect(manifest.plans).toEqual(['04-02']);
      expect(manifest.checkpoints_resolved).toContain('04-01');
    });

    test('advances wave counter', () => {
      const planningDir = tmpDir;
      const phaseDir = path.join(tmpDir, 'phases', '04-wave');
      fs.mkdirSync(phaseDir, { recursive: true });
      checkpointInit('04-wave', '04-01', planningDir);
      checkpointUpdate('04-wave', { wave: 2, resolved: '04-01', sha: '' }, planningDir);

      const manifest = JSON.parse(fs.readFileSync(path.join(phaseDir, '.checkpoint-manifest.json'), 'utf8'));
      expect(manifest.wave).toBe(2);
    });

    test('appends to commit_log and updates last_good_commit when sha provided', () => {
      const planningDir = tmpDir;
      const phaseDir = path.join(tmpDir, 'phases', '04-log');
      fs.mkdirSync(phaseDir, { recursive: true });
      checkpointInit('04-log', '04-01', planningDir);
      checkpointUpdate('04-log', { wave: 1, resolved: '04-01', sha: 'deadbeef' }, planningDir);

      const manifest = JSON.parse(fs.readFileSync(path.join(phaseDir, '.checkpoint-manifest.json'), 'utf8'));
      expect(manifest.commit_log.length).toBe(1);
      expect(manifest.commit_log[0].sha).toBe('deadbeef');
      expect(manifest.last_good_commit).toBe('deadbeef');
    });

    test('returns error when manifest does not exist', () => {
      const planningDir = tmpDir;
      fs.mkdirSync(path.join(tmpDir, 'phases', '05-nofile'), { recursive: true });
      const result = checkpointUpdate('05-nofile', { wave: 1, resolved: '05-01', sha: '' }, planningDir);
      expect(result.error).toBeTruthy();
    });
  });

  // ── seedsMatch ───────────────────────────────────────────

  describe('seedsMatch', () => {
    test('returns matched:[] when seeds directory does not exist', () => {
      const planningDir = tmpDir;
      const result = seedsMatch('03-auth', '3', planningDir);
      expect(result.matched).toEqual([]);
    });

    test('returns matched:[] when no seeds match', () => {
      const planningDir = tmpDir;
      const seedsDir = path.join(tmpDir, 'seeds');
      fs.mkdirSync(seedsDir, { recursive: true });
      fs.writeFileSync(path.join(seedsDir, 'other.md'), '---\nname: Other\ntrigger: unrelated\ndescription: Some seed\n---\n');
      const result = seedsMatch('03-auth', '3', planningDir);
      expect(result.matched).toEqual([]);
    });

    test('matches on exact slug', () => {
      const planningDir = tmpDir;
      const seedsDir = path.join(tmpDir, 'seeds');
      fs.mkdirSync(seedsDir, { recursive: true });
      fs.writeFileSync(path.join(seedsDir, 'auth-seed.md'), '---\nname: Auth Seed\ntrigger: 03-auth\ndescription: Auth patterns\n---\n');
      const result = seedsMatch('03-auth', '3', planningDir);
      expect(result.matched.length).toBe(1);
      expect(result.matched[0].name).toBe('Auth Seed');
    });

    test('matches on wildcard trigger "*"', () => {
      const planningDir = tmpDir;
      const seedsDir = path.join(tmpDir, 'seeds');
      fs.mkdirSync(seedsDir, { recursive: true });
      fs.writeFileSync(path.join(seedsDir, 'global.md'), '---\nname: Global Seed\ntrigger: "*"\ndescription: Always matches\n---\n');
      const result = seedsMatch('05-deploy', '5', planningDir);
      expect(result.matched.length).toBe(1);
      expect(result.matched[0].trigger).toBe('*');
    });

    test('matches on phase number string', () => {
      const planningDir = tmpDir;
      const seedsDir = path.join(tmpDir, 'seeds');
      fs.mkdirSync(seedsDir, { recursive: true });
      fs.writeFileSync(path.join(seedsDir, 'num-seed.md'), '---\nname: Num Seed\ntrigger: "7"\ndescription: Phase 7 seed\n---\n');
      const result = seedsMatch('07-deploy', '7', planningDir);
      expect(result.matched.length).toBe(1);
    });
  });

  // ── stalenessCheck ───────────────────────────────────────

  describe('stalenessCheck', () => {
    test('returns error when phase directory does not exist', () => {
      const planningDir = tmpDir;
      const result = stalenessCheck('99-nonexistent', planningDir);
      expect(result.error).toBeTruthy();
    });

    test('returns stale:false when phase has no plans', () => {
      const planningDir = tmpDir;
      fs.mkdirSync(path.join(tmpDir, 'phases', '01-empty'), { recursive: true });
      const result = stalenessCheck('01-empty', planningDir);
      expect(result.stale).toBe(false);
      expect(result.plans).toEqual([]);
    });

    test('returns stale:false for plan with no dependencies', () => {
      const planningDir = tmpDir;
      const phaseDir = path.join(tmpDir, 'phases', '02-nodeps');
      fs.mkdirSync(phaseDir, { recursive: true });
      // Plan with empty depends_on
      const planContent = '---\nplan: "02-01"\ndepends_on: []\n---\n# Plan\n';
      fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), planContent);
      const result = stalenessCheck('02-nodeps', planningDir);
      expect(result.stale).toBe(false);
    });
  });

  // ── summaryGate edge cases ───────────────────────────────

  describe('summaryGate edge cases', () => {
    test('returns gate:"valid-frontmatter" when file has dashes but no status field', () => {
      const planningDir = tmpDir;
      const phaseDir = path.join(tmpDir, 'phases', '06-test');
      fs.mkdirSync(phaseDir, { recursive: true });
      // Has --- but no status: field
      const content = '---\nplan: "06-01"\n---\n\n## Task Results\n';
      fs.writeFileSync(path.join(phaseDir, 'SUMMARY-06-01.md'), content);
      const result = summaryGate('06-test', '06-01', planningDir);
      expect(result.ok).toBe(false);
      expect(result.gate).toBe('valid-frontmatter');
    });
  });

  // ── seedsMatch edge cases ────────────────────────────────

  describe('seedsMatch edge cases', () => {
    test('matches on trigger substring of phase slug', () => {
      const planningDir = tmpDir;
      const seedsDir = path.join(tmpDir, 'seeds');
      fs.mkdirSync(seedsDir, { recursive: true });
      // trigger "auth" is substring of "03-authentication"
      fs.writeFileSync(path.join(seedsDir, 'partial.md'), '---\nname: Partial Match\ntrigger: auth\ndescription: Auth patterns\n---\n');
      const result = seedsMatch('03-authentication', '3', planningDir);
      expect(result.matched.length).toBe(1);
      expect(result.matched[0].name).toBe('Partial Match');
    });

    test('skips seed file with no frontmatter', () => {
      const planningDir = tmpDir;
      const seedsDir = path.join(tmpDir, 'seeds');
      fs.mkdirSync(seedsDir, { recursive: true });
      fs.writeFileSync(path.join(seedsDir, 'no-fm.md'), '# Just a heading\nNo frontmatter here.');
      const result = seedsMatch('03-auth', '3', planningDir);
      expect(result.matched).toEqual([]);
    });

    test('skips seed file with no trigger field', () => {
      const planningDir = tmpDir;
      const seedsDir = path.join(tmpDir, 'seeds');
      fs.mkdirSync(seedsDir, { recursive: true });
      fs.writeFileSync(path.join(seedsDir, 'no-trigger.md'), '---\nname: No Trigger\ndescription: Missing trigger\n---\n');
      const result = seedsMatch('03-auth', '3', planningDir);
      expect(result.matched).toEqual([]);
    });
  });

  // ── checkpointInit edge cases ────────────────────────────

  describe('checkpointInit edge cases', () => {
    test('returns error when phase directory does not exist', () => {
      const planningDir = tmpDir;
      // Do NOT create the directory
      const result = checkpointInit('99-missing', '99-01', planningDir);
      expect(result.error).toBeTruthy();
    });
  });
});
