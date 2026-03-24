'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('../lib/frontmatter');

/**
 * Get the path to the current hook log file.
 * Prefers today's dated file, falls back to most recent, then legacy hooks.jsonl.
 */
function getHookLogPath(planningDir) {
  const today = new Date().toISOString().slice(0, 10);
  const dated = path.join(planningDir, 'logs', `hooks-${today}.jsonl`);
  if (fs.existsSync(dated)) return dated;
  // Fallback: find most recent hooks-*.jsonl
  const logsDir = path.join(planningDir, 'logs');
  try {
    const files = fs.readdirSync(logsDir)
      .filter(f => /^hooks-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .sort()
      .reverse();
    if (files.length > 0) return path.join(logsDir, files[0]);
  } catch (_e) { /* no logs dir */ }
  // Last fallback: legacy filename
  return path.join(planningDir, 'logs', 'hooks.jsonl');
}

/**
 * Agents route factory.
 * Reads agent definitions from plugins/pbr/agents/*.md.
 * Also provides hooks and errors sub-endpoints.
 *
 * @param {object} options
 * @param {string} options.planningDir - Path to .planning/ directory
 * @param {string} [options.agentsDir] - Path to agents directory (default: plugins/pbr/agents)
 * @returns {express.Router}
 */
function createAgentsRouter({ planningDir, agentsDir }) {
  // Check multiple possible agent definition directories
  const candidates = [
    agentsDir,
    path.join(planningDir, '..', 'plugins', 'pbr', 'agents'),
    path.join(planningDir, '..', '.claude', 'agents'),
    path.join(planningDir, '..', '.claude', 'plan-build-run', 'agents'),
  ].filter(Boolean);
  const resolvedAgentsDir = candidates.find(d => {
    try { return fs.statSync(d).isDirectory(); } catch (_e) { return false; }
  }) || candidates[0];

  const router = express.Router();

  /**
   * GET / - Return list of agent definitions.
   */
  router.get('/', async (_req, res) => {
    try {
      let files = [];
      try {
        files = await fs.promises.readdir(resolvedAgentsDir);
      } catch (_e) {
        return res.json([]);
      }

      const items = [];
      let idx = 0;

      // Parse agents
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        try {
          const content = await fs.promises.readFile(
            path.join(resolvedAgentsDir, file), 'utf-8'
          );
          const fm = parseFrontmatter(content).frontmatter;
          const toolsMatch = content.match(/tools:\s*\n((?:\s+-\s+.+\n?)*)/);
          const tools = toolsMatch
            ? toolsMatch[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
            : [];
          items.push({
            id: `agent-${idx++}`,
            type: 'agent',
            file,
            name: fm.name || file.replace('.md', ''),
            role: fm.description || '',
            model: fm.model || 'inherit',
            memory: fm.memory || 'none',
            contextSlots: [],
            totalContextBudget: '200k',
            maxAllowed: fm.model === 'opus' ? '200k' : '180k',
            hooks: [],
            configKeys: [],
            systemPrompt: null,
            tools,
          });
        } catch (_e) {
          // Skip unreadable files
        }
      }

      // Parse skills
      const skillsDir = path.join(resolvedAgentsDir, '..', 'skills');
      try {
        const skillDirs = await fs.promises.readdir(skillsDir, { withFileTypes: true });
        for (const entry of skillDirs) {
          if (!entry.isDirectory()) continue;
          const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
          try {
            const content = await fs.promises.readFile(skillFile, 'utf-8');
            const fm = parseFrontmatter(content).frontmatter;
            items.push({
              id: `skill-${idx++}`,
              type: 'skill',
              file: `skills/${entry.name}/SKILL.md`,
              name: fm.name || entry.name,
              role: fm.description || '',
              model: null,
              memory: null,
              contextSlots: [],
              totalContextBudget: '-',
              maxAllowed: '-',
              hooks: [],
              configKeys: [],
              systemPrompt: null,
              tools: [],
            });
          } catch (_e) { /* skip */ }
        }
      } catch (_e) { /* no skills dir */ }

      // Parse commands
      const commandsDir = path.join(resolvedAgentsDir, '..', 'commands');
      try {
        const cmdFiles = await fs.promises.readdir(commandsDir);
        for (const file of cmdFiles) {
          if (!file.endsWith('.md')) continue;
          items.push({
            id: `cmd-${idx++}`,
            type: 'command',
            file: `commands/${file}`,
            name: file.replace('.md', ''),
            role: `Slash command /${file.replace('.md', '')}`,
            model: null,
            memory: null,
            contextSlots: [],
            totalContextBudget: '-',
            maxAllowed: '-',
            hooks: [],
            configKeys: [],
            systemPrompt: null,
            tools: [],
          });
        }
      } catch (_e) { /* no commands dir */ }

      res.json(items);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /hooks - Return hook event log (last 100 events).
   */
  router.get('/hooks', async (_req, res) => {
    try {
      const eventsPath = getHookLogPath(planningDir);
      let events = [];

      try {
        const raw = await fs.promises.readFile(eventsPath, 'utf-8');
        events = raw
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            try { return JSON.parse(line); } catch (_e) { return null; }
          })
          .filter(Boolean);
      } catch (_e) {
        // No events file
      }

      // Map to UI-expected shape
      const mapped = events.slice(-100).map(evt => ({
        time: evt.ts || evt.time || new Date().toISOString(),
        hook: evt.event || evt.hook || 'unknown',
        status: evt.status || (evt.level === 'error' ? 'error' : 'success'),
        duration: evt.duration || '-',
        payload: evt.tool || evt.payload || null,
      }));

      res.json({ events: mapped, config: null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /errors - Return error entries from hook events.
   */
  router.get('/errors', async (_req, res) => {
    try {
      const eventsPath = getHookLogPath(planningDir);
      let errors = [];

      try {
        const raw = await fs.promises.readFile(eventsPath, 'utf-8');
        const events = raw
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            try { return JSON.parse(line); } catch (_e) { return null; }
          })
          .filter(Boolean);

        errors = events.filter(evt =>
          evt.level === 'error' ||
          evt.type === 'error' ||
          evt.status === 'error'
        );
      } catch (_e) {
        // No events file
      }

      res.json(errors);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createAgentsRouter;
