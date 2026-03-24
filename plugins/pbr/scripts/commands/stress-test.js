'use strict';

/**
 * commands/stress-test.js - Harness stress-test command handler.
 *
 * Temporarily disables a hook/gate via config overlay, runs dry-run
 * verification comparison, updates assumption registry validation dates,
 * and writes a report to .planning/intel/.
 *
 * Usage: pbr-tools.js stress-test <component>
 *
 * Config-based disablement (not hooks.json modification).
 * No full A/B build replay (dry-run comparison only).
 * Advisory output (report + assumption update).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { lockedFileUpdate } = require('../lib/core');

const VALID_COMPONENTS = [
  'validate-commit',
  'architecture-guard',
  'check-plan-format',
  'check-subagent-output',
  'check-state-sync'
];

/**
 * Find the most recent PLAN.md in the current phase directory.
 * @param {string} planningDir - Path to .planning directory
 * @returns {string|null} Absolute path to most recent PLAN.md or null
 */
function findRecentPlan(planningDir) {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) return null;

  let entries;
  try {
    entries = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^\d+-/.test(e.name))
      .sort((a, b) => {
        const numA = parseInt(a.name.match(/^(\d+)/)[1], 10);
        const numB = parseInt(b.name.match(/^(\d+)/)[1], 10);
        return numB - numA;
      });
  } catch (_e) { return null; }

  for (const entry of entries) {
    const dir = path.join(phasesDir, entry.name);
    try {
      const files = fs.readdirSync(dir).filter(f => /^PLAN.*\.md$/i.test(f));
      if (files.length > 0) {
        files.sort();
        return path.join(dir, files[files.length - 1]);
      }
    } catch (_e) { /* skip */ }
  }

  return null;
}

/**
 * Find the most recent completed phase directory (has SUMMARY + VERIFICATION).
 * @param {string} planningDir - Path to .planning directory
 * @returns {string|null} Absolute path to completed phase dir or null
 */
function findCompletedPhase(planningDir) {
  const phasesDir = path.join(planningDir, 'phases');
  if (!fs.existsSync(phasesDir)) return null;

  let entries;
  try {
    entries = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && /^\d+-/.test(e.name))
      .sort((a, b) => {
        const numA = parseInt(a.name.match(/^(\d+)/)[1], 10);
        const numB = parseInt(b.name.match(/^(\d+)/)[1], 10);
        return numB - numA;
      });
  } catch (_e) { return null; }

  for (const entry of entries) {
    const dir = path.join(phasesDir, entry.name);
    try {
      const hasVerification = fs.existsSync(path.join(dir, 'VERIFICATION.md'));
      const hasSummary = fs.readdirSync(dir).some(f => /SUMMARY.*\.md$/i.test(f));
      if (hasVerification && hasSummary) return dir;
    } catch (_e) { /* skip */ }
  }

  return null;
}

/**
 * Run verification commands and capture output.
 * @param {string} planningDir - Path to .planning directory
 * @param {string} cwd - Project working directory
 * @returns {object} Verification results
 */
function runDryVerification(planningDir, cwd) {
  const results = { plan_structure: null, phase_completeness: null };
  const pbrToolsPath = path.join(__dirname, '..', 'pbr-tools.js');

  const planPath = findRecentPlan(planningDir);
  if (planPath) {
    try {
      const out = execSync(
        'node "' + pbrToolsPath + '" verify plan-structure "' + planPath + '"',
        { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }
      );
      results.plan_structure = { success: true, output: out.trim() };
    } catch (e) {
      results.plan_structure = { success: false, output: (e.stdout || e.message).trim() };
    }
  }

  const phaseDir = findCompletedPhase(planningDir);
  if (phaseDir) {
    try {
      const out = execSync(
        'node "' + pbrToolsPath + '" verify phase-completeness "' + phaseDir + '"',
        { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }
      );
      results.phase_completeness = { success: true, output: out.trim() };
    } catch (e) {
      results.phase_completeness = { success: false, output: (e.stdout || e.message).trim() };
    }
  }

  return results;
}

/**
 * Update the Last Validated column in assumptions.md for a given component.
 * @param {string} planningDir - Path to .planning directory
 * @param {string} component - Component name to update
 * @returns {boolean} true if updated
 */
function updateAssumptionDate(planningDir, component) {
  const cwd = process.env.PBR_PROJECT_ROOT || process.cwd();
  const possiblePaths = [
    path.join(path.dirname(planningDir), 'plugins', 'pbr', 'references', 'assumptions.md'),
    path.join(cwd, 'plugins', 'pbr', 'references', 'assumptions.md')
  ];

  let assumptionsPath = null;
  for (const p of possiblePaths) {
    const resolved = path.resolve(p);
    if (fs.existsSync(resolved)) {
      assumptionsPath = resolved;
      break;
    }
  }

  if (!assumptionsPath) return false;

  const today = new Date().toISOString().slice(0, 10);

  try {
    const content = fs.readFileSync(assumptionsPath, 'utf8');
    const componentPattern = component.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      '(\\|\\s*' + componentPattern + '(?:\\.js)?\\s*\\|[^|]*\\|[^|]*\\|[^|]*\\|[^|]*\\|)\\s*[^|]*\\s*(\\|)',
      'gm'
    );

    const updated = content.replace(regex, '$1 ' + today + ' $2');
    if (updated !== content) {
      fs.writeFileSync(assumptionsPath, updated, 'utf8');
      return true;
    }
  } catch (_e) {
    // Best effort
  }

  return false;
}

