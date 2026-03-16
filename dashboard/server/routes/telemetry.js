'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

/**
 * Telemetry route factory.
 * Reads hook event log and telemetry data from .planning/.
 *
 * @param {object} options
 * @param {string} options.planningDir - Path to .planning/ directory
 * @returns {express.Router}
 */
function createTelemetryRouter({ planningDir }) {
  const router = express.Router();

  /**
   * GET / - Return telemetry metrics.
   * Reads logs/hooks.jsonl for aggregate metrics.
   */
  router.get('/', async (_req, res) => {
    try {
      const eventsPath = path.join(planningDir, 'logs', 'hooks.jsonl');
      let events = [];

      try {
        const raw = await fs.promises.readFile(eventsPath, 'utf-8');
        events = raw
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            try { return JSON.parse(line); } catch (_e) { return null; }
          })
          .filter(Boolean);
      } catch (_e) {
        // No events file -- return empty metrics
      }

      // Count unique hook types
      const hookTypeCounts = {};
      for (const evt of events) {
        const hook = evt.hook || evt.event || evt.type || 'unknown';
        hookTypeCounts[hook] = (hookTypeCounts[hook] || 0) + 1;
      }
      const uniqueHookTypeCount = Object.keys(hookTypeCounts).length;

      // Count events in last 24 hours
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const recentEventCount = events.filter(evt => {
        const ts = evt.ts || evt.time;
        if (!ts) return false;
        const evtTime = new Date(ts).getTime();
        return !isNaN(evtTime) && evtTime >= oneDayAgo;
      }).length;

      const metrics = {
        totalEvents: events.length,
        hookTypes: uniqueHookTypeCount,
        recentEvents: recentEventCount,
      };

      // tokenHistory -- group events by date, count per day (last 14 days)
      const dayMap = {};
      for (const evt of events) {
        const ts = evt.ts || evt.time;
        if (!ts) continue;
        const d = new Date(ts);
        if (isNaN(d.getTime())) continue;
        const dateStr = d.toISOString().slice(0, 10);
        dayMap[dateStr] = (dayMap[dateStr] || 0) + 1;
      }
      const today = new Date();
      const tokenHistory = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        tokenHistory.push({ date: dateStr, tokens: dayMap[dateStr] || 0 });
      }

      // phaseDistribution -- derive phase from hook name patterns
      function derivePhase(evt) {
        const hook = (evt.hook || evt.event || evt.type || '').toLowerCase();
        const category = (evt.category || '').toLowerCase();
        if (hook.includes('plan') || category.includes('plan')) return 'Plan';
        if (hook.includes('build') || category.includes('build')) return 'Build';
        if (hook.includes('review') || category.includes('review')) return 'Review';
        return 'Run';
      }

      const phaseCounts = {};
      for (const evt of events) {
        const phase = derivePhase(evt);
        phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;
      }
      const phaseDistribution = Object.entries(phaseCounts).map(([name, value]) => ({ name, value }));

      // subagents -- map last 20 events into subagent-like shape
      function formatDuration(evt) {
        const dur = evt.duration;
        if (dur == null) return '-';
        if (typeof dur === 'number') {
          if (dur < 1000) return `${dur}ms`;
          return `${(dur / 1000).toFixed(1)}s`;
        }
        return String(dur);
      }

      const subagents = events.slice(-20).map(evt => ({
        name: evt.hook || evt.event || 'unknown',
        task: evt.tool || '-',
        phase: derivePhase(evt),
        model: '-',
        tokens: 0,
        time: formatDuration(evt),
        status: evt.status || 'success',
      }));

      // successData -- group by date, compute success rate per day
      const daySuccessMap = {};
      for (const evt of events) {
        const ts = evt.ts || evt.time;
        if (!ts) continue;
        const d = new Date(ts);
        if (isNaN(d.getTime())) continue;
        const dateStr = d.toISOString().slice(0, 10);
        if (!daySuccessMap[dateStr]) {
          daySuccessMap[dateStr] = { total: 0, success: 0 };
        }
        daySuccessMap[dateStr].total++;
        const status = evt.status || (evt.level === 'error' ? 'error' : 'success');
        if (status === 'success') {
          daySuccessMap[dateStr].success++;
        }
      }
      const successData = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const entry = daySuccessMap[dateStr];
        const rate = entry ? Math.round((entry.success / entry.total) * 100) : 0;
        successData.push({ date: dateStr, rate });
      }

      // subagentPerf -- per-hook-type performance data
      const subagentPerf = Object.entries(hookTypeCounts).map(([name, count]) => ({
        name,
        count,
      }));

      res.json({
        metrics,
        tokenHistory,
        phaseDistribution,
        subagents,
        successData,
        subagentPerf,
        contextRadar: {},
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createTelemetryRouter;
