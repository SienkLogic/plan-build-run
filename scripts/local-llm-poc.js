#!/usr/bin/env node

/**
 * local-llm-poc.js — Proof of Concept for PBR Local LLM Offload
 *
 * Tests whether a local LLM (via Ollama) can reliably handle
 * the specific classification/validation tasks PBR hooks need.
 *
 * Prerequisites:
 *   1. Install Ollama: https://ollama.com/download
 *   2. Pull a model:   ollama pull qwen2.5-coder:7b
 *   3. Run this:        node scripts/local-llm-poc.js [model]
 *
 * Default model: qwen2.5-coder:7b (best JSON compliance)
 * Also try:      mistral:7b, phi4-mini
 *
 * Zero npm dependencies — uses Node 18+ native fetch.
 */

const ENDPOINT = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen2.5-coder:7b';
const TIMEOUT_MS = 30000;
const WARMUP_TIMEOUT_MS = 120000; // 2 min for first-time model load into VRAM

// ─── Test Data ─────────────────────────────────────────────

const TESTS = [
  {
    name: 'PLAN.md Classification',
    description: 'Can it tell a stub plan from a real one?',
    prompt: `Classify this PLAN.md content as one of: "stub", "partial", or "complete".

A "stub" has no real tasks or just placeholder text.
A "partial" has some tasks but is missing key elements (verify steps, done criteria).
A "complete" has well-defined tasks with action, verify, and done elements.

PLAN.md content:
---
plan: "01-01"
title: "Set up project structure"
wave: 1
---

<task id="1" complexity="low">
  <name>Create directory structure</name>
  <action>Create src/, tests/, and docs/ directories with index files</action>
  <files>src/index.js, tests/index.test.js, docs/README.md</files>
  <verify>ls -la src/ tests/ docs/ && test -f src/index.js</verify>
  <done>All three directories exist with their index files</done>
</task>

<task id="2" complexity="medium">
  <name>Configure package.json</name>
  <action>Initialize npm project with test script and ESLint config</action>
  <files>package.json, .eslintrc.json</files>
  <verify>npm test -- --passWithNoTests && npx eslint --print-config .</verify>
  <done>npm test runs successfully and eslint config is valid</done>
</task>

Respond with ONLY this JSON:
{"classification": "stub|partial|complete", "confidence": 0.0, "reason": "brief explanation"}`,
    expected_field: 'classification',
    expected_value: 'complete',
    expected_enum: ['stub', 'partial', 'complete']
  },

  {
    name: 'Stub PLAN Detection',
    description: 'Can it detect a plan that is clearly a stub?',
    prompt: `Classify this PLAN.md content as one of: "stub", "partial", or "complete".

A "stub" has no real tasks or just placeholder text.
A "partial" has some tasks but is missing key elements.
A "complete" has well-defined tasks with action, verify, and done elements.

PLAN.md content:
---
plan: "02-01"
title: "TODO"
wave: 1
---

# Plan

TODO: Write tasks here.

Respond with ONLY this JSON:
{"classification": "stub|partial|complete", "confidence": 0.0, "reason": "brief explanation"}`,
    expected_field: 'classification',
    expected_value: 'stub',
    expected_enum: ['stub', 'partial', 'complete']
  },

  {
    name: 'SUMMARY.md Substantiveness',
    description: 'Can it tell a real summary from a placeholder?',
    prompt: `Is this SUMMARY.md substantive (contains real build results) or a stub (placeholder/empty)?

SUMMARY.md content:
---
plan: "01-01"
status: complete
commits: ["abc1234", "def5678"]
---

## Task Results

| Task | Status | Notes |
|------|--------|-------|
| T1: Create directory structure | done | Created src/, tests/, docs/ with index files |
| T2: Configure package.json | done | Added jest, eslint, scripts section |

## Deviations

None.

## Files Changed

- src/index.js (new)
- tests/index.test.js (new)
- package.json (new)
- .eslintrc.json (new)

Respond with ONLY this JSON:
{"is_substantive": true, "confidence": 0.0, "reason": "brief explanation"}`,
    expected_field: 'is_substantive',
    expected_value: true,
    expected_enum: [true, false]
  },

  {
    name: 'Error Type Classification',
    description: 'Can it classify error messages into categories?',
    prompt: `Classify this error message into exactly one category: "syntax", "runtime", "network", "auth", "dependency", or "unknown".

Error message:
Error: Cannot find module 'express'
Require stack:
- /app/src/server.js
- /app/src/index.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1144:15)
    at Module._load (node:internal/modules/cjs/loader:985:27)

Respond with ONLY this JSON:
{"category": "syntax|runtime|network|auth|dependency|unknown", "confidence": 0.0, "reason": "brief explanation"}`,
    expected_field: 'category',
    expected_value: 'dependency',
    expected_enum: ['syntax', 'runtime', 'network', 'auth', 'dependency', 'unknown']
  },

  {
    name: 'Task XML Coherence',
    description: 'Can it detect when action/verify/done are misaligned?',
    prompt: `Check if this task's action, verify, and done elements are logically coherent.

"Coherent" means: the verify step actually tests what the action produces,
and the done criteria matches what verify confirms.

Task:
<task id="1">
  <name>Add user authentication</name>
  <action>Create auth middleware in src/middleware/auth.js using JWT tokens</action>
  <verify>curl http://localhost:3000/api/protected -H "Authorization: Bearer test" | grep "unauthorized"</verify>
  <done>npm run test:integration passes with 0 failures</done>
</task>

Is this coherent? The action creates JWT auth middleware, the verify tests the endpoint,
but the done criteria runs integration tests (which may test more than just auth).

Respond with ONLY this JSON:
{"coherent": true, "confidence": 0.0, "issues": ["list any issues or empty array"]}`,
    expected_field: 'coherent',
    expected_value: null, // Either true or false is defensible — we just check JSON validity
    expected_enum: [true, false]
  }
];

