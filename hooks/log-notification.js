#!/usr/bin/env node

/**
 * Notification event hook: Logs notification events to the session log.
 *
 * Tracks when Claude Code fires notifications (e.g., background agent
 * completions, tool results). Useful for understanding async workflow
 * patterns and diagnosing missed notifications.
 *
 * Exit codes:
 *   0 = always (logging only, never blocks)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { logHook } = require('./hook-logger');
const { logEvent } = require('./event-logger');
const { shouldThrottleDefault, isCriticalMessage } = require('./lib/notification-throttle');

function isAutonomousMode(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return cfg.mode === 'autonomous';
  } catch (_e) { return false; }
}

function getThrottleConfig(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const tc = (cfg.hooks && cfg.hooks.notification_throttle) || {};
    return { windowMs: tc.window_ms || 60000, maxPerWindow: tc.max_per_window || 3 };
  } catch (_e) { return { windowMs: 60000, maxPerWindow: 3 }; }
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = input ? JSON.parse(input) : {};
      const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
      const planningDir = path.join(cwd, '.planning');

      if (!fs.existsSync(planningDir)) {
        process.exit(0);
      }

      const notificationType = data.notification_type || data.type || 'unknown';
      const message = data.message || data.content || '';
      const agentId = data.agent_id || null;

      // Throttle routine notifications in autonomous mode
      const throttleKey = 'notification:' + notificationType;
      const autonomous = isAutonomousMode(planningDir);
      const critical = isCriticalMessage(message);
      const tc = getThrottleConfig(planningDir);
      if (shouldThrottleDefault(throttleKey, { isAutonomous: autonomous, isCritical: critical, windowMs: tc.windowMs, maxPerWindow: tc.maxPerWindow })) {
        process.exit(0);
      }

      logHook('log-notification', 'Notification', 'received', {
        type: notificationType,
        agent_id: agentId,
        message: message.substring(0, 100)
      });

      logEvent('notification', notificationType, {
        agent_id: agentId,
        message: message.substring(0, 200)
      });

      process.exit(0);
    } catch (_e) {
      process.stdout.write(JSON.stringify({ additionalContext: '⚠ [PBR] log-notification failed: ' + _e.message }));
      process.exit(0);
    }
  });
}

/**
 * HTTP handler for hook-server.js.
 * @param {Object} reqBody - { event, tool, data, planningDir }
 * @returns {null} - Logging only, no output
 */
function handleHttp(reqBody) {
  try {
    const data = reqBody.data || {};
    const planningDir = reqBody.planningDir || '';
    const notificationType = data.notification_type || data.type || 'unknown';
    const message = data.message || data.content || '';
    const agentId = data.agent_id || null;

    // Throttle routine notifications in autonomous mode
    const throttleKey = 'notification:' + notificationType;
    const autonomous = isAutonomousMode(planningDir);
    const critical = isCriticalMessage(message);
    const tc = getThrottleConfig(planningDir);
    if (shouldThrottleDefault(throttleKey, { isAutonomous: autonomous, isCritical: critical, windowMs: tc.windowMs, maxPerWindow: tc.maxPerWindow })) {
      return null;
    }

    logHook('log-notification', 'Notification', 'received', {
      type: notificationType,
      agent_id: agentId,
      message: message.substring(0, 100)
    });

    logEvent('notification', notificationType, {
      agent_id: agentId,
      message: message.substring(0, 200)
    });
  } catch (_e) {
    // Never propagate
  }
  return null;
}

module.exports = { handleHttp };
if (require.main === module || process.argv[1] === __filename) { main(); }
