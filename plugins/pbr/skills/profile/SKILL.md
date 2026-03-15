---
name: profile
description: "Switch the active model profile. Presets: quality, balanced, budget, adaptive. Supports custom profiles from config.json model_profiles."
allowed-tools: Read, Write, Bash, AskUserQuestion
argument-hint: "[quality|balanced|budget|adaptive|<custom>]"
---

**STOP — DO NOT READ THIS FILE. You are already reading it. This prompt was injected into your context by Claude Code's plugin system. Begin executing Step 0 immediately.**

# /pbr:set-profile — Model Profile Manager

You are running the **profile** skill. Your job is to show the current model profile or switch to a new one by writing model assignments to `.planning/config.json`.

## Step 0 — Immediate Output

**Before ANY tool calls**, display this banner:

```
╔══════════════════════════════════════════════════════════════╗
║  PLAN-BUILD-RUN ► MODEL PROFILE                              ║
╚══════════════════════════════════════════════════════════════╝
```

Then proceed to Step 1.

## Step 1 — Load Config

Read `.planning/config.json`.

If the file does not exist, output:

```
Error: .planning/config.json not found. Run /pbr:new-project first.
```

Stop immediately.

## Step 2 — Parse Arguments

Extract the first word from `$ARGUMENTS` as the profile name. Trim whitespace.

- If `$ARGUMENTS` is empty or blank → **show-mode** (go to Step 3).
- If a profile name is present → **switch-mode** (go to Step 4).

## Step 3 — Show Mode (no argument)

Display the current profile status and available options.

1. Read `config.json` key `model_profile`. If absent, treat as `"balanced"`.
2. Read `config.json` key `models` (object). If absent, use empty object.
3. Read `config.json` key `model_profiles` (object, optional custom profiles). If absent, use empty object.

Output the following (fill in actual values):

```
Active profile: <model_profile value>

Current model assignments:
  researcher          : <models.researcher or "not set">
  planner             : <models.planner or "not set">
  executor            : <models.executor or "not set">
  verifier            : <models.verifier or "not set">
  integration_checker : <models.integration_checker or "not set">
  debugger            : <models.debugger or "not set">
  mapper              : <models.mapper or "not set">
  synthesizer         : <models.synthesizer or "not set">

Available presets:
  quality   — all agents use opus (maximum capability)
  balanced  — mix of sonnet/inherit/haiku (default)
  budget    — all agents use haiku (minimum cost)
  adaptive  — sonnet for planning/verification, inherit/haiku for execution
```

If `model_profiles` has any keys, also display:

```
Custom profiles:
  <profile-name>  — <key count> model overrides
```

Output: "Run `/pbr:set-profile <name>` to switch profiles."

Stop. Do not write anything.

## Step 4 — Switch Mode (argument provided)

### Step 4a — Validate Profile Name

Built-in preset names: `quality`, `balanced`, `budget`, `adaptive`.

Custom profile names: keys in `config.json model_profiles` (if any).

If the provided name does not match any of the above:

```
Error: Unknown profile "<name>".

Valid presets: quality, balanced, budget, adaptive
<list any custom profile names from config.json model_profiles, if any>

Run `/pbr:set-profile` to see the current status.
```

Stop immediately.

### Step 4b — Resolve Model Values

Use the preset table to resolve model values:

| Agent               | quality | balanced | budget | adaptive |
|---------------------|---------|----------|--------|----------|
| researcher          | opus    | sonnet   | haiku  | sonnet   |
| planner             | opus    | inherit  | haiku  | sonnet   |
| executor            | opus    | inherit  | haiku  | inherit  |
| verifier            | opus    | sonnet   | haiku  | sonnet   |
| integration_checker | sonnet  | sonnet   | haiku  | haiku    |
| debugger            | opus    | inherit  | haiku  | inherit  |
| mapper              | sonnet  | sonnet   | haiku  | haiku    |
| synthesizer         | sonnet  | haiku    | haiku  | haiku    |

For a **custom profile** (name found in `config.json model_profiles`):
- Start with the `balanced` defaults from the table above.
- Overlay any keys present in `config.json model_profiles[<name>]`.
- Any agents not specified in the custom profile use the balanced default.

### Step 4c — Write to config.json

Update `config.json` using the Bash tool with `node -e` inline script:

```bash
node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('.planning/config.json', 'utf8'));
cfg.model_profile = '<name>';
cfg.models = cfg.models || {};
cfg.models.researcher = '<value>';
cfg.models.planner = '<value>';
cfg.models.executor = '<value>';
cfg.models.verifier = '<value>';
cfg.models.integration_checker = '<value>';
cfg.models.debugger = '<value>';
cfg.models.mapper = '<value>';
cfg.models.synthesizer = '<value>';
fs.writeFileSync('.planning/config.json', JSON.stringify(cfg, null, 2));
console.log('OK');
"
```

Replace each `<value>` with the resolved model string for that agent. Replace `<name>` with the profile name.

### Step 4d — Confirm

Output:

```
Active profile set to: <name>

Model assignments updated:
  researcher          : <value>
  planner             : <value>
  executor            : <value>
  verifier            : <value>
  integration_checker : <value>
  debugger            : <value>
  mapper              : <value>
  synthesizer         : <value>

Config written to .planning/config.json.
Run /pbr:set-profile to verify.
```

Stop. Done.