// ─── Utilities ─────────────────────────────────────────────

function color(code, text) {
  return `\x1b[${code}m${text}\x1b[0m`;
}
const green = (t) => color('32', t);
const red = (t) => color('31', t);
const yellow = (t) => color('33', t);
const cyan = (t) => color('36', t);
const dim = (t) => color('2', t);
const bold = (t) => color('1', t);

function tryParseJSON(text) {
  // Try direct parse first
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (_e) { /* continue */ }

  // Try extracting JSON from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return { ok: true, data: JSON.parse(codeBlockMatch[1].trim()) };
    } catch (_e) { /* continue */ }
  }

  // Try finding first { ... } in response
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return { ok: true, data: JSON.parse(braceMatch[0]) };
    } catch (_e) { /* continue */ }
  }

  return { ok: false, raw: text };
}

// ─── Ollama Client ─────────────────────────────────────────

async function checkHealth() {
  try {
    const res = await fetch(ENDPOINT + '/', {
      signal: AbortSignal.timeout(3000)
    });
    const text = await res.text();
    return text.includes('Ollama');
  } catch (_e) {
    return false;
  }
}

async function listModels() {
  try {
    const res = await fetch(ENDPOINT + '/v1/models', {
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json();
    return (data.data || []).map(m => m.id);
  } catch (_e) {
    return [];
  }
}

async function complete(model, prompt, timeoutMs = TIMEOUT_MS) {
  const start = performance.now();

  const res = await fetch(ENDPOINT + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a precise classification assistant. Always respond with valid JSON only. No explanations outside the JSON.'
        },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 200,
      keep_alive: '30m',
      // Critical for Windows performance — limit context window
      num_ctx: 4096
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const elapsed = performance.now() - start;
  const content = data.choices?.[0]?.message?.content || '';
  const tokens = data.usage?.completion_tokens || 0;

  return { content, elapsed, tokens };
}

// ─── Test Runner ───────────────────────────────────────────

async function runTest(model, test, index) {
  const label = `Test ${index + 1}/${TESTS.length}: ${test.name}`;
  process.stdout.write(`  ${cyan(label)} ... `);

  const result = {
    name: test.name,
    jsonParsed: false,
    correctAnswer: null,
    validEnum: false,
    latencyMs: 0,
    tokens: 0,
    error: null
  };

  try {
    const { content, elapsed, tokens } = await complete(model, test.prompt);
    result.latencyMs = Math.round(elapsed);
    result.tokens = tokens;

    const parsed = tryParseJSON(content);
    result.jsonParsed = parsed.ok;

    if (parsed.ok) {
      const value = parsed.data[test.expected_field];

      // Check if value is in expected enum
      result.validEnum = test.expected_enum.includes(value);

      // Check if answer matches expected (null = any valid answer is ok)
      if (test.expected_value === null) {
        result.correctAnswer = result.validEnum; // Any enum value is correct
      } else {
        result.correctAnswer = value === test.expected_value;
      }

      const status = result.correctAnswer ? green('PASS') : yellow('WRONG');
      const enumStatus = result.validEnum ? '' : red(' (invalid enum!)');
      console.log(
        `${status}${enumStatus}  ${dim(`${result.latencyMs}ms, ${result.tokens} tokens`)}` +
        `  → ${test.expected_field}: ${JSON.stringify(value)}`
      );

      if (!result.correctAnswer && test.expected_value !== null) {
        console.log(`    ${dim(`Expected: ${JSON.stringify(test.expected_value)}, Got: ${JSON.stringify(value)}`)}`);
      }
    } else {
      console.log(`${red('JSON FAIL')}  ${dim(`${result.latencyMs}ms`)}`);
      console.log(`    ${dim(`Raw: ${content.substring(0, 120)}...`)}`);
    }
  } catch (err) {
    result.error = err.message;
    console.log(`${red('ERROR')}  ${err.message}`);
  }

  return result;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  const model = process.argv[2] || DEFAULT_MODEL;

  console.log('');
  console.log(bold('═══════════════════════════════════════════════════'));
  console.log(bold('  PBR Local LLM Proof of Concept'));
  console.log(bold('═══════════════════════════════════════════════════'));
  console.log('');

  // Health check
  process.stdout.write(`  Checking Ollama at ${ENDPOINT} ... `);
  const healthy = await checkHealth();
  if (!healthy) {
    console.log(red('NOT FOUND'));
    console.log('');
    console.log('  Ollama is not running. To set up:');
    console.log('');
    console.log('    1. Install: https://ollama.com/download');
    console.log(`    2. Pull model: ${cyan(`ollama pull ${model}`)}`);
    console.log(`    3. Start: ${cyan('ollama serve')} (or it may auto-start)`);
    console.log(`    4. Re-run: ${cyan(`node scripts/local-llm-poc.js ${model}`)}`);
    console.log('');
    process.exit(1);
  }
  console.log(green('OK'));

  // Model check
  process.stdout.write(`  Checking model "${model}" ... `);
  const models = await listModels();
  const hasModel = models.some(m => m.startsWith(model.split(':')[0]));
  if (!hasModel) {
    console.log(red('NOT FOUND'));
    console.log('');
    console.log(`  Model "${model}" is not pulled. Run:`);
    console.log(`    ${cyan(`ollama pull ${model}`)}`);
    console.log('');
    console.log(`  Available models: ${models.length > 0 ? models.join(', ') : '(none)'}`);
    console.log('');
    process.exit(1);
  }
  console.log(green('OK'));

  // Warm-up call (first call loads model into VRAM)
  process.stdout.write('  Warming up model (first call loads into VRAM) ... ');
  const warmStart = performance.now();
  try {
    await complete(model, 'Respond with: {"status":"ready"}', WARMUP_TIMEOUT_MS);
    const warmMs = Math.round(performance.now() - warmStart);
    console.log(green('OK') + dim(` (${warmMs}ms — includes model load if cold)`));
  } catch (err) {
    console.log(red(`FAILED: ${err.message}`));
    process.exit(1);
  }

  // Run tests
  console.log('');
  console.log(bold('─── Running PBR Operation Tests ───────────────────'));
  console.log('');

  const results = [];
  for (let i = 0; i < TESTS.length; i++) {
    const result = await runTest(model, TESTS[i], i);
    results.push(result);
  }

  // Summary
  console.log('');
  console.log(bold('─── Results Summary ───────────────────────────────'));
  console.log('');

  const jsonOk = results.filter(r => r.jsonParsed).length;
  const correctOk = results.filter(r => r.correctAnswer).length;
  const enumOk = results.filter(r => r.validEnum).length;
  const errors = results.filter(r => r.error).length;
  const latencies = results.filter(r => r.latencyMs > 0).map(r => r.latencyMs);
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
  const totalTokens = results.reduce((a, r) => a + r.tokens, 0);

  const jsonColor = jsonOk === TESTS.length ? green : jsonOk >= TESTS.length - 1 ? yellow : red;
  const correctColor = correctOk >= 3 ? green : correctOk >= 2 ? yellow : red;
  const latencyColor = avgLatency < 3000 ? green : avgLatency < 8000 ? yellow : red;

  console.log(`  Model:            ${bold(model)}`);
  console.log(`  JSON parse:       ${jsonColor(`${jsonOk}/${TESTS.length}`)}  ${jsonOk === TESTS.length ? '(all valid)' : ''}`);
  console.log(`  Correct answer:   ${correctColor(`${correctOk}/${TESTS.length}`)}  ${correctOk >= 4 ? '(strong)' : correctOk >= 3 ? '(acceptable)' : '(weak)'}`);
  console.log(`  Valid enum:       ${enumOk === TESTS.length ? green(`${enumOk}/${TESTS.length}`) : yellow(`${enumOk}/${TESTS.length}`)}`);
  console.log(`  Avg latency:      ${latencyColor(`${avgLatency}ms`)}  ${avgLatency < 3000 ? '(fast)' : avgLatency < 8000 ? '(acceptable)' : '(slow — GPU issue?)'}`);
  console.log(`  Max latency:      ${dim(`${maxLatency}ms`)}`);
  console.log(`  Total tokens:     ${dim(`${totalTokens}`)}`);
  console.log(`  Errors:           ${errors > 0 ? red(`${errors}`) : green('0')}`);

  // Verdict
  console.log('');
  console.log(bold('─── Verdict ──────────────────────────────────────'));
  console.log('');

  if (jsonOk >= TESTS.length - 1 && correctOk >= 3 && avgLatency < 8000) {
    console.log(green(bold('  ✓ VIABLE — Local LLM offload is feasible on this hardware.')));
    console.log('');
    if (avgLatency < 3000) {
      console.log('  Your GPU handles this well. Real-time hook integration is practical.');
    } else {
      console.log('  Latency is moderate. Consider using local LLM for post-completion');
      console.log('  checks (PostToolUse) rather than blocking gates (PreToolUse).');
    }
  } else if (jsonOk >= 3 && correctOk >= 2) {
    console.log(yellow(bold('  ~ MARGINAL — Works but with caveats.')));
    console.log('');
    if (avgLatency >= 8000) {
      console.log('  Latency too high for hooks. Consider background-only operations');
      console.log('  or a smaller model (phi4-mini).');
    }
    if (jsonOk < TESTS.length - 1) {
      console.log('  JSON reliability is concerning. Try qwen2.5-coder:7b for better');
      console.log('  structured output compliance.');
    }
  } else {
    console.log(red(bold('  ✗ NOT VIABLE — Local LLM not reliable enough for PBR hooks.')));
    console.log('');
    if (errors > 0) {
      console.log('  Connection or model errors detected. Check Ollama logs.');
    }
    if (jsonOk <= 3) {
      console.log('  JSON output too unreliable. Try a different model or check GPU drivers.');
    }
  }

  console.log('');
  console.log(dim('  To test other models:'));
  console.log(dim(`    ollama pull mistral:7b && node scripts/local-llm-poc.js mistral:7b`));
  console.log(dim(`    ollama pull phi4-mini && node scripts/local-llm-poc.js phi4-mini`));
  console.log('');
}

main().catch(err => {
  console.error(red(`\n  Fatal error: ${err.message}\n`));
  process.exit(1);
});
