'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock the LLM classify-artifact module so advisory enrichment doesn't fire in tests
jest.mock('../plugins/pbr/scripts/local-llm/operations/classify-artifact', () => ({
  classifyArtifact: jest.fn().mockResolvedValue(null)
}));

const { checkPlanWrite, checkStateWrite, validatePlan, validateSummary } = require('../plugins/pbr/scripts/check-plan-format');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cpfu-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('checkPlanWrite', () => {
  test('returns null for non-plan/summary files', async () => {
    const result = await checkPlanWrite({ tool_input: { file_path: path.join(tmpDir, 'src', 'index.ts') } });
    expect(result).toBeNull();
  });

  test('returns null when file does not exist', async () => {
    const result = await checkPlanWrite({ tool_input: { file_path: path.join(tmpDir, 'PLAN.md') } });
    expect(result).toBeNull();
  });

  test('returns block output for PLAN.md with errors', async () => {
    const filePath = path.join(tmpDir, 'PLAN.md');
    fs.writeFileSync(filePath, '# Plan without frontmatter\nNo tasks');
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('Missing YAML frontmatter');
  });

  test('returns null for valid PLAN.md', async () => {
    const filePath = path.join(tmpDir, 'test-PLAN.md');
    fs.writeFileSync(filePath, `---
phase: 01-setup
plan: 01
wave: 1
must_haves:
  truths: ["works"]
  artifacts: ["file.ts"]
  key_links: []
---
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do it</action>
  <verify>npm test</verify>
  <done>Done</done>
</task>`);
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).toBeNull();
  });

  test('returns warning output for SUMMARY.md with deferred missing', async () => {
    const filePath = path.join(tmpDir, 'SUMMARY-01.md');
    fs.writeFileSync(filePath, `---
phase: 01
plan: 01
status: complete
provides: [auth]
requires: []
key_files:
  - package.json
---
Body`);
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('deferred');
  });

  test('returns block for SUMMARY.md missing required fields', async () => {
    const filePath = path.join(tmpDir, 'SUMMARY.md');
    fs.writeFileSync(filePath, `---
phase: 01
---
Body`);
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.decision).toBe('block');
  });

  test('handles VERIFICATION.md', async () => {
    const filePath = path.join(tmpDir, 'VERIFICATION.md');
    fs.writeFileSync(filePath, '# No frontmatter');
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('Missing YAML frontmatter');
  });

  test('returns null for valid VERIFICATION.md', async () => {
    const filePath = path.join(tmpDir, 'VERIFICATION.md');
    fs.writeFileSync(filePath, `---
status: passed
phase: 01
checked_at: 2026-02-19
must_haves_checked: 3
must_haves_passed: 3
must_haves_failed: 0
---
All good`);
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).toBeNull();
  });

  test('includes warnings alongside errors for PLAN.md', async () => {
    // Plans currently don't have warnings, but we test the code path
    const filePath = path.join(tmpDir, 'PLAN.md');
    fs.writeFileSync(filePath, '# No frontmatter\nNo tasks');
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result.output.decision).toBe('block');
  });

  test('uses path field when file_path is absent', async () => {
    const filePath = path.join(tmpDir, 'PLAN.md');
    fs.writeFileSync(filePath, '# No frontmatter');
    const result = await checkPlanWrite({ tool_input: { path: filePath } });
    expect(result).not.toBeNull();
  });
});

describe('checkStateWrite', () => {
  test('returns null for non-STATE.md files', () => {
    expect(checkStateWrite({ tool_input: { file_path: path.join(tmpDir, 'PLAN.md') } })).toBeNull();
  });

  test('returns null when STATE.md does not exist', () => {
    expect(checkStateWrite({ tool_input: { file_path: path.join(tmpDir, 'STATE.md') } })).toBeNull();
  });

  test('returns warnings for STATE.md missing fields', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, '---\nversion: 2\n---\n# State');
    const result = checkStateWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('current_phase');
  });

  test('returns null for valid STATE.md', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, '---\nversion: 2\ncurrent_phase: 1\ntotal_phases: 3\nphase_slug: "test"\nstatus: "planned"\n---\n# State');
    expect(checkStateWrite({ tool_input: { file_path: filePath } })).toBeNull();
  });

  test('returns warnings for STATE.md without frontmatter', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, '# State\nNo frontmatter');
    const result = checkStateWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('frontmatter');
  });
});

