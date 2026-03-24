'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-onboard-test-'));
}

// ─── 15-02-T2: Onboarding generator tests ────────────────────────────────────

describe('generateOnboardingGuide', () => {
  let tmpDir;
  let generateOnboardingGuide;

  beforeEach(() => {
    tmpDir = makeTempDir();
    jest.resetModules();
    generateOnboardingGuide = require('../plugins/pbr/scripts/lib/onboarding-generator').generateOnboardingGuide;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('generates guide with project overview from PROJECT.md', async () => {
    const projectContent = `# My Test Project

## What This Is
A test project for onboarding tests.

## Core Value
Testing the onboarding generator.
`;
    fs.writeFileSync(path.join(tmpDir, 'PROJECT.md'), projectContent);
    const config = { features: { team_onboarding: true } };
    const result = generateOnboardingGuide(tmpDir, config);
    expect(result.enabled).toBe(true);
    const overview = result.sections.find(s => s.title === 'Project Overview');
    expect(overview).toBeDefined();
    expect(overview.content).toMatch(/My Test Project|test project/i);
  });

  test('generates guide with phase roadmap summary from ROADMAP.md', async () => {
    const roadmapContent = `# Roadmap

## Phase 1: Setup
Goal: Set up infrastructure

## Phase 2: Build
Goal: Build features

## Phase 3: Deploy
Goal: Deploy to production
`;
    fs.writeFileSync(path.join(tmpDir, 'ROADMAP.md'), roadmapContent);
    const config = { features: { team_onboarding: true } };
    const result = generateOnboardingGuide(tmpDir, config);
    const phasesSection = result.sections.find(s => s.title === 'Development Phases');
    expect(phasesSection).toBeDefined();
    expect(phasesSection.content).toMatch(/Phase/);
  });

  test('generates guide with key decisions from CONTEXT.md', async () => {
    const contextContent = `# Context

## Locked Decisions
- Use TypeScript for all new code
- Postgres for persistence

## Deferred
- Consider GraphQL later
`;
    fs.writeFileSync(path.join(tmpDir, 'CONTEXT.md'), contextContent);
    const config = { features: { team_onboarding: true } };
    const result = generateOnboardingGuide(tmpDir, config);
    const decisionsSection = result.sections.find(s => s.title === 'Key Decisions');
    expect(decisionsSection).toBeDefined();
    expect(decisionsSection.content).toMatch(/TypeScript|Postgres|decision/i);
  });

  test('generates guide with conventions section when .planning/conventions/ exists', async () => {
    const conventionsDir = path.join(tmpDir, 'conventions');
    fs.mkdirSync(conventionsDir, { recursive: true });
    fs.writeFileSync(path.join(conventionsDir, 'naming.md'), '# Naming Conventions\n\nUse camelCase for functions.\n');
    const config = { features: { team_onboarding: true } };
    const result = generateOnboardingGuide(tmpDir, config);
    const conventionsSection = result.sections.find(s => s.title === 'Conventions');
    expect(conventionsSection).toBeDefined();
  });

  test('renders full markdown document from sections', async () => {
    fs.writeFileSync(path.join(tmpDir, 'ROADMAP.md'), '# Roadmap\n## Phase 1: Test\n- [ ] plan\n');
    const config = { features: { team_onboarding: true } };
    const result = generateOnboardingGuide(tmpDir, config);
    expect(typeof result.markdown).toBe('string');
    expect(result.markdown).toMatch(/Getting Started/i);
  });

  test('returns disabled stub when features.team_onboarding is false', async () => {
    const config = { features: { team_onboarding: false } };
    const result = generateOnboardingGuide(tmpDir, config);
    expect(result.enabled).toBe(false);
    expect(result.sections).toEqual([]);
    expect(result.markdown).toBe('');
  });
});
