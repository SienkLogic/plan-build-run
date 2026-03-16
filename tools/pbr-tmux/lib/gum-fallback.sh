#!/bin/bash
# UI abstraction: gum when available, bash fallback when not

HAS_GUM=false
command -v gum &>/dev/null && HAS_GUM=true

# Set by pbr-tmux main script
NON_INTERACTIVE="${NON_INTERACTIVE:-false}"

# --------------------------------------------------------------------------
# ui_choose — select from a list
#   Args: $1 = header text, stdin = options (one per line)
#   Returns: selected option on stdout, exit 1 if cancelled
# --------------------------------------------------------------------------
ui_choose() {
  local header="$1"

  if [[ "$NON_INTERACTIVE" == "true" ]]; then
    echo "Error: ui_choose requires interactive mode. Use a direct subcommand instead." >&2
    return 1
  fi

  local options
  options=$(cat)

  if $HAS_GUM; then
    echo "$options" | gum filter --height 20 --header "$header"
  else
    echo "$header" >&2
    echo "" >&2
    local IFS=$'\n'
    local items=()
    while read -r line; do
      [[ -n "$line" ]] && items+=("$line")
    done <<< "$options"

    PS3="Choose [1-${#items[@]}]: "
    select choice in "${items[@]}"; do
      if [[ -n "$choice" ]]; then
        echo "$choice"
        return 0
      fi
      echo "Invalid selection" >&2
    done
    return 1
  fi
}

# --------------------------------------------------------------------------
# ui_confirm — yes/no confirmation
#   Args: $1 = prompt text
#   Returns: exit 0 = yes, 1 = no
# --------------------------------------------------------------------------
ui_confirm() {
  local prompt="$1"

  if [[ "$NON_INTERACTIVE" == "true" ]]; then
    return 0
  fi

  if $HAS_GUM; then
    gum confirm "$prompt"
  else
    local reply
    read -r -p "$prompt [y/N] " reply
    [[ "$reply" =~ ^[Yy] ]]
  fi
}

# --------------------------------------------------------------------------
# ui_input — get text input
#   Args: $1 = prompt, $2 = placeholder (optional)
#   Returns: entered text on stdout
# --------------------------------------------------------------------------
ui_input() {
  local prompt="$1"
  local placeholder="${2:-}"

  if [[ "$NON_INTERACTIVE" == "true" ]]; then
    if [[ -n "$placeholder" ]]; then
      echo "$placeholder"
      return 0
    else
      echo "Error: ui_input requires a default value in non-interactive mode" >&2
      return 1
    fi
  fi

  if $HAS_GUM; then
    gum input --prompt "$prompt " --placeholder "$placeholder"
  else
    local value
    read -r -p "$prompt " value
    echo "$value"
  fi
}

# --------------------------------------------------------------------------
# ui_header — styled header banner
#   Args: $1 = text
# --------------------------------------------------------------------------
ui_header() {
  local text="$1"

  if $HAS_GUM; then
    gum style --border double --padding "0 2" --foreground "#89b4fa" "$text"
  else
    echo "=== $text ==="
  fi
}

# --------------------------------------------------------------------------
# ui_spin — show spinner during operation
#   Args: $1 = title, remaining args = command to run
# --------------------------------------------------------------------------
ui_spin() {
  local title="$1"
  shift
  local cmd=("$@")

  if $HAS_GUM; then
    gum spin --title "$title" -- "${cmd[@]}"
  else
    echo "$title..."
    "${cmd[@]}"
  fi
}
