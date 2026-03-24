'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { checkDocExistence } = require('../plugins/pbr/scripts/lib/gates/doc-existence');

// Helper to create a temp project with .planning/ structure
function makeTempProject(files = []) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-docexist-test-'));
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });

  for (const f of files) {
    fs.writeFileSync(path.join(planningDir, f), `# ${f}\n`, 'utf8');
  }

  return { tmpDir, planningDir };
}

function makeData() {
  return { tool_input: { description: 'test task', subagent_type: 'pbr:executor' } };
}

describe('checkDocExistence', () => {
  let origEnv;
  let origCwd;

  beforeEach(() => {
    origEnv = process.env.PBR_PROJECT_ROOT;
    origCwd = process.cwd;
  });

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.PBR_PROJECT_ROOT;
    } else {
      process.env.PBR_PROJECT_ROOT = origEnv;
    }
    process.cwd = origCwd;
  });

  test('returns null when PROJECT.md and REQUIREMENTS.md both exist', async () => {
    const { tmpDir, planningDir } = makeTempProject([
      'STATE.md', 'ROADMAP.md', 'PROJECT.md', 'REQUIREMENTS.md'
    ]);
    // Write .active-skill = 'plan'
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'plan', 'utf8');
    process.env.PBR_PROJECT_ROOT = tmpDir;

    const result = checkDocExistence(makeData());
    expect(result).toBeNull();
  });

  test('returns block when PROJECT.md is missing but STATE.md and ROADMAP.md exist', async () => {
    const { tmpDir, planningDir } = makeTempProject([
      'STATE.md', 'ROADMAP.md', 'REQUIREMENTS.md'
    ]);
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'plan', 'utf8');
    process.env.PBR_PROJECT_ROOT = tmpDir;

    const result = checkDocExistence(makeData());
    expect(result).not.toBeNull();
    expect(result.block).toBe(true);
    expect(result.reason).toContain('PROJECT.md');
  });

  test('returns block when REQUIREMENTS.md is missing but STATE.md and ROADMAP.md exist', async () => {
    const { tmpDir, planningDir } = makeTempProject([
      'STATE.md', 'ROADMAP.md', 'PROJECT.md'
    ]);
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build', 'utf8');
    process.env.PBR_PROJECT_ROOT = tmpDir;

    const result = checkDocExistence(makeData());
    expect(result).not.toBeNull();
    expect(result.block).toBe(true);
    expect(result.reason).toContain('REQUIREMENTS.md');
  });

  test('returns null when STATE.md is missing (not a PBR project yet)', async () => {
    const { tmpDir, planningDir } = makeTempProject([
      'ROADMAP.md'
    ]);
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'plan', 'utf8');
    process.env.PBR_PROJECT_ROOT = tmpDir;

    const result = checkDocExistence(makeData());
    expect(result).toBeNull();
  });

  test('returns null when active skill is not plan or build', async () => {
    const { tmpDir, planningDir } = makeTempProject([
      'STATE.md', 'ROADMAP.md'
      // PROJECT.md and REQUIREMENTS.md both missing — but skill is not plan/build
    ]);
    fs.writeFileSync(path.join(planningDir, '.active-skill'), 'debug', 'utf8');
    process.env.PBR_PROJECT_ROOT = tmpDir;

    const result = checkDocExistence(makeData());
    expect(result).toBeNull();
  });
});
