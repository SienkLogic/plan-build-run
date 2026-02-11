import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock chokidar before importing watcher service
const mockWatcher = {
  on: vi.fn(function (event, handler) {
    this._handlers = this._handlers || {};
    this._handlers[event] = handler;
    return this;
  }),
  close: vi.fn().mockResolvedValue(undefined),
  _emit(event, ...args) {
    if (this._handlers && this._handlers[event]) {
      this._handlers[event](...args);
    }
  }
};

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => mockWatcher)
  }
}));

// Import after mock
const { createWatcher } = await import('../../src/services/watcher.service.js');
const chokidar = (await import('chokidar')).default;

describe('watcher.service', () => {
  let onChange;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWatcher._handlers = {};
    onChange = vi.fn();
  });

  it('should call chokidar.watch with correct path and options', () => {
    createWatcher('/project', onChange);

    expect(chokidar.watch).toHaveBeenCalledOnce();

    const [watchPath, options] = chokidar.watch.mock.calls[0];
    // Path should include .planning/**/*.md (platform-specific separator is OK)
    expect(watchPath).toContain('.planning');
    expect(watchPath).toContain('*.md');
    expect(options.ignoreInitial).toBe(true);
    expect(options.persistent).toBe(true);
    expect(options.awaitWriteFinish).toBeDefined();
    expect(options.awaitWriteFinish.stabilityThreshold).toBe(2000);
  });

  it('should register handlers for add, change, unlink, and error events', () => {
    createWatcher('/project', onChange);

    expect(mockWatcher.on).toHaveBeenCalledWith('add', expect.any(Function));
    expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
    expect(mockWatcher.on).toHaveBeenCalledWith('unlink', expect.any(Function));
    expect(mockWatcher.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should call onChange with normalized event on file change', () => {
    createWatcher('/project', onChange);

    // Simulate a change event with an absolute path
    const absPath = '/project/.planning/STATE.md';
    mockWatcher._emit('change', absPath);

    expect(onChange).toHaveBeenCalledOnce();
    const event = onChange.mock.calls[0][0];
    expect(event.type).toBe('change');
    expect(event.path).toContain('.planning');
    expect(event.path).toContain('STATE.md');
    expect(typeof event.timestamp).toBe('number');
  });

  it('should call onChange with type add on file add', () => {
    createWatcher('/project', onChange);

    mockWatcher._emit('add', '/project/.planning/new-file.md');

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0].type).toBe('add');
  });

  it('should call onChange with type unlink on file removal', () => {
    createWatcher('/project', onChange);

    mockWatcher._emit('unlink', '/project/.planning/removed-file.md');

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0].type).toBe('unlink');
  });
});
