/**
 * Unit tests for corrupt/malformed state handling across PBR hook modules.
 *
 * Verifies graceful degradation (no crashes, sensible defaults) when .planning
 * files contain malformed JSON, truncated frontmatter, binary content, or empty files.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp, writePlanningFile } = require('./helpers');
const { suggestNext } = require('../hooks/lib/suggest-next');
const { statusRender } = require('../hooks/lib/status-render');
const { checkBuildDependencyGate } = require('../plugins/pbr/scripts/lib/gates/build-dependency');
const { checkReviewPlannerGate } = require('../plugins/pbr/scripts/lib/gates/review-planner');

describe('corrupt state handling', () => {
  let tmpDir, planningDir;
  const savedEnv = {};

  beforeEach(() => {
    ({ tmpDir, planningDir } = createTmpPlanning());
    savedEnv.PBR_PROJECT_ROOT = process.env.PBR_PROJECT_ROOT;
  });

  afterEach(() => {
    cleanupTmp(tmpDir);
    if (savedEnv.PBR_PROJECT_ROOT === undefined) {
      delete process.env.PBR_PROJECT_ROOT;
    } else {
      process.env.PBR_PROJECT_ROOT = savedEnv.PBR_PROJECT_ROOT;
    }
  });

  describe('malformed config.json', () => {
    test('invalid JSON => statusRender returns valid result, no crash', () => {
      writePlanningFile(planningDir, 'config.json', '{broken');
      const result = statusRender(planningDir);
      expect(result).toBeDefined();
      expect(result.project_name).toBeNull();
      expect(result.phases).toEqual([]);
    });

    test('null JSON value => statusRender no crash', () => {
      writePlanningFile(planningDir, 'config.json', 'null');
      const result = statusRender(planningDir);
      expect(result).toBeDefined();
      expect(result.project_name).toBeNull();
    });
  });

  describe('truncated STATE.md', () => {
    test('truncated mid-frontmatter => suggestNext returns valid result', () => {
      writePlanningFile(planningDir, 'STATE.md', '---\ncurrent_phase:');
      const result = suggestNext(planningDir);
      expect(result).toBeDefined();
      expect(result.command).toBeDefined();
    });

    test('truncated mid-frontmatter => statusRender returns valid result', () => {
      writePlanningFile(planningDir, 'STATE.md', '---\ncurrent_phase:');
      const result = statusRender(planningDir);
      expect(result).toBeDefined();
      expect(result.phases).toBeDefined();
    });

    test('only opening delimiter => both functions handle gracefully', () => {
      writePlanningFile(planningDir, 'STATE.md', '---');
      expect(() => suggestNext(planningDir)).not.toThrow();
      expect(() => statusRender(planningDir)).not.toThrow();
    });
  });

  describe('binary content in .planning files', () => {
    test('binary STATE.md => suggestNext no throw', () => {
      const binaryContent = Buffer.from([0x00, 0xFF, 0xFE, 0x89, 0x50, 0x4E, 0x47]);
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), binaryContent);
      expect(() => suggestNext(planningDir)).not.toThrow();
      const result = suggestNext(planningDir);
      expect(result.command).toBeDefined();
    });

    test('binary ROADMAP.md => suggestNext no throw', () => {
      const binaryContent = Buffer.from([0x00, 0xFF, 0xFE, 0x89, 0x50, 0x4E, 0x47]);
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), binaryContent);
      expect(() => suggestNext(planningDir)).not.toThrow();
    });

    test('binary VERIFICATION.md in phase => statusRender still returns', () => {
      const binaryContent = Buffer.from([0x00, 0xFF, 0xFE, 0x89, 0x50, 0x4E, 0x47]);
      writePlanningFile(planningDir, 'phases/01-setup/PLAN-01.md', '---\nplan: "01-01"\n---\n');
      fs.writeFileSync(
        path.join(planningDir, 'phases', '01-setup', 'VERIFICATION.md'),
        binaryContent
      );
      const result = statusRender(planningDir);
      expect(result).toBeDefined();
      expect(result.phases).toHaveLength(1);
    });
  });

  describe('STATE.md with valid frontmatter but missing Phase line', () => {
    test('checkBuildDependencyGate => null (graceful)', () => {
      writePlanningFile(planningDir, 'STATE.md', '---\nstatus: built\n---\n# No phase line here');
      writePlanningFile(planningDir, '.active-skill', 'build');
      process.env.PBR_PROJECT_ROOT = tmpDir;
      const result = checkBuildDependencyGate({
        tool_input: { subagent_type: 'pbr:executor' }
      });
      expect(result).toBeNull();
    });

    test('checkReviewPlannerGate => null (graceful) when no phase', () => {
      writePlanningFile(planningDir, 'STATE.md', '---\nstatus: built\n---\n# No phase line');
      writePlanningFile(planningDir, '.active-skill', 'review');
      process.env.PBR_PROJECT_ROOT = tmpDir;
      const result = checkReviewPlannerGate({
        tool_input: { subagent_type: 'pbr:planner' }
      });
      expect(result).toBeNull();
    });
  });

  describe('empty files', () => {
    test('empty STATE.md => suggestNext valid result', () => {
      writePlanningFile(planningDir, 'STATE.md', '');
      const result = suggestNext(planningDir);
      expect(result).toBeDefined();
      expect(result.command).toBeDefined();
    });

    test('empty config.json => statusRender valid result', () => {
      writePlanningFile(planningDir, 'config.json', '');
      const result = statusRender(planningDir);
      expect(result).toBeDefined();
      expect(result.project_name).toBeNull();
    });
  });

  describe('ROADMAP.md with CRLF line endings', () => {
    test('\\r\\n line endings => suggestNext parses correctly', () => {
      const roadmap = '---\r\nproject: test\r\n---\r\n\r\n### Phase 1: Setup\r\n\r\nSome content\r\n';
      writePlanningFile(planningDir, 'ROADMAP.md', roadmap);
      // Create a verified phase so "all verified" logic kicks in and scans ROADMAP
      writePlanningFile(planningDir, 'phases/01-setup/PLAN-01.md', '---\nplan: "01-01"\n---\n');
      writePlanningFile(planningDir, 'phases/01-setup/SUMMARY-01-01.md', '---\nstatus: complete\n---\n');
      writePlanningFile(planningDir, 'phases/01-setup/VERIFICATION.md', '---\nresult: passed\n---\n');
      expect(() => suggestNext(planningDir)).not.toThrow();
    });
  });
});
