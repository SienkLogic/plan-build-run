'use strict';

const { complete, tryParseJSON, isDisabled } = require('../client');
const { logMetric } = require('../metrics');

/**
 * Validates a Task() call for coherence using the local LLM.
 *
 * @param {object} config - resolved local_llm config block
 * @param {string} planningDir - path to the .planning directory
 * @param {{ description: string, subagent_type: string }} taskInput - the Task() call to validate
 * @param {string} [sessionId] - optional session identifier for metrics
 * @returns {Promise<{ coherent: boolean, confidence: number, issue: string|null, latency_ms: number, fallback_used: boolean }|null>}
 */
async function validateTask(config, planningDir, taskInput, sessionId) {
  if (!config.enabled || !config.features.task_validation) return null;
  if (isDisabled('task-validation', config.advanced.disable_after_failures)) return null;

  const prompt =
    'Assess this Task() call for coherence. Check: (1) description is meaningful and not empty, (2) if subagent_type starts with \'pbr:\' the agent name is valid, (3) description matches the intended operation. Known pbr agents: researcher, planner, plan-checker, executor, verifier, integration-checker, debugger, codebase-mapper, synthesizer, general. Respond with JSON: {"coherent": true|false, "confidence": 0.0-1.0, "issue": "null or one sentence describing the problem"}\n\nTask input: ' +
    JSON.stringify({ description: taskInput.description, subagent_type: taskInput.subagent_type });

  try {
    const result = await complete(config, prompt, 'task-validation');
    const parsed = tryParseJSON(result.content);
    if (!parsed.ok) return null;
    if (typeof parsed.data.coherent !== 'boolean') return null;

    const metricEntry = {
      session_id: sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      operation: 'task-validation',
      model: config.model,
      latency_ms: result.latency_ms,
      tokens_used_local: result.tokens,
      tokens_saved_frontier: 180,
      result: parsed.data.coherent ? 'coherent' : 'incoherent',
      fallback_used: false,
      confidence: parsed.data.confidence || 0.9
    };
    logMetric(planningDir, metricEntry);

    return {
      coherent: parsed.data.coherent,
      confidence: parsed.data.confidence || 0.9,
      issue: parsed.data.issue || null,
      latency_ms: result.latency_ms,
      fallback_used: false
    };
  } catch (_) {
    return null;
  }
}

module.exports = { validateTask };
