---
phase: "19-shared-file-write-safety"
plan: "19-02"
wave: 1
speculative: true
depends_on: []
files_modified:
  - "plugins/pbr/skills/autonomous/SKILL.md"
  - "plugins/pbr/skills/build/SKILL.md"
  - "plugins/pbr/skills/plan/SKILL.md"
  - "plugins/pbr/skills/review/SKILL.md"
  - "plugins/pbr/skills/quick/SKILL.md"
must_haves:
  truths:
    - "No audited SKILL.md instructs direct Write to STATE.md or ROADMAP.md where a CLI equivalent exists"
    - "Every state mutation in the audited skills routes through pbr-tools.js CLI commands"
  artifacts:
    - "Updated SKILL.md files replacing direct Write instructions with CLI equivalents for STATE.md/ROADMAP.md mutations"
  key_links:
    - "Audited skills reference pbr-tools.js state update / roadmap update-status instead of Write tool for mutations"
implements: []
provides:
  - "Skill-level enforcement of CLI-only STATE.md and ROADMAP.md mutations"
consumes: []
---

<task id="19-02-T1" type="auto" tdd="false" complexity="medium">
<name>Audit SKILL.md files for direct Write to STATE.md and ROADMAP.md</name>
<read_first>
plugins/pbr/skills/build/SKILL.md
plugins/pbr/skills/plan/SKILL.md
plugins/pbr/skills/autonomous/SKILL.md
plugins/pbr/skills/review/SKILL.md
plugins/pbr/skills/quick/SKILL.md
</read_first>
<files>
plugins/pbr/skills/build/SKILL.md
plugins/pbr/skills/plan/SKILL.md
plugins/pbr/skills/autonomous/SKILL.md
plugins/pbr/skills/review/SKILL.md
plugins/pbr/skills/quick/SKILL.md
</files>
<action>
Audit and fix direct Write instructions targeting STATE.md and ROADMAP.md in priority skills.

**Audit scope:** Search each SKILL.md for instructions that tell Claude to use the Write tool (or `Edit` tool) directly on `.planning/STATE.md` or `.planning/ROADMAP.md` for state mutation purposes. Creation-time writes (e.g., `begin` generating STATE.md from template for the first time) are exempt — only mutation writes need CLI replacement.

**For each direct-write instruction found, replace with the CLI equivalent:**

STATE.md mutation patterns → CLI replacements:
- `Write/Edit .planning/STATE.md` with status field → `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update status <value>`
- `Write/Edit .planning/STATE.md` with current_phase → `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update current_phase <N>`
- `Write/Edit .planning/STATE.md` with plans_complete → `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update plans_complete <N>`
- General STATE.md field update → `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update <field> <value>`
- Activity recording → `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state record-activity "<message>"`

ROADMAP.md mutation patterns → CLI replacements:
- Phase status update → `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-status <phase> <status>`
- Plans count update → `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js roadmap update-plans <phase> <completed> <total>`

**Specific files to check and fix:**

1. `build/SKILL.md`: The Metrics section write to STATE.md (Step 8b area) — check if it uses direct Write. If yes, replace with CLI. The "Tooling shortcut" block already uses CLI — verify it's the primary instruction, not a fallback. Check the fallback instruction `"If CLI unavailable, manually edit..."` — keep the fallback but mark it as last-resort only.

2. `plan/SKILL.md`: Check Step 8 (post-planning state update) — should already use CLI (planner agent calls pbr-tools). Verify. If any direct Write exists, replace.

3. `autonomous/SKILL.md`: Check all phase iteration state update steps. Autonomous skill orchestrates phase transitions — verify each STATE.md and ROADMAP.md update in the phase loop uses CLI.

4. `review/SKILL.md`: Check state update steps after verification. Should use CLI. Replace any direct Write instructions.

5. `quick/SKILL.md`: Check SUMMARY state sync steps. Replace any direct Write instructions.

**Do NOT change:**
- Read instructions (reading STATE.md/ROADMAP.md via Read tool is fine — reads are safe)
- Template-based creation writes (e.g., begin skill generating STATE.md from template for the first time)
- The content of the Metrics or History sections themselves — only the write mechanism

