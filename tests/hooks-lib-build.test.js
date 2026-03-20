/**
 * Tests for hooks/lib/build.js — Build helper functions.
 *
 * Covers all 7 exported functions: stalenessCheck, summaryGate,
 * checkpointInit, checkpointUpdate, seedsMatch, ciPoll, rollback.
 */

jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const {
  stalenessCheck,
  summaryGate,
  checkpointInit,
  checkpointUpdate,
  seedsMatch,
  ciPoll,
  rollback
} = require('../plugins/pbr/scripts/lib/build');

let tmpDir, planningDir;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning('pbr-build-test-'));
  execSync.mockReset();
});

afterEach(() => {
  cleanupTmp(tmpDir);
});

// ---------------------------------------------------------------------------
// stalenessCheck
// ---------------------------------------------------------------------------

describe('stalenessCheck', () => {
  test('returns error when phase not found', () => {
    const result = stalenessCheck('nonexistent-phase', planningDir);
    expect(result).toEqual({ error: expect.stringContaining('Phase not found') });
  });

  test('returns not stale with empty plans array when no PLAN files', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'), { recursive: true });
    const result = stalenessCheck('01-setup', planningDir);
    expect(result).toEqual({ stale: false, plans: [] });
  });

  test('returns not stale when plan has no depends_on', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), [
      '---',
      'plan: "01-01"',
      'depends_on: []',
      '---',
      'Content here'
    ].join('\n'));
    const result = stalenessCheck('01-setup', planningDir);
    expect(result.stale).toBe(false);
    expect(result.plans[0].reason).toBe('no dependencies');
  });

  test('returns stale when dependency SUMMARY is newer (timestamp mode)', () => {
    // Create dependency phase with a SUMMARY
    const depDir = path.join(planningDir, 'phases', '01-dep');
    fs.mkdirSync(depDir, { recursive: true });
    fs.writeFileSync(path.join(depDir, 'SUMMARY-01.md'), 'dep summary');

    // Create current phase with a PLAN that depends on 01
    const phaseDir = path.join(planningDir, 'phases', '02-current');
    fs.mkdirSync(phaseDir, { recursive: true });
    const planPath = path.join(phaseDir, 'PLAN-01.md');
    fs.writeFileSync(planPath, [
      '---',
      'plan: "02-01"',
      'depends_on: ["01-01"]',
      '---',
      'Content'
    ].join('\n'));

    // Set plan mtime to past, dep SUMMARY to future
    const past = new Date(2020, 0, 1);
    fs.utimesSync(planPath, past, past);

    const result = stalenessCheck('02-current', planningDir);
    expect(result.stale).toBe(true);
    expect(result.plans[0].reason).toMatch(/modified after planning/);
  });

  test('returns not stale when dependency_fingerprints size matches', () => {
    const phaseDir = path.join(planningDir, 'phases', '03-fp');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Create a file to fingerprint — path relative to project root (pd/..)
    // The code resolves: path.join(pd, '..', entry.filePath)
    const targetPath = path.join(tmpDir, '.planning', 'phases', '01-dep', 'SUMMARY-01.md');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, 'exact content');
    const stat = fs.statSync(targetPath);

    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), [
      '---',
      'plan: "03-01"',
      'dependency_fingerprints:',
      `  - path: .planning/phases/01-dep/SUMMARY-01.md`,
      `    size: ${stat.size}`,
      `    mtime: ${Math.round(stat.mtimeMs)}`,
      '---',
      'Content'
    ].join('\n'));

    const result = stalenessCheck('03-fp', planningDir);
    expect(result.stale).toBe(false);
    expect(result.plans[0].reason).toBe('fingerprints match');
  });

  test('returns stale when dependency_fingerprints size differs', () => {
    const phaseDir = path.join(planningDir, 'phases', '04-fp');
    fs.mkdirSync(phaseDir, { recursive: true });

    const targetPath = path.join(tmpDir, '.planning', 'phases', '01-dep2', 'SUMMARY-01.md');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, 'some content here');

    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), [
      '---',
      'plan: "04-01"',
      'dependency_fingerprints:',
      `  - path: .planning/phases/01-dep2/SUMMARY-01.md`,
      `    size: 999`,
      `    mtime: 0`,
      '---',
      'Content'
    ].join('\n'));

    const result = stalenessCheck('04-fp', planningDir);
    expect(result.stale).toBe(true);
    expect(result.plans[0].reason).toMatch(/changed/);
  });

  test('returns stale when fingerprinted dependency file is missing', () => {
    const phaseDir = path.join(planningDir, 'phases', '05-fp');
    fs.mkdirSync(phaseDir, { recursive: true });

    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), [
      '---',
      'plan: "05-01"',
      'dependency_fingerprints:',
      '  - path: phases/nonexistent/SUMMARY.md',
      '    size: 100',
      '    mtime: 12345',
      '---',
      'Content'
    ].join('\n'));

    const result = stalenessCheck('05-fp', planningDir);
    expect(result.stale).toBe(true);
    expect(result.plans[0].reason).toMatch(/not found/);
  });

  test('handles unreadable plan file gracefully', () => {
    const phaseDir = path.join(planningDir, 'phases', '06-unreadable');
    fs.mkdirSync(phaseDir, { recursive: true });
    // Create a subdirectory with the same name pattern as a PLAN file
    // to cause readFileSync to fail
    const planPath = path.join(phaseDir, 'PLAN-01.md');
    fs.mkdirSync(planPath); // directory, not file

    const result = stalenessCheck('06-unreadable', planningDir);
    expect(result.plans[0].reason).toBe('unreadable');
  });

  test('extracts plan_id from filename when frontmatter has no plan field', () => {
    const phaseDir = path.join(planningDir, 'phases', '07-noid');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), [
      '---',
      'depends_on: []',
      '---',
      'No plan field in frontmatter'
    ].join('\n'));

    const result = stalenessCheck('07-noid', planningDir);
    expect(result.plans[0].id).toBe('PLAN-01');
  });
});

