'use strict';

const path = require('path');
const fs = require('fs');

const {
  transformFrontmatter,
  transformBody,
  transformAgentFrontmatter,
  transformHooksJson,
  generate,
  verify,
  CODEX_DIR,
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

  test('cursor: removes memory and tools but keeps model', () => {
    const result = transformAgentFrontmatter(agentContent, 'cursor');
    expect(result).toMatch(/^model\s*:/m);     // cursor keeps model
    expect(result).not.toMatch(/^memory\s*:/m);
    expect(result).not.toMatch(/^tools\s*:/m);
    expect(result).not.toMatch(/^\s+-\s+Read/m);
    expect(result).not.toMatch(/^\s+-\s+Write/m);
  });

  test('cursor: adds readonly: false', () => {
    const result = transformAgentFrontmatter(agentContent, 'cursor');
    expect(result).toMatch(/^readonly:\s*false/m);
  });

  test('cursor: keeps name and description', () => {
    const result = transformAgentFrontmatter(agentContent, 'cursor');
    expect(result).toMatch(/name: myagent/);
    expect(result).toMatch(/description: "Does agent things"/);
  });

  test('copilot: removes model, memory, tools (unlike cursor)', () => {
    const copilotResult = transformAgentFrontmatter(agentContent, 'copilot');
    expect(copilotResult).not.toMatch(/^model\s*:/m);
    expect(copilotResult).not.toMatch(/^memory\s*:/m);
    expect(copilotResult).not.toMatch(/^tools\s*:/m);
    expect(copilotResult).toMatch(/name: myagent/);
    expect(copilotResult).toMatch(/description: "Does agent things"/);
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

  test('cursor: adds default model: sonnet when source lacks model (phase 64+)', () => {
    const noModel = '---\nname: executor\ndescription: "Executor agent"\n---\nBody.';
    const result = transformAgentFrontmatter(noModel, 'cursor');
    expect(result).toMatch(/^model: sonnet$/m);
    // model should appear after description
    const lines = result.split('\n');
    const descIdx = lines.findIndex(l => /^description/.test(l));
    const modelIdx = lines.findIndex(l => /^model/.test(l));
    expect(modelIdx).toBe(descIdx + 1);
  });

  test('copilot: does NOT add default model when source lacks model', () => {
    const noModel = '---\nname: executor\ndescription: "Executor agent"\n---\nBody.';
    const result = transformAgentFrontmatter(noModel, 'copilot');
    expect(result).not.toMatch(/^model\s*:/m);
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

// ---------------------------------------------------------------------------
// codex target
// ---------------------------------------------------------------------------

describe('codex target', () => {
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

  describe('transformFrontmatter with codex', () => {
    test('removes allowed-tools', () => {
      const result = transformFrontmatter(skillFm, 'codex');
      expect(result).not.toMatch(/allowed-tools/);
    });

    test('removes argument-hint', () => {
      const result = transformFrontmatter(skillFm, 'codex');
      expect(result).not.toMatch(/argument-hint/);
    });

    test('keeps name and description', () => {
      const result = transformFrontmatter(skillFm, 'codex');
      expect(result).toMatch(/name: myskill/);
      expect(result).toMatch(/description: "Does something cool"/);
    });
  });

  describe('transformBody with codex', () => {
    test('replaces /pbr: with $pbr-', () => {
      const input = 'Run /pbr:plan-phase to create a plan, then /pbr:execute-phase to execute.';
      const result = transformBody(input, 'codex');
      expect(result).toContain('$pbr-plan');
      expect(result).toContain('$pbr-execute-phase');
      expect(result).not.toContain('/pbr:');
    });

    test('still replaces ${CLAUDE_PLUGIN_ROOT} with ${PLUGIN_ROOT}', () => {
      const input = 'node ${CLAUDE_PLUGIN_ROOT}/scripts/run-hook.js';
      const result = transformBody(input, 'codex');
      expect(result).toContain('${PLUGIN_ROOT}/scripts/run-hook.js');
      expect(result).not.toContain('${CLAUDE_PLUGIN_ROOT}');
    });

    test('still replaces subagents with agents', () => {
      const input = 'Spawn subagents using subagent_type.';
      const result = transformBody(input, 'codex');
      expect(result).toContain('Spawn agents');
      expect(result).toContain('subagent_type');
    });

    test('cursor target does NOT replace /pbr:', () => {
      const input = 'Run /pbr:plan-phase to start.';
      const result = transformBody(input, 'cursor');
      expect(result).toContain('/pbr:plan-phase');
      expect(result).not.toContain('$pbr-');
    });
  });

  describe('transformHooksJson with codex', () => {
    test('returns null', () => {
      const input = JSON.stringify({ hooks: {} });
      const result = transformHooksJson(input, 'codex');
      expect(result).toBeNull();
    });
  });

  describe('transformAgentFrontmatter with codex', () => {
    test('removes model', () => {
      const result = transformAgentFrontmatter(agentContent, 'codex');
      expect(result).not.toMatch(/^model\s*:/m);
    });

    test('removes memory', () => {
      const result = transformAgentFrontmatter(agentContent, 'codex');
      expect(result).not.toMatch(/^memory\s*:/m);
    });

    test('removes tools list', () => {
      const result = transformAgentFrontmatter(agentContent, 'codex');
      expect(result).not.toMatch(/^tools\s*:/m);
    });

    test('keeps name and description', () => {
      const result = transformAgentFrontmatter(agentContent, 'codex');
      expect(result).toMatch(/name: myagent/);
      expect(result).toMatch(/description: "Does agent things"/);
    });

    test('does NOT add readonly: false', () => {
      const result = transformAgentFrontmatter(agentContent, 'codex');
      expect(result).not.toMatch(/readonly/);
    });
  });
});

// ---------------------------------------------------------------------------
// generate() and verify() integration tests
// ---------------------------------------------------------------------------

describe('generate and verify (integration)', () => {
  test('generate cursor returns array of written file paths', () => {
    const written = generate('cursor', false);
    expect(Array.isArray(written)).toBe(true);
    expect(written.length).toBeGreaterThan(0);
    // All paths should be inside cursor-pbr
    for (const f of written) {
      expect(f).toMatch(/cursor-pbr/);
    }
  });

  test('generate copilot returns array of written file paths', () => {
    const written = generate('copilot', false);
    expect(Array.isArray(written)).toBe(true);
    expect(written.length).toBeGreaterThan(0);
    for (const f of written) {
      expect(f).toMatch(/copilot-pbr/);
    }
  });

  test('generate dry-run returns same paths without writing', () => {
    const CURSOR_DIR = path.resolve(__dirname, '..', 'plugins', 'cursor-pbr');
    const testFile = path.join(CURSOR_DIR, 'skills', 'audit', 'SKILL.md');

    // Record mtime before
    const statBefore = fs.statSync(testFile);

    const written = generate('cursor', true);
    expect(written.length).toBeGreaterThan(0);

    // File mtime should not have changed
    const statAfter = fs.statSync(testFile);
    expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
  });

  test('verify returns ok:true when derivatives match', () => {
    // First generate so derivatives are up to date
    generate('cursor', false);
    const result = verify('cursor');
    expect(result.ok).toBe(true);
    expect(result.drifted).toHaveLength(0);
  });

  test('verify returns ok:false when a derivative file has drift', () => {
    const CURSOR_DIR = path.resolve(__dirname, '..', 'plugins', 'cursor-pbr');
    const testFile = path.join(CURSOR_DIR, 'skills', 'audit', 'SKILL.md');
    const original = fs.readFileSync(testFile, 'utf8');

    // Introduce drift
    fs.writeFileSync(testFile, original + '\n<!-- DRIFT -->\n');
    const result = verify('cursor');

    // Restore
    fs.writeFileSync(testFile, original);

    expect(result.ok).toBe(false);
    expect(result.drifted.length).toBeGreaterThan(0);
  });

  test('copilot verify returns ok:true when derivatives match', () => {
    generate('copilot', false);
    const result = verify('copilot');
    expect(result.ok).toBe(true);
  });

  test('verify detects missing file as drift', () => {
    const CURSOR_DIR = path.resolve(__dirname, '..', 'plugins', 'cursor-pbr');
    const testFile = path.join(CURSOR_DIR, 'references', 'deviation-rules.md');
    const original = fs.readFileSync(testFile);

    // Temporarily remove file
    fs.unlinkSync(testFile);
    const result = verify('cursor');

    // Restore
    fs.writeFileSync(testFile, original);

    // Should detect missing file
    expect(result.ok).toBe(false);
    const hasMissing = result.drifted.some(d => d.includes('(missing)') || d.includes('deviation-rules'));
    expect(hasMissing).toBe(true);
  });

  test('generate cursor target-only works', () => {
    const written = generate('cursor', true);
    expect(written.every(f => f.includes('cursor-pbr'))).toBe(true);
    expect(written.every(f => !f.includes('copilot-pbr'))).toBe(true);
  });

  test('CODEX_DIR constant resolves to plugins/codex-pbr/', () => {
    expect(CODEX_DIR).toBeDefined();
    expect(CODEX_DIR).toMatch(/codex-pbr/);
    expect(path.isAbsolute(CODEX_DIR)).toBe(true);
  });

  test('generate codex dry-run returns paths inside codex-pbr', () => {
    const written = generate('codex', true);
    expect(Array.isArray(written)).toBe(true);
    expect(written.length).toBeGreaterThan(0);
    for (const f of written) {
      expect(f).toMatch(/codex-pbr/);
    }
  });

  test('generate codex writes files to plugins/codex-pbr/', () => {
    const written = generate('codex', false);
    expect(Array.isArray(written)).toBe(true);
    expect(written.length).toBeGreaterThan(0);
    for (const f of written) {
      expect(f).toMatch(/codex-pbr/);
    }
  });

  test('verify codex returns ok:true immediately after generation', () => {
    generate('codex', false);
    const result = verify('codex');
    expect(result.ok).toBe(true);
    expect(result.drifted).toHaveLength(0);
  });

  test('codex agent files have .md extension (not .agent.md)', () => {
    generate('codex', false);
    const codexAgentsDir = path.join(CODEX_DIR, 'agents');
    if (fs.existsSync(codexAgentsDir)) {
      const files = fs.readdirSync(codexAgentsDir);
      for (const f of files) {
        expect(f).not.toMatch(/\.agent\.md$/);
        expect(f).toMatch(/\.md$/);
      }
    }
  });
});
