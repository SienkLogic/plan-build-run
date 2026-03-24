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

  test('hooks.json is valid JSON', async () => {
    expect(hooksData).toBeDefined();
    expect(typeof hooksData).toBe('object');
  });

  test('hooks.json has a hooks object', async () => {
    expect(hooksData.hooks).toBeDefined();
    expect(typeof hooksData.hooks).toBe('object');
  });

  test('every command-type entry has a command field', async () => {
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

  test('every http-type entry has a url field', async () => {
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

  test('http-type entries exist for PostToolUse hooks', async () => {
    const postToolUse = hooksData.hooks.PostToolUse || [];
    const httpEntries = [];
    for (const entry of postToolUse) {
      for (const hook of entry.hooks) {
        if (hook.type === 'http') {
          httpEntries.push({ matcher: entry.matcher, url: hook.url });
        }
      }
    }
    // Advisory hooks should have http entries (Read tracker + Write/Edit/Bash/Task bridge)
    expect(httpEntries.length).toBeGreaterThanOrEqual(2);
    const urls = httpEntries.map(e => e.url);
    expect(urls.some(u => u.includes('/PostToolUse/'))).toBe(true);
  });

  test('PreToolUse hooks use http type (hook server migration)', async () => {
    const preToolUse = hooksData.hooks.PreToolUse || [];
    for (const entry of preToolUse) {
      for (const hook of entry.hooks) {
        expect(hook.type).toBe('http');
      }
    }
  });

  test('every hook entry has a valid type field', async () => {
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

  test('hooks-schema.json supports type http with url property', async () => {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const hookCommand = schema.definitions.hookCommand;
    expect(hookCommand.properties.type.enum).toContain('http');
    expect(hookCommand.properties.url).toBeDefined();
    expect(hookCommand.properties.url.type).toBe('string');
  });
});
