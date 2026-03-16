#!/bin/bash
# PBR context budget display for tmux status bar line 2
# Shows: context percentage, tier, and tool call count
# Called by tmux.conf: #(bash ~/.tmux/pbr-context.sh)

# Find project directory
find_project_dir() {
  if [[ -n "${PBR_PROJECT_DIR:-}" && -d "${PBR_PROJECT_DIR}/.planning" ]]; then
    echo "${PBR_PROJECT_DIR}"; return
  fi
  if [[ -f "$HOME/.pbr-project-path" ]]; then
    local dir; dir=$(cat "$HOME/.pbr-project-path")
    if [[ -d "${dir}/.planning" ]]; then echo "${dir}"; return; fi
  fi
  return 1
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  PROJECT_DIR=$(find_project_dir) || { printf "#[fg=#585b70]no context "; exit 0; }

  bridge="${PROJECT_DIR}/.planning/.context-budget.json"
  if [[ ! -f "$bridge" ]]; then
    printf "#[fg=#585b70]no context "
    exit 0
  fi

  # Check freshness — stale after 120s
  now=$(date +%s)
  file_time=$(stat -c %Y "$bridge" 2>/dev/null || stat -f %m "$bridge" 2>/dev/null) || { printf "#[fg=#585b70]stale "; exit 0; }
  age=$((now - file_time))
  if [[ $age -gt 120 ]]; then
    printf "#[fg=#585b70]stale "
    exit 0
  fi

  # Parse bridge data
  tier=$(grep -o '"last_warned_tier":"[^"]*"' "$bridge" 2>/dev/null | cut -d'"' -f4)
  pct=$(grep -o '"estimated_percent":[0-9]*' "$bridge" 2>/dev/null | cut -d: -f2)
  calls=$(grep -o '"tool_calls":[0-9]*' "$bridge" 2>/dev/null | cut -d: -f2)

  # Color by tier
  case "${tier:-PEAK}" in
    PEAK|GOOD)   color="#a6e3a1" ;;
    DEGRADING)   color="#f9e2af" ;;
    POOR)        color="#fab387" ;;
    CRITICAL)    color="#f38ba8" ;;
  esac

  # Build context bar (10 chars wide)
  filled=$((${pct:-0} / 10))
  empty=$((10 - filled))
  bar=""
  for ((i=0; i<filled; i++)); do bar+="█"; done
  for ((i=0; i<empty; i++)); do bar+="░"; done

  printf "#[fg=%s]%s %s%% %s#[fg=#585b70] | #[fg=#a6adc8]%s calls " \
    "$color" "$bar" "${pct:-0}" "${tier:-PEAK}" "${calls:-0}"
fi
