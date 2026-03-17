/**
 * Tests for decision extraction from SubagentStop agent output.
 * Validates that event-handler.js extracts decisions from agent output
 * and records them via the decisions module.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Import the extraction function (will be added to event-handler.js)
let extractDecisions, handleDecisionExtraction;

beforeAll(() => {
  const mod = require('../plugins/pbr/scripts/event-handler');
  extractDecisions = mod.extractDecisions;
  handleDecisionExtraction = mod.handleDecisionExtraction;
});

function makeTempPlanning() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-decision-ext-'));
  const planningDir = path.join(tmp, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  // Create a minimal config with decision_journal enabled
  fs.writeFileSync(
    path.join(planningDir, 'config.json'),
    JSON.stringify({ features: { decision_journal: true } }),
    'utf-8'
  );
  // Create a minimal STATE.md with phase info
  fs.writeFileSync(
    path.join(planningDir, 'STATE.md'),
    '---\ncurrent_phase: 5\n---\n# State\n## Current Position\nPhase: 5 of 10\nStatus: building\n',
    'utf-8'
  );
  return { tmp, planningDir };
}

function cleanup(tmp) {
  fs.rmSync(tmp, { recursive: true, force: true });
}

describe('extractDecisions', () => {
  test('extracts "Locked Decision:" pattern from agent output', () => {
    const output = 'Some preamble text.\nLocked Decision: Use PostgreSQL instead of MongoDB for persistence.\nFollowing text here.';
    const results = extractDecisions(output, 'executor');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('Use PostgreSQL instead of MongoDB');
    expect(results[0].agent).toBe('executor');
  });

  test('extracts "DECISION:" pattern from agent output', () => {
    const output = 'Analysis complete.\nDECISION: Adopt event sourcing pattern for audit trail because it provides immutable history.\nMore text.';
    const results = extractDecisions(output, 'planner');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('Adopt event sourcing pattern');
    expect(results[0].agent).toBe('planner');
  });

  test('extracts "chose X over Y because Z" pattern', () => {
    const output = 'After evaluation, chose Redis over Memcached because Redis supports persistence and pub/sub natively.\nDone.';
    const results = extractDecisions(output, 'executor');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('Redis');
    expect(results[0].rationale).toBeTruthy();
  });

  test('extracts "Deviation:" justification pattern', () => {
    const output = 'Task 3 status: done.\nDeviation: Used callback-based API instead of promises because the library does not support async.\nTask 4 started.';
    const results = extractDecisions(output, 'executor');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].decision).toContain('callback-based API');
  });

  test('returns empty array when no decision patterns found', () => {
    const output = 'All tasks completed successfully. No issues encountered. Everything is fine.';
    const results = extractDecisions(output, 'executor');
    expect(results).toEqual([]);
  });

  test('returns empty array when output is empty', () => {
    expect(extractDecisions('', 'executor')).toEqual([]);
    expect(extractDecisions(null, 'executor')).toEqual([]);
    expect(extractDecisions(undefined, 'executor')).toEqual([]);
  });

  test('truncates decision title to 80 chars', () => {
    const longDecision = 'Locked Decision: ' + 'A'.repeat(200) + ' because reasons.';
    const results = extractDecisions(longDecision, 'executor');
    expect(results.length).toBe(1);
    expect(results[0].decision.length).toBeLessThanOrEqual(80);
  });

  test('avoids false positives on casual use of "decided"', () => {
    // Common prose that should NOT trigger extraction
    const output = 'The team decided to take a break. I decided this looks good. We decided nothing special.';
    const results = extractDecisions(output, 'executor');
    expect(results).toEqual([]);
  });
});

describe('handleDecisionExtraction', () => {
  test('records extracted decisions to .planning/decisions/', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const agentOutput = 'Locked Decision: Use TypeScript strict mode for all new files.\nDone.';
      handleDecisionExtraction(planningDir, agentOutput, 'executor');

      const decisionsDir = path.join(planningDir, 'decisions');
      expect(fs.existsSync(decisionsDir)).toBe(true);
      const files = fs.readdirSync(decisionsDir).filter(f => f.endsWith('.md'));
      expect(files.length).toBeGreaterThanOrEqual(1);

      // Check frontmatter has agent field
      const content = fs.readFileSync(path.join(decisionsDir, files[0]), 'utf-8');
      expect(content).toContain('agent: executor');
    } finally {
      cleanup(tmp);
    }
  });

  test('skips extraction when features.decision_journal is false', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      // Override config to disable
      fs.writeFileSync(
        path.join(planningDir, 'config.json'),
        JSON.stringify({ features: { decision_journal: false } }),
        'utf-8'
      );
      const agentOutput = 'Locked Decision: Something important.\nDone.';
      handleDecisionExtraction(planningDir, agentOutput, 'executor');

      const decisionsDir = path.join(planningDir, 'decisions');
      expect(fs.existsSync(decisionsDir)).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  test('skips extraction when config has no features section', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      fs.writeFileSync(
        path.join(planningDir, 'config.json'),
        JSON.stringify({ depth: 'standard' }),
        'utf-8'
      );
      const agentOutput = 'DECISION: Important choice.\nDone.';
      handleDecisionExtraction(planningDir, agentOutput, 'executor');

      const decisionsDir = path.join(planningDir, 'decisions');
      expect(fs.existsSync(decisionsDir)).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  test('skips when agent output has no decision patterns', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      handleDecisionExtraction(planningDir, 'All good, no decisions.', 'executor');
      const decisionsDir = path.join(planningDir, 'decisions');
      expect(fs.existsSync(decisionsDir)).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });
});
