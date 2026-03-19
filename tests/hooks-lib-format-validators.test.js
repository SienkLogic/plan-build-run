'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock the LLM classify-artifact module
jest.mock('../hooks/local-llm/operations/classify-artifact', () => ({
  classifyArtifact: jest.fn().mockResolvedValue(null)
}));

const {
  validateMustHaves,
  PLAN_REQUIRED_FIELDS,
  PLAN_VALID_TYPES,
  validatePlan,
  validateSummary,
  validateDeviationsField,
  checkPlanWrite,
  VALID_STATE_STATUSES,
  validateState,
  validateVerification,
  checkStateWrite,
  syncStateBody,
  validateRoadmap,
  validateLearnings,
  validateConfig,
  validateResearch,
  validateContext
} = require('../hooks/lib/format-validators');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-fv-'));
  fs.mkdirSync(path.join(tmpDir, '.planning', 'logs'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// validatePlan
// ---------------------------------------------------------------------------
describe('validatePlan', () => {
  test('valid plan with all fields returns no errors', () => {
    const content = `---
phase: 01-setup
plan: 01
wave: 1
type: feature
depends_on: []
files_modified: ["src/a.ts"]
autonomous: true
implements: []
must_haves:
  truths: ["works"]
  artifacts: ["file.ts"]
  key_links: []
---
<task type="auto">
  <name>Task 1</name>
  <read_first>src/a.ts</read_first>
  <files>src/a.ts</files>
  <action>Do it</action>
  <acceptance_criteria>test -f src/a.ts</acceptance_criteria>
  <verify>npm test</verify>
  <done>Done</done>
</task>`;
    const result = validatePlan(content, 'PLAN.md');
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('missing frontmatter is an error', () => {
    const result = validatePlan('# No frontmatter\n<task><name>t</name></task>', 'PLAN.md');
    expect(result.errors).toContain('Missing YAML frontmatter');
  });

  test('unclosed frontmatter is an error', () => {
    const result = validatePlan('---\nphase: 01\n', 'PLAN.md');
    expect(result.errors).toContain('Unclosed YAML frontmatter');
  });

  test('too many tasks is an error', () => {
    const tasks = Array(4).fill('<task type="auto"><name>T</name><read_first>f</read_first><files>f</files><action>a</action><acceptance_criteria>c</acceptance_criteria><verify>v</verify><done>d</done></task>').join('\n');
    const content = `---\nphase: 01\nplan: 01\nwave: 1\ntype: feature\ndepends_on: []\nfiles_modified: []\nautonomous: true\nimplements: []\nmust_haves:\n  truths: []\n  artifacts: []\n  key_links: []\n---\n${tasks}`;
    const result = validatePlan(content, 'PLAN.md');
    expect(result.errors.some(e => e.includes('Too many tasks'))).toBe(true);
  });

  test('no tasks is an error', () => {
    const content = '---\nphase: 01\nplan: 01\nwave: 1\n---\nNo tasks here';
    const result = validatePlan(content, 'PLAN.md');
    expect(result.errors).toContain('No <task> elements found');
  });

  test('invalid type value produces warning', () => {
    const content = `---
phase: 01
plan: 01
wave: 1
type: banana
depends_on: []
files_modified: []
autonomous: true
implements: []
must_haves:
  truths: []
  artifacts: []
  key_links: []
---
<task type="auto"><name>T</name><read_first>f</read_first><files>f</files><action>a</action><acceptance_criteria>c</acceptance_criteria><verify>v</verify><done>d</done></task>`;
    const result = validatePlan(content, 'PLAN.md');
    expect(result.warnings.some(w => w.includes('banana'))).toBe(true);
  });

  test('path traversal in files produces warning', () => {
    const content = `---
phase: 01
plan: 01
wave: 1
type: feature
depends_on: []
files_modified: []
autonomous: true
implements: []
must_haves:
  truths: []
  artifacts: []
  key_links: []
---
<task type="auto"><name>T</name><read_first>f</read_first><files>../../etc/passwd</files><action>a</action><acceptance_criteria>c</acceptance_criteria><verify>v</verify><done>d</done></task>`;
    const result = validatePlan(content, 'PLAN.md');
    expect(result.warnings.some(w => w.includes('Path traversal'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateSummary
// ---------------------------------------------------------------------------
describe('validateSummary', () => {
  test('valid summary returns no errors', () => {
    const content = `---
phase: 01
plan: 01
status: complete
provides: [auth]
requires: []
key_files:
  - package.json
deferred: []
---
Body`;
    const result = validateSummary(content, 'SUMMARY.md');
    expect(result.errors).toEqual([]);
  });

  test('missing required fields are errors', () => {
    const result = validateSummary('---\nphase: 01\n---\nBody', 'SUMMARY.md');
    expect(result.errors.some(e => e.includes('plan'))).toBe(true);
    expect(result.errors.some(e => e.includes('status'))).toBe(true);
    expect(result.errors.some(e => e.includes('requires'))).toBe(true);
    expect(result.errors.some(e => e.includes('key_files'))).toBe(true);
  });

  test('missing deferred is a warning not error', () => {
    const content = '---\nphase: 01\nplan: 01\nstatus: complete\nprovides: []\nrequires: []\nkey_files:\n  - f\n---\nBody';
    const result = validateSummary(content, 'SUMMARY.md');
    expect(result.errors.find(e => e.includes('deferred'))).toBeUndefined();
    expect(result.warnings.some(w => w.includes('deferred'))).toBe(true);
  });

  test('unclosed frontmatter is an error', () => {
    const result = validateSummary('---\nphase: 01\n', 'SUMMARY.md');
    expect(result.errors).toContain('Unclosed YAML frontmatter');
  });
});

// ---------------------------------------------------------------------------
// validateVerification
// ---------------------------------------------------------------------------
describe('validateVerification', () => {
  test('valid verification returns no errors', () => {
    const content = `---
status: passed
phase: 01
checked_at: 2026-01-01
must_haves_checked: 3
must_haves_passed: 3
must_haves_failed: 0
satisfied: []
unsatisfied: []
---
Body`;
    const result = validateVerification(content, 'VERIFICATION.md');
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('missing frontmatter is an error', () => {
    const result = validateVerification('# No frontmatter', 'VERIFICATION.md');
    expect(result.errors).toContain('Missing YAML frontmatter');
  });

  test('missing status field is an error', () => {
    const content = '---\nphase: 01\nchecked_at: 2026\nmust_haves_checked: 1\nmust_haves_passed: 1\nmust_haves_failed: 0\n---\nBody';
    const result = validateVerification(content, 'VERIFICATION.md');
    expect(result.errors.some(e => e.includes('status'))).toBe(true);
  });

  test('missing satisfied/unsatisfied are warnings', () => {
    const content = '---\nstatus: passed\nphase: 01\nchecked_at: 2026\nmust_haves_checked: 1\nmust_haves_passed: 1\nmust_haves_failed: 0\n---\nBody';
    const result = validateVerification(content, 'VERIFICATION.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('satisfied'))).toBe(true);
    expect(result.warnings.some(w => w.includes('unsatisfied'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateState
// ---------------------------------------------------------------------------
describe('validateState', () => {
  test('valid state returns no warnings', () => {
    const content = '---\nversion: 2\ncurrent_phase: 1\nphase_slug: "test"\nstatus: "building"\n---\n# State';
    const result = validateState(content, 'STATE.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('missing frontmatter is a warning', () => {
    const result = validateState('# No frontmatter', 'STATE.md');
    expect(result.warnings.some(w => w.includes('frontmatter'))).toBe(true);
  });

  test('unknown status value is a warning', () => {
    const content = '---\nversion: 2\ncurrent_phase: 1\nphase_slug: "test"\nstatus: "invalid_status"\n---\nBody';
    const result = validateState(content, 'STATE.md');
    expect(result.warnings.some(w => w.includes('Unknown status'))).toBe(true);
  });

  test('VALID_STATE_STATUSES contains all 13 canonical statuses', () => {
    expect(VALID_STATE_STATUSES).toContain('not_started');
    expect(VALID_STATE_STATUSES).toContain('complete');
    expect(VALID_STATE_STATUSES).toContain('skipped');
    expect(VALID_STATE_STATUSES.length).toBeGreaterThanOrEqual(13);
  });
});

// ---------------------------------------------------------------------------
// validateRoadmap
// ---------------------------------------------------------------------------
describe('validateRoadmap', () => {
  test('valid roadmap returns no errors', () => {
    const content = `# Roadmap
## Milestone: v1.0
**Phases:** 1
**Requirement coverage:** 1/1
- [ ] Phase 01: Setup
### Phase 01: Setup
**Goal:** scaffold
**Provides:** base
**Depends on:** nothing
**Requirements:** REQ-1
**Success Criteria:** Tests pass`;
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('missing Roadmap heading is an error', () => {
    const content = '## Milestone: v1\n**Phases:**\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors.some(e => e.includes('heading'))).toBe(true);
  });

  test('no milestone sections is an error', () => {
    const result = validateRoadmap('# Roadmap\nNo milestones', 'ROADMAP.md');
    expect(result.errors.some(e => e.includes('Milestone'))).toBe(true);
  });

  test('missing Phases line in milestone is an error', () => {
    const content = '# Roadmap\n## Milestone: v1\nNo phases line\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.errors.some(e => e.includes('Phases'))).toBe(true);
  });

  test('COMPLETED milestone skips checklist checks', () => {
    const content = '# Roadmap\n## Milestone: v1 -- COMPLETED\n**Phases:** 1\n### Phase 01: Setup\n**Goal:** x\n**Provides:** y\n**Depends on:** z\n';
    const result = validateRoadmap(content, 'ROADMAP.md');
    expect(result.warnings.some(w => w.includes('Phase Checklist'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateLearnings
// ---------------------------------------------------------------------------
describe('validateLearnings', () => {
  test('always returns deprecation warning', () => {
    const content = '---\nphase: test\nkey_insights:\n  - x\npatterns:\n  - y\n---\nBody';
    const result = validateLearnings(content, 'LEARNINGS.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('deprecated'))).toBe(true);
  });

  test('missing frontmatter is a warning', () => {
    const result = validateLearnings('# No frontmatter', 'LEARNINGS.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('frontmatter'))).toBe(true);
  });

  test('missing fields are warnings', () => {
    const content = '---\nkey_insights:\n  - x\n---\nBody';
    const result = validateLearnings(content, 'LEARNINGS.md');
    expect(result.warnings.some(w => w.includes('phase'))).toBe(true);
    expect(result.warnings.some(w => w.includes('patterns'))).toBe(true);
  });

  test('invalid cross_project value warns', () => {
    const content = '---\nphase: 1\nkey_insights:\n  - x\npatterns:\n  - y\ncross_project: maybe\n---\nBody';
    const result = validateLearnings(content, 'LEARNINGS.md');
    expect(result.warnings.some(w => w.includes('cross_project'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateConfig
// ---------------------------------------------------------------------------
describe('validateConfig', () => {
  test('valid JSON object passes', () => {
    const result = validateConfig('{"depth":"standard"}', 'config.json');
    expect(result.errors).toHaveLength(0);
  });

  test('invalid JSON is an error', () => {
    const result = validateConfig('not json', 'config.json');
    expect(result.errors.some(e => e.includes('Invalid JSON'))).toBe(true);
  });

  test('non-object is an error', () => {
    const result = validateConfig('[]', 'config.json');
    expect(result.errors.some(e => e.includes('JSON object'))).toBe(true);
  });

  test('unknown key produces warning', () => {
    const result = validateConfig('{"mystery":true}', 'config.json');
    expect(result.warnings.some(w => w.includes('mystery'))).toBe(true);
  });

  test('invalid depth value warns', () => {
    const result = validateConfig('{"depth":"extreme"}', 'config.json');
    expect(result.warnings.some(w => w.includes('extreme'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateResearch
// ---------------------------------------------------------------------------
describe('validateResearch', () => {
  test('valid research passes', () => {
    const content = '---\nconfidence: high\nsources_checked: 5\nphase: 1\n---\nBody';
    const result = validateResearch(content, 'RESEARCH.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('missing frontmatter is an error', () => {
    const result = validateResearch('# No frontmatter', 'RESEARCH.md');
    expect(result.errors.some(e => e.includes('frontmatter'))).toBe(true);
  });

  test('missing confidence is an error', () => {
    const result = validateResearch('---\nsources_checked: 5\n---\nBody', 'RESEARCH.md');
    expect(result.errors.some(e => e.includes('confidence'))).toBe(true);
  });

  test('missing phase is a warning', () => {
    const result = validateResearch('---\nconfidence: high\nsources_checked: 5\n---\nBody', 'RESEARCH.md');
    expect(result.warnings.some(w => w.includes('phase'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateContext
// ---------------------------------------------------------------------------
describe('validateContext', () => {
  test('valid context with all XML sections passes', () => {
    const content = '<domain>d</domain>\n<decisions>d</decisions>\n<canonical_refs>r</canonical_refs>\n<deferred>d</deferred>\n<specifics>s</specifics>\n<code_context>c</code_context>';
    const result = validateContext(content, 'CONTEXT.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('empty content is an error', () => {
    const result = validateContext('', 'CONTEXT.md');
    expect(result.errors.some(e => e.includes('empty'))).toBe(true);
  });

  test('missing sections produce warnings', () => {
    const result = validateContext('<domain>d</domain>', 'CONTEXT.md');
    expect(result.warnings.some(w => w.includes('decisions'))).toBe(true);
    expect(result.warnings.some(w => w.includes('canonical_refs'))).toBe(true);
  });

  test('legacy markdown headings accepted', () => {
    const content = '## Domain\nd\n## Decisions\nd\n## Canonical References\nr\n## Deferred\nd\n## Specific References\ns\n## Code Patterns\nc';
    const result = validateContext(content, 'CONTEXT.md');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateMustHaves
// ---------------------------------------------------------------------------
describe('validateMustHaves', () => {
  test('all sub-fields present returns no warnings', () => {
    const fm = 'must_haves:\n  truths: []\n  artifacts: []\n  key_links: []';
    const result = validateMustHaves(fm);
    expect(result.warnings).toHaveLength(0);
  });

  test('missing truths produces warning', () => {
    const fm = 'must_haves:\n  artifacts: []\n  key_links: []';
    const result = validateMustHaves(fm);
    expect(result.warnings.some(w => w.includes('truths'))).toBe(true);
  });

  test('no must_haves key returns empty', () => {
    const result = validateMustHaves('phase: 01\nplan: 01');
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateDeviationsField
// ---------------------------------------------------------------------------
describe('validateDeviationsField', () => {
  test('no deviations key returns empty', () => {
    const result = validateDeviationsField('phase: 01');
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('empty array is valid', () => {
    const result = validateDeviationsField('deviations: []');
    expect(result.errors).toHaveLength(0);
  });

  test('invalid rule number produces error', () => {
    const fm = 'deviations:\n  - rule: 9\n    action: auto\n    description: "bad"';
    const result = validateDeviationsField(fm);
    expect(result.errors.some(e => e.includes('invalid rule'))).toBe(true);
  });

  test('invalid action produces error', () => {
    const fm = 'deviations:\n  - rule: 1\n    action: maybe\n    description: "x"';
    const result = validateDeviationsField(fm);
    expect(result.errors.some(e => e.includes('invalid action'))).toBe(true);
  });

  test('missing description produces warning', () => {
    const fm = 'deviations:\n  - rule: 1\n    action: auto';
    const result = validateDeviationsField(fm);
    expect(result.warnings.some(w => w.includes('description'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkPlanWrite — first-write awareness (Todo 015)
// ---------------------------------------------------------------------------
describe('checkPlanWrite first-write awareness', () => {
  test('returns null for file that does not exist (first write)', async () => {
    const filePath = path.join(tmpDir, 'PLAN-new.md');
    // File does NOT exist on disk — this is a first write
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).toBeNull();
  });

  test('returns block for existing file with errors (not first write)', async () => {
    const filePath = path.join(tmpDir, 'PLAN.md');
    fs.writeFileSync(filePath, '# No frontmatter\nNo tasks');
    const result = await checkPlanWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.decision).toBe('block');
  });

  test('returns null for non-plan files', async () => {
    const result = await checkPlanWrite({ tool_input: { file_path: path.join(tmpDir, 'src', 'index.ts') } });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// syncStateBody
// ---------------------------------------------------------------------------
describe('syncStateBody', () => {
  test('returns null when no frontmatter', () => {
    expect(syncStateBody('# State', '/tmp/STATE.md')).toBeNull();
  });

  test('returns null when unclosed frontmatter', () => {
    expect(syncStateBody('---\ncurrent_phase: 1\n', '/tmp/STATE.md')).toBeNull();
  });

  test('returns null when no current_phase', () => {
    expect(syncStateBody('---\nversion: 2\n---\n# State', '/tmp/STATE.md')).toBeNull();
  });

  test('returns null when body matches frontmatter', () => {
    const content = '---\ncurrent_phase: 2\nstatus: "building"\n---\nPhase: 2 of 5\nStatus: Building';
    expect(syncStateBody(content, '/tmp/STATE.md')).toBeNull();
  });

  test('detects and fixes phase drift', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    const content = '---\ncurrent_phase: 3\nphase_name: "auth"\nstatus: "building"\n---\nPhase: 2 of 5\nStatus: Planning';
    fs.writeFileSync(filePath, content);
    const result = syncStateBody(content, filePath);
    expect(result).not.toBeNull();
    expect(result.content).toContain('Phase: 3 of 5');
    expect(result.content).toContain('Status: Building');
  });

  test('fixes plans_complete drift', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    const content = '---\ncurrent_phase: 2\nstatus: "building"\nplans_complete: 3\n---\nPhase: 2 of 5\nPlan: 1 of 4\nStatus: Building';
    fs.writeFileSync(filePath, content);
    const result = syncStateBody(content, filePath);
    expect(result).not.toBeNull();
    expect(result.content).toMatch(/Plan: 3 of 4/);
  });
});

// ---------------------------------------------------------------------------
// checkStateWrite
// ---------------------------------------------------------------------------
describe('checkStateWrite', () => {
  test('returns null for non-STATE.md', () => {
    expect(checkStateWrite({ tool_input: { file_path: path.join(tmpDir, 'PLAN.md') } })).toBeNull();
  });

  test('returns null when file does not exist', () => {
    expect(checkStateWrite({ tool_input: { file_path: path.join(tmpDir, 'STATE.md') } })).toBeNull();
  });

  test('warns on STATE.md exceeding 100 lines', () => {
    const filePath = path.join(tmpDir, 'STATE.md');
    const lines = ['---', 'version: 2', 'current_phase: 1', 'phase_slug: "test"', 'status: "building"', '---'];
    while (lines.length < 101) lines.push('line');
    fs.writeFileSync(filePath, lines.join('\n'));
    const result = checkStateWrite({ tool_input: { file_path: filePath } });
    expect(result).not.toBeNull();
    expect(result.output.additionalContext).toContain('100-line cap');
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe('exported constants', () => {
  test('PLAN_REQUIRED_FIELDS has 7 fields', () => {
    expect(PLAN_REQUIRED_FIELDS).toHaveLength(7);
    expect(PLAN_REQUIRED_FIELDS).toContain('phase');
    expect(PLAN_REQUIRED_FIELDS).toContain('autonomous');
  });

  test('PLAN_VALID_TYPES has 6 types', () => {
    expect(PLAN_VALID_TYPES).toHaveLength(6);
    expect(PLAN_VALID_TYPES).toContain('feature');
    expect(PLAN_VALID_TYPES).toContain('refactor');
  });
});