/**
 * Determine stress test result classification.
 * @param {object} verifyResults - Verification results object
 * @returns {string} 'load-bearing' | 'inconclusive' | 'redundant'
 */
function classifyResult(verifyResults) {
  const planCheck = verifyResults.plan_structure;
  const phaseCheck = verifyResults.phase_completeness;

  if ((planCheck && !planCheck.success) || (phaseCheck && !phaseCheck.success)) {
    return 'load-bearing';
  }

  if (!planCheck && !phaseCheck) {
    return 'inconclusive';
  }

  return 'redundant';
}

/**
 * Run a stress test for a specific harness component.
 *
 * @param {string} component - Component name from VALID_COMPONENTS
 * @param {string} planningDir - Path to .planning directory
 * @param {string} cwd - Project working directory
 * @returns {object} Stress test results
 */
async function runStressTest(component, planningDir, cwd) {
  const configPath = path.join(planningDir, 'config.json');

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return { success: false, error: 'Could not read config.json: ' + e.message };
  }

  if (config.stress_test && config.stress_test.active) {
    return { success: false, error: 'stress test already in progress' };
  }

  // Create config overlay
  try {
    await lockedFileUpdate(configPath, function(content) {
      const cfg = JSON.parse(content);
      cfg.stress_test = {
        disabled_hooks: [component],
        active: true,
        started: new Date().toISOString()
      };
      return JSON.stringify(cfg, null, 2);
    });
  } catch (e) {
    return { success: false, error: 'Failed to create config overlay: ' + e.message };
  }

  // Run dry-run verification with hook disabled
  let verifyResults;
  try {
    verifyResults = runDryVerification(planningDir, cwd);
  } catch (_e) {
    verifyResults = { plan_structure: null, phase_completeness: null };
  }

  // Remove config overlay (restore original)
  try {
    await lockedFileUpdate(configPath, function(content) {
      const cfg = JSON.parse(content);
      delete cfg.stress_test;
      return JSON.stringify(cfg, null, 2);
    });
  } catch (_e) {
    try {
      const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      delete rawConfig.stress_test;
      fs.writeFileSync(configPath, JSON.stringify(rawConfig, null, 2), 'utf8');
    } catch (_e2) { /* leave for manual cleanup */ }
  }

  const result = classifyResult(verifyResults);
  const assumptionUpdated = updateAssumptionDate(planningDir, component);

  // Write report
  const intelDir = path.join(planningDir, 'intel');
  fs.mkdirSync(intelDir, { recursive: true });
  const reportPath = path.join(intelDir, 'stress-test-' + component + '.md');
  const today = new Date().toISOString().slice(0, 10);

  const reportLines = [
    '---',
    'component: "' + component + '"',
    'date: "' + today + '"',
    'result: "' + result + '"',
    '---',
    '',
    '# Stress Test: ' + component,
    '',
    '## Component Description',
    '',
    'The `' + component + '` hook was temporarily disabled via config overlay to assess its impact.',
    '',
    '## Verification Comparison',
    '',
    '- **Plan structure check**: ' + (verifyResults.plan_structure ? (verifyResults.plan_structure.success ? 'PASSED' : 'FAILED') : 'N/A (no recent plan found)'),
    '- **Phase completeness check**: ' + (verifyResults.phase_completeness ? (verifyResults.phase_completeness.success ? 'PASSED' : 'FAILED') : 'N/A (no completed phase found)'),
    '',
    '## Result',
    '',
    'Classification: **' + result + '**',
    '',
    result === 'load-bearing'
      ? 'This component catches issues that verification alone does not cover. It is load-bearing and should not be removed.'
      : result === 'redundant'
        ? 'Verification passed without this hook active. The hook may be redundant for current project state, but may still catch issues in other scenarios.'
        : 'Could not determine the impact of this component. More data points needed.',
    '',
    '## Recommendation',
    '',
    result === 'load-bearing'
      ? 'Keep this component enabled. Consider adding more test coverage for the failure modes it prevents.'
      : result === 'redundant'
        ? 'Monitor this component. If consistently redundant across multiple stress tests, consider making it optional.'
        : 'Re-run this stress test when more phase data is available.',
    ''
  ];

  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');

  return {
    success: true,
    component: component,
    result: result,
    report_path: reportPath,
    assumption_updated: assumptionUpdated
  };
}

/**
 * Handle stress-test CLI command.
 * @param {string[]} args - CLI args (args[0] is 'stress-test', args[1] is component)
 * @param {object} ctx - { planningDir, cwd, output(), error() }
 */
async function handleStressTest(args, ctx) {
  const component = args[1];

  if (!component) {
    ctx.error('Usage: stress-test <component>\nValid components: ' + VALID_COMPONENTS.join(', '));
    return;
  }

  if (!VALID_COMPONENTS.includes(component)) {
    ctx.error('Invalid component: "' + component + '".\nValid components: ' + VALID_COMPONENTS.join(', '));
    return;
  }

  const result = await runStressTest(component, ctx.planningDir, ctx.cwd);
  ctx.output(result);
}

module.exports = {
  handleStressTest,
  runStressTest,
  findRecentPlan,
  findCompletedPhase,
  updateAssumptionDate,
  classifyResult,
  VALID_COMPONENTS
};
