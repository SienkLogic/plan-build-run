#
# Plan-Build-Run for Cursor — Setup Script (Windows)
#
# Usage:
#   cd C:\path\to\your\project
#   powershell -ExecutionPolicy Bypass -File C:\path\to\plan-build-run\plugins\cursor-pbr\setup.ps1
#
# Creates symlinks in your project's .cursor\ directory so Cursor
# can discover PBR rules and agents. Requires admin privileges for
# symlinks on older Windows versions, or Developer Mode enabled.

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginDir = $ScriptDir
$ProjectDir = Get-Location

Write-Host "Plan-Build-Run for Cursor - Setup" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Plugin source: $PluginDir"
Write-Host "Target project: $ProjectDir"
Write-Host ""

# Sanity check
if (Test-Path (Join-Path $ProjectDir "plugins\cursor-pbr\setup.ps1")) {
    Write-Host "Error: You appear to be inside the plan-build-run repo itself." -ForegroundColor Red
    Write-Host "Run this script from your target project directory instead:" -ForegroundColor Red
    Write-Host ""
    Write-Host "  cd C:\path\to\your\project"
    Write-Host "  powershell -ExecutionPolicy Bypass -File $($MyInvocation.MyCommand.Path)"
    exit 1
}

# Create .cursor directories
$rulesDir = Join-Path $ProjectDir ".cursor\rules"
$agentsDir = Join-Path $ProjectDir ".cursor\agents"
New-Item -ItemType Directory -Force -Path $rulesDir | Out-Null
New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null

# --- Rules ---
Write-Host "Installing rules..."
$ruleTarget = Join-Path $rulesDir "pbr-workflow.mdc"
$ruleSource = Join-Path $PluginDir "rules\pbr-workflow.mdc"
if (Test-Path $ruleTarget) {
    Write-Host "  pbr-workflow.mdc already exists, skipping (remove it first to reinstall)"
} else {
    New-Item -ItemType SymbolicLink -Path $ruleTarget -Target $ruleSource | Out-Null
    Write-Host "  Linked pbr-workflow.mdc"
}

# --- Agents ---
Write-Host "Installing agents..."
Get-ChildItem (Join-Path $PluginDir "agents\*.md") | ForEach-Object {
    $agentTarget = Join-Path $agentsDir $_.Name
    if (Test-Path $agentTarget) {
        Write-Host "  $($_.Name) already exists, skipping"
    } else {
        New-Item -ItemType SymbolicLink -Path $agentTarget -Target $_.FullName | Out-Null
        Write-Host "  Linked $($_.Name)"
    }
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "What was installed:"
Write-Host "  .cursor\rules\pbr-workflow.mdc  - Workflow rules (auto-loaded when .planning\ exists)"
Write-Host "  .cursor\agents\*.md             - 10 specialized agents"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Open this project in Cursor"
Write-Host "  2. Start a conversation and use /pbr:begin to start a new project"
Write-Host ""
Write-Host "Skills are located at:"
Write-Host "  $PluginDir\skills\"
Write-Host ""
Write-Host "To uninstall, remove the symlinks from .cursor\rules\ and .cursor\agents\"
