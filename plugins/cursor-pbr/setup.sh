#!/usr/bin/env bash
#
# Plan-Build-Run for Cursor — Setup Script
#
# Usage:
#   cd /path/to/your/project
#   bash /path/to/plan-build-run/plugins/cursor-pbr/setup.sh
#
# This creates symlinks in your project's .cursor/ directory so Cursor
# can discover PBR rules and agents. The plugin source stays in the
# plan-build-run repo — symlinks keep everything up to date.

set -euo pipefail

# Resolve the absolute path to the cursor-pbr plugin directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$SCRIPT_DIR"
PROJECT_DIR="$(pwd)"

echo "Plan-Build-Run for Cursor — Setup"
echo "================================="
echo ""
echo "Plugin source: $PLUGIN_DIR"
echo "Target project: $PROJECT_DIR"
echo ""

# Sanity check: don't install into the PBR repo itself
if [ -f "$PROJECT_DIR/plugins/cursor-pbr/setup.sh" ]; then
  echo "Error: You appear to be inside the plan-build-run repo itself."
  echo "Run this script from your target project directory instead:"
  echo ""
  echo "  cd /path/to/your/project"
  echo "  bash $0"
  exit 1
fi

# Create .cursor directories if they don't exist
mkdir -p "$PROJECT_DIR/.cursor/rules"

# --- Rules ---
echo "Installing rules..."
if [ -e "$PROJECT_DIR/.cursor/rules/pbr-workflow.mdc" ]; then
  echo "  pbr-workflow.mdc already exists, skipping (remove it first to reinstall)"
else
  ln -s "$PLUGIN_DIR/rules/pbr-workflow.mdc" "$PROJECT_DIR/.cursor/rules/pbr-workflow.mdc"
  echo "  Linked pbr-workflow.mdc"
fi

# --- Agents ---
# Cursor reads agent definitions from .cursor/agents/ (if supported)
echo "Installing agents..."
mkdir -p "$PROJECT_DIR/.cursor/agents"
for agent_file in "$PLUGIN_DIR/agents/"*.md; do
  agent_name="$(basename "$agent_file")"
  target="$PROJECT_DIR/.cursor/agents/$agent_name"
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
echo "  .cursor/rules/pbr-workflow.mdc  — Workflow rules (auto-loaded when .planning/ exists)"
echo "  .cursor/agents/*.md             — 10 specialized agents"
echo ""
echo "Next steps:"
echo "  1. Open this project in Cursor"
echo "  2. Start a conversation and use /pbr:begin to start a new project"
echo "     (or paste the contents of a skill's SKILL.md as a prompt)"
echo ""
echo "Skills are located at:"
echo "  $PLUGIN_DIR/skills/"
echo ""
echo "To uninstall, remove the symlinks:"
echo "  rm .cursor/rules/pbr-workflow.mdc"
echo "  rm .cursor/agents/codebase-mapper.md debugger.md executor.md general.md"
echo "  rm .cursor/agents/integration-checker.md plan-checker.md planner.md"
echo "  rm .cursor/agents/researcher.md synthesizer.md verifier.md"
