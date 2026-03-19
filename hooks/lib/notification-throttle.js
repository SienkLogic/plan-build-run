#!/usr/bin/env node

/**
 * Notification throttle module for hook messages.
 *
 * Provides time-window-based message deduplication with bypass rules
 * for interactive mode and critical messages. Multiple hooks sharing
 * one process (via hook-server) share the default singleton state.
 *
 * Usage:
 *   const { shouldThrottle, isCriticalMessage } = require('./lib/notification-throttle');
 *   if (shouldThrottle(state, 'hook:context-bridge:DEGRADING', { isAutonomous: true })) {
 *     return; // suppress duplicate
 *   }
 */

'use strict';

/** Default options for shouldThrottle */
const DEFAULTS = {
  windowMs: 60000,
  maxPerWindow: 3,
  isAutonomous: false,
  isCritical: false
};

/** Patterns that indicate a critical message (case-insensitive) */
const CRITICAL_PATTERNS = [
  /error/i,
  /\bSTOP\b/,
  /block/i,
  /failed/i,
  /CRITICAL/i,
  /checkpoint/i
];

/**
 * Create a fresh throttle state object.
 * @returns {{ seen: Map, startTime: number }}
 */
function createThrottleState() {
  return {
    seen: new Map(),
    startTime: Date.now()
  };
}

/**
 * Determine whether a message with the given key should be suppressed.
 *
 * @param {{ seen: Map, startTime: number }} state - Throttle state from createThrottleState()
 * @param {string} key - Deduplication key (e.g. "hook:context-bridge:DEGRADING")
 * @param {Object} [options] - Throttle options
 * @param {number} [options.windowMs=60000] - Time window in milliseconds
 * @param {number} [options.maxPerWindow=3] - Max messages allowed per window
 * @param {boolean} [options.isAutonomous=false] - Whether running in autonomous mode
 * @param {boolean} [options.isCritical=false] - Whether this is a critical message
 * @returns {boolean} true if the message should be suppressed (throttled)
 */
function shouldThrottle(state, key, options) {
  const opts = { ...DEFAULTS, ...options };

  // Interactive mode: never throttle
  if (!opts.isAutonomous) return false;

  // Critical messages: never throttle
  if (opts.isCritical) return false;

  const now = Date.now();
  const entry = state.seen.get(key);

  // No entry or window expired: reset and allow
  if (!entry || (now - entry.firstSeen) > opts.windowMs) {
    state.seen.set(key, { count: 1, firstSeen: now, lastSeen: now });
    return false;
  }

  // Within window and at or over limit: suppress
  if (entry.count >= opts.maxPerWindow) {
    entry.lastSeen = now;
    return true;
  }

  // Within window, under limit: increment and allow
  entry.count++;
  entry.lastSeen = now;
  return false;
}

/**
 * Reset all throttle state, clearing tracked messages.
 * @param {{ seen: Map, startTime: number }} state - Throttle state to reset
 */
function resetThrottle(state) {
  state.seen.clear();
  state.startTime = Date.now();
}

/**
 * Check whether a message string contains critical content that should
 * never be throttled (errors, blocks, checkpoints, etc.).
 *
 * @param {string} message - The message to check
 * @returns {boolean} true if the message is critical
 */
function isCriticalMessage(message) {
  if (typeof message !== 'string') return false;

  // Check for JSON-style decision/reason keys at the start
  const trimmed = message.trimStart();
  if (trimmed.startsWith('"decision"') || trimmed.startsWith('"reason"') ||
      trimmed.startsWith('{"decision"') || trimmed.startsWith('{"reason"')) {
    return true;
  }

  return CRITICAL_PATTERNS.some(pattern => pattern.test(message));
}

/** Module-level singleton state shared across hooks in one process */
const _defaultState = createThrottleState();

/**
 * Convenience wrapper using the module-level singleton state.
 * Useful when multiple hooks share one process (hook-server).
 *
 * @param {string} key - Deduplication key
 * @param {Object} [options] - Same options as shouldThrottle()
 * @returns {boolean} true if the message should be suppressed
 */
function shouldThrottleDefault(key, options) {
  return shouldThrottle(_defaultState, key, options);
}

module.exports = {
  createThrottleState,
  shouldThrottle,
  resetThrottle,
  isCriticalMessage,
  shouldThrottleDefault,
  _defaultState
};
