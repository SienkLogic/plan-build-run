/**
 * PBR Tools Tests - codex-config.cjs
 *
 * Tests for Codex adapter header, agent conversion, config.toml generation/merge,
 * per-agent .toml generation, and uninstall cleanup.
 */

// Enable test exports from install.js (skips main CLI logic)
process.env.PBR_TEST_MODE = '1';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  getCodexSkillAdapterHeader,
  convertClaudeAgentToCodexAgent,
  generateCodexAgentToml,
  generateCodexConfigBlock,
  stripPbrFromCodexConfig,
  mergeCodexConfig,
  PBR_CODEX_MARKER,
  CODEX_AGENT_SANDBOX,
} = require('../bin/install.js');

// ─── getCodexSkillAdapterHeader ─────────────────────────────────────────────────

describe('getCodexSkillAdapterHeader', () => {
  test('contains all three sections', async () => {
    const result = getCodexSkillAdapterHeader('pbr-execute-phase');
    assert.ok(result.includes('<codex_skill_adapter>'), 'has opening tag');
    assert.ok(result.includes('</codex_skill_adapter>'), 'has closing tag');
    assert.ok(result.includes('## A. Skill Invocation'), 'has section A');
    assert.ok(result.includes('## B. AskUserQuestion'), 'has section B');
    assert.ok(result.includes('## C. Task() → spawn_agent'), 'has section C');
  });

  test('includes correct invocation syntax', async () => {
    const result = getCodexSkillAdapterHeader('pbr-plan-phase');
    assert.ok(result.includes('`$pbr-plan-phase`'), 'has $skillName invocation');
    assert.ok(result.includes('{{PBR_ARGS}}'), 'has PBR_ARGS variable');
  });

  test('section B maps AskUserQuestion parameters', async () => {
    const result = getCodexSkillAdapterHeader('pbr-discuss-phase');
    assert.ok(result.includes('request_user_input'), 'maps to request_user_input');
    assert.ok(result.includes('header'), 'maps header parameter');
    assert.ok(result.includes('question'), 'maps question parameter');
    assert.ok(result.includes('label'), 'maps options label');
    assert.ok(result.includes('description'), 'maps options description');
    assert.ok(result.includes('multiSelect'), 'documents multiSelect workaround');
    assert.ok(result.includes('Execute mode'), 'documents Execute mode fallback');
  });

  test('section C maps Task to spawn_agent', async () => {
    const result = getCodexSkillAdapterHeader('pbr-execute-phase');
    assert.ok(result.includes('spawn_agent'), 'maps to spawn_agent');
    assert.ok(result.includes('agent_type'), 'maps subagent_type to agent_type');
    assert.ok(result.includes('fork_context'), 'documents fork_context default');
    assert.ok(result.includes('wait(ids)'), 'documents parallel wait pattern');
    assert.ok(result.includes('close_agent'), 'documents close_agent cleanup');
    assert.ok(result.includes('CHECKPOINT'), 'documents result markers');
  });
});

// ─── convertClaudeAgentToCodexAgent ─────────────────────────────────────────────

describe('convertClaudeAgentToCodexAgent', () => {
  test('adds codex_agent_role header and cleans frontmatter', async () => {
    const input = `---
name: pbr-executor
description: Executes PBR plans with atomic commits
tools: Read, Write, Edit, Bash, Grep, Glob
color: yellow
---

<role>
You are a PBR plan executor.
</role>`;

    const result = convertClaudeAgentToCodexAgent(input);

    // Frontmatter rebuilt with only name and description
    assert.ok(result.startsWith('---\n'), 'starts with frontmatter');
    assert.ok(result.includes('"pbr-executor"'), 'has quoted name');
    assert.ok(result.includes('"Executes PBR plans with atomic commits"'), 'has quoted description');
    assert.ok(!result.includes('color: yellow'), 'drops color field');
    // Tools should be in <codex_agent_role> but NOT in frontmatter
    const fmEnd = result.indexOf('---', 4);
    const frontmatterSection = result.substring(0, fmEnd);
    assert.ok(!frontmatterSection.includes('tools:'), 'drops tools from frontmatter');

    // Has codex_agent_role block
    assert.ok(result.includes('<codex_agent_role>'), 'has role header');
    assert.ok(result.includes('role: pbr-executor'), 'role matches agent name');
    assert.ok(result.includes('tools: Read, Write, Edit, Bash, Grep, Glob'), 'tools in role block');
    assert.ok(result.includes('purpose: Executes PBR plans with atomic commits'), 'purpose from description');
    assert.ok(result.includes('</codex_agent_role>'), 'has closing tag');

    // Body preserved
    assert.ok(result.includes('<role>'), 'body content preserved');
  });

  test('converts slash commands in body', async () => {
    const input = `---
name: pbr-test
description: Test agent
tools: Read
---

Run /pbr:execute-phase to proceed.`;

    const result = convertClaudeAgentToCodexAgent(input);
    assert.ok(result.includes('$pbr-execute-phase'), 'converts slash commands');
    assert.ok(!result.includes('/pbr:execute-phase'), 'original slash command removed');
  });

  test('handles content without frontmatter', async () => {
    const input = 'Just some content without frontmatter.';
    const result = convertClaudeAgentToCodexAgent(input);
    assert.strictEqual(result, input, 'returns input unchanged');
  });
});

