# Phase Research: Extract & Deduplicate

> Research conducted: 2026-02-09
> Research date: 2026-02-09T00:00:00Z
> Mode: phase-research
> Phase: 13-extract-and-deduplicate
> Confidence: HIGH
> Sources consulted: 15

## User Constraints

No CONTEXT.md found for this phase. Project-level CONTEXT.md exists with locked decisions about technology stack (Node.js 24 LTS, Express 5.x, HTMX + Alpine.js, etc.) but these do not constrain this refactoring phase.

## Phase Goal

Mechanically extract ~1,900 lines of inline templates and prompt templates from SKILL.md files and agent definitions into external files, updating all references to lazy-load via Read. This is a plugin refactoring milestone focused on Plugin Context Optimization.

## Implementation Approach

### Recommended Approach

Extract inline content blocks to external template files organized by skill/agent, then update references to use file paths that can be lazy-loaded via the Read tool. [S0]

**Steps**:

1. **Identify extraction targets** [S0] - Read each SKILL.md and agent definition, identify blocks marked for extraction (typically multi-line template blocks within code fences or instructional sections)

2. **Create template directory structure** [S0]:
   - `skills/{skill-name}/templates/` for skill-specific templates
   - `templates/codebase/` for shared templates used by both scan skill and codebase-mapper agent

3. **Extract and write templates** [S0] - For each identified block:
   - Write to appropriate `.md.tmpl` file (markdown templates) or `.md` file (format specifications)
   - Preserve exact formatting and placeholder syntax
   - Add header comment indicating source and purpose

4. **Update references** [S0] - Replace inline content with instructions to read the external file:
   - Pattern: "Read `{path}` and use it as {purpose}"
   - For agent definitions: verify agents can reference external files (see Research Question 4)

5. **Deduplicate shared templates** [S0] - For overlapping content between scan skill and codebase-mapper agent:
   - Move to `templates/codebase/`
   - Update both skill and agent to reference shared location

6. **Test reference loading** [S0] - Verify no tests break from the extraction

**Key decisions**:

- **File extension**: Use `.md.tmpl` for templates with placeholders (e.g., `{project_name}`), `.md` for format specifications with example content [S0]
- **Reference pattern**: Follow existing pattern from `skills/build/continuation-format.md` - descriptive instruction followed by file path [S0]
- **Deduplication strategy**: Identify identical templates first, then similar templates that can be unified with minimal changes [S0]

### Extraction Targets by File

Based on analysis of the codebase [S0]:

#### plan/SKILL.md (617 lines total, ~300 to extract)

**Lines 178-206** → `skills/plan/templates/researcher-prompt.md`:
```
Phase Research Prompt Template (29 lines)
Includes: phase_context, project_context, research_questions blocks
```

**Lines 251-319** → `skills/plan/templates/planner-prompt.md`:
```
Planning Prompt Template (69 lines)
Includes: phase_context, project_context, prior_work, research, config, planning_instructions blocks
```

**Lines 343-367** → `skills/plan/templates/checker-prompt.md`:
```
Checker Prompt Template (25 lines)
Includes: plans_to_check, phase_context, context blocks
```

**Lines 386-401** → `skills/plan/templates/revision-prompt.md`:
```
Revision Mode Prompt Template (16 lines)
Includes: original_plans, checker_feedback, revision_instructions blocks
```

**Lines 530-556** → `skills/plan/templates/gap-closure-prompt.md`:
```
Gap Closure Prompt Template (27 lines)
Includes: verification_report, root_cause_analysis, existing_plans, project_context, gap_closure_instructions blocks
```

#### scan/SKILL.md (609 lines total, ~225 to extract)

Templates appear in agent spawn prompts (lines 122-196, 201-277, 280-377, 380-459). These are duplicates of content in the agent definition. **Strategy**: Keep prompts lean by referencing agent definition sections, extract shared document templates to `templates/codebase/`.

