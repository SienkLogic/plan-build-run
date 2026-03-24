'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { checkPrematureCompletion, loadBaselines, DEFAULT_BASELINES } = require('../plugins/pbr/scripts/lib/premature-completion');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'premature-test-'));
  // Create minimal STATE.md so findCurrentPhaseDir works
  fs.writeFileSync(path.join(tmpDir, 'STATE.md'), '---\ncurrent_phase: 99\n---\n');
  const phaseDir = path.join(tmpDir, 'phases', '99-test');
  fs.mkdirSync(phaseDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('DEFAULT_BASELINES', () => {
  test('defines baselines for all 5 agent types', () => {
    expect(DEFAULT_BASELINES.executor).toBeDefined();
    expect(DEFAULT_BASELINES.verifier).toBeDefined();
    expect(DEFAULT_BASELINES.planner).toBeDefined();
    expect(DEFAULT_BASELINES.researcher).toBeDefined();
    expect(DEFAULT_BASELINES.synthesizer).toBeDefined();
  });

  test('executor baselines have expected keys', () => {
    expect(DEFAULT_BASELINES.executor).toHaveProperty('min_duration_ms');
    expect(DEFAULT_BASELINES.executor).toHaveProperty('min_output_chars');
    expect(DEFAULT_BASELINES.executor).toHaveProperty('min_must_have_coverage');
  });
});

describe('loadBaselines', () => {
  test('returns DEFAULT_BASELINES when config.json is missing', () => {
    const noConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-config-'));
    try {
      const baselines = loadBaselines(noConfigDir);
      expect(baselines.executor.min_duration_ms).toBe(DEFAULT_BASELINES.executor.min_duration_ms);
      expect(baselines.verifier.min_output_chars).toBe(DEFAULT_BASELINES.verifier.min_output_chars);
    } finally {
      fs.rmSync(noConfigDir, { recursive: true, force: true });
    }
  });

  test('merges custom agent_baselines from config.json', () => {
    const config = {
      agent_baselines: {
        executor: { min_duration_ms: 10000 },
        researcher: { min_output_chars: 50 }
      }
    };
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(config));
    const baselines = loadBaselines(tmpDir);
    // Custom value overrides default
    expect(baselines.executor.min_duration_ms).toBe(10000);
    // Other executor defaults preserved
    expect(baselines.executor.min_output_chars).toBe(DEFAULT_BASELINES.executor.min_output_chars);
    // Researcher override
    expect(baselines.researcher.min_output_chars).toBe(50);
    // Unmodified agents keep defaults
    expect(baselines.planner.min_tasks).toBe(DEFAULT_BASELINES.planner.min_tasks);
  });
});

