/**
 * frontmatter.test.js -- Unit tests for the shared dashboard frontmatter parser.
 *
 * Validates CRLF safety, nested YAML, arrays, and edge cases.
 * The dashboard frontmatter parser is a critical cross-platform surface
 * since it processes files that may have been created on Windows (CRLF)
 * or Linux (LF).
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseFrontmatter } = require('../lib/frontmatter');

describe('parseFrontmatter', () => {
  it('extracts key-value pairs from YAML between --- delimiters (LF)', () => {
    const content = "---\nkey: value\ntitle: Hello World\n---\nbody text";
    const { frontmatter, body } = parseFrontmatter(content);
    assert.equal(frontmatter.key, 'value');
    assert.equal(frontmatter.title, 'Hello World');
    assert.equal(body, 'body text');
  });

  it('produces identical output for LF and CRLF input', () => {
    const lfContent = "---\nkey: value\ncount: 5\n---\nbody text here";
    const crlfContent = "---\r\nkey: value\r\ncount: 5\r\n---\r\nbody text here";

    const lfResult = parseFrontmatter(lfContent);
    const crlfResult = parseFrontmatter(crlfContent);

    assert.deepEqual(lfResult.frontmatter, crlfResult.frontmatter,
      'frontmatter should be identical for LF and CRLF');
    assert.equal(lfResult.body, crlfResult.body,
      'body should be identical for LF and CRLF');
  });

  it('handles nested YAML (2-space indent) returning nested objects', () => {
    const content = "---\nprogress:\n  total: 5\n  done: 3\n---\n";
    const { frontmatter } = parseFrontmatter(content);
    assert.equal(typeof frontmatter.progress, 'object');
    assert.equal(frontmatter.progress.total, 5);
    assert.equal(frontmatter.progress.done, 3);
  });

  it('handles nested YAML with CRLF line endings', () => {
    const content = "---\r\nprogress:\r\n  total: 5\r\n  done: 3\r\n---\r\nbody";
    const { frontmatter } = parseFrontmatter(content);
    assert.equal(typeof frontmatter.progress, 'object');
    assert.equal(frontmatter.progress.total, 5);
    assert.equal(frontmatter.progress.done, 3);
  });

  it('returns empty object for content with no frontmatter', () => {
    const content = "just body text\nno frontmatter here";
    const { frontmatter, body } = parseFrontmatter(content);
    assert.deepEqual(frontmatter, {});
    assert.ok(body.includes('just body text'));
  });

  it('handles arrays in frontmatter (inline bracket syntax)', () => {
    const content = "---\ndepends_on: [plan-01, plan-02]\n---\n";
    const { frontmatter } = parseFrontmatter(content);
    assert.ok(Array.isArray(frontmatter.depends_on), 'depends_on should be an array');
    assert.equal(frontmatter.depends_on.length, 2);
    assert.equal(frontmatter.depends_on[0], 'plan-01');
    assert.equal(frontmatter.depends_on[1], 'plan-02');
  });

  it('handles empty array', () => {
    const content = "---\ndepends_on: []\n---\n";
    const { frontmatter } = parseFrontmatter(content);
    assert.ok(Array.isArray(frontmatter.depends_on));
    assert.equal(frontmatter.depends_on.length, 0);
  });

  it('handles boolean values', () => {
    const content = "---\nautonomous: true\nskip: false\n---\n";
    const { frontmatter } = parseFrontmatter(content);
    assert.equal(frontmatter.autonomous, true);
    assert.equal(frontmatter.skip, false);
  });

  it('handles numeric values', () => {
    const content = "---\nplan: 3\nprogress_percent: 67\n---\n";
    const { frontmatter } = parseFrontmatter(content);
    assert.equal(frontmatter.plan, 3);
    assert.equal(frontmatter.progress_percent, 67);
  });

  it('handles quoted string values', () => {
    const content = "---\nstatus: \"complete\"\ntitle: 'Hello'\n---\n";
    const { frontmatter } = parseFrontmatter(content);
    assert.equal(frontmatter.status, 'complete');
    assert.equal(frontmatter.title, 'Hello');
  });

  it('handles empty body after frontmatter', () => {
    const content = "---\nkey: value\n---\n";
    const { frontmatter, body } = parseFrontmatter(content);
    assert.equal(frontmatter.key, 'value');
    assert.equal(body, '');
  });
});