describe('validatePlan additional paths', () => {
  test('unclosed frontmatter is an error', () => {
    const content = '---\nphase: 01\nplan: 01\n';
    const result = validatePlan(content, 'PLAN.md');
    expect(result.errors).toContain('Unclosed YAML frontmatter');
  });

  test('missing must_haves is an error', () => {
    const content = `---
phase: 01
plan: 01
wave: 1
---
<task type="auto">
  <name>T1</name>
  <files>f</files>
  <action>a</action>
  <verify>v</verify>
  <done>d</done>
</task>`;
    const result = validatePlan(content, 'PLAN.md');
    expect(result.errors.some(e => e.includes('must_haves'))).toBe(true);
  });
});

describe('validateSummary additional paths', () => {
  test('unclosed frontmatter is an error', () => {
    const result = validateSummary('---\nphase: 01\n', 'SUMMARY.md');
    expect(result.errors).toContain('Unclosed YAML frontmatter');
  });
});

describe('checkPlanWrite — ROADMAP.md path', () => {
  test('returns warnings for ROADMAP.md missing heading', async () => {
    const filePath = path.join(tmpDir, 'ROADMAP.md');
    fs.writeFileSync(filePath, '## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** none\n');
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('Roadmap');
  });

  test('returns null for valid ROADMAP.md', async () => {
    const filePath = path.join(tmpDir, 'ROADMAP.md');
    fs.writeFileSync(filePath, '# Roadmap\n## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** none\n');
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).toBeNull();
  });
});

describe('validateRoadmap branch coverage', () => {
  const { validateRoadmap } = require('../plugins/pbr/scripts/check-plan-format');

  test('warns when no milestone sections exist', () => {
    const result = validateRoadmap('# Roadmap\nSome text but no milestones', 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('No "## Milestone:"'))).toBe(true);
  });

  test('warns when milestone missing Phases line', () => {
    const result = validateRoadmap('# Roadmap\n## Milestone: v1\nNo phases line here\n', 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('missing "**Phases:**"'))).toBe(true);
  });

  test('warns when phase missing Provides', () => {
    const content = '# Roadmap\n## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Depends on:** none\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('missing "**Provides:**"'))).toBe(true);
  });

  test('warns when phase missing Depends on', () => {
    const content = '# Roadmap\n## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Provides:** y\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('missing "**Depends on:**"'))).toBe(true);
  });

  test('warns on progress table missing separator row', () => {
    const content = '# Roadmap\n## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** none\n## Progress\n| Phase | Plans Complete |\n| data | data |\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('separator row'))).toBe(true);
  });

  test('warns on progress table missing header row', () => {
    const content = '# Roadmap\n## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** none\n## Progress\nSome text but no table header\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('Plans Complete'))).toBe(true);
  });

  test('valid progress table passes', () => {
    const content = '# Roadmap\n## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** none\n## Progress\n| Phase | Plans Complete |\n|---|---|\n| 1 | yes |\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.length).toBe(0);
  });
});

