/**
 * Tests for validate-plugin-structure.js
 *
 * Since the script operates on the real plugin directory with globals,
 * we test by running it as a subprocess and checking output + exit code.
 */

const { execSync } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'validate-plugin-structure.js');

describe('validate-plugin-structure', () => {
  test('passes validation on the real PBR plugin', () => {
    const result = execSync(`node "${SCRIPT}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result).toContain('Validation complete');
    expect(result).toContain('0 errors');
  });

  test('outputs plugin name and version', () => {
    const result = execSync(`node "${SCRIPT}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result).toMatch(/Plugin: pbr v\d+\.\d+\.\d+/);
  });

  test('lists all expected skills', () => {
    const result = execSync(`node "${SCRIPT}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    const expectedSkills = [
      'begin', 'build', 'config', 'continue', 'debug', 'discuss',
      'explore', 'health', 'help', 'import', 'milestone', 'note',
      'pause', 'plan', 'quick', 'resume', 'review', 'scan',
      'setup', 'status', 'todo',
    ];
    for (const skill of expectedSkills) {
      expect(result).toContain(`Skill: /pbr:${skill}`);
    }
  });

  test('lists all expected agents', () => {
    const result = execSync(`node "${SCRIPT}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    const expectedAgents = [
      'researcher', 'planner', 'plan-checker', 'executor', 'verifier',
      'integration-checker', 'debugger', 'codebase-mapper', 'synthesizer', 'general',
    ];
    for (const agent of expectedAgents) {
      expect(result).toContain(`Agent: ${agent}`);
    }
  });

  test('validates hooks.json', () => {
    const result = execSync(`node "${SCRIPT}"`, {
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result).toContain('hooks.json validated');
  });

  test('exits with code 0 on valid plugin', () => {
    // execSync throws on non-zero exit
    expect(() => {
      execSync(`node "${SCRIPT}"`, { timeout: 10000 });
    }).not.toThrow();
  });
});
