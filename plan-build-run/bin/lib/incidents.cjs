/**
 * lib/incidents.cjs — Incident journal for PBR workflow events.
 *
 * Append-only JSONL log capturing blocks, warnings, errors, retries,
 * deviations, and contention events. Never blocks workflow — all writes
 * are fire-and-forget with try/catch.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// ─── Path helpers ─────────────────────────────────────────────────────────────

function getPlanningDir(cwd) {
  return path.join(cwd || process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
}

function getIncidentsDir(planningDir) {
  return path.join(planningDir, 'incidents');
}

function getDailyFile(planningDir, date) {
  const d = date || new Date();
  const dateStr = d.toISOString().slice(0, 10);
  return path.join(getIncidentsDir(planningDir), 'incidents-' + dateStr + '.jsonl');
}

// ─── Config gate ──────────────────────────────────────────────────────────────

function isEnabled(planningDir) {
  try {
    const configPath = path.join(planningDir, 'config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    if (config.features && config.features.incident_journal === false) {
      return false;
    }
    return true;
  } catch (_e) {
    return true;
  }
}

// ─── Record ───────────────────────────────────────────────────────────────────

function record(entry, opts) {
  try {
    const o = opts || {};
    const planDir = o.planningDir || getPlanningDir(o.cwd);

    if (!isEnabled(planDir)) return undefined;

    const full = {
      timestamp: new Date().toISOString(),
      session_id: null,
      source: 'hook',
      type: 'warn',
      severity: 'warning',
      issue: '',
      context: {},
      auto_fixed: false,
      resolution: null,
      duration_ms: null,
      ...entry
    };

    const incidentsDir = getIncidentsDir(planDir);
    fs.mkdirSync(incidentsDir, { recursive: true });

    const dailyPath = getDailyFile(planDir, new Date(full.timestamp));
    fs.appendFileSync(dailyPath, JSON.stringify(full) + '\n');

    return full;
  } catch (_e) {
    // Fire-and-forget — never throw
    return undefined;
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

function list(opts) {
  const o = opts || {};
  const planDir = o.planningDir || getPlanningDir(o.cwd);
  const limit = o.limit !== undefined ? o.limit : 50;
  const reverse = o.reverse !== undefined ? o.reverse : true;

  const incDir = getIncidentsDir(planDir);
  let files;
  try {
    files = fs.readdirSync(incDir)
      .filter(f => /^incidents-.*\.jsonl$/.test(f))
      .sort();
  } catch (_e) {
    return [];
  }

  const entries = [];
  for (const file of files) {
    const filePath = path.join(incDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed));
        } catch (_parseErr) {
          // Skip unparseable lines
        }
      }
    } catch (_readErr) {
      // Skip unreadable files
    }
  }

  if (reverse) entries.reverse();
  if (limit !== Infinity && limit > 0) {
    return entries.slice(0, limit);
  }
  return entries;
}

// ─── Query ────────────────────────────────────────────────────────────────────

function query(filter, opts) {
  const f = filter || {};
  const all = list({ ...(opts || {}), limit: Infinity, reverse: false });

  let cutoff = null;
  if (f.last) {
    const match = f.last.match(/^(\d+)([dhm])$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const unit = match[2];
      let ms = 0;
      if (unit === 'd') ms = num * 24 * 60 * 60 * 1000;
      else if (unit === 'h') ms = num * 60 * 60 * 1000;
      else if (unit === 'm') ms = num * 60 * 1000;
      cutoff = Date.now() - ms;
    }
  }

  const filtered = all.filter(entry => {
    if (f.type && entry.type !== f.type) return false;
    if (f.severity && entry.severity !== f.severity) return false;
    if (f.source && entry.source !== f.source) return false;
    if (f.session_id && entry.session_id !== f.session_id) return false;
    if (cutoff !== null && new Date(entry.timestamp).getTime() < cutoff) return false;
    return true;
  });

  filtered.reverse();
  return filtered;
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function summary(opts) {
  const all = list({ ...(opts || {}), limit: Infinity, reverse: false });

  const result = {
    total: all.length,
    by_type: {},
    by_source: {},
    by_severity: {},
    oldest: null,
    newest: null
  };

  for (const entry of all) {
    result.by_type[entry.type] = (result.by_type[entry.type] || 0) + 1;
    result.by_source[entry.source] = (result.by_source[entry.source] || 0) + 1;
    result.by_severity[entry.severity] = (result.by_severity[entry.severity] || 0) + 1;

    if (!result.oldest || entry.timestamp < result.oldest) {
      result.oldest = entry.timestamp;
    }
    if (!result.newest || entry.timestamp > result.newest) {
      result.newest = entry.timestamp;
    }
  }

  return result;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { record, list, query, summary, isEnabled, getDailyFile, getIncidentsDir };
