/**
 * lib/roadmap.js — ROADMAP.md operations for Plan-Build-Run tools.
 *
 * Handles parsing and updating the ROADMAP.md phase overview table.
 */

const fs = require('fs');
const path = require('path');
const { lockedFileUpdate, validateStatusTransition, parseYamlFrontmatter, findFiles } = require('./core');

// --- Parsers ---

function parseRoadmapMd(content) {
  // Normalize CRLF to LF at parse boundary for cross-platform support
  const normalized = content.replace(/\r\n/g, '\n');
  const result = { phases: [], has_progress_table: false };

  // Find Phase Overview table
  const overviewMatch = normalized.match(/## Phase Overview[\s\S]*?\|[\s\S]*?(?=\n##|\s*$)/);
  if (overviewMatch) {
    const rows = overviewMatch[0].split('\n').filter(r => r.includes('|'));
    // Skip header and separator rows
    for (let i = 2; i < rows.length; i++) {
      const cols = rows[i].split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3) {
        result.phases.push({
          number: cols[0],
          name: cols[1],
          goal: cols[2],
          plans: cols[3] || '',
          wave: cols[4] || '',
          status: cols[5] || 'pending'
        });
      }
    }
  }

  // Heading-based phase discovery fallback: if no table rows produced phases,
  // scan for "## Phase N: Name" / "### Phase N: Name" headings (v14.0+ format)
  if (result.phases.length === 0) {
    const headingRe = /#{2,4}\s*Phase\s+(\d+(?:\.\d+)*)\s*:\s*([^\n]+)/gi;
    let hm;
    while ((hm = headingRe.exec(normalized)) !== null) {
      result.phases.push({
        number: hm[1],
        name: hm[2].trim(),
        goal: '',
        plans: '',
        status: 'unknown'
      });
    }
  }

  // Check for Progress table
  result.has_progress_table = /## Progress/.test(normalized);

  return result;
}

// --- Table helpers ---

/**
 * Find the row index of a phase in a ROADMAP.md table.
 * @returns {number} Line index or -1 if not found
 */
function findRoadmapRow(lines, phaseNum) {
  const paddedPhase = phaseNum.padStart(2, '0');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('|')) continue;
    const parts = lines[i].split('|');
    if (parts.length < 3) continue;
    const phaseCol = parts[1] ? parts[1].trim() : '';
    if (phaseCol === paddedPhase) {
      return i;
    }
  }
  return -1;
}

/**
 * Update a specific column in a markdown table row.
 * @param {string} row - The full table row string (e.g., "| 01 | Setup | ... |")
 * @param {number} columnIndex - 0-based column index (Phase=0, Name=1, ..., Status=5)
 * @param {string} newValue - New cell value
 * @returns {string} Updated row
 */
function updateTableRow(row, columnIndex, newValue) {
  const parts = row.split('|');
  // parts[0] is empty (before first |), data starts at parts[1]
  const partIndex = columnIndex + 1;
  if (partIndex < parts.length) {
    parts[partIndex] = ` ${newValue} `;
  }
  return parts.join('|');
}

// --- Mutation commands ---

/**
 * Update the Status column for a phase in ROADMAP.md's Phase Overview table.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} newStatus - New status value
 * @param {string} [planningDir] - Path to .planning directory
 */
function roadmapUpdateStatus(phaseNum, newStatus, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  let oldStatus = null;

  const result = lockedFileUpdate(roadmapPath, (content) => {
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const rowIdx = findRoadmapRow(lines, phaseNum);
    if (rowIdx === -1) {
      return content; // No matching row found
    }
    const parts = lines[rowIdx].split('|');
    oldStatus = parts[6] ? parts[6].trim() : 'unknown';
    lines[rowIdx] = updateTableRow(lines[rowIdx], 5, newStatus);
    return lines.join(lineEnding);
  });

  if (!oldStatus) {
    return { success: false, error: `Phase ${phaseNum} not found in ROADMAP.md table` };
  }

  // Advisory transition validation — warn on suspicious transitions but don't block
  const transition = validateStatusTransition(oldStatus, newStatus);
  if (!transition.valid && transition.warning) {
    process.stderr.write(`[pbr-tools] WARNING: ${transition.warning}\n`);
  }

  if (result.success) {
    const response = { success: true, old_status: oldStatus, new_status: newStatus };
    if (!transition.valid) {
      response.transition_warning = transition.warning;
    }
    return response;
  }
  return { success: false, error: result.error };
}