// ─── generateCodexAgentToml ─────────────────────────────────────────────────────

describe('generateCodexAgentToml', () => {
  const sampleAgent = `---
name: pbr-executor
description: Executes plans
tools: Read, Write, Edit
color: yellow
---

<role>You are an executor.</role>`;

  test('sets workspace-write for executor', async () => {
    const result = generateCodexAgentToml('pbr-executor', sampleAgent);
    assert.ok(result.includes('sandbox_mode = "workspace-write"'), 'has workspace-write');
  });

  test('sets read-only for plan-checker', async () => {
    const checker = `---
name: pbr-plan-checker
description: Checks plans
tools: Read, Grep, Glob
---

<role>You check plans.</role>`;
    const result = generateCodexAgentToml('pbr-plan-checker', checker);
    assert.ok(result.includes('sandbox_mode = "read-only"'), 'has read-only');
  });

  test('includes developer_instructions from body', async () => {
    const result = generateCodexAgentToml('pbr-executor', sampleAgent);
    assert.ok(result.includes('developer_instructions = """'), 'has triple-quoted instructions');
    assert.ok(result.includes('<role>You are an executor.</role>'), 'body content in instructions');
    assert.ok(result.includes('"""'), 'has closing triple quotes');
  });

  test('defaults unknown agents to read-only', async () => {
    const result = generateCodexAgentToml('pbr-unknown', sampleAgent);
    assert.ok(result.includes('sandbox_mode = "read-only"'), 'defaults to read-only');
  });
});

// ─── CODEX_AGENT_SANDBOX mapping ────────────────────────────────────────────────

describe('CODEX_AGENT_SANDBOX', () => {
  test('has all 14 agents mapped', async () => {
    const agentNames = Object.keys(CODEX_AGENT_SANDBOX);
    assert.strictEqual(agentNames.length, 14, 'has 14 agents');
  });

  test('workspace-write agents have write tools', async () => {
    const writeAgents = [
      'pbr-codebase-mapper', 'pbr-debugger', 'pbr-dev-sync',
      'pbr-executor', 'pbr-general', 'pbr-planner',
      'pbr-researcher', 'pbr-roadmapper', 'pbr-synthesizer',
      'pbr-verifier',
    ];
    for (const name of writeAgents) {
      assert.strictEqual(CODEX_AGENT_SANDBOX[name], 'workspace-write', `${name} is workspace-write`);
    }
  });

  test('read-only agents have no write tools', async () => {
    const readOnlyAgents = ['pbr-audit', 'pbr-integration-checker', 'pbr-nyquist-auditor', 'pbr-plan-checker'];
    for (const name of readOnlyAgents) {
      assert.strictEqual(CODEX_AGENT_SANDBOX[name], 'read-only', `${name} is read-only`);
    }
  });
});

// ─── generateCodexConfigBlock ───────────────────────────────────────────────────

