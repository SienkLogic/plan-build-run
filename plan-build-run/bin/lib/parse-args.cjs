/**
 * parse-args.cjs — CLI argument parsing and validation for PBR skills.
 *
 * Provides structured validation of user input before skills process it,
 * replacing fragile prose-based guards with deterministic CLI checks.
 */

'use strict';

/**
 * Parse and validate arguments for /pbr:plan
 *
 * Valid patterns:
 *   ""              → empty, skill will prompt
 *   "3" or "03"     → bare phase number
 *   "3 --gaps"      → phase number with flags
 *   "3 --gaps --auto" → phase number with multiple flags
 *
 * Invalid:
 *   "write me a function" → freeform text
 *   "3 4 5"               → multiple numbers
 *   "auth-module"         → non-numeric non-flag token
 */
function parsePlan(rawInput) {
  const raw = (rawInput || '').trim();

  // Empty input is valid — skill will prompt for phase number
  if (!raw) {
    return { valid: true, phase: null, flags: {}, raw: '' };
  }

  const tokens = raw.split(/\s+/);
  const flags = { gaps: false, auto: false };
  const knownFlags = new Set(['--gaps', '--auto']);
  let phase = null;
  const nonFlagTokens = [];

  for (const token of tokens) {
    if (token.startsWith('--')) {
      if (knownFlags.has(token)) {
        flags[token.slice(2)] = true;
      } else {
        return {
          valid: false,
          phase: null,
          flags: {},
          error: `Unknown flag: '${token}'. Expected: /pbr:plan <phase-number> [--gaps] [--auto]`,
          raw
        };
      }
    } else {
      nonFlagTokens.push(token);
    }
  }

  // Must have exactly 0 or 1 non-flag tokens
  if (nonFlagTokens.length > 1) {
    return {
      valid: false,
      phase: null,
      flags: {},
      error: `Invalid argument: '${raw}'. Expected: /pbr:plan <phase-number> [--gaps] [--auto]`,
      raw
    };
  }

  if (nonFlagTokens.length === 1) {
    const candidate = nonFlagTokens[0];
    // Must be a number (with optional leading zeros)
    if (/^\d+$/.test(candidate)) {
      phase = parseInt(candidate, 10);
    } else {
      return {
        valid: false,
        phase: null,
        flags: {},
        error: `Invalid argument: '${candidate}'. Expected: /pbr:plan <phase-number> [--gaps] [--auto]`,
        raw
      };
    }
  }

  // Flags without a phase number are invalid (e.g. "--gaps" alone)
  if (phase === null && (flags.gaps || flags.auto)) {
    return {
      valid: false,
      phase: null,
      flags: {},
      error: `Flags require a phase number. Expected: /pbr:plan <phase-number> [--gaps] [--auto]`,
      raw
    };
  }

  return { valid: true, phase, flags, raw };
}

/**
 * Parse and validate arguments for /pbr:quick
 *
 * Quick accepts freeform text as a task description. Always valid unless empty.
 */
function parseQuick(rawInput) {
  const raw = (rawInput || '').trim();

  if (!raw) {
    return {
      valid: false,
      description: null,
      error: 'Description required for /pbr:quick',
      raw: ''
    };
  }

  return { valid: true, description: raw, raw };
}

/**
 * Dispatch parse-args by type
 */
function parseArgs(type, rawInput) {
  switch (type) {
    case 'plan':
      return parsePlan(rawInput);
    case 'quick':
      return parseQuick(rawInput);
    default:
      return {
        valid: false,
        error: `Unknown parse-args type: '${type}'. Supported: plan, quick`
      };
  }
}

module.exports = { parseArgs, parsePlan, parseQuick };
