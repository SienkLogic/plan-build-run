#!/usr/bin/env node

/**
 * record-incident.js — Shared hook helper for incident journal recording.
 *
 * All hooks require this module and call recordIncident() after block/warn
 * decisions. Never throws — all errors are silently swallowed so hook
 * behavior is unaffected.
 *
 * Exit-code contract: This module has no effect on hook exit codes.
 */
'use strict';

let incidents;
try {
  // Resolve relative to plugin scripts dir → lib/incidents
  incidents = require('./lib/incidents');
} catch (_e) {
  incidents = null;
}

/**
 * Record an incident to the journal. Fire-and-forget.
 *
 * @param {Object} entry - Incident fields (see incidents.cjs entry format)
 * @param {Object} [opts] - { cwd, planningDir }
 */
function recordIncident(entry, opts) {
  if (!incidents) return;
  try {
    incidents.record(entry, opts || {});
  } catch (_e) {
    // Silently swallow — never affect hook behavior
  }
}

module.exports = { recordIncident };
