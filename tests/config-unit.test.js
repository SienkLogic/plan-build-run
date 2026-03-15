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

  test('detects non-localhost LLM endpoint', () => {
    const config = {
      local_llm: { enabled: true, endpoint: 'http://remote-server:8080/v1' }
    };
    const result = configValidate(config);
    expect(result.errors.some(e => e.includes('localhost'))).toBe(true);
  });

  test('allows localhost LLM endpoints', () => {
    const config = {
      local_llm: { enabled: true, endpoint: 'http://localhost:11434/v1' }
    };
    const result = configValidate(config);
    expect(result.errors.filter(e => e.includes('localhost')).length).toBe(0);
  });

  test('allows 127.0.0.1 LLM endpoint', () => {
    const config = {
      local_llm: { enabled: true, endpoint: 'http://127.0.0.1:11434/v1' }
    };
    const result = configValidate(config);
    expect(result.errors.filter(e => e.includes('localhost')).length).toBe(0);
  });

  test('detects invalid URL in LLM endpoint', () => {
    const config = {
      local_llm: { enabled: true, endpoint: 'not-a-url' }
    };
    const result = configValidate(config);
    expect(result.errors.some(e => e.includes('not a valid URL'))).toBe(true);
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
