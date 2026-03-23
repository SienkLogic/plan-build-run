---
name: profile-user
description: "Analyze Claude Code session history to generate a developer behavioral profile across 8 dimensions."
allowed-tools: Read, Write, Bash, Glob, Grep, AskUserQuestion
---

**STOP -- DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes tokens. Begin executing Step 0 immediately.**

## Step 0 -- Banner

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► USER PROFILE                              ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:profile-user -- Developer Behavioral Profiling

You are running the **profile-user** skill. Your job is to analyze the user's Claude Code session history across 8 behavioral dimensions and generate a `.planning/USER-PROFILE.md` file with actionable insights. If insufficient session data exists, fall back to a short interactive questionnaire.

---

## Step 1 -- Config Gate

Check if the developer profiling feature is enabled:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js config get developer_profile.enabled
```

- If the result is `false`, empty, or the key is missing: tell the user to enable it first with `/pbr:config set developer_profile.enabled true` and **STOP**.
- If `true`: proceed to Step 2.

---

## Step 2 -- Locate Session Logs

Find the Claude Code session log directory for this project:

```bash
# List ~/.claude/projects/ to find the encoded project path
ls -la ~/.claude/projects/
```

The directory name is the project root path with path separators replaced by `-`. For example, `D:\Repos\plan-build-run` becomes something like `D--Repos-plan-build-run` or `D-Repos-plan-build-run`.

Once found, list JSONL files sorted by modification time:

```bash
ls -lt ~/.claude/projects/{encoded-path}/*.jsonl 2>/dev/null | head -20
```

Count the files that are larger than 1KB:

```bash
find ~/.claude/projects/{encoded-path}/ -name "*.jsonl" -size +1k 2>/dev/null | wc -l
```

---

## Step 3 -- Analysis or Fallback Decision

- If **>= 3** session JSONL files found (each > 1KB): proceed to **Step 4** (session analysis mode).
- If **< 3** usable session files: proceed to **Step 5** (questionnaire fallback).

---

## Step 4 -- Session Analysis Mode

Read the **5 most recent** session JSONL files. For each file, parse the JSON lines and extract behavioral signals.

### What to look for

For each session, scan `type: "human"` messages (user inputs) and `type: "assistant"` messages (responses) to detect patterns:

1. **Communication style** -- Are user messages terse (1-2 words, commands) or detailed (paragraphs with context)? Do they use technical jargon freely?
2. **Decision speed** -- When presented with options or checkpoints, how quickly does the user respond? Do they accept suggestions or counter-propose alternatives?
3. **Debugging approach** -- When errors occur, does the user provide stack traces, ask for root cause analysis, or direct Claude to specific files?
4. **UX philosophy** -- Does the user focus on functionality first, or request UI polish, formatting, and user-facing details early?
5. **Code style** -- Does the user request tests, mention linting, prefer functional vs OOP patterns, ask for type safety?
6. **Review thoroughness** -- Does the user examine diffs carefully, request changes, or approve quickly?
7. **Risk tolerance** -- Does the user approve force operations, skip verification steps, use `--auto` flags?
8. **Domain expertise** -- What technologies, frameworks, and languages appear most frequently?

### Scoring

Score each dimension on a 3-point scale:

| Dimension | Low | Medium | High |
|-----------|-----|--------|------|
| Communication style | terse | balanced | detailed |
| Decision speed | fast | measured | deliberate |
| Debugging approach | delegation | intuitive | systematic |
| UX philosophy | function-first | balanced | polish-first |
| Code style | pragmatic | balanced | perfectionist |
| Review thoroughness | light | standard | deep |
| Risk tolerance | conservative | moderate | adventurous |
| Domain expertise | (list top 3-5 domains) | | |

After scoring, proceed to **Step 6**.

---

## Step 5 -- Questionnaire Fallback

When insufficient session data is available, use `AskUserQuestion` to ask these 4 questions **one at a time**:

**Question 1:**
> How do you prefer Claude to communicate?
> (a) Brief and direct
> (b) Balanced -- concise but with enough context
> (c) Detailed with thorough explanations

**Question 2:**
> When you encounter a bug, do you prefer to:
> (a) Get a fix immediately -- just make it work
> (b) Understand the root cause first, then fix
> (c) Have Claude investigate and report back before changing anything

**Question 3:**
> How important is code quality vs shipping speed?
> (a) Ship fast, refactor later
> (b) Balance both -- good enough quality, reasonable speed
> (c) Quality first, take the time needed

**Question 4:**
> What is your primary domain? (e.g., backend, frontend, DevOps, data, mobile, full-stack)

### Mapping answers to dimensions

| Answer | Dimension mappings |
|--------|-------------------|
| Q1=a | communication_style: terse, review_thoroughness: light |
| Q1=b | communication_style: balanced, review_thoroughness: standard |
| Q1=c | communication_style: detailed, review_thoroughness: deep |
| Q2=a | debugging_approach: delegation, decision_speed: fast |
| Q2=b | debugging_approach: systematic, decision_speed: measured |
| Q2=c | debugging_approach: systematic, decision_speed: deliberate |
| Q3=a | code_style: pragmatic, risk_tolerance: adventurous, ux_philosophy: function-first |
| Q3=b | code_style: balanced, risk_tolerance: moderate, ux_philosophy: balanced |
| Q3=c | code_style: perfectionist, risk_tolerance: conservative, ux_philosophy: balanced |
| Q4 | domain_expertise: [user's answer] |

After mapping, proceed to **Step 6**.

---

## Step 6 -- Generate USER-PROFILE.md

**CRITICAL: Write USER-PROFILE.md NOW. Do not skip this step.**

Write `.planning/USER-PROFILE.md` with the following structure:

```yaml
---
generated: "{ISO date from node -e 'console.log(new Date().toISOString())'}"
source: "session-analysis" or "questionnaire"
sessions_analyzed: {N, or 0 for questionnaire}
dimensions:
  communication_style: "{terse|balanced|detailed}"
  decision_speed: "{fast|measured|deliberate}"
  debugging_approach: "{delegation|intuitive|systematic}"
  ux_philosophy: "{function-first|balanced|polish-first}"
  code_style: "{pragmatic|balanced|perfectionist}"
  review_thoroughness: "{light|standard|deep}"
  risk_tolerance: "{conservative|moderate|adventurous}"
  domain_expertise: ["{domain1}", "{domain2}"]
---
```

After the frontmatter, write a **body section** with 1-2 sentences per dimension explaining:
- What was observed (or what the user selected)
- How this should affect agent behavior

Example body format:

```markdown
## Communication Style: balanced

You communicate with a mix of brief directives and contextual detail. Agents should
match this style -- provide enough explanation to be useful but avoid over-explaining
concepts you clearly understand.

## Decision Speed: measured

You take time to evaluate options before committing. Agents should present choices
clearly and wait for your input rather than assuming a default.

(... one section per dimension ...)
```

---

Reference: `skills/shared/commit-planning-docs.md` -- if `planning.commit_docs` is true, commit USER-PROFILE.md.

---

## Step 7 -- Summary Output

After writing `USER-PROFILE.md`, display a summary table:

```
Profile generated: .planning/USER-PROFILE.md
Source: {session-analysis|questionnaire}

| Dimension            | Value          |
|----------------------|----------------|
| Communication style  | {value}        |
| Decision speed       | {value}        |
| Debugging approach   | {value}        |
| UX philosophy        | {value}        |
| Code style           | {value}        |
| Review thoroughness  | {value}        |
| Risk tolerance       | {value}        |
| Domain expertise     | {domains}      |

Run /pbr:profile-user again at any time to regenerate your profile
with updated session data.
```

If `developer_profile.inject_prompts` is enabled in config, also note:
> Profile dimensions will be injected into agent prompts for personalized communication.
