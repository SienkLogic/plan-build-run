#!/bin/bash
# PBR pane border state indicators
# Colors tmux pane borders based on PBR agent state:
#   green  = agent running (active skill set)
#   yellow = needs input (no active skill, session alive)
#   red    = error/stopped
#   default = no PBR project
#
# Usage: Source this file, then call update_pane_borders periodically
# or hook into PBR events.

# Find project dir (reuse pbr-state.sh logic)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/pbr-state.sh" 2>/dev/null || true

# Color constants (Catppuccin Mocha palette)
BORDER_GREEN="#a6e3a1"
BORDER_YELLOW="#f9e2af"
BORDER_RED="#f38ba8"
BORDER_DEFAULT="#585b70"

# Set pane border color for a specific pane
set_pane_border() {
  local pane_id="${1:-}"
  local color="${2:-$BORDER_DEFAULT}"
  if [[ -n "$pane_id" ]]; then
    tmux select-pane -t "$pane_id" -P "fg=$color" 2>/dev/null || true
    tmux set-option -p -t "$pane_id" pane-border-style "fg=$color" 2>/dev/null || true
    tmux set-option -p -t "$pane_id" pane-active-border-style "fg=$color" 2>/dev/null || true
  fi
}

# Detect PBR state and return appropriate color
detect_state_color() {
  local project_dir="${1:-}"
  [[ -d "$project_dir/.planning" ]] || { echo "$BORDER_DEFAULT"; return; }

  local active_skill="${project_dir}/.planning/.active-skill"
  local state_file="${project_dir}/.planning/STATE.md"

  # Check for active skill (agent running)
  if [[ -f "$active_skill" ]]; then
    local skill
    skill=$(cat "$active_skill" 2>/dev/null)
    if [[ -n "$skill" ]]; then
      echo "$BORDER_GREEN"
      return
    fi
  fi

  # Check STATE.md status
  if [[ -f "$state_file" ]]; then
    local status
    status=$(grep '^status:' "$state_file" 2>/dev/null | head -1 | cut -d: -f2 | xargs | tr -d '"')
    case "$status" in
      executing|building|planning|researching)
        echo "$BORDER_GREEN" ;;
      blocked|error)
        echo "$BORDER_RED" ;;
      *)
        echo "$BORDER_YELLOW" ;;
    esac
    return
  fi

  echo "$BORDER_DEFAULT"
}

# Update all pane borders in current window based on PBR state
update_pane_borders() {
  local project_dir
  project_dir=$(find_project_dir 2>/dev/null) || return 0

  local color
  color=$(detect_state_color "$project_dir")

  # Apply to all panes in current window
  local panes
  panes=$(tmux list-panes -F '#{pane_id}' 2>/dev/null) || return 0

  while IFS= read -r pane_id; do
    set_pane_border "$pane_id" "$color"
  done <<< "$panes"
}

# Main guard — allow sourcing without side effects
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  update_pane_borders
fi
