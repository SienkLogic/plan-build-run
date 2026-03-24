'use strict';

/**
 * Orchestrator Budget — Tests for suggest-compact threshold scaling
 * and track-context-budget quality scoring integration.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-orch-budget-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('getScaledThreshold — orchestrator_budget_pct', () => {
  const { getScaledThreshold } = require('../plugins/pbr/scripts/suggest-compact');
  const { configClearCache } = require('../plugins/pbr/scripts/pbr-tools');

  test('threshold at 1M tokens with budget_pct=25 is higher than at 200k', async () => {
    // Write config with 1M tokens, budget_pct=25
    configClearCache();
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      context_window_tokens: 1000000,
      orchestrator_budget_pct: 25
    }));

    const threshold1M = getScaledThreshold(planningDir);

    // Write config with 200k tokens, budget_pct=25
    configClearCache();
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      context_window_tokens: 200000,
      orchestrator_budget_pct: 25
    }));

    const threshold200k = getScaledThreshold(planningDir);

    expect(threshold1M).toBeGreaterThan(threshold200k);
  });

  test('threshold at 1M tokens with budget_pct=35 is proportionally higher than budget_pct=25', async () => {
    configClearCache();
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      context_window_tokens: 1000000,
      orchestrator_budget_pct: 35
    }));
    const threshold35 = getScaledThreshold(planningDir);

    configClearCache();
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      context_window_tokens: 1000000,
      orchestrator_budget_pct: 25
    }));
    const threshold25 = getScaledThreshold(planningDir);

    expect(threshold35).toBeGreaterThan(threshold25);
    // 35/25 = 1.4x ratio
    const ratio = threshold35 / threshold25;
    expect(ratio).toBeGreaterThanOrEqual(1.3);
    expect(ratio).toBeLessThanOrEqual(1.5);
  });

  test('default budget_pct=25 preserves existing behavior at 200k tokens', async () => {
    configClearCache();
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      context_window_tokens: 200000
      // no orchestrator_budget_pct => default 25
    }));
    const threshold = getScaledThreshold(planningDir);
    expect(threshold).toBe(50); // 50 * 1 * 1 = 50
  });
});

describe('isSkipRagEligible', () => {
  const { isSkipRagEligible } = require('../plugins/pbr/scripts/context-quality');

  test('returns eligible when skip_rag=true and project is small', async () => {
    // Initialize git repo in tmpDir
    const { execSync } = require('child_process');
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });

    // Create a small file and track it
    fs.writeFileSync(path.join(tmpDir, 'index.js'), 'console.log("hello");\n');
    execSync('git add index.js', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      features: { skip_rag: true },
      skip_rag_max_lines: 50000
    }));

    const result = isSkipRagEligible(planningDir);
    expect(result.eligible).toBe(true);
    expect(result.line_count).toBeDefined();
    expect(result.line_count).toBeLessThan(50000);
  });

  test('returns not eligible when skip_rag=false', async () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      features: { skip_rag: false }
    }));

    const result = isSkipRagEligible(planningDir);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('disabled');
  });

  test('returns not eligible when project exceeds max lines', async () => {
    const { execSync } = require('child_process');
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });

    // Create a file and track it
    fs.writeFileSync(path.join(tmpDir, 'big.js'), 'x\n'.repeat(100));
    execSync('git add big.js', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      features: { skip_rag: true },
      skip_rag_max_lines: 10 // Very low threshold
    }));

    const result = isSkipRagEligible(planningDir);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('project too large');
    expect(result.max).toBe(10);
  });
});

describe('track-context-budget quality scoring integration', () => {
  const { processEvent } = require('../plugins/pbr/scripts/track-context-budget');

  test('processEvent calls quality scoring when feature is enabled', async () => {
    // Write config with quality scoring enabled and ledger enabled
    fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
      features: { context_quality_scoring: true },
      context_ledger: { enabled: true, stale_after_minutes: 60 }
    }));

    // Write STATE.md for phase detection
    fs.writeFileSync(path.join(planningDir, 'STATE.md'),
      '---\ncurrent_phase: 1\nphase_name: "01-foundation"\n---\nPhase: 1 of 1');

    // Pre-seed a ledger with entries
    const now = new Date().toISOString();
    const ledger = [
      { file: '/a.js', timestamp: now, est_tokens: 200, phase: '01-foundation' },
    ];
    fs.writeFileSync(path.join(planningDir, '.context-ledger.json'), JSON.stringify(ledger));

    // Write an active-skill file to prevent tracker reset
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');

    // Process a Read event
    const data = {
      tool_input: { file_path: path.join(tmpDir, 'test.js') },
      tool_output: 'some content here'
    };

    processEvent(data, planningDir, { pluginRoot: '' });

    // After processEvent, .context-quality.json should exist (quality scoring was triggered)
    const qualityPath = path.join(planningDir, '.context-quality.json');
    expect(fs.existsSync(qualityPath)).toBe(true);

    const report = JSON.parse(fs.readFileSync(qualityPath, 'utf8'));
    expect(report.score).toBeDefined();
    expect(report.breakdown).toBeDefined();
  });
});
