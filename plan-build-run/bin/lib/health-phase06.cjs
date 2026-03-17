'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Check health of the convention_memory feature.
 * @param {string} planningDir - Absolute path to .planning/ directory
 * @param {object} config - Parsed config.json object
 * @returns {{ feature: string, status: string, details?: object }}
 */
function checkConventionMemory(planningDir, config) {
  if (config.features?.convention_memory === false) {
    return { feature: 'convention_memory', status: 'disabled' };
  }

  const convDir = path.join(planningDir, 'conventions');
  try {
    const entries = fs.readdirSync(convDir).filter(f => f.endsWith('.md'));
    if (entries.length > 0) {
      // Get most recent mtime
      let latestMtime = 0;
      for (const entry of entries) {
        const stat = fs.statSync(path.join(convDir, entry));
        if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs;
      }
      return {
        feature: 'convention_memory',
        status: 'healthy',
        details: {
          files: entries.length,
          last_updated: new Date(latestMtime).toISOString()
        }
      };
    }
  } catch (_e) {
    // Directory doesn't exist or can't be read
  }

  return {
    feature: 'convention_memory',
    status: 'degraded',
    details: { reason: 'No conventions detected yet. Run a build to trigger detection.' }
  };
}

/**
 * Check health of the mental_model_snapshots feature.
 * @param {string} planningDir - Absolute path to .planning/ directory
 * @param {object} config - Parsed config.json object
 * @returns {{ feature: string, status: string, details?: object }}
 */
function checkMentalModelSnapshots(planningDir, config) {
  if (config.features?.mental_model_snapshots === false) {
    return { feature: 'mental_model_snapshots', status: 'disabled' };
  }

  const snapDir = path.join(planningDir, 'sessions', 'snapshots');
  try {
    const entries = fs.readdirSync(snapDir).filter(f => f.endsWith('.md'));
    if (entries.length > 0) {
      // Sort to find latest by filename (timestamped)
      entries.sort();
      return {
        feature: 'mental_model_snapshots',
        status: 'healthy',
        details: {
          snapshots: entries.length,
          latest: entries[entries.length - 1]
        }
      };
    }
  } catch (_e) {
    // Directory doesn't exist or can't be read
  }

  return {
    feature: 'mental_model_snapshots',
    status: 'degraded',
    details: { reason: 'No snapshots yet. End a session to trigger capture.' }
  };
}

/**
 * Check all Phase 06 features and return array of results.
 * @param {string} planningDir - Absolute path to .planning/ directory
 * @param {object} config - Parsed config.json object
 * @returns {Array<{ feature: string, status: string, details?: object }>}
 */
function checkAll(planningDir, config) {
  return [
    checkConventionMemory(planningDir, config),
    checkMentalModelSnapshots(planningDir, config)
  ];
}

module.exports = { checkConventionMemory, checkMentalModelSnapshots, checkAll };
