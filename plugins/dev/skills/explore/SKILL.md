---
name: explore
description: "Explore ideas, think through approaches, and route insights to the right artifacts."
allowed-tools: Read, Write, Glob, Grep, Task, AskUserQuestion
argument-hint: "[topic]"
---

# /dev:explore — Idea Exploration

You are running the **explore** skill. Your job is to help the user think through ideas that might become a todo, requirement, phase, decision, or nothing yet. This is Socratic conversation, not requirements gathering. No phase number is needed.

This skill runs **inline** (no Task delegation), with optional Task() spawns for context loading and mid-conversation research.

---

## Context Budget

This skill is mostly inline conversation, but may spawn researchers. Follow these rules:
- **Never** read agent definitions (agents/*.md) — subagent_type auto-loads them
- **Minimize** file reads — this is a thinking skill, not a code analysis skill
- **Delegate** deep research to a towline-researcher subagent if investigation exceeds 3-4 file reads

---

## How /dev:explore Differs from /dev:discuss

| | /dev:discuss | /dev:explore |
|---|---|---|
| Purpose | Make decisions for a phase | Discover what you actually want |
| Structure | Pre-computed gray areas with options | Open-ended Socratic conversation |
| Requires | Phase number | Nothing |
| Output | CONTEXT.md (locked decisions) | Routes to the right artifact |
| Feels like | Making decisions | Thinking with a partner |

---

## Invocation

- `/dev:explore` — Open-ended: "I have an idea"
- `/dev:explore auth` — Topic-specific exploration
- `/dev:explore "should we add caching?"` — Specific question

Parse `$ARGUMENTS` for an optional topic. If provided, use it to seed the opening question. If empty, start fully open-ended.

---

## Pre-Conversation Context Loader

**Only runs if `.planning/` directory exists.** Fresh explores with no project skip this entirely.

When a project exists, spawn a lightweight Task() to build a briefing:

```
Task({
  prompt: "Read the following files and return a ~500 token briefing summarizing the project state, key decisions, and any context relevant to exploring new ideas:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/CONTEXT.md
    - .planning/STATE.md
    - Any .planning/phases/*/CONTEXT.md files
    - .planning/research/SUMMARY.md (if exists)
    - .planning/NOTES.md (if exists)

  Return ONLY the briefing text. No preamble, no suggestions."
})
```

Use the briefing to inform your conversation — reference existing decisions, avoid re-litigating settled questions, and connect new ideas to the existing project structure.

---

## Conversation Design

The conversation is Socratic, not extractive. You are a thinking partner, not an interviewer.

### Principles

1. **Open with curiosity.** Start with "What are you thinking about?" or "What's on your mind?" — not "Please describe the feature you want."

2. **Follow their energy.** Dig into what excites or concerns them. If they light up about a technical approach, explore it. If they hesitate, probe why.

3. **Surface implications.** "If you go with X, that usually means Y and Z. Is that intentional?" Connect their idea to downstream consequences they may not see yet.

4. **Challenge with alternatives.** "You mentioned X, but have you considered Y?" Don't be adversarial — offer genuine alternatives that might fit better.

5. **Present trade-offs, not options.** "A gives you speed but locks you into a vendor. B is slower but keeps options open." Frame choices as trade-offs with real consequences, not a menu.

6. **Know when to research.** "I'm not sure about the best approach here. Want me to research it?" Don't fake knowledge — admit gaps and offer to investigate.

7. **Don't rush to outputs.** Explore until understanding is genuinely deep. The user will know when they're ready to wrap up.

### Domain-Aware Probing

Reference `skills/shared/domain-probes.md` for technology-specific follow-up questions. When the user mentions a domain (auth, caching, search, etc.), pick the 2-3 most relevant probes from that domain's table. Do NOT run through the table as a checklist.

### Conversation Starters by Invocation

| Invocation | Opening |
|---|---|
| `/dev:explore` | "What are you thinking about?" |
| `/dev:explore auth` | "What's your thinking on auth? Are you starting from scratch or rethinking something?" |
| `/dev:explore "should we add caching?"` | "Caching for what specifically? What's feeling slow or what do you expect to be slow?" |

---

## Mid-Conversation Research

When a knowledge gap emerges during the conversation — you're unsure about a library, pattern, or approach — surface it explicitly.

**Ask the user** using the **yes-no** pattern from `skills/shared/gate-prompts.md`:
  question: "I'm not sure about the best approach for {topic}. Research it now?"
  options:
    - label: "Research now"   description: "Spawn a researcher agent to investigate"
    - label: "Save for later" description: "Add as a research question for future investigation"

**If research now:**

```
Task({
  subagent_type: "dev:towline-researcher",
  prompt: "<research_assignment>
    Topic: {specific research question}
    Output file: .planning/research/{topic-slug}.md
    Mode: project-research

    Research this specific question: {the question}

    Write findings to the output file.
  </research_assignment>"
})
```

After the researcher completes:
- Read ONLY the frontmatter and summary section of the research file (not the full document)
- Incorporate the 2-3 key findings into the conversation
- Main context gets ~200 tokens of research insight, not the full document

**If save for later:**
- Note it as a research question to include in output routing

---

## Context Pressure Awareness

After approximately 10 exchanges or when the conversation has been substantial, mention:

"We've been exploring for a while. Want to wrap up with outputs, or keep going?"

Don't force a conclusion — some explorations legitimately need extended conversation. But surface the option so the user can choose.

---

## Output Routing

This is the key innovation of `/dev:explore`. At conversation end, the agent summarizes key insights and routes them to the right artifacts.

### Step 1: Summarize

Provide a concise summary of the key insights from the conversation:
- What was the core idea or question?
- What did we discover or decide?
- What remains uncertain?

### Step 2: Propose Outputs

Suggest specific outputs with reasoning. Present no more than 4 suggestions — focus on what matters most.

| Output Type | When to Suggest | Where It Goes |
|---|---|---|
| Todo | Small, actionable item discovered | `.planning/todos/pending/{id}.md` |
| Requirement | New project feature identified | Append to `REQUIREMENTS.md` with REQ-ID |
| Phase decision | Clarifies an existing phase | Write/append to phase `CONTEXT.md` |
| Research question | Needs deeper investigation | `.planning/research/questions.md` |
| New phase | Big enough for its own phase | Append to `ROADMAP.md` |
| Note | Not actionable yet, worth remembering | `.planning/notes/{slug}.md` |
| Quick capture | One-liner idea, no context needed | Suggest `/dev:note <text>` to the user |
| Seed | Idea with trigger conditions | `.planning/seeds/SEED-{NNN}-{slug}.md` |

**Format for proposals:**

```
Based on our conversation, here's what I'd suggest capturing:

