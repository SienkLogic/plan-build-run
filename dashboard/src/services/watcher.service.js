import chokidar from 'chokidar';
import { join, relative } from 'node:path';

/**
 * Create a chokidar file watcher for the .planning/ directory.
 *
 * Watches **\/*.md files with awaitWriteFinish to debounce editor saves.
 * Calls onChange with a normalized event object on add, change, and unlink.
 *
 * @param {string} watchPath - Absolute path to the project directory
 * @param {(event: {path: string, type: string, timestamp: number}) => void} onChange
 * @returns {import('chokidar').FSWatcher}
 */
export function createWatcher(watchPath, onChange) {
  const planningDir = join(watchPath, '.planning');

  const watcher = chokidar.watch(join(planningDir, '**/*.md'), {
    ignored: [
      '**/node_modules/**',
      '**/.git/**'
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  });

  const handleEvent = (type) => (filePath) => {
    const relativePath = relative(watchPath, filePath);
    onChange({
      path: relativePath,
      type,
      timestamp: Date.now()
    });
  };

  watcher.on('add', handleEvent('add'));
  watcher.on('change', handleEvent('change'));
  watcher.on('unlink', handleEvent('unlink'));

  watcher.on('error', (error) => {
    console.error('Watcher error:', error.message);
  });

  return watcher;
}
