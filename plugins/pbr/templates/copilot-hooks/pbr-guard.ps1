# PBR Guard -- preToolUse hook for GitHub Copilot
# Blocks dangerous commands and enforces commit format

$inputData = [Console]::In.ReadToEnd()
$json = $inputData | ConvertFrom-Json

if ($json.toolName -ne "bash") { exit 0 }

$toolArgs = $json.toolArgs | ConvertFrom-Json
$command = $toolArgs.command

if (-not $command) { exit 0 }

function Deny($reason) {
    $result = @{ permissionDecision = "deny"; permissionDecisionReason = $reason }
    $result | ConvertTo-Json -Compress
    exit 0
}

# 1. Block rm targeting .planning/
if ($command -match 'rm\s+(-[a-zA-Z]*\s+)*.*\.planning') {
    Deny "Blocked: removing .planning/ directory is not allowed"
}

# 2. Block git reset --hard
if ($command -match 'git\s+reset\s+--hard') {
    Deny "Blocked: git reset --hard is destructive and not allowed"
}

# 3. Block git push --force / -f to main or master
if ($command -match 'git\s+push\s+.*(-f|--force)' -and $command -match '\b(main|master)\b') {
    Deny "Blocked: force push to main/master is not allowed"
}

# 4. Block git clean -fd / -fxd
if ($command -match 'git\s+clean\s+-f[xd]*d') {
    Deny "Blocked: git clean with force is destructive and not allowed"
}

# 5. Validate commit message format
if ($command -match 'git\s+commit\s') {
    if ($command -match 'git commit.*-m\s*[''"]([^''"]*)[''"]') {
        $msg = $Matches[1]
        # Allow merge commits
        if ($msg -match '^Merge\b') { exit 0 }
        # Allow wip: description (without scope)
        if ($msg -match '^wip: .+') { exit 0 }
        # Require conventional commit format
        if ($msg -notmatch '^(feat|fix|refactor|test|docs|chore|wip|revert|perf|ci|build)\(.*\): .+') {
            Deny "Blocked: commit message must follow conventional format {type}({scope}): {description}"
        }
    }
}

exit 0
