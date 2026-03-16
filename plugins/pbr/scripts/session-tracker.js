#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveSessionPath } = require('./lib/core');

const TRACKER_FILE = '.session-tracker';

/**
 * Resolve the tracker file path, using session-scoped path when sessionId is provided.
 * @param {string} planningDir - Path to the .planning directory
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {string} Resolved tracker file path
 */
function getTrackerPath(planningDir, sessionId) {
  return sessionId
    ? resolveSessionPath(planningDir, TRACKER_FILE, sessionId)
    : path.join(planningDir, TRACKER_FILE);
}

/**
 * Reset the session tracker to zero phases completed.
 * Creates or overwrites the tracker file.
 * @param {string} planningDir - Path to the .planning directory
 * @param {string} [sessionId] - Session identifier for session-scoped path
 */
function resetTracker(planningDir, sessionId) {
  const trackerPath = getTrackerPath(planningDir, sessionId);
  const data = {
    phases_completed: 0,
    session_start: new Date().toISOString(),
    last_phase_completed: null
  };
  fs.writeFileSync(trackerPath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Increment the session phase counter by 1.
 * Auto-creates the tracker if missing.
 * @param {string} planningDir - Path to the .planning directory
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {number} The new phases_completed count
 */
function incrementTracker(planningDir, sessionId) {
  const trackerPath = getTrackerPath(planningDir, sessionId);
  let raw;
  try {
    raw = fs.readFileSync(trackerPath, 'utf8');
  } catch (_e) {
    // File missing — create it first
    resetTracker(planningDir, sessionId);
    raw = fs.readFileSync(trackerPath, 'utf8');
  }
  const data = JSON.parse(raw);
  data.phases_completed += 1;
  data.last_phase_completed = new Date().toISOString();
  fs.writeFileSync(trackerPath, JSON.stringify(data, null, 2), 'utf8');
  return data.phases_completed;
}

/**
 * Load the current session tracker data.
 * @param {string} planningDir - Path to the .planning directory
 * @param {string} [sessionId] - Session identifier for session-scoped path
 * @returns {object|null} Parsed tracker data, or null if missing/corrupted
 */
function loadTracker(planningDir, sessionId) {
  const trackerPath = getTrackerPath(planningDir, sessionId);
  try {
    const raw = fs.readFileSync(trackerPath, 'utf8');
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

module.exports = { resetTracker, incrementTracker, loadTracker, TRACKER_FILE };
