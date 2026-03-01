# Milestone Edge Cases

## No ROADMAP.md exists
- For `new`: Create one from scratch (this is a fresh start)
- For others, display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

No roadmap found.

**To fix:** Run `/pbr:begin` or `/pbr:milestone new` first.
```

## Milestone has no phases
Display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

No phases found for this milestone.

**To fix:**
- For `complete`: Nothing to complete — add phases first.
- For `audit`: Nothing to audit — build phases first.
```

## Audit finds no gaps
- Status: PASSED
- Skip the recommendations section
- Suggest proceeding to complete

## Version already exists (tag collision)
Display:
```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

Git tag {version} already exists.

**To fix:** Use a different version number (e.g., {version}.1).
```
Ask for alternative via AskUserQuestion.

## Partially verified milestone
- `complete` warns but allows proceeding with user confirmation
- `audit` treats unverified phases as gaps

## Large milestone (8+ phases)
- `audit` may take longer due to integration checking
- Warn: "This milestone has {count} phases. The audit may take a few minutes."
