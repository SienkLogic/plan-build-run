'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  configLoad,
  configClearCache,
  configValidate,
} = require('../plan-build-run/bin/lib/config.cjs');

let tmpDir;
let planningDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-cfg-'));
  planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(path.join(planningDir, 'logs'), { recursive: true });
  configClearCache();
});

afterEach(() => {
  configClearCache();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('configLoad', () => {
  test('returns null when config.json does not exist', () => {
    expect(configLoad(planningDir)).toBeNull();
  });

  test('returns parsed config when valid', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', mode: 'interactive' }));
    const result = configLoad(planningDir);
    expect(result).not.toBeNull();
    expect(result.depth).toBe('standard');
    expect(result.mode).toBe('interactive');
  });

  test('caches config on repeated calls', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard' }));
    const result1 = configLoad(planningDir);
    const result2 = configLoad(planningDir);
    expect(result1).toBe(result2); // same object reference
  });

  test('invalidates cache when path changes', () => {
    const configPath = path.join(planningDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ depth: 'standard' }));
    configLoad(planningDir);
    // Clear cache and reload with different content
    configClearCache();
    fs.writeFileSync(configPath, JSON.stringify({ depth: 'deep' }));
    const result2 = configLoad(planningDir);
    expect(result2.depth).toBe('deep');
  });

  test('returns null for invalid JSON', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'not json');
    expect(configLoad(planningDir)).toBeNull();
  });
});

describe('configClearCache', () => {
  test('clears the cache', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard' }));
    configLoad(planningDir);
    configClearCache();
    // After clearing, next load should re-read the file
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'changed' }));
    const result = configLoad(planningDir);
    expect(result.depth).toBe('changed');
  });
});

describe('configValidate', () => {
  test('reports error when config.json is missing (string arg)', () => {
    const result = configValidate(planningDir);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('config.json not found');
  });

  test('reports error for invalid JSON (string arg)', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'bad');
    const result = configValidate(planningDir);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not valid JSON');
  });

  test('validates a config object directly', () => {
    const result = configValidate({ depth: 'standard', mode: 'interactive' });
    expect(result).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  test('validates valid config file (string arg)', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', mode: 'interactive' }));
    const result = configValidate(planningDir);
    // May have warnings but should be valid structure
    expect(result).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
  });

  // local_llm endpoint validation tests removed — feature deprecated in phase 53
  // Endpoint validation no longer applies; only deprecation warning for enabled: true

  test('local_llm.enabled true produces deprecation warning', () => {
    const config = {
      local_llm: { enabled: true, endpoint: 'http://remote-server:8080/v1' }
    };
    const result = configValidate(config);
    expect(result.warnings.some(w => w.includes('deprecated'))).toBe(true);
  });

  test('local_llm.enabled false produces no deprecation warning', () => {
    const config = {
      local_llm: { enabled: false }
    };
    const result = configValidate(config);
    expect(result.warnings.filter(w => w.includes('local_llm')).length).toBe(0);
  });

  test('warns about autonomous mode with gates', () => {
    const config = { mode: 'autonomous', gates: { human_verify: true } };
    const result = configValidate(config);
    expect(result.errors.some(e => e.includes('autonomous') && e.includes('gates'))).toBe(true);
  });

  test('warns about auto_continue with interactive mode', () => {
    const config = { mode: 'interactive', features: { auto_continue: true } };
    const result = configValidate(config);
    expect(result.warnings.some(w => w.includes('auto_continue'))).toBe(true);
  });

  test('detects conflicting parallelization config', () => {
    const config = { parallelization: { enabled: false, plan_level: true } };
    const result = configValidate(config);
    expect(result.warnings.some(w => w.includes('plan_level'))).toBe(true);
  });

  test('detects teams conflict with max_concurrent_agents=1', () => {
    const config = {
      parallelization: { max_concurrent_agents: 1 },
      teams: { coordination: 'round-robin' }
    };
    const result = configValidate(config);
    expect(result.errors.some(e => e.includes('teams'))).toBe(true);
  });

  test('handles null/undefined configOrDir', () => {
    // Should use default location, which won't exist
    jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const result = configValidate(null);
    expect(result.valid).toBe(false);
    process.cwd.mockRestore();
  });
});

const {
  configResolveDepth,
  configLoadDefaults,
  configSaveDefaults,
  configGet,
  configSet,
} = require('../plan-build-run/bin/lib/config.cjs');

