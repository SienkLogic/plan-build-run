# Context Loader Task Pattern

Standard pattern for spawning a lightweight Task() to build a project briefing before the main skill logic runs. Used by skills that need project context but want to keep the orchestrator lean.

> Referenced by: explore, scan, discuss skills (and any skill that needs a project briefing before interactive work)

---

## When to Use

Use this pattern when:
- The skill runs mostly inline (conversation, presentation) rather than delegating to agents
- The skill needs awareness of project state, decisions, and progress
- Reading all context files directly would consume too much orchestrator context

Do NOT use this pattern when:
- The skill already uses `pbr-tools.js state load` (build, plan, review, import)
- The skill reads only STATE.md lines 1-20 (continue, status, resume)
- The skill has no project dependency (note with `--global`)

---

## Pattern: Briefing Task

```
Task({
  prompt: "Read the following files and return a ~500 token briefing summarizing the project state, key decisions, and any context relevant to {skill_purpose}:
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/CONTEXT.md
    - Any .planning/phases/*/CONTEXT.md files
    - .planning/research/SUMMARY.md (if exists)
    - .planning/notes/*.md (if notes directory exists — read frontmatter for date/promoted status)
    - .planning/HISTORY.md (if exists — scan for decisions relevant to current work only, do NOT summarize all history)

  Return ONLY the briefing text. No preamble, no suggestions."
})
```

### Key Rules

1. **Only runs if `.planning/` directory exists.** Skills invoked on fresh projects with no planning directory skip this entirely.
2. **Budget: ~500 tokens.** The briefing must be concise. The subagent reads full files in its own context; the orchestrator receives only the summary.
3. **No suggestions.** The briefing reports state, it does not recommend actions. The skill logic decides what to do.
4. **Read-only.** The briefing task must not write any files.

### Using the Briefing

After the task completes:
- Use the briefing to inform conversation -- reference existing decisions, avoid re-litigating settled questions
- Connect new ideas or findings to existing project structure
- Identify relevant phases, requirements, or decisions without reading the source files yourself

---

## Variation: Topic-Scoped Briefing

When the skill has a specific topic (e.g., `/pbr:explore auth`), scope the briefing:

```
Task({
  prompt: "Read the following files and return a ~500 token briefing focused on {topic}:
    - .planning/STATE.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/CONTEXT.md
    - Any .planning/phases/*/CONTEXT.md files
    - .planning/HISTORY.md (if exists — scan for decisions relevant to '{topic}' only, do NOT summarize all history)

  Focus on: decisions, requirements, and phase goals related to '{topic}'.
  Return ONLY the briefing text. No preamble, no suggestions."
})
```

---

## Variation: Scan Reconnaissance

For `/pbr:scan`, the pattern adapts to codebase analysis rather than project state:

1. The orchestrator performs a quick inline scan (detect project type, scale, key directories)
2. Writes the results to `.planning/codebase/RECON.md`
3. Passes RECON.md content to the spawned analysis agents as baseline context

This is the same principle (build context before main work) but the source is the codebase rather than planning files.
