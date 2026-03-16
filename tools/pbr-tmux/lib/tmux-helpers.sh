#!/bin/bash
# Shared tmux helper functions for pbr-tmux

# Check if inside a tmux session
is_in_tmux() { [[ -n "${TMUX:-}" ]]; }

# Get current tmux session name
current_session() { tmux display-message -p '#S' 2>/dev/null; }

# Get current pane ID
current_pane() { tmux display-message -p '#P' 2>/dev/null; }

# List active tmux sessions (name only)
list_sessions() { tmux list-sessions -F '#S' 2>/dev/null; }

# Check if a named session exists
session_exists() { tmux has-session -t "$1" 2>/dev/null; }

# Translate Windows path to WSL mount path
# D:\Repos\project -> /mnt/d/Repos/project
win_to_wsl_path() {
  local winpath="$1"
  # Replace backslashes with forward slashes
  winpath="${winpath//\\//}"
  # Convert drive letter: D:/... -> /mnt/d/...
  if [[ "$winpath" =~ ^([A-Za-z]):/(.*) ]]; then
    local drive="${BASH_REMATCH[1],,}"  # lowercase
    local rest="${BASH_REMATCH[2]}"
    echo "/mnt/${drive}/${rest}"
  else
    echo "$winpath"
  fi
}

# Launch Claude Code in current pane via cmd.exe
launch_claude() {
  local project_dir="${1:-.}"
  cmd.exe /c claude "$project_dir"
}

# Send keystrokes to a tmux pane (for Phase 80 auto-cycle)
send_keys_to_pane() {
  local target="${1:-}"
  shift
  tmux send-keys -t "$target" "$@"
}
