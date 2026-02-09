#!/usr/bin/env node
/* global fetch, AbortSignal */

/**
 * Local LLM utility module.
 *
 * Provides a thin wrapper around OpenAI-compatible local LLM APIs
 * (Ollama, LM Studio, etc.) for use by Towline hooks and scripts.
 *
 * Config (in .planning/config.json under "local_llm"):
 *   enabled: false          — master toggle
 *   provider: "ollama"      — for logging only
 *   endpoint: "http://127.0.0.1:11434"
 *   model: "qwen2.5-coder:7b"
 *   timeout_ms: 5000
 *   fallback: "skip"        — "skip" returns empty, "error" throws
 *
 * No npm dependencies — uses Node.js native fetch() (Node 18+).
 */

const fs = require('fs');
const path = require('path');

let _configCache = null;
let _availableCache = null;
let _availableCacheTime = 0;
const AVAILABLE_CACHE_TTL = 60000; // 60s

function loadConfig() {
  if (_configCache) return _configCache;
  try {
    const configPath = path.join(process.cwd(), '.planning', 'config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    _configCache = config.local_llm || {};
  } catch (_e) {
    _configCache = {};
  }
  return _configCache;
}

function getEndpoint(cfg) {
  const base = (cfg.endpoint || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  return `${base}/v1/chat/completions`;
}

/**
 * Check if local LLM is configured and reachable.
 * Caches result for 60 seconds.
 */
async function isAvailable() {
  const cfg = loadConfig();
  if (!cfg.enabled) return false;

  const now = Date.now();
  if (_availableCache !== null && (now - _availableCacheTime) < AVAILABLE_CACHE_TTL) {
    return _availableCache;
  }

  try {
    const base = (cfg.endpoint || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const resp = await fetch(`${base}/v1/models`, {
      signal: AbortSignal.timeout(2000)
    });
    _availableCache = resp.ok;
  } catch (_e) {
    _availableCache = false;
  }
  _availableCacheTime = now;
  return _availableCache;
}

/**
 * Send a chat completion request to the local LLM.
 * @param {string} system - System prompt
 * @param {string} user - User message
 * @param {object} [opts] - Optional overrides: model, temperature, max_tokens
 * @returns {{ ok: boolean, result: string|null, error: string|null }}
 */
async function query(system, user, opts = {}) {
  const cfg = loadConfig();
  if (!cfg.enabled) {
    return handleFallback(cfg, 'Local LLM not enabled');
  }

  const body = {
    model: opts.model || cfg.model || 'qwen2.5-coder:7b',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: opts.temperature ?? 0.3,
    stream: false
  };
  if (opts.max_tokens) body.max_tokens = opts.max_tokens;

  try {
    const resp = await fetch(getEndpoint(cfg), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeout_ms || 5000)
    });

    if (!resp.ok) {
      return handleFallback(cfg, `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || null;
    return { ok: true, result: content, error: null };
  } catch (err) {
    return handleFallback(cfg, err.message);
  }
}

/**
 * Classify text into one of N categories.
 * @param {string} text - Text to classify
 * @param {string[]} categories - List of category names
 * @returns {{ ok: boolean, result: string|null, error: string|null }}
 */
async function classify(text, categories) {
  const system = `Classify the following text into exactly one of these categories: ${categories.join(', ')}. Respond with only the category name, nothing else.`;
  return query(system, text, { temperature: 0, max_tokens: 50 });
}

/**
 * Summarize text.
 * @param {string} text - Text to summarize
 * @param {number} [maxTokens=200] - Max tokens for summary
 * @returns {{ ok: boolean, result: string|null, error: string|null }}
 */
async function summarize(text, maxTokens = 200) {
  const system = 'Summarize the following text concisely. Focus on key points.';
  return query(system, text, { temperature: 0.2, max_tokens: maxTokens });
}

function handleFallback(cfg, errorMsg) {
  if (cfg.fallback === 'error') {
    throw new Error(`Local LLM error: ${errorMsg}`);
  }
  // Default: "skip" — return empty result
  return { ok: false, result: null, error: errorMsg };
}

module.exports = { isAvailable, query, classify, summarize };