/**
 * Update the Plans column for a phase in ROADMAP.md's Phase Overview table.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} complete - Completed plan count
 * @param {string} total - Total plan count
 * @param {string} [planningDir] - Path to .planning directory
 */
function roadmapUpdatePlans(phaseNum, complete, total, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  let oldPlans = null;
  const newPlans = `${complete}/${total}`;

  const result = lockedFileUpdate(roadmapPath, (content) => {
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const rowIdx = findRoadmapRow(lines, phaseNum);
    if (rowIdx === -1) {
      return content;
    }
    const parts = lines[rowIdx].split('|');
    oldPlans = parts[4] ? parts[4].trim() : 'unknown';
    lines[rowIdx] = updateTableRow(lines[rowIdx], 3, newPlans);
    return lines.join(lineEnding);
  });

  if (!oldPlans) {
    return { success: false, error: `Phase ${phaseNum} not found in ROADMAP.md table` };
  }

  if (result.success) {
    return { success: true, old_plans: oldPlans, new_plans: newPlans };
  }
  return { success: false, error: result.error };
}

// --- Comprehensive analysis ---

/**
 * Analyze ROADMAP.md comprehensively, cross-referencing with disk state.
 *
 * Returns a structured object with all phases, their goals, dependencies,
 * progress, disk status, and aggregated statistics.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @returns {{ phases: Array, current_phase: number|null, next_phase: number|null, stats: object, error?: string }}
 */
function roadmapAnalyze(planningDir) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { phases: [], current_phase: null, next_phase: null, stats: _emptyStats(), error: 'ROADMAP.md not found' };
  }

  // snapshot pattern: single read, parse from memory — no re-reads during analysis or renumbering
  const content = fs.readFileSync(roadmapPath, 'utf8');
  const lines = content.split(/\r?\n/);

  // 1. Parse phase headings, goals, dependencies from milestone sections
  const phases = _parsePhaseHeadings(lines);

  // 2. Parse progress tables and merge
  _mergeProgressTables(lines, phases);

  // 3. Parse phase checklist items and merge
  _mergePhaseChecklist(lines, phases);

  // 4. Cross-reference with disk
  const phasesDir = path.join(planningDir, 'phases');
  for (const phase of phases) {
    _crossReferenceDisk(phase, phasesDir);
  }

  // 5. Get current_phase from STATE.md
  let current_phase = null;
  const statePath = path.join(planningDir, 'STATE.md');
  if (fs.existsSync(statePath)) {
    try {
      const stateContent = fs.readFileSync(statePath, 'utf8');
      const fm = parseYamlFrontmatter(stateContent);
      if (fm && fm.current_phase != null) {
        current_phase = typeof fm.current_phase === 'number' ? fm.current_phase : parseInt(fm.current_phase, 10);
        if (isNaN(current_phase)) current_phase = null;
      }
    } catch (_e) { /* ignore */ }
  }

  // 6. Derive next_phase
  let next_phase = null;
  if (current_phase != null) {
    // Find phases after current that are not complete
    const remaining = phases
      .filter(p => p.number > current_phase && p.disk_status !== 'complete')
      .sort((a, b) => a.number - b.number);
    if (remaining.length > 0) {
      next_phase = remaining[0].number;
    }
  }

  // 7. Compute stats
  const stats = _computeStats(phases);

  return { phases, current_phase, next_phase, stats };
}

function _emptyStats() {
  return {
    total_phases: 0,
    total_plans: 0,
    total_summaries: 0,
    progress_percent: 0,
    phases_complete: 0,
    phases_remaining: 0
  };
}

/**
 * Parse `### Phase N:` headings within milestone `## Milestone:` sections.
 */
