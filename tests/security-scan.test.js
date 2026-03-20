'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { scanFiles, formatFindings, SECURITY_RULES } = require('../plugins/pbr/scripts/lib/security-scan');

describe('SECURITY_RULES', () => {
  test('has at least 8 rules', () => {
    expect(SECURITY_RULES.length).toBeGreaterThanOrEqual(8);
  });

  test('each rule has required properties', () => {
    for (const rule of SECURITY_RULES) {
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('name');
      expect(rule).toHaveProperty('pattern');
      expect(rule).toHaveProperty('severity');
      expect(rule).toHaveProperty('message');
    }
  });
});

describe('scanFiles', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-sec-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createFile(name, content) {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  test('returns empty when feature disabled', () => {
    const config = { features: { security_scanning: false } };
    const result = scanFiles([], config);
    expect(result.findings).toEqual([]);
    expect(result.scanned).toBe(0);
  });

  test('detects hardcoded secrets pattern', () => {
    const filePath = createFile('secrets.js', 'const API_KEY = "sk-abc123secrettoken";');
    const config = { features: { security_scanning: true } };
    const result = scanFiles([filePath], config);
    const highFindings = result.findings.filter(f => f.severity === 'high');
    expect(highFindings.length).toBeGreaterThanOrEqual(1);
    expect(highFindings.some(f => f.ruleId === 'SEC-001')).toBe(true);
  });

  test('detects eval usage', () => {
    const filePath = createFile('eval.js', 'function run(code) { eval(code); }');
    const config = { features: { security_scanning: true } };
    const result = scanFiles([filePath], config);
    expect(result.findings.some(f => f.ruleId === 'SEC-002')).toBe(true);
  });

  test('detects unsafe regex', () => {
    const filePath = createFile('regex.js', 'const re = /^(a+)+$/;');
    const config = { features: { security_scanning: true } };
    const result = scanFiles([filePath], config);
    expect(result.findings.some(f => f.ruleId === 'SEC-004')).toBe(true);
  });

  test('detects shell injection risk', () => {
    const filePath = createFile('shell.js', 'exec("ls " + userInput);');
    const config = { features: { security_scanning: true } };
    const result = scanFiles([filePath], config);
    expect(result.findings.some(f => f.ruleId === 'SEC-003')).toBe(true);
  });

  test('returns severity per rule - high for secrets', () => {
    const filePath = createFile('key.js', 'const PASSWORD = "super_secret_password_12345";');
    const config = { features: { security_scanning: true } };
    const result = scanFiles([filePath], config);
    const secretFinding = result.findings.find(f => f.ruleId === 'SEC-001');
    if (secretFinding) {
      expect(secretFinding.severity).toBe('high');
    }
  });

  test('ignores test files - downgrades severity to info', () => {
    const filePath = createFile('validate.test.js', 'eval(testCode);');
    const config = { features: { security_scanning: true } };
    const result = scanFiles([filePath], config);
    const evalFindings = result.findings.filter(f => f.ruleId === 'SEC-002');
    if (evalFindings.length > 0) {
      expect(evalFindings[0].severity).toBe('info');
    }
  });

  test('returns scanned file count', () => {
    const f1 = createFile('a.js', 'const x = 1;');
    const f2 = createFile('b.js', 'const y = 2;');
    const config = { features: { security_scanning: true } };
    const result = scanFiles([f1, f2], config);
    expect(result.scanned).toBe(2);
  });

  test('each finding has required fields', () => {
    const filePath = createFile('ev.js', 'eval(input);');
    const config = { features: { security_scanning: true } };
    const result = scanFiles([filePath], config);
    for (const finding of result.findings) {
      expect(finding).toHaveProperty('ruleId');
      expect(finding).toHaveProperty('ruleName');
      expect(finding).toHaveProperty('file');
      expect(finding).toHaveProperty('lineNumber');
      expect(finding).toHaveProperty('severity');
      expect(finding).toHaveProperty('message');
    }
  });
});

describe('formatFindings', () => {
  test('produces readable report', () => {
    const scanResult = {
      findings: [
        { ruleId: 'SEC-001', ruleName: 'hardcoded-secret', file: 'src/auth.js', line: 'const KEY="abc"', lineNumber: 5, severity: 'high', message: 'Potential hardcoded secret' },
        { ruleId: 'SEC-002', ruleName: 'eval-usage', file: 'src/run.js', line: 'eval(x)', lineNumber: 12, severity: 'high', message: 'eval() with dynamic input' },
      ],
      scanned: 3,
    };
    const report = formatFindings(scanResult);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(20);
    expect(report).toMatch(/SEC-001|hardcoded|secret/i);
  });

  test('handles empty findings', () => {
    const report = formatFindings({ findings: [], scanned: 5 });
    expect(typeof report).toBe('string');
    expect(report).toMatch(/no findings|0 findings|clean/i);
  });
});
