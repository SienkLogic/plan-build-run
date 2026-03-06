'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CREATE_PATH = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'worktree-create.js');
const REMOVE_PATH = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'worktree-remove.js');

// Helper: stub fs.readFileSync for stdin (fd 0) to return a JSON payload
function stubStdin(payload, fn) {
  const origReadFileSync = fs.readFileSync;
  fs.readFileSync = (fd, ...args) => {
    if (fd === 0) return JSON.stringify(payload);
    return origReadFileSync(fd, ...args);
  };
  try {
    return fn();
  } finally {
    fs.readFileSync = origReadFileSync;
  }
}

// ─── worktree-create.js ────────────────────────────────────────────────────────

describe('worktree-create.js', () => {
  let tmpDir;
  let origExit;
  let exitCalls;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-wc-'));
    process.env.PBR_PROJECT_ROOT = tmpDir;
    delete require.cache[CREATE_PATH];
    origExit = process.exit;
    exitCalls = [];
    process.exit = (code) => { exitCalls.push(code !== undefined ? code : 0); };
  });

  afterEach(() => {
    process.exit = origExit;
    delete process.env.PBR_PROJECT_ROOT;
    delete require.cache[CREATE_PATH];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('module exports a main function', () => {
    const mod = require(CREATE_PATH);
    expect(typeof mod.main).toBe('function');
  });

  it('exits 0 silently when parent has no .planning/ dir', () => {
    // tmpDir has no .planning/ — not a PBR parent project
    stubStdin({}, () => {
      const { main } = require(CREATE_PATH);
      main();
    });

    expect(exitCalls).toContain(0);
    // Should NOT have created .planning/ in tmpDir
    expect(fs.existsSync(path.join(tmpDir, '.planning'))).toBe(false);
  });

  it('initializes .planning/ when parent has .planning/', () => {
    // Create a parent dir with .planning/
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-wc-parent-'));
    fs.mkdirSync(path.join(parentDir, '.planning'), { recursive: true });

    // Create a fresh worktree dir
    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-wc-wt-'));

    try {
      stubStdin({ worktree_path: worktreeDir, project_root: parentDir }, () => {
        const { main } = require(CREATE_PATH);
        main();
      });

      // .planning/ should exist in the worktree
      expect(fs.existsSync(path.join(worktreeDir, '.planning'))).toBe(true);
      // STATE.md should be created
      expect(fs.existsSync(path.join(worktreeDir, '.planning', 'STATE.md'))).toBe(true);
      // logs/ should be created
      expect(fs.existsSync(path.join(worktreeDir, '.planning', 'logs'))).toBe(true);

      // STATE.md should reference the parent
      const stateContent = fs.readFileSync(path.join(worktreeDir, '.planning', 'STATE.md'), 'utf8');
      expect(stateContent).toContain('parent:');
      expect(stateContent).toContain(parentDir);

      expect(exitCalls).toContain(0);
    } finally {
      fs.rmSync(parentDir, { recursive: true, force: true });
      fs.rmSync(worktreeDir, { recursive: true, force: true });
    }
  });

  it('skips init when .planning/ already exists in worktree', () => {
    // Create parent .planning/
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-wc-parent-'));
    fs.mkdirSync(path.join(parentDir, '.planning'), { recursive: true });

    // Pre-create .planning/ in worktree with existing STATE.md
    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-wc-wt-'));
    const worktreePlanningDir = path.join(worktreeDir, '.planning');
    fs.mkdirSync(worktreePlanningDir, { recursive: true });
    const originalContent = '# Existing STATE';
    fs.writeFileSync(path.join(worktreePlanningDir, 'STATE.md'), originalContent, 'utf8');

    try {
      stubStdin({ worktree_path: worktreeDir, project_root: parentDir }, () => {
        const { main } = require(CREATE_PATH);
        main();
      });

      // STATE.md should NOT be overwritten
      const stateContent = fs.readFileSync(path.join(worktreePlanningDir, 'STATE.md'), 'utf8');
      expect(stateContent).toBe(originalContent);
      expect(exitCalls).toContain(0);
    } finally {
      fs.rmSync(parentDir, { recursive: true, force: true });
      fs.rmSync(worktreeDir, { recursive: true, force: true });
    }
  });

  it('copies config.json from parent if it exists', () => {
    // Create parent .planning/ with a config.json
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-wc-parent-'));
    const parentPlanningDir = path.join(parentDir, '.planning');
    fs.mkdirSync(parentPlanningDir, { recursive: true });
    const configContent = JSON.stringify({ depth: 'standard', mode: 'autonomous' });
    fs.writeFileSync(path.join(parentPlanningDir, 'config.json'), configContent, 'utf8');

    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-wc-wt-'));

    try {
      stubStdin({ worktree_path: worktreeDir, project_root: parentDir }, () => {
        const { main } = require(CREATE_PATH);
        main();
      });

      const copiedConfig = path.join(worktreeDir, '.planning', 'config.json');
      expect(fs.existsSync(copiedConfig)).toBe(true);
      expect(fs.readFileSync(copiedConfig, 'utf8')).toBe(configContent);
      expect(exitCalls).toContain(0);
    } finally {
      fs.rmSync(parentDir, { recursive: true, force: true });
      fs.rmSync(worktreeDir, { recursive: true, force: true });
    }
  });
});

