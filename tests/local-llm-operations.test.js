'use strict';

/**
 * Local LLM operations stub tests.
 *
 * The full operation implementations are deferred to v3 (ADV-01).
 * These tests verify that each operation stub module exports the expected
 * function(s) and returns graceful stub responses.
 */

const { classifyArtifact } = require('../plan-build-run/bin/lib/local-llm/operations/classify-artifact.cjs');
const { validateTask } = require('../plan-build-run/bin/lib/local-llm/operations/validate-task.cjs');
const { classifyError } = require('../plan-build-run/bin/lib/local-llm/operations/classify-error.cjs');
const { classifyCommit } = require('../plan-build-run/bin/lib/local-llm/operations/classify-commit.cjs');
const { classifyFileIntent } = require('../plan-build-run/bin/lib/local-llm/operations/classify-file-intent.cjs');
const { triageTestOutput } = require('../plan-build-run/bin/lib/local-llm/operations/triage-test-output.cjs');

describe('classifyArtifact (stub)', () => {
  test('returns an object with classification and confidence', async () => {
    const result = await classifyArtifact();
    expect(result).toHaveProperty('classification');
    expect(result).toHaveProperty('confidence');
    expect(result.confidence).toBe(0);
  });

  test('does not throw when called with arguments', async () => {
    await expect(classifyArtifact({}, '/tmp', 'content', 'PLAN')).resolves.toBeDefined();
  });
});

describe('validateTask (stub)', () => {
  test('returns an object with valid and confidence', async () => {
    const result = await validateTask();
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('confidence');
    expect(result.confidence).toBe(0);
  });

  test('does not throw when called with arguments', async () => {
    await expect(validateTask({}, '/tmp', { description: 'test' })).resolves.toBeDefined();
  });
});

describe('classifyError (stub)', () => {
  test('returns an object with category and confidence', async () => {
    const result = await classifyError();
    expect(result).toHaveProperty('category');
    expect(result.category).toBe('unknown');
    expect(result).toHaveProperty('confidence');
    expect(result.confidence).toBe(0);
  });

  test('does not throw when called with arguments', async () => {
    await expect(classifyError({}, '/tmp', 'ECONNREFUSED')).resolves.toBeDefined();
  });
});

describe('classifyCommit (stub)', () => {
  test('returns an object with type and confidence', async () => {
    const result = await classifyCommit();
    expect(result).toHaveProperty('type');
    expect(result.type).toBe('unknown');
    expect(result).toHaveProperty('confidence');
    expect(result.confidence).toBe(0);
  });

  test('does not throw when called with arguments', async () => {
    await expect(classifyCommit({}, '/tmp', 'feat: something', [])).resolves.toBeDefined();
  });
});

describe('classifyFileIntent (stub)', () => {
  test('returns an object with intent and confidence', async () => {
    const result = await classifyFileIntent();
    expect(result).toHaveProperty('intent');
    expect(result.intent).toBe('unknown');
    expect(result).toHaveProperty('confidence');
    expect(result.confidence).toBe(0);
  });

  test('does not throw when called with arguments', async () => {
    await expect(classifyFileIntent({}, '/tmp', 'file.js', 'content')).resolves.toBeDefined();
  });
});

describe('triageTestOutput (stub)', () => {
  test('returns an object with category, confidence, and file_hint', async () => {
    const result = await triageTestOutput();
    expect(result).toHaveProperty('category');
    expect(result.category).toBe('unknown');
    expect(result).toHaveProperty('confidence');
    expect(result.confidence).toBe(0);
    expect(result).toHaveProperty('file_hint');
    expect(result.file_hint).toBeNull();
  });

  test('does not throw when called with arguments', async () => {
    await expect(triageTestOutput({}, '/tmp', 'FAIL test', 'jest')).resolves.toBeDefined();
  });
});

describe('all stubs are async functions', () => {
  test('classifyArtifact returns a promise', () => {
    const result = classifyArtifact();
    expect(result).toBeInstanceOf(Promise);
  });

  test('validateTask returns a promise', () => {
    const result = validateTask();
    expect(result).toBeInstanceOf(Promise);
  });

  test('classifyError returns a promise', () => {
    const result = classifyError();
    expect(result).toBeInstanceOf(Promise);
  });

  test('classifyCommit returns a promise', () => {
    const result = classifyCommit();
    expect(result).toBeInstanceOf(Promise);
  });

  test('classifyFileIntent returns a promise', () => {
    const result = classifyFileIntent();
    expect(result).toBeInstanceOf(Promise);
  });

  test('triageTestOutput returns a promise', () => {
    const result = triageTestOutput();
    expect(result).toBeInstanceOf(Promise);
  });
});
