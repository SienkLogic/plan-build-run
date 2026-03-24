// Consolidated from check-plan-format.test.js + check-plan-format-unit.test.js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createRunner } = require('./helpers');


const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'check-plan-format.js');
const _run = createRunner(SCRIPT);
const runScript = (input, cwd) => _run(input, { cwd });

const { checkPlanWrite, checkStateWrite, validatePlan, validateSummary, validateVerification, validateState, validateRoadmap, validateContext, syncStateBody } = require('../plugins/pbr/scripts/check-plan-format');

let tmpDir;
let planningDir;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cpfu-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
});

afterEach(async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Helper: build a minimal valid plan string with optional overrides
function buildValidPlan({ frontmatterExtra = '', taskContent = null } = {}) {
  const task = taskContent !== null ? taskContent : `<task type="auto">
  <name>Task 1</name>
  <read_first>
    src/file.ts
  </read_first>
  <files>src/file.ts</files>
  <action>Do something</action>
  <acceptance_criteria>
    grep -q "something" src/file.ts
  </acceptance_criteria>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
  return `---
phase: 03-auth
plan: 01
wave: 1
implements: []
must_haves:
  truths: ["Something works"]
  artifacts: ["src/file.ts"]
  key_links: []
${frontmatterExtra}---

${task}`;
}

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
    const filePath = path.join(tmpDir, 'PLAN-test.md');
    fs.writeFileSync(filePath, `---
phase: 01-setup
plan: 01
wave: 1
type: feature
depends_on: []
files_modified: ["src/file.ts"]
autonomous: true
implements: [42]
must_haves:
  truths: ["works"]
  artifacts: ["file.ts"]
  key_links: []
---
<task type="auto">
  <name>Task 1</name>
  <read_first>src/file.ts</read_first>
  <files>src/file.ts</files>
  <action>Do it</action>
  <acceptance_criteria>test -f src/file.ts</acceptance_criteria>
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
satisfied: []
unsatisfied: []
---
## Observable Truths
All truths verified.

## Must-Have Verification
All must-haves passed.

## Summary
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
  test('returns null for non-STATE.md files', async () => {
    expect(await checkStateWrite({ tool_input: { file_path: path.join(tmpDir, 'PLAN.md') } })).toBeNull();
  });

  test('returns null when STATE.md does not exist', async () => {
    expect(await checkStateWrite({ tool_input: { file_path: path.join(tmpDir, 'STATE.md') } })).toBeNull();
  });

  test('returns warnings for STATE.md missing fields', async () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, '---\nversion: 2\n---\n# State');
    const result = await checkStateWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('current_phase');
  });

  test('returns null for valid STATE.md', async () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, '---\nversion: 2\ncurrent_phase: 1\nphase_slug: "test"\nstatus: "planned"\n---\n# State');
    expect(await checkStateWrite({ tool_input: { file_path: filePath } })).toBeNull();
  });

  test('returns warnings for STATE.md without frontmatter', async () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, '# State\nNo frontmatter');
    const result = await checkStateWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('frontmatter');
  });
});

describe('validatePlan additional paths', () => {
  test('unclosed frontmatter is an error', async () => {
    const content = '---\nphase: 01\nplan: 01\n';
    const result = validatePlan(content, 'PLAN.md');
    expect(result.errors).toContain('Unclosed YAML frontmatter');
  });

  test('missing must_haves is an error', async () => {
    const content = `---
phase: 01
plan: 01
wave: 1
---
<task type="auto">
  <name>T1</name>
  <read_first>f</read_first>
  <files>f</files>
  <action>a</action>
  <acceptance_criteria>test -f f</acceptance_criteria>
  <verify>v</verify>
  <done>d</done>
</task>`;
    const result = validatePlan(content, 'PLAN.md');
    expect(result.errors.some(e => e.includes('must_haves'))).toBe(true);
  });
});

describe('validateSummary additional paths', () => {
  test('unclosed frontmatter is an error', async () => {
    const result = validateSummary('---\nphase: 01\n', 'SUMMARY.md');
    expect(result.errors).toContain('Unclosed YAML frontmatter');
  });
});

describe('checkPlanWrite — ROADMAP.md path', () => {
  test('returns errors for ROADMAP.md missing heading', async () => {
    const filePath = path.join(tmpDir, 'ROADMAP.md');
    fs.writeFileSync(filePath, '## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** none\n');
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('Roadmap');
  });

  test('returns null for valid ROADMAP.md', async () => {
    const filePath = path.join(tmpDir, 'ROADMAP.md');
    fs.writeFileSync(filePath, '# Roadmap\n## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** none\n**Requirements:** REQ-1\n**Success Criteria:** Tests pass\n- [ ] Phase 1: Setup\n**Requirement coverage:** 5/5\n');
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).toBeNull();
  });
});

describe('validateRoadmap branch coverage', () => {
  const { validateRoadmap } = require('../plugins/pbr/scripts/check-plan-format');

  test('errors when no milestone sections exist', async () => {
    const result = validateRoadmap('# Roadmap\nSome text but no milestones', 'ROADMAP.md');
    expect(result.errors.some(w => w.includes('No "## Milestone:"'))).toBe(true);
  });

  test('warns when milestone missing Phases line', async () => {
    const result = validateRoadmap('# Roadmap\n## Milestone: v1\nNo phases line here\n', 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('Phases'))).toBe(true);
    expect(result.errors.some(e => e.includes('Phases'))).toBe(false);
  });

  test('warns when phase missing Provides', async () => {
    const content = '# Roadmap\n## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Depends on:** none\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('missing "**Provides:**"'))).toBe(true);
  });

  test('warns when phase missing Depends on', async () => {
    const content = '# Roadmap\n## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Provides:** y\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('missing "**Depends on:**"'))).toBe(true);
  });

  test('warns on progress table missing separator row', async () => {
    const content = '# Roadmap\n## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** none\n## Progress\n| Phase | Plans Complete |\n| data | data |\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('separator row'))).toBe(true);
  });

  test('warns on progress table missing header row', async () => {
    const content = '# Roadmap\n## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** none\n## Progress\nSome text but no table header\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('Plans Complete'))).toBe(true);
  });

  test('valid progress table passes', async () => {
    const content = '# Roadmap\n## Milestone: v1\n**Phases:**\n### Phase 1: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** none\n**Requirements:** REQ-1\n**Success Criteria:** Tests pass\n- [ ] Phase 1: Setup\n**Requirement coverage:** 5/5\n## Progress\n| Phase | Plans Complete |\n|---|---|\n| 1 | yes |\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.length).toBe(0);
  });
});

// LLM enrichment branch tests removed — local-llm feature deprecated in phase 53

describe('checkStateWrite — syncStateBody branch', () => {
  const { syncStateBody } = require('../plugins/pbr/scripts/check-plan-format');

  test('returns null when no frontmatter', async () => {
    expect(await syncStateBody('# State\nNo frontmatter', '/tmp/STATE.md')).toBeNull();
  });

  test('returns null when unclosed frontmatter', async () => {
    expect(await syncStateBody('---\ncurrent_phase: 1\n', '/tmp/STATE.md')).toBeNull();
  });

  test('returns null when no current_phase in frontmatter', async () => {
    expect(await syncStateBody('---\nversion: 2\n---\n# State', '/tmp/STATE.md')).toBeNull();
  });

  test('returns null when body matches frontmatter (all fields)', async () => {
    const content = '---\ncurrent_phase: 2\nstatus: "building"\n---\nPhase: 2 of 5\nStatus: Building';
    expect(await syncStateBody(content, '/tmp/STATE.md')).toBeNull();
  });

  test('detects and fixes body phase and status drift', async () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    const content = '---\ncurrent_phase: 3\nphase_name: "auth"\nstatus: "building"\n---\nPhase: 2 of 5\nStatus: Planning';
    fs.writeFileSync(filePath, content);
    const result = await syncStateBody(content, filePath);
    expect(result).not.toBeNull();
    expect(result.message).toContain('Auto-fixed body drift');
    expect(result.content).toContain('Phase: 3 of 5');
    expect(result.content).toContain('Status: Building');
  });

  test('fixes status-only drift (no phase drift)', async () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    const content = '---\ncurrent_phase: 2\nstatus: "verified"\n---\nPhase: 2 of 5\nStatus: Building';
    fs.writeFileSync(filePath, content);
    const result = await syncStateBody(content, filePath);
    expect(result).not.toBeNull();
    expect(result.message).toContain('status');
    expect(result.content).toContain('Status: Verified');
  });

  test('fixes plans_complete drift', async () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    const content = '---\ncurrent_phase: 2\nstatus: "building"\nplans_complete: 3\n---\nPhase: 2 of 5\nPlan: 1 of 4 in current phase\nStatus: Building';
    fs.writeFileSync(filePath, content);
    const result = await syncStateBody(content, filePath);
    expect(result).not.toBeNull();
    expect(result.content).toMatch(/^Plan: 3 of 4/m);
  });

  test('fixes progress_percent drift', async () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    const content = '---\ncurrent_phase: 2\nstatus: "building"\nprogress_percent: 60\n---\nPhase: 2 of 5\nStatus: Building\nProgress: [████░░░░░░░░░░░░░░░░] 20%';
    fs.writeFileSync(filePath, content);
    const result = await syncStateBody(content, filePath);
    expect(result).not.toBeNull();
    expect(result.content).toMatch(/60%/);
  });

  test('checkStateWrite warns on long STATE.md', async () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    const longContent = '---\nversion: 2\ncurrent_phase: 1\nphase_slug: "test"\nstatus: "planned"\n---\n' + 'line\n'.repeat(200);
    fs.writeFileSync(filePath, longContent);
    const result = await checkStateWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('exceeds 100-line cap');
  });
});

