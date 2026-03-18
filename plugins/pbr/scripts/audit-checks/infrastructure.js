'use strict';

/**
 * Infrastructure Health Check Module
 *
 * Implements IH-01 through IH-06 (excluding IH-03) infrastructure health
 * dimensions for the PBR audit system. Each check returns a structured
 * result: { dimension, status, message, evidence }.
 *
 * Checks:
 *   IH-01: Hook server health (running/crashed/fallback)
 *   IH-02: Dashboard health (running if auto_launch enabled)
 *   IH-04: Stale file detection (.active-skill, .auto-next, .context-tracker)
 *   IH-05: Plugin cache freshness (cached vs local version)
 *   IH-06: Config schema validation (config.json vs config-schema.json)
 *
 * Config dependencies:
 *   - config.hook_server.enabled / config.hook_server.port (IH-01)
 *   - config.dashboard.auto_launch / config.dashboard.port (IH-02)
 *   - config.audit.thresholds.stale_file_age_hours (IH-04, default 24h)
 *   - config-schema.json for validation (IH-06, strips _guide_* keys)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Result helper
// ---------------------------------------------------------------------------

/**
 * Build a structured check result.
 * @param {string} dimCode - Dimension code (e.g. "IH-01")
 * @param {'pass'|'warn'|'fail'} status
 * @param {string} message
 * @param {string[]} [evidence]
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function result(dimCode, status, message, evidence) {
  return {
    dimension: dimCode,
    status,
    message,
    evidence: evidence || [],
  };
}

// ---------------------------------------------------------------------------
// HTTP probe helper (used by IH-01 and IH-02)
// ---------------------------------------------------------------------------

/**
 * Probe an HTTP endpoint by spawning a child node process.
 * Returns the parsed JSON response or null on failure.
 * @param {string} url
 * @param {number} [timeoutMs=2000]
 * @returns {{ data: object|null, error: string|null }}
 */
