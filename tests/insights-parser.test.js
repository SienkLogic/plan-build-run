'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseInsightsHtml, insightsImport } = require('../plugins/pbr/scripts/lib/insights-parser');

// --- Test helpers ---

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'insights-test-'));
}

function createMinimalKnowledge(dir) {
  const planningDir = path.join(dir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  const content = `---
updated: "2026-01-01"
---
# Project Knowledge Base

## Key Rules

| ID | Rule | Source | Date |
|----|------|--------|------|

## Patterns

| ID | Pattern | Source | Date |
|----|---------|--------|------|

## Lessons Learned

| ID | Lesson | Type | Source | Date |
|----|--------|------|--------|------|
`;
  fs.writeFileSync(path.join(planningDir, 'KNOWLEDGE.md'), content, 'utf8');
  return planningDir;
}

const SAMPLE_HTML = `<html><body>
<h2>Friction Points</h2>
<p>These are repeated manual steps that slow development:</p>
<ul>
  <li>Manual copy-paste of configuration between environments is tedious and error-prone</li>
  <li>Repeated boilerplate code for API endpoints requires workaround patterns</li>
</ul>
<h2>Workflow Improvements</h2>
<p>Process improvements discovered during the project:</p>
<ul>
  <li>Automation of deployment pipeline streamlined the workflow significantly</li>
  <li>Continuous integration improved efficiency of the development process</li>
</ul>
<h3>Rules and Conventions</h3>
<p>Copy-paste-ready rules for the team:</p>
<ul>
  <li>Always enforce strict TypeScript configuration as a standard convention</li>
  <li>Never allow direct database access without constraint validation rules</li>
</ul>
<h2>Recurring Patterns</h2>
<ul>
  <li>Repository pattern is a reusable approach for data access across the codebase</li>
  <li>Event-driven architecture is a recurring technique for async communication</li>
</ul>
</body></html>`;

// --- parseInsightsHtml tests ---

describe('parseInsightsHtml', () => {
  test('extracts findings from HTML with headings and lists', () => {
    const result = parseInsightsHtml(SAMPLE_HTML);

    expect(result).toHaveProperty('findings');
    expect(result).toHaveProperty('metadata');
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.metadata).toHaveProperty('source', 'insights-html');
    expect(result.metadata).toHaveProperty('extractedAt');
    expect(result.metadata).toHaveProperty('totalFindings');
    expect(result.metadata.totalFindings).toBe(result.findings.length);
  });

  test('findings have required fields', () => {
    const { findings } = parseInsightsHtml(SAMPLE_HTML);

    for (const finding of findings) {
      expect(finding).toHaveProperty('category');
      expect(finding).toHaveProperty('summary');
      expect(finding).toHaveProperty('detail');
      expect(finding).toHaveProperty('tags');
      expect(['friction', 'workflow', 'rules', 'patterns']).toContain(finding.category);
      expect(Array.isArray(finding.tags)).toBe(true);
    }
  });

  test('all findings include "insights" tag', () => {
    const { findings } = parseInsightsHtml(SAMPLE_HTML);

    for (const finding of findings) {
      expect(finding.tags).toContain('insights');
    }
  });

  test('detects friction category from friction keywords', () => {
    const { findings } = parseInsightsHtml(SAMPLE_HTML);
    const frictionFindings = findings.filter(f => f.category === 'friction');
    expect(frictionFindings.length).toBeGreaterThan(0);
  });

  test('detects workflow category from workflow keywords', () => {
    const { findings } = parseInsightsHtml(SAMPLE_HTML);
    const workflowFindings = findings.filter(f => f.category === 'workflow');
    expect(workflowFindings.length).toBeGreaterThan(0);
  });

  test('returns empty findings for empty HTML', () => {
    const result = parseInsightsHtml('');
    expect(result.findings).toEqual([]);
    expect(result.metadata.totalFindings).toBe(0);
  });

  test('returns empty findings for null/undefined input', () => {
    expect(parseInsightsHtml(null).findings).toEqual([]);
    expect(parseInsightsHtml(undefined).findings).toEqual([]);
  });

  test('returns empty findings for HTML with no extractable sections', () => {
    const result = parseInsightsHtml('<html><body><p>Hi</p></body></html>');
    expect(result.findings).toEqual([]);
  });

  test('truncates summaries longer than 200 chars', () => {
    const longText = 'A'.repeat(300);
    const html = `<h2>Test</h2><ul><li>${longText}</li></ul>`;
    const { findings } = parseInsightsHtml(html);
    if (findings.length > 0) {
      expect(findings[0].summary.length).toBeLessThanOrEqual(200);
    }
  });
});

