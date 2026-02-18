# Agent Interaction Map

This document shows how Plan-Build-Run agents communicate through files on disk. Agents never message each other directly -- they read and write shared files in `.planning/`.

## Interaction Graph

```
                    User / Orchestrator
                     |           ^
                     v           |
              +--------------+   |
              |  researcher  |---+---> planner
              +--------------+         |    ^
                     |                 v    |
              +--------------+   +--------------+
              | synthesizer  |   | plan-checker |
              +--------------+   +--------------+
                                       |
                                       v
                                 +-----------+
                                 |  executor  |
                                 +-----------+
                                       |
                                       v
                                 +-----------+
                                 |  verifier  |----> planner (gap closure)
                                 +-----------+
                                       |
                                       v
                              +--------------------+
                              | integration-checker|
                              +--------------------+
```

## Per-Agent Interaction Details

### researcher

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | User/Orchestrator | Research topics, CONTEXT.md constraints, phase goals |
| Produces for | planner | Research documents with technology details and recommendations |
| Produces for | synthesizer | Research documents to be combined |
| Produces for | User | Direct reading for decision-making |

### synthesizer

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | researcher | Research documents to synthesize |
| Receives from | Orchestrator | Paths to research documents, synthesis request |
| Produces for | planner | SUMMARY.md as consolidated research input for planning |
| Produces for | User | High-level project/phase research overview |

### planner

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | researcher | Research documents with technology details and recommendations |
| Receives from | plan-checker | Issue reports requiring plan revision |
| Receives from | verifier | VERIFICATION.md reports requiring gap closure plans |
| Receives from | User/Orchestrator | Phase goals, CONTEXT.md, planning requests |
| Produces for | plan-checker | Plan files for quality verification |
| Produces for | executor | Plan files for execution |
| Produces for | verifier | Must-have definitions for verification (embedded in plan frontmatter) |

### plan-checker

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator/User | Plan files to check, phase context |
| Receives from | planner | Newly created or revised plan files |
| Produces for | planner | Issue reports for revision |
| Produces for | Orchestrator/User | Pass/fail decision on plan quality |

### executor

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator | Plan files to execute, continuation instructions |
| Receives from | planner | The plans themselves (indirectly, via files) |
| Produces for | verifier | SUMMARY.md for verification, committed code for inspection |
| Produces for | Orchestrator | Checkpoint responses, completion status |
| Produces for | planner | Deferred ideas (in SUMMARY.md) for future planning |

### verifier

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator | Phase to verify, timing trigger |
| Receives from | executor | Completed work (via codebase and SUMMARY.md) |
| Receives from | Previous VERIFICATION.md | Gaps to re-check (in re-verification mode) |
| Produces for | planner | Gap list for gap-closure planning (via VERIFICATION.md) |
| Produces for | Orchestrator | Phase status (passed/gaps_found/human_needed) |
| Produces for | User | Human verification items with specific test instructions |

### integration-checker

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator | Phases to check, trigger event (milestone/review) |
| Receives from | verifier | Phase-level verification reports (for context on per-phase status) |
| Produces for | planner | Integration gap list for cross-phase fix plans |
| Produces for | Orchestrator | Integration status for milestone decisions |
| Produces for | User | Integration health overview and security issues |

### debugger

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator/User | Bug reports, symptoms, reproduction steps |
| Receives from | executor | Errors encountered during execution (via checkpoint responses) |
| Receives from | verifier | Issues discovered during verification |
| Produces for | Orchestrator/User | Root cause analysis, fix commits, checkpoint requests |
| Produces for | planner | Findings requiring architectural changes |
| Produces for | executor | Simple fix instructions for executor to apply |

### codebase-mapper

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator/User | Focus area to analyze, project path |
| Receives from | researcher | May be invoked alongside researcher for new projects |
| Produces for | planner | STACK.md, ARCHITECTURE.md, STRUCTURE.md for informed planning |
| Produces for | executor | CONVENTIONS.md for code style, TESTING.md for test patterns |
| Produces for | verifier | All documents as reference for what "correct" looks like |
| Produces for | User | Direct reading for project understanding |

### general

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator/User | Ad-hoc task instructions |
| Produces for | Orchestrator/User | Task output (files, formatting, config changes) |
