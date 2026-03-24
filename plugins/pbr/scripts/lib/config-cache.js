/**
 * lib/config-cache.js — Persistent config cache with fs.watchFile invalidation.
 *
 * Loads config.json once at server startup, then serves it from memory.
 * Uses fs.watchFile() to detect on-disk changes and refresh automatically.
 * Eliminates per-request fs.existsSync + fs.statSync overhead in hook-server.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { configLoad, configClearCache } = require('./config');

// Module-level state
let _cachedConfig = null;
let _watchedPath = null;
let _planningDir = null;

/**
 * Initialize the config cache by loading config from disk and starting a file watcher.
 * If already watching a different path, stops the previous watcher first.
 *
 * @param {string} planningDir - Path to the .planning directory
 * @returns {object|null} The loaded config object
 */
function initConfigCache(planningDir) {
  const configPath = path.join(planningDir, 'config.json');

  // Initial disk read
  _cachedConfig = configLoad(planningDir);
  _planningDir = planningDir;

  // If watching a different path, stop the old watcher
  if (_watchedPath && _watchedPath !== configPath) {
    stopConfigWatch();
  }

  // Start watching for changes
  if (_watchedPath !== configPath) {
    fs.watchFile(configPath, { interval: 1000 }, (curr, prev) => {
      if (curr.mtimeMs !== prev.mtimeMs) {
        configClearCache();
        _cachedConfig = configLoad(_planningDir);
      }
    });
    _watchedPath = configPath;
  }

  return _cachedConfig;
}

/**
 * Return the cached config object. Zero I/O — just returns the in-memory value.
 *
 * @returns {object|null} The cached config, or null if not initialized
 */
function getConfig() {
  return _cachedConfig;
}

/**
 * Stop watching the config file for changes.
 */
function stopConfigWatch() {
  if (_watchedPath) {
    fs.unwatchFile(_watchedPath);
    _watchedPath = null;
  }
}

/**
 * Clear the config cache entirely and stop the file watcher.
 * Useful for test isolation.
 */
function clearConfigCache() {
  stopConfigWatch();
  _cachedConfig = null;
  _planningDir = null;
  configClearCache();
}

module.exports = { initConfigCache, getConfig, stopConfigWatch, clearConfigCache };
