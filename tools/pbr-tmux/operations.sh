#!/bin/bash
# Operation definitions for pbr-tmux
# Each operation is an op_* function registered in the OPERATIONS array.

# --- PBR-Specific Operations ---

op_launch_claude() {
  local project_dir
  project_dir="${1:-$(pwd)}"
  local wsl_path
  wsl_path=$(win_to_wsl_path "$project_dir" 2>/dev/null || echo "$project_dir")
  cd "$wsl_path" 2>/dev/null || cd "$project_dir" || true
  cmd.exe /c claude
}

# Directories to scan for PBR projects
# Override with PBR_SCAN_DIRS env var (colon-separated) or ~/.pbr-scan-dirs (one per line)
_load_scan_dirs() {
  if [[ -n "${PBR_SCAN_DIRS_OVERRIDE:-}" ]]; then
    IFS=':' read -ra dirs <<< "$PBR_SCAN_DIRS_OVERRIDE"
    printf '%s\n' "${dirs[@]}"
  elif [[ -f "$HOME/.pbr-scan-dirs" ]]; then
    grep -v '^#' "$HOME/.pbr-scan-dirs" | grep -v '^$'
  else
    # Defaults — add more paths here or use ~/.pbr-scan-dirs
    echo "/mnt/d/Repos"
    echo "/mnt/d/Repos-Work"
  fi
}
mapfile -t PBR_SCAN_DIRS < <(_load_scan_dirs)

