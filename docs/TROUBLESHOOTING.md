# Troubleshooting

Common issues and their solutions when using Towline.

## Context Full / Compaction Issues

**Symptom**: Claude starts losing track of earlier decisions, or you see "context compacted" messages frequently.

**Solutions**:
1. Use `/dev:pause` to save state, then start a fresh session with `/dev:resume`
2. Delegate more work to agents — the orchestrator should stay under 15-20% context
3. Avoid reading large files in the main session; let agents read them via `Task()`
4. Check if `context_strategy` in config is set to `aggressive` (default) — this enables proactive context warnings

**Prevention**: Towline's `track-context-budget.js` hook warns after 20 file reads. The `suggest-compact.js` hook warns when writes push context toward limits. Heed these warnings early.

## Plan Checker Rejection Loops

**Symptom**: `/dev:plan` keeps failing the plan-checker step and cycling back to revisions.

**Solutions**:
1. Run `/dev:discuss N` first to clarify requirements before planning
2. Use `/dev:plan N --skip-research` if research is adding noise
3. Check the plan-checker's feedback — it validates 10 dimensions. Common failures:
   - Missing must-haves (every plan needs `<must-have>` declarations)
   - Vague task descriptions (tasks need specific file paths and acceptance criteria)
   - Missing wave assignments (tasks must have `wave` attributes)
4. If stuck after 3 revisions, the skill auto-approves with a warning. Review the plan manually.

## Verification Failures

**Symptom**: `/dev:review N` reports must-haves as "not found" even though you implemented them.

**Solutions**:
1. Check must-have wording vs actual code — the verifier searches for exact patterns
2. Use `/dev:review N --auto-fix` to auto-diagnose and create gap-closure plans
3. Run `/dev:plan N --gaps` to create targeted fix plans for specific failures
4. Check if exports/wiring is complete — the verifier checks three layers:
   - **Existence**: File exists at the declared path
   - **Substance**: File has meaningful content (not a stub or placeholder)
   - **Wiring**: File is imported/used by the rest of the system

## Corrupt `.planning/` State

**Symptom**: `/dev:status` shows wrong phase, progress bar is stuck, or commands fail with "STATE.md not found".

**Solutions**:
1. Run `/dev:health` — it diagnoses and can auto-fix common state corruption
2. Manually check `.planning/STATE.md` — it's the source of truth
3. If STATE.md is missing or corrupt, recreate it from ROADMAP.md:
   - Phase number and name from the roadmap
   - Status from the latest SUMMARY.md or VERIFICATION.md in the phase directory
4. Check `.planning/config.json` is valid JSON — a syntax error breaks all config loading

## Checkpoint / Crash Recovery

**Symptom**: Build was interrupted mid-execution. Some tasks completed, others didn't.

**Solutions**:
1. Run `/dev:resume` — it reads `.planning/STATE.md` and suggests the next action
2. Look for `.PROGRESS-*` files in the phase directory — these are executor crash artifacts
3. Check `SUMMARY-*.md` files to see which plans completed
4. Re-run `/dev:build N` — it detects existing summaries and skips completed plans
5. Stale `.checkpoint-manifest.json` files (>24h old) are auto-cleaned by `session-cleanup.js`

## Stale Signal Files

**Symptom**: Unexpected behavior on session start, or auto-continue triggers when it shouldn't.

**Signal files and their purpose**:
| File | Written by | Purpose |
|------|-----------|---------|
| `.auto-next` | build/continue skills | Chains the next command |
| `.active-plan` | build skill | Tracks which plan is being executed |
| `.active-operation` | various skills | Current operation lock |
| `.active-skill` | skill loader | Currently running skill |
| `.active-agent` | log-subagent.js | Currently running agent |

**Solutions**:
1. `session-cleanup.js` removes `.auto-next`, `.active-operation`, `.active-skill`, and `.active-plan` on session end
2. If cleanup didn't run (hard kill), manually delete stale signal files:
   ```bash
   rm .planning/.auto-next .planning/.active-plan .planning/.active-operation .planning/.active-skill .planning/.active-agent
   ```
3. Run `/dev:health` to check for orphaned signal files

## Windows-Specific Issues

### CRLF Line Endings

**Symptom**: Frontmatter parsing fails, regex patterns don't match, tests fail on Windows but pass on Linux.

**Solution**: Towline's hook scripts and test files use `\r?\n` patterns to handle both LF and CRLF. If you write new scripts that parse `.md` files, always use `/\r?\n/` instead of `'\n'` for splitting lines and `\r?\n` in regex patterns.

### File Locking

**Symptom**: "EBUSY" or "EPERM" errors when deleting or writing files.

**Causes**: Windows antivirus (Defender), file indexing, or search indexing can hold file locks.

**Solutions**:
1. Towline uses retry loops with exponential backoff for file deletion
2. Towline uses atomic writes (write-to-temp-then-rename) via `atomicWrite()` from `towline-tools.js`
3. If a signal file can't be deleted, it will be cleaned up on next session start
4. For persistent issues, exclude `.planning/` from antivirus real-time scanning

### Path Separators

All Towline scripts use `path.join()` for cross-platform compatibility. If you write custom hooks or scripts, never hardcode `/` or `\` in file paths.

## Hook Failures

**Symptom**: Hooks aren't firing, or you see "hook error" in logs.

**Diagnosis**:
1. Check `.planning/logs/hooks.jsonl` for recent hook entries
2. Run `/dev:health` — Check 8 validates hook logging
3. Verify `plugins/dev/hooks/hooks.json` hasn't been corrupted
4. Check that `${CLAUDE_PLUGIN_ROOT}` resolves correctly (Claude Code expands this internally)

**Common causes**:
- Missing `node_modules` — run `npm install` in the Towline plugin directory
- Script syntax error — run `node plugins/dev/scripts/{script}.js` directly to see errors
- Permissions — hook scripts need execute permission on Linux/macOS

## Config Issues

**Symptom**: Config changes don't take effect, or skills show default behavior.

**Solutions**:
1. Verify `.planning/config.json` is valid JSON: `node -e "console.log(JSON.parse(require('fs').readFileSync('.planning/config.json','utf8')))"`
2. Use `/dev:config` to modify settings interactively — it validates on save
3. Check for conflicting settings:
   - `mode: autonomous` + `gates.confirm_*: true` → gates are unreachable in autonomous mode
   - `features.auto_continue: true` + `mode: interactive` → auto_continue won't fire in interactive mode

## Getting More Help

- Run `/dev:help` for the full command reference
- Run `/dev:health` for automated integrity checks
- Check `.planning/logs/events.jsonl` for workflow event history
- File issues at the Towline repository
