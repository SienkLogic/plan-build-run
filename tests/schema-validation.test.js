/**
 * Schema validation tests for Plan-Build-Run configuration files.
 *
 * Validates hooks.json and config-schema.json structures without
 * requiring a JSON Schema validator library (no ajv dependency).
 */

const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = path.resolve(__dirname, '..', 'plugins', 'pbr', 'scripts');
const HOOKS_DIR = path.resolve(__dirname, '..', 'plugins', 'pbr', 'hooks');

const VALID_HOOK_EVENTS = [
  'SessionStart', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PreCompact', 'Stop', 'SubagentStart', 'SubagentStop', 'TaskCompleted', 'SessionEnd'
];

describe('hooks.json schema compliance', () => {
  const hooksPath = path.join(HOOKS_DIR, 'hooks.json');
  const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));

  test('has required top-level properties', () => {
    expect(hooks).toHaveProperty('hooks');
    expect(typeof hooks.hooks).toBe('object');
  });

  test('has $schema reference', () => {
    expect(hooks.$schema).toBeDefined();
    // Verify the schema file exists at the referenced path
    const schemaPath = path.resolve(HOOKS_DIR, hooks.$schema);
    expect(fs.existsSync(schemaPath)).toBe(true);
  });

  test('only contains valid hook event names', () => {
    const eventNames = Object.keys(hooks.hooks);
    const invalid = eventNames.filter(e => !VALID_HOOK_EVENTS.includes(e));
    expect(invalid).toEqual([]);
  });

  test('every hook entry has a hooks array', () => {
    const violations = [];
    for (const [event, entries] of Object.entries(hooks.hooks)) {
      expect(Array.isArray(entries)).toBe(true);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry.hooks || !Array.isArray(entry.hooks)) {
          violations.push(`${event}[${i}] missing hooks array`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('every hook command has type and command fields', () => {
    const violations = [];
    for (const [event, entries] of Object.entries(hooks.hooks)) {
      for (let i = 0; i < entries.length; i++) {
        for (let j = 0; j < (entries[i].hooks || []).length; j++) {
          const hook = entries[i].hooks[j];
          if (hook.type !== 'command') {
            violations.push(`${event}[${i}].hooks[${j}] type is "${hook.type}", expected "command"`);
          }
          if (!hook.command || typeof hook.command !== 'string') {
            violations.push(`${event}[${i}].hooks[${j}] missing or invalid command`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('matcher is always a string when present', () => {
    const violations = [];
    for (const [event, entries] of Object.entries(hooks.hooks)) {
      for (let i = 0; i < entries.length; i++) {
        if ('matcher' in entries[i] && typeof entries[i].matcher !== 'string') {
          violations.push(`${event}[${i}].matcher is ${typeof entries[i].matcher}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('async hooks always have a numeric timeout', () => {
    const violations = [];
    for (const [event, entries] of Object.entries(hooks.hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks || []) {
          if (hook.async === true) {
            if (typeof hook.timeout !== 'number' || hook.timeout < 1) {
              violations.push(`${event}: async hook missing valid timeout`);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('all commands use ${CLAUDE_PLUGIN_ROOT} for script paths', () => {
    const violations = [];
    for (const [event, entries] of Object.entries(hooks.hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks || []) {
          if (hook.command && !hook.command.includes('${CLAUDE_PLUGIN_ROOT}')) {
            violations.push(`${event}: command doesn't use \${CLAUDE_PLUGIN_ROOT}: ${hook.command}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('no duplicate commands in same event+matcher', () => {
    const seen = new Map();
    const duplicates = [];
    for (const [event, entries] of Object.entries(hooks.hooks)) {
      for (const entry of entries) {
        const matcher = entry.matcher || '*';
        for (const hook of entry.hooks || []) {
          const key = `${event}:${matcher}:${hook.command}`;
          if (seen.has(key)) {
            duplicates.push(key);
          }
          seen.set(key, true);
        }
      }
    }
    expect(duplicates).toEqual([]);
  });
});

describe('hooks-schema.json is valid JSON Schema', () => {
  const schemaPath = path.join(SCRIPTS_DIR, 'hooks-schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  test('has required JSON Schema fields', () => {
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
    expect(schema.definitions).toBeDefined();
  });

  test('defines all hook event types', () => {
    const hooksProps = schema.properties.hooks.properties;
    for (const event of VALID_HOOK_EVENTS) {
      expect(hooksProps).toHaveProperty(event);
    }
  });

  test('hookCommand definition covers all used fields', () => {
    const hookCmd = schema.definitions.hookCommand;
    expect(hookCmd.properties).toHaveProperty('type');
    expect(hookCmd.properties).toHaveProperty('command');
    expect(hookCmd.properties).toHaveProperty('statusMessage');
    expect(hookCmd.properties).toHaveProperty('async');
    expect(hookCmd.properties).toHaveProperty('timeout');
    expect(hookCmd.required).toContain('type');
    expect(hookCmd.required).toContain('command');
  });
});

describe('config-schema.json is valid JSON Schema', () => {
  const schemaPath = path.join(SCRIPTS_DIR, 'config-schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  test('has required JSON Schema fields', () => {
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(schema.type).toBe('object');
    expect(schema.properties).toBeDefined();
  });

  test('defines all major config sections', () => {
    const props = schema.properties;
    expect(props).toHaveProperty('version');
    expect(props).toHaveProperty('depth');
    expect(props).toHaveProperty('mode');
    expect(props).toHaveProperty('features');
    expect(props).toHaveProperty('models');
    expect(props).toHaveProperty('parallelization');
    expect(props).toHaveProperty('planning');
    expect(props).toHaveProperty('git');
    expect(props).toHaveProperty('gates');
    expect(props).toHaveProperty('safety');
    expect(props).toHaveProperty('hooks');
  });

  test('features section covers all known toggles', () => {
    const features = schema.properties.features.properties;
    const expectedToggles = [
      'structured_planning', 'goal_verification', 'integration_verification',
      'context_isolation', 'atomic_commits', 'session_persistence',
      'research_phase', 'plan_checking', 'tdd_mode', 'status_line',
      'auto_continue', 'auto_advance', 'team_discussions', 'inline_verify'
    ];
    for (const toggle of expectedToggles) {
      expect(features).toHaveProperty(toggle);
      expect(features[toggle].type).toBe('boolean');
    }
  });

  test('hooks section covers all known hook toggles', () => {
    const hooksProps = schema.properties.hooks.properties;
    expect(hooksProps).toHaveProperty('autoFormat');
    expect(hooksProps).toHaveProperty('typeCheck');
    expect(hooksProps).toHaveProperty('detectConsoleLogs');
    expect(hooksProps).toHaveProperty('blockDocSprawl');
    expect(hooksProps).toHaveProperty('compactThreshold');
  });

  test('all sections disallow additional properties', () => {
    const sections = ['features', 'models', 'parallelization', 'planning', 'git', 'gates', 'safety', 'hooks'];
    for (const section of sections) {
      const sectionSchema = schema.properties[section];
      expect(sectionSchema.additionalProperties).toBe(false);
    }
  });
});

describe('plugin.json manifest constraints', () => {
  const pluginJsonPath = path.join(
    path.resolve(__dirname, '..', 'plugins', 'pbr', '.claude-plugin'),
    'plugin.json'
  );
  const plugin = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));

  test('does NOT declare hooks field (auto-loaded from hooks/)', () => {
    expect(plugin).not.toHaveProperty('hooks');
  });

  test('has mandatory version field', () => {
    expect(plugin.version).toBeDefined();
    expect(typeof plugin.version).toBe('string');
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('has mandatory name field', () => {
    expect(plugin.name).toBeDefined();
    expect(typeof plugin.name).toBe('string');
  });

  test('component fields are arrays when present', () => {
    const componentFields = ['agents', 'skills', 'commands', 'contexts'];
    for (const field of componentFields) {
      if (field in plugin) {
        expect(Array.isArray(plugin[field])).toBe(true);
      }
    }
  });
});
