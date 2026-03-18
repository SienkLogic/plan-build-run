'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { parseFrontmatter } = require('../lib/frontmatter');

/**
 * Safely read a directory, returning [] if it doesn't exist.
 */
async function safeReaddir(dirPath, options) {
  try {
    return await fsp.readdir(dirPath, options);
  } catch (_e) {
    return [];
  }
}

/**
 * Safely read a file, returning null if it doesn't exist.
 */
async function safeReadFile(filePath) {
  try {
    return await fsp.readFile(filePath, 'utf-8');
  } catch (_e) {
    return null;
  }
}

/**
 * Read all .md files from a directory and parse their frontmatter.
 * Returns array of { file, ...frontmatter, body } objects.
 * Body is truncated to maxBodyLen characters.
 */
async function readMdDirectory(dirPath, maxBodyLen = 200) {
  const files = await safeReaddir(dirPath);
  const results = [];
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = await safeReadFile(path.join(dirPath, file));
    const { frontmatter, body } = parseFrontmatter(content || '');
    results.push({ file, ...frontmatter, body: body.slice(0, maxBodyLen) });
  }
  return results;
}

/**
 * Validate that a file/directory ID is safe (no path traversal).
 */
function assertSafeId(id) {
  if (!id || typeof id !== 'string' || /[/\\]/.test(id) || id.includes('..')) {
    throw new Error('Invalid file id');
  }
}

class PlanningReader {
  /**
   * @param {string} planningDir - Absolute path to .planning/ directory
   */
  constructor(planningDir) {
    this.planningDir = planningDir;
  }