function _parsePhaseHeadings(lines) {
  const phases = [];
  const phaseMap = new Map();
  let currentMilestone = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect milestone heading: ## Milestone: ...  or ## Milestone N: ...
    const milestoneMatch = line.match(/^##\s+Milestone[:\s]+(.*)/i);
    if (milestoneMatch) {
      currentMilestone = milestoneMatch[1].trim();
      continue;
    }

    // Detect phase heading: ### Phase N: Name  or ### Phase NN: Name
    const phaseMatch = line.match(/^###\s+Phase\s+(\d+)\s*:\s*(.*)/i);
    if (phaseMatch) {
      const phaseNum = parseInt(phaseMatch[1], 10);
      const phaseName = phaseMatch[2].trim();

      // Look ahead for **Goal:** and **Depends on:**
      let goal = '';
      let depends_on = [];
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        const ahead = lines[j];
        // Stop at next heading
        if (/^#{1,3}\s/.test(ahead)) break;

        const goalMatch = ahead.match(/\*\*Goal:\*\*\s*(.*)/i);
        if (goalMatch) {
          goal = goalMatch[1].trim();
        }

        const depsMatch = ahead.match(/\*\*Depends?\s*on:\*\*\s*(.*)/i);
        if (depsMatch) {
          const depsStr = depsMatch[1].trim();
          if (depsStr && depsStr !== 'None' && depsStr !== '-' && depsStr !== 'none') {
            depends_on = depsStr.split(/[,;]/)
              .map(s => s.replace(/[^0-9]/g, ''))
              .filter(Boolean)
              .map(Number);
          }
        }
      }

      const entry = {
        number: phaseNum,
        name: phaseName,
        goal,
        depends_on,
        milestone: currentMilestone || 'Unknown',
        progress: null,
        checklist_checked: null,
        plan_count: 0,
        summary_count: 0,
        has_verification: false,
        verification_result: null,
        disk_status: 'no_directory'
      };

      phases.push(entry);
      phaseMap.set(phaseNum, entry);
      continue;
    }
  }

  return phases;
}

/**
 * Parse Progress tables: `| N. Phase Name | X/Y | Status |`
 */
function _mergeProgressTables(lines, phases) {
  const phaseMap = new Map(phases.map(p => [p.number, p]));
  let inProgressSection = false;

  for (const line of lines) {
    if (/^##\s+Progress/i.test(line)) {
      inProgressSection = true;
      continue;
    }
    if (inProgressSection && /^##\s/.test(line) && !/^##\s+Progress/i.test(line)) {
      inProgressSection = false;
      continue;
    }

    if (inProgressSection && line.includes('|')) {
      // Try to extract: | N. Phase Name | X/Y | Status |
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 2) {
        // First col might be "N. Phase Name" or just a number
        const numMatch = cols[0].match(/^(\d+)/);
        if (numMatch) {
          const phaseNum = parseInt(numMatch[1], 10);
          const phase = phaseMap.get(phaseNum);
          if (phase) {
            // Second col is often X/Y progress
            const progressMatch = cols[1].match(/(\d+)\s*\/\s*(\d+)/);
            if (progressMatch) {
              phase.progress = `${progressMatch[1]}/${progressMatch[2]}`;
            }
          }
        }
      }
    }
  }
}

/**
 * Parse Phase Checklist items: `- [ ] Phase N:` or `- [x] Phase N:`
 */
function _mergePhaseChecklist(lines, phases) {
  const phaseMap = new Map(phases.map(p => [p.number, p]));

  for (const line of lines) {
    const checkMatch = line.match(/^-\s+\[([ xX])\]\s+Phase\s+(\d+)/i);
    if (checkMatch) {
      const checked = checkMatch[1].toLowerCase() === 'x';
      const phaseNum = parseInt(checkMatch[2], 10);
      const phase = phaseMap.get(phaseNum);
      if (phase) {
        phase.checklist_checked = checked;
      }
    }
  }
}

/**
 * Cross-reference a phase entry against files on disk.
 */
