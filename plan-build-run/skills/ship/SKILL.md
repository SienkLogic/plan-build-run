---
name: ship
description: "Create a rich PR from planning artifacts (SUMMARY one-liners, requirement coverage, verification status)."
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
argument-hint: "[--base <branch>] [--draft]"
---

**STOP -- DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Begin executing Step 1 immediately.**

# /pbr:ship -- Create PR from Planning Artifacts

**References:** `@references/ui-brand.md`

You are the orchestrator for `/pbr:ship`. This skill generates a rich pull request from PBR planning artifacts -- SUMMARY one-liners, verification status, and requirement coverage. It uses `gh pr create` to open the PR.

## Step 0 -- Immediate Output

**Before ANY tool calls**, display this banner:

```
+--------------------------------------------------------------+
|  PLAN-BUILD-RUN > SHIP                                       |
+--------------------------------------------------------------+
```

Then proceed to Step 1.

## Step 1: Parse Arguments and Validate

1. Parse `$ARGUMENTS` for optional flags:
   - `--base <branch>` -- target branch for the PR (default: repo default branch)
   - `--draft` -- create as draft PR
2. Verify `gh` CLI is available: `gh --version`
3. Verify git working tree is clean. If uncommitted changes exist, warn:
   ```
   WARNING: You have uncommitted changes. Commit or stash before shipping.
   ```
   Use AskUserQuestion (pattern: yes-no):
     question: "Continue with uncommitted changes?"
   If "No": stop.
4. Verify current branch is NOT the default branch:
   ```bash
   git rev-parse --abbrev-ref HEAD
   ```
   If on main/master, warn and stop: "You are on the default branch. Create a feature branch first."

## Step 2: Gather Planning Artifacts

1. Read `.planning/STATE.md` to get current phase info (phase number, slug, status)
2. Find the current phase directory: `.planning/phases/{NN}-{slug}/`
3. Read all `SUMMARY-*.md` files in the phase directory:
   - Extract `status` from frontmatter
   - Extract one-liner descriptions from the body (first non-heading, non-empty line after `## Task Results`)
   - Collect `commits` arrays from frontmatter
4. Read `VERIFICATION.md` in the phase directory (if exists):
   - Extract `score` and `status` from frontmatter
   - Extract pass/fail counts
5. Read `.planning/ROADMAP.md`:
   - Extract requirements mapped to the current phase
   - Extract phase goal
6. Compute git stats:
   ```bash
   git diff --stat $(git merge-base HEAD main)..HEAD
   git log --oneline $(git merge-base HEAD main)..HEAD | wc -l
   ```

## Step 3: Generate PR Body

Build the PR body with these sections:

```markdown
## Summary

{Phase goal from ROADMAP.md}

{For each SUMMARY file: "- **Plan {NN}**: {one-liner status}" }

## Requirements

| REQ-ID | Description | Status |
|--------|-------------|--------|
{For each requirement mapped to this phase}

## Verification

- **Score**: {score from VERIFICATION.md or "Not verified"}
- **Status**: {status}
- **Must-haves**: {pass_count}/{total_count} passing

## Changes

- **Commits**: {commit_count}
- **Files changed**: {file_count}
- **Insertions**: +{insertions}
- **Deletions**: -{deletions}

---
Generated with [Plan-Build-Run](https://github.com/pibster/plan-build-run)
```

## Step 4: Create PR

1. Generate a PR title from the phase: `feat({phase-slug}): {phase goal summary}`
   - Keep under 70 characters
   - Use appropriate commit type (feat, fix, refactor) based on phase goal keywords
2. Run `gh pr create`:
   ```bash
   gh pr create --title "{title}" --body "$(cat <<'PREOF'
   {generated body}
   PREOF
   )"
   ```
   - Add `--base {branch}` if `--base` flag was provided
   - Add `--draft` if `--draft` flag was provided
3. Capture and display the PR URL

## Step 5: Display Result

```
PR created: {url}

  Title:    {title}
  Base:     {base branch}
  Status:   {draft or ready}
  Commits:  {count}
  Files:    {count}
```

## Step 6: Next Steps

After displaying the PR result, always present a NEXT UP routing block:

```
╔══════════════════════════════════════════════════════════════╗
║  ▶ NEXT UP                                                   ║
╚══════════════════════════════════════════════════════════════╝

**PR created** — continue to the next phase or track progress

`/pbr:continue`

**Also available:**
- `/pbr:status` — see overall project status
- `/pbr:milestone` — if this was the last phase, complete the milestone

<sub>`/clear` first → fresh context window</sub>
```

## Error Handling

- `gh` not installed: "Install GitHub CLI: https://cli.github.com/"
- Not a git repo: stop with error
- No planning artifacts found: "No SUMMARY files found. Run /pbr:build first."
- PR creation fails: show the `gh` error output and suggest fixes