describe('validateVerification branch coverage', () => {
  const { validateVerification } = require('../plugins/pbr/scripts/check-plan-format');

  test('unclosed frontmatter is an error', async () => {
    const result = validateVerification('---\nstatus: passed\n', 'VERIFICATION.md');
    expect(result.errors).toContain('Unclosed YAML frontmatter');
  });

  // Phase 66: satisfied/unsatisfied advisory tests — these are WARNINGS not blocking errors
  test('validateVerification: missing satisfied field produces advisory warning', async () => {
    const content = `---
status: passed
phase: 03-auth
checked_at: 2026-03-06T00:00:00Z
must_haves_checked: 3
must_haves_passed: 3
must_haves_failed: 0
unsatisfied: []
---
Body`;
    const result = validateVerification(content, 'VERIFICATION.md');
    // Must be in warnings (advisory), not errors (blocking)
    const satisfiedWarning = result.warnings.find(w => /satisfied/i.test(w));
    expect(satisfiedWarning).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  test('validateVerification: missing unsatisfied field produces advisory warning', async () => {
    const content = `---
status: passed
phase: 03-auth
checked_at: 2026-03-06T00:00:00Z
must_haves_checked: 3
must_haves_passed: 3
must_haves_failed: 0
satisfied: []
---
Body`;
    const result = validateVerification(content, 'VERIFICATION.md');
    // Must be in warnings (advisory), not errors (blocking)
    const unsatisfiedWarning = result.warnings.find(w => /unsatisfied/i.test(w));
    expect(unsatisfiedWarning).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  test('validateVerification: satisfied and unsatisfied present produce no advisory warnings for those fields', async () => {
    const content = `---
status: passed
phase: 03-auth
checked_at: 2026-03-06T00:00:00Z
must_haves_checked: 3
must_haves_passed: 3
must_haves_failed: 0
satisfied: []
unsatisfied: []
---
Body`;
    const result = validateVerification(content, 'VERIFICATION.md');
    // Neither satisfied nor unsatisfied should appear in warnings
    const satisfiedWarning = result.warnings.find(w => /\bsatisfied\b/i.test(w));
    expect(satisfiedWarning).toBeUndefined();
    const unsatisfiedWarning = result.warnings.find(w => /\bunsatisfied\b/i.test(w));
    expect(unsatisfiedWarning).toBeUndefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('validateLearnings (deprecated — warnings only)', () => {
  const { validateLearnings } = require('../plugins/pbr/scripts/check-plan-format');

  test('always returns deprecation warning for any LEARNINGS.md', async () => {
    const content = `---
phase: "cross-phase-knowledge"
key_insights:
  - "Insight 1"
patterns:
  - "Pattern 1"
---
## Key Insights
- Insight 1`;
    const result = validateLearnings(content, 'LEARNINGS.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => /deprecated/i.test(w))).toBe(true);
    expect(result.warnings.some(w => /KNOWLEDGE\.md/i.test(w))).toBe(true);
  });

  test('returns warnings (not errors) for valid LEARNINGS.md with all fields', async () => {
    const content = `---
phase: "cross-phase-knowledge"
key_insights:
  - "Insight 1"
patterns:
  - "Pattern 1"
---
## Key Insights
- Insight 1`;
    const result = validateLearnings(content, 'LEARNINGS.md');
    expect(result.errors).toHaveLength(0);
    // Only the deprecation warning for a fully valid file
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  test('warns (not errors) when frontmatter is missing', async () => {
    const result = validateLearnings('# No frontmatter', 'LEARNINGS.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => /frontmatter/i.test(w))).toBe(true);
  });

  test('warns when phase field is missing', async () => {
    const content = `---
key_insights:
  - "Insight 1"
patterns:
  - "Pattern 1"
---
Body`;
    const result = validateLearnings(content, 'LEARNINGS.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => /phase/i.test(w))).toBe(true);
  });

  test('warns when key_insights field is missing', async () => {
    const content = `---
phase: "test"
patterns:
  - "Pattern 1"
---
Body`;
    const result = validateLearnings(content, 'LEARNINGS.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => /key_insights/i.test(w))).toBe(true);
  });

  test('warns when patterns field is missing', async () => {
    const content = `---
phase: "test"
key_insights:
  - "Insight 1"
---
Body`;
    const result = validateLearnings(content, 'LEARNINGS.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => /patterns/i.test(w))).toBe(true);
  });

  test('missing fields are warnings not errors (deprecation)', async () => {
    const result = validateLearnings('no frontmatter at all', 'LEARNINGS.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('unclosed frontmatter is a warning', async () => {
    const result = validateLearnings('---\nphase: 1\nno closing', 'LEARNINGS.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => /unclosed/i.test(w))).toBe(true);
  });

  test('warns on invalid cross_project value', async () => {
    const content = '---\nphase: 1\nkey_insights:\n  - x\npatterns:\n  - y\ncross_project: maybe\n---\nbody';
    const result = validateLearnings(content, 'LEARNINGS.md');
    expect(result.warnings.some(w => /cross_project/i.test(w))).toBe(true);
  });
});

describe('validateConfig', () => {
  const { validateConfig } = require('../plugins/pbr/scripts/check-plan-format');

  test('valid config passes', async () => {
    const content = JSON.stringify({ planning: { depth: 'standard' } });
    const result = validateConfig(content, 'config.json');
    expect(result.errors).toHaveLength(0);
  });

  test('invalid JSON errors', async () => {
    const result = validateConfig('not json {{{', 'config.json');
    expect(result.errors.some(e => /invalid json/i.test(e))).toBe(true);
  });

  test('non-object errors', async () => {
    const result = validateConfig('[]', 'config.json');
    expect(result.errors.some(e => /must be a JSON object/i.test(e))).toBe(true);
  });

  test('empty object passes without errors', async () => {
    const result = validateConfig('{}', 'config.json');
    expect(result.errors).toHaveLength(0);
  });

  test('valid depth value passes', async () => {
    const content = JSON.stringify({ depth: 'standard' });
    const result = validateConfig(content, 'config.json');
    expect(result.errors).toHaveLength(0);
  });

  test('unexpected depth value warns', async () => {
    const content = JSON.stringify({ depth: 'extreme' });
    const result = validateConfig(content, 'config.json');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => /extreme/i.test(w))).toBe(true);
  });

  test('unknown top-level key warns', async () => {
    const content = JSON.stringify({ planning: { depth: 'standard' }, mystery: true });
    const result = validateConfig(content, 'config.json');
    expect(result.warnings.some(w => /mystery/i.test(w))).toBe(true);
  });

  test('null value errors', async () => {
    const result = validateConfig('null', 'config.json');
    expect(result.errors.some(e => /must be a JSON object/i.test(e))).toBe(true);
  });
});

describe('validateResearch', () => {
  const { validateResearch } = require('../plugins/pbr/scripts/check-plan-format');

  test('valid research passes', async () => {
    const content = '---\nconfidence: high\nsources_checked: 5\nphase: 1\n---\n# Research';
    const result = validateResearch(content, 'RESEARCH.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('missing frontmatter errors', async () => {
    const result = validateResearch('# No frontmatter', 'RESEARCH.md');
    expect(result.errors.some(e => /frontmatter/i.test(e))).toBe(true);
  });

  test('unclosed frontmatter errors', async () => {
    const result = validateResearch('---\nconfidence: high\nno closing', 'RESEARCH.md');
    expect(result.errors.some(e => /unclosed/i.test(e))).toBe(true);
  });

  test('missing confidence errors', async () => {
    const content = '---\nsources_checked: 5\n---\nbody';
    const result = validateResearch(content, 'RESEARCH.md');
    expect(result.errors.some(e => /confidence/i.test(e))).toBe(true);
  });

  test('missing sources_checked errors', async () => {
    const content = '---\nconfidence: high\n---\nbody';
    const result = validateResearch(content, 'RESEARCH.md');
    expect(result.errors.some(e => /sources_checked/i.test(e))).toBe(true);
  });

  test('missing phase warns', async () => {
    const content = '---\nconfidence: high\nsources_checked: 5\n---\nbody';
    const result = validateResearch(content, 'RESEARCH.md');
    expect(result.warnings.some(w => /phase/i.test(w))).toBe(true);
  });
});

// --- Tests from base file (comprehensive validatePlan, validateSummary, etc.) ---

describe('validatePlan (comprehensive)', () => {
  test('valid plan with all elements returns no errors or warnings', async () => {
    const content = `---
phase: 03-auth
plan: 01
wave: 1
type: feature
depends_on: []
files_modified: ["src/auth.ts"]
autonomous: true
implements: [114]
must_haves:
  truths: ["Users can log in"]
  artifacts: ["src/auth.ts"]
  key_links: []
---

<objective>
Create authentication middleware
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Create auth middleware</name>
  <read_first>
    src/auth/types.ts
  </read_first>
  <files>src/auth/middleware.ts</files>
  <action>Create JWT verification middleware</action>
  <acceptance_criteria>
    grep -q "requireAuth" src/auth/middleware.ts
  </acceptance_criteria>
  <verify>npm test -- auth.test.ts</verify>
  <done>Auth middleware validates JWT tokens</done>
</task>

<task type="auto">
  <name>Task 2: Create login endpoint</name>
  <read_first>
    src/auth/middleware.ts
  </read_first>
  <files>src/auth/login.ts</files>
  <action>Create POST /login endpoint</action>
  <acceptance_criteria>
    grep -q "login" src/auth/login.ts
  </acceptance_criteria>
  <verify>curl -X POST localhost:3000/login</verify>
  <done>Login returns JWT token</done>
</task>

</tasks>`;
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('missing frontmatter is an error', async () => {
    const content = `# Plan without frontmatter

<tasks>
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>
</tasks>`;
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors).toContain('Missing YAML frontmatter');
  });

  test('missing required frontmatter fields are errors', async () => {
    const content = `---
phase: 03-auth
---

<tasks>
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>
</tasks>`;
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors).toContain('Frontmatter missing "plan" field');
    expect(result.errors).toContain('Frontmatter missing "wave" field');
  });

  test('too many tasks is an error', async () => {
    const tasks = Array(4).fill(`
<task type="auto">
  <name>Task N</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>`).join('\n');

    const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<tasks>
${tasks}
</tasks>`;
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors.some(i => i.includes('Too many tasks'))).toBe(true);
  });

  test('task missing verify element is an error', async () => {
    const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<tasks>
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <done>Done</done>
</task>
</tasks>`;
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors.some(i => i.includes('missing <verify>'))).toBe(true);
  });

  test('task missing name element is an error', async () => {
    const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<tasks>
<task type="auto">
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>
</tasks>`;
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors.some(i => i.includes('missing <name>'))).toBe(true);
  });

  test('checkpoint tasks skip standard validation', async () => {
    const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<tasks>
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>

<task type="checkpoint:human-verify">
  <what-built>Auth system</what-built>
  <how-to-verify>Visit /login</how-to-verify>
  <resume-signal>Type approved</resume-signal>
</task>
</tasks>`;
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors.filter(i => i.includes('Task 2'))).toEqual([]);
  });

  test('no tasks at all is an error', async () => {
    const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<objective>
Something with no tasks
</objective>`;
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors).toContain('No <task> elements found');
  });

  test('exactly 3 tasks is valid', async () => {
    const tasks = Array(3).fill(`
<task type="auto">
  <name>Task N</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>`).join('\n');

    const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<tasks>
${tasks}
</tasks>`;
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors.filter(i => i.includes('Too many'))).toEqual([]);
  });

  test('plan validation returns warnings array (currently empty for plans)', async () => {
    const content = `---
phase: 03-auth
plan: 01
wave: 1
---

<tasks>
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>test</verify>
  <done>Done</done>
</task>
</tasks>`;
    const result = validatePlan(content, 'test-PLAN.md');
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test('missing implements: field produces blocking error', async () => {
    const content = `---
phase: 03-auth
plan: 01
wave: 1
must_haves:
  truths: ["Something works"]
  artifacts: ["src/file.ts"]
  key_links: []
---
<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
    const result = validatePlan(content, 'test-PLAN.md');
    const implementsError = result.errors.find(e => /implements/i.test(e));
    expect(implementsError).toBeDefined();
    const implementsWarning = result.warnings.find(w => /implements/i.test(w));
    expect(implementsWarning).toBeUndefined();
  });

  test('implements:[] present produces no implements error', async () => {
    const content = buildValidPlan();
    const result = validatePlan(content, 'test-PLAN.md');
    const implementsError = result.errors.find(e => /implements/i.test(e));
    expect(implementsError).toBeUndefined();
  });

  test('feature task missing behavior element produces blocking error', async () => {
    const taskContent = `<task type="auto">
  <name>Task 1</name>
  <files>src/feature.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
  <feature>
    <implementation>Implement it</implementation>
  </feature>
</task>`;
    const content = buildValidPlan({ taskContent });
    const result = validatePlan(content, 'test-PLAN.md');
    const behaviorError = result.errors.find(e => /behavior/i.test(e));
    expect(behaviorError).toBeDefined();
  });

  test('feature task missing implementation element produces blocking error', async () => {
    const taskContent = `<task type="auto">
  <name>Task 1</name>
  <files>src/feature.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
  <feature>
    <behavior>Expected behavior here</behavior>
  </feature>
</task>`;
    const content = buildValidPlan({ taskContent });
    const result = validatePlan(content, 'test-PLAN.md');
    const implementationError = result.errors.find(e => /implementation/i.test(e));
    expect(implementationError).toBeDefined();
  });

  test('valid feature task with behavior and implementation passes', async () => {
    const taskContent = `<task type="auto">
  <name>Task 1</name>
  <files>src/feature.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
  <feature>
    <behavior>Expected behavior here</behavior>
    <implementation>How it is implemented</implementation>
  </feature>
</task>`;
    const content = buildValidPlan({ taskContent });
    const result = validatePlan(content, 'test-PLAN.md');
    const behaviorError = result.errors.find(e => /behavior/i.test(e));
    expect(behaviorError).toBeUndefined();
    const implementationError = result.errors.find(e => /implementation/i.test(e));
    expect(implementationError).toBeUndefined();
  });

  test('plan missing type field produces error', async () => {
    const content = buildValidPlan({ frontmatterExtra: 'depends_on: []\nfiles_modified: ["src/a.ts"]\nautonomous: true\n' });
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors).toContain('Frontmatter missing "type" field');
  });

  test('plan missing depends_on field produces error', async () => {
    const content = buildValidPlan({ frontmatterExtra: 'type: feature\nfiles_modified: ["src/a.ts"]\nautonomous: true\n' });
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors).toContain('Frontmatter missing "depends_on" field');
  });

  test('plan missing files_modified field produces error', async () => {
    const content = buildValidPlan({ frontmatterExtra: 'type: feature\ndepends_on: []\nautonomous: true\n' });
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors).toContain('Frontmatter missing "files_modified" field');
  });

  test('plan missing autonomous field produces error', async () => {
    const content = buildValidPlan({ frontmatterExtra: 'type: feature\ndepends_on: []\nfiles_modified: ["src/a.ts"]\n' });
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors).toContain('Frontmatter missing "autonomous" field');
  });

  test('plan with invalid type value produces warning', async () => {
    const content = buildValidPlan({ frontmatterExtra: 'type: banana\ndepends_on: []\nfiles_modified: ["src/a.ts"]\nautonomous: true\n' });
    const result = validatePlan(content, 'test-PLAN.md');
    const typeWarning = result.warnings.find(w => w.includes('Unexpected type value'));
    expect(typeWarning).toBeDefined();
    expect(typeWarning).toContain('banana');
  });

  test('plan with all 7 canonical fields passes without new errors', async () => {
    const content = buildValidPlan({ frontmatterExtra: 'type: feature\ndepends_on: []\nfiles_modified: ["src/a.ts"]\nautonomous: true\n' });
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors).toEqual([]);
  });

  test('existing plans with phase/plan/wave/must_haves/implements still pass', async () => {
    const content = buildValidPlan();
    const result = validatePlan(content, 'test-PLAN.md');
    expect(result.errors.find(e => /phase/.test(e))).toBeUndefined();
    expect(result.errors.find(e => /plan"/.test(e))).toBeUndefined();
    expect(result.errors.find(e => /wave/.test(e))).toBeUndefined();
    expect(result.errors.find(e => /must_haves/.test(e))).toBeUndefined();
    expect(result.errors.find(e => /implements/.test(e))).toBeUndefined();
  });

  test('must_haves without truths produces warning', async () => {
    const content = `---
phase: 03-auth
plan: 01
wave: 1
type: feature
depends_on: []
files_modified: ["src/a.ts"]
autonomous: true
implements: []
must_haves:
  artifacts:
    - path: "src/a.ts"
  key_links: []
---
<task type="auto">
  <name>Task 1</name>
  <files>src/a.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
    const result = validatePlan(content, 'test-PLAN.md');
    const truthsWarning = result.warnings.find(w => w.includes('must_haves missing "truths"'));
    expect(truthsWarning).toBeDefined();
  });

  test('must_haves without artifacts produces warning', async () => {
    const content = `---
phase: 03-auth
plan: 01
wave: 1
type: feature
depends_on: []
files_modified: ["src/a.ts"]
autonomous: true
implements: []
must_haves:
  truths: ["Something works"]
  key_links: []
---
<task type="auto">
  <name>Task 1</name>
  <files>src/a.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
    const result = validatePlan(content, 'test-PLAN.md');
    const artifactsWarning = result.warnings.find(w => w.includes('must_haves missing "artifacts"'));
    expect(artifactsWarning).toBeDefined();
  });

  test('must_haves without key_links produces warning', async () => {
    const content = `---
phase: 03-auth
plan: 01
wave: 1
type: feature
depends_on: []
files_modified: ["src/a.ts"]
autonomous: true
implements: []
must_haves:
  truths: ["Something works"]
  artifacts:
    - path: "src/a.ts"
---
<task type="auto">
  <name>Task 1</name>
  <files>src/a.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
    const result = validatePlan(content, 'test-PLAN.md');
    const keyLinksWarning = result.warnings.find(w => w.includes('must_haves missing "key_links"'));
    expect(keyLinksWarning).toBeDefined();
  });

  test('must_haves with all 3 sub-fields and valid content passes', async () => {
    const content = buildValidPlan({ frontmatterExtra: 'type: feature\ndepends_on: []\nfiles_modified: ["src/a.ts"]\nautonomous: true\n' });
    const result = validatePlan(content, 'test-PLAN.md');
    const mustHaveWarnings = result.warnings.filter(w => w.includes('must_haves missing'));
    expect(mustHaveWarnings).toHaveLength(0);
  });

  test('plan with read_first and acceptance_criteria passes validation', async () => {
    const taskContent = `<task type="auto">
  <name>Task 1</name>
  <read_first>
    src/auth/types.ts
  </read_first>
  <files>src/file.ts</files>
  <action>Do something</action>
  <acceptance_criteria>
    grep -q "doSomething" src/file.ts
  </acceptance_criteria>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
    const content = buildValidPlan({ taskContent });
    const result = validatePlan(content, 'test-PLAN.md');
    const rfError = result.errors.find(e => /read_first/i.test(e));
    expect(rfError).toBeUndefined();
    const acError = result.errors.find(e => /acceptance_criteria/i.test(e));
    expect(acError).toBeUndefined();
  });

  test('plan missing read_first produces error', async () => {
    const taskContent = `<task type="auto">
  <name>Task 1</name>
  <files>src/file.ts</files>
  <action>Do something</action>
  <acceptance_criteria>
    grep -q "doSomething" src/file.ts
  </acceptance_criteria>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
    const content = buildValidPlan({ taskContent });
    const result = validatePlan(content, 'test-PLAN.md');
    const rfError = result.errors.find(e => /read_first/i.test(e));
    expect(rfError).toBeDefined();
  });

  test('plan missing acceptance_criteria produces error', async () => {
    const taskContent = `<task type="auto">
  <name>Task 1</name>
  <read_first>
    src/auth/types.ts
  </read_first>
  <files>src/file.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
    const content = buildValidPlan({ taskContent });
    const result = validatePlan(content, 'test-PLAN.md');
    const acError = result.errors.find(e => /acceptance_criteria/i.test(e));
    expect(acError).toBeDefined();
  });

  test('plan with glob in read_first produces warning', async () => {
    const taskContent = `<task type="auto">
  <name>Task 1</name>
  <read_first>
    src/**/*.ts
  </read_first>
  <files>src/file.ts</files>
  <action>Do something</action>
  <acceptance_criteria>
    grep -q "doSomething" src/file.ts
  </acceptance_criteria>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
    const content = buildValidPlan({ taskContent });
    const result = validatePlan(content, 'test-PLAN.md');
    const globWarning = result.warnings.find(w => /read_first.*glob/i.test(w) || /read_first.*specific/i.test(w));
    expect(globWarning).toBeDefined();
  });

  test('must_haves with empty truths: [] passes (empty is valid, missing is not)', () => {
    const content = `---
phase: 03-auth
plan: 01
wave: 1
type: feature
depends_on: []
files_modified: ["src/a.ts"]
autonomous: true
implements: []
must_haves:
  truths: []
  artifacts: []
  key_links: []
---
<task type="auto">
  <name>Task 1</name>
  <files>src/a.ts</files>
  <action>Do something</action>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
    const result = validatePlan(content, 'test-PLAN.md');
    const mustHaveWarnings = result.warnings.filter(w => w.includes('must_haves missing'));
    expect(mustHaveWarnings).toHaveLength(0);
  });
});

describe('validateSummary (comprehensive)', () => {
  test('valid summary with all fields', async () => {
    const content = `---
phase: 03-auth
plan: 01
status: complete
provides: [auth-middleware]
requires: [database]
key_files:
  - package.json
deferred:
  - OAuth support
---

## Outcome
Everything worked.`;
    const result = validateSummary(content, 'SUMMARY-01.md');
    expect(result.errors).toEqual([]);
  });

  test('missing frontmatter is an error', async () => {
    const content = '# Summary\nNo frontmatter here';
    const result = validateSummary(content, 'SUMMARY-01.md');
    expect(result.errors).toContain('Missing YAML frontmatter');
  });

  test('missing required fields are errors', async () => {
    const content = `---
phase: 03-auth
---
Body`;
    const result = validateSummary(content, 'SUMMARY-01.md');
    expect(result.errors).toContain('Frontmatter missing "plan" field');
    expect(result.errors).toContain('Frontmatter missing "status" field');
    expect(result.errors).toContain('Frontmatter missing "provides" field');
    expect(result.errors).toContain('Frontmatter missing "requires" field');
    expect(result.errors).toContain('Frontmatter missing "key_files" field');
  });

  test('missing deferred field is a warning, not an error', () => {
    const content = `---
phase: 03-auth
plan: 01
status: complete
provides: [auth]
requires: []
key_files:
  - package.json
---
Body`;
    const result = validateSummary(content, 'SUMMARY-01.md');
    const deferredWarning = result.warnings.find(i => i.includes('deferred'));
    expect(deferredWarning).toBeDefined();
    const deferredError = result.errors.find(i => i.includes('deferred'));
    expect(deferredError).toBeUndefined();
  });

  test('unclosed frontmatter is an error', async () => {
    const content = '---\nphase: 03-auth\nplan: 01\n';
    const result = validateSummary(content, 'SUMMARY-01.md');
    expect(result.errors).toContain('Unclosed YAML frontmatter');
  });

  test('key_files not on disk is a warning, not an error', () => {
    const content = `---
phase: 03-auth
plan: 01
status: complete
provides: [auth]
requires: []
key_files:
  - /nonexistent/path/file.ts
deferred: []
---
Body`;
    const result = validateSummary(content, 'SUMMARY-01.md');
    const pathWarning = result.warnings.find(i => i.includes('not found on disk'));
    expect(pathWarning).toBeDefined();
    const pathError = result.errors.find(i => i.includes('not found on disk'));
    expect(pathError).toBeUndefined();
  });

  test('executor fallback format with all required fields passes validation', async () => {
    const content = `---
phase: "05-data-layer"
plan: "05-02"
status: complete
commits: ["abc1234", "def5678"]
provides: ["data access layer"]
requires: []
key_files:
  - "package.json: updated deps"
deferred: []
must_haves:
  - "DB connection: DONE"
---

## Task Results

| Task | Status | Notes |
|------|--------|-------|
| T1   | done   | Added fields |

## Deviations

None`;
    const result = validateSummary(content, 'SUMMARY-05-02.md');
    expect(result.errors).toEqual([]);
  });

  test('old executor fallback without phase/requires/key_files produces errors', async () => {
    const content = `---
plan: "05-02"
status: complete
commits: ["abc1234"]
provides: ["data access layer"]
must_haves:
  - "DB connection: DONE"
---

## Task Results

Done.`;
    const result = validateSummary(content, 'SUMMARY-05-02.md');
    expect(result.errors).toContain('Frontmatter missing "phase" field');
    expect(result.errors).toContain('Frontmatter missing "requires" field');
    expect(result.errors).toContain('Frontmatter missing "key_files" field');
  });
});

describe('validateVerification (comprehensive)', () => {
  test('valid VERIFICATION.md passes', async () => {
    const content = `---
status: passed
phase: 03-auth
checked_at: 2026-02-19T10:00:00Z
must_haves_checked: 5
must_haves_passed: 5
must_haves_failed: 0
---

## Results
All checks passed.`;
    const result = validateVerification(content, 'VERIFICATION.md');
    expect(result.errors).toEqual([]);
  });

  test('missing frontmatter produces error', async () => {
    const content = '# Verification\nNo frontmatter';
    const result = validateVerification(content, 'VERIFICATION.md');
    expect(result.errors).toContain('Missing YAML frontmatter');
  });

  test('missing status field produces error', async () => {
    const content = `---
phase: 03-auth
checked_at: 2026-02-19T10:00:00Z
must_haves_checked: 5
must_haves_passed: 5
must_haves_failed: 0
---
Body`;
    const result = validateVerification(content, 'VERIFICATION.md');
    expect(result.errors.some(e => e.includes('status'))).toBe(true);
  });

  test('missing must_haves_checked produces error', async () => {
    const content = `---
status: passed
phase: 03-auth
checked_at: 2026-02-19T10:00:00Z
must_haves_passed: 5
must_haves_failed: 0
---
Body`;
    const result = validateVerification(content, 'VERIFICATION.md');
    expect(result.errors.some(e => e.includes('must_haves_checked'))).toBe(true);
  });

  test('missing checked_at produces error', async () => {
    const content = `---
status: passed
phase: 03-auth
must_haves_checked: 5
must_haves_passed: 5
must_haves_failed: 0
---
Body`;
    const result = validateVerification(content, 'VERIFICATION.md');
    expect(result.errors.some(e => e.includes('checked_at'))).toBe(true);
  });

  test('missing must_haves_passed produces error', async () => {
    const content = `---
status: passed
phase: 03-auth
checked_at: 2026-02-19T10:00:00Z
must_haves_checked: 5
must_haves_failed: 0
---
Body`;
    const result = validateVerification(content, 'VERIFICATION.md');
    expect(result.errors.some(e => e.includes('must_haves_passed'))).toBe(true);
  });

  test('complete frontmatter with all fields produces 0 errors and 0 warnings', async () => {
    const content = `---
status: passed
phase: 03-auth
checked_at: 2026-02-19T10:00:00Z
must_haves_checked: 5
must_haves_passed: 5
must_haves_failed: 0
satisfied:
  - "REQ-F-001"
unsatisfied: []
---
## Observable Truths
All observable truths verified.

## Must-Have Verification
All must-haves passed.

## Artifact Verification
All artifacts present.

## Summary
All checks passed.`;
    const result = validateVerification(content, 'VERIFICATION.md');
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('missing satisfied produces warning not error', async () => {
    const content = `---
status: passed
phase: 03-auth
checked_at: 2026-02-19T10:00:00Z
must_haves_checked: 5
must_haves_passed: 5
must_haves_failed: 0
unsatisfied: []
---
Body`;
    const result = validateVerification(content, 'VERIFICATION.md');
    const satisfiedError = result.errors.find(e => e.includes('satisfied'));
    expect(satisfiedError).toBeUndefined();
    const satisfiedWarning = result.warnings.find(w => w.includes('satisfied'));
    expect(satisfiedWarning).toBeDefined();
  });
});

describe('validateState', () => {
  test('valid STATE.md with all required fields passes', async () => {
    const content = '---\nversion: 2\ncurrent_phase: 3\nphase_slug: "test"\nstatus: "planned"\n---\n# State\n';
    const result = validateState(content, '/fake/STATE.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('missing version field produces warning', async () => {
    const content = '---\ncurrent_phase: 3\nphase_slug: "test"\nstatus: "planned"\n---\n# State\n';
    const result = validateState(content, '/fake/STATE.md');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('version'))).toBe(true);
  });

  test('missing phase_slug produces warning', async () => {
    const content = '---\nversion: 2\ncurrent_phase: 3\nstatus: "planned"\n---\n';
    const result = validateState(content, '/fake/STATE.md');
    expect(result.warnings.some(w => w.includes('phase_slug'))).toBe(true);
  });

  test('missing frontmatter produces warning', async () => {
    const content = '# State\nNo frontmatter here';
    const result = validateState(content, '/fake/STATE.md');
    expect(result.warnings.some(w => w.includes('frontmatter'))).toBe(true);
  });

  test('unclosed frontmatter produces warning', async () => {
    const content = '---\nversion: 2\ncurrent_phase: 3\n';
    const result = validateState(content, '/fake/STATE.md');
    expect(result.warnings).toContain('Unclosed YAML frontmatter');
  });

  test('accepts all 13 primary status values without errors or warnings', async () => {
    const allStates = [
      'not_started', 'discussed', 'ready_to_plan', 'planning', 'planned',
      'ready_to_execute', 'building', 'built', 'partial', 'verified',
      'needs_fixes', 'complete', 'skipped'
    ];
    for (const status of allStates) {
      const content = `---\nversion: 2\ncurrent_phase: 1\nphase_slug: "test"\nstatus: "${status}"\n---\n# State\n`;
      const result = validateState(content, '/fake/STATE.md');
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    }
  });

  test('missing History section does not produce error or warning', async () => {
    const content = '---\nversion: 2\ncurrent_phase: 1\nphase_slug: "test"\nstatus: "building"\n---\n# State\n## Current Position\nNo history section here.\n';
    const result = validateState(content, '/fake/STATE.md');
    expect(result.errors).toHaveLength(0);
    const historyWarning = result.warnings.find(w => w.toLowerCase().includes('history'));
    expect(historyWarning).toBeUndefined();
  });

  test('velocity fields in frontmatter pass validation', async () => {
    const content = '---\nversion: 2\ncurrent_phase: 1\nphase_slug: "test"\nstatus: "building"\nvelocity: "{}"\nsession_last: "2026-03-18"\n---\n# State\n';
    const result = validateState(content, '/fake/STATE.md');
    expect(result.errors).toHaveLength(0);
  });
});

describe('validateSummary key_files path-existence warning', () => {
  test('key_files path that does not exist produces a warning, not an error', () => {
    const content = `---
phase: 03-auth
plan: 01
status: complete
provides: [auth]
requires: []
key_files:
  - /absolutely/nonexistent/path/missing-file.ts
deferred: []
---
Body`;
    const result = validateSummary(content, 'SUMMARY-01.md');
    const pathWarning = result.warnings.find(w => w.includes('not found on disk'));
    expect(pathWarning).toBeDefined();
    expect(pathWarning).toContain('missing-file.ts');
    const pathError = result.errors.find(e => e.includes('not found on disk'));
    expect(pathError).toBeUndefined();
  });

  test('key_files entry with relative path that exists on disk does not produce a warning', async () => {
    const origCwd = process.cwd();
    const tmpExistsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-kf-exists-'));
    const existingFile = path.join(tmpExistsDir, 'real-file.ts');
    fs.writeFileSync(existingFile, '// real');
    try {
      process.chdir(tmpExistsDir);
      const content = `---
phase: 03-auth
plan: 01
status: complete
provides: [auth]
requires: []
key_files:
  - real-file.ts
deferred: []
---
Body`;
      const result = validateSummary(content, 'SUMMARY-01.md');
      const pathWarning = result.warnings.find(w => w.includes('not found on disk'));
      expect(pathWarning).toBeUndefined();
    } finally {
      process.chdir(origCwd);
      fs.rmSync(tmpExistsDir, { recursive: true, force: true });
    }
  });
});

describe('VERIFICATION.md standalone write triggers validation via main()', () => {
  test('malformed VERIFICATION.md written via main() produces block decision', async () => {
    const verPath = path.join(tmpDir, 'VERIFICATION.md');
    fs.writeFileSync(verPath, '# No frontmatter here');
    const input = JSON.stringify({ tool_input: { file_path: verPath } });
    const result = runScript(input, tmpDir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.output);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('Missing YAML frontmatter');
  });

  test('valid VERIFICATION.md written via main() produces no output', async () => {
    const verPath = path.join(tmpDir, 'VERIFICATION.md');
    fs.writeFileSync(verPath, `---
status: passed
phase: 03-auth
checked_at: 2026-02-23T00:00:00Z
must_haves_checked: 3
must_haves_passed: 3
must_haves_failed: 0
satisfied: []
unsatisfied: []
---
## Observable Truths
All truths verified.

## Must-Have Verification
All must-haves passed.

## Summary
All checks passed.`);
    const input = JSON.stringify({ tool_input: { file_path: verPath } });
    const result = runScript(input, tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('');
  });
});

describe('validateRoadmap (comprehensive)', () => {
  const validRoadmap = `# Roadmap

## Milestone: v1.0 — Core Features

**Phases:** 1 - 2
**Requirement coverage:** 5/5 requirements mapped

### Phase Checklist
- [ ] Phase 01: Project Setup -- Set up project scaffolding
- [ ] Phase 02: Auth System -- Implement authentication

### Phase 01: Project Setup
**Goal:** Set up project scaffolding
**Provides:** base project structure
**Depends on:** nothing
**Requirements:** REQ-001, REQ-002
**Success Criteria:** Project builds and tests pass

### Phase 02: Auth System
**Goal:** Implement authentication
**Provides:** auth middleware
**Depends on:** Phase 01
**Requirements:** REQ-003
**Success Criteria:** Auth flow works end-to-end

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 01. Project Setup | 2/2 | Complete | 2026-02-08 |
| 02. Auth System | 0/3 | Not started | — |
`;

  test('valid ROADMAP passes with no warnings', async () => {
    const result = validateRoadmap(validRoadmap, 'ROADMAP.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('missing Roadmap heading errors', async () => {
    const content = '## Milestone: v1.0\n**Phases:**\n### Phase 01: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** z\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors.some(e => e.includes('heading'))).toBe(true);
  });

  test('missing milestone section errors', async () => {
    const content = '# Roadmap\n\nSome content but no milestone\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors.some(e => e.includes('Milestone'))).toBe(true);
  });

  test('missing Phase Goal warns', async () => {
    const content = `# Roadmap

## Milestone: v1.0

**Phases:**

### Phase 01: Setup
**Provides:** base
**Depends on:** nothing
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('Goal'))).toBe(true);
  });

  test('malformed Progress table warns', async () => {
    const content = `# Roadmap

## Milestone: v1.0

**Phases:**

### Phase 01: Setup
**Goal:** x
**Provides:** y
**Depends on:** z

## Progress

| Phase | Plans Complete | Status
01. Setup  2/2  Complete
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('table'))).toBe(true);
  });

  test('missing Phases line in milestone warns', async () => {
    const content = `# Roadmap

## Milestone: v1.0

### Phase 01: Setup
**Goal:** x
**Provides:** y
**Depends on:** z
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('Phases'))).toBe(true);
    expect(result.errors.some(e => e.includes('Phases'))).toBe(false);
  });

  test('critical structural issues are errors, minor issues are warnings', () => {
    const content = 'totally invalid content';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('roadmap with Phase Checklist and Requirement coverage passes clean', async () => {
    const content = `# Roadmap

## Milestone: v2.0

**Phases:** 1 - 2
**Requirement coverage:** 3/3 requirements mapped

### Phase Checklist
- [ ] Phase 01: Setup -- scaffold project
- [ ] Phase 02: Build -- implement core

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
**Requirements:** REQ-1
**Success Criteria:** Scaffold complete

### Phase 02: Build
**Goal:** implement
**Provides:** features
**Depends on:** Phase 01
**Requirements:** REQ-2
**Success Criteria:** Core implemented
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('missing Phase Checklist warns', async () => {
    const content = `# Roadmap

## Milestone: v2.0

**Phases:** 1 - 1
**Requirement coverage:** 2/2 requirements mapped

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('Phase Checklist'))).toBe(true);
  });

  test('missing Requirement coverage warns', async () => {
    const content = `# Roadmap

## Milestone: v2.0

**Phases:** 1 - 1

### Phase Checklist
- [ ] Phase 01: Setup -- scaffold project

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('Requirement coverage'))).toBe(true);
  });

  test('COMPLETED milestone skips checklist and coverage checks', async () => {
    const content = `# Roadmap

## Milestone: v1.0 -- COMPLETED

**Phases:** 1 - 1

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('Phase Checklist'))).toBe(false);
    expect(result.warnings.some(w => w.includes('Requirement coverage'))).toBe(false);
  });
});

describe('validateRoadmap GSD-aligned format', () => {
  test('# Roadmap: My Project heading passes validation (new format)', async () => {
    const content = `# Roadmap: My Project

## Milestone: v1.0

**Phases:** 1 - 1
**Requirement coverage:** 1/1

- [ ] Phase 01: Setup

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
**Requirements:** REQ-1
**Success Criteria:** Tests pass
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors).toHaveLength(0);
  });

  test('# Roadmap heading still passes (backward compat)', async () => {
    const content = `# Roadmap

## Milestone: v1.0

**Phases:** 1 - 1
**Requirement coverage:** 1/1

- [ ] Phase 01: Setup

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
**Requirements:** REQ-1
**Success Criteria:** Tests pass
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors).toHaveLength(0);
  });

  test('<details> wrapped milestone passes as completed', async () => {
    const content = `# Roadmap

<details>
<summary>

## Milestone: v1.0 -- COMPLETED

</summary>

**Phases:** 1 - 1

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing

</details>

## Milestone: v2.0

**Phases:** 2 - 2
**Requirement coverage:** 1/1

- [ ] Phase 02: Build

### Phase 02: Build
**Goal:** implement
**Provides:** features
**Depends on:** Phase 01
**Requirements:** REQ-2
**Success Criteria:** Build succeeds
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors).toHaveLength(0);
    // The completed milestone should not trigger checklist/coverage warnings
    expect(result.warnings.filter(w => w.includes('Milestone 1'))).toHaveLength(0);
  });

  test('phase with Requirements field passes without Requirements warning', async () => {
    const content = `# Roadmap

## Milestone: v1.0

**Phases:** 1 - 1
**Requirement coverage:** 1/1

- [ ] Phase 01: Setup

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
**Requirements:** REQ-F-001
**Success Criteria:** Tests pass
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('Requirements'))).toBe(false);
  });

  test('phase missing Requirements triggers warning (not error)', async () => {
    const content = `# Roadmap

## Milestone: v1.0

**Phases:** 1 - 1
**Requirement coverage:** 1/1

- [ ] Phase 01: Setup

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
**Success Criteria:** Tests pass
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors.some(e => e.includes('Requirements'))).toBe(false);
    expect(result.warnings.some(w => w.includes('Requirements'))).toBe(true);
  });

  test('phase with Success Criteria field passes without Success Criteria warning', async () => {
    const content = `# Roadmap

## Milestone: v1.0

**Phases:** 1 - 1
**Requirement coverage:** 1/1

- [ ] Phase 01: Setup

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
**Requirements:** REQ-1
**Success Criteria:** All tests green
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('Success Criteria'))).toBe(false);
  });

  test('phase missing Success Criteria triggers warning (not error)', async () => {
    const content = `# Roadmap

## Milestone: v1.0

**Phases:** 1 - 1
**Requirement coverage:** 1/1

- [ ] Phase 01: Setup

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
**Requirements:** REQ-1
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors.some(e => e.includes('Success Criteria'))).toBe(false);
    expect(result.warnings.some(w => w.includes('Success Criteria'))).toBe(true);
  });

  test('Progress table with Milestone column passes', async () => {
    const content = `# Roadmap

## Milestone: v1.0

**Phases:** 1 - 1
**Requirement coverage:** 1/1

- [ ] Phase 01: Setup

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
**Requirements:** REQ-1
**Success Criteria:** Tests pass

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 01. Setup | v1.0 | 1/1 | Complete | 2026-03-01 |
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('Progress table without Milestone column still passes (backward compat)', async () => {
    const content = `# Roadmap

## Milestone: v1.0

**Phases:** 1 - 1
**Requirement coverage:** 1/1

- [ ] Phase 01: Setup

### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
**Requirements:** REQ-1
**Success Criteria:** Tests pass

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 01. Setup | 1/1 | Complete | 2026-03-01 |
`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('validateContext GSD-aligned format', () => {
  test('CONTEXT.md with specifics and code_context passes with no warnings', async () => {
    const content = [
      '<domain>',
      'Auth domain',
      '</domain>',
      '<decisions>',
      'Use JWT',
      '</decisions>',
      '<canonical_refs>',
      'refs',
      '</canonical_refs>',
      '<deferred>',
      'deferred items',
      '</deferred>',
      '<specifics>',
      'JWT v5 library',
      '</specifics>',
      '<code_context>',
      'middleware pattern',
      '</code_context>',
    ].join('\n');
    const result = validateContext(content, '/fake/CONTEXT.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('CONTEXT.md without specifics and code_context produces warnings (backward compat)', async () => {
    const content = [
      '<domain>',
      'Auth domain',
      '</domain>',
      '<decisions>',
      'Use JWT',
      '</decisions>',
      '<canonical_refs>',
      'refs',
      '</canonical_refs>',
      '<deferred>',
      'deferred items',
      '</deferred>',
    ].join('\n');
    const result = validateContext(content, '/fake/CONTEXT.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('specifics'))).toBe(true);
    expect(result.warnings.some(w => w.includes('code_context'))).toBe(true);
  });
});

describe('checkStateWrite line count advisory', () => {
  test('STATE.md with 99 lines does not trigger line count warning', async () => {
    const lines = ['---', 'version: 2', 'current_phase: 3', 'phase_slug: "test"', 'status: "building"', '---'];
    while (lines.length < 99) lines.push('Some content line');
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, lines.join('\n'));
    const result = await checkStateWrite({ tool_input: { file_path: filePath } });
    if (result) {
      const ctx = result.output?.additionalContext || '';
      expect(ctx).not.toContain('100-line cap');
    }
  });

  test('STATE.md with 101 lines triggers advisory warning mentioning 100-line cap', async () => {
    const lines = ['---', 'version: 2', 'current_phase: 3', 'phase_slug: "test"', 'status: "building"', '---'];
    while (lines.length < 101) lines.push('Some content line');
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, lines.join('\n'));
    const result = await checkStateWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    const ctx = result.output?.additionalContext || '';
    expect(ctx).toContain('100-line cap');
    expect(ctx).toContain('101');
  });
});

describe('syncStateBody (comprehensive)', () => {
  test('fixes body when frontmatter phase differs from body phase', async () => {
    const content = [
      '---',
      'current_phase: 23',
      'phase_name: "Quality & Gap Closure"',
      'status: "planned"',
      '---',
      '# State',
      '',
      'Phase: 20 of 23 (Agent Definition Audit)',
      'Status: Not Started',
    ].join('\n');
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, content);
    const result = await syncStateBody(content, filePath);
    expect(result).not.toBeNull();
    expect(result.message).toContain('phase 20');
    expect(result.message).toContain('23');
    expect(result.content).toContain('Phase: 23 of 23 (Quality & Gap Closure)');
    expect(result.content).toContain('Status: Planned');
    const ondisk = fs.readFileSync(filePath, 'utf8');
    expect(ondisk).toContain('Phase: 23 of 23');
  });

  test('returns null when no body phase line exists', async () => {
    const content = [
      '---',
      'current_phase: 5',
      '---',
      '# State',
      'No phase line here',
    ].join('\n');
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, content);
    const result = await syncStateBody(content, filePath);
    expect(result).toBeNull();
  });

  test('uses body total when rewriting phase line (total_phases removed from frontmatter)', async () => {
    const content = [
      '---',
      'current_phase: 12',
      'phase_name: "Testing"',
      'status: "building"',
      '---',
      '',
      'Phase: 8 of 10 (Old Phase)',
      'Status: Not Started',
    ].join('\n');
    const filePath = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(filePath, content);
    const result = await syncStateBody(content, filePath);
    expect(result).not.toBeNull();
    expect(result.content).toContain('Phase: 12 of 10 (Testing)');
  });
});

describe('validateContext', () => {
  test('valid CONTEXT.md with all 6 XML sections returns no errors or warnings', async () => {
    const content = [
      '---',
      'phase: "03-auth"',
      '---',
      '',
      '# Phase Context',
      '',
      '<domain>',
      'Auth domain context',
      '</domain>',
      '',
      '<decisions>',
      'Use JWT tokens',
      '</decisions>',
      '',
      '<canonical_refs>',
      '.planning/research/auth.md',
      '</canonical_refs>',
      '',
      '<deferred>',
      'OAuth2 support deferred to v2',
      '</deferred>',
      '',
      '<specifics>',
      'JWT library: jose v5',
      '</specifics>',
      '',
      '<code_context>',
      'Auth middleware pattern in src/middleware/',
      '</code_context>',
    ].join('\n');
    const result = validateContext(content, '/fake/CONTEXT.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('missing canonical_refs section produces warning', async () => {
    const content = [
      '---',
      'phase: "03-auth"',
      '---',
      '',
      '<domain>',
      'Auth domain',
      '</domain>',
      '',
      '<decisions>',
      'Use JWT',
      '</decisions>',
      '',
      '<deferred>',
      'OAuth2 deferred',
      '</deferred>',
      '',
      '<specifics>',
      'JWT library',
      '</specifics>',
      '',
      '<code_context>',
      'middleware pattern',
      '</code_context>',
    ].join('\n');
    const result = validateContext(content, '/fake/CONTEXT.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('canonical_refs');
  });

  test('missing decisions section produces warning', async () => {
    const content = [
      '---',
      'phase: "03-auth"',
      '---',
      '',
      '<domain>',
      'Auth domain',
      '</domain>',
      '',
      '<canonical_refs>',
      'refs here',
      '</canonical_refs>',
      '',
      '<deferred>',
      'deferred items',
      '</deferred>',
      '',
      '<specifics>',
      'details',
      '</specifics>',
      '',
      '<code_context>',
      'patterns',
      '</code_context>',
    ].join('\n');
    const result = validateContext(content, '/fake/CONTEXT.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('decisions');
  });

  test('legacy markdown-header format produces no errors', async () => {
    const content = [
      '---',
      'phase: "03-auth"',
      '---',
      '',
      '## Domain',
      'Auth domain context',
      '',
      '## Decisions',
      'Use JWT tokens',
      '',
      '## Canonical References',
      'refs here',
      '',
      '## Deferred Ideas',
      'OAuth2 deferred',
      '',
      '## Specific References',
      'JWT library details',
      '',
      '## Code Patterns',
      'middleware pattern',
    ].join('\n');
    const result = validateContext(content, '/fake/CONTEXT.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('completely empty content produces error', async () => {
    const result = validateContext('', '/fake/CONTEXT.md');
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });
});

describe('validateSummary metrics warnings', () => {
  test('SUMMARY with duration and requirements-completed has no metrics warnings', async () => {
    const content = [
      '---',
      'phase: "03-auth"',
      'plan: "03-01"',
      'status: complete',
      'provides: ["auth module"]',
      'requires: []',
      'key_files:',
      '  - "src/auth.ts"',
      'deferred: []',
      'duration: 12.5',
      'requirements-completed: ["REQ-F-001"]',
      '---',
      '',
      '## Task Results',
    ].join('\n');
    const result = validateSummary(content, '/fake/SUMMARY.md');
    expect(result.errors).toHaveLength(0);
    const metricsWarnings = result.warnings.filter(w => w.includes('duration') || w.includes('requirements-completed'));
    expect(metricsWarnings).toHaveLength(0);
  });

  test('SUMMARY without duration field produces warning', async () => {
    const content = [
      '---',
      'phase: "03-auth"',
      'plan: "03-01"',
      'status: complete',
      'provides: ["auth module"]',
      'requires: []',
      'key_files:',
      '  - "src/auth.ts"',
      'deferred: []',
      'requirements-completed: ["REQ-F-001"]',
      '---',
      '',
      '## Task Results',
    ].join('\n');
    const result = validateSummary(content, '/fake/SUMMARY.md');
    const durationWarnings = result.warnings.filter(w => w.includes('duration'));
    expect(durationWarnings).toHaveLength(1);
  });

  test('SUMMARY without requirements-completed field produces warning', async () => {
    const content = [
      '---',
      'phase: "03-auth"',
      'plan: "03-01"',
      'status: complete',
      'provides: ["auth module"]',
      'requires: []',
      'key_files:',
      '  - "src/auth.ts"',
      'deferred: []',
      'duration: 12.5',
      '---',
      '',
      '## Task Results',
    ].join('\n');
    const result = validateSummary(content, '/fake/SUMMARY.md');
    const reqWarnings = result.warnings.filter(w => w.includes('requirements-completed'));
    expect(reqWarnings).toHaveLength(1);
  });
});

describe('validateSummary deviations field validation', () => {
  const { validateDeviationsField } = require('../plugins/pbr/scripts/check-plan-format');

  test('SUMMARY with valid deviations passes without error', async () => {
    const content = [
      '---',
      'phase: "03-auth"',
      'plan: "03-01"',
      'status: complete',
      'provides: ["auth module"]',
      'requires: []',
      'key_files:',
      '  - "src/auth.ts"',
      'deferred: []',
      'duration: 12.5',
      'requirements-completed: ["REQ-F-001"]',
      'deviations:',
      '  - rule: 1',
      '    action: auto',
      '    description: "Fixed typo in import"',
      '    justification: "Obvious bug"',
      '  - rule: 3',
      '    action: ask',
      '    description: "Missing API endpoint"',
      '    justification: "Blocks functionality"',
      '---',
      '',
      '## Task Results',
    ].join('\n');
    const result = validateSummary(content, '/fake/SUMMARY.md');
    expect(result.errors).toHaveLength(0);
  });

  test('SUMMARY with invalid deviation rule (rule: 5) gets error', async () => {
    const content = [
      '---',
      'phase: "03-auth"',
      'plan: "03-01"',
      'status: complete',
      'provides: ["auth module"]',
      'requires: []',
      'key_files:',
      '  - "src/auth.ts"',
      'deferred: []',
      'duration: 12.5',
      'requirements-completed: ["REQ-F-001"]',
      'deviations:',
      '  - rule: 5',
      '    action: auto',
      '    description: "Bad rule"',
      '---',
      '',
      '## Task Results',
    ].join('\n');
    const result = validateSummary(content, '/fake/SUMMARY.md');
    const ruleError = result.errors.find(e => e.includes('invalid rule'));
    expect(ruleError).toBeDefined();
    expect(ruleError).toContain('"5"');
  });

  test('SUMMARY with invalid deviation action gets error', async () => {
    const content = [
      '---',
      'phase: "03-auth"',
      'plan: "03-01"',
      'status: complete',
      'provides: ["auth module"]',
      'requires: []',
      'key_files:',
      '  - "src/auth.ts"',
      'deferred: []',
      'deviations:',
      '  - rule: 2',
      '    action: ignore',
      '    description: "Bad action"',
      '---',
      '',
      '## Task Results',
    ].join('\n');
    const result = validateSummary(content, '/fake/SUMMARY.md');
    const actionError = result.errors.find(e => e.includes('invalid action'));
    expect(actionError).toBeDefined();
    expect(actionError).toContain('"ignore"');
  });

  test('SUMMARY with empty deviations array passes', async () => {
    const content = [
      '---',
      'phase: "03-auth"',
      'plan: "03-01"',
      'status: complete',
      'provides: ["auth module"]',
      'requires: []',
      'key_files:',
      '  - "src/auth.ts"',
      'deferred: []',
      'deviations: []',
      '---',
      '',
      '## Task Results',
    ].join('\n');
    const result = validateSummary(content, '/fake/SUMMARY.md');
    const deviationErrors = result.errors.filter(e => e.includes('deviation'));
    expect(deviationErrors).toHaveLength(0);
  });

  test('validateDeviationsField returns empty for no deviations key', async () => {
    const result = validateDeviationsField('phase: 01\nplan: 01');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('validateDeviationsField warns on missing description', async () => {
    const fm = 'deviations:\n  - rule: 1\n    action: auto\n';
    const result = validateDeviationsField(fm);
    expect(result.warnings.some(w => w.includes('description'))).toBe(true);
  });
});

describe('validateVerification fix_plans and gap severity', () => {
  test('VERIFICATION with gaps_found and fix_plans produces no fix_plans warning', async () => {
    const content = [
      '---',
      'status: gaps_found',
      'phase: 03-auth',
      'checked_at: 2026-03-06T00:00:00Z',
      'must_haves_checked: 3',
      'must_haves_passed: 2',
      'must_haves_failed: 1',
      'satisfied: []',
      'unsatisfied: []',
      'fix_plans:',
      '  - gap: "Auth module missing"',
      '    effort: small',
      '    tasks: ["Add auth.ts"]',
      '---',
      'Body',
    ].join('\n');
    const result = validateVerification(content, 'VERIFICATION.md');
    const fixPlanWarning = result.warnings.find(w => w.includes('fix_plans'));
    expect(fixPlanWarning).toBeUndefined();
    expect(result.errors).toHaveLength(0);
  });

  test('VERIFICATION with gaps_found but no fix_plans gets warning', async () => {
    const content = [
      '---',
      'status: gaps_found',
      'phase: 03-auth',
      'checked_at: 2026-03-06T00:00:00Z',
      'must_haves_checked: 3',
      'must_haves_passed: 2',
      'must_haves_failed: 1',
      'satisfied: []',
      'unsatisfied: []',
      '---',
      'Body',
    ].join('\n');
    const result = validateVerification(content, 'VERIFICATION.md');
    const fixPlanWarning = result.warnings.find(w => w.includes('fix_plans'));
    expect(fixPlanWarning).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  test('VERIFICATION with status passed does not warn about fix_plans', async () => {
    const content = [
      '---',
      'status: passed',
      'phase: 03-auth',
      'checked_at: 2026-03-06T00:00:00Z',
      'must_haves_checked: 3',
      'must_haves_passed: 3',
      'must_haves_failed: 0',
      'satisfied: []',
      'unsatisfied: []',
      '---',
      'Body',
    ].join('\n');
    const result = validateVerification(content, 'VERIFICATION.md');
    const fixPlanWarning = result.warnings.find(w => w.includes('fix_plans'));
    expect(fixPlanWarning).toBeUndefined();
  });
});

describe('LLM integration smoke test', () => {
  test('check-plan-format module loads with LLM requires', async () => {
    expect(() => require('../plugins/pbr/scripts/check-plan-format')).not.toThrow();
  });

  test('validatePlan still returns structural errors without LLM', async () => {
    const { validatePlan: _vp } = require('../plugins/pbr/scripts/check-plan-format');
    const result = _vp('no frontmatter', '/fake/PLAN.md');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
