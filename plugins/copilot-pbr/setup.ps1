#
# Plan-Build-Run for GitHub Copilot CLI — Setup Script (Windows)
#
# Usage:
#   cd C:\path\to\your\project
#   powershell -ExecutionPolicy Bypass -File C:\path\to\plan-build-run\plugins\copilot-pbr\setup.ps1
#
# Installs PBR as a Copilot CLI plugin using `copilot plugin install`
# if available, or creates symlinks in ~/.copilot/installed-plugins/ as fallback.

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginDir = $ScriptDir
$ProjectDir = Get-Location

Write-Host "Plan-Build-Run for GitHub Copilot CLI - Setup" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Plugin source: $PluginDir"
Write-Host "Target project: $ProjectDir"
Write-Host ""

# Sanity check
if (Test-Path (Join-Path $ProjectDir "plugins\copilot-pbr\setup.ps1")) {
    Write-Host "Error: You appear to be inside the plan-build-run repo itself." -ForegroundColor Red
    Write-Host "Run this script from your target project directory instead:" -ForegroundColor Red
    Write-Host ""
    Write-Host "  cd C:\path\to\your\project"
    Write-Host "  powershell -ExecutionPolicy Bypass -File $($MyInvocation.MyCommand.Path)"
    exit 1
}

# Strategy 1: Try copilot plugin install
$copilotCmd = Get-Command copilot -ErrorAction SilentlyContinue
if ($copilotCmd) {
    Write-Host "Found Copilot CLI. Installing plugin via 'copilot plugin install'..."
    Write-Host ""
    & copilot plugin install --local "$PluginDir"
    Write-Host ""
    Write-Host "Plugin installed successfully via Copilot CLI." -ForegroundColor Green
} else {
    # Strategy 2: Manual symlink
    Write-Host "Copilot CLI not found in PATH. Falling back to manual symlink install."
    Write-Host ""

    $installDir = Join-Path $env:USERPROFILE ".copilot\installed-plugins\pbr"
    $parentDir = Join-Path $env:USERPROFILE ".copilot\installed-plugins"
    New-Item -ItemType Directory -Force -Path $parentDir | Out-Null

    if (Test-Path $installDir) {
        Write-Host "  $installDir already exists, skipping (remove it first to reinstall)"
    } else {
        New-Item -ItemType SymbolicLink -Path $installDir -Target $PluginDir | Out-Null
        Write-Host "  Linked $PluginDir -> $installDir"
    }
}

# Install project-level agents
Write-Host ""
Write-Host "Installing project-level agents..."
$agentsDir = Join-Path $ProjectDir ".github\agents"
New-Item -ItemType Directory -Force -Path $agentsDir | Out-Null

Get-ChildItem (Join-Path $PluginDir "agents\*.agent.md") | ForEach-Object {
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
Write-Host "  Plugin (global):  ~/.copilot/installed-plugins/pbr (or via copilot plugin install)"
Write-Host "  Agents (project): .github\agents\*.agent.md"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Open a terminal in this project"
Write-Host "  2. Run: copilot"
Write-Host "  3. Use /pbr:begin to start a new project"
Write-Host ""
Write-Host "Skills are located at:"
Write-Host "  $PluginDir\skills\"
Write-Host ""
Write-Host "To uninstall:"
Write-Host "  copilot plugin uninstall pbr"
Write-Host "  # or: Remove-Item ~/.copilot/installed-plugins/pbr"
Write-Host "  Remove-Item .github\agents\*.agent.md"
