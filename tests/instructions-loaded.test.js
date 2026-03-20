'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'instructions-loaded.js');

describe('instructions-loaded.js', () => {
  let tmpDir, planningDir;
  let origExit;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-il-'));
    planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    // Override PBR_PROJECT_ROOT so the script uses our temp dir
    process.env.PBR_PROJECT_ROOT = tmpDir;
    // Clear require cache so module is freshly loaded each test
    delete require.cache[SCRIPT_PATH];
    // Mock process.exit to prevent test runner from exiting
    origExit = process.exit;
    process.exit = () => {};
    // Mock stdin (fd 0) reads to return empty JSON — prevent blocking
    // The script calls fs.readFileSync(0, ...) for stdin; since we can't
    // easily mock fd 0, the test calls main() directly after loading the module.
  });

  afterEach(() => {
    process.exit = origExit;
    delete process.env.PBR_PROJECT_ROOT;
    delete require.cache[SCRIPT_PATH];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('module exports a main function', () => {
    const mod = require(SCRIPT_PATH);
    expect(typeof mod.main).toBe('function');
  });

  it('exits 0 silently when no .planning/ dir (non-PBR project)', () => {
    fs.rmSync(planningDir, { recursive: true, force: true });
    const exitCalls = [];
    process.exit = (code) => { exitCalls.push(code); };

    // Stub fs.readFileSync for stdin to return empty
    const origReadFileSync = fs.readFileSync;
    fs.readFileSync = (fd, ...args) => {
      if (fd === 0) return '';
      return origReadFileSync(fd, ...args);
    };
    try {
      const { main } = require(SCRIPT_PATH);
      main();
    } finally {
      fs.readFileSync = origReadFileSync;
    }
    // Should have called process.exit(0)
    expect(exitCalls).toContain(0);
    // Should NOT have written additionalContext
  });

  it('detects initial load (no .session.json) and does not output additionalContext', () => {
    // No .session.json written — initial load path
    const outputChunks = [];
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { outputChunks.push(chunk.toString()); return true; };

    const origReadFileSync = fs.readFileSync;
    fs.readFileSync = (fd, ...args) => {
      if (fd === 0) return '';
      return origReadFileSync(fd, ...args);
    };
    try {
      const { main } = require(SCRIPT_PATH);
      main();
    } finally {
      process.stdout.write = origStdoutWrite;
      fs.readFileSync = origReadFileSync;
    }

    const combined = outputChunks.join('');
    // Initial load: no additionalContext output — progress-tracker handles this
    expect(combined).not.toContain('additionalContext');
  });

  it('detects mid-session reload when .session.json has sessionStart and outputs additionalContext', () => {
    fs.writeFileSync(
      path.join(planningDir, '.session.json'),
      JSON.stringify({ sessionStart: Date.now(), activeSkill: 'build' })
    );

    const outputChunks = [];
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { outputChunks.push(chunk.toString()); return true; };

    const origReadFileSync = fs.readFileSync;
    fs.readFileSync = (fd, ...args) => {
      if (fd === 0) return '';
      return origReadFileSync(fd, ...args);
    };
    try {
      const { main } = require(SCRIPT_PATH);
      main();
    } finally {
      process.stdout.write = origStdoutWrite;
      fs.readFileSync = origReadFileSync;
    }

    const combined = outputChunks.join('');
    expect(combined).toContain('additionalContext');
    expect(combined).toContain('reloaded');
  });

  it('does not output additionalContext when .session.json exists but lacks sessionStart', () => {
    // Session file without sessionStart — should be treated as initial load
    fs.writeFileSync(
      path.join(planningDir, '.session.json'),
      JSON.stringify({ activeSkill: 'plan' }) // no sessionStart
    );

    const outputChunks = [];
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { outputChunks.push(chunk.toString()); return true; };

    const origReadFileSync = fs.readFileSync;
    fs.readFileSync = (fd, ...args) => {
      if (fd === 0) return '';
      return origReadFileSync(fd, ...args);
    };
    try {
      const { main } = require(SCRIPT_PATH);
      main();
    } finally {
      process.stdout.write = origStdoutWrite;
      fs.readFileSync = origReadFileSync;
    }

    const combined = outputChunks.join('');
    expect(combined).not.toContain('additionalContext');
  });
});
