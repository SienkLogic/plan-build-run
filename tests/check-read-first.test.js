'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { trackRead, checkReadFirst, handleHttp, normalizePath } = require('../plugins/pbr/scripts/check-read-first');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-rf-'));
}

/**
 * Set up a minimal .planning structure with STATE.md and a PLAN file.
 */
function setupPlanningDir(tmpDir) {
  const planningDir = path.join(tmpDir, '.planning');
  const phasesDir = path.join(planningDir, 'phases', '01-test-phase');
  fs.mkdirSync(phasesDir, { recursive: true });

  // STATE.md
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), [
    '---',
    'version: 2',
    'current_phase: 1',
    'phase_name: "test-phase"',
    'status: "building"',
    '---',
    '',
    '# State'
  ].join('\n'), 'utf8');

  // PLAN-01.md with read_first and files
  const planContent = [
    '---',
    'phase: "test-phase"',
    'plan: "01-01"',
    '---',
    '',
    '<task id="01-01-T1" type="auto" complexity="medium">',
    '<name>Test task</name>',
    '<read_first>',
    'src/config.ts',
    'src/types.ts',
    '</read_first>',
    '<files>',
    'src/main.ts',
    'src/config.ts',
    '</files>',
    '<action>Do stuff</action>',
    '<acceptance_criteria>grep works</acceptance_criteria>',
    '<verify>echo ok</verify>',
    '<done>done</done>',
    '</task>'
  ].join('\n');
  fs.writeFileSync(path.join(phasesDir, 'PLAN-01.md'), planContent, 'utf8');

  // .active-skill
  fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build', 'utf8');

  return planningDir;
}

describe('check-read-first', () => {
  let tmpDir;
  let planningDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    planningDir = setupPlanningDir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('trackRead', () => {
    test('records file paths in tracker', () => {
      const data = { tool_input: { file_path: path.join(tmpDir, 'src', 'config.ts') } };
      trackRead(data, planningDir);

      const trackerPath = path.join(planningDir, '.read-first-tracker');
      expect(fs.existsSync(trackerPath)).toBe(true);

      const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
      expect(tracker.reads).toHaveLength(1);
      expect(tracker.reads[0]).toContain('src/config.ts');
    });

    test('does not duplicate reads', () => {
      const filePath = path.join(tmpDir, 'src', 'config.ts');
      const data = { tool_input: { file_path: filePath } };
      trackRead(data, planningDir);
      trackRead(data, planningDir);

      const trackerPath = path.join(planningDir, '.read-first-tracker');
      const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
      expect(tracker.reads).toHaveLength(1);
    });

    test('returns null', () => {
      const data = { tool_input: { file_path: path.join(tmpDir, 'src', 'config.ts') } };
      expect(trackRead(data, planningDir)).toBeNull();
    });
  });

  describe('checkReadFirst', () => {
    test('returns null when all read_first files were read', () => {
      // Read both required files
      trackRead({ tool_input: { file_path: path.join(tmpDir, 'src', 'config.ts') } }, planningDir);
      trackRead({ tool_input: { file_path: path.join(tmpDir, 'src', 'types.ts') } }, planningDir);

      // Now write to src/main.ts — should be fine
      const result = checkReadFirst(
        { tool_input: { file_path: path.join(tmpDir, 'src', 'main.ts') } },
        planningDir
      );
      expect(result).toBeNull();
    });

    test('warns when read_first files not read', () => {
      // Write to src/main.ts WITHOUT reading read_first files
      const result = checkReadFirst(
        { tool_input: { file_path: path.join(tmpDir, 'src', 'main.ts') } },
        planningDir
      );
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('read_first');
      expect(result.additionalContext).toContain('not read');
    });

    test('warns with specific unread files', () => {
      // Read only one of two required files
      trackRead({ tool_input: { file_path: path.join(tmpDir, 'src', 'config.ts') } }, planningDir);

      const result = checkReadFirst(
        { tool_input: { file_path: path.join(tmpDir, 'src', 'main.ts') } },
        planningDir
      );
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('types.ts');
      expect(result.additionalContext).not.toContain('config.ts');
    });

    test('returns null for non-plan files', () => {
      const result = checkReadFirst(
        { tool_input: { file_path: path.join(tmpDir, 'src', 'unrelated.ts') } },
        planningDir
      );
      expect(result).toBeNull();
    });

    test('returns null when no STATE.md', () => {
      // Remove STATE.md
      fs.unlinkSync(path.join(planningDir, 'STATE.md'));

      const result = checkReadFirst(
        { tool_input: { file_path: path.join(tmpDir, 'src', 'main.ts') } },
        planningDir
      );
      expect(result).toBeNull();
    });

    test('returns null when no data', () => {
      expect(checkReadFirst(null, planningDir)).toBeNull();
      expect(checkReadFirst({}, planningDir)).toBeNull();
      expect(checkReadFirst({ tool_input: {} }, planningDir)).toBeNull();
    });
  });

  describe('tracker resets on skill change', () => {
    test('clears old reads when skill changes', () => {
      // Track some reads under 'build' skill
      trackRead({ tool_input: { file_path: path.join(tmpDir, 'src', 'config.ts') } }, planningDir);

      // Change active skill
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'plan', 'utf8');

      // Track a new read — should have reset
      trackRead({ tool_input: { file_path: path.join(tmpDir, 'src', 'types.ts') } }, planningDir);

      const trackerPath = path.join(planningDir, '.read-first-tracker');
      const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
      expect(tracker.skill).toBe('plan');
      expect(tracker.reads).toHaveLength(1);
      expect(tracker.reads[0]).toContain('types.ts');
    });
  });

  describe('handleHttp', () => {
    test('routes Read to trackRead', () => {
      const reqBody = {
        data: {
          tool: 'Read',
          tool_input: { file_path: path.join(tmpDir, 'src', 'config.ts') }
        },
        planningDir
      };
      const result = handleHttp(reqBody, {});
      expect(result).toBeNull(); // trackRead always returns null

      // Verify the read was tracked
      const trackerPath = path.join(planningDir, '.read-first-tracker');
      const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
      expect(tracker.reads).toHaveLength(1);
    });

    test('routes Write to checkReadFirst', () => {
      const reqBody = {
        data: {
          tool: 'Write',
          tool_input: { file_path: path.join(tmpDir, 'src', 'main.ts') }
        },
        planningDir
      };
      const result = handleHttp(reqBody, {});
      // Should warn since no reads were done
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('read_first');
    });

    test('routes Edit to checkReadFirst', () => {
      const reqBody = {
        data: {
          tool: 'Edit',
          tool_input: { file_path: path.join(tmpDir, 'src', 'main.ts') }
        },
        planningDir
      };
      const result = handleHttp(reqBody, {});
      expect(result).not.toBeNull();
      expect(result.additionalContext).toContain('read_first');
    });

    test('returns null for unknown tools', () => {
      const reqBody = {
        data: {
          tool: 'Bash',
          tool_input: { command: 'echo hi' }
        },
        planningDir
      };
      expect(handleHttp(reqBody, {})).toBeNull();
    });
  });

  describe('normalizePath', () => {
    test('resolves relative paths against project root', () => {
      const result = normalizePath('src/config.ts', tmpDir);
      expect(result).toContain('src/config.ts');
      expect(path.isAbsolute(result.replace(/\//g, path.sep))).toBe(true);
    });

    test('returns empty string for empty input', () => {
      expect(normalizePath('')).toBe('');
      expect(normalizePath(null)).toBe('');
      expect(normalizePath(undefined)).toBe('');
    });
  });
});
