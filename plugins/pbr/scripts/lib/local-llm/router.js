'use strict';

const { runShadow } = require('./shadow');

const COMPLEXITY_HIGH_THRESHOLD = 0.65;

/**
 * Scores the complexity of a prompt using a weighted surface heuristic.
 * Returns a value in [0, 1] where higher means more complex.
 *
 * @param {string} prompt
 * @returns {number}
 */
function scoreComplexity(prompt) {
  const words = prompt.split(/\s+/).length;
  const codeBlocks = (prompt.match(/```/g) || []).length / 2;
  const constraints = (prompt.match(/\b(must|should|exactly|only|never|always)\b/gi) || []).length;
  const reasoning = (prompt.match(/\b(why|explain|compare|analyze|reason|evaluate)\b/gi) || []).length;
  const structuredOut = /\b(json|schema|yaml|frontmatter)\b/i.test(prompt) ? 1 : 0;
  return Math.min(words / 500, 1.0) * 0.25 +
         Math.min(codeBlocks / 3, 1.0) * 0.20 +
         Math.min(constraints / 5, 1.0) * 0.20 +
         Math.min(reasoning / 3, 1.0) * 0.20 +
         structuredOut * 0.15;
}

/**
 * Extracts a confidence score from logprobs data returned by the local LLM.
 * Returns a value in [0, 1] or null if no logprobs data is available.
 *
 * @param {Array<{token: string, logprob: number}>|null|undefined} logprobsData
 * @returns {number|null}
 */
function extractConfidence(logprobsData) {
  if (!logprobsData || logprobsData.length === 0) return null;
  const sum = logprobsData.reduce((acc, t) => acc + t.logprob, 0);
  const avgLogprob = sum / logprobsData.length;
  return Math.min(1, Math.max(0, Math.exp(avgLogprob)));
}

/**
 * Routes a prompt through local LLM or signals caller to use frontier model.
 * Returns the local LLM result if local is suitable, or null if caller should
 * fall back to frontier. Never throws — all errors return null.
 *
 * @param {object} config - local_llm config block with routing_strategy and advanced settings
 * @param {string} prompt - the prompt being routed
 * @param {string} operationType - operation identifier
 * @param {function(boolean): Promise<{content: string, logprobsData: Array|null}>} callLocalFn
 *   Async function accepting a logprobs boolean, returns the local LLM result object.
 * @param {string} [planningDir] - path to .planning directory; when provided enables shadow mode
 * @param {Function} [frontierResultFn] - async function that calls the frontier model;
 *   NOTE: parameter inversion vs shadow.js — here LOCAL has already run (it's the primary result)
 *   and FRONTIER is the shadow. We pass frontierResultFn as shadow.js arg 4 (localResultFn slot)
 *   so shadow.js calls it, and result.content as arg 5 (frontierResult slot, the committed result).
 * @returns {Promise<{content: string, logprobsData: Array|null}|null>}
 */
async function route(config, prompt, operationType, callLocalFn, planningDir, frontierResultFn) {
  try {
    const routingStrategy = (config && config.routing_strategy) || 'local_first';
    const confidenceThreshold = (config && config.advanced && config.advanced.confidence_threshold) || 0.9;

    if (routingStrategy === 'quality_first') {
      const score = scoreComplexity(prompt);
      if (score >= 0.3) return null;
      const result = await callLocalFn(false);
      if (result !== null && planningDir && frontierResultFn) {
        runShadow(config, planningDir, operationType, frontierResultFn, result.content);
      }
      return result;
    }

    if (routingStrategy === 'balanced') {
      const score = scoreComplexity(prompt);
      if (score > 0.45) return null;
      const result = await callLocalFn(true);
      const confidence = extractConfidence(result && result.logprobsData);
      if (confidence === null || confidence < 0.75) return null;
      if (result !== null && planningDir && frontierResultFn) {
        runShadow(config, planningDir, operationType, frontierResultFn, result.content);
      }
      return result;
    }

    // Default: local_first
    const score = scoreComplexity(prompt);
    if (score > COMPLEXITY_HIGH_THRESHOLD) return null;
    const result = await callLocalFn(true);
    const confidence = extractConfidence(result && result.logprobsData);
    if (confidence === null || confidence < confidenceThreshold) return null;
    if (result !== null && planningDir && frontierResultFn) {
      runShadow(config, planningDir, operationType, frontierResultFn, result.content);
    }
    return result;
  } catch (_) {
    return null;
  }
}

module.exports = { route, scoreComplexity, extractConfidence };
module.exports.COMPLEXITY_HIGH_THRESHOLD = COMPLEXITY_HIGH_THRESHOLD;
