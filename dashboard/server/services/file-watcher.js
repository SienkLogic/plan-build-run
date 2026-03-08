'use strict';

const chokidar = require('chokidar');
const EventEmitter = require('events');
const path = require('path');

/**
 * Classify a file change event based on its path relative to the planning dir.
 * @param {string} filePath - Absolute path of the changed file
 * @param {string} planningDir - Root planning directory
 * @returns {string} Event type: "phase", "event", or "context"
 */
function classifyEvent(filePath, planningDir) {
  const rel = path.relative(planningDir, filePath).replace(/\\/g, '/');

  if (rel.startsWith('phases/') || rel.startsWith('phases\\')) return 'phase';
  if (rel === 'ROADMAP.md') return 'phase';
  if (rel === 'STATE.md') return 'event';
  if (rel === 'config.json') return 'event';
  return 'context';
}

/**
 * FileWatcher watches a .planning/ directory for changes and emits
 * LiveEvent-shaped objects via the 'event' event.
 *
 * @extends EventEmitter
 */
class FileWatcher extends EventEmitter {
  /**
   * @param {string} planningDir - Absolute path to .planning/ directory
   * @param {object} [options]
   * @param {number} [options.debounceMs=100] - Debounce interval in ms
   */
  constructor(planningDir, options = {}) {
    super();
    this.planningDir = planningDir;
    this.debounceMs = options.debounceMs || 100;
    this.watcher = null;
    this._pendingEvents = new Map();
    this._debounceTimer = null;
  }

  /**
   * Start watching the planning directory.
   * @returns {Promise<void>} Resolves when watcher is ready.
   */
  start() {
    return new Promise((resolve) => {
      this.watcher = chokidar.watch(this.planningDir, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 300 },
      });

      this.watcher.on('ready', () => resolve());

      const handleChange = (changeType, filePath) => {
        // Debounce: store pending event keyed by file path
        this._pendingEvents.set(filePath, { changeType, filePath });

        if (this._debounceTimer) {
          clearTimeout(this._debounceTimer);
        }

        this._debounceTimer = setTimeout(() => {
          for (const [, entry] of this._pendingEvents) {
            const type = classifyEvent(entry.filePath, this.planningDir);
            const rel = path.relative(this.planningDir, entry.filePath).replace(/\\/g, '/');
            this.emit('event', {
              ts: new Date().toISOString(),
              type,
              source: 'file-watcher',
              msg: `${entry.changeType}: ${rel}`,
              level: 'info',
            });
          }
          this._pendingEvents.clear();
          this._debounceTimer = null;
        }, this.debounceMs);
      };

      this.watcher.on('add', (fp) => handleChange('add', fp));
      this.watcher.on('change', (fp) => handleChange('change', fp));
      this.watcher.on('unlink', (fp) => handleChange('unlink', fp));
    });
  }

  /**
   * Stop watching and clean up.
   * @returns {Promise<void>}
   */
  async stop() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this._pendingEvents.clear();
  }
}

module.exports = { FileWatcher, classifyEvent };
