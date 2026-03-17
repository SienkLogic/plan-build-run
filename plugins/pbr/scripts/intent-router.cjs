/**
 * Intent router — classifies freeform text into PBR skill routes with confidence scoring.
 *
 * Pure function: no side effects, no file I/O. Consumable by /pbr:do and prompt-routing hook.
 */

'use strict';

const ROUTE_MAP = {
  debug: {
    keywords: ['bug', 'error', 'crash', 'fix', 'broken', 'failing', 'exception', 'stacktrace', 'debug'],
    weight: 1.0
  },
  explore: {
    keywords: ['explore', 'research', 'investigate', 'how does', 'how do', 'how the', 'understand', 'analyze', 'compare', 'works'],
    weight: 1.0
  },
  'plan-phase': {
    keywords: ['plan', 'architect', 'design', 'migrate', 'refactor across', 'refactor', 'redesign', 'system', 'new'],
    weight: 0.9
  },
  quick: {
    keywords: ['add', 'create', 'update', 'change', 'rename', 'remove', 'write test', 'implement', 'button', 'feature', 'refactor'],
    weight: 0.85
  },
  note: {
    keywords: ['remember', 'note', 'todo', 'idea', 'later', "don't forget", 'remind'],
    weight: 1.0
  },
  'verify-work': {
    keywords: ['review', 'check', 'verify', 'quality', 'looks right'],
    weight: 0.9
  }
};

/**
 * Score a single route against input text.
 * Returns a value between 0 and 1 based on keyword match density and weight.
 * @param {string} text - Lowercase normalized input
 * @param {{ keywords: string[], weight: number }} routeConfig
 * @returns {number} Score in 0-1 range
 */
function scoreRoute(text, routeConfig) {
  let matches = 0;
  for (const keyword of routeConfig.keywords) {
    if (text.includes(keyword)) {
      matches++;
    }
  }
  if (matches === 0) return 0;

  // Confidence based on match count:
  // 1 match = 0.5, 2 matches = 0.75, 3+ matches = 0.95+
  // Uses diminishing returns: 0.5 + 0.25 * (1 - 1/(matches+1))
  const baseConfidence = 0.5 + 0.5 * (1 - 1 / (matches + 1));

  return baseConfidence * routeConfig.weight;
}

/**
 * Classify freeform text into a PBR skill route with confidence scoring.
 *
 * @param {string} text - User's natural language input
 * @param {object} [context={}] - Optional context signals
 * @param {string} [context.recentError] - Recent error message (boosts debug)
 * @param {boolean} [context.activePhase] - Whether a phase is active (boosts plan-phase)
 * @param {boolean} [context.hasRoadmap] - Whether a roadmap exists (demotes plan-phase if false)
 * @returns {{ route: string, confidence: number, candidates: Array<{ route: string, confidence: number }> }}
 */
function classifyIntent(text, context) {
  if (context === undefined) context = {};
  const normalized = text.toLowerCase();

  // Score each route
  const scores = {};
  for (const [route, config] of Object.entries(ROUTE_MAP)) {
    scores[route] = scoreRoute(normalized, config);
  }

  // Apply context boosters
  if (context.recentError) {
    scores.debug = (scores.debug || 0) + 0.3;
  }
  if (context.activePhase) {
    scores['plan-phase'] = (scores['plan-phase'] || 0) + 0.1;
  }
  if (context.hasRoadmap === false) {
    scores['plan-phase'] = (scores['plan-phase'] || 0) - 0.2;
  }

  // Clamp all scores to 0-1
  for (const route of Object.keys(scores)) {
    scores[route] = Math.max(0, Math.min(1, scores[route]));
  }

  // Sort by score descending
  const sorted = Object.entries(scores)
    .map(([route, confidence]) => ({ route, confidence }))
    .sort((a, b) => b.confidence - a.confidence);

  // No matches at all
  if (sorted.length === 0 || sorted[0].confidence === 0) {
    return {
      route: 'quick',
      confidence: 0.3,
      candidates: [{ route: 'quick', confidence: 0.3 }],
      auditEntry: {
        timestamp: new Date().toISOString(),
        input: text.substring(0, 100),
        route: 'quick',
        confidence: 0.3,
        risk: null
      }
    };
  }

  const top = sorted[0];

  // Build audit entry for logging by callers
  const auditEntry = {
    timestamp: new Date().toISOString(),
    input: text.substring(0, 100),
    route: top.route,
    confidence: top.confidence,
    risk: null  // populated by caller when risk-classifier is used
  };

  if (top.confidence >= 0.7) {
    return {
      route: top.route,
      confidence: top.confidence,
      candidates: [top],
      auditEntry
    };
  }

  // Ambiguous — return top 3 candidates with non-zero confidence
  const topThree = sorted.slice(0, 3).filter(c => c.confidence > 0);
  return {
    route: top.route,
    confidence: top.confidence,
    candidates: topThree,
    auditEntry
  };
}

module.exports = { classifyIntent, ROUTE_MAP };