// ---------------------------------------------------------------------------
// summaryGate
// ---------------------------------------------------------------------------

describe('summaryGate', () => {
  test('fails gate "exists" when file is missing', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'), { recursive: true });
    const result = summaryGate('01-setup', '01', planningDir);
    expect(result.ok).toBe(false);
    expect(result.gate).toBe('exists');
  });

  test('fails gate "nonempty" when file is empty', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '');
    const result = summaryGate('01-setup', '01', planningDir);
    expect(result.ok).toBe(false);
    expect(result.gate).toBe('nonempty');
  });

  test('fails gate "valid-frontmatter" when no --- delimiters', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), 'no frontmatter here\njust text');
    const result = summaryGate('01-setup', '01', planningDir);
    expect(result.ok).toBe(false);
    expect(result.gate).toBe('valid-frontmatter');
  });

  test('fails gate "valid-frontmatter" when --- present but no status field', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nplan: "01"\n---\nBody');
    const result = summaryGate('01-setup', '01', planningDir);
    expect(result.ok).toBe(false);
    expect(result.gate).toBe('valid-frontmatter');
  });

  test('passes all gates with valid SUMMARY', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), '---\nstatus: complete\nplan: "01"\n---\n## Results');
    const result = summaryGate('01-setup', '01', planningDir);
    expect(result.ok).toBe(true);
    expect(result.gate).toBeNull();
    expect(result.detail).toBe('all gates passed');
  });
});

// ---------------------------------------------------------------------------
// checkpointInit
// ---------------------------------------------------------------------------

