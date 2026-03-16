#!/bin/bash
# PBR status bar segment for tmux
# Called by .tmux.conf: #(bash ~/.tmux/pbr-status.sh)
# Reads STATE.md frontmatter for current phase/status and context budget tier.

# Find project directory — check common locations
find_project_dir() {
  # Check PBR_PROJECT_DIR env var first
  if [[ -n "${PBR_PROJECT_DIR:-}" && -d "${PBR_PROJECT_DIR}/.planning" ]]; then
    echo "${PBR_PROJECT_DIR}"
    return
  fi
  # Check home directory breadcrumb
  if [[ -f "$HOME/.pbr-project-path" ]]; then
    local dir
    dir=$(cat "$HOME/.pbr-project-path")
    if [[ -d "${dir}/.planning" ]]; then
      echo "${dir}"
      return
    fi
  fi
  return 1
}

# Read context budget tier from bridge file
get_context_tier() {
  local project_dir="$1"
  local bridge_file="${project_dir}/.planning/.context-budget.json"
  [[ -f "$bridge_file" ]] || return 1

  # Check freshness — stale after 120s (tmux refreshes every 10s, generous window)
  local now file_time age
  now=$(date +%s)
  file_time=$(stat -c %Y "$bridge_file" 2>/dev/null || stat -f %m "$bridge_file" 2>/dev/null) || return 1
  age=$((now - file_time))
  [[ $age -lt 120 ]] || return 1

  # Extract tier and percentage
  local tier pct
  tier=$(grep -o '"last_warned_tier":"[^"]*"' "$bridge_file" 2>/dev/null | cut -d'"' -f4)
  pct=$(grep -o '"estimated_percent":[0-9]*' "$bridge_file" 2>/dev/null | cut -d: -f2)
  [[ -n "$pct" ]] || return 1

  # Color by tier
  local color
  case "${tier:-PEAK}" in
    PEAK|GOOD)      color="#a6e3a1" ;;  # green
    DEGRADING)      color="#f9e2af" ;;  # yellow
    POOR)           color="#fab387" ;;  # orange
    CRITICAL)       color="#f38ba8" ;;  # red
  esac
  printf "#[fg=%s]%s%%#[fg=#a6adc8] " "$color" "$pct"
}

# Main guard — allow sourcing without side effects
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  PROJECT_DIR=$(find_project_dir) || { printf "#[fg=#585b70]no-pbr "; exit 0; }
  STATE_FILE="${PROJECT_DIR}/.planning/STATE.md"

  if [[ ! -f "$STATE_FILE" ]]; then
    printf "#[fg=#585b70]no-pbr "
    exit 0
  fi

  phase=$(grep '^current_phase:' "$STATE_FILE" 2>/dev/null | head -1 | cut -d: -f2 | xargs)
  status=$(grep '^status:' "$STATE_FILE" 2>/dev/null | head -1 | cut -d: -f2 | xargs | tr -d '"')

  if [[ -n "$phase" && -n "$status" ]]; then
    # Phase and status
    printf "#[fg=#a6e3a1]P%s#[fg=#a6adc8]:%s " "$phase" "$status"
    # Context tier (if bridge data is fresh)
    get_context_tier "$PROJECT_DIR" 2>/dev/null || true
  else
    printf "#[fg=#585b70]no-pbr "
  fi
fi
