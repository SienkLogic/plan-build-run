/**
 * Tests for negative knowledge extraction from verification gaps (SubagentStop)
 * and surfacing relevant failures at SessionStart.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function makeTempPlanning() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-nk-hooks-'));
  const planningDir = path.join(tmp, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(
    path.join(planningDir, 'config.json'),
    JSON.stringify({ features: { negative_knowledge: true } }),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(planningDir, 'STATE.md'),
    '---\ncurrent_phase: 3\n---\n# State\n## Current Position\nPhase: 3 of 5\nStatus: building\n',
    'utf-8'
  );
  return { tmp, planningDir };
}

function cleanup(tmp) {
  fs.rmSync(tmp, { recursive: true, force: true });
}

function writeVerification(planningDir, content) {
  const phaseDir = path.join(planningDir, 'phases', '03-test-phase');
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), content, 'utf-8');
  return phaseDir;
}

// ─── Task 1: Extraction from verification gaps ──────────────────────────────

let extractNegativeKnowledge;

beforeAll(() => {
  const mod = require('../plugins/pbr/scripts/event-handler');
  extractNegativeKnowledge = mod.extractNegativeKnowledge;
});

describe('extractNegativeKnowledge', () => {
  test('creates negative knowledge entries from VERIFICATION.md with gaps', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const phaseDir = writeVerification(planningDir, `---
status: failed
gaps:
  - "Missing error handling in auth module"
  - "No test coverage for edge cases"
---

## Results

### Gap: Missing error handling in auth module
Files: src/auth/handler.ts, src/auth/middleware.ts
The auth module lacks try-catch blocks around async operations.

### Gap: No test coverage for edge cases
Files: src/utils/parser.ts
Edge cases for empty input and malformed data are not tested.
`);

      const config = { features: { negative_knowledge: true } };
      extractNegativeKnowledge(planningDir, phaseDir, config);

      const nkDir = path.join(planningDir, 'negative-knowledge');
      expect(fs.existsSync(nkDir)).toBe(true);
      const files = fs.readdirSync(nkDir).filter(f => f.endsWith('.md'));
      expect(files.length).toBe(2);

      // Check that entries have verification-gap category
      const content = fs.readFileSync(path.join(nkDir, files[0]), 'utf-8');
      expect(content).toContain('category: verification-gap');
    } finally {
      cleanup(tmp);
    }
  });

  test('populates files_involved from gap file references', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const phaseDir = writeVerification(planningDir, `---
status: failed
gaps:
  - "Missing validation"
---

### Gap: Missing validation
Files: src/api/routes.ts, src/api/validators.ts
Validation is incomplete.
`);

      const config = { features: { negative_knowledge: true } };
      extractNegativeKnowledge(planningDir, phaseDir, config);

      const nkDir = path.join(planningDir, 'negative-knowledge');
      const files = fs.readdirSync(nkDir).filter(f => f.endsWith('.md'));
      expect(files.length).toBe(1);

      const content = fs.readFileSync(path.join(nkDir, files[0]), 'utf-8');
      expect(content).toContain('src/api/routes.ts');
      expect(content).toContain('src/api/validators.ts');
    } finally {
      cleanup(tmp);
    }
  });

  test('skips extraction when features.negative_knowledge is false', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const phaseDir = writeVerification(planningDir, `---
status: failed
gaps:
  - "Some gap"
---

### Gap: Some gap
Files: src/foo.ts
Description here.
`);

      const config = { features: { negative_knowledge: false } };
      extractNegativeKnowledge(planningDir, phaseDir, config);

      const nkDir = path.join(planningDir, 'negative-knowledge');
      expect(fs.existsSync(nkDir)).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  test('skips extraction when VERIFICATION.md has no gaps', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const phaseDir = writeVerification(planningDir, `---
status: passed
---

## Results

All checks passed. No issues found.
`);

      const config = { features: { negative_knowledge: true } };
      extractNegativeKnowledge(planningDir, phaseDir, config);

      const nkDir = path.join(planningDir, 'negative-knowledge');
      expect(fs.existsSync(nkDir)).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });

  test('handles table-format gaps in VERIFICATION.md', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const phaseDir = writeVerification(planningDir, `---
status: failed
gaps:
  - "Table gap entry"
---

## Gaps

| Gap | Files | Evidence |
|-----|-------|----------|
| Table gap entry | src/db/conn.ts | Connection pool not closed |
`);

      const config = { features: { negative_knowledge: true } };
      extractNegativeKnowledge(planningDir, phaseDir, config);

      const nkDir = path.join(planningDir, 'negative-knowledge');
      const files = fs.readdirSync(nkDir).filter(f => f.endsWith('.md'));
      expect(files.length).toBe(1);

      const content = fs.readFileSync(path.join(nkDir, files[0]), 'utf-8');
      expect(content).toContain('category: verification-gap');
      expect(content).toContain('src/db/conn.ts');
    } finally {
      cleanup(tmp);
    }
  });

  test('skips when config has no features section', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const phaseDir = writeVerification(planningDir, `---
status: failed
gaps:
  - "A gap"
---

### Gap: A gap
Files: src/x.ts
Something.
`);

      const config = { depth: 'standard' };
      extractNegativeKnowledge(planningDir, phaseDir, config);

      const nkDir = path.join(planningDir, 'negative-knowledge');
      expect(fs.existsSync(nkDir)).toBe(false);
    } finally {
      cleanup(tmp);
    }
  });
});

// ─── Task 2: Surfacing failures at SessionStart ─────────────────────────────

let getNegativeKnowledgeBriefing;

beforeAll(() => {
  const mod = require('../plugins/pbr/scripts/progress-tracker');
  getNegativeKnowledgeBriefing = mod.getNegativeKnowledgeBriefing;
});

describe('getNegativeKnowledgeBriefing', () => {
  test('surfaces entries when working set overlaps files_involved', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      // Create a negative knowledge entry
      const nkDir = path.join(planningDir, 'negative-knowledge');
      fs.mkdirSync(nkDir, { recursive: true });
      fs.writeFileSync(path.join(nkDir, '2026-03-15-auth-failure.md'), `---
date: 2026-03-15
title: Auth handler missing error handling
category: verification-gap
files_involved:
  - src/auth/jwt.ts
  - src/auth/handler.ts
phase: "3"
status: active
---

## What Was Tried

Added JWT validation without error boundaries.

## Why It Failed

Unhandled promise rejections crash the server.

## What Worked Instead

Pending resolution.
`, 'utf-8');

      const config = { features: { negative_knowledge: true } };
      const workingSet = ['src/auth/jwt.ts', 'src/other/file.ts'];
      const result = getNegativeKnowledgeBriefing(planningDir, config, workingSet);

      expect(result).toContain('Past failures in related files');
      expect(result).toContain('Auth handler missing error handling');
    } finally {
      cleanup(tmp);
    }
  });

  test('limits to max 3 entries, most recent first', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const nkDir = path.join(planningDir, 'negative-knowledge');
      fs.mkdirSync(nkDir, { recursive: true });

      // Create 4 entries all matching the same file
      for (let i = 1; i <= 4; i++) {
        fs.writeFileSync(path.join(nkDir, `2026-03-${String(i).padStart(2, '0')}-entry-${i}.md`), `---
date: 2026-03-${String(i).padStart(2, '0')}
title: Entry ${i}
category: verification-gap
files_involved:
  - src/shared/utils.ts
phase: "3"
status: active
---

## What Was Tried

Attempt ${i}.

## Why It Failed

Reason ${i}.

## What Worked Instead

Pending.
`, 'utf-8');
      }

      const config = { features: { negative_knowledge: true } };
      const workingSet = ['src/shared/utils.ts'];
      const result = getNegativeKnowledgeBriefing(planningDir, config, workingSet);

      // Should have exactly 3 entries
      const entryLines = result.split('\n').filter(l => l.startsWith('- 2026'));
      expect(entryLines.length).toBe(3);

      // Most recent first (Entry 4, 3, 2)
      expect(entryLines[0]).toContain('Entry 4');
      expect(entryLines[1]).toContain('Entry 3');
      expect(entryLines[2]).toContain('Entry 2');
    } finally {
      cleanup(tmp);
    }
  });

  test('returns empty string when no file overlap', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const nkDir = path.join(planningDir, 'negative-knowledge');
      fs.mkdirSync(nkDir, { recursive: true });
      fs.writeFileSync(path.join(nkDir, '2026-03-10-unrelated.md'), `---
date: 2026-03-10
title: Unrelated failure
category: verification-gap
files_involved:
  - src/completely/different.ts
phase: "1"
status: active
---

## What Was Tried

Something.

## Why It Failed

Reason.

## What Worked Instead

Pending.
`, 'utf-8');

      const config = { features: { negative_knowledge: true } };
      const workingSet = ['src/auth/jwt.ts'];
      const result = getNegativeKnowledgeBriefing(planningDir, config, workingSet);

      expect(result).toBe('');
    } finally {
      cleanup(tmp);
    }
  });

  test('returns empty string when features.negative_knowledge is false', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const nkDir = path.join(planningDir, 'negative-knowledge');
      fs.mkdirSync(nkDir, { recursive: true });
      fs.writeFileSync(path.join(nkDir, '2026-03-10-test.md'), `---
date: 2026-03-10
title: Test failure
category: verification-gap
files_involved:
  - src/auth/jwt.ts
phase: "1"
status: active
---

## What Was Tried

Something.

## Why It Failed

Reason.

## What Worked Instead

Pending.
`, 'utf-8');

      const config = { features: { negative_knowledge: false } };
      const workingSet = ['src/auth/jwt.ts'];
      const result = getNegativeKnowledgeBriefing(planningDir, config, workingSet);

      expect(result).toBe('');
    } finally {
      cleanup(tmp);
    }
  });

  test('returns empty string when working set is empty', () => {
    const { tmp, planningDir } = makeTempPlanning();
    try {
      const config = { features: { negative_knowledge: true } };
      const result = getNegativeKnowledgeBriefing(planningDir, config, []);
      expect(result).toBe('');
    } finally {
      cleanup(tmp);
    }
  });
});