describe('checkpointInit', () => {
  test('creates manifest with correct structure', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    const result = checkpointInit('01-setup', ['01', '02'], planningDir);
    expect(result.ok).toBe(true);
    expect(result.path).toMatch(/\.checkpoint-manifest\.json$/);

    const manifest = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    expect(manifest.plans).toEqual(['01', '02']);
    expect(manifest.checkpoints_resolved).toEqual([]);
    expect(manifest.wave).toBe(1);
    expect(manifest.commit_log).toEqual([]);
    expect(manifest.last_good_commit).toBeNull();
  });

  test('accepts comma-separated string of plan IDs', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    const result = checkpointInit('01-setup', '01, 02, 03', planningDir);
    expect(result.ok).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    expect(manifest.plans).toEqual(['01', '02', '03']);
  });

  test('handles empty plans', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    const result = checkpointInit('01-setup', '', planningDir);
    expect(result.ok).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    expect(manifest.plans).toEqual([]);
  });

  test('handles null/undefined plans', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    const result = checkpointInit('01-setup', null, planningDir);
    expect(result.ok).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    expect(manifest.plans).toEqual([]);
  });

  test('includes session_id from .session.json if present', () => {
    fs.writeFileSync(path.join(planningDir, '.session.json'),
      JSON.stringify({ session_id: 'test-session-123' }));
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    const result = checkpointInit('01-setup', ['01'], planningDir);
    const manifest = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    expect(manifest.session_id).toBe('test-session-123');
  });

  test('session_id is null when no .session.json', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    const result = checkpointInit('01-setup', ['01'], planningDir);
    const manifest = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    expect(manifest.session_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkpointUpdate
// ---------------------------------------------------------------------------

describe('checkpointUpdate', () => {
  let manifestPath;

  function initManifest(extra = {}) {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    manifestPath = path.join(phaseDir, '.checkpoint-manifest.json');
    const base = {
      session_id: null,
      plans: ['01', '02', '03'],
      checkpoints_resolved: [],
      wave: 1,
      deferred: [],
      commit_log: [],
      last_good_commit: null,
      ...extra
    };
    fs.writeFileSync(manifestPath, JSON.stringify(base, null, 2));
    return manifestPath;
  }

  test('moves resolved plan from plans to checkpoints_resolved', () => {
    initManifest();
    const result = checkpointUpdate('01-setup', { resolved: '01' }, planningDir);
    expect(result.ok).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.plans).toEqual(['02', '03']);
    expect(manifest.checkpoints_resolved).toContain('01');
  });

  test('advances wave number', () => {
    initManifest();
    const result = checkpointUpdate('01-setup', { wave: 2 }, planningDir);
    expect(result.ok).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.wave).toBe(2);
  });

  test('appends sha to commit_log and updates last_good_commit', () => {
    initManifest();
    const result = checkpointUpdate('01-setup', { resolved: '01', sha: 'abc1234' }, planningDir);
    expect(result.ok).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.last_good_commit).toBe('abc1234');
    expect(manifest.commit_log.length).toBe(1);
    expect(manifest.commit_log[0].sha).toBe('abc1234');
    expect(manifest.commit_log[0].plan).toBe('01');
  });

  test('rejects update from different session_id without force', () => {
    initManifest({ session_id: 'session-A' });
    // Write a .session.json with a different session
    fs.writeFileSync(path.join(planningDir, '.session.json'),
      JSON.stringify({ session_id: 'session-B' }));

    const result = checkpointUpdate('01-setup', { resolved: '01' }, planningDir);
    expect(result.error).toMatch(/different session/);
  });

  test('allows update from different session with force: true', () => {
    initManifest({ session_id: 'session-A' });
    fs.writeFileSync(path.join(planningDir, '.session.json'),
      JSON.stringify({ session_id: 'session-B' }));

    const result = checkpointUpdate('01-setup', { resolved: '01', force: true }, planningDir);
    expect(result.ok).toBe(true);
  });

  test('returns error when manifest is missing', () => {
    fs.mkdirSync(path.join(planningDir, 'phases', '01-setup'), { recursive: true });
    const result = checkpointUpdate('01-setup', { resolved: '01' }, planningDir);
    expect(result.error).toMatch(/Cannot read/);
  });
});

// ---------------------------------------------------------------------------
// seedsMatch
// ---------------------------------------------------------------------------