// --- insightsImport tests ---

describe('insightsImport', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('imports findings from HTML file into learnings and KNOWLEDGE.md', () => {
    const planningDir = createMinimalKnowledge(tempDir);
    const htmlPath = path.join(tempDir, 'insights.html');
    fs.writeFileSync(htmlPath, SAMPLE_HTML, 'utf8');

    const learningsFile = path.join(tempDir, 'learnings.jsonl');

    const result = insightsImport(htmlPath, 'test-project', planningDir, {
      learningsFilePath: learningsFile
    });

    expect(result.imported).toBeGreaterThan(0);
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.knowledgeUpdated).toBe(true);

    // Verify KNOWLEDGE.md was updated
    const knowledge = fs.readFileSync(path.join(planningDir, 'KNOWLEDGE.md'), 'utf8');
    // Should have new rows (L, K, or P prefixed)
    const newRows = knowledge.match(/\| [KPL]\d+/g);
    expect(newRows).not.toBeNull();
    expect(newRows.length).toBeGreaterThan(0);

    // Verify learnings.jsonl was written
    expect(fs.existsSync(learningsFile)).toBe(true);
    const jsonlContent = fs.readFileSync(learningsFile, 'utf8');
    const lines = jsonlContent.trim().split('\n').filter(l => l.trim());
    expect(lines.length).toBeGreaterThan(0);

    // Verify each JSONL entry is valid JSON
    for (const line of lines) {
      const entry = JSON.parse(line);
      expect(entry).toHaveProperty('source_project', 'test-project');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('tags');
      expect(entry.tags).toContain('insights');
    }
  });

  test('returns zero imports for empty HTML file', () => {
    const planningDir = createMinimalKnowledge(tempDir);
    const htmlPath = path.join(tempDir, 'empty.html');
    fs.writeFileSync(htmlPath, '<html><body></body></html>', 'utf8');

    const result = insightsImport(htmlPath, 'test-project', planningDir, {
      learningsFilePath: path.join(tempDir, 'learnings.jsonl')
    });

    expect(result.imported).toBe(0);
    expect(result.findings).toEqual([]);
    expect(result.knowledgeUpdated).toBe(false);
  });

  test('throws on missing HTML file', () => {
    expect(() => {
      insightsImport(path.join(tempDir, 'nonexistent.html'), 'test-project', tempDir);
    }).toThrow(/not found/);
  });

  test('throws on null htmlFilePath', () => {
    expect(() => {
      insightsImport(null);
    }).toThrow(/required/);
  });

  test('uses default project name from cwd basename', () => {
    const planningDir = createMinimalKnowledge(tempDir);
    const htmlPath = path.join(tempDir, 'insights.html');
    fs.writeFileSync(htmlPath, SAMPLE_HTML, 'utf8');

    const learningsFile = path.join(tempDir, 'learnings.jsonl');

    // Call without explicit project name
    const result = insightsImport(htmlPath, undefined, planningDir, {
      learningsFilePath: learningsFile
    });

    expect(result.imported).toBeGreaterThan(0);

    // The project name should be basename of cwd
    const jsonlContent = fs.readFileSync(learningsFile, 'utf8');
    const firstEntry = JSON.parse(jsonlContent.split('\n')[0]);
    expect(firstEntry.source_project).toBe(path.basename(process.cwd()));
  });
});
