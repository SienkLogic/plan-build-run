/**
 * Behavioral tests for PBR agent prompt files.
 *
 * Validates that every core agent markdown file contains the
 * GSD-inspired structural patterns required by the Plan-Build-Run
 * architecture: files_to_read protocol, success criteria, anti-patterns,
 * completion markers, and agent-specific enforcement sections.
 */

const fs = require('fs');
const path = require('path');

const AGENT_DIR = path.join(__dirname, '..', 'plugins', 'pbr', 'agents');

// Read all agent markdown files once
const agentFiles = fs.readdirSync(AGENT_DIR).filter(f => f.endsWith('.md'));

// Core agents — dev-sync is a utility agent excluded from universal tests
const coreAgents = agentFiles.filter(f => f !== 'dev-sync.md');

// Helper: read agent content (cached)
const agentContentCache = {};
function readAgent(file) {
  if (!agentContentCache[file]) {
    agentContentCache[file] = fs.readFileSync(path.join(AGENT_DIR, file), 'utf8');
  }
  return agentContentCache[file];
}

// ---------------------------------------------------------------------------
// 1. Universal pattern tests (ALL core agents must pass)
// ---------------------------------------------------------------------------

describe('Universal agent patterns', () => {
  test('agent directory contains expected core agent count', () => {
    // 11 core agents + dev-sync = 12 total
    expect(agentFiles.length).toBe(12);
    expect(coreAgents.length).toBe(11);
  });

  test.each(coreAgents)('%s has YAML frontmatter with required fields', (file) => {
    const content = readAgent(file);
    expect(content).toMatch(/^---\r?\n/);
    expect(content).toMatch(/\nname:/);
    expect(content).toMatch(/\ndescription:/);
  });

  test.each(coreAgents)('%s has model field in frontmatter', (file) => {
    const content = readAgent(file);
    expect(content).toMatch(/\nmodel:\s*(sonnet|inherit|haiku)/);
  });

  test.each(coreAgents)('%s has tools list in frontmatter', (file) => {
    const content = readAgent(file);
    expect(content).toMatch(/\ntools:\r?\n/);
  });

  test.each(coreAgents)('%s has <files_to_read> protocol', (file) => {
    const content = readAgent(file);
    expect(content).toMatch(/<files_to_read>/);
    expect(content).toMatch(/CRITICAL.*files_to_read/is);
  });

  test.each(coreAgents)('%s has <success_criteria> with checkboxes', (file) => {
    const content = readAgent(file);
    expect(content).toMatch(/<success_criteria>/);
    // At least one unchecked checkbox
    expect(content).toMatch(/- \[ \]/);
  });

  test.each(coreAgents)('%s has <anti_patterns> section', (file) => {
    const content = readAgent(file);
    expect(content).toMatch(/<anti_patterns>/);
  });

  test.each(coreAgents)('%s has completion marker documentation', (file) => {
    const content = readAgent(file);
    // Every agent must mention completion markers
    expect(content).toMatch(/completion marker/i);
    // Every agent must define at least one ## WORD COMPLETE/FAILED/PASSED/FOUND/BLOCKED pattern
    expect(content).toMatch(/## [A-Z][A-Z ]*(?:COMPLETE|FAILED|PASSED|FOUND|BLOCKED)/);
  });

  test.each(coreAgents)('%s closes all opened XML-style tags', (file) => {
    const content = readAgent(file);
    // Find all opening custom tags (not HTML like <br>)
    const openTags = content.match(/<(files_to_read|success_criteria|anti_patterns|deviation_rules|circuit_breaker|scope_boundary|self_check_protocol|stub_detection_patterns|critical_rules|spot_check_protocol)>/g) || [];
    for (const tag of openTags) {
      const tagName = tag.slice(1, -1); // strip < >
      expect(content).toContain(`</${tagName}>`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Executor-specific tests
// ---------------------------------------------------------------------------

describe('Executor agent patterns', () => {
  const content = readAgent('executor.md');

  test('has <deviation_rules> with 4+ rules', () => {
    expect(content).toMatch(/<deviation_rules>/);
    // Rules are labeled "Rule 1", "Rule 2", etc.
    const ruleCount = (content.match(/\*\*Rule \d+/g) || []).length;
    expect(ruleCount).toBeGreaterThanOrEqual(4);
  });

  test('has <circuit_breaker> with 3-attempt limit', () => {
    expect(content).toMatch(/<circuit_breaker>/);
    expect(content).toMatch(/3.*attempt|3.*strike|3.*fail/i);
  });

  test('has <scope_boundary> enforcement', () => {
    expect(content).toMatch(/<scope_boundary>/);
    expect(content).toMatch(/<\/scope_boundary>/);
  });

  test('has <self_check_protocol> with 3 layers', () => {
    expect(content).toMatch(/<self_check_protocol>/);
    expect(content).toMatch(/Layer 1.*File/i);
    expect(content).toMatch(/Layer 2.*Commit/i);
    expect(content).toMatch(/Layer 3.*Test/i);
  });

  test('has tiered summary template selection', () => {
    expect(content).toMatch(/SUMMARY-minimal/);
    expect(content).toMatch(/SUMMARY-complex/);
  });

  test('has dirty tree cleanup via git stash in checkpoint section', () => {
    expect(content).toMatch(/git stash/);
  });

  test('has Self-Check PASSED/FAILED markers', () => {
    expect(content).toMatch(/Self-Check: PASSED/);
    expect(content).toMatch(/Self-Check: FAILED/);
  });

  test('has atomic commit documentation', () => {
    expect(content).toMatch(/atomic commit/i);
    expect(content).toMatch(/\{type\}\(\{?phase/);
  });

  test('has progress tracking via .PROGRESS file', () => {
    expect(content).toMatch(/\.PROGRESS-\{plan_id\}/);
  });

  test('completion markers include PLAN COMPLETE and PLAN FAILED', () => {
    expect(content).toMatch(/## PLAN COMPLETE/);
    expect(content).toMatch(/## PLAN FAILED/);
  });
});

// ---------------------------------------------------------------------------
// 3. Verifier-specific tests
// ---------------------------------------------------------------------------

describe('Verifier agent patterns', () => {
  const content = readAgent('verifier.md');

  test('has <stub_detection_patterns>', () => {
    expect(content).toMatch(/<stub_detection_patterns>/);
    expect(content).toMatch(/<\/stub_detection_patterns>/);
  });

  test('has concrete stub examples', () => {
    expect(content).toMatch(/return null/);
    expect(content).toMatch(/return undefined/);
    expect(content).toMatch(/TODO/);
    expect(content).toMatch(/FIXME/);
  });

  test('has 3-level artifact check (exist, substantive, wired)', () => {
    expect(content).toMatch(/Level 1.*Exist/i);
    expect(content).toMatch(/Level 2.*Substant/i);
    expect(content).toMatch(/Level 3.*Wired/i);
  });

  test('has artifact outcome decision table', () => {
    expect(content).toMatch(/MISSING/);
    expect(content).toMatch(/STUB/);
    expect(content).toMatch(/UNWIRED/);
    expect(content).toMatch(/PASSED/);
  });

  test('has ARGS_WRONG classification for argument-level checks', () => {
    expect(content).toMatch(/ARGS_WRONG/);
  });

  test('has read-only constraint', () => {
    expect(content).toMatch(/Read-Only/i);
  });

  test('completion markers include VERIFICATION COMPLETE', () => {
    expect(content).toMatch(/## VERIFICATION COMPLETE/);
  });
});

// ---------------------------------------------------------------------------
// 4. Planner-specific tests
// ---------------------------------------------------------------------------

describe('Planner agent patterns', () => {
  const content = readAgent('planner.md');

  test('has task sizing guidance', () => {
    // Planner specifies "2-3 per plan" for task grouping
    expect(content).toMatch(/2-3.*per plan|2-3.*tasks/i);
  });

  test('has goal-backward methodology section', () => {
    expect(content).toMatch(/Goal-Backward/i);
  });

  test('defines must-have categories (truths, artifacts, key_links)', () => {
    expect(content).toMatch(/Truths/);
    expect(content).toMatch(/Artifacts/);
    expect(content).toMatch(/Key.?links/i);
  });

  test('has wave assignment for dependency ordering', () => {
    expect(content).toMatch(/Wave 1/);
    expect(content).toMatch(/Wave 2/);
  });

  test('enforces locked decisions from CONTEXT.md', () => {
    expect(content).toMatch(/CONTEXT\.md/);
    expect(content).toMatch(/NON-NEGOTIABLE|locked decisions/i);
  });

  test('has self-check protocol', () => {
    expect(content).toMatch(/self-check/i);
  });

  test('completion markers include PLANNING COMPLETE and PLANNING FAILED', () => {
    expect(content).toMatch(/## PLANNING COMPLETE/);
    expect(content).toMatch(/## PLANNING FAILED/);
  });
});

// ---------------------------------------------------------------------------
// 5. Plan-checker-specific tests
// ---------------------------------------------------------------------------

describe('Plan-checker agent patterns', () => {
  const content = readAgent('plan-checker.md');

  test('has <critical_rules>', () => {
    expect(content).toMatch(/<critical_rules>/);
    expect(content).toMatch(/<\/critical_rules>/);
  });

  test('has severity level definitions (BLOCKER, WARNING, INFO)', () => {
    expect(content).toMatch(/BLOCKER/);
    expect(content).toMatch(/WARNING/);
    expect(content).toMatch(/INFO/);
  });

  test('has 10 evaluation dimensions', () => {
    // Plan checker evaluates across dimensions D1-D10
    expect(content).toMatch(/D1/);
    expect(content).toMatch(/D10/);
  });

  test('completion markers include CHECK PASSED and ISSUES FOUND', () => {
    expect(content).toMatch(/## CHECK PASSED/);
    expect(content).toMatch(/## ISSUES FOUND/);
  });
});

// ---------------------------------------------------------------------------
// 6. Debugger-specific tests
// ---------------------------------------------------------------------------

describe('Debugger agent patterns', () => {
  const content = readAgent('debugger.md');

  test('has scientific method methodology', () => {
    expect(content).toMatch(/scientific method/i);
    expect(content).toMatch(/hypothes/i);
  });

  test('has operating modes (interactive and non-interactive)', () => {
    expect(content).toMatch(/Operating Mode/i);
    expect(content).toMatch(/interactive/i);
  });

  test('has debug file protocol with structured sections', () => {
    expect(content).toMatch(/Debug File Protocol/i);
    // Symptoms are immutable after gathering
    expect(content).toMatch(/IMMUTABLE/);
  });

  test('has append-only evidence log', () => {
    expect(content).toMatch(/append-only/i);
    expect(content).toMatch(/Evidence Log/i);
  });

  test('has checkpoint protocol for human interaction', () => {
    expect(content).toMatch(/checkpoint/i);
    expect(content).toMatch(/HUMAN-VERIFY/);
  });

  test('completion markers include DEBUG COMPLETE, ROOT CAUSE FOUND, and PAUSED', () => {
    expect(content).toMatch(/## DEBUG COMPLETE/);
    expect(content).toMatch(/## ROOT CAUSE FOUND/);
    expect(content).toMatch(/## DEBUG SESSION PAUSED/);
  });
});

// ---------------------------------------------------------------------------
// 7. Researcher-specific tests
// ---------------------------------------------------------------------------

describe('Researcher agent patterns', () => {
  const content = readAgent('researcher.md');

  test('has 3 operating modes (project, phase, synthesis)', () => {
    expect(content).toMatch(/Mode 1.*Project/i);
    expect(content).toMatch(/Mode 2.*Phase/i);
    expect(content).toMatch(/Mode 3.*Synthesis/i);
  });

  test('has source hierarchy methodology', () => {
    expect(content).toMatch(/Source Hierarchy/i);
  });

  test('has confidence levels', () => {
    expect(content).toMatch(/Confidence Level/i);
  });

  test('has multi-step research process', () => {
    expect(content).toMatch(/Step 1.*Understand/i);
    expect(content).toMatch(/Step 2.*Constraint/i);
    expect(content).toMatch(/Step 3.*Research/i);
    expect(content).toMatch(/Step 4.*Synthesize/i);
    expect(content).toMatch(/Step 5.*Quality/i);
  });

  test('completion markers include RESEARCH COMPLETE and RESEARCH BLOCKED', () => {
    expect(content).toMatch(/## RESEARCH COMPLETE/);
    expect(content).toMatch(/## RESEARCH BLOCKED/);
  });
});

// ---------------------------------------------------------------------------
// 8. Synthesizer-specific tests
// ---------------------------------------------------------------------------

describe('Synthesizer agent patterns', () => {
  const content = readAgent('synthesizer.md');

  test('has findings matrix step', () => {
    expect(content).toMatch(/Findings Matrix/i);
  });

  test('has contradiction resolution step', () => {
    expect(content).toMatch(/Resolve Contradictions/i);
  });

  test('has required output sections (Resolved Decisions, Open Questions, Deferred Ideas)', () => {
    expect(content).toMatch(/Resolved Decisions/);
    expect(content).toMatch(/Open Questions/);
    expect(content).toMatch(/Deferred Ideas/);
  });

  test('has RESEARCH GAP flagging', () => {
    expect(content).toMatch(/RESEARCH GAP/);
  });

  test('completion markers include SYNTHESIS COMPLETE and SYNTHESIS BLOCKED', () => {
    expect(content).toMatch(/## SYNTHESIS COMPLETE/);
    expect(content).toMatch(/## SYNTHESIS BLOCKED/);
  });
});

// ---------------------------------------------------------------------------
// 9. Codebase-mapper-specific tests
// ---------------------------------------------------------------------------

describe('Codebase-mapper agent patterns', () => {
  const content = readAgent('codebase-mapper.md');

  test('has 4 focus areas (tech, arch, quality, concerns)', () => {
    expect(content).toMatch(/\btech\b/);
    expect(content).toMatch(/\barch\b/);
    expect(content).toMatch(/\bquality\b/);
    expect(content).toMatch(/\bconcerns\b/);
  });

  test('has forbidden files list', () => {
    expect(content).toMatch(/Forbidden Files/i);
  });

  test('has <critical_rules>', () => {
    expect(content).toMatch(/<critical_rules>/);
    expect(content).toMatch(/<\/critical_rules>/);
  });

  test('references codebase templates', () => {
    expect(content).toMatch(/templates\/codebase\//);
  });

  test('completion markers include MAPPING COMPLETE and MAPPING FAILED', () => {
    expect(content).toMatch(/## MAPPING COMPLETE/);
    expect(content).toMatch(/## MAPPING FAILED/);
  });
});

// ---------------------------------------------------------------------------
// 10. Integration-checker-specific tests
// ---------------------------------------------------------------------------

describe('Integration-checker agent patterns', () => {
  const content = readAgent('integration-checker.md');

  test('completion markers include INTEGRATION CHECK COMPLETE', () => {
    expect(content).toMatch(/## INTEGRATION CHECK COMPLETE/);
  });

  test('defines scope distinction from verifier', () => {
    expect(content).toMatch(/Integration-Checker vs Verifier/i);
  });
});

// ---------------------------------------------------------------------------
// 11. Audit-specific tests
// ---------------------------------------------------------------------------

describe('Audit agent patterns', () => {
  const content = readAgent('audit.md');

  test('has compliance audit checklist', () => {
    expect(content).toMatch(/Compliance Audit Checklist/i);
    expect(content).toMatch(/STATE\.md Lifecycle/i);
    expect(content).toMatch(/Commit Format/i);
    expect(content).toMatch(/Subagent Delegation/i);
  });

  test('has UX audit checklist', () => {
    expect(content).toMatch(/UX Audit Checklist/i);
    expect(content).toMatch(/User Intent/i);
    expect(content).toMatch(/Flow Choice/i);
  });

  test('documents JSONL format', () => {
    expect(content).toMatch(/JSONL Format/i);
  });

  test('has evidence-over-assumption principle', () => {
    expect(content).toMatch(/Evidence over assumption/i);
  });

  test('supports audit modes (compliance, ux, full)', () => {
    expect(content).toMatch(/compliance/);
    expect(content).toMatch(/\bux\b/i);
    expect(content).toMatch(/\bfull\b/);
  });

  test('completion markers include AUDIT COMPLETE', () => {
    expect(content).toMatch(/## AUDIT COMPLETE/);
  });
});

// ---------------------------------------------------------------------------
// 12. General agent-specific tests
// ---------------------------------------------------------------------------

describe('General agent patterns', () => {
  const content = readAgent('general.md');

  test('has self-escalation guidance', () => {
    expect(content).toMatch(/Self-Escalation/i);
  });

  test('has context budget with quality tiers', () => {
    expect(content).toMatch(/Context Budget/i);
    expect(content).toMatch(/Context Quality Tier/i);
  });

  test('documents commit format convention', () => {
    expect(content).toMatch(/Commit Format/i);
  });

  test('documents .planning directory structure', () => {
    expect(content).toMatch(/\.planning\//);
  });

  test('completion markers include TASK COMPLETE and TASK FAILED', () => {
    expect(content).toMatch(/## TASK COMPLETE/);
    expect(content).toMatch(/## TASK FAILED/);
  });
});

// ---------------------------------------------------------------------------
// 13. Pattern coverage summary test
// ---------------------------------------------------------------------------

describe('Pattern coverage', () => {
  const REQUIRED_PATTERNS = [
    '<files_to_read>',
    '<success_criteria>',
    '<anti_patterns>',
  ];

  test('all core agents have all universal XML patterns', () => {
    const missing = [];

    for (const file of coreAgents) {
      const content = readAgent(file);
      for (const pattern of REQUIRED_PATTERNS) {
        if (!content.includes(pattern)) {
          missing.push(`${file}: missing ${pattern}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  test('all core agents have matching closing tags for universal patterns', () => {
    const missing = [];

    for (const file of coreAgents) {
      const content = readAgent(file);
      for (const pattern of REQUIRED_PATTERNS) {
        const tagName = pattern.slice(1, -1); // strip < >
        if (!content.includes(`</${tagName}>`)) {
          missing.push(`${file}: missing </${tagName}>`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  test('every core agent defines at least one completion marker', () => {
    const missing = [];
    const markerPattern = /## [A-Z][A-Z ]*(?:COMPLETE|FAILED|PASSED|FOUND|BLOCKED)/;

    for (const file of coreAgents) {
      const content = readAgent(file);
      if (!markerPattern.test(content)) {
        missing.push(file);
      }
    }

    expect(missing).toEqual([]);
  });

  test('every core agent has at least 2 success criteria checkboxes', () => {
    const insufficient = [];

    for (const file of coreAgents) {
      const content = readAgent(file);
      const checkboxCount = (content.match(/- \[ \]/g) || []).length;
      if (checkboxCount < 2) {
        insufficient.push(`${file}: only ${checkboxCount} checkboxes`);
      }
    }

    expect(insufficient).toEqual([]);
  });

  test('no core agent has unclosed XML-style custom tags', () => {
    const problems = [];
    const customTags = [
      'files_to_read', 'success_criteria', 'anti_patterns',
      'deviation_rules', 'circuit_breaker', 'scope_boundary',
      'self_check_protocol', 'stub_detection_patterns', 'critical_rules',
      'spot_check_protocol',
    ];

    for (const file of coreAgents) {
      const content = readAgent(file);
      for (const tag of customTags) {
        const hasOpen = content.includes(`<${tag}>`);
        const hasClose = content.includes(`</${tag}>`);
        if (hasOpen && !hasClose) {
          problems.push(`${file}: <${tag}> opened but never closed`);
        }
        if (!hasOpen && hasClose) {
          problems.push(`${file}: </${tag}> found but never opened`);
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
