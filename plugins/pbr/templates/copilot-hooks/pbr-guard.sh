#!/usr/bin/env bash
# PBR Guard -- preToolUse hook for GitHub Copilot
# Blocks dangerous commands and enforces commit format

INPUT=$(cat)

# Try jq first, fall back to grep/sed
if command -v jq &>/dev/null; then
  TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName' 2>/dev/null)
else
  TOOL_NAME=$(echo "$INPUT" | grep -o '"toolName"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
fi

# Only check bash commands
if [ "$TOOL_NAME" != "bash" ]; then
  exit 0
fi

# Extract the command from toolArgs
if command -v jq &>/dev/null; then
  TOOL_ARGS=$(echo "$INPUT" | jq -r '.toolArgs' 2>/dev/null)
  COMMAND=$(echo "$TOOL_ARGS" | jq -r '.command' 2>/dev/null)
else
  # Fallback: extract command value from nested JSON
  COMMAND=$(echo "$INPUT" | grep -o '"command"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
fi

if [ -z "$COMMAND" ]; then
  exit 0
fi

deny() {
  local reason="$1"
  printf '{"permissionDecision":"deny","permissionDecisionReason":"%s"}\n' "$reason"
  exit 0
}

# 1. Block rm targeting .planning/
if echo "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]*\s+)*.*\.planning'; then
  deny "Blocked: removing .planning/ directory is not allowed"
fi

# 2. Block git reset --hard
if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
  deny "Blocked: git reset --hard is destructive and not allowed"
fi

# 3. Block git push --force / -f to main or master
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*(-f|--force).*\s+(main|master)'; then
  deny "Blocked: force push to main/master is not allowed"
fi
if echo "$COMMAND" | grep -qE 'git\s+push\s+(-f|--force)'; then
  # Check if target is main/master (may appear before or after the flag)
  if echo "$COMMAND" | grep -qE '\b(main|master)\b'; then
    deny "Blocked: force push to main/master is not allowed"
  fi
fi

# 4. Block git clean -fd / -fxd
if echo "$COMMAND" | grep -qE 'git\s+clean\s+-f[xd]*d'; then
  deny "Blocked: git clean with force is destructive and not allowed"
fi

# 5. Validate commit message format
if echo "$COMMAND" | grep -qE 'git\s+commit\s'; then
  # Extract the commit message after -m
  MSG=$(echo "$COMMAND" | sed -n 's/.*git commit.*-m\s*["'"'"']\([^"'"'"']*\)["'"'"'].*/\1/p')
  if [ -n "$MSG" ]; then
    # Allow merge commits
    if echo "$MSG" | grep -qE '^Merge\b'; then
      exit 0
    fi
    # Allow wip: description (without scope)
    if echo "$MSG" | grep -qE '^wip: .+'; then
      exit 0
    fi
    # Require conventional commit format: type(scope): description
    if ! echo "$MSG" | grep -qE '^(feat|fix|refactor|test|docs|chore|wip|revert|perf|ci|build)\(.*\): .+'; then
      deny "Blocked: commit message must follow conventional format {type}({scope}): {description}"
    fi
  fi
fi

exit 0
