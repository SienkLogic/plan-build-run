const fs = require('fs');
const path = require('path');

describe('dashboard skill', () => {
  describe('config schema includes dashboard section', () => {
    it('has dashboard properties in config-schema.json', () => {
      const schemaPath = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'config-schema.json');
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

      expect(schema.properties.dashboard).toBeDefined();
      expect(schema.properties.dashboard.properties.auto_launch.type).toBe('boolean');
      expect(schema.properties.dashboard.properties.port.type).toBe('integer');
      expect(schema.properties.dashboard.properties.port.minimum).toBe(1024);
      expect(schema.properties.dashboard.properties.port.maximum).toBe(65535);
    });
  });

  describe('dashboard config validation', () => {
    const { configValidate, configClearCache } = require('../plugins/pbr/scripts/pbr-tools');

    beforeEach(() => {
      configClearCache();
    });

    it('accepts valid dashboard config', () => {
      const config = {
        version: 2,
        mode: 'interactive',
        depth: 'standard',
        dashboard: { auto_launch: true, port: 3000 }
      };
      const result = configValidate(config);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects invalid port', () => {
      const config = {
        version: 2,
        mode: 'interactive',
        depth: 'standard',
        dashboard: { auto_launch: false, port: 80 }
      };
      const result = configValidate(config);
      expect(result.errors.some(e => e.includes('below minimum'))).toBe(true);
    });

    it('warns on unrecognized dashboard keys', () => {
      const config = {
        version: 2,
        mode: 'interactive',
        depth: 'standard',
        dashboard: { auto_launch: false, port: 3000, unknown_key: true }
      };
      const result = configValidate(config);
      expect(result.warnings.some(w => w.includes('unknown_key'))).toBe(true);
    });
  });

  describe('SKILL.md exists and has valid frontmatter', () => {
    it('has dashboard SKILL.md', () => {
      const skillPath = path.join(__dirname, '..', 'plugins', 'pbr', 'skills', 'dashboard', 'SKILL.md');
      expect(fs.existsSync(skillPath)).toBe(true);

      const content = fs.readFileSync(skillPath, 'utf8');
      expect(content).toMatch(/^---/);
      expect(content).toMatch(/name:\s*dashboard/);
      expect(content).toMatch(/allowed-tools:/);
    });
  });

  describe('command registration', () => {
    it('has dashboard.md command file', () => {
      const cmdPath = path.join(__dirname, '..', 'plugins', 'pbr', 'commands', 'dashboard.md');
      expect(fs.existsSync(cmdPath)).toBe(true);
    });
  });
});
