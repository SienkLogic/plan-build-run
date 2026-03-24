/**
 * Agent prompt size validation tests.
 *
 * Ensures every agent prompt file stays under 8000 estimated tokens.
 * Token estimate: Math.ceil(wordCount * 4 / 3) — conservative approximation.
 */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.resolve(__dirname, '..', 'plugins', 'pbr', 'agents');
const MAX_TOKENS = 8000;

function estimateTokens(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 4 / 3);
}

describe('agent prompt size limits', () => {
  const agentFiles = fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

  test('agents directory contains at least one agent file', async () => {
    expect(agentFiles.length).toBeGreaterThan(0);
  });

  test.each(agentFiles)('%s is under 8000 estimated tokens', (filename) => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, filename), 'utf8');
    const tokens = estimateTokens(content);
    expect(tokens).toBeLessThan(MAX_TOKENS);
  });
});
