'use strict';

jest.mock('../hooks/local-llm/shadow', () => ({
  runShadow: jest.fn()
}));

const { route, scoreComplexity, extractConfidence } = require('../hooks/local-llm/router');
const { runShadow } = require('../hooks/local-llm/shadow');

// ---- scoreComplexity ----

describe('scoreComplexity', () => {
  test('empty/short prompt returns low score', () => {
    const score = scoreComplexity('hello');
    expect(score).toBeLessThan(0.1);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  test('prompt with code blocks, constraints, reasoning keywords returns higher score', () => {
    const prompt = `
      Please analyze this code and explain why it fails. You must handle all edge cases.
      \`\`\`javascript
      function test() { return 42; }
      \`\`\`
      \`\`\`javascript
      function other() { return 0; }
      \`\`\`
      Always return json schema output. Compare the two approaches and evaluate which is better.
      You should never skip validation.
    `;
    const score = scoreComplexity(prompt);
    expect(score).toBeGreaterThan(0.3);
  });

  test('score is clamped to [0, 1]', () => {
    // Very long prompt with everything
    const longPrompt = 'must should exactly only never always '.repeat(100) +
      '```code```'.repeat(20) +
      'why explain compare analyze reason evaluate '.repeat(50) +
      'json schema yaml frontmatter ' +
      'word '.repeat(1000);
    const score = scoreComplexity(longPrompt);
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ---- extractConfidence ----

describe('extractConfidence', () => {
  test('null input returns null', () => {
    expect(extractConfidence(null)).toBeNull();
  });

  test('empty array returns null', () => {
    expect(extractConfidence([])).toBeNull();
  });

  test('valid logprobs returns a value in [0, 1]', () => {
    const logprobs = [
      { token: 'a', logprob: -0.5 },
      { token: 'b', logprob: -0.3 }
    ];
    const conf = extractConfidence(logprobs);
    expect(conf).toBeGreaterThanOrEqual(0);
    expect(conf).toBeLessThanOrEqual(1);
  });

  test('high logprobs (near 0) return confidence near 1', () => {
    const logprobs = [
      { token: 'a', logprob: -0.01 },
      { token: 'b', logprob: -0.01 }
    ];
    const conf = extractConfidence(logprobs);
    expect(conf).toBeGreaterThan(0.95);
  });
});

// ---- route ----

describe('route', () => {
  beforeEach(() => {
    runShadow.mockClear();
  });

  const baseConfig = {
    routing_strategy: 'local_first',
    advanced: { confidence_threshold: 0.9 }
  };

  const highConfResult = { content: '{"ok":true}', logprobsData: [{ token: 'a', logprob: -0.01 }] };
  const lowConfResult = { content: '{"ok":true}', logprobsData: [{ token: 'a', logprob: -5.0 }] };

  describe('local_first strategy', () => {
    test('high complexity prompt returns null (fallback)', async () => {
      const longPrompt = 'word '.repeat(600) + 'must should exactly only never always ' +
        'why explain compare analyze ' + '```code```'.repeat(5);
      const callLocal = jest.fn();
      const result = await route(baseConfig, longPrompt, 'test', callLocal);
      expect(result).toBeNull();
      expect(callLocal).not.toHaveBeenCalled();
    });

    test('low complexity + high confidence returns local result', async () => {
      const callLocal = jest.fn().mockResolvedValue(highConfResult);
      const result = await route(baseConfig, 'short prompt', 'test', callLocal);
      expect(result).toEqual(highConfResult);
    });

    test('low complexity + low confidence returns null', async () => {
      const callLocal = jest.fn().mockResolvedValue(lowConfResult);
      const result = await route(baseConfig, 'short prompt', 'test', callLocal);
      expect(result).toBeNull();
    });
  });

  describe('quality_first strategy', () => {
    const qfConfig = { ...baseConfig, routing_strategy: 'quality_first' };

    test('score >= 0.3 returns null', async () => {
      const prompt = 'must should exactly only never always why explain compare analyze json schema ' +
        '```code```'.repeat(3);
      const callLocal = jest.fn();
      const result = await route(qfConfig, prompt, 'test', callLocal);
      expect(result).toBeNull();
    });

    test('score < 0.3 returns local result', async () => {
      const callLocal = jest.fn().mockResolvedValue({ content: '{"x":1}', logprobsData: null });
      const result = await route(qfConfig, 'hi', 'test', callLocal);
      expect(result).toEqual({ content: '{"x":1}', logprobsData: null });
    });
  });

  describe('balanced strategy', () => {
    const balConfig = { ...baseConfig, routing_strategy: 'balanced' };

    test('score > 0.45 returns null', async () => {
      const prompt = 'word '.repeat(400) + 'must should exactly only never always ' +
        'why explain compare analyze ' + '```code```'.repeat(4) + ' json schema';
      const callLocal = jest.fn();
      const result = await route(balConfig, prompt, 'test', callLocal);
      expect(result).toBeNull();
    });

    test('low score + confidence >= 0.75 returns result', async () => {
      // logprob of -0.2 gives exp(-0.2) ~ 0.82 > 0.75
      const goodResult = { content: '{"ok":true}', logprobsData: [{ token: 'a', logprob: -0.2 }] };
      const callLocal = jest.fn().mockResolvedValue(goodResult);
      const result = await route(balConfig, 'short', 'test', callLocal);
      expect(result).toEqual(goodResult);
    });
  });

  test('errors in callLocalFn return null (never throws)', async () => {
    const callLocal = jest.fn().mockRejectedValue(new Error('boom'));
    const result = await route(baseConfig, 'short', 'test', callLocal);
    expect(result).toBeNull();
  });

  test('runShadow is called when planningDir and frontierResultFn are provided', async () => {
    const callLocal = jest.fn().mockResolvedValue(highConfResult);
    const frontierFn = jest.fn();
    await route(baseConfig, 'short', 'test-op', callLocal, '/tmp/.planning', frontierFn);
    expect(runShadow).toHaveBeenCalledWith(
      baseConfig,
      '/tmp/.planning',
      'test-op',
      frontierFn,
      highConfResult.content
    );
  });
});
