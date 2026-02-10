---
title: "Gap analysis: Towline commands vs GSD commands"
status: done
priority: P2
source: user-request
created: 2026-02-10
completed: 2026-02-10
---

## Goal

Review GSD's commands and identify what Towline needs to add or already covers differently.

## Command Mapping

### GSD (28 commands) → Towline (21 commands)

| GSD Command | Towline Equivalent | Coverage |
|-------------|-------------------|----------|
| gsd:add-phase | /dev:plan add | Full — Towline routes through plan skill |
| gsd:add-todo | /dev:todo add | Full |
| gsd:audit-milestone | /dev:milestone audit | Full |
| gsd:check-todos | /dev:todo list | Full |
| gsd:complete-milestone | /dev:milestone complete | Full |
| gsd:debug | /dev:debug | Full |
| gsd:discuss-phase | /dev:discuss | Full |
| gsd:execute-phase | /dev:build | Full |
| gsd:help | /dev:help | Full |
| gsd:insert-phase | /dev:plan insert | Full |
| gsd:join-discord | *(none)* | N/A — community feature, not needed |
| gsd:list-phase-assumptions | /dev:plan --assumptions | Full — Towline uses a flag |
| gsd:map-codebase | /dev:scan | Full |
| gsd:new-milestone | /dev:milestone new | Full |
| gsd:new-project | /dev:begin | Full |
| gsd:pause-work | /dev:pause | Full |
| gsd:plan-milestone-gaps | /dev:plan --gaps | Full — Towline uses a flag on plan |
| gsd:plan-phase | /dev:plan | Full |
| gsd:progress | /dev:status | Full |
| gsd:quick | /dev:quick | Full |
| gsd:reapply-patches | *(none)* | N/A — GSD update mechanism, not applicable |
| gsd:remove-phase | /dev:plan remove | Full |
| gsd:research-phase | /dev:plan --skip-research=false | Covered — research is default in plan |
| gsd:resume-work | /dev:resume | Full |
| gsd:set-profile | /dev:config model-profile | Full |
| gsd:settings | /dev:config | Full |
| gsd:update | *(none)* | N/A — Towline uses plugin-dir, no auto-update |
| gsd:verify-work | /dev:review | Full |

### Towline-Only Commands (no GSD equivalent)

| Towline Command | Purpose |
|----------------|---------|
| /dev:continue | Auto-execute next logical step |
| /dev:explore | Freeform idea exploration |
| /dev:import | Import external plan documents |
| /dev:note | Zero-friction idea capture |
| /dev:setup | Interactive onboarding wizard |
| /dev:health | Planning directory integrity check |

## Gap Assessment

### Commands GSD has that Towline lacks

1. **join-discord** — Community feature. Not applicable to Towline.
2. **update** — GSD self-update via npm. Towline is loaded via `--plugin-dir`, updates are git pulls. Not needed.
3. **reapply-patches** — GSD-specific post-update mechanism. Not applicable.

**Verdict**: No functional gaps. The 3 missing commands are all GSD distribution/community features that don't apply to Towline's plugin model.

### Towline's Extra Commands

Towline has 6 commands GSD doesn't: `continue`, `explore`, `import`, `note`, `setup`, and `health`. These are genuine Towline innovations — especially `continue` (auto-chain) and `health` (self-diagnosis).

### Architectural Difference

GSD uses 28 separate commands → 30 workflow files (many-to-many). Towline uses 21 commands → 21 skills (one-to-one, cleaner). GSD also has sub-workflows called by workflows (e.g., `execute-plan.md` called by `execute-phase.md`, `transition.md`). Towline handles these as sections within a single skill file.

## Acceptance Criteria

- [x] Complete mapping of GSD commands to Towline commands
- [x] Gap list with priority and rationale for each — no functional gaps
- [x] Notes on Towline-only commands that represent innovations
