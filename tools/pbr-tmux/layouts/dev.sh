#!/bin/bash
# PBR Layout: dev
# Main pane (top-left): Claude Code (--dangerously-skip-permissions)
# Right pane (35%): live PBR watch (phase, context, commits)
# Bottom pane (25%): interactive shell at project root
#
# Usage: dev.sh <project-path>
#   project-path: WSL path to project (e.g., /mnt/d/Repos/plan-build-run)

set -euo pipefail

PROJECT_DIR="${1:?Usage: dev.sh <project-path>}"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "Error: Directory not found: $PROJECT_DIR" >&2
  exit 1
fi

PROJECT_NAME="$(basename "$PROJECT_DIR")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Capture the current pane ID (works regardless of pane-base-index)
MAIN_PANE="$(tmux display-message -p '#{pane_id}')"

# Rename the window to the project name
tmux rename-window "$PROJECT_NAME"

# --- Right pane: PBR watch (35% width) ---
# Shows phase, context tier, recent commits, active skill — refreshes every 5s
WATCH_SCRIPT='
while true; do
  clear
  echo "╔══════════════════════════════════════╗"
  echo "║  PBR WATCH — '"$PROJECT_NAME"'"
  echo "╚══════════════════════════════════════╝"
  echo ""

  state="'"$PROJECT_DIR"'/.planning/STATE.md"
  if [[ -f "$state" ]]; then
    phase=$(grep "^current_phase:" "$state" 2>/dev/null | head -1 | cut -d: -f2 | xargs)
    status=$(grep "^status:" "$state" 2>/dev/null | head -1 | cut -d: -f2 | xargs | tr -d "\"")
    slug=$(grep "^phase_slug:" "$state" 2>/dev/null | head -1 | cut -d: -f2 | xargs | tr -d "\"")
    pct=$(grep "^progress_percent:" "$state" 2>/dev/null | head -1 | cut -d: -f2 | xargs)
    plans_done=$(grep "^plans_complete:" "$state" 2>/dev/null | head -1 | cut -d: -f2 | xargs)
    plans_total=$(grep "^plans_total:" "$state" 2>/dev/null | head -1 | cut -d: -f2 | xargs)
    printf "  Phase %s: %s\n" "$phase" "$slug"
    printf "  Status: %s\n" "$status"
    printf "  Plans: %s/%s | Progress: %s%%\n" "${plans_done:-0}" "${plans_total:-0}" "${pct:-0}"
  else
    echo "  No .planning/STATE.md"
  fi
  echo ""

  bridge="'"$PROJECT_DIR"'/.planning/.context-budget.json"
  if [[ -f "$bridge" ]]; then
    tier=$(grep -o "\"last_warned_tier\":\"[^\"]*\"" "$bridge" 2>/dev/null | cut -d"\"" -f4)
    est=$(grep -o "\"estimated_percent\":[0-9]*" "$bridge" 2>/dev/null | cut -d: -f2)
    calls=$(grep -o "\"tool_calls\":[0-9]*" "$bridge" 2>/dev/null | cut -d: -f2)
    chars=$(grep -o "\"chars_read\":[0-9]*" "$bridge" 2>/dev/null | cut -d: -f2)
    printf "  Context: %s%% [%s]\n" "${est:-?}" "${tier:-PEAK}"
    printf "  Tool calls: %s | Chars read: %s\n" "${calls:-0}" "${chars:-0}"
  fi
  echo ""

  skill_file="'"$PROJECT_DIR"'/.planning/.active-skill"
  if [[ -f "$skill_file" ]]; then
    printf "  Active: %s\n" "$(cat "$skill_file")"
    echo ""
  fi

  echo "  Recent commits:"
  git -C "'"$PROJECT_DIR"'" log --oneline -8 2>/dev/null | sed "s/^/    /" || echo "    (no git)"

  sleep 5
done
'
tmux split-window -h -l 35% -c "$PROJECT_DIR" "bash -c '$WATCH_SCRIPT'"

# --- Bottom pane: shell at project root (25% height, on the main/left pane) ---
tmux select-pane -t "$MAIN_PANE"
tmux split-window -v -l 25% -c "$PROJECT_DIR" "exec bash -l"

# --- Main pane (top-left): launch Claude Code ---
tmux select-pane -t "$MAIN_PANE"
tmux send-keys -t "$MAIN_PANE" "cd '$PROJECT_DIR' && cmd.exe /c claude --dangerously-skip-permissions" Enter
