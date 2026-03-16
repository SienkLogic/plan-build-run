---
name: release
description: "Generate or update changelog and release notes from project history."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
argument-hint: "[version] [--draft|--update|--clean]"
---
<!-- markdownlint-disable MD012 MD046 -->

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Using the Read tool on this SKILL.md file wastes tokens. Begin executing Step 1 immediately.**

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► RELEASE                                    ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

# /pbr:release — Changelog & Release Notes

You are running the **release** skill. This skill generates polished, user-facing changelog entries from project history — milestone summaries, commit logs, and planning artifacts. It produces Keep a Changelog format with bolded feature names and impact-focused descriptions.

This skill runs **inline** (no subagents).

---

## Argument Parsing

Parse `$ARGUMENTS`:

```
$ARGUMENTS format: [version] [--flag]

Examples:
  ""                 → mode=draft, version=auto-detect from package.json
  "v2.2.0"           → mode=draft, version=v2.2.0
  "--draft"          → mode=draft, version=auto-detect
  "--update v2.1.0"  → mode=update, version=v2.1.0
  "--clean"          → mode=clean, run clean-changelog.js on existing CHANGELOG.md
```

**Modes:**
- `draft` (default) — Generate a new changelog entry for unreleased work
- `update` — Regenerate the entry for an existing version
- `clean` — Run the scope-cleaning script on the current CHANGELOG.md

---

## Mode: `clean`

Run the changelog cleaning script to strip internal scopes from existing entries:

```bash
node scripts/clean-changelog.js --write
```

Display the result and exit.

---

## Mode: `draft` or `update`

### Step 1 — Gather Context

1. **Determine version:**
   - If provided: use it (auto-prefix `v` if missing)
   - If not: read `package.json` version field and use that

2. **Read current CHANGELOG.md** (if exists):
   - Parse existing version entries to avoid duplicating
   - If `update` mode: find the section for the target version to replace

3. **Determine the change range:**

   For `draft` mode (unreleased work):
   - Find the most recent git tag: `git describe --tags --abbrev=0`
   - Collect commits since that tag: `git log {tag}..HEAD --oneline`
   - Read any milestone archive SUMMARY.md files created since the tag

   For `update` mode (existing version):
   - Find the tag for the target version
   - Find the tag before it
   - Collect commits between those two tags
   - Read the milestone archive for that version if it exists

### Step 2 — Read Summaries

Read SUMMARY.md files from the relevant phases (archived or active):

- Check `.planning/milestones/` for version-matched archives
- Check `.planning/phases/` for active phase summaries
- Extract `provides`, `key_files`, and `key_decisions` fields from frontmatter
- Read commit messages for additional context

### Step 3 — Draft the Entry

Generate a changelog entry in Keep a Changelog format:

```markdown
## [{version}] - {YYYY-MM-DD}

### Added
- **Feature name** — What it does and why it matters
- **Another feature** — User-facing description

### Changed
- **Existing feature** — What changed and why

### Fixed
- **Bug description** — What was broken and how it's resolved
```

**Rules:**
- Lead with user-visible impact, not implementation details
- Group related commits into single entries (5 auth commits → one "Authentication" entry)
- Use **bold feature names** with em-dash descriptions
- No commit hashes in the changelog (they're in git, not in prose)
- No internal scopes (phase-plan numbers, TDD markers, quick-NNN)
- Omit empty sections (no `### Changed` if nothing changed)
- End with: `Install/upgrade: \`npx @sienklogic/plan-build-run@latest\``

### Step 4 — User Review

Present the draft to the user:

Use AskUserQuestion:
```
question: "Here's the draft changelog for {version}. Review and approve?"
header: "Changelog Draft"
options:
  - label: "Looks good"        description: "Write this to CHANGELOG.md"
  - label: "Edit"              description: "I'll provide corrections or additions"
  - label: "Regenerate"        description: "Try again with different grouping"
  - label: "Cancel"            description: "Don't write anything"
```

- If "Looks good": proceed to Step 5
- If "Edit" or "Other": apply corrections, present again
- If "Regenerate": re-draft with user feedback incorporated, present again
- If "Cancel": exit without writing

### Step 5 — Write

1. **Write to CHANGELOG.md:**
   - For `draft`: insert the new entry after the file header, before existing versions
   - For `update`: replace the existing entry for that version

2. **Commit:**
   ```bash
   git add CHANGELOG.md
   git commit -m "docs: update changelog for {version}"
   ```

3. **Update GitHub Release** (if tag exists):

   Check if a GitHub release exists for this version:
   ```bash
   gh release view {tag} --json tagName 2>/dev/null
   ```

   If it exists, offer to update the release body:

   Use AskUserQuestion:
   ```
   question: "A GitHub release exists for {tag}. Update its release notes too?"
   header: "GitHub Release"
   options:
     - label: "Yes"    description: "Update the GitHub release body with the new notes"
     - label: "No"     description: "Only update CHANGELOG.md"
   ```

   If "Yes":
   ```bash
   gh release edit {tag} --notes-file - <<< "{changelog entry}"
   ```

### Step 6 — Confirm

Display:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► CHANGELOG UPDATED                          ║
╚══════════════════════════════════════════════════════════════╝

Version: {version}
Sections: {Added: N, Changed: N, Fixed: N}
File: CHANGELOG.md

{if GitHub release updated: "GitHub release also updated."}
```

---

## Anti-Patterns

1. **DO NOT** include commit hashes in changelog entries — this is user-facing prose
2. **DO NOT** use internal scopes (01-01, quick-003) — use descriptive feature names
3. **DO NOT** list every commit individually — group related work into features
4. **DO NOT** write the changelog without user confirmation via AskUserQuestion
5. **DO NOT** include TDD markers (RED, GREEN, REFACTOR) in descriptions
6. **DO NOT** skip empty section removal — no `### Changed` with no entries
