'use strict';

const fs = require('fs');
const path = require('path');

const HOOKS_JSON_PATH = path.join(__dirname, '..', 'plugins', 'pbr', 'hooks', 'hooks.json');
const SCHEMA_PATH = path.join(__dirname, '..', 'plugins', 'pbr', 'scripts', 'hooks-schema.json');

describe('hooks.json validation', () => {
  let hooksData;

  beforeAll(() => {
    const raw = fs.readFileSync(HOOKS_JSON_PATH, 'utf8');
    hooksData = JSON.parse(raw);
  });

  test('hooks.json is valid JSON', () => {
    expect(hooksData).toBeDefined();
    expect(typeof hooksData).toBe('object');
  });

  test('hooks.json has a hooks object', () => {
    expect(hooksData.hooks).toBeDefined();
    expect(typeof hooksData.hooks).toBe('object');
  });

  test('every command-type entry has a command field', () => {
    const hooks = hooksData.hooks;
    for (const [event, entries] of Object.entries(hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          if (hook.type === 'command') {
            expect(hook.command).toBeDefined();
            expect(typeof hook.command).toBe('string');
            expect(hook.command.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  test('every http-type entry has a url field', () => {
    const hooks = hooksData.hooks;
    for (const [_event, entries] of Object.entries(hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          if (hook.type === 'http') {
            expect(hook.url).toBeDefined();
            expect(typeof hook.url).toBe('string');
            expect(hook.url).toMatch(/^https?:\/\//);
          }
        }
      }
    }
  });

  test('http-type entries exist for PostToolUse hooks', () => {
    const postToolUse = hooksData.hooks.PostToolUse || [];
    const httpEntries = [];
    for (const entry of postToolUse) {
      for (const hook of entry.hooks) {
        if (hook.type === 'http') {
          httpEntries.push({ matcher: entry.matcher, url: hook.url });
        }
      }
    }
    // At least Write, Read, Bash, Task should have http entries
    expect(httpEntries.length).toBeGreaterThanOrEqual(4);
    const urls = httpEntries.map(e => e.url);
    expect(urls.some(u => u.includes('/PostToolUse/Write'))).toBe(true);
    expect(urls.some(u => u.includes('/PostToolUse/Read'))).toBe(true);
    expect(urls.some(u => u.includes('/PostToolUse/Bash'))).toBe(true);
    expect(urls.some(u => u.includes('/PostToolUse/Task'))).toBe(true);
  });

  test('PreToolUse hooks remain as command type (not http)', () => {
    const preToolUse = hooksData.hooks.PreToolUse || [];
    for (const entry of preToolUse) {
      for (const hook of entry.hooks) {
        expect(hook.type).toBe('command');
      }
    }
  });

  test('every hook entry has a valid type field', () => {
    const validTypes = ['command', 'http'];
    const hooks = hooksData.hooks;
    for (const [_event, entries] of Object.entries(hooks)) {
      for (const entry of entries) {
        for (const hook of entry.hooks) {
          expect(validTypes).toContain(hook.type);
        }
      }
    }
  });

  test('hooks-schema.json supports type http with url property', () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const hookCommand = schema.definitions.hookCommand;
    expect(hookCommand.properties.type.enum).toContain('http');
    expect(hookCommand.properties.url).toBeDefined();
    expect(hookCommand.properties.url.type).toBe('string');
  });
});
