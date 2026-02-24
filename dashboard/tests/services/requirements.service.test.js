import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock node:fs/promises with memfs (used by requirements.service.js AND planning.repository.js)
vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return memfs.fs.promises;
});

// Import AFTER mock is set up
const { getRequirementsData } = await import(
  '../../src/services/requirements.service.js'
);

// --- Fixtures ---

const REQUIREMENTS_MD = `---
version: "1.0"
---
# Requirements

## P02 Authentication

- **P02-G1**: User can log in with Discord OAuth
- **P02-G2**: Protected routes redirect unauthenticated users to login

## P03 Dashboard

- **P03-G1**: Dashboard shows current phase status
`;

const PLAN_01 = `---
phase: "02-authentication"
plan: "02-01"
requirement_ids:
  - P02-G1
  - P02-G2
---
`;

const PLAN_NO_IDS = `---
phase: "03-dashboard"
plan: "03-01"
---
`;

const PLAN_02 = `---
phase: "02-authentication"
plan: "02-02"
requirement_ids:
  - P02-G1
---
`;

beforeEach(() => {
  vol.reset();
});

describe('getRequirementsData', () => {
  it('returns empty state when REQUIREMENTS.md missing', async () => {
    vol.fromJSON({
      '/project/package.json': '{}',
    });

    const result = await getRequirementsData('/project');

    expect(result).toEqual({ sections: [], totalCount: 0, coveredCount: 0 });
  });

  it('parses requirement IDs and text from markdown', async () => {
    vol.fromJSON({
      '/project/.planning/REQUIREMENTS.md': REQUIREMENTS_MD,
    });

    const result = await getRequirementsData('/project');

    expect(result.totalCount).toBe(3);
    expect(result.sections.length).toBe(2);
    expect(result.sections[0].sectionTitle).toBe('P02 Authentication');
    expect(result.sections[0].requirements.length).toBe(2);
    expect(result.sections[1].sectionTitle).toBe('P03 Dashboard');
    expect(result.sections[1].requirements.length).toBe(1);
    // All uncovered since no plans
    result.sections.forEach(section => {
      section.requirements.forEach(req => {
        expect(req.covered).toBe(false);
        expect(req.planRefs).toEqual([]);
      });
    });
  });

  it('cross-references plan frontmatter requirement_ids', async () => {
    vol.fromJSON({
      '/project/.planning/REQUIREMENTS.md': REQUIREMENTS_MD,
      '/project/.planning/phases/02-authentication/PLAN-01.md': PLAN_01,
    });

    const result = await getRequirementsData('/project');

    const authSection = result.sections[0];
    const g1 = authSection.requirements.find(r => r.id === 'P02-G1');
    const g2 = authSection.requirements.find(r => r.id === 'P02-G2');

    expect(g1.planRefs).toEqual(['02-01']);
    expect(g1.covered).toBe(true);
    expect(g2.planRefs).toEqual(['02-01']);
    expect(g2.covered).toBe(true);

    const dashSection = result.sections[1];
    const g3 = dashSection.requirements.find(r => r.id === 'P03-G1');
    expect(g3.planRefs).toEqual([]);
    expect(g3.covered).toBe(false);
  });

  it('multiple plans can reference the same requirement', async () => {
    vol.fromJSON({
      '/project/.planning/REQUIREMENTS.md': REQUIREMENTS_MD,
      '/project/.planning/phases/02-authentication/PLAN-01.md': PLAN_01,
      '/project/.planning/phases/02-authentication/PLAN-02.md': PLAN_02,
    });

    const result = await getRequirementsData('/project');

    const authSection = result.sections[0];
    const g1 = authSection.requirements.find(r => r.id === 'P02-G1');

    expect(g1.planRefs.length).toBe(2);
    expect(g1.covered).toBe(true);
  });

  it('plans without requirement_ids do not cause errors', async () => {
    vol.fromJSON({
      '/project/.planning/REQUIREMENTS.md': REQUIREMENTS_MD,
      '/project/.planning/phases/03-dashboard/PLAN-01.md': PLAN_NO_IDS,
    });

    await expect(getRequirementsData('/project')).resolves.not.toThrow();
  });

  it('coveredCount reflects requirements with at least one plan ref', async () => {
    vol.fromJSON({
      '/project/.planning/REQUIREMENTS.md': REQUIREMENTS_MD,
      '/project/.planning/phases/02-authentication/PLAN-01.md': PLAN_01,
    });

    const result = await getRequirementsData('/project');

    // P02-G1 and P02-G2 are covered, P03-G1 is not
    expect(result.coveredCount).toBe(2);
    expect(result.totalCount).toBe(3);
  });
});
