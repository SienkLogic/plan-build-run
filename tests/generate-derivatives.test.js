'use strict';

const {
  transformFrontmatter,
  transformBody,
  transformAgentFrontmatter,
  transformHooksJson,
} = require('../scripts/generate-derivatives');

// ---------------------------------------------------------------------------
// transformFrontmatter
// ---------------------------------------------------------------------------

describe('transformFrontmatter', () => {
  const skillFm = [
    '---',
    'name: myskill',
    'description: "Does something cool"',
    'allowed-tools: Read, Write, Bash',
    'argument-hint: "<N> [--flag]"',
    '---',
    '',
    'Body content here.',
  ].join('\n');

  test('cursor: removes allowed-tools but keeps argument-hint', () => {
    const result = transformFrontmatter(skillFm, 'cursor');
    expect(result).not.toMatch(/allowed-tools/);
    expect(result).toMatch(/argument-hint/);
    expect(result).toMatch(/name: myskill/);
    expect(result).toMatch(/description: "Does something cool"/);
  });

  test('cursor: keeps body content unchanged', () => {
    const result = transformFrontmatter(skillFm, 'cursor');
    expect(result).toMatch(/Body content here\./);
  });

  test('copilot: removes allowed-tools AND argument-hint', () => {
    const result = transformFrontmatter(skillFm, 'copilot');
    expect(result).not.toMatch(/allowed-tools/);
    expect(result).not.toMatch(/argument-hint/);
  });

  test('copilot: keeps name and description', () => {
    const result = transformFrontmatter(skillFm, 'copilot');
    expect(result).toMatch(/name: myskill/);
    expect(result).toMatch(/description: "Does something cool"/);
  });

  test('handles skill without argument-hint gracefully', () => {
    const minimal = '---\nname: test\ndescription: "Minimal"\nallowed-tools: Bash\n---\nBody';
    const cursor = transformFrontmatter(minimal, 'cursor');
    const copilot = transformFrontmatter(minimal, 'copilot');
    expect(cursor).not.toMatch(/allowed-tools/);
    expect(copilot).not.toMatch(/allowed-tools/);
    expect(copilot).not.toMatch(/argument-hint/);
  });
});

// ---------------------------------------------------------------------------
// transformBody
// ---------------------------------------------------------------------------

describe('transformBody', () => {
  test('replaces ${CLAUDE_PLUGIN_ROOT} with ${PLUGIN_ROOT}', () => {
    const input = 'Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/run-hook.js` for hooks.';
    const result = transformBody(input, 'cursor');
    expect(result).toContain('${PLUGIN_ROOT}/scripts/run-hook.js');
    expect(result).not.toContain('${CLAUDE_PLUGIN_ROOT}');
  });

  test('replaces ${CLAUDE_PLUGIN_ROOT}/dashboard with ../../dashboard', () => {
    const input = 'node ${CLAUDE_PLUGIN_ROOT}/dashboard/bin/cli.js';
    const result = transformBody(input, 'cursor');
    expect(result).toContain('../../dashboard/bin/cli.js');
    expect(result).not.toContain('PLUGIN_ROOT}/dashboard');
  });

  test('replaces "subagents" with "agents" (not subagent_type)', () => {
    const input = 'Spawn subagents using subagent_type to delegate work.';
    const result = transformBody(input, 'cursor');
    expect(result).toContain('Spawn agents');
    expect(result).toContain('subagent_type');  // preserved
    expect(result).not.toMatch(/\bsubagents\b/);
  });

  test('replaces "Subagents" with "Agents" (capital)', () => {
    const input = 'Subagents run in fresh contexts.';
    const result = transformBody(input, 'cursor');
    expect(result).toContain('Agents run in fresh contexts.');
  });

  test('same transform for copilot target', () => {
    const input = 'Use ${CLAUDE_PLUGIN_ROOT}/scripts/foo.js and spawn subagents.';
    const cursor = transformBody(input, 'cursor');
    const copilot = transformBody(input, 'copilot');
    expect(cursor).toBe(copilot);
  });

  test('does not replace CLAUDE_PLUGIN_ROOT inside subagent_type', () => {
    const input = 'Use subagent_type: "pbr:executor" to spawn subagents.';
    const result = transformBody(input, 'cursor');
    expect(result).toContain('subagent_type');
    expect(result).toContain('spawn agents');
  });
});

// ---------------------------------------------------------------------------
// transformAgentFrontmatter
// ---------------------------------------------------------------------------

