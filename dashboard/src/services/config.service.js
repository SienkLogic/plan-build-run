import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Read and parse .planning/config.json.
 * @param {string} projectDir
 * @returns {Promise<object|null>}
 */
export async function readConfig(projectDir) {
  const configPath = join(projectDir, '.planning', 'config.json');
  try {
    const raw = await readFile(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Validate config shape. Throws with a descriptive message on failure.
 * @param {object} config
 */
export function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Config must be an object');
  if (typeof config.version !== 'string') throw new Error('config.version must be a string');
  if (config.features != null) {
    for (const [k, v] of Object.entries(config.features)) {
      if (typeof v !== 'boolean') throw new Error(`features.${k} must be a boolean`);
    }
  }
  if (config.models != null) {
    for (const [k, v] of Object.entries(config.models)) {
      if (typeof v !== 'string') throw new Error(`models.${k} must be a string`);
    }
  }
}

/**
 * Atomically write config back to .planning/config.json.
 * Validates before writing; throws on validation failure (existing file untouched).
 * @param {string} projectDir
 * @param {object} config
 */
export async function writeConfig(projectDir, config) {
  validateConfig(config);
  const configPath = join(projectDir, '.planning', 'config.json');
  const tmpPath = configPath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf8');
  await rename(tmpPath, configPath);
}