function _crossReferenceDisk(phase, phasesDir) {
  if (!fs.existsSync(phasesDir)) {
    phase.disk_status = 'no_directory';
    return;
  }

  // Find matching directory by phase number prefix
  const paddedNum = String(phase.number).padStart(2, '0');
  let phaseDir = null;
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(paddedNum + '-')) {
        phaseDir = path.join(phasesDir, entry.name);
        break;
      }
    }
  } catch (_e) { /* ignore */ }

  if (!phaseDir) {
    phase.disk_status = 'no_directory';
    return;
  }

  // Count PLANs and SUMMARYs
  const plans = findFiles(phaseDir, /^PLAN.*\.md$/i);
  const summaries = findFiles(phaseDir, /^SUMMARY.*\.md$/i);
  phase.plan_count = plans.length;
  phase.summary_count = summaries.length;

  // Check VERIFICATION.md
  const verificationPath = path.join(phaseDir, 'VERIFICATION.md');
  if (fs.existsSync(verificationPath)) {
    phase.has_verification = true;
    try {
      const vContent = fs.readFileSync(verificationPath, 'utf8');
      const fm = parseYamlFrontmatter(vContent);
      if (fm && fm.result) {
        phase.verification_result = fm.result;
      }
    } catch (_e) { /* ignore */ }
  }

  // Determine disk_status
  if (phase.has_verification && phase.verification_result === 'passed') {
    phase.disk_status = 'complete';
  } else if (phase.summary_count > 0) {
    phase.disk_status = 'partial';
  } else if (phase.plan_count > 0) {
    phase.disk_status = 'planned';
  } else {
    phase.disk_status = 'empty';
  }
}

/**
 * Compute aggregated stats from phase data.
 */
function _computeStats(phases) {
  let total_plans = 0;
  let total_summaries = 0;
  let phases_complete = 0;

  for (const phase of phases) {
    total_plans += phase.plan_count;
    total_summaries += phase.summary_count;
    if (phase.disk_status === 'complete') {
      phases_complete++;
    }
  }

  const total_phases = phases.length;
  const phases_remaining = total_phases - phases_complete;
  const progress_percent = total_phases > 0 ? Math.round((phases_complete / total_phases) * 100) : 0;

  return {
    total_phases,
    total_plans,
    total_summaries,
    progress_percent,
    phases_complete,
    phases_remaining
  };
}

// --- Dynamic phase operations ---

/**
 * Append a new phase heading + progress row to the current (non-COMPLETED) milestone section.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {number} phaseNum - Phase number to add
 * @param {string} name - Human-readable phase name
 * @param {string} [goal] - Goal description
 * @param {number|null} [dependsOn] - Phase number this depends on
 * @returns {{ success: boolean, error?: string }}
 */
function roadmapAppendPhase(planningDir, phaseNum, name, goal, dependsOn) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  return lockedFileUpdate(roadmapPath, (content) => {
    const lines = content.split(/\r?\n/);
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

    // Find the last milestone section that is NOT completed
    let lastMilestoneIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Milestone/i.test(lines[i]) && !/COMPLETED/i.test(lines[i])) {
        lastMilestoneIdx = i;
      }
    }

    // Build the phase heading block
    const _paddedNum = String(phaseNum).padStart(2, '0');
    const block = [];
    block.push(`### Phase ${phaseNum}: ${name}`);
    if (goal) block.push(`**Goal:** ${goal}`);
    const depText = dependsOn ? `Phase ${dependsOn}` : 'None';
    block.push(`**Depends on:** ${depText}`);
    block.push('');

    // Find where to insert the phase heading: before the next ## heading after the milestone
    let insertIdx = lines.length;
    if (lastMilestoneIdx !== -1) {
      for (let i = lastMilestoneIdx + 1; i < lines.length; i++) {
        if (/^##\s+[^#]/.test(lines[i])) {
          insertIdx = i;
          break;
        }
      }
    }

    // Insert the phase heading block
    lines.splice(insertIdx, 0, ...block);

    // Find and update Progress table: append a row
    const progressRowLine = `| ${phaseNum}. ${name} | 0/0 | Pending |`;
    let progressTableEnd = -1;
    let inProgressSection = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Progress/i.test(lines[i])) {
        inProgressSection = true;
        continue;
      }
      if (inProgressSection) {
        if (/^##\s/.test(lines[i]) && !/^##\s+Progress/i.test(lines[i])) {
          progressTableEnd = i;
          break;
        }
        // Track last table row
        if (lines[i].includes('|')) {
          progressTableEnd = i + 1;
        }
      }
    }

    if (progressTableEnd > 0) {
      lines.splice(progressTableEnd, 0, progressRowLine);
    }

    return lines.join(lineEnding);
  });
}

