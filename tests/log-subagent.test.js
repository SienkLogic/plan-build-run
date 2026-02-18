const { buildAgentContext, resolveAgentType } = require('../plugins/pbr/scripts/log-subagent');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('log-subagent.js', () => {
  describe('buildAgentContext', () => {
    let originalCwd;
    let tmpDirs = [];

    beforeEach(() => {
      originalCwd = process.cwd();
    });

    afterEach(() => {
      process.chdir(originalCwd);
      // Clean up temp dirs after restoring cwd (Windows locks cwd)
      for (const dir of tmpDirs) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
      }
      tmpDirs = [];
    });

    function makeTmpDir() {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-lsa-'));
      const planningDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      tmpDirs.push(tmpDir);
      return { tmpDir, planningDir };
    }

    test('returns empty string when no .planning/ directory', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-build-run-lsa-'));
      tmpDirs.push(tmpDir);
      process.chdir(tmpDir);
      expect(buildAgentContext()).toBe('');
    });

    test('includes phase info from STATE.md', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      process.chdir(tmpDir);
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 3 of 8\nStatus: built');
      const result = buildAgentContext();
      expect(result).toContain('Phase 3 of 8');
      expect(result).toContain('built');
    });

    test('includes active skill info', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      process.chdir(tmpDir);
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'quick');
      const result = buildAgentContext();
      expect(result).toContain('/pbr:quick');
    });

    test('includes config highlights', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      process.chdir(tmpDir);
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ depth: 'comprehensive', git: { auto_commit: true } }));
      const result = buildAgentContext();
      expect(result).toContain('depth=comprehensive');
      expect(result).toContain('auto_commit=true');
    });

    test('returns empty string when .planning/ exists but is empty', () => {
      const { tmpDir } = makeTmpDir();
      process.chdir(tmpDir);
      const result = buildAgentContext();
      expect(result).toBe('');
    });

    test('combines multiple context sources', () => {
      const { tmpDir, planningDir } = makeTmpDir();
      process.chdir(tmpDir);
      fs.writeFileSync(path.join(planningDir, 'STATE.md'), 'Phase: 2 of 5\nStatus: planned');
      fs.writeFileSync(path.join(planningDir, '.active-skill'), 'build');
      fs.writeFileSync(path.join(planningDir, 'config.json'),
        JSON.stringify({ depth: 'standard' }));
      const result = buildAgentContext();
      expect(result).toContain('[Plan-Build-Run Project Context]');
      expect(result).toContain('Phase 2 of 5');
      expect(result).toContain('/pbr:build');
      expect(result).toContain('depth=standard');
    });
  });

  describe('resolveAgentType', () => {
    test('returns agent_type when present', () => {
      expect(resolveAgentType({ agent_type: 'pbr:executor' })).toBe('pbr:executor');
    });

    test('returns subagent_type when agent_type is absent', () => {
      expect(resolveAgentType({ subagent_type: 'pbr:planner' })).toBe('pbr:planner');
    });

    test('returns non-PBR agent_type as-is', () => {
      expect(resolveAgentType({ agent_type: 'Explore' })).toBe('Explore');
    });

    test('returns non-PBR subagent_type as-is', () => {
      expect(resolveAgentType({ subagent_type: 'general-purpose' })).toBe('general-purpose');
    });

    test('returns tool_input.subagent_type when top-level fields are absent', () => {
      expect(resolveAgentType({ tool_input: { subagent_type: 'pbr:researcher' } })).toBe('pbr:researcher');
    });

    test('returns tool_input.agent_type when other fields are absent', () => {
      expect(resolveAgentType({ tool_input: { agent_type: 'Bash' } })).toBe('Bash');
    });

    test('prefers top-level agent_type over tool_input', () => {
      expect(resolveAgentType({
        agent_type: 'pbr:executor',
        tool_input: { subagent_type: 'pbr:planner' }
      })).toBe('pbr:executor');
    });

    test('prefers top-level subagent_type over tool_input', () => {
      expect(resolveAgentType({
        subagent_type: 'custom-agent',
        tool_input: { subagent_type: 'pbr:planner' }
      })).toBe('custom-agent');
    });

    test('returns null when no type info is available', () => {
      expect(resolveAgentType({})).toBeNull();
    });

    test('returns null when data has unrelated fields only', () => {
      expect(resolveAgentType({ agent_id: 'abc', description: 'do stuff' })).toBeNull();
    });

    test('handles tool_input without type fields', () => {
      expect(resolveAgentType({ tool_input: { prompt: 'do something' } })).toBeNull();
    });
  });
});
