#!/usr/bin/env node

/**
 * Auto-verification helper functions extracted from event-handler.js.
 *
 * Provides config-based checks for whether auto-verification should run,
 * STATE.md phase parsing, signal file writing, and trust tracking config.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('../hook-logger');

/**
 * Determine whether auto-verification should run based on config.
 * @param {string} planningDir - Path to .planning directory
 * @returns {boolean}
 */
function shouldAutoVerify(planningDir) {
  const configPath = path.join(planningDir, 'config.json');
  let config;
  try {
    if (!fs.existsSync(configPath)) return false;
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    logHook('event-handler', 'SubagentStop', 'config-read-error', { error: e.message });
    return false;
  }
  if (config === null) return false;

  // Check explicit goal_verification toggle
  if (config.features && config.features.goal_verification === false) return false;

  // Check depth profile
  const depth = (config.depth || 'standard').toLowerCase();
  if (depth === 'quick') return false;

  // "standard", "comprehensive", and any other depth default to true
  return true;
}

/**
 * Parse current phase info from STATE.md.
 * @param {string} planningDir - Path to .planning directory
 * @returns {{ phase: number, total: number, status: string } | null}
 */
function getPhaseFromState(planningDir) {
  const statePath = path.join(planningDir, 'STATE.md');
  try {
    if (!fs.existsSync(statePath)) return null;
    const content = fs.readFileSync(statePath, 'utf8');

    const phaseMatch = content.match(/Phase:\s*(\d+)\s+of\s+(\d+)/);
    if (!phaseMatch) return null;

    const statusMatch = content.match(/\*{0,2}(?:Phase\s+)?Status\*{0,2}:\s*["']?(\w+)["']?/i);
    const status = statusMatch ? statusMatch[1] : null;

    return {
      phase: parseInt(phaseMatch[1], 10),
      total: parseInt(phaseMatch[2], 10),
      status: status
    };
  } catch (e) {
    logHook('event-handler', 'SubagentStop', 'state-read-error', { error: e.message });
    return null;
  }
}

/**
 * Write signal file for orchestrator to pick up and spawn verifier.
 * @param {string} planningDir - Path to .planning directory
 * @param {number} phaseNumber - Current phase number
 */
function writeAutoVerifySignal(planningDir, phaseNumber) {
  const signalPath = path.join(planningDir, '.auto-verify');
  const payload = {
    phase: phaseNumber,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(signalPath, JSON.stringify(payload, null, 2), 'utf8');
}

/**
 * Check if trust tracking is enabled in config.json.
 * @param {string} planningDir - Path to .planning directory
 * @returns {boolean}
 */
function isTrustTrackingEnabled(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    if (!fs.existsSync(configPath)) return true; // default true
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.features?.trust_tracking !== false;
  } catch (e) {
    logHook('event-handler', 'SubagentStop', 'trust-config-read-error', { error: e.message });
    return true;
  }
}

module.exports = { shouldAutoVerify, getPhaseFromState, writeAutoVerifySignal, isTrustTrackingEnabled };