**Shared templates to extract** (currently in both scan/SKILL.md and agents/towline-codebase-mapper.md):
- STACK.md format → `templates/codebase/STACK.md.tmpl`
- INTEGRATIONS.md format → `templates/codebase/INTEGRATIONS.md.tmpl`
- ARCHITECTURE.md format → `templates/codebase/ARCHITECTURE.md.tmpl`
- STRUCTURE.md format → `templates/codebase/STRUCTURE.md.tmpl`
- CONVENTIONS.md format → `templates/codebase/CONVENTIONS.md.tmpl`
- TESTING.md format → `templates/codebase/TESTING.md.tmpl`
- CONCERNS.md format → `templates/codebase/CONCERNS.md.tmpl`

#### review/SKILL.md (591 lines total, ~210 to extract)

**Lines 86-196** → `skills/review/templates/verifier-prompt.md`:
```
Verifier Prompt Template (111 lines)
Includes: verification_methodology, phase_plans, build_results, instructions with full report format
```

**Lines 327-372** → `skills/review/templates/debugger-prompt.md`:
```
Debugger Prompt Template (46 lines)
Includes: verification_report, build_summaries, plans, instructions for root cause analysis
```

**Lines 386-420** → `skills/review/templates/gap-planner-prompt.md`:
```
Gap Planner Prompt Template (35 lines)
Includes: verification_report, root_cause_analysis, existing_plans, project_context, gap_closure_instructions blocks
```

#### begin/SKILL.md (516 lines total, ~175 to extract)

**Lines 179-206** → `skills/begin/templates/researcher-prompt.md`:
```
Researcher Prompt Template (28 lines)
Includes: project_context, research_assignment blocks with topic-specific questions
```

**Lines 254-270** → `skills/begin/templates/synthesis-prompt.md`:
```
Synthesis Prompt Template (17 lines)
Includes: research_documents, synthesis_instructions blocks
```

**Lines 329-361** → `skills/begin/templates/roadmap-prompt.md`:
```
Roadmap Prompt Template (33 lines)
Includes: project_context, roadmap_instructions blocks
```

**Existing templates** (already extracted, verify format):
- `skills/begin/templates/config.json.tmpl` ✓
- `skills/begin/templates/PROJECT.md.tmpl` ✓
- `skills/begin/templates/REQUIREMENTS.md.tmpl` ✓
- `skills/begin/templates/ROADMAP.md.tmpl` ✓
- `skills/begin/templates/STATE.md.tmpl` ✓

#### discuss/SKILL.md (332 lines total, ~115 to extract)

**Lines 170-218** → `skills/discuss/templates/CONTEXT.md.tmpl`:
```
Phase CONTEXT.md Template (49 lines)
Full template with sections: Decisions (LOCKED), Deferred Ideas (EXCLUDED), Claude's Discretion (OPEN), User's Vision Summary, User's Concerns
```

**Lines 95-103** → `skills/discuss/templates/decision-categories.md`:
```
Decision Categories Reference (9 lines)
Table of gray area categories: UI/UX choices, Architecture decisions, Edge case behavior, Technology selections, Feature scope boundaries
```

#### agents/towline-codebase-mapper.md (894 lines total)

Contains 8 document format templates (lines 112-192 STACK.md, lines 194-289 INTEGRATIONS.md, lines 291-385 ARCHITECTURE.md, lines 387-448 STRUCTURE.md, lines 450-540 CONVENTIONS.md, lines 542-624 TESTING.md, lines 626-722 CONCERNS.md, lines 724-814 README.md).

**Strategy**: Extract to `templates/codebase/*.md.tmpl` and update both the agent definition and scan/SKILL.md to reference these shared templates.

### Configuration Details

No configuration changes needed. Template extraction is a mechanical refactoring. [S0]

### Reference Update Pattern

**Current pattern** (inline):
```markdown
#### Planning Prompt Template

```
You are the towline-planner agent operating in Standard Planning mode.

<phase_context>
Phase: {NN} - {phase name}
...
</phase_context>
```
```

**New pattern** (external reference):
```markdown
#### Planning Prompt Template

Read `skills/plan/templates/planner-prompt.md` and use it as the prompt template for spawning the planner agent. Fill in the placeholders with phase-specific context:
- `{NN}` - phase number
- `{phase name}` - phase name from roadmap
- `{goal from roadmap}` - phase goal
(etc.)
```

