const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { checkDependencyBreaks, computeFingerprint } = require('../plugins/pbr/scripts/lib/dependency-break');

function createTempPlanning() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-dep-break-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'phases'), { recursive: true });
  return { tmpDir, planningDir };
}

function createPhaseDir(planningDir, phaseNum, slug) {
  const dirName = String(phaseNum).padStart(2, '0') + '-' + slug;
  const phaseDir = path.join(planningDir, 'phases', dirName);
  fs.mkdirSync(phaseDir, { recursive: true });
  return phaseDir;
}

function writeSummary(phaseDir, content) {
  fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), content, 'utf8');
}

function writePlan(phaseDir, planName, frontmatter) {
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n');
  fs.writeFileSync(path.join(phaseDir, planName), `---\n${yaml}\n---\n# Plan\n`, 'utf8');
}

function fingerprint(content) {
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('checkDependencyBreaks', () => {
  test('returns empty array when no downstream plans exist', async () => {
    const { tmpDir, planningDir } = createTempPlanning();
    try {
      const phase3Dir = createPhaseDir(planningDir, 3, 'core');
      writeSummary(phase3Dir, '# Summary\nAll done.');
      // No other phases with plans that depend on phase 3
      const result = checkDependencyBreaks(planningDir, 3);
      expect(result).toEqual([]);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns empty array when downstream plan has no dependency_fingerprints', async () => {
    const { tmpDir, planningDir } = createTempPlanning();
    try {
      const phase3Dir = createPhaseDir(planningDir, 3, 'core');
      writeSummary(phase3Dir, '# Summary\nAll done.');

      const phase4Dir = createPhaseDir(planningDir, 4, 'advanced');
      writePlan(phase4Dir, 'PLAN-01.md', {
        phase: '04-advanced',
        plan: '04-01'
        // No dependency_fingerprints
      });

      const result = checkDependencyBreaks(planningDir, 3);
      expect(result).toEqual([]);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns empty array when fingerprint matches (still fresh)', async () => {
    const { tmpDir, planningDir } = createTempPlanning();
    try {
      const summaryContent = '# Summary\nPhase 3 complete.';
      const phase3Dir = createPhaseDir(planningDir, 3, 'core');
      writeSummary(phase3Dir, summaryContent);

      const fp = fingerprint(summaryContent);
      const phase4Dir = createPhaseDir(planningDir, 4, 'advanced');
      writePlan(phase4Dir, 'PLAN-01.md', {
        phase: '04-advanced',
        plan: '04-01',
        dependency_fingerprints: { '3': fp }
      });

      const result = checkDependencyBreaks(planningDir, 3);
      expect(result).toEqual([]);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns break when fingerprint mismatches (stale)', async () => {
    const { tmpDir, planningDir } = createTempPlanning();
    try {
      const summaryContent = '# Summary\nPhase 3 complete — UPDATED.';
      const phase3Dir = createPhaseDir(planningDir, 3, 'core');
      writeSummary(phase3Dir, summaryContent);

      const phase4Dir = createPhaseDir(planningDir, 4, 'advanced');
      writePlan(phase4Dir, 'PLAN-01.md', {
        phase: '04-advanced',
        plan: '04-01',
        dependency_fingerprints: { '3': 'abc12345' }
      });

      const result = checkDependencyBreaks(planningDir, 3);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        plan: '04-01',
        dependsOn: 3,
        expected: 'abc12345'
      });
      expect(result[0].actual).toBe(fingerprint(summaryContent));
      expect(result[0].actual).not.toBe('abc12345');
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns only stale plans when multiple downstream exist', async () => {
    const { tmpDir, planningDir } = createTempPlanning();
    try {
      const summaryContent = '# Summary\nPhase 3 done.';
      const phase3Dir = createPhaseDir(planningDir, 3, 'core');
      writeSummary(phase3Dir, summaryContent);

      const correctFp = fingerprint(summaryContent);

      // Phase 4 — fresh
      const phase4Dir = createPhaseDir(planningDir, 4, 'fresh');
      writePlan(phase4Dir, 'PLAN-01.md', {
        phase: '04-fresh',
        plan: '04-01',
        dependency_fingerprints: { '3': correctFp }
      });

      // Phase 5 — stale
      const phase5Dir = createPhaseDir(planningDir, 5, 'stale');
      writePlan(phase5Dir, 'PLAN-01.md', {
        phase: '05-stale',
        plan: '05-01',
        dependency_fingerprints: { '3': 'oldoldold' }
      });

      // Phase 6 — also stale
      const phase6Dir = createPhaseDir(planningDir, 6, 'also-stale');
      writePlan(phase6Dir, 'PLAN-02.md', {
        phase: '06-also-stale',
        plan: '06-02',
        dependency_fingerprints: { '3': 'stale123' }
      });

      const result = checkDependencyBreaks(planningDir, 3);
      expect(result).toHaveLength(2);
      const planIds = result.map(r => r.plan).sort();
      expect(planIds).toEqual(['05-01', '06-02']);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns empty array when changed phase has no SUMMARY.md', async () => {
    const { tmpDir, planningDir } = createTempPlanning();
    try {
      // Phase 3 exists as a directory but has no SUMMARY.md
      createPhaseDir(planningDir, 3, 'core');

      const phase4Dir = createPhaseDir(planningDir, 4, 'advanced');
      writePlan(phase4Dir, 'PLAN-01.md', {
        phase: '04-advanced',
        plan: '04-01',
        dependency_fingerprints: { '3': 'abc12345' }
      });

      const result = checkDependencyBreaks(planningDir, 3);
      expect(result).toEqual([]);
    } finally {
      cleanup(tmpDir);
    }
  });
});

describe('computeFingerprint', () => {
  test('returns 8-char hex string', async () => {
    const { tmpDir, planningDir } = createTempPlanning();
    try {
      const filePath = path.join(planningDir, 'test.md');
      fs.writeFileSync(filePath, 'hello world', 'utf8');
      const fp = computeFingerprint(filePath);
      expect(fp).toMatch(/^[0-9a-f]{8}$/);
    } finally {
      cleanup(tmpDir);
    }
  });

  test('returns null for missing file', async () => {
    const fp = computeFingerprint('/nonexistent/path/file.md');
    expect(fp).toBeNull();
  });
});