  /**
   * Read STATE.md and return session state with progress and history.
   * Returns frontmatter fields plus nested progress object and history text.
   * Falls back to legacy HISTORY.md if STATE.md has no ## History section.
   */
  async getStatus() {
    const content = await safeReadFile(path.join(this.planningDir, 'STATE.md'));
    if (!content) return { error: 'No STATE.md found' };
    const { frontmatter, body } = parseFrontmatter(content);

    // Extract ## History section from body (merged state from Phase 5)
    let history = null;
    const historyMatch = body.match(/## History\n([\s\S]*?)(?=\n## |\s*$)/);
    if (historyMatch) {
      history = historyMatch[1].trim();
    } else {
      // Backwards compat: read legacy HISTORY.md if it exists
      const legacyHistory = await safeReadFile(path.join(this.planningDir, 'HISTORY.md'));
      if (legacyHistory) {
        const { body: histBody } = parseFrontmatter(legacyHistory);
        history = histBody.trim() || null;
      }
    }

    // Build response with progress as nested object (parsed by frontmatter lib)
    // and history from body
    const result = { ...frontmatter };
    if (history) {
      result.history = history;
    }

    return result;
  }

  /**
   * Read PROJECT.md and extract the ## Context section.
   * Returns { context: string } or { context: null } if not found.
   * Falls back to legacy CONTEXT.md if PROJECT.md has no ## Context section.
   */
  async getProjectContext() {
    const content = await safeReadFile(path.join(this.planningDir, 'PROJECT.md'));
    if (content) {
      const { body } = parseFrontmatter(content);
      const contextMatch = body.match(/## Context\n([\s\S]*?)(?=\n## |\s*$)/);
      if (contextMatch) {
        return { context: contextMatch[1].trim() };
      }
    }

    // Backwards compat: read legacy CONTEXT.md
    const legacyContext = await safeReadFile(path.join(this.planningDir, 'CONTEXT.md'));
    if (legacyContext) {
      const { body: ctxBody } = parseFrontmatter(legacyContext);
      return { context: ctxBody.trim() || null };
    }

    return { context: null };
  }

  /**
   * Read ROADMAP.md and parse milestone sections.
   * Returns an array of { name, version, status } objects.
   */
  async getMilestones() {
    const content = await safeReadFile(path.join(this.planningDir, 'ROADMAP.md'));
    if (!content) return [];

    const milestones = [];
    let idx = 0;

    // New format: <details><summary>## Milestone: Name (vX.Y) — SHIPPED date</summary>
    const detailsRegex = /<summary>## Milestone:\s*(.+?)<\/summary>/g;
    let match;
    while ((match = detailsRegex.exec(content)) !== null) {
      const raw = match[1];
      const shippedMatch = raw.match(/\u2014\s*SHIPPED\s+(.+)$/);
      const nameClean = raw.replace(/\s*\u2014\s*SHIPPED.*$/i, '').trim();
      const versionMatch = nameClean.match(/\(v([\d.]+)\)/);
      const name = nameClean.replace(/\s*\(v[\d.]+\)/, '').trim();
      const version = versionMatch ? versionMatch[1] : null;
      milestones.push({
        id: `ms-${idx++}`,
        name,
        title: version ? `${name} (v${version})` : name,
        version,
        status: 'completed',
        archived: true,
        progress: 100,
        description: shippedMatch ? `Shipped ${shippedMatch[1].trim()}` : null,
      });
    }

    // Old format + active milestones: ## Milestone: Name (optionally -- COMPLETED)
    const directRegex = /^## Milestone:\s*(.+)/gm;
    while ((match = directRegex.exec(content)) !== null) {
      const raw = match[1];
      // Skip if this heading is inside a <summary> (already captured above)
      const preceding = content.slice(Math.max(0, match.index - 20), match.index);
      if (preceding.includes('<summary>')) continue;

      const completed = /--\s*COMPLETED/i.test(raw);
      const nameClean = raw.replace(/\s*--\s*COMPLETED.*$/i, '').trim();
      const versionMatch = nameClean.match(/\(v([\d.]+)\)/);
      const name = nameClean.replace(/\s*\(v[\d.]+\)/, '').trim();
      const version = versionMatch ? versionMatch[1] : null;
      milestones.push({
        id: `ms-${idx++}`,
        name,
        title: version ? `${name} (v${version})` : name,
        version,
        status: completed ? 'completed' : 'active',
        archived: completed,
        progress: completed ? 100 : 0,
        description: null,
      });
    }

    return milestones;
  }

  /**
   * Read phase directories from .planning/phases/.
   * Returns array of { name, slug, plans } objects.
   */
  async getPhases() {
    const phasesDir = path.join(this.planningDir, 'phases');
    const entries = await safeReaddir(phasesDir, { withFileTypes: true });
    const phases = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slug = entry.name;
      const phaseNum = slug.match(/^(\d+)/);
      const phaseDir = path.join(phasesDir, slug);
      const files = await safeReaddir(phaseDir);
      const plans = files.filter(f => /^PLAN.*\.md$/i.test(f));
      const summaries = files.filter(f => /^SUMMARY.*\.md$/i.test(f));
      const hasVerification = files.some(f => /^VERIFICATION.*\.md$/i.test(f));
      const title = slug.replace(/^\d+-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const numPlans = plans.length;
      const numSummaries = summaries.length;

      let status = 'todo';
      if (hasVerification) status = 'done';
      else if (numSummaries > 0) status = 'in-progress';
      else if (numPlans > 0) status = 'in-progress';

      phases.push({
        id: phaseNum ? String(phaseNum[1]) : slug,
        number: phaseNum ? parseInt(phaseNum[1], 10) : null,
        slug,
        title,
        description: `Phase ${phaseNum ? phaseNum[1] : slug}: ${title}`,
        status,
        milestone: null,
        tasks: numPlans || 1,
        completed: numSummaries,
        taskList: plans.map((p, i) => ({
          id: `${slug}-t${i}`,
          title: p.replace(/\.md$/i, ''),
          status: i < numSummaries ? 'done' : (i === numSummaries && numSummaries > 0 ? 'in-progress' : 'todo'),
        })),
      });
    }

    return phases;
  }

  /**
   * Read todos from .planning/todos/pending/ and .planning/todos/done/.
   * Returns { pending: [...], done: [...] }.
   */
  async getTodos() {
    const todosDir = path.join(this.planningDir, 'todos');
    const [pendingRaw, doneRaw] = await Promise.all([
      readMdDirectory(path.join(todosDir, 'pending'), 500),
      readMdDirectory(path.join(todosDir, 'done'), 500),
    ]);
    const mapTodo = (t, status) => {
      const titleMatch = t.body && t.body.match(/^#\s+(.+)/m);
      return {
        id: t.file,
        title: titleMatch ? titleMatch[1] : t.file.replace(/\.md$/, '').replace(/-/g, ' '),
        status,
        priority: t.priority || 'medium',
        phase: t.category || null,
        notes: t.body ? t.body.replace(/^#.+\n+/, '').slice(0, 200) : null,
        assignee: null,
      };
    };
    return [
      ...pendingRaw.map(t => mapTodo(t, 'pending')),
      ...doneRaw.map(t => mapTodo(t, 'done')),
    ];
  }

  /**
   * Read notes from .planning/notes/*.md.
   */
  async getNotes() {
    const raw = await readMdDirectory(path.join(this.planningDir, 'notes'), 1000);
    return raw.map(n => {
      const titleMatch = n.body && n.body.match(/^#\s+(.+)/m);
      return {
        id: n.file,
        title: titleMatch ? titleMatch[1] : n.file.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-/g, ' '),
        created: n.date || n.file.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null,
        tags: n.promoted ? ['promoted'] : [],
        content: n.body || '',
      };
    });
  }

  /**
   * Read quick tasks from .planning/quick/{slug}/PLAN.md.
   */
  async getQuick() {
    const quickDir = path.join(this.planningDir, 'quick');
    const entries = await safeReaddir(quickDir, { withFileTypes: true });
    const tasks = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const taskDir = path.join(quickDir, entry.name);
      const planContent = await safeReadFile(path.join(taskDir, 'PLAN.md'));
      const summaryContent = await safeReadFile(path.join(taskDir, 'SUMMARY.md'));

      const plan = planContent ? parseFrontmatter(planContent) : null;
      const summary = summaryContent ? parseFrontmatter(summaryContent) : null;
      const fm = plan ? plan.frontmatter : {};
      const hasSummary = !!summary;

      tasks.push({
        id: fm.id || entry.name,
        content: fm.title || entry.name.replace(/-/g, ' '),
        done: hasSummary,
        created: fm.created || null,
      });
    }

    return tasks;
  }

  /**
   * Read research docs from .planning/research/*.md.
   */
  async getResearch() {
    const raw = await readMdDirectory(path.join(this.planningDir, 'research'), 1000);
    return raw.map(r => {
      const titleMatch = r.body && r.body.match(/^#\s+(?:Research:\s*)?(.+)/m);
      return {
        id: r.file,
        title: titleMatch ? titleMatch[1] : r.file.replace(/\.md$/, '').replace(/-/g, ' '),
        status: r.status || 'collected',
        source: r.mode || 'research',
        date: r.Research_date || r.file.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null,
        relevance: r.confidence || 'medium',
        summary: r.body ? r.body.replace(/^#.+\n+/, '').slice(0, 300) : '',
        keyTakeaways: [],
      };
    });
  }

  /**
   * Read STATE.md and extract ### Decisions section.
   * Returns array of { id, phase, text } objects.
   */
  async getDecisions() {
    const content = await safeReadFile(path.join(this.planningDir, 'STATE.md'));
    if (!content) return [];
    const sectionMatch = content.match(/### Decisions\n([\s\S]*?)(?=\n### |\n## |\s*$)/);
    if (!sectionMatch) return [];
    const lines = sectionMatch[1].trim().split('\n');
    const decisions = [];
    let idx = 0;
    for (const line of lines) {
      const m = line.match(/^- \[(.+?)\]:\s*(.+)$/);
      if (m) {
        decisions.push({ id: `dec-${idx++}`, phase: m[1], text: m[2] });
      }
    }
    return decisions;
  }

  /**
   * Append a decision to the ### Decisions section of STATE.md.
   * @param {string} phase - Phase label (e.g. 'Phase 01')
   * @param {string} text - Decision text
   * @returns {{ id: string, phase: string, text: string }}
   */
  async createDecision(phase, text) {
    const filePath = path.join(this.planningDir, 'STATE.md');
    const content = await safeReadFile(filePath);
    if (!content) throw new Error('STATE.md not found');

    const entry = `- [${phase}]: ${text}`;
    const sectionMatch = content.match(/(### Decisions\n)([\s\S]*?)(\n### |\n## |\s*$)/);
    let updated;
    if (sectionMatch) {
      const sectionEnd = content.indexOf(sectionMatch[3], content.indexOf(sectionMatch[0]));
      const before = content.slice(0, sectionEnd);
      const after = content.slice(sectionEnd);
      updated = before.trimEnd() + '\n' + entry + '\n' + after;
    } else {
      updated = content.trimEnd() + '\n\n### Decisions\n\n' + entry + '\n';
    }

    await fsp.writeFile(filePath, updated, 'utf-8');
    const existing = await this.getDecisions();
    return existing[existing.length - 1];
  }

  /**
   * Create a note file in .planning/notes/.
   * @param {string} title
   * @param {string} content
   * @param {string[]} tags
   */
  async createNote(title, content, tags = []) {
    const notesDir = path.join(this.planningDir, 'notes');
    await fsp.mkdir(notesDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const fileName = `${date}-${slug}.md`;
    const filePath = path.join(notesDir, fileName);
    const tagLine = tags.length > 0 ? `tags: [${tags.join(', ')}]\n` : '';
    const fileContent = `---\ndate: ${date}\n${tagLine}---\n\n# ${title}\n\n${content}\n`;
    await fsp.writeFile(filePath, fileContent, 'utf-8');
    return { id: fileName, title, created: date, tags, content };
  }

  /**
   * Update an existing note file.
   * @param {string} fileId - Filename in .planning/notes/
   * @param {string} title
   * @param {string} content
   * @param {string[]} tags
   */
  async updateNote(fileId, title, content, tags = []) {
    assertSafeId(fileId);
    const filePath = path.join(this.planningDir, 'notes', fileId);
    const existing = await safeReadFile(filePath);
    if (!existing) throw new Error(`Note not found: ${fileId}`);
    const { frontmatter } = parseFrontmatter(existing);
    const date = frontmatter.date || fileId.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || new Date().toISOString().slice(0, 10);
    const tagLine = tags.length > 0 ? `tags: [${tags.join(', ')}]\n` : '';
    const fileContent = `---\ndate: ${date}\n${tagLine}---\n\n# ${title}\n\n${content}\n`;
    await fsp.writeFile(filePath, fileContent, 'utf-8');
    return { id: fileId, title, created: date, tags, content };
  }

  /**
   * Delete a note file.
   * @param {string} fileId - Filename in .planning/notes/
   */
  async deleteNote(fileId) {
    assertSafeId(fileId);
    const filePath = path.join(this.planningDir, 'notes', fileId);
    await fsp.unlink(filePath);
    return { deleted: fileId };
  }

  /**
   * Create a todo file in .planning/todos/pending/.
   * @param {string} title
   * @param {string} priority
   * @param {string|null} phase
   * @param {string} notes
   */
  async createTodo(title, priority = 'medium', phase = null, notes = '') {
    const pendingDir = path.join(this.planningDir, 'todos', 'pending');
    await fsp.mkdir(pendingDir, { recursive: true });
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const fileName = `${slug}.md`;
    const filePath = path.join(pendingDir, fileName);
    const categoryLine = phase ? `category: ${phase}\n` : '';
    const fileContent = `---\npriority: ${priority}\n${categoryLine}---\n\n# ${title}\n\n${notes}\n`;
    await fsp.writeFile(filePath, fileContent, 'utf-8');
    return { id: fileName, title, status: 'pending', priority, phase, notes };
  }

  /**
   * Toggle a todo between pending and done directories.
   * @param {string} fileId - Filename
   * @param {string} currentStatus - 'pending' or 'done'
   */
  async toggleTodo(fileId, currentStatus) {
    assertSafeId(fileId);
    const fromDir = currentStatus === 'pending' ? 'pending' : 'done';
    const toDir = currentStatus === 'pending' ? 'done' : 'pending';
    const fromPath = path.join(this.planningDir, 'todos', fromDir, fileId);
    const toPath = path.join(this.planningDir, 'todos', toDir, fileId);
    await fsp.mkdir(path.join(this.planningDir, 'todos', toDir), { recursive: true });
    const content = await fsp.readFile(fromPath, 'utf-8');
    await fsp.writeFile(toPath, content, 'utf-8');
    await fsp.unlink(fromPath);
    const newStatus = toDir;
    return { id: fileId, status: newStatus };
  }

  /**
   * Delete a todo file.
   * @param {string} fileId - Filename
   * @param {string} status - 'pending' or 'done'
   */
  async deleteTodo(fileId, status) {
    assertSafeId(fileId);
    const dir = status === 'done' ? 'done' : 'pending';
    const filePath = path.join(this.planningDir, 'todos', dir, fileId);
    await fsp.unlink(filePath);
    return { deleted: fileId };
  }

  /**
   * Toggle a task completion status in a phase SUMMARY.md.
   * @param {string} phaseSlug - e.g. '01-foundation'
   * @param {number} taskIndex - Zero-based task index
   * @param {boolean} completed - New completion state
   */
  async togglePhaseTask(phaseSlug, taskIndex, completed) {
    assertSafeId(phaseSlug);
    const summaryFiles = await safeReaddir(path.join(this.planningDir, 'phases', phaseSlug));
    const summaryFile = summaryFiles.find(f => /SUMMARY/i.test(f) && f.endsWith('.md'));
    if (!summaryFile) throw new Error(`No SUMMARY.md found in phase ${phaseSlug}`);

    const filePath = path.join(this.planningDir, 'phases', phaseSlug, summaryFile);
    let content = await fsp.readFile(filePath, 'utf-8');

    // Find task checkboxes: - [x] or - [ ]
    const taskRegex = /^- \[([ x])\] /gm;
    let match;
    let idx = 0;
    let targetStart = -1;
    while ((match = taskRegex.exec(content)) !== null) {
      if (idx === taskIndex) {
        targetStart = match.index;
        break;
      }
      idx++;
    }

    if (targetStart === -1) throw new Error(`Task index ${taskIndex} not found in ${summaryFile}`);

    const marker = completed ? '[x]' : '[ ]';
    content = content.slice(0, targetStart) + `- ${marker} ` + content.slice(targetStart + 6);
    await fsp.writeFile(filePath, content, 'utf-8');
    return { phaseSlug, taskIndex, completed };
  }

  /**
   * Read ROADMAP.md and parse phase details including goal, status, depends_on, provides, implements.
   * Merges with disk-based getPhases() data for accurate status.
   * Returns array of phase objects sorted by number.
   */
  async getRoadmapPhases() {
    const content = await safeReadFile(path.join(this.planningDir, 'ROADMAP.md'));
    if (!content) return [];

    // Parse Phase Checklist for status
    const checklistStatuses = {};
    const checklistRegex = /^- \[([ x])\] Phase (\d+):/gm;
    let clMatch;
    while ((clMatch = checklistRegex.exec(content)) !== null) {
      const checked = clMatch[1] === 'x';
      const num = parseInt(clMatch[2], 10);
      checklistStatuses[num] = checked ? 'done' : 'todo';
    }

    // Parse Phase Details sections
    const phases = [];
    const phaseRegex = /### Phase (\d+):\s*(.+)\r?\n([\s\S]*?)(?=\r?\n### Phase \d+:|\r?\n## |\s*$)/g;
    let pMatch;
    while ((pMatch = phaseRegex.exec(content)) !== null) {
      const number = parseInt(pMatch[1], 10);
      const name = pMatch[2].trim();
      const body = pMatch[3];

      // Extract Goal
      const goalMatch = body.match(/\*\*Goal:\*\*\s*([\s\S]*?)(?=\r?\n\*\*|\s*$)/);
      const goal = goalMatch ? goalMatch[1].trim() : null;

      // Extract Depends on
      const depsMatch = body.match(/\*\*Depends on:\*\*\s*(.+)/);
      const dependsOn = depsMatch ? depsMatch[1].trim() : null;

      // Extract Provides
      let provides = [];
      const providesMatch = body.match(/\*\*Provides:\*\*\s*\r?\n((?:- .+\r?\n?)*)/);
      if (providesMatch) {
        provides = providesMatch[1].trim().split(/\r?\n/).map(l => l.replace(/^- /, '').trim()).filter(Boolean);
      }

      // Extract Requirements (REQ-IDs)
      const reqMatch = body.match(/\*\*Requirements:\*\*\s*(.+)/);
      const requirements = reqMatch
        ? reqMatch[1].trim().split(/[,\s]+/).filter(s => /^REQ-/.test(s))
        : [];

      // Extract Success Criteria
      let successCriteria = [];
      const scMatch = body.match(/\*\*Success Criteria:\*\*\s*\r?\n((?:- .+\r?\n?)*)/);
      if (scMatch) {
        successCriteria = scMatch[1].trim().split(/\r?\n/).map(l => l.replace(/^- /, '').trim()).filter(Boolean);
      } else {
        // Single-line format
        const scSingle = body.match(/\*\*Success Criteria:\*\*\s*(.+)/);
        if (scSingle) successCriteria = [scSingle[1].trim()];
      }

      // Extract Implements
      const implMatch = body.match(/\*\*Implements:\*\*\s*(.+)/);
      const implements_ = implMatch ? implMatch[1].trim() : null;

      // Build slug from name
      const slug = `${String(number).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;

      // Status from checklist
      let status = checklistStatuses[number] || 'todo';

      phases.push({
        number,
        name,
        slug,
        goal,
        status,
        dependsOn,
        provides,
        implements: implements_,
        requirements,
        successCriteria,
      });
    }

    // Merge with disk-based phase data for accurate status
    const diskPhases = await this.getPhases();
    const diskMap = {};
    for (const dp of diskPhases) {
      if (dp.number != null) diskMap[dp.number] = dp;
    }

    for (const phase of phases) {
      const disk = diskMap[phase.number];
      if (disk) {
        phase.slug = disk.slug;
        // Disk status is more accurate if the phase dir exists
        if (disk.status === 'done' || disk.status === 'in-progress') {
          phase.status = disk.status;
        }
      }
    }

    phases.sort((a, b) => a.number - b.number);
    return phases;
  }

  /**
   * Read phase detail: plans, summaries, verifications, context files.
   * @param {string} slug - Phase directory name (e.g. '02-roadmap-primary-view')
   * @returns {{ slug, plans, summaries, verifications, context }}
   */
  async getPhaseDetail(slug) {
    const phaseDir = path.join(this.planningDir, 'phases', slug);
    const files = await safeReaddir(phaseDir);

    const categories = {
      plans: /^PLAN.*\.md$/i,
      summaries: /^SUMMARY.*\.md$/i,
      verifications: /^VERIFICATION.*\.md$/i,
      context: /^CONTEXT.*\.md$/i,
    };

    const result = { slug, plans: [], summaries: [], verifications: [], context: [] };

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      for (const [cat, regex] of Object.entries(categories)) {
        if (regex.test(file)) {
          const content = await safeReadFile(path.join(phaseDir, file));
          const { frontmatter, body } = parseFrontmatter(content || '');
          result[cat].push({ file, ...frontmatter, body: body.slice(0, 500) });
          break;
        }
      }
    }

    return result;
  }

  /**
   * List .md files in the .planning/ directory with metadata.
   * Returns array of { name, size, mtimeMs } sorted alphabetically.
   */
  async getFiles() {
    const entries = await safeReaddir(this.planningDir);
    const files = [];
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      try {
        const stat = await fsp.stat(path.join(this.planningDir, entry));
        files.push({ name: entry, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch (_e) {
        // skip files that vanish between readdir and stat
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    return files;
  }

  /**
   * Read a single .md file from .planning/ directory.
   * @param {string} filename - Must end with .md and contain no path separators
   * @returns {{ name: string, content: string, mtimeMs: number }}
   */
  async getFileContent(filename) {
    if (!filename.endsWith('.md') || /[/\\]/.test(filename)) {
      throw new Error('Invalid filename');
    }
    const filePath = path.join(this.planningDir, filename);
    const content = await fsp.readFile(filePath, 'utf-8');
    const stat = await fsp.stat(filePath);
    return { name: filename, content, mtimeMs: stat.mtimeMs };
  }

  /**
   * Write content to a .md file in .planning/ directory.
   * @param {string} filename - Must end with .md and contain no path separators
   * @param {string} content - File content to write
   * @returns {{ name: string, mtimeMs: number }}
   */
  async writeFile(filename, content) {
    if (!filename.endsWith('.md') || /[/\\]/.test(filename)) {
      throw new Error('Invalid filename');
    }
    const filePath = path.join(this.planningDir, filename);
    await fsp.writeFile(filePath, content, 'utf-8');
    const stat = await fsp.stat(filePath);
    return { name: filename, mtimeMs: stat.mtimeMs };
  }

  /**
   * Read config.json.
   */
  async getConfig() {
    const content = await safeReadFile(path.join(this.planningDir, 'config.json'));
    if (!content) return {};
    try {
      return JSON.parse(content);
    } catch (_e) {
      return { error: 'Invalid JSON in config.json' };
    }
  }

  /**
   * Write config.json.
   */
  async writeConfig(data) {
    const filePath = path.join(this.planningDir, 'config.json');
    await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return data;
  }
}

module.exports = { PlanningReader, parseFrontmatter, safeReadFile };
