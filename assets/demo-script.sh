#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Towline Demo Script - Simulated terminal output for GIF recording
# ═══════════════════════════════════════════════════════════════
#
# HOW TO RECORD:
#   Option A (ScreenToGif - Windows):
#     1. Download ScreenToGif: https://www.screentogif.com
#     2. Open a terminal, resize to ~100x30 chars
#     3. Set terminal to dark theme, JetBrains Mono or similar font
#     4. Start ScreenToGif recording on the terminal area
#     5. Run: bash assets/demo-script.sh
#     6. Stop recording, export as GIF (max 800px wide, 15fps)
#
#   Option B (asciinema + agg):
#     1. asciinema rec demo.cast -c "bash assets/demo-script.sh"
#     2. agg demo.cast assets/towline-demo.gif --theme mocha
#
#   Option C (VHS by Charm):
#     1. vhs assets/demo.tape  (see demo.tape for the wrapper)
#
# TARGET: ~25-35 seconds, showing the full plan→build→review cycle
# ═══════════════════════════════════════════════════════════════

# Colors
BOLD="\033[1m"
DIM="\033[2m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
WHITE="\033[97m"
RESET="\033[0m"
BG_PURPLE="\033[45m"

# Typing effect
type_cmd() {
  local text="$1"
  local delay="${2:-0.04}"
  for (( i=0; i<${#text}; i++ )); do
    printf "%s" "${text:$i:1}"
    sleep "$delay"
  done
  sleep 0.3
  echo ""
}

pause() { sleep "${1:-1}"; }
short() { sleep 0.4; }

clear

# ─── Prompt ───
printf "${BOLD}${CYAN}❯${RESET} "
type_cmd "claude" 0.06
pause 0.8

printf "\n${DIM}  Claude Code v2.34  •  towline plugin loaded${RESET}\n\n"
pause 0.6

# ═══════════════════════════════════════
# SCENE 1: /dev:begin (project setup)
# ═══════════════════════════════════════

printf "${BOLD}${CYAN}❯${RESET} "
type_cmd "/dev:begin" 0.05
pause 0.5

printf "\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "${BOLD}${WHITE} TOWLINE ► QUESTIONING${RESET}\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
pause 0.8

printf "\n  What are you building?\n"
printf "  ${DIM}(project name, goals, tech stack, constraints)${RESET}\n\n"
printf "  ${BOLD}${CYAN}❯${RESET} "
type_cmd "A task management API with auth, PostgreSQL, and a React dashboard" 0.025
pause 0.6

printf "\n${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "${BOLD}${WHITE} TOWLINE ► RESEARCHING${RESET}\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"

printf "  ${YELLOW}◐${RESET} Spawning 4 researchers in parallel...\n"
printf "    → Stack research\n"
printf "    → Features research\n"
printf "    → Architecture research\n"
printf "    → Pitfalls research\n"
pause 1.5

printf "  ${GREEN}✓${RESET} Stack research complete          ${DIM}(18s)${RESET}\n"
short
printf "  ${GREEN}✓${RESET} Architecture research complete    ${DIM}(22s)${RESET}\n"
short
printf "  ${GREEN}✓${RESET} Features research complete        ${DIM}(24s)${RESET}\n"
short
printf "  ${GREEN}✓${RESET} Pitfalls research complete        ${DIM}(19s)${RESET}\n"
pause 0.6

printf "\n${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "${BOLD}${WHITE} TOWLINE ► CREATING ROADMAP${RESET}\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"
pause 0.8

printf "  ${BOLD}Roadmap: 5 phases${RESET}\n\n"
printf "  ${DIM}│${RESET} Phase ${BOLD}1${RESET}  Foundation & Config          ${DIM}3 plans${RESET}\n"
printf "  ${DIM}│${RESET} Phase ${BOLD}2${RESET}  Database & Models            ${DIM}2 plans${RESET}\n"
printf "  ${DIM}│${RESET} Phase ${BOLD}3${RESET}  Authentication               ${DIM}4 plans${RESET}\n"
printf "  ${DIM}│${RESET} Phase ${BOLD}4${RESET}  API Endpoints                ${DIM}5 plans${RESET}\n"
printf "  ${DIM}│${RESET} Phase ${BOLD}5${RESET}  React Dashboard              ${DIM}4 plans${RESET}\n"
pause 1

printf "\n  ${GREEN}✓${RESET} PROJECT.md written\n"
printf "  ${GREEN}✓${RESET} REQUIREMENTS.md written  ${DIM}(12 requirements)${RESET}\n"
printf "  ${GREEN}✓${RESET} ROADMAP.md written       ${DIM}(5 phases, 18 plans)${RESET}\n"
pause 0.8

# ═══════════════════════════════════════
# SCENE 2: /dev:plan 1
# ═══════════════════════════════════════

printf "\n${BOLD}${CYAN}❯${RESET} "
type_cmd "/dev:plan 1" 0.05
pause 0.4

printf "\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "${BOLD}${WHITE} TOWLINE ► PLANNING PHASE 1${RESET}\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"

printf "  ${YELLOW}◐${RESET} Spawning researcher...\n"
pause 0.8
printf "  ${GREEN}✓${RESET} Research complete\n"
printf "  ${YELLOW}◐${RESET} Spawning planner...\n"
pause 0.8
printf "  ${GREEN}✓${RESET} 3 plans created\n"
printf "  ${YELLOW}◐${RESET} Spawning plan checker...\n"
pause 0.6
printf "  ${GREEN}✓${RESET} Quality: 9.2/10  ${DIM}(all 10 dimensions passed)${RESET}\n"
pause 0.5

printf "\n  ${BOLD}Plans for Phase 1: Foundation & Config${RESET}\n\n"
printf "  ${DIM}Wave 1:${RESET}  Plan 01: Project scaffolding\n"
printf "  ${DIM}       ${RESET}  Plan 02: Config & environment\n"
printf "  ${DIM}Wave 2:${RESET}  Plan 03: Testing infrastructure  ${DIM}(depends on 01)${RESET}\n"
pause 1

# ═══════════════════════════════════════
# SCENE 3: /dev:build 1
# ═══════════════════════════════════════

printf "\n${BOLD}${CYAN}❯${RESET} "
type_cmd "/dev:build 1" 0.05
pause 0.4

printf "\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "${BOLD}${WHITE} TOWLINE ► EXECUTING WAVE 1${RESET}\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"

printf "  ${YELLOW}◐${RESET} Spawning 2 executors in parallel...\n"
printf "    → Plan 01: Project scaffolding\n"
printf "    → Plan 02: Config & environment\n"
pause 1.2

printf "  ${GREEN}✓${RESET} Plan 01 complete  ${DIM}feat(01-01): initialize project with TypeScript and Express  (1m 42s)${RESET}\n"
short
printf "  ${GREEN}✓${RESET} Plan 02 complete  ${DIM}feat(01-02): add config management and .env setup            (1m 18s)${RESET}\n"
pause 0.5

printf "\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "${BOLD}${WHITE} TOWLINE ► EXECUTING WAVE 2${RESET}\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"

printf "  ${YELLOW}◐${RESET} Spawning executor...\n"
printf "    → Plan 03: Testing infrastructure\n"
pause 1

printf "  ${GREEN}✓${RESET} Plan 03 complete  ${DIM}feat(01-03): add Jest config and test utilities               (58s)${RESET}\n"
pause 0.5

printf "\n  ${BOLD}Build progress:${RESET}\n"
printf "  Wave 1: ${GREEN}✓${RESET} Plan 01, ${GREEN}✓${RESET} Plan 02\n"
printf "  Wave 2: ${GREEN}✓${RESET} Plan 03\n"
printf "  Progress: ${GREEN}████████████████████${RESET} 100%%  ${DIM}(3/3 plans)${RESET}\n"
pause 1

# ═══════════════════════════════════════
# SCENE 4: /dev:review 1
# ═══════════════════════════════════════

printf "\n${BOLD}${CYAN}❯${RESET} "
type_cmd "/dev:review 1" 0.05
pause 0.4

printf "\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "${BOLD}${WHITE} TOWLINE ► VERIFYING${RESET}\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"

printf "  ${YELLOW}◐${RESET} Spawning verifier...  ${DIM}(read-only, checks codebase against must-haves)${RESET}\n"
pause 1.2

printf "\n  ${BOLD}Verification Results${RESET}\n\n"
printf "  ${GREEN}✓${RESET} TypeScript project compiles             ${DIM}existence + substance${RESET}\n"
printf "  ${GREEN}✓${RESET} Express server boots on configured port  ${DIM}existence + wiring${RESET}\n"
printf "  ${GREEN}✓${RESET} Environment config loads from .env       ${DIM}existence + substance + wiring${RESET}\n"
printf "  ${GREEN}✓${RESET} Jest runs with 0 failures               ${DIM}existence + substance${RESET}\n"
printf "  ${GREEN}✓${RESET} Health check endpoint responds           ${DIM}existence + wiring${RESET}\n"
pause 0.8

printf "\n  Score: ${GREEN}${BOLD}5/5 must-haves verified${RESET}\n"
pause 0.5

printf "\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"
printf "${BOLD}${GREEN} TOWLINE ► PHASE 1 COMPLETE ✓${RESET}\n"
printf "${BOLD}${WHITE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n\n"

printf "  ${BOLD}Phase 1: Foundation & Config${RESET}\n"
printf "  3 plans executed, goal verified ${GREEN}✓${RESET}\n\n"

printf "  ${DIM}───────────────────────────────────────────────────${RESET}\n\n"
printf "  ${BOLD}▶ Next Up${RESET}\n\n"
printf "  ${BOLD}Phase 2: Database & Models${RESET}\n"
printf "  ${CYAN}/dev:plan 2${RESET}\n\n"
printf "  ${DIM}───────────────────────────────────────────────────${RESET}\n"

pause 3
printf "\n"