describe('transformAgentFrontmatter', () => {
  const agentContent = [
    '---',
    'name: myagent',
    'description: "Does agent things"',
    'model: sonnet',
    'memory: project',
    'tools:',
    '  - Read',
    '  - Write',
    '  - Bash',
    '---',
    '',
    'Agent body here.',
  ].join('\n');

  test('cursor: removes model, memory, tools lines', () => {
    const result = transformAgentFrontmatter(agentContent, 'cursor');
    expect(result).not.toMatch(/^model\s*:/m);
    expect(result).not.toMatch(/^memory\s*:/m);
    expect(result).not.toMatch(/^tools\s*:/m);
    expect(result).not.toMatch(/^\s+-\s+Read/m);
    expect(result).not.toMatch(/^\s+-\s+Write/m);
  });

  test('cursor: keeps name and description', () => {
    const result = transformAgentFrontmatter(agentContent, 'cursor');
    expect(result).toMatch(/name: myagent/);
    expect(result).toMatch(/description: "Does agent things"/);
  });

  test('copilot: same as cursor (removes model/memory/tools)', () => {
    const cursorResult = transformAgentFrontmatter(agentContent, 'cursor');
    const copilotResult = transformAgentFrontmatter(agentContent, 'copilot');
    expect(cursorResult).toBe(copilotResult);
  });

  test('keeps agent body content', () => {
    const result = transformAgentFrontmatter(agentContent, 'cursor');
    expect(result).toMatch(/Agent body here\./);
  });

  test('handles agent without optional fields', () => {
    const minimal = '---\nname: minimal\ndescription: "Minimal agent"\n---\nBody.';
    const result = transformAgentFrontmatter(minimal, 'cursor');
    expect(result).toMatch(/name: minimal/);
    expect(result).toMatch(/description: "Minimal agent"/);
  });
});

// ---------------------------------------------------------------------------
// transformHooksJson
// ---------------------------------------------------------------------------

describe('transformHooksJson', () => {
  const pbrHooksSnippet = JSON.stringify({
    '$schema': '../scripts/hooks-schema.json',
    '$bootstrap': { why: 'explanation', pattern: 'node ...' },
    'description': 'Plan-Build-Run workflow hooks for state tracking, validation, and auto-continuation',
    'hooks': {
      'SessionStart': [{
        'hooks': [{
          'type': 'command',
          'command': "node -e \"var r=process.env.CLAUDE_PLUGIN_ROOT||'',m=r.match(/foo/);require(require('path').resolve(r,'scripts','run-hook.js'))\" progress-tracker.js"
        }]
      }]
    }
  }, null, 2);

  test('cursor: replaces script path pattern', () => {
    const result = transformHooksJson(pbrHooksSnippet, 'cursor');
    expect(result).toContain("r,'..','pbr','scripts','run-hook.js'");
    expect(result).not.toContain("r,'scripts','run-hook.js'");
  });

  test('cursor: updates $schema path', () => {
    const result = transformHooksJson(pbrHooksSnippet, 'cursor');
    expect(result).toContain('"../../pbr/scripts/hooks-schema.json"');
  });

  test('cursor: removes $bootstrap key', () => {
    const result = transformHooksJson(pbrHooksSnippet, 'cursor');
    const parsed = JSON.parse(result);
    expect(parsed['$bootstrap']).toBeUndefined();
  });

  test('cursor: updates description', () => {
    const result = transformHooksJson(pbrHooksSnippet, 'cursor');
    expect(result).toContain('Cursor plugin');
  });

  test('copilot: returns null (skip generation)', () => {
    const result = transformHooksJson(pbrHooksSnippet, 'copilot');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Copilot agent filename convention
// ---------------------------------------------------------------------------

describe('copilot agent filename convention', () => {
  const path = require('path');
  const fs = require('fs');

  const COPILOT_DIR = path.resolve(__dirname, '..', 'plugins', 'copilot-pbr', 'agents');

  test('all copilot agent files have .agent.md suffix', () => {
    if (!fs.existsSync(COPILOT_DIR)) return;
    const files = fs.readdirSync(COPILOT_DIR);
    for (const f of files) {
      expect(f).toMatch(/\.agent\.md$/);
    }
  });

  test('copilot has same agent names as pbr (with .agent.md suffix)', () => {
    const PBR_DIR = path.resolve(__dirname, '..', 'plugins', 'pbr', 'agents');
    if (!fs.existsSync(COPILOT_DIR) || !fs.existsSync(PBR_DIR)) return;

    const pbrStems = fs.readdirSync(PBR_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => f.slice(0, -'.md'.length))
      .sort();

    const copilotStems = fs.readdirSync(COPILOT_DIR)
      .filter(f => f.endsWith('.agent.md'))
      .map(f => f.slice(0, -'.agent.md'.length))
      .sort();

    expect(copilotStems).toEqual(pbrStems);
  });
});
