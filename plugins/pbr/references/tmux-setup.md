# TMUX Setup for Claude Code (Windows 11 + WSL2)

Complete guide to running Claude Code inside TMUX on Windows 11. Claude Code stays
installed on Windows; TMUX in WSL2 wraps it via `cmd.exe /c claude`. Projects remain
on Windows drives (e.g., `D:\Repos\`), accessed through WSL2's `/mnt/` mount.

## Prerequisites

- Windows 11 with WSL2 enabled (`wsl --install` if not already set up)
- A WSL2 distro installed (Ubuntu recommended: `wsl --install -d Ubuntu`)
- Claude Code installed on Windows (`npm install -g @anthropic-ai/claude-code`)
- Windows Terminal (recommended, available from Microsoft Store)

## Step 1: Install TMUX in WSL2

```bash
sudo apt update && sudo apt install -y tmux
tmux -V  # Should print tmux 3.x+
```

## Step 2: Install gum (optional but recommended)

gum provides polished interactive menus for `pbr-tmux`. Without it, `pbr-tmux` falls
back to plain bash `select` menus -- fully functional, just less pretty.

**Method A -- Charm apt repository (Ubuntu/Debian):**

```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg
echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" \
  | sudo tee /etc/apt/sources.list.d/charm.list
sudo apt update && sudo apt install gum
```

**Method B -- Direct binary download (any Linux distro):**

```bash
GUM_VERSION=$(curl -s https://api.github.com/repos/charmbracelet/gum/releases/latest | grep tag_name | cut -d'"' -f4 | tr -d v)
curl -fsSL "https://github.com/charmbracelet/gum/releases/download/v${GUM_VERSION}/gum_${GUM_VERSION}_Linux_x86_64.tar.gz" \
  | sudo tar xz -C /usr/local/bin gum
```

**Verify:** `gum --version`

## Step 3: Install .tmux.conf

Copy the PBR-optimized tmux configuration:

```bash
# From the plan-build-run repository root (WSL2 path):
cp /mnt/d/Repos/plan-build-run/.tmux.conf ~/.tmux.conf
```

**CRITICAL:** The config sets `default-terminal "tmux-256color"`. Do NOT change this to
`screen-256color` -- that causes Windows `.exe` processes (including `cmd.exe /c claude`)
to hang indefinitely in WSL2 tmux panes.

Key features provided by `.tmux.conf`:

- Mouse support (click panes, scroll, resize)
- 50,000-line scrollback history
- Vi copy-mode with clipboard integration (xclip or clip.exe)
- Vim-style pane navigation (`Ctrl-b h/j/k/l`)
- Intuitive splits (`Ctrl-b |` horizontal, `Ctrl-b -` vertical)
- PBR-aware status bar (shows current phase and status)

## Step 4: Set up PBR status bar

The status bar reads `.planning/STATE.md` every 10 seconds and displays the current
phase and workflow status in the bottom-right corner.

```bash
mkdir -p ~/.tmux
ln -sf /mnt/d/Repos/plan-build-run/tools/pbr-tmux/lib/pbr-state.sh ~/.tmux/pbr-status.sh
```

Point it at your project:

```bash
# Option A: Breadcrumb file (persists across sessions)
echo "/mnt/d/Repos/your-project" > ~/.pbr-project-path

# Option B: Environment variable (set in ~/.bashrc)
export PBR_PROJECT_DIR="/mnt/d/Repos/your-project"
```

The status bar shows `P{phase}:{status}` when a project is active, or `no-pbr` when
no `.planning/STATE.md` is found.

## Step 5: Set up pbr-tmux

`pbr-tmux` is the interactive CLI for common tmux operations in a PBR workflow.

```bash
# Option A: Symlink to PATH (recommended)
sudo ln -sf /mnt/d/Repos/plan-build-run/tools/pbr-tmux/pbr-tmux /usr/local/bin/pbr-tmux

# Option B: Add directory to PATH in ~/.bashrc
echo 'export PATH="/mnt/d/Repos/plan-build-run/tools/pbr-tmux:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Usage:

- `pbr-tmux` -- Interactive menu (uses gum if available, bash select otherwise)
- `pbr-tmux launch` -- Launch a Claude Code session in a new pane
- `pbr-tmux cycle` -- Send `/clear` + `/pbr:resume` to the Claude pane
- `pbr-tmux status` -- Show PBR project status
- `pbr-tmux list` -- List active tmux sessions
- `pbr-tmux --help` -- Full list of operations

Non-interactive mode for scripting: `pbr-tmux cycle --non-interactive`

## Step 6: Windows Terminal integration

Add a dedicated "PBR TMUX" profile to Windows Terminal:

1. Open Windows Terminal Settings (`Ctrl+,`) and click "Open JSON file"
2. Add the contents of `tools/pbr-tmux/windows-terminal-profile.json` to `profiles.list[]`:

```json
{
  "name": "PBR TMUX",
  "commandline": "wsl.exe -d Ubuntu -- bash -lc 'tmux new-session -A -s pbr'",
  "font": { "face": "JetBrainsMono Nerd Font", "size": 11 },
  "colorScheme": "One Half Dark",
  "padding": "4",
  "scrollbarState": "hidden"
}
```

**Notes:**

- Change `Ubuntu` in the commandline to match your WSL2 distro (`wsl -l -v` to check)
- Install JetBrainsMono Nerd Font from <https://www.nerdfonts.com/> for proper glyph
  rendering in the status bar and gum menus
- The `-A` flag in `tmux new-session -A -s pbr` attaches to an existing `pbr` session
  if one is running, or creates a new one

## Usage

### Starting a session

Click "PBR TMUX" in Windows Terminal, or from any WSL2 shell:

```bash
tmux new-session -A -s pbr
```

### Launching Claude Code

```bash
pbr-tmux launch
# Or directly:
cmd.exe /c claude
```

### Common workflows

**Split-pane monitoring:** Use `Ctrl-b |` to split horizontally, run `pbr-tmux status`
in the side pane while Claude works in the main pane.

**Multiple sessions:** `pbr-tmux launch` in different windows for parallel Claude
sessions. Use `pbr-tmux switch` to jump between them.

**Auto-cycle (Phase 80):** `pbr-tmux cycle --non-interactive` sends `/clear` then
`/pbr:resume` to the Claude pane for hands-free workflow continuation.

### Automatic Session Cycling via auto-continue.js

When running in autonomous mode with `features.auto_continue: true`, PBR automatically triggers session cycling based on `session_phase_limit` (default: 3 phases per session).

**How it works:**
1. `session-tracker.js` tracks completed phases in `.planning/.session-tracker`
2. Counter resets to 0 at session start (via `progress-tracker.js`)
3. Counter increments after each executor completion (via `event-handler.js`)
4. When `auto-continue.js` detects the limit is reached AND `process.env.TMUX` is set:
   - It spawns a detached process: `sleep 3 && tmux send-keys "/clear" Enter && sleep 1 && tmux send-keys "/pbr:resume" Enter`
   - The current session pauses, then a fresh session starts automatically
5. Outside TMUX, a banner displays manual instructions instead

**Configure the limit:**

```
/pbr:config session_phase_limit 5   # pause after 5 phases
/pbr:config session_phase_limit 0   # disable auto-pause
```

See `references/config-reference.md` for the full `session_phase_limit` specification.

## Troubleshooting

### Windows .exe hangs in tmux

**Symptom:** `cmd.exe /c claude`, `explorer.exe`, or other Windows executables freeze.

**Fix:** Check your terminal setting:

```bash
tmux show -g default-terminal
# Must output: tmux-256color
```

If it shows `screen-256color`, update `~/.tmux.conf` and kill the tmux server:

```bash
tmux kill-server
tmux  # Restart with new config
```

### Path issues

Windows drives mount at `/mnt/{letter}/` in WSL2. If Claude cannot find your project,
verify you are in the correct `/mnt/` path:

```bash
pwd               # Should show /mnt/d/Repos/your-project (not /home/user/...)
ls .planning/     # Should show STATE.md if PBR is set up
```

### Clipboard

Install `xclip` for full clipboard support (WSLg provides the X server on Windows 11):

```bash
sudo apt install xclip
```

Without xclip, tmux falls back to `clip.exe` which works for ASCII but may garble
Unicode characters.

### Font rendering

Fonts are controlled by Windows Terminal, not tmux. If status bar icons or gum menus
look broken, install a Nerd Font (JetBrainsMono Nerd Font recommended) and set it in
the Windows Terminal profile.

### Claude Code clipboard warnings

Cosmetic warnings about clipboard access. Install `xclip` to suppress them. These do
not affect Claude Code functionality.

### gum not found

`pbr-tmux` works without gum -- it falls back to bash `select` menus automatically.
Install gum (Step 2) for the polished interactive experience.

### tmux send-keys not working

Verify basic send-keys functionality:

```bash
tmux send-keys -t 0 "echo hello" Enter
```

If Claude is mid-processing when you send keys, keystrokes queue in the terminal
buffer. Add `sleep 0.5` between sequential `send-keys` commands for reliability.

For the critical `cmd.exe /c claude` path, verify:

```bash
tmux new-session -d -s test "cmd.exe /c claude"
sleep 3
tmux send-keys -t test "/help" Enter
```

### Status bar shows "no-pbr"

The status bar script cannot find `.planning/STATE.md`. Check:

1. `~/.pbr-project-path` points to the correct WSL2 path (use `/mnt/` prefix)
2. Or `PBR_PROJECT_DIR` environment variable is set
3. The project has a `.planning/STATE.md` file

## File Reference

| File | Purpose |
|------|---------|
| `.tmux.conf` | TMUX configuration (repo root) |
| `tools/pbr-tmux/pbr-tmux` | Main CLI entry point |
| `tools/pbr-tmux/operations.sh` | Operation implementations |
| `tools/pbr-tmux/lib/pbr-state.sh` | Status bar script |
| `tools/pbr-tmux/lib/tmux-helpers.sh` | Shared tmux helper functions |
| `tools/pbr-tmux/lib/gum-fallback.sh` | UI abstraction (gum/bash fallback) |
| `tools/pbr-tmux/windows-terminal-profile.json` | Windows Terminal profile fragment |
