'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { handleCalibrate, calibrateVerifier, categorizeGap } = require('../plugins/pbr/scripts/commands/calibrate');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'calibrate-test-'));
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

describe('calibrate command', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('calibrateVerifier', () => {
    test('returns corpus_size 0 for empty milestones directory', () => {
      mkdirp(path.join(tmpDir, 'milestones'));
      const result = calibrateVerifier(tmpDir, tmpDir);
      expect(result.success).toBe(true);
      expect(result.corpus_size).toBe(0);
      expect(result.pass_rate).toBe(0);
      expect(result.output_path).toBeNull();
    });

    test('returns corpus_size 0 when milestones dir does not exist', () => {
      const result = calibrateVerifier(tmpDir, tmpDir);
      expect(result.success).toBe(true);
      expect(result.corpus_size).toBe(0);
    });

    test('reads corpus and computes pass rate from VERIFICATION.md files', () => {
      // Create two milestone VERIFICATION.md files
      const phase1Dir = path.join(tmpDir, 'milestones', 'v1.0', 'phases', '01-test');
      const phase2Dir = path.join(tmpDir, 'milestones', 'v1.0', 'phases', '02-test');
      mkdirp(phase1Dir);
      mkdirp(phase2Dir);

      fs.writeFileSync(path.join(phase1Dir, 'VERIFICATION.md'), [
        '---',
        'status: passed',
        'must_haves_checked: 5',
        'must_haves_passed: 5',
        'must_haves_failed: 0',
        '---',
        '# Verification',
        ''
      ].join('\n'), 'utf8');

      fs.writeFileSync(path.join(phase2Dir, 'VERIFICATION.md'), [
        '---',
        'status: failed',
        'must_haves_checked: 4',
        'must_haves_passed: 2',
        'must_haves_failed: 2',
        '---',
        '# Verification',
        '',
        '## Gaps',
        '',
        '### Gap 1: Missing test file for auth module',
        '',
        '**Must-have:** Tests exist',
        '**Level:** L1',
        '',
        '### Gap 2: Incomplete wiring of config loader',
        '',
        '**Must-have:** Config loads',
        '**Level:** L3',
        ''
      ].join('\n'), 'utf8');

      const result = calibrateVerifier(tmpDir, tmpDir);
      expect(result.success).toBe(true);
      expect(result.corpus_size).toBe(2);
      expect(result.pass_rate).toBe(0.5);
      expect(result.recommendations_count).toBeGreaterThan(0);
      expect(result.output_path).toBeTruthy();

      // Verify output file was created
      expect(fs.existsSync(result.output_path)).toBe(true);
      const outputContent = fs.readFileSync(result.output_path, 'utf8');
      expect(outputContent).toContain('Verifier Calibration Report');
      expect(outputContent).toContain('corpus_size: 2');
      expect(outputContent).toContain('Gap Category Distribution');
    });

    test('reads legacy milestone format (no phases subdirectory)', () => {
      const legacyDir = path.join(tmpDir, 'milestones', 'v1.0', '01-test');
      mkdirp(legacyDir);

      fs.writeFileSync(path.join(legacyDir, 'VERIFICATION.md'), [
        '---',
        'status: passed',
        'must_haves_checked: 3',
        'must_haves_passed: 3',
        'must_haves_failed: 0',
        '---',
        '# Verification',
        ''
      ].join('\n'), 'utf8');

      const result = calibrateVerifier(tmpDir, tmpDir);
      expect(result.success).toBe(true);
      expect(result.corpus_size).toBe(1);
      expect(result.pass_rate).toBe(1);
    });

    test('loads trust scores when available', () => {
      // Create a passing verification
      const phaseDir = path.join(tmpDir, 'milestones', 'v1.0', 'phases', '01-test');
      mkdirp(phaseDir);
      fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), [
        '---',
        'status: passed',
        'must_haves_checked: 3',
        'must_haves_passed: 3',
        'must_haves_failed: 0',
        '---',
        '# Verification',
        ''
      ].join('\n'), 'utf8');

      // Create trust scores
      const trustDir = path.join(tmpDir, 'trust');
      mkdirp(trustDir);
      fs.writeFileSync(path.join(trustDir, 'agent-scores.json'), JSON.stringify({
        verifier: {
          build: { pass: 8, fail: 2, rate: 0.8 }
        }
      }), 'utf8');

      const result = calibrateVerifier(tmpDir, tmpDir);
      expect(result.success).toBe(true);

      // Output should contain trust info
      const outputContent = fs.readFileSync(result.output_path, 'utf8');
      expect(outputContent).toContain('Trust Scores');
    });
  });

  describe('handleCalibrate', () => {
    test('errors on missing target', () => {
      let errorMsg = null;
      const ctx = {
        planningDir: tmpDir,
        cwd: tmpDir,
        output: () => {},
        error: (msg) => { errorMsg = msg; }
      };

      handleCalibrate(['calibrate'], ctx);
      expect(errorMsg).toContain('Usage: calibrate');
    });

    test('errors on unknown target', () => {
      let errorMsg = null;
      const ctx = {
        planningDir: tmpDir,
        cwd: tmpDir,
        output: () => {},
        error: (msg) => { errorMsg = msg; }
      };

      handleCalibrate(['calibrate', 'executor'], ctx);
      expect(errorMsg).toContain('Unknown calibration target');
      expect(errorMsg).toContain('executor');
    });

    test('calls calibrateVerifier for verifier target', () => {
      mkdirp(path.join(tmpDir, 'milestones'));
      let outputData = null;
      const ctx = {
        planningDir: tmpDir,
        cwd: tmpDir,
        output: (data) => { outputData = data; },
        error: () => {}
      };

      handleCalibrate(['calibrate', 'verifier'], ctx);
      expect(outputData).toBeTruthy();
      expect(outputData.success).toBe(true);
      expect(outputData.corpus_size).toBe(0);
    });
  });

  describe('categorizeGap', () => {
    test('categorizes missing artifact gaps', () => {
      expect(categorizeGap('Missing artifact for config module')).toBe('missing artifact');
      expect(categorizeGap('Missing file tests/auth.test.js')).toBe('missing artifact');
    });

    test('categorizes stub/incomplete gaps', () => {
      expect(categorizeGap('Stub implementation of parser')).toBe('stub/incomplete');
      expect(categorizeGap('Incomplete validation logic')).toBe('stub/incomplete');
    });

    test('categorizes missing wiring gaps', () => {
      expect(categorizeGap('Missing wiring between modules')).toBe('missing wiring');
      expect(categorizeGap('Import not connected')).toBe('missing wiring');
    });

    test('categorizes failed verification gaps', () => {
      expect(categorizeGap('Failed test execution')).toBe('failed verification');
      expect(categorizeGap('Build error in module')).toBe('failed verification');
    });

    test('categorizes missing tests gaps', () => {
      expect(categorizeGap('No test coverage for handler')).toBe('missing tests');
    });

    test('returns other for unrecognized gaps', () => {
      expect(categorizeGap('Something unusual happened')).toBe('other');
    });
  });
});
