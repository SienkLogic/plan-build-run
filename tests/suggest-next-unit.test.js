/**
 * Tests for hooks/lib/suggest-next.js — the 11-priority routing decision tree.
 *
 * Each priority level gets dedicated test cases plus edge cases for
 * boundary conditions, missing files, and alternative suggestions.
 */

const fs = require('fs');
const path = require('path');
const { createTmpPlanning, cleanupTmp } = require('./helpers');
const { suggestNext } = require('../hooks/lib/suggest-next');

// ---- Helpers ----

/**
 * Set up a phase directory with optional plans, summaries, verification.
 */
function setupPhase(planningDir, num, slug, opts = {}) {
  const dirName = `${String(num).padStart(2, '0')}-${slug}`;
  const phaseDir = path.join(planningDir, 'phases', dirName);
  fs.mkdirSync(phaseDir, { recursive: true });

  const planCount = opts.plans || 0;
  for (let i = 1; i <= planCount; i++) {
    const nn = String(i).padStart(2, '0');
    fs.writeFileSync(
      path.join(phaseDir, `PLAN-${nn}.md`),
      `---\nphase: "${num}"\nplan: "${num}-${nn}"\n---\nPlan content\n`
    );
  }

  const summaryCount = opts.summaries || 0;
  for (let i = 1; i <= summaryCount; i++) {
    const nn = String(i).padStart(2, '0');
    fs.writeFileSync(
      path.join(phaseDir, `SUMMARY-${nn}.md`),
      `---\nphase: "${num}"\nplan: "${num}-${nn}"\nstatus: complete\n---\nSummary\n`
    );
  }

  if (opts.verification != null) {
    fs.writeFileSync(
      path.join(phaseDir, 'VERIFICATION.md'),
      `---\nresult: ${opts.verification}\n---\nVerification content\n`
    );
  }

  if (opts.continueHere) {
    fs.writeFileSync(path.join(phaseDir, '.continue-here.md'), 'paused');
  }

  return phaseDir;
}

/**
 * Write STATE.md with YAML frontmatter.
 */
function writeState(planningDir, fm) {
  const lines = ['---'];
  for (const [key, val] of Object.entries(fm)) {
    if (Array.isArray(val)) {
      lines.push(`${key}:`);
      for (const item of val) {
        if (typeof item === 'object') {
          lines.push(`  - text: "${item.text || ''}"`);
        } else {
          lines.push(`  - "${item}"`);
        }
      }
    } else if (val === null) {
      lines.push(`${key}: null`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push('---', '');
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), lines.join('\n'));
}

/**
 * Write ROADMAP.md with provided content.
 */
function writeRoadmap(planningDir, content) {
  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), content);
}

// ---- Tests ----

let tmpDir, planningDir;

beforeEach(() => {
  ({ tmpDir, planningDir } = createTmpPlanning());
});

afterEach(() => {
  cleanupTmp(tmpDir);
});

