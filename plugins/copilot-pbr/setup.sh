#!/usr/bin/env bash
#
# Plan-Build-Run for GitHub Copilot CLI — Setup Script
#
# Usage:
#   cd /path/to/your/project
#   bash /path/to/plan-build-run/plugins/copilot-pbr/setup.sh
#
# This installs PBR as a Copilot CLI plugin using `copilot plugin install`
# if available, or creates symlinks in ~/.copilot/installed-plugins/ as fallback.

set -euo pipefail

# Resolve the absolute path to the copilot-pbr plugin directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$SCRIPT_DIR"
PROJECT_DIR="$(pwd)"

echo "Plan-Build-Run for GitHub Copilot CLI — Setup"
echo "==============================================="
echo ""
echo "Plugin source: $PLUGIN_DIR"
echo "Target project: $PROJECT_DIR"
echo ""

# Sanity check: don't install into the PBR repo itself
if [ -f "$PROJECT_DIR/plugins/copilot-pbr/setup.sh" ]; then
  echo "Error: You appear to be inside the plan-build-run repo itself."
  echo "Run this script from your target project directory instead:"
  echo ""
  echo "  cd /path/to/your/project"
  echo "  bash $0"
  exit 1
fi

# Strategy 1: Try copilot plugin install (if copilot CLI is available)
if command -v copilot &> /dev/null; then
  echo "Found Copilot CLI. Installing plugin via 'copilot plugin install'..."
  echo ""
  copilot plugin install --local "$PLUGIN_DIR"
  echo ""
  echo "Plugin installed successfully via Copilot CLI."
else
  # Strategy 2: Manual symlink into ~/.copilot/installed-plugins/
  echo "Copilot CLI not found in PATH. Falling back to manual symlink install."
  echo ""

  INSTALL_DIR="$HOME/.copilot/installed-plugins/pbr"
  mkdir -p "$HOME/.copilot/installed-plugins"

  if [ -e "$INSTALL_DIR" ]; then
    echo "  $INSTALL_DIR already exists, skipping (remove it first to reinstall)"
  else
    ln -s "$PLUGIN_DIR" "$INSTALL_DIR"
    echo "  Linked $PLUGIN_DIR -> $INSTALL_DIR"
  fi
fi

# Also install agents into project-level .github/agents/ for repo-scoped discovery
echo ""
echo "Installing project-level agents..."
mkdir -p "$PROJECT_DIR/.github/agents"
for agent_file in "$PLUGIN_DIR/agents/"*.agent.md; do
  agent_name="$(basename "$agent_file")"
  target="$PROJECT_DIR/.github/agents/$agent_name"
  if [ -e "$target" ]; then
    echo "  $agent_name already exists, skipping"
  else
    ln -s "$agent_file" "$target"
    echo "  Linked $agent_name"
  fi
done

echo ""
echo "Setup complete!"
echo ""
echo "What was installed:"
echo "  Plugin (global):  ~/.copilot/installed-plugins/pbr (or via copilot plugin install)"
echo "  Agents (project): .github/agents/*.agent.md"
echo ""
echo "Next steps:"
echo "  1. Open a terminal in this project"
echo "  2. Run: copilot"
echo "  3. Use /pbr:begin to start a new project"
echo ""
echo "Skills are located at:"
echo "  $PLUGIN_DIR/skills/"
echo ""
echo "To uninstall:"
echo "  copilot plugin uninstall pbr"
echo "  # or: rm ~/.copilot/installed-plugins/pbr"
echo "  rm .github/agents/*.agent.md"
