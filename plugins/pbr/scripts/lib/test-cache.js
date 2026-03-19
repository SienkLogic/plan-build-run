'use strict';
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(process.cwd(), '.planning', '.test-cache.json');

/**
 * Read a cached test result by key.
 * Returns the cached entry if fresh (within TTL), or null otherwise.
 *
 * @param {string} key - Cache key (e.g., phase directory path)
 * @param {number} [ttlSeconds=60] - Time-to-live in seconds
 * @returns {{ passed: boolean, output: string, timestamp: number } | null}
 */
function readCache(key, ttlSeconds = 60) {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (!data[key]) return null;
    if (Date.now() - data[key].timestamp > ttlSeconds * 1000) return null;
    return data[key];
  } catch (_e) {
    return null;
  }
}

/**
 * Write a test result to the cache.
 * Uses atomic write (tmp + rename) to avoid corruption.
 * Errors are silently swallowed — caching must never block the workflow.
 *
 * @param {string} key - Cache key (e.g., phase directory path)
 * @param {{ passed: boolean, output: string }} result - Test result to cache
 */
function writeCache(key, result) {
  try {
    let data = {};
    if (fs.existsSync(CACHE_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      } catch (_e) {
        data = {};
      }
    }
    data[key] = { passed: result.passed, output: result.output, timestamp: Date.now() };
    const tmpFile = CACHE_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, CACHE_FILE);
  } catch (_e) {
    // Silently swallow — caching must never block the workflow
  }
}

module.exports = { readCache, writeCache };