# Select a project directory interactively
# Scans PBR_SCAN_DIRS for subdirectories containing .planning/
select_project() {
  local projects=()

  for base_dir in "${PBR_SCAN_DIRS[@]}"; do
    [[ -d "$base_dir" ]] || continue
    while IFS= read -r dir; do
      if [[ -d "$dir/.planning" ]]; then
        local base_name="$(basename "$base_dir")"
        local proj_name="$(basename "$dir")"
        projects+=("${base_name}/${proj_name}|${dir}")
      fi
    done < <(find "$base_dir" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort)
  done

  if [[ ${#projects[@]} -eq 0 ]]; then
    echo "No PBR projects found in: ${PBR_SCAN_DIRS[*]}" >&2
    return 1
  fi

  local display=()
  for entry in "${projects[@]}"; do
    display+=("${entry%%|*}")
  done

  local choice
  choice=$(printf '%s\n' "${display[@]}" | ui_choose "Select project") || return 1
  choice=$(echo "$choice" | xargs)

  for entry in "${projects[@]}"; do
    if [[ "${entry%%|*}" == "$choice" ]]; then
      echo "${entry##*|}"
      return 0
    fi
  done
  return 1
}

op_start() {
  # Select a project, apply a layout, and launch Claude
  local layout="${1:-dev}"

  if ! is_in_tmux; then
    echo "Error: Not in a tmux session. Start tmux first." >&2
    return 1
  fi

  local layout_script
  layout_script="$(dirname "${BASH_SOURCE[0]}")/layouts/${layout}.sh"
  if [[ ! -f "$layout_script" ]]; then
    echo "Error: Layout '$layout' not found at $layout_script" >&2
    echo "Available layouts:" >&2
    ls "$(dirname "${BASH_SOURCE[0]}")/layouts/"*.sh 2>/dev/null | xargs -I{} basename {} .sh >&2
    return 1
  fi

  local project_dir
  project_dir=$(select_project) || return 1

  echo "$project_dir" > "$HOME/.pbr-project-path"
  ui_header "Starting: $(basename "$project_dir") [layout: $layout]"

  bash "$layout_script" "$project_dir"
}

op_cycle_session() {
  # Send /clear + /pbr:resume to current Claude pane
  # Used by auto-continue.js for session cycling
  # Can be called from within tmux OR externally (e.g., wsl.exe bridge from Windows)
  local target="${1:-}"
  if [[ -z "$target" ]] && is_in_tmux; then
    target=$(current_pane)
  fi
  if [[ -z "$target" ]]; then
    # Not in tmux — find the Claude pane in the most recently attached session
    # Used when called externally (e.g., wsl.exe bridge from Windows auto-continue.js)
    local attached_session
    attached_session=$(tmux list-sessions -F '#{session_name}' -f '#{session_attached}' 2>/dev/null | head -1)
    if [[ -n "$attached_session" ]]; then
      # Find the first window and first pane (respects base-index settings in .tmux.conf)
      local first_window first_pane
      first_window=$(tmux list-windows -t "$attached_session" -F '#{window_index}' 2>/dev/null | head -1)
      first_pane=$(tmux list-panes -t "${attached_session}:${first_window}" -F '#{pane_index}' 2>/dev/null | head -1)
      target="${attached_session}:${first_window}.${first_pane}"
    fi
  fi
  if [[ -z "$target" ]]; then
    echo "Error: No target pane specified and no attached tmux session found" >&2
    return 1
  fi
  send_keys_to_pane "$target" "/clear" Enter
  sleep 0.5
  send_keys_to_pane "$target" "/pbr:resume-work" Enter
}

op_show_pbr_status() {
  # Display current PBR state (phase, status, config summary)
  bash "$(dirname "${BASH_SOURCE[0]}")/lib/pbr-state.sh"
  echo ""  # newline after status
}

op_open_dashboard() {
  # Launch PBR dashboard in a new split pane
  if ! is_in_tmux; then
    echo "Error: Not in a tmux session" >&2
    return 1
  fi
  tmux split-window -h "npm run dashboard -- --dir '$(pwd)'"
}

op_watch() {
  # Live-updating PBR state view in a split pane
  # Shows: phase progress, context budget, recent commits, active agent
  if ! is_in_tmux; then
    echo "Error: Not in a tmux session" >&2
    return 1
  fi
  local project_dir
  project_dir=$(cat "$HOME/.pbr-project-path" 2>/dev/null || echo "$(pwd)")

  local watch_script='
    while true; do
      clear
      echo "╔══════════════════════════════════════╗"
      echo "║  PBR WATCH — $(basename "'"$project_dir"'")  "
      echo "╚══════════════════════════════════════╝"
      echo ""

      # Phase & status from STATE.md
      if [[ -f "'"$project_dir"'/.planning/STATE.md" ]]; then
        phase=$(grep "^current_phase:" "'"$project_dir"'/.planning/STATE.md" 2>/dev/null | head -1 | cut -d: -f2 | xargs)
        status=$(grep "^status:" "'"$project_dir"'/.planning/STATE.md" 2>/dev/null | head -1 | cut -d: -f2 | xargs | tr -d "\"")
        slug=$(grep "^phase_slug:" "'"$project_dir"'/.planning/STATE.md" 2>/dev/null | head -1 | cut -d: -f2 | xargs | tr -d "\"")
        pct=$(grep "^progress_percent:" "'"$project_dir"'/.planning/STATE.md" 2>/dev/null | head -1 | cut -d: -f2 | xargs)
        printf "  Phase: %s (%s)\n" "$phase" "$slug"
        printf "  Status: %s | Progress: %s%%\n" "$status" "$pct"
      else
        echo "  No .planning/STATE.md"
      fi
      echo ""

      # Context budget from bridge file
      bridge="'"$project_dir"'/.planning/.context-budget.json"
      if [[ -f "$bridge" ]]; then
        tier=$(grep -o "\"last_warned_tier\":\"[^\"]*\"" "$bridge" 2>/dev/null | cut -d"\"" -f4)
        est=$(grep -o "\"estimated_percent\":[0-9]*" "$bridge" 2>/dev/null | cut -d: -f2)
        calls=$(grep -o "\"tool_calls\":[0-9]*" "$bridge" 2>/dev/null | cut -d: -f2)
        printf "  Context: %s%% (%s) | Tool calls: %s\n" "${est:-?}" "${tier:-PEAK}" "${calls:-0}"
      else
        echo "  Context: no bridge data"
      fi
      echo ""

      # Recent commits (last 5)
      echo "  Recent commits:"
      git -C "'"$project_dir"'" log --oneline -5 2>/dev/null | sed "s/^/    /" || echo "    (no git)"
      echo ""

      # Active skill
      skill_file="'"$project_dir"'/.planning/.active-skill"
      if [[ -f "$skill_file" ]]; then
        printf "  Active skill: %s\n" "$(cat "$skill_file")"
      fi

      sleep 5
    done
  '
  tmux split-window -h -l 40% "bash -c '$watch_script'"
}

op_multi() {
  # Launch multiple Claude Code sessions for parallel phase work
  if ! is_in_tmux; then
    echo "Error: Not in a tmux session" >&2
    return 1
  fi

  local count="${1:-2}"
  if [[ "$count" -lt 2 || "$count" -gt 4 ]]; then
    echo "Usage: pbr-tmux multi [2-4]  (default: 2)" >&2
    return 1
  fi

  local project_dir
  project_dir=$(cat "$HOME/.pbr-project-path" 2>/dev/null || echo "$(pwd)")

  ui_header "Launching $count parallel Claude sessions"
  echo "Project: $(basename "$project_dir")"
  echo ""

  # First session is current pane
  echo "Session 1: current pane"
  tmux send-keys "cd '$project_dir' && cmd.exe /c claude --dangerously-skip-permissions" Enter

  # Additional sessions in new panes
  for ((i=2; i<=count; i++)); do
    echo "Session $i: new pane"
    if [[ $((i % 2)) -eq 0 ]]; then
      tmux split-window -h -c "$project_dir" "cmd.exe /c claude --dangerously-skip-permissions; exec bash"
    else
      tmux split-window -v -c "$project_dir" "cmd.exe /c claude --dangerously-skip-permissions; exec bash"
    fi
  done

  # Balance the layout
  tmux select-layout tiled
  echo ""
  echo "All $count sessions launching. Use Ctrl-b + arrow keys to navigate."
}

# --- General TMUX Operations ---

op_split_horizontal() {
  tmux split-window -v -c "#{pane_current_path}"
}

op_split_vertical() {
  tmux split-window -h -c "#{pane_current_path}"
}

op_rename_window() {
  local name
  name=$(ui_input "New window name:" "dev")
  if [[ -n "$name" ]]; then
    tmux rename-window "$name"
  fi
}

op_rename_session() {
  local name
  name=$(ui_input "New session name:" "work")
  if [[ -n "$name" ]]; then
    tmux rename-session "$name"
  fi
}

op_swap_panes() {
  tmux swap-pane -U
}

op_kill_pane() {
  if ui_confirm "Kill current pane?"; then
    tmux kill-pane
  fi
}

op_kill_session() {
  if ui_confirm "Kill current session? This will close all panes."; then
    tmux kill-session
  fi
}

op_detach() {
  tmux detach-client
}

op_list_sessions() {
  tmux list-sessions
}

op_switch_session() {
  local sessions
  sessions=$(tmux list-sessions -F "#{session_name}" 2>/dev/null)
  if [[ -z "$sessions" ]]; then
    echo "No other sessions found" >&2
    return 1
  fi
  local choice
  choice=$(echo "$sessions" | ui_choose "Switch to session") || return 0
  tmux switch-client -t "$choice"
}

op_search() {
  # Search past Claude Code session transcripts by keyword
  # Finds matching sessions and offers to resume them
  local keyword="${1:-}"
  if [[ -z "$keyword" ]]; then
    keyword=$(ui_input "Search keyword:" "")
    [[ -n "$keyword" ]] || { echo "No keyword provided" >&2; return 1; }
  fi

  # Claude Code stores sessions in ~/.claude/projects/{encoded-path}/*.jsonl
  local sessions_dir="$HOME/.claude/projects"
  if [[ ! -d "$sessions_dir" ]]; then
    echo "No Claude Code sessions found at $sessions_dir" >&2
    return 1
  fi

  echo "Searching for '$keyword' in Claude Code sessions..."
  echo ""

  local results=()
  local count=0
  while IFS= read -r jsonl_file; do
    if grep -l -i "$keyword" "$jsonl_file" &>/dev/null; then
      # Extract session info
      local project_path
      project_path=$(dirname "$jsonl_file" | xargs basename | sed 's/-/\//g' | sed 's/^\///; s/\/$//')
      local session_id
      session_id=$(basename "$jsonl_file" .jsonl)
      local mod_time
      mod_time=$(stat -c '%Y' "$jsonl_file" 2>/dev/null || stat -f '%m' "$jsonl_file" 2>/dev/null)
      local mod_date
      mod_date=$(date -d "@$mod_time" '+%Y-%m-%d %H:%M' 2>/dev/null || date -r "$mod_time" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "unknown")
      local match_count
      match_count=$(grep -c -i "$keyword" "$jsonl_file" 2>/dev/null || echo 0)

      results+=("${mod_date} | ${match_count} matches | ${session_id:0:8}... | ${project_path}")
      count=$((count + 1))
    fi
  done < <(find "$sessions_dir" -name "*.jsonl" -type f 2>/dev/null | sort -r)

  if [[ $count -eq 0 ]]; then
    echo "No sessions found matching '$keyword'"
    return 0
  fi

  echo "Found $count sessions matching '$keyword':"
  echo ""

  if [[ "$NON_INTERACTIVE" == "true" ]]; then
    printf '%s\n' "${results[@]}"
    return 0
  fi

  local choice
  choice=$(printf '%s\n' "${results[@]}" | ui_choose "Select session to resume") || return 0

  # Extract session ID from choice
  local selected_id
  selected_id=$(echo "$choice" | grep -o '[a-f0-9]\{8\}' | head -1)

  # Find the full session ID
  local full_id
  full_id=$(find "$sessions_dir" -name "${selected_id}*.jsonl" -type f 2>/dev/null | head -1 | xargs basename 2>/dev/null | sed 's/.jsonl$//')

  if [[ -n "$full_id" ]]; then
    # Extract project directory from the path
    local project_dir_encoded
    project_dir_encoded=$(find "$sessions_dir" -name "${selected_id}*.jsonl" -type f 2>/dev/null | head -1 | xargs dirname | xargs basename)

    echo ""
    echo "Resuming session: $full_id"
    echo "Project: $project_dir_encoded"
    echo ""

    if is_in_tmux; then
      tmux send-keys "claude --resume $full_id" Enter
    else
      echo "Run: claude --resume $full_id"
    fi
  else
    echo "Could not find full session ID for: $selected_id" >&2
    return 1
  fi
}

op_toggle_mouse() {
  tmux set mouse
  echo "Mouse mode toggled"
}

op_copy_mode() {
  tmux copy-mode
}

op_show_keys() {
  tmux list-keys | head -40
}

# --------------------------------------------------------------------------
# Operation registry
# Format: "Display Name|Description|function_name"
# --------------------------------------------------------------------------
OPERATIONS=(
  "Start Project|Select project, apply layout, launch Claude|op_start"
  "Launch Claude Session|Start Claude Code in this pane via cmd.exe|op_launch_claude"
  "Multi Session|Launch 2-4 parallel Claude sessions|op_multi"
  "Cycle Session|Send /clear + /pbr:resume-work to Claude pane|op_cycle_session"
  "Watch|Live PBR state monitor in split pane|op_watch"
  "Show PBR Status|Display current phase and status|op_show_pbr_status"
  "Open Dashboard|Launch PBR dashboard in a split pane|op_open_dashboard"
  "Search Sessions|Find and resume past sessions by keyword|op_search"
  "---PBR---|---|---"
  "Split Horizontal|Add a horizontal split below|op_split_horizontal"
  "Split Vertical|Add a vertical split to the right|op_split_vertical"
  "Rename Window|Give current window a descriptive name|op_rename_window"
  "Rename Session|Rename the current tmux session|op_rename_session"
  "Swap Panes|Swap current pane with the one above|op_swap_panes"
  "Kill Pane|Close the current pane|op_kill_pane"
  "Kill Session|Terminate the entire tmux session|op_kill_session"
  "Detach|Detach from tmux (session keeps running)|op_detach"
  "List Sessions|Show all active tmux sessions|op_list_sessions"
  "Switch Session|Switch to another tmux session|op_switch_session"
  "Toggle Mouse|Turn mouse mode on or off|op_toggle_mouse"
  "Copy Mode|Enter tmux copy mode (vi keys)|op_copy_mode"
  "Show Key Bindings|Display tmux key bindings|op_show_keys"
)

# --------------------------------------------------------------------------
# get_menu_items — format OPERATIONS for ui_choose
# --------------------------------------------------------------------------
get_menu_items() {
  for entry in "${OPERATIONS[@]}"; do
    [[ "$entry" == "---"* ]] && continue
    local name desc
    name=$(echo "$entry" | cut -d'|' -f1)
    desc=$(echo "$entry" | cut -d'|' -f2)
    printf "%-24s  %s\n" "$name" "$desc"
  done
}

# --------------------------------------------------------------------------
# run_operation — map a display name back to its op_ function
# --------------------------------------------------------------------------
run_operation() {
  local selected_name="$1"
  shift
  # Extract just the name part (before double-space + description)
  selected_name=$(echo "$selected_name" | sed 's/  .*//' | xargs)
  for entry in "${OPERATIONS[@]}"; do
    local name func
    name=$(echo "$entry" | cut -d'|' -f1 | xargs)
    func=$(echo "$entry" | cut -d'|' -f3 | xargs)
    if [[ "$name" == "$selected_name" ]]; then
      "$func" "$@"
      return $?
    fi
  done
  echo "Unknown operation: $selected_name" >&2
  return 1
}