describe('generateCodexConfigBlock', () => {
  const agents = [
    { name: 'pbr-executor', description: 'Executes plans' },
    { name: 'pbr-planner', description: 'Creates plans' },
  ];

  test('starts with PBR marker', async () => {
    const result = generateCodexConfigBlock(agents);
    assert.ok(result.startsWith(PBR_CODEX_MARKER), 'starts with marker');
  });

  test('includes feature flags', async () => {
    const result = generateCodexConfigBlock(agents);
    assert.ok(result.includes('[features]'), 'has features table');
    assert.ok(result.includes('multi_agent = true'), 'has multi_agent');
    assert.ok(result.includes('default_mode_request_user_input = true'), 'has request_user_input');
  });

  test('includes agents table with limits', async () => {
    const result = generateCodexConfigBlock(agents);
    assert.ok(result.includes('[agents]'), 'has agents table');
    assert.ok(result.includes('max_threads = 4'), 'has max_threads');
    assert.ok(result.includes('max_depth = 2'), 'has max_depth');
  });

  test('includes per-agent sections', async () => {
    const result = generateCodexConfigBlock(agents);
    assert.ok(result.includes('[agents.pbr-executor]'), 'has executor section');
    assert.ok(result.includes('[agents.pbr-planner]'), 'has planner section');
    assert.ok(result.includes('config_file = "agents/pbr-executor.toml"'), 'has executor config_file');
    assert.ok(result.includes('"Executes plans"'), 'has executor description');
  });
});

// ─── stripPbrFromCodexConfig ────────────────────────────────────────────────────

describe('stripPbrFromCodexConfig', () => {
  test('returns null for PBR-only config', async () => {
    const content = `${PBR_CODEX_MARKER}\n[features]\nmulti_agent = true\n`;
    const result = stripPbrFromCodexConfig(content);
    assert.strictEqual(result, null, 'returns null when PBR-only');
  });

  test('preserves user content before marker', async () => {
    const content = `[model]\nname = "o3"\n\n${PBR_CODEX_MARKER}\n[features]\nmulti_agent = true\n`;
    const result = stripPbrFromCodexConfig(content);
    assert.ok(result.includes('[model]'), 'preserves user section');
    assert.ok(result.includes('name = "o3"'), 'preserves user values');
    assert.ok(!result.includes('multi_agent'), 'removes PBR content');
    assert.ok(!result.includes(PBR_CODEX_MARKER), 'removes marker');
  });

  test('strips injected feature keys without marker', async () => {
    const content = `[features]\nmulti_agent = true\ndefault_mode_request_user_input = true\nother_feature = false\n`;
    const result = stripPbrFromCodexConfig(content);
    assert.ok(!result.includes('multi_agent'), 'removes multi_agent');
    assert.ok(!result.includes('default_mode_request_user_input'), 'removes request_user_input');
    assert.ok(result.includes('other_feature = false'), 'preserves user features');
  });

  test('removes empty [features] section', async () => {
    const content = `[features]\nmulti_agent = true\n[model]\nname = "o3"\n`;
    const result = stripPbrFromCodexConfig(content);
    assert.ok(!result.includes('[features]'), 'removes empty features section');
    assert.ok(result.includes('[model]'), 'preserves other sections');
  });

  test('strips injected keys above marker on uninstall', async () => {
    // Case 3 install injects keys into [features] AND appends marker block
    const content = `[model]\nname = "o3"\n\n[features]\nmulti_agent = true\ndefault_mode_request_user_input = true\nsome_custom_flag = true\n\n${PBR_CODEX_MARKER}\n[agents]\nmax_threads = 4\n`;
    const result = stripPbrFromCodexConfig(content);
    assert.ok(result.includes('[model]'), 'preserves user model section');
    assert.ok(result.includes('some_custom_flag = true'), 'preserves user feature');
    assert.ok(!result.includes('multi_agent'), 'strips injected multi_agent');
    assert.ok(!result.includes('default_mode_request_user_input'), 'strips injected request_user_input');
    assert.ok(!result.includes(PBR_CODEX_MARKER), 'strips marker');
  });

  test('removes [agents.pbr-*] sections', async () => {
    const content = `[agents.pbr-executor]\ndescription = "test"\nconfig_file = "agents/pbr-executor.toml"\n\n[agents.custom-agent]\ndescription = "user agent"\n`;
    const result = stripPbrFromCodexConfig(content);
    assert.ok(!result.includes('[agents.pbr-executor]'), 'removes PBR agent section');
    assert.ok(result.includes('[agents.custom-agent]'), 'preserves user agent section');
  });
});