describe('suggestNext routing tree', () => {
  // --- Priority 11: No project ---
  describe('Priority 11 - No project', () => {
    test('returns /pbr:begin for non-existent path', () => {
      const result = suggestNext(path.join(tmpDir, 'nonexistent', '.planning'));
      expect(result.command).toBe('/pbr:begin');
      expect(result.reason).toMatch(/No \.planning\//);
      expect(result.alternatives).toEqual([]);
    });
  });

  // --- Priority 1: Paused work ---
  describe('Priority 1 - Paused work', () => {
    test('detects .continue-here.md in project root', () => {
      fs.writeFileSync(path.join(tmpDir, '.continue-here.md'), 'paused');
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:resume');
      expect(result.reason).toMatch(/[Pp]aused/);
    });

    test('detects .continue-here.md in phase dir', () => {
      setupPhase(planningDir, 1, 'setup', { plans: 1, continueHere: true });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:resume');
    });

    test('paused work takes priority over UAT blocker', () => {
      fs.writeFileSync(path.join(tmpDir, '.continue-here.md'), 'paused');
      writeState(planningDir, { blockers: ['UAT: login broken'] });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:resume');
    });
  });

  // --- Priority 2: UAT blocker ---
  describe('Priority 2 - UAT blocker', () => {
    test('string blocker with UAT keyword', () => {
      writeState(planningDir, { current_phase: 1, blockers: ['UAT: login flow broken'] });
      setupPhase(planningDir, 1, 'auth', { plans: 1 });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:review');
      expect(result.reason).toMatch(/UAT/);
    });

    test('object blocker with UAT in text field', () => {
      writeState(planningDir, { current_phase: 1, blockers: [{ text: 'UAT required' }] });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:review');
    });

    test('non-UAT blocker does NOT trigger priority 2', () => {
      writeState(planningDir, { current_phase: 1, blockers: ['normal blocker'] });
      // With no phases matching other priorities, should fall through
      const result = suggestNext(planningDir);
      expect(result.command).not.toBe('/pbr:review');
    });

    test('empty blockers array does not trigger', () => {
      writeState(planningDir, { current_phase: 1, blockers: [] });
      const result = suggestNext(planningDir);
      expect(result.command).not.toBe('/pbr:review');
    });
  });

  // --- Priority 3: Active checkpoint ---
  describe('Priority 3 - Active checkpoint', () => {
    test('active_checkpoint set triggers /pbr:build', () => {
      writeState(planningDir, { current_phase: 4, active_checkpoint: '"04-01-T2"' });
      setupPhase(planningDir, 4, 'coverage', { plans: 1 });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:build');
      expect(result.reason).toMatch(/checkpoint/i);
    });

    test('active_checkpoint string "null" does NOT trigger', () => {
      // YAML null parses as JS null, but string "null" is explicit
      writeState(planningDir, { active_checkpoint: '"null"' });
      const result = suggestNext(planningDir);
      expect(result.command).not.toBe('/pbr:build');
    });

    test('active_checkpoint null does NOT trigger', () => {
      writeState(planningDir, { active_checkpoint: null });
      const result = suggestNext(planningDir);
      expect(result.command).not.toBe('/pbr:build');
    });
  });

  // --- Priority 4: Verification gaps ---
  describe('Priority 4 - Verification gaps', () => {
    test('phase with gaps_found triggers /pbr:plan --gaps', () => {
      setupPhase(planningDir, 3, 'testing', {
        plans: 1, summaries: 1, verification: 'gaps_found'
      });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:plan');
      expect(result.args).toContain('--gaps');
      expect(result.args).toContain('3');
    });
  });

  // --- Priority 5: Built not verified ---
  describe('Priority 5 - Built not verified', () => {
    test('phase with plans=summaries and no verification triggers /pbr:review', () => {
      setupPhase(planningDir, 2, 'core', { plans: 1, summaries: 1 });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:review');
      expect(result.args).toBe('2');
    });

    test('phase with multiple plans all summarized triggers review', () => {
      setupPhase(planningDir, 2, 'core', { plans: 3, summaries: 3 });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:review');
    });
  });

  // --- Priority 6: Planned not built ---
  describe('Priority 6 - Planned not built', () => {
    test('phase with plans and no summaries triggers /pbr:build', () => {
      setupPhase(planningDir, 5, 'features', { plans: 2, summaries: 0 });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:build');
      expect(result.args).toBe('5');
    });
  });

  // --- Priority 7: Building in progress ---
  describe('Priority 7 - Building in progress', () => {
    test('phase with partial summaries triggers /pbr:build with in-progress', () => {
      setupPhase(planningDir, 6, 'polish', { plans: 2, summaries: 1 });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:build');
      expect(result.reason).toMatch(/in progress/i);
      expect(result.context.plans_total).toBe(2);
      expect(result.context.plans_complete).toBe(1);
    });
  });

  // --- Priority 8: All verified, more phases in ROADMAP ---
  describe('Priority 8 - All verified, more phases in ROADMAP', () => {
    test('heading format: ### Phase N', () => {
      setupPhase(planningDir, 1, 'setup', {
        plans: 1, summaries: 1, verification: 'passed'
      });
      writeRoadmap(planningDir,
        '# Roadmap\n\n### Phase 1: Setup\n\n### Phase 2: Core Features\n'
      );
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:plan');
      expect(result.args).toBe('2');
    });

    test('table format: | N. Name |', () => {
      setupPhase(planningDir, 1, 'setup', {
        plans: 1, summaries: 1, verification: 'passed'
      });
      writeRoadmap(planningDir,
        '| Phase | Status |\n| 1. Setup | Done |\n| 2. Build | Pending |\n'
      );
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:plan');
      expect(result.args).toBe('2');
    });

    test('picks lowest unstarted phase number', () => {
      setupPhase(planningDir, 1, 'setup', {
        plans: 1, summaries: 1, verification: 'passed'
      });
      writeRoadmap(planningDir,
        '### Phase 1: Done\n### Phase 3: Later\n### Phase 2: Next\n'
      );
      const result = suggestNext(planningDir);
      expect(result.args).toBe('2');
    });
  });

  // --- Priority 9: Milestone complete ---
  describe('Priority 9 - Milestone complete', () => {
    test('status milestone-complete with no phases triggers /pbr:new-milestone', () => {
      writeState(planningDir, { status: 'milestone-complete' });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:new-milestone');
    });
  });

  // --- Priority 10: Empty phases ---
  describe('Priority 10 - Empty phases', () => {
    test('phase dir with no PLAN files triggers /pbr:plan', () => {
      setupPhase(planningDir, 7, 'docs', { plans: 0 });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:plan');
      expect(result.args).toBe('7');
      expect(result.reason).toMatch(/needs planning/i);
    });
  });

  // --- Edge cases ---
  describe('Edge cases', () => {
    test('no phases + STATE.md with current_phase => /pbr:plan', () => {
      writeState(planningDir, { current_phase: 3 });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:plan');
    });

    test('no phases + no STATE.md current_phase => /pbr:begin', () => {
      // planningDir exists but empty (no phases, no STATE.md)
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:begin');
    });

    test('all verified + no unstarted in ROADMAP => /pbr:new-milestone', () => {
      setupPhase(planningDir, 1, 'only', {
        plans: 1, summaries: 1, verification: 'passed'
      });
      writeRoadmap(planningDir, '### Phase 1: Only Phase\n');
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:new-milestone');
    });

    test('all verified + no ROADMAP at all => /pbr:new-milestone', () => {
      setupPhase(planningDir, 1, 'only', {
        plans: 1, summaries: 1, verification: 'passed'
      });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:new-milestone');
    });

    test('priority ordering: gaps_found beats built-not-verified', () => {
      setupPhase(planningDir, 1, 'gaps', {
        plans: 1, summaries: 1, verification: 'gaps_found'
      });
      setupPhase(planningDir, 2, 'built', {
        plans: 1, summaries: 1
      });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:plan');
      expect(result.args).toContain('--gaps');
    });

    test('priority ordering: built-not-verified beats planned-not-built', () => {
      setupPhase(planningDir, 1, 'built', { plans: 1, summaries: 1 });
      setupPhase(planningDir, 2, 'planned', { plans: 1, summaries: 0 });
      const result = suggestNext(planningDir);
      expect(result.command).toBe('/pbr:review');
      expect(result.args).toBe('1');
    });
  });

  // --- Alternatives ---
  describe('Alternatives', () => {
    test('/pbr:quick always present in alternatives', () => {
      const result = suggestNext(planningDir);
      const quickAlt = result.alternatives.find(a => a.command === '/pbr:quick');
      expect(quickAlt).toBeDefined();
      expect(quickAlt.reason).toMatch(/ad-hoc/i);
    });

    test('pending todos appear in alternatives', () => {
      const todosDir = path.join(planningDir, 'todos', 'pending');
      fs.mkdirSync(todosDir, { recursive: true });
      fs.writeFileSync(path.join(todosDir, '001.md'), 'todo1');
      fs.writeFileSync(path.join(todosDir, '002.md'), 'todo2');
      const result = suggestNext(planningDir);
      const todoAlt = result.alternatives.find(a => a.command === '/pbr:todo list');
      expect(todoAlt).toBeDefined();
      expect(todoAlt.reason).toMatch(/2 pending todos/);
    });

    test('notes appear in alternatives', () => {
      const notesDir = path.join(planningDir, 'notes');
      fs.mkdirSync(notesDir, { recursive: true });
      fs.writeFileSync(path.join(notesDir, 'note1.md'), 'note');
      const result = suggestNext(planningDir);
      const noteAlt = result.alternatives.find(a => a.command === '/pbr:note list');
      expect(noteAlt).toBeDefined();
      expect(noteAlt.reason).toMatch(/1 active note/);
    });

    test('singular todo text when count is 1', () => {
      const todosDir = path.join(planningDir, 'todos', 'pending');
      fs.mkdirSync(todosDir, { recursive: true });
      fs.writeFileSync(path.join(todosDir, '001.md'), 'todo');
      const result = suggestNext(planningDir);
      const todoAlt = result.alternatives.find(a => a.command === '/pbr:todo list');
      expect(todoAlt.reason).toMatch(/1 pending todo(?!s)/);
    });

    test('no alternatives for priority 11 (no project)', () => {
      const result = suggestNext(path.join(tmpDir, 'nope', '.planning'));
      expect(result.alternatives).toEqual([]);
    });
  });

  // --- Context object ---
  describe('Context object', () => {
    test('includes phase info when phase matched', () => {
      setupPhase(planningDir, 3, 'testing', { plans: 2, summaries: 0 });
      const result = suggestNext(planningDir);
      expect(result.context.current_phase).toBe(3);
      expect(result.context.phase_status).toBe('planned');
      expect(result.context.plans_total).toBe(2);
      expect(result.context.plans_complete).toBe(0);
    });

    test('falls back to STATE.md values when no phase matched', () => {
      writeState(planningDir, { current_phase: 5, status: 'building' });
      const result = suggestNext(planningDir);
      expect(result.context.current_phase).toBe(5);
      expect(result.context.phase_status).toBe('building');
    });
  });
});