/**
 * Remove a phase heading block and its progress table row from ROADMAP.md.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {number} phaseNum - Phase number to remove
 * @returns {{ success: boolean, error?: string }}
 */
function roadmapRemovePhase(planningDir, phaseNum) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  return lockedFileUpdate(roadmapPath, (content) => {
    const lines = content.split(/\r?\n/);
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

    // Find and remove the ### Phase N: heading and its content block
    let headingIdx = -1;
    let blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^###\s+Phase\s+(\d+)\s*:/i);
      if (match && parseInt(match[1], 10) === phaseNum) {
        headingIdx = i;
        // Find end of this block (next ### or ## heading)
        for (let j = i + 1; j < lines.length; j++) {
          if (/^#{1,3}\s/.test(lines[j])) {
            blockEnd = j;
            break;
          }
        }
        if (blockEnd === -1) blockEnd = lines.length;
        break;
      }
    }

    if (headingIdx !== -1) {
      lines.splice(headingIdx, blockEnd - headingIdx);
    }

    // Remove progress table row matching "| N. " pattern
    for (let i = lines.length - 1; i >= 0; i--) {
      const rowMatch = lines[i].match(/^\|\s*(\d+)\./);
      if (rowMatch && parseInt(rowMatch[1], 10) === phaseNum) {
        lines.splice(i, 1);
        break;
      }
    }

    return lines.join(lineEnding);
  });
}

/**
 * Renumber all phase references >= startNum by delta in ROADMAP.md.
 * Handles: ### Phase N: headings, "Phase N" in text, progress table rows "| N.",
 * checklist items "Phase N:".
 *
 * Iterates in reverse when delta > 0 (to avoid collisions), forward when delta < 0.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {number} startNum - Renumber phases with number >= this
 * @param {number} delta - Amount to shift (+1 for insert, -1 for remove)
 * @returns {{ success: boolean, error?: string }}
 */
function roadmapRenumberPhases(planningDir, startNum, delta) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  return lockedFileUpdate(roadmapPath, (content) => {
    const lines = content.split(/\r?\n/);
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

    // Collect all phase numbers that need renumbering, process in correct order
    const nums = [];
    for (let i = 0; i < lines.length; i++) {
      const headingMatch = lines[i].match(/^###\s+Phase\s+(\d+)\s*:/i);
      if (headingMatch) {
        const n = parseInt(headingMatch[1], 10);
        if (n >= startNum && !nums.includes(n)) nums.push(n);
      }
      const rowMatch = lines[i].match(/^\|\s*(\d+)\./);
      if (rowMatch) {
        const n = parseInt(rowMatch[1], 10);
        if (n >= startNum && !nums.includes(n)) nums.push(n);
      }
    }

    // Sort: reverse for delta > 0 (avoid collisions), forward for delta < 0
    if (delta > 0) {
      nums.sort((a, b) => b - a);
    } else {
      nums.sort((a, b) => a - b);
    }

    for (const num of nums) {
      const newNum = num + delta;
      for (let i = 0; i < lines.length; i++) {
        // ### Phase N: heading
        const headingRegex = new RegExp(`^(###\\s+Phase\\s+)${num}(\\s*:.*)`, 'i');
        if (headingRegex.test(lines[i])) {
          lines[i] = lines[i].replace(headingRegex, `$1${newNum}$2`);
        }
        // Progress table row: | N. Name |
        const rowRegex = new RegExp(`^(\\|\\s*)${num}(\\.)`);
        if (rowRegex.test(lines[i])) {
          lines[i] = lines[i].replace(rowRegex, `$1${newNum}$2`);
        }
        // Checklist: - [ ] Phase N: or - [x] Phase N:
        const checkRegex = new RegExp(`^(\\s*-\\s+\\[[ xX]\\]\\s+Phase\\s+)${num}(\\s*[:])`, 'i');
        if (checkRegex.test(lines[i])) {
          lines[i] = lines[i].replace(checkRegex, `$1${newNum}$2`);
        }
        // Dependency text: "Phase N" (but not in headings already handled)
        if (!/^###/.test(lines[i]) && !/^\|/.test(lines[i])) {
          const depRegex = new RegExp(`(Phase\\s+)${num}(?=\\b)`, 'gi');
          lines[i] = lines[i].replace(depRegex, `$1${newNum}`);
        }
      }
    }

    return lines.join(lineEnding);
  });
}

