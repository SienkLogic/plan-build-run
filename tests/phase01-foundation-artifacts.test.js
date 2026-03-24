/**
 * Phase 01 Foundation — FOUN-01, FOUN-04, FOUN-05: Documentation Artifacts
 *
 * Validates that Phase 1 foundation artifacts exist and contain
 * the required structural content as specified in the plans.
 *
 * These are documentation artifacts in the GSD planning directory.
 * Tests verify existence and content requirements, not code behavior.
 */

const fs = require('fs');
const path = require('path');

// Planning artifacts live in the GSD repo
const GSD_ROOT = path.resolve(__dirname, '..', '..', 'get-shit-done');
const PHASE_DIR = path.join(GSD_ROOT, '.planning', 'phases', '01-foundation');

describe('FOUN-05: terminology mapping document has required content', () => {
  const filePath = path.join(PHASE_DIR, '01-TERMINOLOGY.md');

  test('terminology mapping file exists', async () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('terminology mapping has minimum 40 lines', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(40);
  });

  test('terminology mapping has three-column table with 15+ rows', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    // Count table rows (lines with pipes that are not header separators)
    const tableRows = content.split('\n').filter(
      (line) => line.includes('|') && !line.match(/^\s*\|[-:\s|]+\|/) && !line.match(/Upstream.*PBR/)
    );
    expect(tableRows.length).toBeGreaterThanOrEqual(15);
  });

  test('terminology mapping includes concept-level mapping section', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    // Should have concept-level prose sections
    expect(content).toMatch(/concept/i);
    // Should discuss workflows vs skills
    expect(content).toMatch(/workflow/i);
    expect(content).toMatch(/skill/i);
  });
});

describe('FOUN-01: dependency map covers all 4 edge types', () => {
  const filePath = path.join(PHASE_DIR, '01-DEPENDENCY-MAP.md');

  test('dependency map file exists', async () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('dependency map has minimum 200 lines', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(200);
  });

  test('dependency map contains Edge Type 1: Template-to-Validator', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/template.*validator/i);
  });

  test('dependency map contains Edge Type 2: Template-to-Parser', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/parser/i);
    expect(content).toMatch(/pbr-tools/i);
  });

  test('dependency map contains Edge Type 3: Hook-to-Template', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/hook/i);
  });

  test('dependency map contains Edge Type 4: Skill-to-Template', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/skill/i);
  });

  test('dependency map documents dashboard API consumers', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/dashboard/i);
  });
});

describe('FOUN-04: crash recovery verification documented in dependency map', () => {
  const filePath = path.join(PHASE_DIR, '01-DEPENDENCY-MAP.md');

  test('crash recovery verification section exists', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/crash recovery/i);
  });

  test('crash recovery covers checkpoint functions', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/checkpoint/i);
  });

  test('crash recovery covers staleness detection', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/staleness/i);
  });

  test('crash recovery identifies TEST-01 candidates', async () => {
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toMatch(/TEST-01/i);
  });
});