**After each replacement, add a comment in the SKILL.md** (as a markdown note, e.g., `> Note: Use CLI for atomic writes — direct Write bypasses file locking.`) immediately before the CLI command block, if one does not already exist.
</action>
<acceptance_criteria>
grep -rn "Write.*\.planning/STATE\.md\|Edit.*\.planning/STATE\.md" plugins/pbr/skills/build/SKILL.md plugins/pbr/skills/plan/SKILL.md plugins/pbr/skills/autonomous/SKILL.md plugins/pbr/skills/review/SKILL.md plugins/pbr/skills/quick/SKILL.md || echo "NO_DIRECT_WRITES_FOUND"
grep -c "pbr-tools.js state update\|pbr-tools.js roadmap update" plugins/pbr/skills/build/SKILL.md
</acceptance_criteria>
<verify>
node -e "
const fs = require('fs');
const skills = ['build', 'plan', 'autonomous', 'review', 'quick'];
let issues = [];
for (const s of skills) {
  const content = fs.readFileSync('plugins/pbr/skills/' + s + '/SKILL.md', 'utf8');
  // Check for direct Write instructions to STATE.md (mutation context)
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (line.match(/Write.*\.planning.STATE\.md|Edit.*\.planning.STATE\.md/) && !line.startsWith('>') && !line.includes('# ')) {
      issues.push(s + ':' + (i+1) + ': ' + line.trim());
    }
  });
}
if (issues.length > 0) {
  console.log('REMAINING DIRECT WRITES:', issues.join('\n'));
} else {
  console.log('PASS: No direct Write instructions to STATE.md found in audited skills');
}
"
</verify>
<done>
The verify script prints "PASS: No direct Write instructions to STATE.md found in audited skills". The grep for pbr-tools.js references in build/SKILL.md returns a count > 0.
</done>
</task>

<task id="19-02-T2" type="auto" tdd="false" complexity="simple">
<name>Add bypass warning note to universal-anti-patterns.md</name>
<read_first>
plugins/pbr/skills/shared/universal-anti-patterns.md
</read_first>
<files>
plugins/pbr/skills/shared/universal-anti-patterns.md
</files>
<action>
Add a new anti-pattern rule to `universal-anti-patterns.md` under the "State Consolidation Anti-Patterns" section (rules 23-25).

Add rule 26:

```markdown
**Rule 26 — No direct Write/Edit to STATE.md or ROADMAP.md for mutations.**
Always use `node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js state update <field> <value>` or `roadmap update-status <phase> <status>` for mutations. Direct Write tool usage bypasses `lockedFileUpdate()` and is unsafe in multi-session environments. Exception: first-time creation of STATE.md from template (e.g., during `/pbr:begin`) is allowed.
```

Insert this rule directly after the existing rule 25 entry. Do not renumber existing rules. If rules 23-25 use different numbering/formatting, match the existing style.
</action>
<acceptance_criteria>
grep -n "Rule 26\|direct Write.*STATE\|direct Write.*ROADMAP" plugins/pbr/skills/shared/universal-anti-patterns.md
</acceptance_criteria>
<verify>
grep -c "lockedFileUpdate\|direct Write" plugins/pbr/skills/shared/universal-anti-patterns.md
</verify>
<done>
grep finds "Rule 26" (or equivalent anti-pattern text) in universal-anti-patterns.md. The file references lockedFileUpdate.
</done>
</task>

## Summary

**Plan:** 19-02 | **Wave:** 1 | **Speculative:** true

### Tasks
1. **19-02-T1** — Audit and fix direct Write instructions to STATE.md/ROADMAP.md in build, plan, autonomous, review, quick SKILL.md files
2. **19-02-T2** — Add Rule 26 to universal-anti-patterns.md prohibiting direct Write to STATE.md/ROADMAP.md for mutations

### Key Files
- `plugins/pbr/skills/build/SKILL.md` (modified)
- `plugins/pbr/skills/plan/SKILL.md` (modified)
- `plugins/pbr/skills/autonomous/SKILL.md` (modified)
- `plugins/pbr/skills/review/SKILL.md` (modified)
- `plugins/pbr/skills/quick/SKILL.md` (modified)
- `plugins/pbr/skills/shared/universal-anti-patterns.md` (modified)

### Must-Haves
- Truths: No audited SKILL.md instructs direct Write to STATE.md/ROADMAP.md for mutations
- Artifacts: Updated SKILL.md files with CLI-only state mutations
- Key Links: Skills reference pbr-tools.js CLI for all STATE.md/ROADMAP.md mutations

### Provides / Consumes
- **Provides:** Skill-level enforcement of CLI-only STATE.md and ROADMAP.md mutations
- **Consumes:** Nothing