This matches the established pattern from `skills/build/continuation-format.md` [S0].

### Agent External References

**Can agents reference external files?** YES [S0]

Evidence from `agents/towline-codebase-mapper.md` lines 1-11:
```yaml
---
name: towline-codebase-mapper
description: "Explores existing codebases and writes structured analysis documents..."
model: sonnet
memory: project
tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Write
---
```

Agents have access to the Read tool. Agent definitions can include instructions like:
```markdown
Read the document template from `templates/codebase/STACK.md.tmpl` and use it as the format for your output.
```

The agent will execute this instruction during invocation. [S0]

**Verification**: Check that subagent spawns with `subagent_type` correctly load the agent definition AND allow agents to read external files during execution. Based on grep results showing `subagent_type: "dev:towline-researcher"` pattern throughout skills, this is the standard approach. [S0]

### Deduplication Strategy

**Overlapping templates between scan/SKILL.md and agents/towline-codebase-mapper.md**:

1. **STACK.md format** - Lines 149-175 (scan), lines 112-192 (agent)
   - **Status**: IDENTICAL format structure, different detail level
   - **Action**: Extract agent's version (more detailed) to `templates/codebase/STACK.md.tmpl`

2. **INTEGRATIONS.md format** - Lines 176-196 (scan), lines 194-289 (agent)
   - **Status**: IDENTICAL format structure, different detail level
   - **Action**: Extract agent's version to `templates/codebase/INTEGRATIONS.md.tmpl`

3. **ARCHITECTURE.md format** - Lines 230-255 (scan), lines 291-385 (agent)
   - **Status**: IDENTICAL format structure
   - **Action**: Extract agent's version to `templates/codebase/ARCHITECTURE.md.tmpl`

4. **STRUCTURE.md format** - Lines 256-277 (scan), lines 387-448 (agent)
   - **Status**: IDENTICAL format structure
   - **Action**: Extract agent's version to `templates/codebase/STRUCTURE.md.tmpl`

5. **CONVENTIONS.md format** - Lines 315-346 (scan), lines 450-540 (agent)
   - **Status**: IDENTICAL format structure
   - **Action**: Extract agent's version to `templates/codebase/CONVENTIONS.md.tmpl`

6. **TESTING.md format** - Lines 347-375 (scan), lines 542-624 (agent)
   - **Status**: IDENTICAL format structure
   - **Action**: Extract agent's version to `templates/codebase/TESTING.md.tmpl`

7. **CONCERNS.md format** - Lines 429-459 (scan), lines 626-722 (agent)
   - **Status**: IDENTICAL format structure
   - **Action**: Extract agent's version to `templates/codebase/CONCERNS.md.tmpl`

**Deduplication saves**: ~350 lines from scan/SKILL.md + ~680 lines from agent definition = **~1,030 lines** converted to ~7 shared template files.

**Update strategy**:
1. Extract agent's version (more detailed) to `templates/codebase/`
2. Update scan/SKILL.md agent spawn prompts: "Read `templates/codebase/STACK.md.tmpl` for the output format"
3. Update agent definition: "Read the document template from `templates/codebase/STACK.md.tmpl` and use it as the format"

## Dependencies

| Dependency | Version | Purpose | Required By |
|-----------|---------|---------|-------------|
| Node.js | 24 LTS | Plugin runtime | Towline plugin |
| Read tool | - | Load external template files | All skills, agents |

No new dependencies needed. [S0]

## Pitfalls for This Phase

1. **Breaking reference paths** [S0]: If a template file is moved/renamed after extraction, skills will fail to find it
   - **Mitigation**: Use absolute paths relative to plugin root: `skills/plan/templates/planner-prompt.md`
   - **Verification**: Test each skill after extraction

2. **Placeholder syntax mismatch** [S0]: If extracting changes `{placeholder}` syntax accidentally
   - **Mitigation**: Preserve exact formatting during extraction, verify placeholders remain intact
   - **Verification**: Read extracted template and compare to original

