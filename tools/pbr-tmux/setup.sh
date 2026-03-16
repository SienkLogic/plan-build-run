#!/bin/bash
# PBR TMUX Setup — one-shot installer for Claude Code + TMUX on WSL2
# Idempotent: safe to re-run. Skips steps that are already done.
#
# Usage:
#   bash /mnt/d/Repos/plan-build-run/tools/pbr-tmux/setup.sh
#   # Or with a custom project path:
#   bash setup.sh --project /mnt/d/Repos/my-project

set -euo pipefail

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_DIR=""
SKIP_APT=false

# Colors (plain if not a terminal)
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
  RED='\033[0;31m'; BOLD='\033[1m'; RESET='\033[0m'
else
  GREEN=''; YELLOW=''; BLUE=''; RED=''; BOLD=''; RESET=''
fi

ok()   { printf "${GREEN}[OK]${RESET}   %s\n" "$1"; }
skip() { printf "${YELLOW}[SKIP]${RESET} %s\n" "$1"; }
info() { printf "${BLUE}[..]${RESET}   %s\n" "$1"; }
err()  { printf "${RED}[ERR]${RESET}  %s\n" "$1" >&2; }

# --- Argument parsing ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT_DIR="$2"; shift 2 ;;
    --skip-apt) SKIP_APT=true; shift ;;
    --help|-h)
      echo "Usage: setup.sh [--project /mnt/d/Repos/your-project] [--skip-apt]"
      echo ""
      echo "Options:"
      echo "  --project PATH   Set the default PBR project path for the status bar"
      echo "  --skip-apt       Skip apt install steps (tmux, xclip, gum)"
      echo "  --help           Show this help"
      exit 0
      ;;
    *) err "Unknown argument: $1"; exit 1 ;;
  esac
done

printf "\n${BOLD}PBR TMUX Setup${RESET}\n"
printf "Repository: %s\n\n" "$REPO_ROOT"

# --- Step 1: Install tmux ---
if command -v tmux &>/dev/null; then
  ok "tmux already installed ($(tmux -V))"
else
  if $SKIP_APT; then
    skip "tmux not installed (--skip-apt)"
  else
    info "Installing tmux..."
    sudo apt update -qq && sudo apt install -y tmux
    ok "tmux installed ($(tmux -V))"
  fi
fi

# --- Step 2: Install gum (optional) ---
if command -v gum &>/dev/null; then
  ok "gum already installed ($(gum --version 2>/dev/null || echo 'unknown'))"
else
  if $SKIP_APT; then
    skip "gum not installed (--skip-apt) — pbr-tmux will use bash fallback"
  else
    info "Installing gum via Charm apt repository..."
    if sudo mkdir -p /etc/apt/keyrings && \
       curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg 2>/dev/null && \
       echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" \
         | sudo tee /etc/apt/sources.list.d/charm.list >/dev/null && \
       sudo apt update -qq && sudo apt install -y gum; then
      ok "gum installed"
    else
      skip "gum install failed — pbr-tmux will use bash fallback (this is fine)"
    fi
  fi
fi

# --- Step 3: Install xclip (for clipboard) ---
if command -v xclip &>/dev/null; then
  ok "xclip already installed"
else
  if $SKIP_APT; then
    skip "xclip not installed (--skip-apt)"
  else
    info "Installing xclip for clipboard support..."
    sudo apt install -y xclip 2>/dev/null && ok "xclip installed" || skip "xclip install failed (non-critical)"
  fi
fi

# --- Step 4: Install .tmux.conf ---
if [[ -f "$HOME/.tmux.conf" ]]; then
  if grep -q "PBR TMUX Configuration" "$HOME/.tmux.conf" 2>/dev/null; then
    ok ".tmux.conf already installed (PBR version)"
  else
    info "Backing up existing ~/.tmux.conf to ~/.tmux.conf.bak"
    cp "$HOME/.tmux.conf" "$HOME/.tmux.conf.bak"
    cp "$REPO_ROOT/tools/pbr-tmux/tmux.conf" "$HOME/.tmux.conf"
    ok ".tmux.conf installed (old config backed up to ~/.tmux.conf.bak)"
  fi
else
  cp "$REPO_ROOT/tools/pbr-tmux/tmux.conf" "$HOME/.tmux.conf"
  ok ".tmux.conf installed"
fi

