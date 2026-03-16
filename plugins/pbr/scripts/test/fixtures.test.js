/**
 * fixtures.test.js -- Validates that test fixtures match current PBR file formats.
 *
 * Ensures fixture files parse correctly through the same lib modules
 * that production code uses. Acts as a regression guard: if formats
 * change in a future phase, these tests break.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// PBR lib modules used in production
const { parseYamlFrontmatter } = require('../lib/core');
const { parseStateMd } = require('../lib/state');
const { parseRoadmapMd } = require('../lib/roadmap');

// Dashboard frontmatter parser (shared parser from Phase 6)
const { parseFrontmatter } = require('../../../../dashboard/server/lib/frontmatter');

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

describe('state.md fixture', () => {
  it('has valid YAML frontmatter with required fields', () => {
    const content = readFixture('state.md');
    const fm = parseYamlFrontmatter(content);
    assert.ok(fm.gsd_state_version, 'should have gsd_state_version');
    assert.ok(fm.milestone, 'should have milestone');
    assert.ok(fm.status, 'should have status');
    assert.ok(fm.progress_percent !== undefined, 'should have progress_percent');
  });

  it('has required body sections', () => {
    const content = readFixture('state.md');
    assert.ok(content.includes('## Current Position'), 'should have Current Position section');
    assert.ok(content.includes('## Accumulated Context'), 'should have Accumulated Context section');
    assert.ok(content.includes('## Session Continuity'), 'should have Session Continuity section');
  });

  it('parses through parseStateMd without error', () => {
    const content = readFixture('state.md');
    const result = parseStateMd(content);
    assert.ok(result, 'parseStateMd should return a result');
    assert.equal(result.format, 'frontmatter', 'should be detected as frontmatter format');
    assert.ok(result.current_phase, 'should extract current_phase');
    assert.ok(result.status, 'should extract status');
  });

  it('parses through dashboard parseFrontmatter', () => {
    const content = readFixture('state.md');
    const { frontmatter, body } = parseFrontmatter(content);
    assert.ok(frontmatter.gsd_state_version, 'dashboard parser should extract gsd_state_version');
    assert.ok(body.length > 0, 'should have body content');
  });
});

describe('roadmap.md fixture', () => {
  it('has required sections', () => {
    const content = readFixture('roadmap.md');
    assert.ok(content.includes('## Phases') || content.includes('## Phase Overview'), 'should have Phases section');
    assert.ok(content.includes('## Phase Details') || content.match(/### Phase \d+:/), 'should have Phase Details');
    assert.ok(content.includes('## Progress'), 'should have Progress section');
  });

  it('has progress table with correct columns', () => {
    const content = readFixture('roadmap.md');
    const progressSection = content.split('## Progress')[1];
    assert.ok(progressSection, 'should have progress section');
    assert.ok(progressSection.includes('Phase'), 'should have Phase column');
    assert.ok(progressSection.includes('Status'), 'should have Status column');
  });

  it('has checkbox items', () => {
    const content = readFixture('roadmap.md');
    assert.ok(/- \[[ x]\]/.test(content), 'should have checkbox items');
  });

  it('parses through parseRoadmapMd', () => {
    const content = readFixture('roadmap.md');
    const result = parseRoadmapMd(content);
    assert.ok(result, 'parseRoadmapMd should return a result');
    assert.ok(result.has_progress_table, 'should detect progress table');
  });
});

describe('project.md fixture', () => {
  it('has required sections', () => {
    const content = readFixture('project.md');
    assert.ok(content.includes('## What This Is'), 'should have What This Is section');
    assert.ok(content.includes('## Core Value'), 'should have Core Value section');
    assert.ok(content.includes('## Requirements Summary'), 'should have Requirements Summary section');
    assert.ok(content.includes('## Context'), 'should have Context section');
  });

  it('parses through dashboard parseFrontmatter', () => {
    const content = readFixture('project.md');
    const { body } = parseFrontmatter(content);
    assert.ok(body.length > 0, 'should have body content');
  });
});

describe('config.json fixture', () => {
  it('has required fields with valid values', () => {
    const content = readFixture('config.json');
    const config = JSON.parse(content);
    assert.ok(config.mode, 'should have mode');
    assert.ok(config.depth, 'should have depth');
    assert.equal(typeof config.parallelization, 'object', 'should have parallelization object');
    assert.equal(typeof config.git, 'object', 'should have git object');
    assert.ok(['interactive', 'autonomous'].includes(config.mode), 'mode should be valid');
    assert.ok(['quick', 'standard', 'comprehensive'].includes(config.depth), 'depth should be valid');
  });

  it('has valid git settings', () => {
    const content = readFixture('config.json');
    const config = JSON.parse(content);
    assert.ok(config.git.branching, 'should have git.branching');
    assert.equal(typeof config.git.auto_commit, 'boolean', 'git.auto_commit should be boolean');
  });
});

describe('plan.md fixture', () => {
  it('has YAML frontmatter with required fields', () => {
    const content = readFixture('plan.md');
    const fm = parseYamlFrontmatter(content);
    assert.ok(fm.phase, 'should have phase');
    assert.ok(fm.plan, 'should have plan');
    assert.ok(fm.type, 'should have type');
    assert.ok(fm.wave !== undefined, 'should have wave');
    assert.ok(fm.autonomous !== undefined, 'should have autonomous');
  });

  it('has required body sections', () => {
    const content = readFixture('plan.md');
    assert.ok(content.includes('<objective>'), 'should have objective section');
    assert.ok(content.includes('<tasks>'), 'should have tasks section');
    assert.ok(content.includes('<verification>'), 'should have verification section');
    assert.ok(content.includes('<success_criteria>'), 'should have success_criteria section');
  });

  it('has must_haves in frontmatter', () => {
    const content = readFixture('plan.md');
    const fm = parseYamlFrontmatter(content);
    assert.ok(fm.must_haves !== undefined || fm.files_modified !== undefined,
      'should have must_haves or files_modified');
  });

  it('parses through dashboard parseFrontmatter', () => {
    const content = readFixture('plan.md');
    const { frontmatter } = parseFrontmatter(content);
    assert.ok(frontmatter.phase, 'dashboard parser should extract phase');
    assert.ok(frontmatter.plan, 'dashboard parser should extract plan');
  });
});

describe('summary.md fixture', () => {
  it('has YAML frontmatter with required fields', () => {
    const content = readFixture('summary.md');
    const { frontmatter } = parseFrontmatter(content);
    assert.ok(frontmatter.phase, 'should have phase');
    assert.ok(frontmatter.plan, 'should have plan');
    assert.ok(frontmatter.status, 'should have status');
    assert.ok(frontmatter.duration, 'should have duration');
    assert.ok(frontmatter.tasks_completed !== undefined, 'should have tasks_completed');
    assert.ok(frontmatter.tasks_total !== undefined, 'should have tasks_total');
  });

  it('has body with features or changes sections', () => {
    const content = readFixture('summary.md');
    const { body } = parseFrontmatter(content);
    assert.ok(body.length > 0, 'should have body content');
    assert.ok(
      body.includes('## Features') || body.includes('## Changes') || body.includes('## What Was Built'),
      'should have Features, Changes, or What Was Built section'
    );
  });
});
