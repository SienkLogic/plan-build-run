# Git Planning Commit

Use git directly for `.planning/` file commits. Check `commit_docs` in config and `.gitignore` before committing. If `commit_docs: false` in config or `.planning/` is gitignored, skip committing planning files.

## Commit via git

```bash
# Check if .planning/ is gitignored first
git check-ignore -q .planning/ && echo "SKIP: .planning/ is gitignored" || git add .planning/STATE.md .planning/ROADMAP.md && git commit -m "docs({scope}): {description}"
```

## Amend previous commit

To fold `.planning/` file changes into the previous commit:

```bash
git add .planning/codebase/*.md && git commit --amend --no-edit
```

## Commit Message Patterns

| Command | Scope | Example |
|---------|-------|---------|
| plan-phase | phase | `docs(phase-03): create authentication plans` |
| execute-phase | phase | `docs(phase-03): complete authentication phase` |
| new-milestone | milestone | `docs: start milestone v1.1` |
| remove-phase | chore | `chore: remove phase 17 (dashboard)` |
| insert-phase | phase | `docs: insert phase 16.1 (critical fix)` |
| add-phase | phase | `docs: add phase 07 (settings page)` |

## When to Skip

- `commit_docs: false` in config
- `.planning/` is gitignored
- No changes to commit (check with `git status --porcelain .planning/`)
