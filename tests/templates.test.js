'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  templateList,
  templateInstantiate,
  USER_TEMPLATES_DIR,
  BUILT_IN_TEMPLATES,
} = require('../plan-build-run/bin/lib/templates.cjs');

// --- Helpers ---

const _tmpDirs = [];
afterAll(() => {
  for (const d of _tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function makeTempDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'templates-test-'));
  _tmpDirs.push(d);
  return d;
}

// --- Constants ---

describe('templates constants', () => {
  test('USER_TEMPLATES_DIR is in ~/.claude/templates/', () => {
    expect(USER_TEMPLATES_DIR).toBe(path.join(os.homedir(), '.claude', 'templates'));
  });

  test('BUILT_IN_TEMPLATES contains required templates', () => {
    expect(BUILT_IN_TEMPLATES).toBeDefined();
    expect(BUILT_IN_TEMPLATES['auth-oauth']).toBeDefined();
    expect(BUILT_IN_TEMPLATES['crud-rest']).toBeDefined();
    expect(BUILT_IN_TEMPLATES['crud-graphql']).toBeDefined();
    expect(BUILT_IN_TEMPLATES['payments-stripe']).toBeDefined();
  });
});

// --- templateList ---

describe('templateList', () => {
  test('returns all 4 built-in templates', () => {
    const templates = templateList();
    expect(Array.isArray(templates)).toBe(true);
    const names = templates.map(t => t.name);
    expect(names).toContain('auth-oauth');
    expect(names).toContain('crud-rest');
    expect(names).toContain('crud-graphql');
    expect(names).toContain('payments-stripe');
  });

  test('each template has name, description, parameters, category', () => {
    const templates = templateList();
    for (const tmpl of templates) {
      expect(tmpl.name).toBeDefined();
      expect(typeof tmpl.description).toBe('string');
      expect(Array.isArray(tmpl.parameters)).toBe(true);
      expect(typeof tmpl.category).toBe('string');
    }
  });

  test('each template parameter has name and required fields', () => {
    const templates = templateList();
    for (const tmpl of templates) {
      for (const param of tmpl.parameters) {
        expect(typeof param.name).toBe('string');
        expect(typeof param.required).toBe('boolean');
      }
    }
  });

  test('auth-oauth has provider, callback_route, session_store parameters', () => {
    const templates = templateList();
    const authTmpl = templates.find(t => t.name === 'auth-oauth');
    const paramNames = authTmpl.parameters.map(p => p.name);
    expect(paramNames).toContain('provider');
    expect(paramNames).toContain('callback_route');
    expect(paramNames).toContain('session_store');
  });

  test('crud-rest has resource_name, fields, db_type parameters', () => {
    const templates = templateList();
    const tmpl = templates.find(t => t.name === 'crud-rest');
    const paramNames = tmpl.parameters.map(p => p.name);
    expect(paramNames).toContain('resource_name');
    expect(paramNames).toContain('fields');
    expect(paramNames).toContain('db_type');
  });

  test('includes user-defined templates from userTemplatesDir if they exist', () => {
    const tmpDir = makeTempDir();
    const userTmpl = {
      name: 'my-custom-template',
      description: 'Custom template',
      category: 'custom',
      parameters: [{ name: 'foo', required: true }],
      body: '<task id="T1"><name>custom</name><files>foo.js</files><action>1. do {{foo}}</action><verify>echo ok</verify><done>done</done></task>',
    };
    fs.writeFileSync(path.join(tmpDir, 'my-custom-template.json'), JSON.stringify(userTmpl), 'utf8');

    const templates = templateList({ userTemplatesDir: tmpDir });
    const names = templates.map(t => t.name);
    expect(names).toContain('my-custom-template');
  });

  test('returns { enabled: false } when config toggle is off', () => {
    const result = templateList({ configFeatures: { spec_templates: false } });
    expect(result).toEqual({ enabled: false });
  });
});

// --- templateInstantiate ---

describe('templateInstantiate', () => {
  test('instantiates auth-oauth template with all required params', () => {
    const result = templateInstantiate('auth-oauth', {
      provider: 'google',
      callback_route: '/auth/callback',
      session_store: 'redis',
    });
    expect(result.template).toBe('auth-oauth');
    expect(typeof result.content).toBe('string');
    expect(result.params_used).toBeDefined();
    expect(result.params_used.provider).toBe('google');
  });

  test('output contains valid XML task blocks', () => {
    const result = templateInstantiate('crud-rest', {
      resource_name: 'User',
      fields: 'name,email',
      db_type: 'postgres',
    });
    expect(result.content).toContain('<task');
    expect(result.content).toContain('<name>');
    expect(result.content).toContain('<files>');
    expect(result.content).toContain('<action>');
    expect(result.content).toContain('<verify>');
    expect(result.content).toContain('<done>');
  });

  test('substitutes {{param}} placeholders', () => {
    const result = templateInstantiate('auth-oauth', {
      provider: 'github',
      callback_route: '/auth/github/callback',
      session_store: 'memory',
    });
    expect(result.content).toContain('github');
    expect(result.content).not.toContain('{{provider}}');
  });

  test('throws on missing required parameters', () => {
    expect(() => templateInstantiate('auth-oauth', {
      // missing provider, callback_route, session_store
    })).toThrow();
  });

  test('throws on unknown template name', () => {
    expect(() => templateInstantiate('nonexistent-template', {})).toThrow();
  });

  test('returns { enabled: false } when config toggle is off', () => {
    const result = templateInstantiate('auth-oauth', {
      provider: 'google',
      callback_route: '/auth/callback',
      session_store: 'redis',
    }, { configFeatures: { spec_templates: false } });
    expect(result).toEqual({ enabled: false });
  });

  test('instantiates crud-graphql template', () => {
    const result = templateInstantiate('crud-graphql', {
      resource_name: 'Post',
      fields: 'title,body',
    });
    expect(result.template).toBe('crud-graphql');
    expect(result.content).toContain('Post');
  });

  test('instantiates payments-stripe template', () => {
    const result = templateInstantiate('payments-stripe', {
      product_model: 'Subscription',
      webhook_path: '/webhooks/stripe',
    });
    expect(result.template).toBe('payments-stripe');
    expect(result.content).toContain('Subscription');
  });

  test('uses user-defined template from userTemplatesDir', () => {
    const tmpDir = makeTempDir();
    const userTmpl = {
      name: 'my-tmpl',
      description: 'My template',
      category: 'custom',
      parameters: [{ name: 'thing', required: true }],
      body: '<task id="T1"><name>Do {{thing}}</name><files>{{thing}}.js</files><action>1. build {{thing}}</action><verify>echo ok</verify><done>done</done></task>',
    };
    fs.writeFileSync(path.join(tmpDir, 'my-tmpl.json'), JSON.stringify(userTmpl), 'utf8');

    const result = templateInstantiate('my-tmpl', { thing: 'widget' }, { userTemplatesDir: tmpDir });
    expect(result.content).toContain('widget');
    expect(result.content).not.toContain('{{thing}}');
  });
});