function httpProbe(url, timeoutMs) {
  timeoutMs = timeoutMs || 2000;
  const script = `
    const http = require('http');
    const req = http.get(${JSON.stringify(url)}, { timeout: ${timeoutMs} }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        process.stdout.write(JSON.stringify({ ok: true, status: res.statusCode, body: d }));
      });
    });
    req.on('error', (e) => {
      process.stdout.write(JSON.stringify({ ok: false, error: e.code || e.message }));
    });
    req.on('timeout', () => {
      req.destroy();
      process.stdout.write(JSON.stringify({ ok: false, error: 'TIMEOUT' }));
    });
  `;

  try {
    const out = execFileSync('node', ['-e', script], {
      timeout: timeoutMs + 1000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(out.trim());
  } catch (_e) {
    return { ok: false, error: 'EXEC_FAILED' };
  }
}

// ---------------------------------------------------------------------------
// IH-01: Hook Server Health
// ---------------------------------------------------------------------------

/**
 * Check hook server health via its /health endpoint.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkHookServerHealth(planningDir, config) {
  const hookServer = (config && config.hook_server) || {};
  const enabled = hookServer.enabled !== false;
  const port = hookServer.port || 19836;

  if (!enabled) {
    return result('IH-01', 'pass', 'Hook server disabled by config');
  }

  const probe = httpProbe(`http://127.0.0.1:${port}/health`);

  if (probe.ok) {
    let body;
    try {
      body = JSON.parse(probe.body);
    } catch (_e) {
      body = probe.body;
    }

    if (body && body.status === 'ok') {
      return result('IH-01', 'pass', 'Hook server is running', [
        `Health endpoint responded: ${JSON.stringify(body)}`,
      ]);
    }
    return result('IH-01', 'warn', 'Hook server responded but status is not ok', [
      `Response: ${JSON.stringify(body)}`,
    ]);
  }

  if (probe.error === 'ECONNREFUSED') {
    return result('IH-01', 'fail', 'Hook server not running', [
      `Connection refused on port ${port}`,
    ]);
  }

  return result('IH-01', 'warn', 'Hook server unresponsive', [
    `Error: ${probe.error || 'unknown'}`,
  ]);
}

// ---------------------------------------------------------------------------
// IH-02: Dashboard Health
// ---------------------------------------------------------------------------

/**
 * Check dashboard health when auto_launch is enabled.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkDashboardHealth(planningDir, config) {
  const dashboard = (config && config.dashboard) || {};
  const autoLaunch = dashboard.auto_launch === true;
  const port = dashboard.port || 3141;

  if (!autoLaunch) {
    return result('IH-02', 'pass', 'Dashboard auto_launch disabled, skipping');
  }

  const probe = httpProbe(`http://127.0.0.1:${port}/`);

  if (probe.ok) {
    return result('IH-02', 'pass', 'Dashboard is running', [
      `Dashboard responded on port ${port} (status ${probe.status})`,
    ]);
  }

  return result('IH-02', 'warn', 'Dashboard not running but auto_launch is enabled', [
    `No response on port ${port}: ${probe.error || 'unknown'}`,
  ]);
}

// ---------------------------------------------------------------------------
// IH-04: Stale File Detection
// ---------------------------------------------------------------------------

/**
 * Detect stale signal files from crashed sessions.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkStaleFileDetection(planningDir, config) {
  const signalFiles = ['.active-skill', '.auto-next', '.context-tracker'];
  const thresholds = (config && config.audit && config.audit.thresholds) || {};
  const staleHours = thresholds.stale_file_age_hours || 24;
  const staleMs = staleHours * 60 * 60 * 1000;
  const now = Date.now();

  const staleEvidence = [];
  let foundAny = false;

  for (const file of signalFiles) {
    const filePath = path.join(planningDir, file);
    try {
      const stat = fs.statSync(filePath);
      foundAny = true;
      const ageMs = now - stat.mtimeMs;
      const ageHours = (ageMs / (60 * 60 * 1000)).toFixed(1);

      if (ageMs > staleMs) {
        staleEvidence.push(`${file}: ${ageHours}h old (threshold: ${staleHours}h)`);
      }
    } catch (_e) {
      // File does not exist — skip
    }
  }

  if (!foundAny) {
    return result('IH-04', 'pass', 'No signal files present');
  }

  if (staleEvidence.length > 0) {
    return result('IH-04', 'warn', `${staleEvidence.length} stale signal file(s) detected`, staleEvidence);
  }

  return result('IH-04', 'pass', 'Signal files present but not stale');
}

// ---------------------------------------------------------------------------
// IH-05: Plugin Cache Freshness
// ---------------------------------------------------------------------------

/**
 * Compare local plugin version to cached plugin version.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkPluginCacheFreshness(planningDir, config) {
  // Read local version from plugin.json relative to this script's location
  const localPluginJson = path.join(__dirname, '..', '..', '.claude-plugin', 'plugin.json');
  let localVersion;

  try {
    const localData = JSON.parse(fs.readFileSync(localPluginJson, 'utf8'));
    localVersion = localData.version;
  } catch (_e) {
    return result('IH-05', 'warn', 'Could not read local plugin.json', [
      `Expected at: ${localPluginJson}`,
    ]);
  }

  // Glob for cached plugin versions
  const cacheBase = path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.claude', 'plugins', 'cache', 'plan-build-run', 'pbr'
  );

  let cachedVersions = [];
  try {
    if (fs.existsSync(cacheBase)) {
      const dirs = fs.readdirSync(cacheBase, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const cachePluginJson = path.join(cacheBase, dir.name, 'plugin.json');
        try {
          const cacheData = JSON.parse(fs.readFileSync(cachePluginJson, 'utf8'));
          cachedVersions.push({ dir: dir.name, version: cacheData.version });
        } catch (_e2) {
          // Skip unreadable cache entries
        }
      }
    }
  } catch (_e) {
    // Cache dir not found
  }

  if (cachedVersions.length === 0) {
    return result('IH-05', 'pass', 'No plugin cache found (dev mode)', [
      `Local version: ${localVersion}`,
    ]);
  }

  // Check if any cached version matches local
  const matching = cachedVersions.filter(c => c.version === localVersion);
  const mismatched = cachedVersions.filter(c => c.version !== localVersion);

  if (mismatched.length > 0) {
    const evidence = mismatched.map(
      c => `Cache dir "${c.dir}" has version ${c.version}, local is ${localVersion}`
    );
    return result('IH-05', 'warn', 'Plugin cache version mismatch', evidence);
  }

  return result('IH-05', 'pass', 'Plugin cache version matches local', [
    `Version: ${localVersion}`,
  ]);
}

// ---------------------------------------------------------------------------
// IH-06: Config Schema Validation
// ---------------------------------------------------------------------------

/**
 * Validate config.json against config-schema.json using lightweight validation.
 * Strips _guide_* keys before validation.
 * @param {string} planningDir - Path to .planning/ directory
 * @param {object} config - Parsed config.json
 * @returns {{ dimension: string, status: string, message: string, evidence: string[] }}
 */
function checkConfigSchemaValidation(planningDir, config) {
  // Load schema
  const schemaPath = path.join(__dirname, '..', 'config-schema.json');
  let schema;

  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (_e) {
    return result('IH-06', 'fail', 'Could not load config-schema.json', [
      `Expected at: ${schemaPath}`,
    ]);
  }

  // Load config from planningDir (use provided config or load fresh)
  let configObj = config;
  if (!configObj) {
    try {
      configObj = JSON.parse(fs.readFileSync(path.join(planningDir, 'config.json'), 'utf8'));
    } catch (_e) {
      return result('IH-06', 'fail', 'Could not load config.json', [
        `Expected at: ${path.join(planningDir, 'config.json')}`,
      ]);
    }
  }

  // Strip _guide_* keys from config before validation
  const stripped = {};
  for (const [key, value] of Object.entries(configObj)) {
    if (!key.startsWith('_guide')) {
      stripped[key] = value;
    }
  }

  const errors = [];
  const schemaProps = schema.properties || {};

  // Check each config key has correct type per schema
  for (const [key, value] of Object.entries(stripped)) {
    const schemaProp = schemaProps[key];
    if (!schemaProp) {
      errors.push(`Unknown config key: "${key}" (not in schema)`);
      continue;
    }

    // Type check
    if (schemaProp.type) {
      const types = Array.isArray(schemaProp.type) ? schemaProp.type : [schemaProp.type];
      const actualType = Array.isArray(value) ? 'array' :
        value === null ? 'null' : typeof value;

      // Map JS types to JSON Schema types
      const jsToSchema = { number: 'number', string: 'string', boolean: 'boolean', object: 'object' };
      const schemaType = jsToSchema[actualType] || actualType;

      // Integer check
      const matchesType = types.some(t => {
        if (t === 'integer') return typeof value === 'number' && Number.isInteger(value);
        return t === schemaType;
      });

      if (!matchesType) {
        errors.push(`Type mismatch for "${key}": expected ${types.join('|')}, got ${schemaType}`);
      }
    }

    // Enum check
    if (schemaProp.enum && !schemaProp.enum.includes(value)) {
      errors.push(`Invalid value for "${key}": ${JSON.stringify(value)} not in enum ${JSON.stringify(schemaProp.enum)}`);
    }
  }

  // Check required fields from schema
  const required = schema.required || [];
  for (const req of required) {
    if (!(req in stripped)) {
      errors.push(`Missing required config key: "${req}"`);
    }
  }

  if (errors.length === 0) {
    return result('IH-06', 'pass', 'Config validates against schema');
  }

  return result('IH-06', 'fail', `Config schema validation found ${errors.length} error(s)`, errors);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  checkHookServerHealth,
  checkDashboardHealth,
  checkStaleFileDetection,
  checkPluginCacheFreshness,
  checkConfigSchemaValidation,
};