describe('configResolveDepth', () => {
  test('defaults to standard depth', () => {
    const result = configResolveDepth({});
    expect(result.depth).toBe('standard');
    expect(result.profile).toBeDefined();
  });

  test('resolves quick depth', () => {
    const result = configResolveDepth({ depth: 'quick' });
    expect(result.depth).toBe('quick');
    expect(result.profile['features.research_phase']).toBe(false);
  });

  test('resolves comprehensive depth', () => {
    const result = configResolveDepth({ depth: 'comprehensive' });
    expect(result.depth).toBe('comprehensive');
    expect(result.profile['features.inline_verify']).toBe(true);
  });

  test('resolves research-heavy depth', () => {
    const result = configResolveDepth({ depth: 'research-heavy' });
    expect(result.depth).toBe('research-heavy');
    expect(result.profile['scan.mapper_count']).toBe(6);
  });

  test('merges user overrides', () => {
    const result = configResolveDepth({
      depth: 'standard',
      depth_profiles: {
        standard: { 'scan.mapper_count': 8 }
      }
    });
    expect(result.profile['scan.mapper_count']).toBe(8);
  });

  test('handles string arg (planningDir)', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'quick' }));
    const result = configResolveDepth(planningDir);
    expect(result.depth).toBe('quick');
  });

  test('falls back to standard for unknown depth', () => {
    const result = configResolveDepth({ depth: 'nonexistent' });
    expect(result.depth).toBe('nonexistent');
    // Should use standard defaults as fallback
    expect(result.profile).toBeDefined();
  });
});

describe('configLoadDefaults', () => {
  test('returns hardcoded defaults when no config', () => {
    const result = configLoadDefaults(planningDir);
    expect(result.mode).toBe('interactive');
    expect(result.depth).toBe('standard');
  });

  test('returns config when it exists', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'deep', mode: 'autonomous' }));
    const result = configLoadDefaults(planningDir);
    expect(result.depth).toBe('deep');
  });
});

describe('configSaveDefaults', () => {
  test('saves config to disk', () => {
    configSaveDefaults(planningDir, { depth: 'test' });
    const saved = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(saved.depth).toBe('test');
  });
});

describe('configGet', () => {
  test('gets top-level value', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', mode: 'interactive' }));
    configClearCache();
    expect(configGet(planningDir, 'depth')).toBe('standard');
  });

  test('gets nested value', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ features: { research_phase: true } }));
    configClearCache();
    expect(configGet(planningDir, 'features.research_phase')).toBe(true);
  });

  test('returns undefined for missing key', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard' }));
    configClearCache();
    expect(configGet(planningDir, 'nonexistent')).toBeUndefined();
  });

  test('returns undefined for deep missing key', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard' }));
    configClearCache();
    expect(configGet(planningDir, 'a.b.c')).toBeUndefined();
  });

  test('returns undefined when no config', () => {
    configClearCache();
    expect(configGet(planningDir, 'depth')).toBeUndefined();
  });

  test('returns undefined for null keyPath', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{}');
    configClearCache();
    expect(configGet(planningDir, null)).toBeUndefined();
  });
});

describe('configSet', () => {
  test('sets top-level value', () => {
    configClearCache();
    configSet(planningDir, 'depth', 'quick');
    const saved = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(saved.depth).toBe('quick');
  });

  test('sets nested value', () => {
    configClearCache();
    configSet(planningDir, 'features.research', 'true');
    const saved = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(saved.features.research).toBe(true);
  });

  test('converts string booleans', () => {
    configClearCache();
    configSet(planningDir, 'flag', 'false');
    const saved = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(saved.flag).toBe(false);
  });

  test('converts string numbers', () => {
    configClearCache();
    configSet(planningDir, 'count', '42');
    const saved = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(saved.count).toBe(42);
  });

  test('creates nested objects as needed', () => {
    configClearCache();
    configSet(planningDir, 'a.b.c', 'deep');
    const saved = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(saved.a.b.c).toBe('deep');
  });

  test('handles existing config', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ existing: 'value' }));
    configClearCache();
    configSet(planningDir, 'new_key', 'new_value');
    const saved = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    expect(saved.existing).toBe('value');
    expect(saved.new_key).toBe('new_value');
  });
});

describe('context_window_tokens in configLoad', () => {
  test('returns context_window_tokens when present', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard', context_window_tokens: 1000000 }));
    const result = configLoad(planningDir);
    expect(result.context_window_tokens).toBe(1000000);
  });

  test('returns undefined context_window_tokens when absent', () => {
    fs.writeFileSync(path.join(planningDir, 'config.json'),
      JSON.stringify({ depth: 'standard' }));
    const result = configLoad(planningDir);
    expect(result.context_window_tokens).toBeUndefined();
  });
});
