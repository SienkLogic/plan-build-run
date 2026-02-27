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