describe('checkPrematureCompletion', () => {
  test('returns null for unknown agent type', () => {
    const result = checkPrematureCompletion('pbr:unknown', {}, tmpDir);
    expect(result).toBeNull();
  });

  test('strips pbr: prefix correctly', () => {
    // 'unknown' without prefix also returns null
    const result = checkPrematureCompletion('unknown', {}, tmpDir);
    expect(result).toBeNull();
  });

  // --- Executor ---
  test('executor: no warning when output is sufficient', () => {
    const result = checkPrematureCompletion('pbr:executor', {
      tool_output: 'x'.repeat(1000),
      duration_ms: 120000
    }, tmpDir);
    expect(result).toBeNull();
  });

  test('executor: warns on multiple signals (short output + fast duration)', () => {
    const result = checkPrematureCompletion('pbr:executor', {
      tool_output: 'short',
      duration_ms: 5000
    }, tmpDir);
    expect(result).not.toBeNull();
    expect(result.warning).toMatch(/Executor/i);
    expect(result.signals.length).toBeGreaterThanOrEqual(2);
  });

  test('executor: no warning on single signal (only duration low)', () => {
    const result = checkPrematureCompletion('pbr:executor', {
      tool_output: 'x'.repeat(1000),
      duration_ms: 5000
    }, tmpDir);
    expect(result).toBeNull();
  });

  // --- Verifier ---
  test('verifier: warns on short output + low duration', () => {
    const result = checkPrematureCompletion('pbr:verifier', {
      tool_output: 'tiny',
      duration_ms: 3000
    }, tmpDir);
    expect(result).not.toBeNull();
    expect(result.warning).toMatch(/Verifier/i);
    expect(result.signals.length).toBeGreaterThanOrEqual(2);
  });

  test('verifier: no warning when output is sufficient', () => {
    const result = checkPrematureCompletion('pbr:verifier', {
      tool_output: 'x'.repeat(500),
      duration_ms: 60000
    }, tmpDir);
    expect(result).toBeNull();
  });

  // --- Planner ---
  test('planner: warns on low task count + low duration', () => {
    // Create a PLAN.md with only 1 task
    const phaseDir = path.join(tmpDir, 'phases', '99-test');
    const planContent = '---\nphase: "99"\nplan: "99-01"\n---\n<task id="T1"><name>Only task</name></task>';
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), planContent);

    const result = checkPrematureCompletion('pbr:planner', {
      tool_output: 'planned',
      duration_ms: 5000
    }, tmpDir);
    expect(result).not.toBeNull();
    expect(result.warning).toMatch(/Planner/i);
    expect(result.signals.length).toBeGreaterThanOrEqual(2);
  });

  test('planner: no warning with enough tasks and duration', () => {
    const phaseDir = path.join(tmpDir, 'phases', '99-test');
    const planContent = '---\nphase: "99"\nmust_haves:\n  truths: []\n---\n<task id="T1"><name>A</name></task>\n<task id="T2"><name>B</name></task>\n<task id="T3"><name>C</name></task>';
    fs.writeFileSync(path.join(phaseDir, 'PLAN-01.md'), planContent);

    const result = checkPrematureCompletion('pbr:planner', {
      tool_output: 'x'.repeat(500),
      duration_ms: 60000
    }, tmpDir);
    expect(result).toBeNull();
  });

  // --- Researcher ---
  test('researcher: warns on short output + few sections', () => {
    const result = checkPrematureCompletion('pbr:researcher', {
      tool_output: 'tiny output'
    }, tmpDir);
    expect(result).not.toBeNull();
    expect(result.warning).toMatch(/Researcher/i);
    expect(result.signals.length).toBe(2);
  });

  test('researcher: no warning with enough output and sections', () => {
    const output = 'x'.repeat(300) + '\n## Section 1\nContent\n## Section 2\nMore content\n### Sub\nDetail';
    const result = checkPrematureCompletion('pbr:researcher', {
      tool_output: output
    }, tmpDir);
    expect(result).toBeNull();
  });

  // --- Synthesizer ---
  test('synthesizer: warns on short output + missing fields', () => {
    // Create a SUMMARY.md with missing required fields
    const phaseDir = path.join(tmpDir, 'phases', '99-test');
    const summaryContent = '---\nphase: "99"\nstatus: complete\n---\nSummary content';
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY-01.md'), summaryContent);

    const result = checkPrematureCompletion('pbr:synthesizer', {
      tool_output: 'tiny'
    }, tmpDir);
    expect(result).not.toBeNull();
    expect(result.warning).toMatch(/Synthesizer/i);
    expect(result.signals.length).toBe(2);
  });

  test('synthesizer: no warning with sufficient output', () => {
    const result = checkPrematureCompletion('pbr:synthesizer', {
      tool_output: 'x'.repeat(300)
    }, tmpDir);
    expect(result).toBeNull();
  });

  // --- Multi-signal requirement ---
  test('duration_ms is optional - skips signal if not provided', () => {
    // Executor with no duration_ms and sufficient output
    const result = checkPrematureCompletion('pbr:executor', {
      tool_output: 'x'.repeat(1000)
    }, tmpDir);
    expect(result).toBeNull();
  });
});