// ─── mergeCodexConfig ───────────────────────────────────────────────────────────

describe('mergeCodexConfig', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-codex-merge-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleBlock = generateCodexConfigBlock([
    { name: 'pbr-executor', description: 'Executes plans' },
  ]);

  test('case 1: creates new config.toml', async () => {
    const configPath = path.join(tmpDir, 'config.toml');
    mergeCodexConfig(configPath, sampleBlock);

    assert.ok(fs.existsSync(configPath), 'file created');
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes(PBR_CODEX_MARKER), 'has marker');
    assert.ok(content.includes('multi_agent = true'), 'has feature flag');
    assert.ok(content.includes('[agents.pbr-executor]'), 'has agent');
  });

  test('case 2: replaces existing PBR block', async () => {
    const configPath = path.join(tmpDir, 'config.toml');
    const userContent = '[model]\nname = "o3"\n';
    fs.writeFileSync(configPath, userContent + '\n' + sampleBlock + '\n');

    // Re-merge with updated block
    const newBlock = generateCodexConfigBlock([
      { name: 'pbr-executor', description: 'Updated description' },
      { name: 'pbr-planner', description: 'New agent' },
    ]);
    mergeCodexConfig(configPath, newBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('[model]'), 'preserves user content');
    assert.ok(content.includes('Updated description'), 'has new description');
    assert.ok(content.includes('[agents.pbr-planner]'), 'has new agent');
    // Verify no duplicate markers
    const markerCount = (content.match(new RegExp(PBR_CODEX_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    assert.strictEqual(markerCount, 1, 'exactly one marker');
  });

  test('case 3: appends to config without PBR marker', async () => {
    const configPath = path.join(tmpDir, 'config.toml');
    fs.writeFileSync(configPath, '[model]\nname = "o3"\n');

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('[model]'), 'preserves user content');
    assert.ok(content.includes(PBR_CODEX_MARKER), 'adds marker');
    assert.ok(content.includes('multi_agent = true'), 'has features');
  });

  test('case 3 with existing [features]: injects keys', async () => {
    const configPath = path.join(tmpDir, 'config.toml');
    fs.writeFileSync(configPath, '[features]\nother_feature = true\n\n[model]\nname = "o3"\n');

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('other_feature = true'), 'preserves existing feature');
    assert.ok(content.includes('multi_agent = true'), 'injects multi_agent');
    assert.ok(content.includes('default_mode_request_user_input = true'), 'injects request_user_input');
    assert.ok(content.includes(PBR_CODEX_MARKER), 'adds marker for agents block');
  });

  test('idempotent: re-merge produces same result', async () => {
    const configPath = path.join(tmpDir, 'config.toml');
    mergeCodexConfig(configPath, sampleBlock);
    const first = fs.readFileSync(configPath, 'utf8');

    mergeCodexConfig(configPath, sampleBlock);
    const second = fs.readFileSync(configPath, 'utf8');

    assert.strictEqual(first, second, 'idempotent merge');
  });

  test('case 2 after case 3 with existing [features]: no duplicate sections', async () => {
    const configPath = path.join(tmpDir, 'config.toml');
    fs.writeFileSync(configPath, '[features]\nother_feature = true\n\n[model]\nname = "o3"\n');
    mergeCodexConfig(configPath, sampleBlock);

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    const featuresCount = (content.match(/^\[features\]\s*$/gm) || []).length;
    const agentsCount = (content.match(/^\[agents\]\s*$/gm) || []).length;
    assert.strictEqual(featuresCount, 1, 'exactly one [features] section');
    assert.strictEqual(agentsCount, 1, 'exactly one [agents] section');
    assert.ok(content.includes('other_feature = true'), 'preserves user feature keys');
    assert.ok(content.includes('multi_agent = true'), 'has PBR feature key');
    assert.ok(content.includes('[agents.pbr-executor]'), 'has agent');
  });

  test('case 2 re-injects missing feature keys', async () => {
    const configPath = path.join(tmpDir, 'config.toml');
    const manualContent = '[features]\nother_feature = true\n\n' + PBR_CODEX_MARKER + '\n[agents]\nmax_threads = 4\n';
    fs.writeFileSync(configPath, manualContent);

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('multi_agent = true'), 're-injects multi_agent');
    assert.ok(content.includes('default_mode_request_user_input = true'), 're-injects request_user_input');
    assert.ok(content.includes('other_feature = true'), 'preserves user feature');
  });

  test('case 2 strips leaked [agents] from before content', async () => {
    const configPath = path.join(tmpDir, 'config.toml');
    const brokenContent = [
      '[features]',
      'default_mode_request_user_input = true',
      'multi_agent = true',
      'child_agents_md = false',
      '',
      '[agents]',
      'max_threads = 4',
      'max_depth = 2',
      '',
      '[agents.pbr-executor]',
      'description = "old"',
      'config_file = "agents/pbr-executor.toml"',
      '',
      PBR_CODEX_MARKER,
      '[agents]',
      'max_threads = 4',
      '',
    ].join('\n');
    fs.writeFileSync(configPath, brokenContent);

    mergeCodexConfig(configPath, sampleBlock);

    const content = fs.readFileSync(configPath, 'utf8');
    const agentsCount = (content.match(/^\[agents\]\s*$/gm) || []).length;
    assert.strictEqual(agentsCount, 1, 'exactly one [agents] section');
    assert.ok(content.includes('child_agents_md = false'), 'preserves user feature keys');
    assert.ok(content.includes('[agents.pbr-executor]'), 'has agent from fresh block');
  });

  test('case 2 idempotent after case 3 with existing [features]', async () => {
    const configPath = path.join(tmpDir, 'config.toml');
    fs.writeFileSync(configPath, '[features]\nother_feature = true\n');
    mergeCodexConfig(configPath, sampleBlock);
    const first = fs.readFileSync(configPath, 'utf8');

    mergeCodexConfig(configPath, sampleBlock);
    const second = fs.readFileSync(configPath, 'utf8');

    mergeCodexConfig(configPath, sampleBlock);
    const third = fs.readFileSync(configPath, 'utf8');

    assert.strictEqual(first, second, 'idempotent after 2nd merge');
    assert.strictEqual(second, third, 'idempotent after 3rd merge');
  });
});

