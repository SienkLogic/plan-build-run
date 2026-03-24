/**
 * Few-Shot Examples Structure Validation
 *
 * Validates that all few-shot example files in plugins/pbr/references/few-shot-examples/
 * have the required format: YAML frontmatter with component/version/last_calibrated,
 * Positive Examples and Negative Examples sections, and at least 2 examples per section.
 */

const fs = require('fs');
const path = require('path');

const EXAMPLES_DIR = path.join(__dirname, '..', 'plugins', 'pbr', 'references', 'few-shot-examples');

const EXPECTED_FILES = [
  'verifier.md',
  'plan-checker.md',
  'integration-checker.md',
  'audit.md',
  'nyquist-auditor.md',
  'ui-checker.md',
  'check-plan-format.md',
  'check-subagent-output.md',
];

describe('few-shot-examples structure', () => {
  test('all expected example files exist', () => {
    for (const file of EXPECTED_FILES) {
      const filePath = path.join(EXAMPLES_DIR, file);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  test.each(EXPECTED_FILES)('%s has valid YAML frontmatter', (file) => {
    const content = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
    const stem = file.replace('.md', '');

    // Must start with ---
    expect(content.trimStart().startsWith('---')).toBe(true);

    // Extract frontmatter
    const trimmed = content.trimStart();
    const secondDash = trimmed.indexOf('---', 3);
    expect(secondDash).toBeGreaterThan(3);
    const frontmatter = trimmed.substring(3, secondDash);

    // Required frontmatter fields
    expect(frontmatter).toMatch(/component:\s*.+/);
    expect(frontmatter).toMatch(/version:\s*.+/);
    expect(frontmatter).toMatch(/last_calibrated:\s*.+/);

    // component field should match filename stem
    const componentMatch = frontmatter.match(/component:\s*(.+)/);
    expect(componentMatch).not.toBeNull();
    expect(componentMatch[1].trim()).toBe(stem);
  });

  test.each(EXPECTED_FILES)('%s has Positive and Negative Examples sections', (file) => {
    const content = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
    expect(content).toContain('## Positive Examples');
    expect(content).toContain('## Negative Examples');
  });

  test.each(EXPECTED_FILES)('%s has at least 2 examples per section', (file) => {
    const content = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');

    // Split into positive and negative sections
    const positiveStart = content.indexOf('## Positive Examples');
    const negativeStart = content.indexOf('## Negative Examples');
    expect(positiveStart).toBeGreaterThan(-1);
    expect(negativeStart).toBeGreaterThan(-1);

    const positiveSection = content.substring(positiveStart, negativeStart);
    const negativeSection = content.substring(negativeStart);

    // Count ### Example headings in each section
    const positiveExamples = (positiveSection.match(/^### Example \d+/gm) || []).length;
    const negativeExamples = (negativeSection.match(/^### Example \d+/gm) || []).length;

    expect(positiveExamples).toBeGreaterThanOrEqual(2);
    expect(negativeExamples).toBeGreaterThanOrEqual(2);
  });

  test('no unexpected files in few-shot-examples directory', () => {
    const actualFiles = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.md'));
    const expectedSet = new Set(EXPECTED_FILES);
    for (const file of actualFiles) {
      expect(expectedSet.has(file)).toBe(true);
    }
  });
});