/**
 * Insert a phase heading at a specific position in ROADMAP.md (before the next phase).
 * Unlike roadmapAppendPhase which appends at end, this inserts at the right position.
 *
 * @param {string} planningDir - Path to .planning/ directory
 * @param {number} position - Position number for the new phase
 * @param {string} name - Phase name
 * @param {string} [goal] - Goal description
 * @param {number|null} [dependsOn] - Dependency phase number
 * @returns {{ success: boolean, error?: string }}
 */
function roadmapInsertPhase(planningDir, position, name, goal, dependsOn) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  return lockedFileUpdate(roadmapPath, (content) => {
    const lines = content.split(/\r?\n/);
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';

    // Build the phase heading block
    const block = [];
    block.push(`### Phase ${position}: ${name}`);
    if (goal) block.push(`**Goal:** ${goal}`);
    const depText = dependsOn ? `Phase ${dependsOn}` : 'None';
    block.push(`**Depends on:** ${depText}`);
    block.push('');

    // Find where to insert: before the phase heading that now has number position+1
    // (since renumbering already happened)
    let insertIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^###\s+Phase\s+(\d+)\s*:/i);
      if (match && parseInt(match[1], 10) === position + 1) {
        insertIdx = i;
        break;
      }
    }

    if (insertIdx === -1) {
      // No phase after this position found; append at end of last milestone section
      let lastMilestoneEnd = lines.length;
      for (let i = 0; i < lines.length; i++) {
        if (/^##\s+Milestone/i.test(lines[i]) && !/COMPLETED/i.test(lines[i])) {
          // Find end of this milestone section
          for (let j = i + 1; j < lines.length; j++) {
            if (/^##\s+[^#]/.test(lines[j])) {
              lastMilestoneEnd = j;
              break;
            }
          }
        }
      }
      insertIdx = lastMilestoneEnd;
    }

    lines.splice(insertIdx, 0, ...block);

    // Insert progress table row at the right position
    const progressRow = `| ${position}. ${name} | 0/0 | Pending |`;
    let progressInsertIdx = -1;
    let inProgressSection = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Progress/i.test(lines[i])) {
        inProgressSection = true;
        continue;
      }
      if (inProgressSection) {
        if (/^##\s/.test(lines[i]) && !/^##\s+Progress/i.test(lines[i])) {
          // End of progress section, insert here if we haven't found a spot
          if (progressInsertIdx === -1) progressInsertIdx = i;
          break;
        }
        // Find the row for position+1 (the phase that was just shifted)
        const rowMatch = lines[i].match(/^\|\s*(\d+)\./);
        if (rowMatch) {
          const rowNum = parseInt(rowMatch[1], 10);
          if (rowNum === position + 1 && progressInsertIdx === -1) {
            progressInsertIdx = i;
          }
        }
      }
    }

    if (progressInsertIdx > 0) {
      lines.splice(progressInsertIdx, 0, progressRow);
    }

    return lines.join(lineEnding);
  });
}

module.exports = {
  parseRoadmapMd,
  findRoadmapRow,
  updateTableRow,
  roadmapUpdateStatus,
  roadmapUpdatePlans,
  roadmapAnalyze,
  roadmapAppendPhase,
  roadmapRemovePhase,
  roadmapRenumberPhases,
  roadmapInsertPhase
};
