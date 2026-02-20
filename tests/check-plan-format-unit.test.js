'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

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
  test('returns null for non-plan/summary files', () => {
    const result = checkPlanWrite({ tool_input: { file_path: path.join(tmpDir, 'src', 'index.ts') } });
    expect(result).toBeNull();
  });

  test('returns null when file does not exist', () => {
    const result = checkPlanWrite({ tool_input: { file_path: path.join(tmpDir, 'PLAN.md') } });
    expect(result).toBeNull();
  });

  test('returns block output for PLAN.md with errors', () => {
    const filePath = path.join(tmpDir, 'PLAN.md');
    fs.writeFileSync(filePath, '# Plan without frontmatter\nNo tasks');
    const result = checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('Missing YAML frontmatter');
  });

  test('returns null for valid PLAN.md', () => {
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
    const result = checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).toBeNull();
  });

  test('returns warning output for SUMMARY.md with deferred missing', () => {
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
    const result = checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('deferred');
  });

  test('returns block for SUMMARY.md missing required fields', () => {
    const filePath = path.join(tmpDir, 'SUMMARY.md');
    fs.writeFileSync(filePath, `---
phase: 01
---
Body`);
    const result = checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.decision).toBe('block');
  });

  test('handles VERIFICATION.md', () => {
    const filePath = path.join(tmpDir, 'VERIFICATION.md');
    fs.writeFileSync(filePath, '# No frontmatter');
    const result = checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.decision).toBe('block');
    expect(result.output.reason).toContain('Missing YAML frontmatter');
  });

  test('returns null for valid VERIFICATION.md', () => {
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
    const result = checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).toBeNull();
  });

  test('includes warnings alongside errors for PLAN.md', () => {
    // Plans currently don't have warnings, but we test the code path
    const filePath = path.join(tmpDir, 'PLAN.md');
    fs.writeFileSync(filePath, '# No frontmatter\nNo tasks');
    const result = checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result.output.decision).toBe('block');
  });

  test('uses path field when file_path is absent', () => {
    const filePath = path.join(tmpDir, 'PLAN.md');
    fs.writeFileSync(filePath, '# No frontmatter');
    const result = checkPlanWrite({ tool_input: { path: filePath } });
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