3. **Agent definition limitations** [S0]: If agents cannot actually read external files during execution
   - **Evidence against**: Agents have Read tool in their tool list (codebase-mapper.md lines 6-11)
   - **Verification**: Test with a simple external reference first before full extraction

4. **Test dependencies on inline content** [S0]: If tests validate the exact inline template content
   - **Evidence**: Test files in `tests/` directory focus on plan format, roadmap sync, config, not inline templates
   - **Verification**: Run full test suite after extraction

5. **Duplication during merge** [S0]: If scan/SKILL.md and codebase-mapper.md templates diverge during editing
   - **Mitigation**: Extract templates first, then update both to reference shared location atomically
   - **Pattern**: Single source of truth in `templates/codebase/`

## Testing Strategy

How to verify this phase works correctly:

1. **Extraction accuracy** [S0]:
   - For each extracted template, compare original inline content to extracted file content
   - Verify placeholders (`{like_this}`) are preserved exactly
   - Verify no content was lost or modified

2. **Reference correctness** [S0]:
   - For each SKILL.md, verify updated reference points to correct file path
   - Verify instructions include clear guidance on how to use the template
   - Check file paths are absolute from plugin root, not relative

3. **Functional testing** [S0]:
   - Run `/dev:plan 1 --skip-research` on a test project
   - Verify planner is spawned with external template content loaded
   - Check plan files are created correctly
   - Run `/dev:scan` on a test codebase
   - Verify mapper agents generate output using external templates

4. **Test suite** [S0]:
   - Run `npm test` (if tests exist)
   - Verify no tests break from content extraction
   - Based on test file review: tests validate structure, not inline content

5. **Deduplication verification** [S0]:
   - For each shared template in `templates/codebase/`
   - Verify scan/SKILL.md references it
   - Verify codebase-mapper agent references it
   - Check no duplicate content remains in either file

## Open Questions

1. **Should prompt templates use .md or .md.tmpl extension?** [S0]
   - **Context**: `skills/begin/templates/` uses `.md.tmpl` for templates with placeholders
   - **Evidence**: config.json.tmpl, PROJECT.md.tmpl, REQUIREMENTS.md.tmpl, ROADMAP.md.tmpl, STATE.md.tmpl
   - **Recommendation**: Use `.md` for format specifications (like continuation-format.md, plan-format.md), `.md.tmpl` for prompt templates with placeholders
   - **Status**: Can be decided during planning

2. **Should we extract format specifications (like plan-format.md) in this phase?** [S0]
   - **Context**: `skills/plan/plan-format.md` and `skills/build/continuation-format.md` already exist as external files
   - **Scope**: Phase 13 focuses on inline templates in SKILL.md and agent definitions
   - **Recommendation**: No - format specifications are already extracted
   - **Status**: Out of scope for this phase

3. **Should template extraction include comment headers?** [S0]
   - **Example**: `<!-- Source: plan/SKILL.md lines 251-319 | Purpose: Planner agent spawn prompt -->`
   - **Pros**: Clear provenance, easier to trace back
   - **Cons**: Requires updating if line numbers change
   - **Recommendation**: Yes, add header without line numbers: `<!-- Source: plan/SKILL.md | Purpose: Planner agent spawn prompt template -->`
   - **Status**: Can be decided during planning

## Sources

| # | Type | Path | Confidence |
|---|------|------|------------|
| S0 | Local Prior Research | Plugin source code inspection | HIGHEST |
| - | Plugin skill files | D:\Repos\towline\plugins\dev\skills\*\SKILL.md | HIGH |
| - | Plugin agent files | D:\Repos\towline\plugins\dev\agents\*.md | HIGH |
| - | Existing templates | D:\Repos\towline\plugins\dev\skills\begin\templates\*.tmpl | HIGH |
| - | Format specs | D:\Repos\towline\plugins\dev\skills\build\continuation-format.md | HIGH |
| - | Test files | D:\Repos\towline\tests\*.test.js | HIGH |
| - | Project memory | C:\Users\dave\.claude\projects\D--Repos-towline\memory\MEMORY.md | HIGH |
