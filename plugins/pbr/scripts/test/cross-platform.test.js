/**
 * Cross-platform tests — CRLF normalization, path construction, MSYS path regex.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { parseYamlFrontmatter } = require('../lib/core');
const { parseStateMd } = require('../lib/state');
const { parseRoadmapMd } = require('../lib/roadmap');

// --- CRLF normalization ---

describe('CRLF normalization', () => {
  const FRONTMATTER_LF = '---\nversion: 2\ncurrent_phase: 5\nstatus: "built"\n---\n# Test';
  const FRONTMATTER_CRLF = '---\r\nversion: 2\r\ncurrent_phase: 5\r\nstatus: "built"\r\n---\r\n# Test';

  it('parseYamlFrontmatter: CRLF produces same result as LF', () => {
    const lfResult = parseYamlFrontmatter(FRONTMATTER_LF);
    const crlfResult = parseYamlFrontmatter(FRONTMATTER_CRLF);
    assert.strictEqual(crlfResult.version, lfResult.version);
    assert.strictEqual(crlfResult.current_phase, lfResult.current_phase);
    assert.strictEqual(crlfResult.status, lfResult.status);
  });

  it('parseStateMd: CRLF produces same result as LF', () => {
    const STATE = '---\nversion: 2\ncurrent_phase: 3\nstatus: "building"\nprogress_percent: 50\nplans_complete: 2\nplans_total: 4\n---\n# State\nPhase: 3 of 8\nStatus: Building\nPlan: 2 of 4';
    const lfResult = parseStateMd(STATE);
    const crlfResult = parseStateMd(STATE.replace(/\n/g, '\r\n'));
    assert.strictEqual(crlfResult.current_phase, lfResult.current_phase);
    assert.strictEqual(crlfResult.status, lfResult.status);
    assert.strictEqual(crlfResult.plans_complete, lfResult.plans_complete);
  });

  it('parseRoadmapMd: CRLF produces same result as LF', () => {
    const ROADMAP = '# Roadmap\n\n## Phase Overview\n\n| Phase | Name | Goal |\n|---|---|---|\n| 01 | Setup | Init |\n| 02 | Build | Core |\n';
    const lfResult = parseRoadmapMd(ROADMAP);
    const crlfResult = parseRoadmapMd(ROADMAP.replace(/\n/g, '\r\n'));
    assert.strictEqual(crlfResult.phases.length, lfResult.phases.length);
    assert.strictEqual(crlfResult.phases[0].number, lfResult.phases[0].number);
    assert.strictEqual(crlfResult.phases[1].name, lfResult.phases[1].name);
  });

  it('mixed line endings (\\r\\n and \\n) still parse correctly', () => {
    // Simulate a file with inconsistent line endings
    const mixed = '---\r\nversion: 2\ncurrent_phase: 7\r\nstatus: "planned"\n---\n# Test';
    const result = parseYamlFrontmatter(mixed);
    assert.strictEqual(result.version, 2);
    assert.strictEqual(result.current_phase, 7);
    assert.strictEqual(result.status, 'planned');
  });
});

// --- Path construction ---

describe('path construction', () => {
  it('path.join produces valid paths on current platform', () => {
    const result = path.join('plugins', 'pbr', 'scripts', 'lib', 'state.js');
    assert.ok(result.includes('state.js'));
    // No double separators
    assert.ok(!result.includes('//'));
    assert.ok(!result.includes('\\\\'));
  });

  it('path.join handles mixed separators', () => {
    const result = path.join('plugins/pbr', 'scripts\\lib', 'core.js');
    assert.ok(result.includes('core.js'));
    assert.ok(result.includes('plugins'));
  });

  it('path.resolve produces absolute path', () => {
    const result = path.resolve('plugins', 'pbr', 'scripts');
    assert.ok(path.isAbsolute(result));
  });
});

// --- MSYS path regex ---

describe('MSYS path regex', () => {
  // This is the regex from run-hook.js bootstrap pattern
  const MSYS_REGEX = /^\/([a-zA-Z])\/(.*)/;

  function fixMsysPath(p) {
    if (!p) return p;
    const match = p.match(MSYS_REGEX);
    if (match) {
      return match[1].toUpperCase() + ':\\' + match[2].replace(/\//g, '\\');
    }
    return p;
  }

  it('converts /d/Repos/foo to D:\\Repos\\foo', () => {
    const result = fixMsysPath('/d/Repos/foo');
    assert.strictEqual(result, 'D:\\Repos\\foo');
  });

  it('converts /D/Repos/foo to D:\\Repos\\foo (case insensitive drive)', () => {
    const result = fixMsysPath('/D/Repos/foo');
    assert.strictEqual(result, 'D:\\Repos\\foo');
  });

  it('converts /c/Users/test/project to C:\\Users\\test\\project', () => {
    const result = fixMsysPath('/c/Users/test/project');
    assert.strictEqual(result, 'C:\\Users\\test\\project');
  });

  it('leaves Windows-native paths unchanged', () => {
    const result = fixMsysPath('D:\\Repos\\foo');
    assert.strictEqual(result, 'D:\\Repos\\foo');
  });

  it('leaves relative paths unchanged', () => {
    const result = fixMsysPath('plugins/pbr/scripts');
    assert.strictEqual(result, 'plugins/pbr/scripts');
  });

  it('leaves Unix absolute paths with >1 char dir unchanged', () => {
    const result = fixMsysPath('/usr/local/bin');
    assert.strictEqual(result, '/usr/local/bin');
  });

  it('handles null/empty input', () => {
    assert.strictEqual(fixMsysPath(null), null);
    assert.strictEqual(fixMsysPath(''), '');
  });

  it('handles deep nested MSYS paths', () => {
    const result = fixMsysPath('/e/Projects/my-app/plugins/pbr/scripts/lib');
    assert.strictEqual(result, 'E:\\Projects\\my-app\\plugins\\pbr\\scripts\\lib');
  });
});
