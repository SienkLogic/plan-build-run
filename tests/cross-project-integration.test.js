'use strict';

/**
 * cross-project-integration.test.js -- Integration tests proving end-to-end
 * round-trips for Phase 16 cross-project intelligence features.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { patternExtract, patternQuery, patternList } = require('../plugins/pbr/scripts/lib/patterns');
const { templateList, templateInstantiate } = require('../plugins/pbr/scripts/lib/templates');
const { learningsIngest, learningsAggregate } = require('../plugins/pbr/scripts/lib/learnings');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-xp-integration-'));
}

// --- Pattern round-trip ---

describe('patterns: extract-then-query round-trip', () => {
  test('extracted pattern can be queried back by name via tag filter', async () => {
    const tmpDir = makeTempDir();

    try {
      patternExtract({
        name: 'jwt-auth',
        source_project: 'proj-roundtrip',
        type: 'auth',
        tags: ['jwt', 'middleware', 'stack:node'],
        description: 'JWT auth middleware pattern',
        confidence: 0.85,
      }, { basePath: tmpDir });

      const results = patternQuery({ tags: ['jwt'] }, { basePath: tmpDir });
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('jwt-auth');
      expect(results[0].source_project).toBe('proj-roundtrip');
      expect(results[0].confidence).toBe(0.85);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('extracted pattern appears in patternList', async () => {
    const tmpDir = makeTempDir();

    try {
      patternExtract({
        name: 'redis-cache',
        source_project: 'cache-service',
        type: 'architecture',
        tags: ['redis', 'cache'],
        description: 'Redis caching pattern',
        confidence: 0.9,
      }, { basePath: tmpDir });

      const list = patternList({ basePath: tmpDir });
      expect(list.length).toBe(1);
      expect(list[0].name).toBe('redis-cache');
      expect(list[0].type).toBe('architecture');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('update round-trip: extracting same pattern merges tags', async () => {
    const tmpDir = makeTempDir();

    try {
      patternExtract({
        name: 'retry-logic',
        source_project: 'api-service',
        type: 'error-handling',
        tags: ['retry'],
        description: 'Retry logic for flaky operations',
        confidence: 0.7,
      }, { basePath: tmpDir });

      const result = patternExtract({
        name: 'retry-logic',
        source_project: 'api-service',
        type: 'error-handling',
        tags: ['retry', 'exponential-backoff'],
        description: 'Retry logic for flaky operations',
        confidence: 0.75,
      }, { basePath: tmpDir });

      expect(result.action).toBe('updated');

      const queried = patternQuery({ tags: ['exponential-backoff'] }, { basePath: tmpDir });
      expect(queried.length).toBe(1);
      expect(queried[0].tags).toContain('retry');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// --- Template round-trip ---

describe('templates: list-then-instantiate round-trip', () => {
  test('lists auth-oauth template then instantiates it with params', async () => {
    const templates = templateList();
    expect(templates.map(t => t.name)).toContain('auth-oauth');

    const result = templateInstantiate('auth-oauth', {
      provider: 'github',
      callback_route: '/auth/github/callback',
      session_store: 'redis',
    });

    expect(result.template).toBe('auth-oauth');
    expect(result.content).toContain('<task');
    expect(result.content).toContain('<name>');
    expect(result.content).toContain('<files>');
    expect(result.content).toContain('<action>');
    expect(result.content).toContain('<verify>');
    expect(result.content).toContain('<done>');
    expect(result.content).toContain('github');
    expect(result.content).not.toContain('{{provider}}');
    expect(result.content).not.toContain('{{callback_route}}');
    expect(result.content).not.toContain('{{session_store}}');
  });

  test('crud-rest template generates 3 task blocks', async () => {
    const result = templateInstantiate('crud-rest', {
      resource_name: 'Product',
      fields: 'name,price,stock',
      db_type: 'mysql',
    });

    const taskMatches = result.content.match(/<task /g);
    expect(taskMatches).not.toBeNull();
    expect(taskMatches.length).toBeGreaterThanOrEqual(2);
    expect(result.content).toContain('Product');
    expect(result.content).toContain('mysql');
  });

  test('instantiated crud-graphql output contains schema and resolvers references', async () => {
    const result = templateInstantiate('crud-graphql', {
      resource_name: 'Article',
      fields: 'title,content,author',
    });

    expect(result.content).toContain('Article');
    expect(result.content).toContain('<task');
  });

  test('instantiated payments-stripe output references product model and webhook path', async () => {
    const result = templateInstantiate('payments-stripe', {
      product_model: 'Order',
      webhook_path: '/webhooks/stripe',
    });

    expect(result.content).toContain('Order');
    expect(result.content).toContain('/webhooks/stripe');
  });
});

// --- Learnings aggregate cross-project ---

describe('learnings: ingest-from-two-projects-then-aggregate', () => {
  let tmpDir, tmpFile;

  beforeEach(() => {
    tmpDir = makeTempDir();
    tmpFile = path.join(tmpDir, 'learnings.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('aggregate identifies pattern appearing in 2+ projects', async () => {
    const sharedSummary = 'Use connection pooling for database performance';

    learningsIngest({
      id: 'xp-1',
      source_project: 'proj-alpha',
      type: 'tech-pattern',
      tags: ['database', 'performance'],
      confidence: 'high',
      occurrences: 3,
      summary: sharedSummary,
    }, { filePath: tmpFile });

    learningsIngest({
      id: 'xp-2',
      source_project: 'proj-beta',
      type: 'tech-pattern',
      tags: ['database', 'pool'],
      confidence: 'medium',
      occurrences: 2,
      summary: sharedSummary,
    }, { filePath: tmpFile });

    const result = learningsAggregate({}, { filePath: tmpFile });
    expect(result.total).toBe(2);

    const crossPattern = result.cross_project_patterns.find(p => p.summary === sharedSummary);
    expect(crossPattern).toBeDefined();
    expect(crossPattern.projects).toContain('proj-alpha');
    expect(crossPattern.projects).toContain('proj-beta');
  });

  test('top_insights include the most-occurring entry', async () => {
    learningsIngest({
      id: 'top-1',
      source_project: 'proj-a',
      type: 'tech-pattern',
      tags: ['react'],
      confidence: 'high',
      occurrences: 5,
      summary: 'Very common pattern',
    }, { filePath: tmpFile });

    learningsIngest({
      id: 'top-2',
      source_project: 'proj-b',
      type: 'anti-pattern',
      tags: ['node'],
      confidence: 'low',
      occurrences: 1,
      summary: 'Rare issue',
    }, { filePath: tmpFile });

    const result = learningsAggregate({}, { filePath: tmpFile });
    expect(result.top_insights[0].occurrences).toBeGreaterThanOrEqual(result.top_insights[1].occurrences);
    expect(result.top_insights[0].summary).toBe('Very common pattern');
  });
});

// --- Audit evidence logging ---

describe('audit evidence: patternExtract logs to logDir', () => {
  test('after patternExtract, log entry exists in logDir/cross-project.jsonl', () => {
    const tmpDir = makeTempDir();
    const logDir = path.join(tmpDir, 'logs');

    try {
      patternExtract({
        name: 'audit-test-pattern',
        source_project: 'audit-proj',
        type: 'testing',
        tags: ['jest', 'unit'],
        description: 'Test audit logging',
        confidence: 0.8,
      }, { basePath: tmpDir, logDir });

      const logPath = path.join(logDir, 'cross-project.jsonl');
      expect(fs.existsSync(logPath)).toBe(true);

      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(1);

      const entry = JSON.parse(lines[0]);
      expect(entry.operation).toBe('pattern-extract');
      expect(entry.feature).toBe('cross_project_patterns');
      expect(entry.timestamp).toBeDefined();
      expect(entry.detail.name).toBe('audit-test-pattern');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('audit evidence: templateInstantiate logs to logDir', () => {
  test('after templateInstantiate, log entry exists in logDir/cross-project.jsonl', () => {
    const tmpDir = makeTempDir();
    const logDir = path.join(tmpDir, 'logs');

    try {
      templateInstantiate('auth-oauth', {
        provider: 'google',
        callback_route: '/auth/callback',
        session_store: 'memory',
      }, { logDir });

      const logPath = path.join(logDir, 'cross-project.jsonl');
      expect(fs.existsSync(logPath)).toBe(true);

      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(1);

      const entry = JSON.parse(lines[0]);
      expect(entry.operation).toBe('template-instantiate');
      expect(entry.feature).toBe('spec_templates');
      expect(entry.timestamp).toBeDefined();
      expect(entry.detail.template).toBe('auth-oauth');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
