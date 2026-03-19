/**
 * state-queue.cjs — Queue-based STATE.md update system.
 *
 * Concurrent agents enqueue updates as lockless JSON file drops.
 * A drain function processes all queued updates under a single lock.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_QUEUE_DIR = '.state-queue';

/**
 * Enqueue a single field update for STATE.md without acquiring the main lock.
 * Writes a JSON file to .planning/.state-queue/ with a unique name.
 *
 * @param {string} field - The frontmatter field to update
 * @param {string} value - The new value
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {{ success: boolean, file?: string, error?: string }}
 */
function stateEnqueue(field, value, planningDir) {
  try {
    const queueDir = path.join(planningDir, STATE_QUEUE_DIR);
    if (!fs.existsSync(queueDir)) {
      fs.mkdirSync(queueDir, { recursive: true });
    }

    const timestamp = Date.now();
    const rand = crypto.randomBytes(4).toString('hex');
    const filename = `${timestamp}-${process.pid}-${rand}.json`;
    const filePath = path.join(queueDir, filename);

    const entry = {
      field,
      value,
      enqueued_at: new Date().toISOString(),
      pid: process.pid
    };

    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), { flag: 'wx' });
    return { success: true, file: filename };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Enqueue multiple field updates as a single atomic batch.
 * Writes one queue file with all fields.
 *
 * @param {Object} fields - { field: value, ... } pairs
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {{ success: boolean, file?: string, error?: string }}
 */
function stateEnqueueBatch(fields, planningDir) {
  try {
    const queueDir = path.join(planningDir, STATE_QUEUE_DIR);
    if (!fs.existsSync(queueDir)) {
      fs.mkdirSync(queueDir, { recursive: true });
    }

    const timestamp = Date.now();
    const rand = crypto.randomBytes(4).toString('hex');
    const filename = `${timestamp}-${process.pid}-${rand}.json`;
    const filePath = path.join(queueDir, filename);

    const entry = {
      fields,
      enqueued_at: new Date().toISOString(),
      pid: process.pid
    };

    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), { flag: 'wx' });
    return { success: true, file: filename };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Drain all queued STATE.md updates, applying them sequentially under a single lock.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {{ success: boolean, processed?: number, fields?: string[], error?: string }}
 */
function stateDrain(planningDir) {
  const queueDir = path.join(planningDir, STATE_QUEUE_DIR);

  // If no queue dir or empty, nothing to do
  if (!fs.existsSync(queueDir)) {
    return { success: true, processed: 0 };
  }

  const files = fs.readdirSync(queueDir)
    .filter(f => f.endsWith('.json'))
    .sort(); // Timestamp-prefixed names sort chronologically

  if (files.length === 0) {
    return { success: true, processed: 0 };
  }

  // Read all queue entries before acquiring lock
  const entries = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(queueDir, file), 'utf8');
      entries.push({ file, data: JSON.parse(content) });
    } catch (e) {
      // Skip malformed entries — they'll be cleaned up below
      entries.push({ file, data: null, error: e.message });
    }
  }

  // Lazy-require to avoid circular dependency
  const { lockedFileUpdate } = require('./core.cjs');
  const { updateFrontmatterField, syncBodyLine } = require('./state.cjs');

  const statePath = path.join(planningDir, 'STATE.md');
  const appliedFields = [];

  const result = lockedFileUpdate(statePath, (content) => {
    let updated = content;

    for (const entry of entries) {
      if (!entry.data) continue;

      if (entry.data.fields) {
        // Batch entry: apply each field
        for (const [field, value] of Object.entries(entry.data.fields)) {
          updated = updateFrontmatterField(updated, field, value);
          updated = syncBodyLine(updated, field, value);
          appliedFields.push(field);
        }
      } else if (entry.data.field) {
        // Single-field entry
        updated = updateFrontmatterField(updated, entry.data.field, entry.data.value);
        updated = syncBodyLine(updated, entry.data.field, entry.data.value);
        appliedFields.push(entry.data.field);
      }
    }

    return updated;
  });

  if (!result.success) {
    // Lock failed — leave queue files intact for retry
    return { success: false, error: result.error };
  }

  // Delete processed queue files
  for (const entry of entries) {
    try {
      fs.unlinkSync(path.join(queueDir, entry.file));
    } catch (_e) {
      // Best-effort cleanup
    }
  }

  return { success: true, processed: entries.length, fields: appliedFields };
}

module.exports = {
  stateEnqueue,
  stateEnqueueBatch,
  stateDrain,
  STATE_QUEUE_DIR
};
