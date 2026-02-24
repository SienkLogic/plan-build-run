import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Read and aggregate local LLM metrics from .planning/logs/local-llm-metrics.jsonl.
 *
 * @param {string} projectDir - Absolute path to the project root
 * @returns {Promise<{summary: object, byOperation: Array, baseline: object}|null>}
 *   Returns null if the file does not exist, is empty, or has no valid entries.
 */
export async function getLlmMetrics(projectDir) {
  try {
    const filePath = join(projectDir, '.planning', 'logs', 'local-llm-metrics.jsonl');

    let raw;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }

    // Parse valid JSON lines, skip malformed
    const entries = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {
        // skip malformed lines
      }
    }

    if (entries.length === 0) return null;

    // Compute aggregate summary
    const total_calls = entries.length;
    const fallback_count = entries.filter(e => e.fallback_used === true).length;
    const fallback_rate_pct = Math.round(fallback_count / total_calls * 100);
    const avg_latency_ms = Math.round(
      entries.reduce((sum, e) => sum + (e.latency_ms || 0), 0) / total_calls
    );
    const tokens_saved = entries.reduce((sum, e) => sum + (e.tokens_saved_frontier || 0), 0);
    const cost_saved_usd = parseFloat((tokens_saved * (3.0 / 1_000_000)).toFixed(4));

    const summary = {
      total_calls,
      fallback_count,
      fallback_rate_pct,
      avg_latency_ms,
      tokens_saved,
      cost_saved_usd
    };

    // Compute byOperation: group entries by operation field
    const opMap = new Map();
    for (const e of entries) {
      const op = e.operation || 'unknown';
      if (!opMap.has(op)) {
        opMap.set(op, { operation: op, calls: 0, fallbacks: 0, tokens_saved: 0 });
      }
      const rec = opMap.get(op);
      rec.calls += 1;
      if (e.fallback_used === true) rec.fallbacks += 1;
      rec.tokens_saved += e.tokens_saved_frontier || 0;
    }

    const byOperation = Array.from(opMap.values()).sort((a, b) => b.calls - a.calls);

    // Compute baseline (LLM-15)
    const baseline = {
      hook_invocations: total_calls,
      estimated_frontier_tokens_without_local: tokens_saved
    };

    return { summary, byOperation, baseline };
  } catch {
    return null;
  }
}
