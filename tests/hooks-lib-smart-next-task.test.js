/**
 * Tests for hooks/lib/smart-next-task.js — Smart next-task suggestion.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  suggestNextTask,
  parseRoadmap,
  parseState,
  countDownstream
} = require('../plugins/pbr/scripts/lib/smart-next-task');

let tmpDir, planningDir;

beforeEach(() => {
  tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-snt-test-')));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- parseState ---

describe('parseState', () => {
  it('extracts phase info from STATE.md frontmatter', () => {
    const content = '---\ncurrent_phase: 5\nstatus: building\nplans_total: 3\nplans_complete: 1\n---\n\nBody.';
    const result = parseState(content);
    expect(result.current_phase).toBe(5);
    expect(result.status).toBe('building');
    expect(result.plans_total).toBe(3);
    expect(result.plans_complete).toBe(1);
  });

  it('returns defaults for empty content', () => {
    const result = parseState('');
    expect(result.current_phase).toBe(0);
    expect(result.status).toBe('');
    expect(result.plans_total).toBe(0);
    expect(result.plans_complete).toBe(0);
  });

  it('returns defaults for content without frontmatter', () => {
    const result = parseState('No frontmatter here.');
    expect(result.current_phase).toBe(0);
  });
});

// --- parseRoadmap ---

describe('parseRoadmap', () => {
  const SAMPLE_ROADMAP = `# Roadmap

- [x] Phase 1: Setup
- [ ] Phase 2: Core
- [ ] Phase 3: Polish

### Phase 1: Setup
**Depends on:** None

### Phase 2: Core
**Depends on:** Phase 1

### Phase 3: Polish
**Depends on:** Phase 1, Phase 2
`;

  it('parses phase sections with names', () => {
    const phases = parseRoadmap(SAMPLE_ROADMAP);
    expect(phases.size).toBe(3);
    expect(phases.get(1).name).toBe('Setup');
    expect(phases.get(2).name).toBe('Core');
    expect(phases.get(3).name).toBe('Polish');
  });

  it('parses dependencies', () => {
    const phases = parseRoadmap(SAMPLE_ROADMAP);
    expect(phases.get(1).dependsOn).toEqual([]);
    expect(phases.get(2).dependsOn).toEqual([1]);
    expect(phases.get(3).dependsOn).toEqual([1, 2]);
  });

  it('parses completion status from checklist', () => {
    const phases = parseRoadmap(SAMPLE_ROADMAP);
    expect(phases.get(1).completed).toBe(true);
    expect(phases.get(2).completed).toBe(false);
    expect(phases.get(3).completed).toBe(false);
  });

  it('returns empty map for empty content', () => {
    const phases = parseRoadmap('');
    expect(phases.size).toBe(0);
  });
});

// --- countDownstream ---

describe('countDownstream', () => {
  it('counts direct dependents', () => {
    const phases = new Map();
    phases.set(1, { name: 'A', dependsOn: [], completed: false });
    phases.set(2, { name: 'B', dependsOn: [1], completed: false });
    phases.set(3, { name: 'C', dependsOn: [1], completed: false });
    expect(countDownstream(phases, 1)).toBe(2);
  });

  it('counts transitive dependents', () => {
    const phases = new Map();
    phases.set(1, { name: 'A', dependsOn: [], completed: false });
    phases.set(2, { name: 'B', dependsOn: [1], completed: false });
    phases.set(3, { name: 'C', dependsOn: [2], completed: false });
    // Phase 1 -> Phase 2 -> Phase 3 (transitive)
    expect(countDownstream(phases, 1)).toBe(2);
  });

  it('returns 0 for a leaf phase', () => {
    const phases = new Map();
    phases.set(1, { name: 'A', dependsOn: [], completed: false });
    phases.set(2, { name: 'B', dependsOn: [1], completed: false });
    expect(countDownstream(phases, 2)).toBe(0);
  });
});

// --- suggestNextTask ---

describe('suggestNextTask', () => {
  it('returns null when ROADMAP.md does not exist', () => {
    expect(suggestNextTask(planningDir)).toBeNull();
  });

  it('suggests continuing current in-progress phase', () => {
    fs.writeFileSync(
      path.join(planningDir, 'ROADMAP.md'),
      '### Phase 1: Setup\n**Depends on:** None\n\n- [ ] Phase 1: Setup\n'
    );
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      '---\ncurrent_phase: 1\nstatus: building\n---\n'
    );
    const result = suggestNextTask(planningDir);
    expect(result).not.toBeNull();
    expect(result.phase).toBe(1);
    expect(result.reason).toContain('in progress');
    expect(result.command).toBe('/pbr:build');
  });

  it('suggests unblocked phase with most downstream dependents', () => {
    const roadmap = `
### Phase 1: Setup
**Depends on:** None

### Phase 2: Core
**Depends on:** Phase 1

### Phase 3: Polish
**Depends on:** Phase 1

### Phase 4: Final
**Depends on:** Phase 2, Phase 3

- [x] Phase 1: Setup
- [ ] Phase 2: Core
- [ ] Phase 3: Polish
- [ ] Phase 4: Final
`;
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), roadmap);
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      '---\ncurrent_phase: 1\nstatus: verified\n---\n'
    );

    const result = suggestNextTask(planningDir);
    expect(result).not.toBeNull();
    // Both phase 2 and 3 have 1 downstream (phase 4), so either is valid
    expect([2, 3]).toContain(result.phase);
  });

  it('returns null when all phases are completed', () => {
    fs.writeFileSync(
      path.join(planningDir, 'ROADMAP.md'),
      '### Phase 1: Done\n**Depends on:** None\n\n- [x] Phase 1: Done\n'
    );
    expect(suggestNextTask(planningDir)).toBeNull();
  });

  it('returns result with expected shape', () => {
    fs.writeFileSync(
      path.join(planningDir, 'ROADMAP.md'),
      '### Phase 1: Setup\n**Depends on:** None\n\n- [ ] Phase 1: Setup\n'
    );
    const result = suggestNextTask(planningDir);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('phase');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('command');
  });
});
