/**
 * lib/roadmap.cjs — ROADMAP.md operations for Plan-Build-Run tools.
 *
 * Handles parsing and updating the ROADMAP.md phase overview table,
 * comprehensive analysis with disk cross-referencing, and dynamic
 * phase operations (append, remove, insert, renumber).
 *
 * Hybrid module merging PBR reference features with GSD-unique utilities.
 */

const fs = require('fs');
const path = require('path');
const {
  lockedFileUpdate,
  validateStatusTransition,
  findFiles
} = require('./core');
const { parseYamlFrontmatter } = require('./yaml');

// --- Parsers ---

function parseRoadmapMd(content) {
  // Normalize CRLF to LF at parse boundary for cross-platform support
  const normalized = content.replace(/\r\n/g, '\n');
  // Strip <details>/<summary> tags so collapsed milestones are parsed
  const stripped = normalized
    .replace(/<\/?details>/gi, '')
    .replace(/<\/?summary>/gi, '');
  const result = { phases: [], has_progress_table: false };

  // Parse Progress table (v9+ format: 3-column table)
  const progressMatch = stripped.match(/## Progress[\s\S]*?(?=\n##(?!\s*Progress)|\s*$)/);
  // Only use Progress table if it actually contains a markdown table with pipe rows
  const progressRows = progressMatch ? progressMatch[0].split('\n').filter(r => r.includes('|')) : [];
  if (progressMatch && progressRows.length >= 2) {
    result.has_progress_table = true;
    const rows = progressRows;
    if (rows.length >= 2) {
      // Dynamic column detection from header row
      const headers = rows[0].split('|').map(h => h.trim().toLowerCase()).filter(Boolean);
      const colIdx = {
        phase: headers.findIndex(h => /phase/i.test(h)),
        milestone: headers.findIndex(h => /milestone/i.test(h)),
        plans: headers.findIndex(h => /plans?\s*complete/i.test(h)),
        status: headers.findIndex(h => /status/i.test(h)),
        completed: headers.findIndex(h => /completed/i.test(h))
      };

      // Skip header (0) and separator (1) rows
      for (let i = 2; i < rows.length; i++) {
        const cols = rows[i].split('|').map(c => c.trim()).filter(Boolean);
        if (cols.length >= 2) {
          result.phases.push({
            number: colIdx.phase !== -1 ? cols[colIdx.phase] || '' : cols[0] || '',
            name: '', // Name is embedded in Phase column as "N. Name"
            goal: '',
            plans: colIdx.plans !== -1 && colIdx.plans < cols.length ? cols[colIdx.plans] : '',
            milestone: colIdx.milestone !== -1 && colIdx.milestone < cols.length ? cols[colIdx.milestone] : '',
            status: colIdx.status !== -1 && colIdx.status < cols.length ? cols[colIdx.status] : 'pending',
            completed: colIdx.completed !== -1 && colIdx.completed < cols.length ? cols[colIdx.completed] : ''
          });
        }
      }
    }
  }
  // Even without a parseable Progress table, note if the heading exists
  if (!result.has_progress_table) {
    result.has_progress_table = !!progressMatch;
  }

  // Heading-based phase discovery fallback: if no table rows produced phases,
  // scan for "## Phase N: Name" / "### Phase N: Name" headings (v14.0+ format)
  if (result.phases.length === 0) {
    const headingRe = /#{2,4}\s*Phase\s+(\d+(?:\.\d+)*)\s*:\s*([^\n]+)/gi;
    let hm;
    while ((hm = headingRe.exec(stripped)) !== null) {
      result.phases.push({
        number: hm[1],
        name: hm[2].trim(),
        goal: '',
        plans: '',
        status: 'unknown'
      });
    }
  }

  // Parse phase heading blocks for requirements and success criteria
  const lines = stripped.split('\n');
  const phaseMap = new Map();
  for (const phase of result.phases) {
    const numMatch = String(phase.number).match(/^(\d+)/);
    if (numMatch) phaseMap.set(parseInt(numMatch[1], 10), phase);
  }

  for (let i = 0; i < lines.length; i++) {
    const phaseMatch = lines[i].match(/^###\s+Phase\s+(\d+)\s*:\s*(.*)/i);
    if (phaseMatch) {
      const phaseNum = parseInt(phaseMatch[1], 10);
      const phase = phaseMap.get(phaseNum);
      if (phase) {
        if (!phase.name) phase.name = phaseMatch[2].trim();
        // Look ahead for fields
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          if (/^#{1,3}\s/.test(lines[j])) break;
          const goalMatch = lines[j].match(/\*\*Goal:\*\*\s*(.*)/i);
          if (goalMatch && !phase.goal) phase.goal = goalMatch[1].trim();
          const reqMatch = lines[j].match(/\*\*Requirements:\*\*\s*(.*)/i);
          if (reqMatch) phase.requirements = reqMatch[1].trim();
          const critMatch = lines[j].match(/\*\*Success Criteria:\*\*\s*(.*)/i);
          if (critMatch) phase.success_criteria = critMatch[1].trim();
        }
      }
    }
  }

  return result;
}

// --- Table helpers ---

/**
 * Find the row index of a phase in a ROADMAP.md table.
 * @returns {number} Line index or -1 if not found
 */
function findRoadmapRow(lines, phaseNum) {
  const paddedPhase = phaseNum.padStart(2, '0');
  const numericPhase = String(parseInt(phaseNum, 10));
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('|')) continue;
    // Skip separator rows
    if (/^\s*\|[\s-:|]+\|\s*$/.test(lines[i])) continue;
    const parts = lines[i].split('|');
    if (parts.length < 3) continue;
    // Search ALL columns for a phase number match
    // Handles v9+ format: "| 21. Phase Name | X/Y | Status |" (number+name merged in 3-col table)
    for (let c = 1; c < parts.length - 1; c++) {
      const col = (parts[c] || '').trim();
      // Match "01", "1", "01.", "01. Name", etc.
      const match = col.match(/^0*(\d+)\./);
      if (match && (match[1] === numericPhase || col === paddedPhase)) {
        return i;
      }
      if (col === paddedPhase || col === numericPhase) {
        return i;
      }
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

/**
 * Find the pipe-delimited column index for a header matching `pattern` by
 * scanning backward from `rowIdx` to find the nearest header row.
 * Returns the raw split('|') index (includes leading empty element), or -1.
 */
function _findColumnIndex(lines, rowIdx, pattern) {
  // Scan backward from rowIdx to find the header row
  for (let h = rowIdx - 1; h >= 0; h--) {
    if (!lines[h].includes('|')) continue;
    // Skip separator rows
    if (/^\s*\|[\s-:|]+\|\s*$/.test(lines[h])) continue;
    // Check if this looks like a header (contains recognizable column names)
    if (/phase/i.test(lines[h]) || /status/i.test(lines[h]) || /plans/i.test(lines[h])) {
      const parts = lines[h].split('|');
      for (let c = 0; c < parts.length; c++) {
        if (pattern.test(parts[c].trim())) return c;
      }
    }
  }
  return -1;
}

// --- Mutation commands ---

/**
 * Update the Status column for a phase in ROADMAP.md's Phase Overview table.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} newStatus - New status value
 * @param {string} [planningDir] - Path to .planning directory
 */
async function roadmapUpdateStatus(phaseNum, newStatus, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  let oldStatus = null;

  const result = await lockedFileUpdate(roadmapPath, (content) => {
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const rowIdx = findRoadmapRow(lines, phaseNum);
    if (rowIdx === -1) {
      return content; // No matching row found
    }
    // Dynamic column detection: find Status column from nearest header row
    const statusColIdx = _findColumnIndex(lines, rowIdx, /status/i);
    const parts = lines[rowIdx].split('|');
    if (statusColIdx !== -1 && statusColIdx < parts.length) {
      oldStatus = parts[statusColIdx] ? parts[statusColIdx].trim() : 'unknown';
      parts[statusColIdx] = ` ${newStatus} `;
      lines[rowIdx] = parts.join('|');
    } else {
      // Fallback: assume 3-col table (v9+ format), Status at raw index 3
      oldStatus = parts[3] ? parts[3].trim() : 'unknown';
      lines[rowIdx] = updateTableRow(lines[rowIdx], 2, newStatus);
    }
    return lines.join(lineEnding);
  });

  if (!oldStatus) {
    return { success: false, error: `Phase ${phaseNum} not found in ROADMAP.md table` };
  }

  // Advisory transition validation -- warn on suspicious transitions but don't block
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
async function roadmapUpdatePlans(phaseNum, complete, total, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  let oldPlans = null;
  const newPlans = `${complete}/${total}`;

  const result = await lockedFileUpdate(roadmapPath, (content) => {
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const rowIdx = findRoadmapRow(lines, phaseNum);
    if (rowIdx === -1) {
      return content;
    }
    // Dynamic column detection: find Plans Complete column from nearest header row
    const plansColIdx = _findColumnIndex(lines, rowIdx, /plans?\s*complete/i);
    const parts = lines[rowIdx].split('|');
    if (plansColIdx !== -1 && plansColIdx < parts.length) {
      oldPlans = parts[plansColIdx] ? parts[plansColIdx].trim() : 'unknown';
      parts[plansColIdx] = ` ${newPlans} `;
      lines[rowIdx] = parts.join('|');
    } else {
      // Fallback: assume 3-col table (v9+ format), Plans Complete at raw index 2
      oldPlans = parts[2] ? parts[2].trim() : 'unknown';
      lines[rowIdx] = updateTableRow(lines[rowIdx], 1, newPlans);
    }
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

/**
 * Update plan progress for a specific phase in ROADMAP.md.
 * GSD-unique: updates progress table row, plan count in phase section,
 * and checkbox completion status.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 */
async function roadmapUpdatePlanProgress(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  // Find the phase directory to count plans and summaries
  const phasesDir = path.join(dir, 'phases');
  if (!fs.existsSync(phasesDir)) {
    return { success: false, error: 'No phases directory found' };
  }

  const paddedPhase = String(phaseNum).padStart(2, '0');
  let phaseDir = null;
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(paddedPhase + '-')) {
        phaseDir = path.join(phasesDir, entry.name);
        break;
      }
    }
  } catch (_e) { /* intentionally silent: non-fatal */ }

  if (!phaseDir) {
    return { success: false, error: `Phase ${phaseNum} directory not found` };
  }

  const planFiles = findFiles(phaseDir, /PLAN.*\.md$/i);
  const summaryFiles = findFiles(phaseDir, /SUMMARY.*\.md$/i);
  const planCount = planFiles.length;
  const summaryCount = summaryFiles.length;

  if (planCount === 0) {
    return { success: false, error: 'No plans found', plan_count: 0, summary_count: 0 };
  }

  const isComplete = summaryCount >= planCount;
  const status = isComplete ? 'Complete' : summaryCount > 0 ? 'In Progress' : 'Planned';
  const today = new Date().toISOString().slice(0, 10);

  const { escapeRegex } = require('./core');
  const phaseEscaped = escapeRegex(String(phaseNum));

  const result = await lockedFileUpdate(roadmapPath, (content) => {
    let updated = content;

    // Progress table row: update Plans column (summaries/plans) and Status column
    const tablePattern = new RegExp(
      `(\\|\\s*${phaseEscaped}\\.?\\s[^|]*\\|)[^|]*(\\|)\\s*[^|]*(\\|)\\s*[^|]*(\\|)`,
      'i'
    );
    const dateField = isComplete ? ` ${today} ` : '  ';
    updated = updated.replace(
      tablePattern,
      `$1 ${summaryCount}/${planCount} $2 ${status.padEnd(11)}$3${dateField}$4`
    );

    // Update plan count in phase detail section
    const planCountPattern = new RegExp(
      `(#{2,4}\\s*Phase\\s+${phaseEscaped}[\\s\\S]*?\\*\\*Plans:\\*\\*\\s*)[^\\n]+`,
      'i'
    );
    const planCountText = isComplete
      ? `${summaryCount}/${planCount} plans complete`
      : `${summaryCount}/${planCount} plans executed`;
    updated = updated.replace(planCountPattern, `$1${planCountText}`);

    // If complete: check checkbox
    if (isComplete) {
      const checkboxPattern = new RegExp(
        `(-\\s*\\[)[ ](\\]\\s*.*Phase\\s+${phaseEscaped}[:\\s][^\\n]*)`,
        'i'
      );
      updated = updated.replace(checkboxPattern, `$1x$2 (completed ${today})`);
    }

    return updated;
  });

  if (result.success) {
    return { success: true, phase: phaseNum, plan_count: planCount, summary_count: summaryCount, status, complete: isComplete };
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

  // snapshot pattern: single read, parse from memory -- no re-reads during analysis or renumbering
  const content = fs.readFileSync(roadmapPath, 'utf8');
  // Strip <details>/<summary> tags so collapsed milestones are parsed correctly
  const stripped = content.replace(/<\/?details>/gi, '').replace(/<\/?summary>/gi, '');
  const lines = stripped.split(/\r?\n/);

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
    } catch (_e) { /* intentionally silent: non-fatal */ }
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

  // Strip <details>/<summary> HTML tags from lines so collapsed milestones are parsed
  const cleanLines = lines.map(l => l.replace(/<\/?details>/gi, '').replace(/<\/?summary>/gi, ''));

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];

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

      // Look ahead for **Goal:**, **Depends on:**, **Requirements:**, **Success Criteria:**
      let goal = '';
      let depends_on = [];
      let requirements = '';
      let success_criteria = '';
      for (let j = i + 1; j < Math.min(i + 20, cleanLines.length); j++) {
        const ahead = cleanLines[j];
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

        const reqMatch = ahead.match(/\*\*Requirements:\*\*\s*(.*)/i);
        if (reqMatch) {
          requirements = reqMatch[1].trim();
        }

        const critMatch = ahead.match(/\*\*Success Criteria:\*\*\s*(.*)/i);
        if (critMatch) {
          success_criteria = critMatch[1].trim();
        }
      }

      const entry = {
        number: phaseNum,
        name: phaseName,
        goal,
        depends_on,
        requirements,
        success_criteria,
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
  let progressColIdx = { phase: 0, plans: 1 };

  // Strip <details>/<summary> tags from lines for parsing
  const cleanLines = lines.map(l => l.replace(/<\/?details>/gi, '').replace(/<\/?summary>/gi, ''));

  for (const line of cleanLines) {
    if (/^##\s+Progress/i.test(line)) {
      inProgressSection = true;
      continue;
    }
    if (inProgressSection && /^##\s/.test(line) && !/^##\s+Progress/i.test(line)) {
      inProgressSection = false;
      continue;
    }

    if (inProgressSection && line.includes('|')) {
      const cols = line.split('|').map(c => c.trim()).filter(Boolean);

      // Detect header row and extract column positions
      if (/Plans?\s*Complete/i.test(line)) {
        const lowerCols = cols.map(c => c.toLowerCase());
        const pIdx = lowerCols.findIndex(c => /phase/i.test(c));
        const plIdx = lowerCols.findIndex(c => /plans?\s*complete/i.test(c));
        if (pIdx !== -1) progressColIdx.phase = pIdx;
        if (plIdx !== -1) progressColIdx.plans = plIdx;
        continue;
      }

      // Skip separator rows
      if (/^[\s-:|]+$/.test(cols.join(''))) continue;

      if (cols.length >= 2) {
        const phaseCol = cols[progressColIdx.phase] || cols[0];
        const numMatch = phaseCol.match(/^(\d+)/);
        if (numMatch) {
          const phaseNum = parseInt(numMatch[1], 10);
          const phase = phaseMap.get(phaseNum);
          if (phase) {
            const plansCol = progressColIdx.plans < cols.length ? cols[progressColIdx.plans] : cols[1];
            const progressMatch = plansCol.match(/(\d+)\s*\/\s*(\d+)/);
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
  } catch (_e) { /* intentionally silent: non-fatal */ }

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
    } catch (_e) { /* intentionally silent: non-fatal */ }
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
async function roadmapAppendPhase(planningDir, phaseNum, name, goal, dependsOn) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  return await lockedFileUpdate(roadmapPath, (content) => {
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
    // Detect if existing table has Milestone column
    let hasMilestoneCol = false;
    let hasCompletedCol = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('|') && /Plans?\s*Complete/i.test(lines[i])) {
        hasMilestoneCol = /milestone/i.test(lines[i]);
        hasCompletedCol = /completed/i.test(lines[i]);
        break;
      }
    }
    let progressRowLine = `| ${phaseNum}. ${name} |`;
    if (hasMilestoneCol) progressRowLine += '  |';
    progressRowLine += ' 0/0 | Pending |';
    if (hasCompletedCol) progressRowLine += '  |';

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
async function roadmapRemovePhase(planningDir, phaseNum) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  return await lockedFileUpdate(roadmapPath, (content) => {
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
async function roadmapRenumberPhases(planningDir, startNum, delta) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  return await lockedFileUpdate(roadmapPath, (content) => {
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
async function roadmapInsertPhase(planningDir, position, name, goal, dependsOn) {
  const roadmapPath = path.join(planningDir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return { success: false, error: 'ROADMAP.md not found' };
  }

  return await lockedFileUpdate(roadmapPath, (content) => {
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

    // Insert progress table row at the right position — detect Milestone/Completed columns
    let _hasMilestoneCol = false;
    let _hasCompletedCol = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('|') && /Plans?\s*Complete/i.test(lines[i])) {
        _hasMilestoneCol = /milestone/i.test(lines[i]);
        _hasCompletedCol = /completed/i.test(lines[i]);
        break;
      }
    }
    let progressRow = `| ${position}. ${name} |`;
    if (_hasMilestoneCol) progressRow += '  |';
    progressRow += ' 0/0 | Pending |';
    if (_hasCompletedCol) progressRow += '  |';
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

/**
 * Get a single phase entry from ROADMAP.md by number.
 *
 * @param {string} phaseNum - Phase number
 * @param {string} [planningDir] - Path to .planning directory
 * @returns {object|null} Phase entry or null
 */
function roadmapGetPhase(phaseNum, planningDir) {
  const dir = planningDir || path.join(process.env.PBR_PROJECT_ROOT || process.cwd(), '.planning');
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    return null;
  }

  const content = fs.readFileSync(roadmapPath, 'utf8');
  const parsed = parseRoadmapMd(content);
  const paddedPhase = String(phaseNum).padStart(2, '0');
  return parsed.phases.find(p => p.number === paddedPhase) || null;
}

module.exports = {
  parseRoadmapMd,
  findRoadmapRow,
  updateTableRow,
  roadmapUpdateStatus,
  roadmapUpdatePlans,
  roadmapUpdatePlanProgress,
  roadmapAnalyze,
  roadmapAppendPhase,
  roadmapRemovePhase,
  roadmapRenumberPhases,
  roadmapInsertPhase,
  roadmapGetPhase
};