# --- Step 5: Set up PBR status bar and pane state symlinks ---
mkdir -p "$HOME/.tmux"

# Status bar (phase + context tier)
if [[ -L "$HOME/.tmux/pbr-status.sh" ]]; then
  ok "Status bar symlink already exists"
else
  ln -sf "$REPO_ROOT/tools/pbr-tmux/lib/pbr-state.sh" "$HOME/.tmux/pbr-status.sh"
  ok "Status bar symlink created (~/.tmux/pbr-status.sh)"
fi

# Context display (line 2 of two-line status bar)
ln -sf "$REPO_ROOT/tools/pbr-tmux/lib/pbr-context.sh" "$HOME/.tmux/pbr-context.sh"
ok "Context display symlink created (~/.tmux/pbr-context.sh)"

# Pane border state indicator
ln -sf "$REPO_ROOT/tools/pbr-tmux/lib/pane-state.sh" "$HOME/.tmux/pbr-pane-state.sh"
ok "Pane state symlink created (~/.tmux/pbr-pane-state.sh)"

# --- Step 6: Set project breadcrumb for status bar ---
if [[ -n "$PROJECT_DIR" ]]; then
  echo "$PROJECT_DIR" > "$HOME/.pbr-project-path"
  ok "Project path set: $PROJECT_DIR"
elif [[ -f "$HOME/.pbr-project-path" ]]; then
  ok "Project path already set: $(cat "$HOME/.pbr-project-path")"
else
  # Default to the repo root (plan-build-run itself)
  echo "$REPO_ROOT" > "$HOME/.pbr-project-path"
  ok "Project path set to repo root: $REPO_ROOT (change with --project)"
fi

# --- Step 7: Add pbr-tmux to PATH ---
PBR_TMUX_DIR="$REPO_ROOT/tools/pbr-tmux"
if command -v pbr-tmux &>/dev/null; then
  ok "pbr-tmux already in PATH"
elif [[ -f /usr/local/bin/pbr-tmux ]]; then
  ok "pbr-tmux symlink already exists at /usr/local/bin"
else
  # Try symlink first (requires sudo), fall back to PATH in bashrc
  if sudo ln -sf "$PBR_TMUX_DIR/pbr-tmux" /usr/local/bin/pbr-tmux 2>/dev/null; then
    ok "pbr-tmux symlinked to /usr/local/bin/pbr-tmux"
  else
    # Fallback: add to PATH in .bashrc
    EXPORT_LINE="export PATH=\"$PBR_TMUX_DIR:\$PATH\""
    if ! grep -qF "pbr-tmux" "$HOME/.bashrc" 2>/dev/null; then
      echo "" >> "$HOME/.bashrc"
      echo "# PBR TMUX tools" >> "$HOME/.bashrc"
      echo "$EXPORT_LINE" >> "$HOME/.bashrc"
      ok "pbr-tmux added to PATH in ~/.bashrc (source ~/.bashrc or restart shell)"
    else
      ok "pbr-tmux PATH entry already in ~/.bashrc"
    fi
  fi
fi

# --- Step 8: Windows Terminal profile reminder ---
WT_SETTINGS="$REPO_ROOT/tools/pbr-tmux/windows-terminal-profile.json"
printf "\n${BOLD}Windows Terminal (manual step):${RESET}\n"
printf "  Add this to your Windows Terminal settings.json → profiles.list[]:\n"
printf "  File: %s\n" "$WT_SETTINGS"
printf "  ${YELLOW}Tip:${RESET} Open Windows Terminal → Ctrl+, → Open JSON file → paste into profiles.list[]\n"

# --- Summary ---
printf "\n${BOLD}${GREEN}Setup complete!${RESET}\n\n"
printf "Quick start:\n"
printf "  ${BLUE}tmux new-session -A -s pbr${RESET}   # Start/attach tmux session\n"
printf "  ${BLUE}pbr-tmux${RESET}                      # Interactive operations menu\n"
printf "  ${BLUE}pbr-tmux launch${RESET}               # Launch Claude Code\n"
printf "  ${BLUE}pbr-tmux --help${RESET}               # All available commands\n"

# Remind to reload tmux if it's running
if [[ -n "${TMUX:-}" ]]; then
  printf "\n${YELLOW}You're inside tmux — reload config with:${RESET}\n"
  printf "  ${BLUE}tmux source-file ~/.tmux.conf${RESET}\n"
fi

printf "\n"
