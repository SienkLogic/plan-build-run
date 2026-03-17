/* global fetch, AbortSignal */
'use strict';

const WARMUP_TIMEOUT_MS = 120000;

/**
 * Merges the raw local_llm config block with defaults.
 * @param {object|undefined} rawConfig
 * @returns {object} Fully-defaulted local_llm config
 */
function resolveConfig(rawConfig) {
  return {
    enabled: rawConfig != null && rawConfig.enabled != null ? rawConfig.enabled : false,
    provider: (rawConfig && rawConfig.provider) || 'ollama',
    endpoint: (rawConfig && rawConfig.endpoint) || 'http://localhost:11434',
    model: (rawConfig && rawConfig.model) || 'qwen2.5-coder:7b',
    timeout_ms: (rawConfig && rawConfig.timeout_ms) || 3000,
    max_retries: rawConfig != null && rawConfig.max_retries != null ? rawConfig.max_retries : 1,
    fallback: (rawConfig && rawConfig.fallback) || 'frontier',
    routing_strategy: (rawConfig && rawConfig.routing_strategy) || 'local_first',
    features: Object.assign(
      {
        artifact_classification: true,
        task_validation: true,
        plan_adequacy: false,
        gap_detection: false,
        context_summarization: false,
        source_scoring: false,
        commit_classification: true,
        test_triage: true,
        file_intent_classification: true
      },
      (rawConfig && rawConfig.features) || {}
    ),
    metrics: Object.assign(
      {
        enabled: true,
        log_file: '.planning/logs/local-llm-metrics.jsonl',
        show_session_summary: true,
        frontier_token_rate: 3.0
      },
      (rawConfig && rawConfig.metrics) || {}
    ),
    advanced: Object.assign(
      {
        confidence_threshold: 0.9,
        max_input_tokens: 2000,
        keep_alive: '30m',
        num_ctx: 4096,
        disable_after_failures: 3,
        shadow_mode: false
      },
      (rawConfig && rawConfig.advanced) || {}
    )
  };
}

/**
 * Checks availability of the configured Ollama instance and model.
 * Always resolves — never rejects.
 * @param {object} config - resolved config from resolveConfig()
 * @returns {Promise<object>} Structured health status
 */
async function checkHealth(config) {
  try {
    if (!config.enabled) {
      return { available: false, reason: 'disabled', model: null, version: null };
    }

    const timeoutShort = 3000;
    const timeoutModel = 5000;

    // Step 1 — Check server reachable
    try {
      const res = await fetch(config.endpoint + '/', {
        signal: AbortSignal.timeout(timeoutShort)
      });
      const body = await res.text().catch(() => '');
      if (!body.includes('Ollama')) {
        return {
          available: false,
          reason: 'not_running',
          detail: 'Ollama is not running. Start with: ollama serve',
          model: null,
          version: null
        };
      }
    } catch (err) {
      const isConnRefused =
        (err.cause && err.cause.code === 'ECONNREFUSED') ||
        (err.message && err.message.includes('ECONNREFUSED'));
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      if (isConnRefused || isTimeout) {
        return {
          available: false,
          reason: 'not_running',
          detail: 'Ollama is not running. Start with: ollama serve',
          model: null,
          version: null
        };
      }
      throw err;
    }

    // Step 2 — Check version (non-fatal)
    let version = null;
    try {
      const res = await fetch(config.endpoint + '/api/version', {
        signal: AbortSignal.timeout(timeoutShort)
      });
      const data = await res.json();
      version = data.version || null;
    } catch (_) {
      version = null;
    }

    // Step 3 — Check model available
    try {
      const res = await fetch(config.endpoint + '/v1/models', {
        signal: AbortSignal.timeout(timeoutModel)
      });
      const data = await res.json();
      const modelList = (data.data || []).map((m) => m.id || '');
      const baseModel = config.model.split(':')[0];
      const found = modelList.some((m) => m.startsWith(baseModel));
      if (!found) {
        return {
          available: false,
          reason: 'model_missing',
          detail: 'Run: ollama pull ' + config.model,
          model: null,
          version
        };
      }
    } catch (_err) {
      return {
        available: false,
        reason: 'model_missing',
        detail: 'Run: ollama pull ' + config.model,
        model: null,
        version
      };
    }

    // Step 4 — Detect GPU error (sleep/wake CUDA bug)
    let warm = false;
    try {
      const res = await fetch(config.endpoint + '/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: '{"status":"ok"}' }],
          max_tokens: 10,
          num_ctx: 512
        }),
        signal: AbortSignal.timeout(timeoutModel)
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        if (res.status === 500 && (errBody.includes('GPU') || errBody.includes('CUDA'))) {
          return {
            available: false,
            reason: 'gpu_error',
            detail: 'GPU error detected. Restart Ollama: ollama serve',
            model: config.model,
            version
          };
        }
        // Non-GPU HTTP error — treat as available but cold
        warm = false;
      } else {
        warm = true;
      }
    } catch (err) {
      const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
      if (isTimeout) {
        warm = false; // cold start in progress — skip, don't block
      } else {
        warm = false;
      }
    }

    return { available: true, warm, reason: 'ok', model: config.model, version };
  } catch (_err) {
    return {
      available: false,
      reason: 'unknown_error',
      detail: _err.message,
      model: null,
      version: null
    };
  }
}

/**
 * Fire-and-forget warm-up request. Callers should NOT await this.
 * @param {object} config - resolved config from resolveConfig()
 */
async function warmUp(config) {
  try {
    await fetch(config.endpoint + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: '{"status":"ready"}' }],
        max_tokens: 10,
        num_ctx: 512,
        keep_alive: config.advanced.keep_alive
      }),
      signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS)
    });
  } catch (_) {
    // Swallow all errors silently — fire and forget
  }
}

module.exports = { resolveConfig, checkHealth, warmUp };