describe('checkPlanWrite — LLM enrichment branch', () => {
  test('adds LLM classification warning when classifyArtifact returns result', async () => {
    const { classifyArtifact } = require('../plugins/pbr/scripts/local-llm/operations/classify-artifact');
    classifyArtifact.mockResolvedValueOnce({ classification: 'good', confidence: 0.95, reason: 'looks solid' });

    const filePath = path.join(tmpDir, 'test-PLAN.md');
    fs.writeFileSync(filePath, `---
phase: 01-setup
plan: 01
wave: 1
must_haves:
  truths: ["works"]
  artifacts: ["file.ts"]
  key_links: []
---
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do it</action>
  <verify>npm test</verify>
  <done>Done</done>
</task>`);
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    // With LLM result, should return a warning
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('Local LLM');
    expect(result.output.additionalContext).toContain('95%');
  });

  test('LLM classification without reason omits reason suffix', async () => {
    const { classifyArtifact } = require('../plugins/pbr/scripts/local-llm/operations/classify-artifact');
    classifyArtifact.mockResolvedValueOnce({ classification: 'ok', confidence: 0.8 });

    const filePath = path.join(tmpDir, 'test2-PLAN.md');
    fs.writeFileSync(filePath, `---
phase: 01-setup
plan: 01
wave: 1
must_haves:
  truths: ["works"]
  artifacts: ["file.ts"]
  key_links: []
---
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do it</action>
  <verify>npm test</verify>
  <done>Done</done>
</task>`);
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).not.toContain(' — ');
  });

  test('LLM error is silently ignored', async () => {
    const { classifyArtifact } = require('../plugins/pbr/scripts/local-llm/operations/classify-artifact');
    classifyArtifact.mockRejectedValueOnce(new Error('LLM down'));

    const filePath = path.join(tmpDir, 'test3-PLAN.md');
    fs.writeFileSync(filePath, `---
phase: 01-setup
plan: 01
wave: 1
must_haves:
  truths: ["works"]
  artifacts: ["file.ts"]
  key_links: []
---
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do it</action>
  <verify>npm test</verify>
  <done>Done</done>
</task>`);
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    // Should be null — no warnings since LLM error is swallowed
    expect(result).toBeNull();
  });
});

describe('checkStateWrite — syncStateBody branch', () => {
  const { syncStateBody } = require('../plugins/pbr/scripts/check-plan-format');

  test('returns null when no frontmatter', () => {
    expect(syncStateBody('# State\nNo frontmatter', '/tmp/STATE.md')).toBeNull();
  });

  test('returns null when unclosed frontmatter', () => {
    expect(syncStateBody('---\ncurrent_phase: 1\n', '/tmp/STATE.md')).toBeNull();
  });

  test('returns null when no current_phase in frontmatter', () => {
    expect(syncStateBody('---\nversion: 2\n---\n# State', '/tmp/STATE.md')).toBeNull();
  });

  test('returns null when body phase matches frontmatter', () => {
    const content = '---\ncurrent_phase: 2\ntotal_phases: 5\n---\nPhase: 2 of 5\nStatus: Building';
    expect(syncStateBody(content, '/tmp/STATE.md')).toBeNull();
  });

  test('detects and fixes body phase drift', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    const content = '---\ncurrent_phase: 3\ntotal_phases: 5\nphase_name: "auth"\nstatus: "building"\n---\nPhase: 2 of 5\nStatus: Planning';
    fs.writeFileSync(filePath, content);
    const result = syncStateBody(content, filePath);
    expect(result).not.toBeNull();
    expect(result.message).toContain('Auto-fixed body drift');
    expect(result.content).toContain('Phase: 3 of 5');
  });

  test('checkStateWrite warns on long STATE.md', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    const longContent = '---\nversion: 2\ncurrent_phase: 1\ntotal_phases: 3\nphase_slug: "test"\nstatus: "planned"\n---\n' + 'line\n'.repeat(200);
    fs.writeFileSync(filePath, longContent);
    const result = checkStateWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('exceeds 150 lines');
  });
});

describe('validateVerification branch coverage', () => {
  const { validateVerification } = require('../plugins/pbr/scripts/check-plan-format');

  test('unclosed frontmatter is an error', () => {
    const result = validateVerification('---\nstatus: passed\n', 'VERIFICATION.md');
    expect(result.errors).toContain('Unclosed YAML frontmatter');
  });
});