// ─── Integration: installCodexConfig ────────────────────────────────────────────

describe('installCodexConfig (integration)', () => {
  let tmpTarget;
  const agentsSrc = path.join(__dirname, '..', 'agents');

  beforeEach(() => {
    tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'pbr-codex-install-'));
  });

  afterEach(() => {
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  });

  // Only run if agents/ directory exists (not in CI without full checkout)
  const hasAgents = fs.existsSync(agentsSrc);

  (hasAgents ? test : test.skip)('generates config.toml and agent .toml files', () => {
    const { installCodexConfig } = require('../bin/install.js');
    const count = installCodexConfig(tmpTarget, agentsSrc);

    assert.ok(count >= 11, `installed ${count} agents (expected >= 11)`);

    // Verify config.toml
    const configPath = path.join(tmpTarget, 'config.toml');
    assert.ok(fs.existsSync(configPath), 'config.toml exists');
    const config = fs.readFileSync(configPath, 'utf8');
    assert.ok(config.includes('multi_agent = true'), 'has multi_agent feature');
    assert.ok(config.includes('[agents.pbr-executor]'), 'has executor agent');

    // Verify per-agent .toml files
    const agentsDir = path.join(tmpTarget, 'agents');
    assert.ok(fs.existsSync(path.join(agentsDir, 'pbr-executor.toml')), 'executor .toml exists');
    assert.ok(fs.existsSync(path.join(agentsDir, 'pbr-plan-checker.toml')), 'plan-checker .toml exists');

    const executorToml = fs.readFileSync(path.join(agentsDir, 'pbr-executor.toml'), 'utf8');
    assert.ok(executorToml.includes('sandbox_mode = "workspace-write"'), 'executor is workspace-write');
    assert.ok(executorToml.includes('developer_instructions'), 'has developer_instructions');

    const checkerToml = fs.readFileSync(path.join(agentsDir, 'pbr-plan-checker.toml'), 'utf8');
    assert.ok(checkerToml.includes('sandbox_mode = "read-only"'), 'plan-checker is read-only');
  });
});
