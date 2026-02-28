/* global fetch, AbortSignal, performance */
'use strict';

const {
  isDisabledPersistent,
  recordFailurePersistent,
  resetCircuitPersistent
} = require('../lib/circuit-state');

// Circuit breaker: Map<operationType, { failures: number, disabled: boolean }>
const circuitState = new Map();

/**
 * Attempts to parse JSON from text that may be raw JSON or wrapped in a markdown code block.
 * @param {string} text
 * @returns {{ ok: true, data: any } | { ok: false, raw: string }}
 */
function tryParseJSON(text) {
  // Attempt 1: direct parse
  try {
    const data = JSON.parse(text);
    return { ok: true, data };
  } catch (_) {
    // fall through
  }

  // Attempt 2: extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const data = JSON.parse(codeBlockMatch[1].trim());
      return { ok: true, data };
    } catch (_) {
      // fall through
    }
  }

  // Attempt 3: find first {...}
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const data = JSON.parse(objectMatch[0]);
      return { ok: true, data };
    } catch (_) {
      // fall through
    }
  }

  return { ok: false, raw: text };
}

/**
 * Maps an error to one of 5 canonical types.
 * @param {Error} err
 * @returns {{ type: string, message: string }}
 */
function categorizeError(err) {
  if (
    (err.cause && err.cause.code === 'ECONNREFUSED') ||
    (err.message && err.message.includes('ECONNREFUSED'))
  ) {
    return { type: 'ECONNREFUSED', message: err.message };
  }
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return { type: 'timeout', message: err.message };
  }
  if (err.message && err.message.startsWith('HTTP ')) {
    return { type: 'http_error', message: err.message };
  }
  if (err instanceof SyntaxError) {
    return { type: 'json_parse', message: err.message };
  }
  return { type: 'wrong_answer', message: err.message };
}

/**
 * Returns true if the circuit is open (operation should be skipped).
 * @param {string} operationType
 * @param {number} maxFailures
 * @returns {boolean}
 */
function isDisabled(operationType, maxFailures) {
  const entry = circuitState.get(operationType);
  if (!entry) return false;
  return entry.disabled || entry.failures >= maxFailures;
}

/**
 * Records a failure for an operation type. Disables the circuit if maxFailures is reached.
 * @param {string} operationType
 * @param {number} maxFailures
 */
function recordFailure(operationType, maxFailures) {
  const entry = circuitState.get(operationType) || { failures: 0, disabled: false };
  entry.failures += 1;
  if (entry.failures >= maxFailures) {
    entry.disabled = true;
  }
  circuitState.set(operationType, entry);
}

/**
 * Resets the circuit breaker for an operation type.
 * @param {string} operationType
 */
function resetCircuit(operationType) {
  circuitState.delete(operationType);
}

/**
 * Sends a chat completion request to a local LLM endpoint with retry and circuit-breaker logic.
 *
 * @param {object} config - local_llm config block (resolved)
 * @param {string} prompt - user message to send
 * @param {string} operationType - operation identifier for circuit breaker tracking
 * @param {object} [options={}] - optional parameters
 * @param {boolean} [options.logprobs] - if true, request logprobs from the API
 * @param {string} [options.planningDir] - optional .planning directory for persistent circuit breaker state
 * @returns {Promise<{ content: string, latency_ms: number, tokens: number, logprobsData: Array<{token: string, logprob: number}>|null }>}
 */
async function complete(config, prompt, operationType, options = {}) {
  const endpoint = config.endpoint || 'http://localhost:11434';
  const model = config.model || 'qwen2.5-coder:7b';
  const timeoutMs = config.timeout_ms || 3000;
  const maxRetries = config.max_retries != null ? config.max_retries : 1;
  const numCtx = (config.advanced && config.advanced.num_ctx) || 4096;
  const keepAlive = (config.advanced && config.advanced.keep_alive) || '30m';
  const maxFailures = (config.advanced && config.advanced.disable_after_failures) || 3;
  const planningDir = options.planningDir || null;

  // Check in-memory circuit first (fast path), then persistent state
  if (isDisabled(operationType, maxFailures)) {
    const err = new Error('Circuit open for operation: ' + operationType);
    err.type = 'circuit_open';
    throw err;
  }
  if (planningDir && isDisabledPersistent(planningDir, operationType, maxFailures)) {
    const err = new Error('Circuit open for operation: ' + operationType);
    err.type = 'circuit_open';
    throw err;
  }

  const bodyObj = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a precise classification assistant. Always respond with valid JSON only. No explanations outside the JSON.'
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 200,
    keep_alive: keepAlive,
    num_ctx: numCtx
  };
  if (options.logprobs === true) {
    bodyObj.logprobs = true;
    bodyObj.top_logprobs = 3;
  }
  const body = JSON.stringify(bodyObj);

  const url = endpoint + '/v1/chat/completions';
  const totalAttempts = maxRetries + 1;

  let lastErr;
  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const start = performance.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error('HTTP ' + res.status + ': ' + errText);
      }

      const json = await res.json();
      const content = json.choices[0].message.content;
      const completionTokens = (json.usage && json.usage.completion_tokens) || 0;
      const latency_ms = performance.now() - start;
      const logprobsData = (options.logprobs && json.choices[0].logprobs)
        ? json.choices[0].logprobs.content
        : null;

      return { content, latency_ms, tokens: completionTokens, logprobsData };
    } catch (err) {
      lastErr = err;
      const isConnRefused =
        (err.cause && err.cause.code === 'ECONNREFUSED') ||
        (err.message && err.message.includes('ECONNREFUSED'));

      if (isConnRefused) {
        // Server not running — no point retrying
        recordFailure(operationType, maxFailures);
        if (planningDir) recordFailurePersistent(planningDir, operationType, maxFailures);
        throw err;
      }

      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      const isHttpError = err.message && err.message.startsWith('HTTP ');

      if ((isTimeout || isHttpError) && attempt < totalAttempts - 1) {
        // Retry
        continue;
      }

      // Final attempt or non-retryable error
      recordFailure(operationType, maxFailures);
      if (planningDir) recordFailurePersistent(planningDir, operationType, maxFailures);
      throw err;
    }
  }

  // Should not reach here, but guard anyway
  recordFailure(operationType, maxFailures);
  if (planningDir) recordFailurePersistent(planningDir, operationType, maxFailures);
  throw lastErr;
}

module.exports = {
  tryParseJSON,
  categorizeError,
  isDisabled,
  recordFailure,
  resetCircuit,
  complete,
  isDisabledPersistent,
  recordFailurePersistent,
  resetCircuitPersistent
};
