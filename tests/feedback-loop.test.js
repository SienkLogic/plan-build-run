const fs = require('fs');
const path = require('path');
const os = require('os');

let tmpDir;
let originalCwd;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-feedback-loop-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  // Create .planning structure
  fs.mkdirSync(path.join(tmpDir, '.planning', 'logs'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '03-auth'), { recursive: true });
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Helper to write VERIFICATION.md with frontmatter and body
function writeVerification(phaseDir, frontmatter, body = '') {
  const lines = ['---'];
  for (const [key, val] of Object.entries(frontmatter)) {
    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      for (const item of val) lines.push(`  - "${item}"`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push('---');
  if (body) lines.push('', body);
  fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), lines.join('\n'));
}

describe('feedback-loop.js', () => {
  let feedbackLoop;

  beforeEach(() => {
    // Clear require cache so each test starts fresh
    const modPath = path.resolve(__dirname, '..', 'plugins', 'pbr', 'scripts', 'feedback-loop.js');
    delete require.cache[modPath];
    feedbackLoop = require(modPath);
  });

  describe('extractFeedback', () => {
    test('returns null when no VERIFICATION.md exists', async () => {
      const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
      const result = feedbackLoop.extractFeedback(phaseDir);
      expect(result).toBeNull();
    });

    test('returns structured object when VERIFICATION.md has status "gaps_found"', async () => {
      const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
      writeVerification(phaseDir, {
        status: 'gaps_found',
        attempt: 2,
        must_haves_passed: 3,
        must_haves_total: 5
      }, [
        '### Gap: Missing auth middleware',
        '**Category:** missing_artifact',
        '**Evidence:** File auth/middleware.js does not exist',
        '**Suggested Fix:** Create auth/middleware.js with JWT validation',
        '',
        '### Gap: Stub route handler',
        '**Category:** stub',
        '**Evidence:** routes/auth.js exports empty function',
        '**Suggested Fix:** Implement login/logout handlers in routes/auth.js'
      ].join('\n'));

      const result = feedbackLoop.extractFeedback(phaseDir);
      expect(result).not.toBeNull();
      expect(result.status).toBe('gaps_found');
      expect(result.attempt).toBe(2);
      expect(result.pass_rate).toBeCloseTo(0.6);
      expect(result.gaps).toHaveLength(2);
      expect(result.gaps[0].name).toBe('Missing auth middleware');
      expect(result.gaps[0].category).toBe('missing_artifact');
      expect(result.gaps[0].evidence).toBe('File auth/middleware.js does not exist');
      expect(result.gaps[0].suggested_fix).toBe('Create auth/middleware.js with JWT validation');
      expect(result.gaps[1].name).toBe('Stub route handler');
      expect(result.gaps[1].category).toBe('stub');
    });

    test('returns null when VERIFICATION.md has status "passed"', async () => {
      const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
      writeVerification(phaseDir, {
        status: 'passed',
        attempt: 1,
        must_haves_passed: 5,
        must_haves_total: 5
      });

      const result = feedbackLoop.extractFeedback(phaseDir);
      expect(result).toBeNull();
    });

    test('returns null when VERIFICATION.md has status "all_passed"', async () => {
      const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
      writeVerification(phaseDir, {
        status: 'all_passed',
        attempt: 1,
        must_haves_passed: 5,
        must_haves_total: 5
      });

      const result = feedbackLoop.extractFeedback(phaseDir);
      expect(result).toBeNull();
    });

    test('handles VERIFICATION.md with no gaps in body', async () => {
      const phaseDir = path.join(tmpDir, '.planning', 'phases', '03-auth');
      writeVerification(phaseDir, {
        status: 'gaps_found',
        attempt: 1,
        must_haves_passed: 4,
        must_haves_total: 5
      }, '## Results\nSome text but no gap sections.');

      const result = feedbackLoop.extractFeedback(phaseDir);
      expect(result).not.toBeNull();
      expect(result.gaps).toHaveLength(0);
      expect(result.pass_rate).toBeCloseTo(0.8);
    });
  });

  describe('formatFeedbackPrompt', () => {
    test('produces markdown with gap descriptions', async () => {
      const feedback = {
        status: 'gaps_found',
        attempt: 2,
        pass_rate: 0.6,
        gaps: [
          {
            name: 'Missing auth middleware',
            category: 'missing_artifact',
            evidence: 'File auth/middleware.js does not exist',
            suggested_fix: 'Create auth/middleware.js with JWT validation'
          }
        ]
      };

      const result = feedbackLoop.formatFeedbackPrompt(feedback);
      expect(result).toContain('## Previous Verification Feedback (Attempt 2)');
      expect(result).toContain('Pass rate: 60%');
      expect(result).toContain('### Missing auth middleware');
      expect(result).toContain('**Category:** missing_artifact');
      expect(result).toContain('**Evidence:** File auth/middleware.js does not exist');
      expect(result).toContain('**Fix:** Create auth/middleware.js with JWT validation');
    });

    test('includes suggested fixes from VERIFICATION.md', async () => {
      const feedback = {
        status: 'gaps_found',
        attempt: 3,
        pass_rate: 0.4,
        gaps: [
          { name: 'Gap A', category: 'wiring', evidence: 'No import', suggested_fix: 'Add import' },
          { name: 'Gap B', category: 'failed', evidence: 'Test fails', suggested_fix: 'Fix assertion' }
        ]
      };

      const result = feedbackLoop.formatFeedbackPrompt(feedback);
      expect(result).toContain('**Fix:** Add import');
      expect(result).toContain('**Fix:** Fix assertion');
      expect(result).toContain('Attempt 3');
      expect(result).toContain('40%');
    });

    test('returns empty string when feedback is null', async () => {
      const result = feedbackLoop.formatFeedbackPrompt(null);
      expect(result).toBe('');
    });

    test('output is under 500 tokens (roughly 2000 chars for reasonable gap count)', async () => {
      const feedback = {
        status: 'gaps_found',
        attempt: 1,
        pass_rate: 0.5,
        gaps: [
          { name: 'Gap 1', category: 'stub', evidence: 'Evidence 1', suggested_fix: 'Fix 1' },
          { name: 'Gap 2', category: 'wiring', evidence: 'Evidence 2', suggested_fix: 'Fix 2' },
          { name: 'Gap 3', category: 'missing_artifact', evidence: 'Evidence 3', suggested_fix: 'Fix 3' }
        ]
      };

      const result = feedbackLoop.formatFeedbackPrompt(feedback);
      // 500 tokens ~ 2000 chars as a rough estimate
      expect(result.length).toBeLessThan(2000);
    });
  });

  describe('isEnabled', () => {
    test('returns true by default when config has no features section', async () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ depth: 'standard' })
      );
      const result = feedbackLoop.isEnabled(path.join(tmpDir, '.planning'));
      expect(result).toBe(true);
    });

    test('returns true when agent_feedback_loop is explicitly true', async () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ features: { agent_feedback_loop: true } })
      );
      const result = feedbackLoop.isEnabled(path.join(tmpDir, '.planning'));
      expect(result).toBe(true);
    });

    test('returns false when agent_feedback_loop is explicitly false', async () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ features: { agent_feedback_loop: false } })
      );
      const result = feedbackLoop.isEnabled(path.join(tmpDir, '.planning'));
      expect(result).toBe(false);
    });

    test('returns true when config.json does not exist', async () => {
      const result = feedbackLoop.isEnabled(path.join(tmpDir, '.planning'));
      expect(result).toBe(true);
    });
  });
});
