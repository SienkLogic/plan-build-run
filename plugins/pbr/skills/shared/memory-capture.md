## Memory Capture (Post-Agent)

After any agent that supports memory suggestions completes, check the agent's Task() output for `<memory_suggestion>` blocks.

**Supported agents:** executor, planner, researcher, debugger.

### Parsing Protocol

1. Scan the agent's returned output text for `<memory_suggestion type="...">` blocks
2. For each block found, extract:
   - `type` attribute: one of `user`, `feedback`, `project`, `reference`
   - `description:` line (first line of content) -- a one-line summary
   - Remaining content after the description line -- the memory body
3. If **0 suggestions** found: skip silently, proceed with normal flow
4. If **1-2 suggestions** found: save each immediately (see Saving below)
5. If **3+ suggestions** found: display them to the user and ask via AskUserQuestion which to save (the agent may be over-suggesting)

### Saving

For each suggestion to save:

1. Generate a slug from the description (first 4 words, lowercase, hyphenated)
2. Determine the target directory:
   - `project` or `reference` type -> `.planning/memory/{slug}.md` (project-scoped, survives with .planning/)
   - `user` or `feedback` type -> use the Write tool to save to the auto-memory directory
3. Write the file with standard frontmatter:

       ---
       name: {slug}
       description: "{description from the suggestion}"
       type: {type from the suggestion}
       ---

       {memory content body}

4. Update MEMORY.md index if saving to auto-memory directory

### When to Skip

- If the agent failed (PLAN FAILED, DEBUG FAILED, etc.) -- do not process suggestions from failed runs
- If the suggestion content is clearly ephemeral (mentions "this task", "current file", etc.) -- skip it
- If a memory with very similar content already exists -- skip to avoid duplicates

### Anti-Patterns

- DO NOT save every suggestion blindly -- quality over quantity
- DO NOT save task-specific details as memory -- only reusable knowledge
- DO NOT block the workflow waiting for memory saves -- this is a post-completion step
