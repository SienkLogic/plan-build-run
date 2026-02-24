import { createWatcher, type WatchEvent } from './services/watcher.service.js';
import { broadcast } from './services/sse.service.js';
import type { FSWatcher } from 'chokidar';

/**
 * Start the file watcher for the project's .planning/ directory.
 *
 * On every file-change event, optionally invalidates caches (via the
 * onCacheInvalidate callback) and broadcasts an SSE 'file-change' event
 * to all connected clients.
 *
 * @param projectDir - Absolute path to the project root directory
 * @param onCacheInvalidate - Optional callback to clear service-level caches
 * @returns The FSWatcher instance (call .close() for graceful shutdown)
 */
export function startWatcher(
  projectDir: string,
  onCacheInvalidate?: () => void
): FSWatcher {
  const watcher = createWatcher(projectDir, async (event: WatchEvent) => {
    onCacheInvalidate?.();
    await broadcast('file-change', event);
  });
  return watcher;
}
