# Reddit Post for r/ClaudeAI

## Flair options (pick one):
- **Tool/Resource** - best fit, this is what most plugin/tool posts use
- **Productivity** - also works if Tool/Resource isn't available
- **Discussion** - safe fallback

---

## Title:
Made a Claude Code plugin that fixes context rot on longer projects

## Body:

I've been using Claude Code for bigger projects and kept running into the same problem: the longer a session goes, the worse the output gets. It starts forgetting decisions you made earlier, hallucinating more, and you end up re-explaining things or just starting over.

I built Plan-Build-Run to deal with this. It started as a fork of the get-shit-done plugin but ended up being a full rewrite. The core idea is the same though: keep the main context window mostly empty by pushing real work out to fresh subagent windows. Each one gets a clean 200k token context. All project state goes to disk, so you can kill a session whenever and pick up where you left off.

The workflow looks like this:

- `/pbr:begin` sets up requirements and a roadmap through back-and-forth questions
- `/pbr:plan` does research and writes a detailed execution plan for each phase
- `/pbr:build` runs parallel executor agents that commit atomically
- `/pbr:review` checks whether what got built actually matches what was planned

You can tune it to your plan tier. `depth: quick` spawns fewer agents for Free/Pro, `depth: standard` for Max, `depth: comprehensive` if you're on Max 5x.

780 tests, runs CI on Windows/macOS/Linux, MIT licensed.

Install:

    claude plugin marketplace add SienkLogic/plan-build-run
    claude plugin install pbr@plan-build-run

GitHub: [https://github.com/SienkLogic/plan-build-run](https://github.com/SienkLogic/plan-build-run)

Open to feedback or questions.
