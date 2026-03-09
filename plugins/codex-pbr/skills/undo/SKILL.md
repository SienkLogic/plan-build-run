---
name: undo
description: "Revert recent PBR-generated commits by phase/plan, safely using git revert."
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Begin executing Step 0 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► UNDO                                       ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# $pbr-undo — Safe Commit Reversal

You are running the **undo** skill. Your job is to help the user safely revert recent PBR-generated commits using `git revert` (history-preserving), not `git reset` (destructive).

This skill runs **inline** (no Task delegation).

---

## Step 1 — Gather PBR Commits

Run:

```bash
git log --oneline --no-merges -50
```

Filter lines matching the PBR commit pattern:
`^[0-9a-f]+ (feat|fix|refactor|test|docs|chore|wip|revert)(\([a-zA-Z0-9._-]+\))?:`

If no PBR commits found, display:

```
No PBR commits found in the last 50 commits.
```

Then exit.

**Parse $ARGUMENTS for flags**:
- `--last N`: limit to N most recent PBR commits (default 20)
- `--phase NN`: filter to commits for a specific phase number (e.g. `--phase 55`)
- `--plan NN-MM`: filter to commits for a specific plan (e.g. `--plan 55-02`)
- `--range HASH..HASH`: preselect a hash range for revert — if provided, skip to Step 5 with that range pre-filled

**Phase manifest mode (`--phase NN`):**

When `--phase NN` is specified, first check for a `.phase-manifest.json` in the phase directory:

1. Resolve the phase directory: `.planning/phases/{NN}-*/`
2. Check for `.phase-manifest.json` in that directory
3. If manifest exists: use `manifest.commits` as the commit list (skip git log scan)
4. If manifest missing (phases completed before manifest support): fall back to git log scan and filter by scope pattern

Phase manifests are written by `completePhase()`. Older phases may not have manifests.

Apply filters to the collected PBR commits before proceeding.

---

## Step 2 — Group Commits by Scope

Parse the scope from each commit message (e.g., `55-02`, `quick-003`, `planning`). If no scope is present, use `(no scope)`.

Present grouped output:

```
Recent PBR commits (grouped by scope):

[undo]
  abc1234  feat(undo): add undo skill
  def5678  chore(undo): register undo command

[quick-003]
  ghi9012  fix(quick-003): fix hook path resolution

[planning]
  jkl3456  docs(planning): update roadmap phase 55
```

For descriptive scopes, show just the scope label. For phase-plan scopes (NN-MM pattern, from older commits), add a "Phase NN, Plan MM" annotation.

---

## Step 3 — Prompt for Selection

Use AskUserQuestion with the **select-action** pattern:

- **question**: "Which commit(s) do you want to undo? Select a scope to revert all commits in that scope, or choose a custom option."
- **header**: "Select commits to undo"
- **options**: (dynamic — top 8 scope labels from grouped list, each formatted as `[{scope}] {N} commit(s)`, plus "Enter custom hash or range" and "Cancel")
- **multiSelect**: false

If user selects a scope label: collect all commits with that scope as the revert set.
If user selects "Enter custom hash or range": use AskUserQuestion (freeform) to ask:
  - "Enter a commit hash or range (e.g. abc1234 or abc..def):"
  - Parse the response as a hash or HASH1..HASH2 range
If user selects "Cancel": print "Undo cancelled." and exit.

---

## Step 3.5 — Pre-Revert Safety Gates (for `--phase NN` mode)

When reverting an entire phase (`--phase NN`), run these 3 safety checks before proceeding to confirmation:

**Gate 1: Downstream dependency check**
Parse `.planning/ROADMAP.md` to find phases that list the target phase in their "Depends on" field. If any dependent phase has been started (has PLAN files or SUMMARY files), block with:
```
Phase {M} ({name}) depends on phase {N} and has already begun. Undo would break downstream work.
To proceed anyway, use --force.
```

**Gate 2: Commit preview**
Display all commits that will be reverted as a numbered list:
```
Commits to revert ({count}):
  1. abc1234  feat(auth): implement discord oauth
  2. def5678  fix(auth): handle null profile
  3. ghi9012  docs(planning): add phase 3 summaries
```

**Gate 3: Explicit confirmation**
Use AskUserQuestion with the **yes-no** pattern:
- **question**: "Revert {count} commits from phase {N}? This uses git revert (history-preserving)."
- **options**: ["Proceed with revert", "Cancel"]

If user selects "Cancel": print "Undo cancelled." and exit.

For non-phase mode (single commits, custom ranges), skip Gate 1 and proceed to Step 4.

---

## Step 4 — Confirm Selection

Display the commits that will be reverted:

```
The following commits will be reverted (using git revert, NOT git reset):

  abc1234  feat(undo): add undo skill
  def5678  chore(undo): register undo command

This creates new revert commits — your history is preserved.
```

Use AskUserQuestion with the **yes-no** pattern:
- **question**: "Proceed with reverting these commits?"
- **options**: ["Proceed with revert", "Cancel"]

If user selects "Cancel": print "Undo cancelled." and exit.

---

## Step 5 — Execute git revert

For each commit hash in **reverse chronological order** (newest first):

```bash
git revert --no-commit {hash}
```

After all reverts are staged, determine the commit message:
- Extract scope from the first commit being reverted (e.g., `undo`, `auth`, `executor`)
- If reverting a **single commit**: `revert({scope}): undo {original description}`
- If reverting **multiple commits**: `revert({scope}): undo {N} commits from {scope}`

Commit with:

```bash
git commit -m "revert({scope}): undo {description}"
```

**Conflict handling**: If `git revert --no-commit` exits non-zero or produces conflict markers:
1. Run `git revert --abort` to clean up
2. Display:
   ```
   Revert failed due to merge conflicts. Manual resolution required.
   Run: git revert {hashes} and resolve conflicts.
   ```
3. Exit without committing.

---

## Step 6 — Report Result

Display completion banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► UNDO COMPLETE                              ║
╚══════════════════════════════════════════════════════════════╝

Reverted: {N} commit(s) from scope {scope}
New revert commit: {hash} — revert({scope}): undo {description}

$pbr-status — check current state
```

---

## Anti-Patterns

1. **DO NOT** use `git reset` — always use `git revert` to preserve history
2. **DO NOT** revert commits from other users without confirmation
3. **DO NOT** revert merge commits without warning the user about potential complexity
4. **DO NOT** skip the confirmation step (Step 4)
5. **DO NOT** commit if `git revert` reports conflicts — abort and report instead
