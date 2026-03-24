'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { handleBenchmarks, formatDuration, renderTable } = require('../plugins/pbr/scripts/commands/benchmarks');

function makeTmpDir() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-bench-'));
  const planningDir = path.join(base, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  return { base, planningDir };
}

function writeCostEntries(planningDir, entries) {
  const lines = entries.map(e => JSON.stringify(e)).join('\n');
  fs.writeFileSync(path.join(planningDir, '.agent-cost-tracker'), lines);
}

function makeCtx(planningDir) {
  let outputData = null;
  let errorData = null;
  return {
    planningDir,
    cwd: path.dirname(planningDir),
    output: (data) => { outputData = data; },
    error: (msg) => { errorData = msg; },
    getOutput: () => outputData,
    getError: () => errorData
  };
}

const SAMPLE_ENTRIES = [
  { ts: 1000, type: 'executor', ms: 60000, phase: '3', skill: 'build' },
  { ts: 2000, type: 'planner', ms: 30000, phase: '3', skill: 'plan' },
  { ts: 3000, type: 'verifier', ms: 15000, phase: '3', skill: 'review' },
  { ts: 4000, type: 'executor', ms: 45000, phase: '5', skill: 'build' },
  { ts: 5000, type: 'researcher', ms: 20000, phase: '5', skill: 'plan' },
  { ts: 6000, type: 'executor', ms: 90000, phase: '7', skill: 'build' },
];

describe('formatDuration', () => {
  test('formats zero', () => {
    expect(formatDuration(0)).toBe('0s');
  });
  test('formats seconds only', () => {
    expect(formatDuration(5000)).toBe('5s');
  });
  test('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
  });
  test('handles null/undefined', () => {
    expect(formatDuration(null)).toBe('0s');
    expect(formatDuration(undefined)).toBe('0s');
  });
});

describe('renderTable', () => {
  test('renders a simple table', () => {
    const result = renderTable(['Name', 'Count'], [['foo', '3'], ['bar', '10']]);
    expect(result).toContain('Name');
    expect(result).toContain('foo');
    expect(result).toContain('---');
  });
});

describe('handleBenchmarks', () => {
  let tmpDirs = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* */ }
    }
    tmpDirs = [];
  });

  function setup(entries) {
    const { base, planningDir } = makeTmpDir();
    tmpDirs.push(base);
    if (entries && entries.length > 0) {
      writeCostEntries(planningDir, entries);
    }
    return makeCtx(planningDir);
  }

  test('summary outputs phase data', async () => {
    const ctx = setup(SAMPLE_ENTRIES);
    const origWrite = process.stdout.write;
    let captured = '';
    process.stdout.write = (str) => { captured += str; };
    try {
      await handleBenchmarks(['benchmarks', 'summary'], ctx);
    } finally {
      process.stdout.write = origWrite;
    }
    expect(captured).toContain('3');
    expect(captured).toContain('5');
    expect(captured).toContain('Phase');
  });

  test('agents outputs agent type names', async () => {
    const ctx = setup(SAMPLE_ENTRIES);
    const origWrite = process.stdout.write;
    let captured = '';
    process.stdout.write = (str) => { captured += str; };
    try {
      await handleBenchmarks(['benchmarks', 'agents'], ctx);
    } finally {
      process.stdout.write = origWrite;
    }
    expect(captured).toContain('executor');
    expect(captured).toContain('planner');
    expect(captured).toContain('researcher');
  });

  test('phase filters to specified phase', async () => {
    const ctx = setup(SAMPLE_ENTRIES);
    const origWrite = process.stdout.write;
    let captured = '';
    process.stdout.write = (str) => { captured += str; };
    try {
      await handleBenchmarks(['benchmarks', 'phase', '3'], ctx);
    } finally {
      process.stdout.write = origWrite;
    }
    expect(captured).toContain('Phase 3');
    expect(captured).toContain('executor');
    expect(captured).toContain('planner');
  });

  test('summary --json outputs valid JSON', async () => {
    const ctx = setup(SAMPLE_ENTRIES);
    await handleBenchmarks(['benchmarks', 'summary', '--json'], ctx);
    const result = ctx.getOutput();
    expect(result).toBeTruthy();
    expect(result.totals).toBeDefined();
    expect(result.totals.count).toBe(6);
    expect(result.phases['3']).toBeDefined();
    expect(result.phases['5']).toBeDefined();
  });

  test('empty dir shows no data message', async () => {
    const ctx = setup([]);
    const origWrite = process.stdout.write;
    let captured = '';
    process.stdout.write = (str) => { captured += str; };
    try {
      await handleBenchmarks(['benchmarks', 'summary'], ctx);
    } finally {
      process.stdout.write = origWrite;
    }
    expect(captured).toContain('No benchmark data found');
  });

  test('session subcommand works', async () => {
    const ctx = setup(SAMPLE_ENTRIES);
    const origWrite = process.stdout.write;
    let captured = '';
    process.stdout.write = (str) => { captured += str; };
    try {
      await handleBenchmarks(['benchmarks', 'session'], ctx);
    } finally {
      process.stdout.write = origWrite;
    }
    expect(captured).toContain('Session');
  });

  test('help shows usage', async () => {
    const ctx = setup([]);
    const origWrite = process.stdout.write;
    let captured = '';
    process.stdout.write = (str) => { captured += str; };
    try {
      await handleBenchmarks(['benchmarks', 'help'], ctx);
    } finally {
      process.stdout.write = origWrite;
    }
    expect(captured).toContain('Usage');
    expect(captured).toContain('summary');
  });

  test('unknown subcommand triggers error', async () => {
    const ctx = setup([]);
    await handleBenchmarks(['benchmarks', 'bogus'], ctx);
    expect(ctx.getError()).toContain('Unknown benchmarks subcommand');
  });

  test('phase without number triggers error', async () => {
    const ctx = setup(SAMPLE_ENTRIES);
    await handleBenchmarks(['benchmarks', 'phase'], ctx);
    expect(ctx.getError()).toContain('Usage');
  });

  test('phase with no matching data', async () => {
    const ctx = setup(SAMPLE_ENTRIES);
    const origWrite = process.stdout.write;
    let captured = '';
    process.stdout.write = (str) => { captured += str; };
    try {
      await handleBenchmarks(['benchmarks', 'phase', '999'], ctx);
    } finally {
      process.stdout.write = origWrite;
    }
    expect(captured).toContain('No benchmark data found for phase 999');
  });
});
