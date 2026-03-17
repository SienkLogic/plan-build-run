---
description: "Update PBR to latest version with changelog display"
allowed-tools:
  - Bash
  - AskUserQuestion
---

<objective>
Check for PBR updates, install if available, and display what changed.
</objective>

<process>
## 1. Detect Current Version

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/pbr-tools.js help 2>/dev/null | head -1
cat ${CLAUDE_PLUGIN_ROOT}/package.json 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).version)" 2>/dev/null
```

## 2. Check Latest Version

```bash
npm view plan-build-run version 2>/dev/null
```

## 3. Compare and Offer Update

If newer version available, display changelog and ask for confirmation.

```bash
npm install -g plan-build-run@latest
```

## 4. Post-Update

Display: "Updated to v{version}. Restart Claude Code to use the new version."
</process>
