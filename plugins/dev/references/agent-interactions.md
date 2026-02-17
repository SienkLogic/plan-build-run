# Agent Interaction Map

This document shows how Towline agents communicate through files on disk. Agents never message each other directly -- they read and write shared files in `.planning/`.

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

### towline-researcher

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | User/Orchestrator | Research topics, CONTEXT.md constraints, phase goals |
| Produces for | towline-planner | Research documents with technology details and recommendations |
| Produces for | towline-synthesizer | Research documents to be combined |
| Produces for | User | Direct reading for decision-making |

### towline-synthesizer

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | towline-researcher | Research documents to synthesize |
| Receives from | Orchestrator | Paths to research documents, synthesis request |
| Produces for | towline-planner | SUMMARY.md as consolidated research input for planning |
| Produces for | User | High-level project/phase research overview |

### towline-planner

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | towline-researcher | Research documents with technology details and recommendations |
| Receives from | towline-plan-checker | Issue reports requiring plan revision |
| Receives from | towline-verifier | VERIFICATION.md reports requiring gap closure plans |
| Receives from | User/Orchestrator | Phase goals, CONTEXT.md, planning requests |
| Produces for | towline-plan-checker | Plan files for quality verification |
| Produces for | towline-executor | Plan files for execution |
| Produces for | towline-verifier | Must-have definitions for verification (embedded in plan frontmatter) |

### towline-plan-checker

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator/User | Plan files to check, phase context |
| Receives from | towline-planner | Newly created or revised plan files |
| Produces for | towline-planner | Issue reports for revision |
| Produces for | Orchestrator/User | Pass/fail decision on plan quality |

### towline-executor

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator | Plan files to execute, continuation instructions |
| Receives from | towline-planner | The plans themselves (indirectly, via files) |
| Produces for | towline-verifier | SUMMARY.md for verification, committed code for inspection |
| Produces for | Orchestrator | Checkpoint responses, completion status |
| Produces for | towline-planner | Deferred ideas (in SUMMARY.md) for future planning |

### towline-verifier

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator | Phase to verify, timing trigger |
| Receives from | towline-executor | Completed work (via codebase and SUMMARY.md) |
| Receives from | Previous VERIFICATION.md | Gaps to re-check (in re-verification mode) |
| Produces for | towline-planner | Gap list for gap-closure planning (via VERIFICATION.md) |
| Produces for | Orchestrator | Phase status (passed/gaps_found/human_needed) |
| Produces for | User | Human verification items with specific test instructions |

### towline-integration-checker

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator | Phases to check, trigger event (milestone/review) |
| Receives from | towline-verifier | Phase-level verification reports (for context on per-phase status) |
| Produces for | towline-planner | Integration gap list for cross-phase fix plans |
| Produces for | Orchestrator | Integration status for milestone decisions |
| Produces for | User | Integration health overview and security issues |

### towline-debugger

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator/User | Bug reports, symptoms, reproduction steps |
| Receives from | towline-executor | Errors encountered during execution (via checkpoint responses) |
| Receives from | towline-verifier | Issues discovered during verification |
| Produces for | Orchestrator/User | Root cause analysis, fix commits, checkpoint requests |
| Produces for | towline-planner | Findings requiring architectural changes |
| Produces for | towline-executor | Simple fix instructions for executor to apply |

### towline-codebase-mapper

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator/User | Focus area to analyze, project path |
| Receives from | towline-researcher | May be invoked alongside researcher for new projects |
| Produces for | towline-planner | STACK.md, ARCHITECTURE.md, STRUCTURE.md for informed planning |
| Produces for | towline-executor | CONVENTIONS.md for code style, TESTING.md for test patterns |
| Produces for | towline-verifier | All documents as reference for what "correct" looks like |
| Produces for | User | Direct reading for project understanding |

### towline-general

| Direction | Agent/Role | What |
|-----------|-----------|------|
| Receives from | Orchestrator/User | Ad-hoc task instructions |
| Produces for | Orchestrator/User | Task output (files, formatting, config changes) |