1. **Todo**: "{title}" — {why this is a todo and not something bigger}
2. **Seed**: "{title}" — {why this should wait for a trigger condition}
3. **Research question**: "{question}" — {why we need to investigate this}

Want to adjust, add, or remove any of these?
```

### Step 3: Confirm

Use the **output-routing** pattern from `skills/shared/gate-prompts.md`:
  question: "How do you want to handle these proposed outputs?"

Handle responses:
- "Approve all": Create all suggested artifacts (proceed to Step 4)
- "Adjust": The user wants to modify proposals. Have a freeform conversation to adjust, then re-present with another AskUserQuestion.
- "Add more": The user has additional outputs. Gather them conversationally, add to the list, then re-present.
- "Skip": End the session without creating artifacts. This is fine — sometimes exploring is enough.

Do NOT create any artifacts until the user selects "Approve all" on the final set.

### Step 4: Create Artifacts

**Directory creation:** Before writing any artifact, ensure the target directory exists. Create `.planning/notes/`, `.planning/seeds/`, `.planning/research/`, or `.planning/todos/pending/` as needed if they don't already exist.

Create only the approved artifacts. A single explore session can produce multiple outputs across different types.

---

## Output Formats

### Todo

Write to `.planning/todos/pending/{NNN}-{slug}.md`. Follow the format used by the existing todo skill.

### Requirement

Append to `.planning/REQUIREMENTS.md` with the next available REQ-ID in the appropriate category. If the category doesn't exist, create it.

### Phase Decision

Append to `.planning/phases/{NN}-{slug}/CONTEXT.md`. If CONTEXT.md doesn't exist for that phase, create it with the standard header. Mark the decision as coming from `/dev:explore`.

### Research Question

Append to `.planning/research/questions.md`. Create the file if it doesn't exist:

```markdown
# Research Questions

Questions identified during exploration that need deeper investigation.

## Open

- [ ] {Question} — Source: /dev:explore session ({date})

## Answered

(none yet)
```

### New Phase

Append to `.planning/ROADMAP.md` following the existing phase format. Assign the next available phase number.

### Note

Write to `.planning/notes/{slug}.md`:

```markdown
---
created: {ISO date}
source: "/dev:explore session"
topic: "{topic}"
---
# {Title}

{Content from the conversation — key insights, reasoning, context}
```

### Seed

Write to `.planning/seeds/SEED-{NNN}-{slug}.md`:

```markdown
---
id: SEED-{NNN}
status: dormant
planted: {ISO date}
trigger: "{phase-slug}"
scope_estimate: "small|medium|large"
source: "/dev:explore session"
---
# {Title}

## Context
{Why this idea came up}

## Breadcrumbs
{Related phases, technologies, user preferences}
```

---

## Git Integration

If `planning.commit_docs: true` in config.json, commit created artifacts:

```
docs(planning): capture explore session outputs
```

Stage only the files created during this session. Do not stage unrelated changes.

---

## Anti-Patterns

1. **DO NOT** act like an interviewer — be a thinking partner
2. **DO NOT** cycle through a checklist of questions
3. **DO NOT** rush to outputs before understanding is deep
4. **DO NOT** auto-research without asking (unless config mode is autonomous)
5. **DO NOT** present more than 4 output suggestions — focus on what matters
6. **DO NOT** create artifacts the user didn't approve
7. **DO NOT** re-litigate decisions that are already locked in CONTEXT.md
8. **DO NOT** force the user to produce outputs — sometimes exploring is enough