describe('seedsMatch', () => {
  test('returns empty matched array when no seeds dir', () => {
    const result = seedsMatch('03-auth', 3, planningDir);
    expect(result).toEqual({ matched: [] });
  });

  test('returns seed on exact slug match', () => {
    const seedsDir = path.join(planningDir, 'seeds');
    fs.mkdirSync(seedsDir, { recursive: true });
    fs.writeFileSync(path.join(seedsDir, 'auth-seed.md'), [
      '---',
      'name: auth-seed',
      'trigger: 03-auth',
      'description: Auth boilerplate',
      '---',
      'Seed content'
    ].join('\n'));

    const result = seedsMatch('03-auth', 3, planningDir);
    expect(result.matched.length).toBe(1);
    expect(result.matched[0].name).toBe('auth-seed');
    expect(result.matched[0].trigger).toBe('03-auth');
  });

  test('returns seed on substring match', () => {
    const seedsDir = path.join(planningDir, 'seeds');
    fs.mkdirSync(seedsDir, { recursive: true });
    fs.writeFileSync(path.join(seedsDir, 'auth-seed.md'), [
      '---',
      'trigger: auth',
      'description: Matches any phase with auth in name',
      '---'
    ].join('\n'));

    const result = seedsMatch('03-auth-system', 3, planningDir);
    expect(result.matched.length).toBe(1);
  });

  test('returns seed on phase number match', () => {
    const seedsDir = path.join(planningDir, 'seeds');
    fs.mkdirSync(seedsDir, { recursive: true });
    fs.writeFileSync(path.join(seedsDir, 'phase3.md'), [
      '---',
      'trigger: "3"',
      'name: phase-3-seed',
      '---'
    ].join('\n'));

    const result = seedsMatch('03-auth', 3, planningDir);
    expect(result.matched.length).toBe(1);
    expect(result.matched[0].name).toBe('phase-3-seed');
  });

  test('wildcard trigger matches any phase', () => {
    const seedsDir = path.join(planningDir, 'seeds');
    fs.mkdirSync(seedsDir, { recursive: true });
    fs.writeFileSync(path.join(seedsDir, 'global.md'), [
      '---',
      'trigger: "*"',
      'name: global-seed',
      '---'
    ].join('\n'));

    const result = seedsMatch('99-whatever', 99, planningDir);
    expect(result.matched.length).toBe(1);
    expect(result.matched[0].trigger).toBe('*');
  });

  test('non-matching trigger is excluded', () => {
    const seedsDir = path.join(planningDir, 'seeds');
    fs.mkdirSync(seedsDir, { recursive: true });
    fs.writeFileSync(path.join(seedsDir, 'unrelated.md'), [
      '---',
      'trigger: database',
      'name: db-seed',
      '---'
    ].join('\n'));

    const result = seedsMatch('03-auth', 3, planningDir);
    expect(result.matched.length).toBe(0);
  });

  test('skips seed files without frontmatter', () => {
    const seedsDir = path.join(planningDir, 'seeds');
    fs.mkdirSync(seedsDir, { recursive: true });
    fs.writeFileSync(path.join(seedsDir, 'nofm.md'), 'no frontmatter here');

    const result = seedsMatch('03-auth', 3, planningDir);
    expect(result.matched.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ciPoll
// ---------------------------------------------------------------------------

describe('ciPoll', () => {
  test('returns error with abort when runId is missing', () => {
    const result = ciPoll(null, 300);
    expect(result.status).toBe('error');
    expect(result.next_action).toBe('abort');
    expect(result.error).toMatch(/Missing run-id/);
  });

  test('returns timed_out when timeout <= 0', () => {
    const result = ciPoll('12345', 0);
    expect(result.status).toBe('timed_out');
    expect(result.next_action).toBe('abort');
  });

  test('returns passed with continue on completed+success', () => {
    execSync.mockReturnValue(JSON.stringify({
      status: 'completed',
      conclusion: 'success',
      url: 'https://github.com/runs/123'
    }));

    const result = ciPoll('123', 300);
    expect(result.status).toBe('passed');
    expect(result.next_action).toBe('continue');
    expect(result.conclusion).toBe('success');
    expect(result.url).toBe('https://github.com/runs/123');
  });

  test('returns failed with abort on completed+failure', () => {
    execSync.mockReturnValue(JSON.stringify({
      status: 'completed',
      conclusion: 'failure',
      url: 'https://github.com/runs/123'
    }));

    const result = ciPoll('123', 300);
    expect(result.status).toBe('failed');
    expect(result.next_action).toBe('abort');
    expect(result.conclusion).toBe('failure');
  });

  test('returns wait on in_progress status', () => {
    execSync.mockReturnValue(JSON.stringify({
      status: 'in_progress',
      conclusion: null,
      url: 'https://github.com/runs/123'
    }));

    const result = ciPoll('123', 300);
    expect(result.status).toBe('in_progress');
    expect(result.next_action).toBe('wait');
  });

  test('returns error when execSync throws', () => {
    execSync.mockImplementation(() => { throw new Error('gh not found'); });

    const result = ciPoll('123', 300);
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/gh not found/);
  });

  test('returns error when gh outputs invalid JSON', () => {
    execSync.mockReturnValue('not valid json at all');

    const result = ciPoll('123', 300);
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/Failed to parse/);
  });

  test('uses default timeout of 300 when not provided', () => {
    execSync.mockReturnValue(JSON.stringify({ status: 'completed', conclusion: 'success', url: '' }));
    // Should not return timed_out
    const result = ciPoll('123');
    expect(result.status).toBe('passed');
  });
});

// ---------------------------------------------------------------------------
// rollback
// ---------------------------------------------------------------------------

describe('rollback', () => {
  test('returns error when manifest is missing', () => {
    const result = rollback(path.join(planningDir, 'nonexistent.json'));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Manifest not found/);
  });

  test('returns error when manifest has no last_good_commit', () => {
    const mPath = path.join(planningDir, 'manifest.json');
    fs.writeFileSync(mPath, JSON.stringify({
      last_good_commit: null,
      checkpoints_resolved: []
    }));

    const result = rollback(mPath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No rollback point/);
  });

  test('returns error when manifest is invalid JSON', () => {
    const mPath = path.join(planningDir, 'manifest.json');
    fs.writeFileSync(mPath, 'not json');

    const result = rollback(mPath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Cannot parse/);
  });

  test('successful rollback runs git reset, deletes failed SUMMARY, returns ok', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Create failed SUMMARY
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-02.md'), 'failed summary');

    const mPath = path.join(phaseDir, '.checkpoint-manifest.json');
    fs.writeFileSync(mPath, JSON.stringify({
      last_good_commit: 'abc1234',
      failed_plan: '02',
      checkpoints_resolved: ['01', '02'],
      downstream_of: {}
    }));

    execSync.mockReturnValue('');

    const result = rollback(mPath);
    expect(result.ok).toBe(true);
    expect(result.rolled_back_to).toBe('abc1234');
    expect(result.files_deleted).toEqual(expect.arrayContaining([
      expect.stringContaining('SUMMARY-02.md')
    ]));
    expect(execSync).toHaveBeenCalledWith(
      'git reset --soft abc1234',
      expect.objectContaining({ encoding: 'utf8' })
    );
  });

  test('returns error when git reset fails', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    const mPath = path.join(phaseDir, '.checkpoint-manifest.json');
    fs.writeFileSync(mPath, JSON.stringify({
      last_good_commit: 'abc1234',
      checkpoints_resolved: []
    }));

    execSync.mockImplementation(() => { throw new Error('git error'); });

    const result = rollback(mPath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/git reset --soft failed/);
  });

  test('downstream plans are invalidated when they depend on failed plan', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    // Create downstream SUMMARY
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-03.md'), 'downstream summary');

    const mPath = path.join(phaseDir, '.checkpoint-manifest.json');
    fs.writeFileSync(mPath, JSON.stringify({
      last_good_commit: 'abc1234',
      failed_plan: '02',
      checkpoints_resolved: ['01', '02', '03'],
      downstream_of: {
        '03': ['02']  // plan 03 depends on plan 02
      }
    }));

    execSync.mockReturnValue('');

    const result = rollback(mPath);
    expect(result.ok).toBe(true);
    expect(result.plans_invalidated).toContain('03');
    expect(result.files_deleted).toEqual(expect.arrayContaining([
      expect.stringContaining('SUMMARY-03.md')
    ]));
  });

  test('manifest is updated after rollback (resolved filtered)', () => {
    const phaseDir = path.join(planningDir, 'phases', '01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });

    const mPath = path.join(phaseDir, '.checkpoint-manifest.json');
    fs.writeFileSync(mPath, JSON.stringify({
      last_good_commit: 'abc1234',
      failed_plan: '02',
      checkpoints_resolved: ['01', '02', '03'],
      downstream_of: { '03': ['02'] }
    }));

    execSync.mockReturnValue('');

    rollback(mPath);

    const updated = JSON.parse(fs.readFileSync(mPath, 'utf8'));
    // 02 (failed) and 03 (downstream of failed) should be removed
    expect(updated.checkpoints_resolved).toEqual(['01']);
  });
});