// ─── worktree-remove.js ────────────────────────────────────────────────────────

describe('worktree-remove.js', () => {
  let tmpDir;
  let origExit;
  let exitCalls;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-wr-'));
    process.env.PBR_PROJECT_ROOT = tmpDir;
    delete require.cache[REMOVE_PATH];
    origExit = process.exit;
    exitCalls = [];
    process.exit = (code) => { exitCalls.push(code !== undefined ? code : 0); };
  });

  afterEach(() => {
    process.exit = origExit;
    delete process.env.PBR_PROJECT_ROOT;
    delete require.cache[REMOVE_PATH];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('module exports a main function', () => {
    const mod = require(REMOVE_PATH);
    expect(typeof mod.main).toBe('function');
  });

  it('exits 0 silently when no .planning/ in worktree', () => {
    // tmpDir has no .planning/
    stubStdin({}, () => {
      const { main } = require(REMOVE_PATH);
      main();
    });

    expect(exitCalls).toContain(0);
  });

  it('skips cleanup if STATE.md has no parent: marker', () => {
    // Create .planning/ with STATE.md that lacks "parent:" — this is the parent project itself
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# STATE\n\nstatus: Building\n', 'utf8');

    // Create session files that should NOT be removed
    const sessionFile = path.join(planningDir, '.session.json');
    const activeSkillFile = path.join(planningDir, '.active-skill');
    fs.writeFileSync(sessionFile, '{}', 'utf8');
    fs.writeFileSync(activeSkillFile, 'build', 'utf8');

    stubStdin({ worktree_path: tmpDir }, () => {
      const { main } = require(REMOVE_PATH);
      main();
    });

    // Files should still exist — cleanup was skipped
    expect(fs.existsSync(sessionFile)).toBe(true);
    expect(fs.existsSync(activeSkillFile)).toBe(true);
    expect(exitCalls).toContain(0);
  });

  it('removes session files when STATE.md has parent: marker', () => {
    // Create .planning/ with a worktree-style STATE.md (has "parent:" marker)
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      '# STATE\n\nstatus: Worktree initialized\n\nparent: /some/parent\n',
      'utf8'
    );

    // Create session files that should be cleaned up
    const sessionFile = path.join(planningDir, '.session.json');
    const activeSkillFile = path.join(planningDir, '.active-skill');
    fs.writeFileSync(sessionFile, '{}', 'utf8');
    fs.writeFileSync(activeSkillFile, 'build', 'utf8');

    stubStdin({ worktree_path: tmpDir }, () => {
      const { main } = require(REMOVE_PATH);
      main();
    });

    // Session files should be removed
    expect(fs.existsSync(sessionFile)).toBe(false);
    expect(fs.existsSync(activeSkillFile)).toBe(false);
    expect(exitCalls).toContain(0);
  });

  it('is non-blocking even on fs error', () => {
    // Create .planning/ with parent: marker
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      '# STATE\n\nparent: /some/parent\n',
      'utf8'
    );

    // Create a session file
    const sessionFile = path.join(planningDir, '.session.json');
    fs.writeFileSync(sessionFile, '{}', 'utf8');

    // Mock fs.unlinkSync to throw
    const origUnlinkSync = fs.unlinkSync;
    fs.unlinkSync = () => { throw new Error('Permission denied'); };

    try {
      stubStdin({ worktree_path: tmpDir }, () => {
        const { main } = require(REMOVE_PATH);
        main();
      });

      // Should still exit 0 even though unlink threw
      expect(exitCalls).toContain(0);
    } finally {
      fs.unlinkSync = origUnlinkSync;
    }
  });
});
