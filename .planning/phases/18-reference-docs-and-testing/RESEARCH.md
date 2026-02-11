# Phase Research: Reference Docs & Testing

> Research conducted: 2026-02-10
> Research date: 2026-02-10T19:30:00.000Z
> Mode: phase-research
> Phase: 18-reference-docs-and-testing
> Confidence: HIGH

## User Constraints

None found in CONTEXT.md. The Towline project has locked technology decisions for the Dashboard test project (Express 5.x, HTMX, Pico.css, etc.), but those do not constrain this phase, which is about updating Towline's own documentation and testing.

## Phase Goal

Update reference docs, add tests for AskUserQuestion patterns, ensure cross-cutting consistency across all 20 Towline skills after Phases 15-17 converted 12 skills to use AskUserQuestion.

## Implementation Approach

### Recommended Approach

This phase requires documentation updates to reflect the AskUserQuestion pattern and test coverage to prevent regressions. The work breaks into 4 main tasks:

**Steps**:

1. **Update `references/towline-rules.md`** [S0]
   - Current state: 180 lines, condensed rules extracted from DEVELOPMENT-GUIDE.md
   - AskUserQuestion is NOT mentioned at all currently
   - Add new section "User Interaction Patterns" covering:
     - When to use AskUserQuestion vs plain prompts
     - Max 4 options constraint
     - Pattern reuse from `skills/shared/gate-prompts.md`
     - Freeform text exceptions (symptom gathering, Socratic discussion)
   - Insert between "Agent Spawning" (#24-27) and "Skill Authoring" (#28-33)

2. **Update `references/ui-formatting.md`** [S0]
   - Current state: 321 lines, comprehensive UI brand guide
   - AskUserQuestion is NOT mentioned
   - Add new section "AskUserQuestion UI Patterns" covering:
     - Visual structure of structured prompts
     - Header max 12 characters rule
     - Option formatting examples
     - Error handling patterns ("Other" case)
   - Insert after "Checkpoint Boxes" (#114-134) and before "Next Up Block" (#136-159)

3. **Update `references/DEVELOPMENT-GUIDE.md`** [S0]
   - Current state: 3,114 lines, comprehensive development guide
   - AskUserQuestion is NOT mentioned (0 occurrences via grep)
   - Add subsection to "Skill Authoring Patterns" covering:
     - AskUserQuestion usage conventions
     - Pattern catalog in `skills/shared/gate-prompts.md`
     - When NOT to use it (freeform text cases)
     - Code examples from converted skills
   - Insert after line 100 (in "Part 1: Towline Workflow Documentation")

4. **Add test coverage for AskUserQuestion pattern validation** [S0]
   - Current test infrastructure: 31 test files using Jest
   - Coverage targets: 65% statements, 58% branches, 70% functions, 65% lines
   - Create `tests/gate-prompts-validation.test.js`:
     - Validate all 21 patterns in `gate-prompts.md` have required fields
     - Validate header max 12 characters
     - Validate multiSelect: false in all patterns
     - Validate 2-4 options per pattern
     - Validate pattern references in skills match actual pattern names
   - Create `tests/skill-askuserquestion-audit.test.js`:
     - Scan all 20 SKILL.md files for plain-text gate patterns
     - Flag any "Type approved", "Type continue", "Ask:" patterns
     - Validate skills with AskUserQuestion in allowed-tools actually use it
     - Validate skills referencing gate-prompts.md patterns exist

### Configuration Details

No configuration changes required. Tests will use existing Jest setup:

```javascript
// package.json already has:
{
  "scripts": {
    "test": "jest"
  },
  "jest": {
    "coverageThreshold": {
      "global": {
        "statements": 65,
        "branches": 58,
        "functions": 70,
        "lines": 65
      }
    }
  }
}
```

### API Patterns

AskUserQuestion tool signature (from Claude Code documentation [S2]):

```javascript
// Tool call structure
{
  question: "string",        // The question to ask
  header: "string",          // Max 12 characters
  options: [                 // 2-4 options
    {
      label: "string",       // The option text
      description: "string"  // Help text for option
    }
  ],
  multiSelect: false         // Always false for Towline gates
}

// Response handling
// - User selects an option label → skill matches against label
// - User types freeform text → skill handles "Other" case
// - Timeout: 60 seconds [S2]
// - Limitation: Cannot be used from subagents [S2]
```

### Data Models

Gate pattern structure (from `skills/shared/gate-prompts.md` [S0]):

```yaml
Pattern Name: pattern-slug
Purpose: One-line description
Options: 2-4 options
Used by: skill1, skill2, skill3
Structure:
  question: {dynamic template}
  header: {max 12 chars}
  options:
    - label: "Option 1"     description: "What this does"
    - label: "Option 2"     description: "What this does"
  multiSelect: false
```

Currently defined patterns [S0]:
1. approve-revise-abort (3 options)
2. yes-no (2 options)
3. stale-continue (2 options)
4. yes-no-pick (3 options)
5. multi-option-failure (4 options)
6. multi-option-escalation (4 options)
7. multi-option-gaps (4 options)
8. multi-option-priority (4 options)
9. settings-category-select (4 options)
10. toggle-confirm (2 options)
11. model-profile-select (4 options)
12. action-routing (up to 4 options, dynamic)
13. pause-point-select (up to 4 options, dynamic)
14. scope-confirm (3 options)
15. depth-select (3 options)
16. git-strategy-select (3 options)
17. context-handling (3 options)
18. gray-area-option (up to 4 options, dynamic)
19. output-routing (4 options)
20. debug-session-select (up to 4 options, dynamic)
21. debug-checkpoint (3 options)

## Dependencies

No new dependencies required. All work uses existing infrastructure:

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| jest | ^29.0.0 | Test runner | New test files |
| gray-matter | existing | Parse gate-prompts.md frontmatter | Test validation |
| fs/promises | Node built-in | Read skill files in tests | Test validation |

## Current State Analysis

### Skills with AskUserQuestion in allowed-tools [S0]

From grep results, 17 of 20 skills mention AskUserQuestion:

**Has AskUserQuestion:**
1. begin
2. build
3. config
4. debug
5. discuss
6. explore
7. import
8. milestone
9. note (mentions but doesn't use it — false positive)
10. plan
11. quick
12. resume
13. review
14. scan
15. setup
16. status
17. todo (mentions but doesn't use it — false positive)

**Does NOT have AskUserQuestion:**
1. continue (intentional — "no prompts, no decisions")
2. health (read-only diagnostic)
3. help (read-only reference)
4. pause (no interaction needed)

This matches expectations. The 4 skills without AskUserQuestion are correctly designed to not require user interaction.

### Remaining Plain-Text Patterns [S0]

Grep for `Type.*approved|Ask:|Type approved` found only 2 instances:

1. **`plan/SKILL.md:308`**: "Ask: 'These issues remain after 3 revision attempts. Proceed anyway, or do you want to adjust the approach?'"
   - This is freeform revision discussion, NOT a gate check
   - Correctly uses plain prompt per design (Socratic follow-up)
   - No action needed

2. **`discuss/SKILL.md:269`**: "Ask: 'What would you prefer instead?' — this is freeform text, do NOT use AskUserQuestion."
   - Explicitly marked as freeform
   - Correctly designed
   - No action needed

**Conclusion**: No missed conversion opportunities. All gate checks have been converted to AskUserQuestion. Remaining plain prompts are intentional freeform text interactions.

### Reference Document Current State [S0]

| Document | Current State | AskUserQuestion Mentioned? |
|----------|---------------|---------------------------|
| `references/towline-rules.md` | 180 lines, 83 rules | No (0 occurrences) |
| `references/ui-formatting.md` | 321 lines, 11 sections | No (0 occurrences) |
| `references/DEVELOPMENT-GUIDE.md` | 3,114 lines, comprehensive | No (0 occurrences) |

All three reference documents predate the AskUserQuestion adoption (Phases 15-17 completed 2026-02-10). They need updates to reflect the new pattern.

### Test Infrastructure [S0]

Current test coverage:
- 31 test files in `tests/` directory
- Jest configuration with coverage thresholds
- Existing pattern: `{script-name}.test.js` mirrors `scripts/{script-name}.js`
- Hook tests use stdin/stdout protocol with `execSync()`
- Coverage: 65% statements, 58% branches, 70% functions, 65% lines

No existing tests validate:
- Gate prompt pattern structure
- AskUserQuestion usage consistency across skills
- Pattern reference integrity

## Pitfalls for This Phase

### 1. Documentation Drift [HIGH RISK]
**Issue**: gate-prompts.md is the source of truth, but skills may evolve independently
**Mitigation**: Add test that validates all pattern references in skills match actual patterns in gate-prompts.md

### 2. Pattern Name Conflicts [MEDIUM RISK]
**Issue**: 21 patterns with similar names (yes-no vs yes-no-pick)
**Mitigation**: Test validates pattern names are unique and referenced correctly

### 3. Test Maintenance [MEDIUM RISK]
**Issue**: Gate patterns will evolve as skills are added/modified
**Mitigation**: Tests should be data-driven, reading gate-prompts.md dynamically rather than hardcoding pattern names

### 4. False Positives in Skill Scanning [LOW RISK]
**Issue**: Skills may mention "AskUserQuestion" in comments/examples without using it (note, todo skills)
**Mitigation**: Parse allowed-tools frontmatter, don't just grep for the string

### 5. Async Hook Tests [LOW RISK - KNOWN PATTERN]
**Issue**: Gate-prompts.md is not a hook script, so test pattern differs from existing hook tests
**Mitigation**: Use direct file reading pattern from `check-plan-format.test.js` as reference [S0]

## Testing Strategy

### Test File 1: `gate-prompts-validation.test.js`

Validates the structural integrity of `skills/shared/gate-prompts.md`:

```javascript
describe('gate-prompts.md validation', () => {
  test('all patterns have required fields', () => {
    // Read gate-prompts.md
    // Extract each ## Pattern: section
    // Validate structure: question template, header max 12 chars, 2-4 options, multiSelect: false
  });

  test('pattern names are unique', () => {
    // Extract all pattern names
    // Check for duplicates
  });

  test('headers are max 12 characters', () => {
    // Extract all header values from examples
    // Validate length <= 12
  });

  test('all patterns have 2-4 options', () => {
    // Extract option counts from examples
    // Validate range
  });

  test('all patterns have multiSelect: false', () => {
    // Validate consistency
  });
});
```

### Test File 2: `skill-askuserquestion-audit.test.js`

Validates consistency across skills:

```javascript
describe('AskUserQuestion skill audit', () => {
  test('skills with AskUserQuestion in allowed-tools use it', () => {
    // Read all SKILL.md files
    // Parse frontmatter for allowed-tools
    // If AskUserQuestion present, validate at least one pattern reference exists
  });

  test('no plain-text gate checks remain', () => {
    // Grep for "Type approved", "Type continue"
    // Expect only the 2 known freeform cases
  });

  test('pattern references match actual patterns', () => {
    // Extract pattern names from gate-prompts.md
    // Scan all skills for pattern references
    // Validate all references exist
  });

  test('skills without AskUserQuestion are intentional', () => {
    // List: continue, health, help, pause
    // Validate these are the only 4 skills without AskUserQuestion
  });
});
```

## Phases 15-17 Summary [S0]

Phases 15-17 converted 12 skills to AskUserQuestion:

**Phase 15** (5 skills):
- import: seed selection, SKILL.md gate
- scan: SKILL.md gate
- build: re-planning, rebuild, failure handling, commit confirmation
- milestone: gap priority selection
- review: gap handling, escalation, override

**Phase 16** (4 skills):
- config: category selection, toggle confirmations, model profile selection
- status: action routing
- resume: pause-point selection, action routing
- quick: scope confirmation

**Phase 17** (4 skills):
- begin: depth selection, git strategy, workflow preferences
- discuss: gray area options, context handling, overwrite confirmation
- explore: output routing, proposal adjustments
- debug: session selection, checkpoint continuations

**Remaining 8 skills**:
- continue: intentionally no interaction
- health: read-only diagnostics
- help: read-only reference
- note: append-only capture (no AskUserQuestion despite mention in allowed-tools)
- pause: write state, no interaction
- plan: uses plain prompts for revision discussion (freeform, not gates)
- setup: uses AskUserQuestion (wizard flow)
- todo: uses plain prompts (no AskUserQuestion despite mention in allowed-tools)

**Note on false positives**: `note` and `todo` skills list AskUserQuestion in allowed-tools but don't currently use it. This is acceptable — allowed-tools lists capabilities, not requirements. Future enhancements may add interactive flows.

## Open Questions

1. **Should note and todo skills use AskUserQuestion?**
   - note: Could add "promote to todo?" confirmation
   - todo: Could add "similar todo exists, add anyway?" deduplication
   - Not required for Phase 18, but worth flagging for future enhancement

2. **Should DEVELOPMENT-GUIDE.md document the evolution history?**
   - Phases 15-17 were significant architectural changes
   - Including a "Pattern Evolution" section would help contributors understand why AskUserQuestion exists
   - Recommend: Add brief history note in the AskUserQuestion documentation section

3. **Test coverage targets — should they increase?**
   - Current: 65% statements, 58% branches
   - New tests will add coverage for skill patterns
   - Consider raising thresholds after Phase 18 if coverage improves significantly

## Sources

| # | Type | URL/Description | Confidence |
|---|------|----------------|------------|
| S0 | Local Prior Research | Existing Towline codebase files analyzed in this session | HIGHEST |
| S2 | Official Documentation | [Claude Code AskUserQuestion Tool Guide](https://www.atcyrus.com/stories/claude-code-ask-user-question-tool-guide) | HIGH |
| S2 | Official Documentation | [Handle approvals and user input - Claude API Docs](https://platform.claude.com/docs/en/agent-sdk/user-input) | HIGH |
| S2 | GitHub Source | [Claude Code System Prompts - AskUserQuestion](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/tool-description-askuserquestion.md) | HIGH |

---

## Recommended Task Breakdown

### Task 1: Update towline-rules.md
- Add section "User Interaction Patterns" (rules #84-92)
- 9 new rules covering AskUserQuestion usage
- Insert between "Agent Spawning" and "Skill Authoring"

### Task 2: Update ui-formatting.md
- Add section "AskUserQuestion UI Patterns"
- Include examples from converted skills
- Insert after "Checkpoint Boxes"

### Task 3: Update DEVELOPMENT-GUIDE.md
- Add subsection to "Skill Authoring Patterns"
- Document pattern catalog reference
- Include code examples from phases 15-17

### Task 4: Add gate-prompts-validation.test.js
- 5 test suites validating pattern structure
- Use gray-matter to parse gate-prompts.md
- Data-driven tests for maintainability

### Task 5: Add skill-askuserquestion-audit.test.js
- 4 test suites validating skill consistency
- Scan all 20 SKILL.md files
- Cross-reference with gate-prompts.md patterns

### Task 6: Run full test suite and validate coverage
- `npm test` should pass all existing + new tests
- Coverage should remain >= current thresholds
- Update coverage thresholds if appropriate
