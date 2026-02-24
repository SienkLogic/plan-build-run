import chokidar, { type FSWatcher } from 'chokidar';
import { join, relative } from 'node:path';

export interface WatchEvent {
  path: string;
  type: 'add' | 'change' | 'unlink';
  timestamp: number;
}

export function createWatcher(
  watchPath: string,
  onChange: (event: WatchEvent) => void
): FSWatcher {
  const planningDir = join(watchPath, '.planning');
  const watcher = chokidar.watch(join(planningDir, '**/*.md'), {
    ignored: ['**/node_modules/**', '**/.git/**'],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  const handle = (type: WatchEvent['type']) => (filePath: string) => {
    onChange({ path: relative(watchPath, filePath), type, timestamp: Date.now() });
  };

  watcher.on('add', handle('add'));
  watcher.on('change', handle('change'));
  watcher.on('unlink', handle('unlink'));
  watcher.on('error', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Watcher error:', message);
  });

  return watcher;
}
