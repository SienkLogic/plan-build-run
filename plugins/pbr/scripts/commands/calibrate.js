'use strict';

/**
 * commands/calibrate.js - Verifier calibration command handler.
 *
 * Scans milestone VERIFICATION.md files to analyze verification patterns,
 * gap distributions, and trust scores. Writes advisory findings to
 * .planning/intel/verifier-calibration.md.
 *
 * Usage: pbr-tools.js calibrate verifier
 */

const fs = require('fs');
const path = require('path');
const { extractFrontmatter } = require('../lib/frontmatter');
const { loadScores } = require('../trust-tracker');

/**
 * Recursively find VERIFICATION.md files under a directory.
 * @param {string} dir - Directory to search
 * @returns {string[]} Array of absolute paths
 */
function findVerificationFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch (_e) { return; }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'VERIFICATION.md') {
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Parse a VERIFICATION.md file into a structured record.
 * @param {string} filePath - Path to VERIFICATION.md
 * @returns {object} Parsed verification record
 */
function parseVerification(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fm = extractFrontmatter(content);

  const total = parseInt(fm.must_haves_checked || fm.must_haves_total || '0', 10);
  const passed = parseInt(fm.must_haves_passed || '0', 10);
  const failed = parseInt(fm.must_haves_failed || '0', 10);
  const status = (fm.status || 'unknown').toLowerCase();

  // Extract gaps from body - look for "## Gaps" section and "### Gap N:" headers
  const gaps = [];
  const gapSectionMatch = content.match(/## Gaps\s*\n([\s\S]*?)(?=\n## [^#]|\n---)/);
  if (gapSectionMatch) {
    const gapSection = gapSectionMatch[1];
    const gapHeaders = gapSection.match(/### Gap \d+:?\s*(.+)/g) || [];
    for (const header of gapHeaders) {
      const descMatch = header.match(/### Gap \d+:?\s*(.+)/);
      if (descMatch) {
        gaps.push(descMatch[1].trim());
      }
    }
  }

  return {
    path: filePath,
    status,
    total,
    passed,
    failed,
    gapCount: gaps.length || failed,
    gaps
  };
}

/**
 * Categorize a gap description into a standard category.
 * @param {string} desc - Gap description text
 * @returns {string} Category name
 */
function categorizeGap(desc) {
  const lower = desc.toLowerCase();
  if (lower.includes('missing') && (lower.includes('artifact') || lower.includes('file'))) {
    return 'missing artifact';
  }
  if (lower.includes('stub') || lower.includes('incomplete') || lower.includes('placeholder')) {
    return 'stub/incomplete';
  }
  if (lower.includes('wir') || lower.includes('reference') || lower.includes('link') || lower.includes('import')) {
    return 'missing wiring';
  }
  if (lower.includes('fail') || lower.includes('error') || lower.includes('broken')) {
    return 'failed verification';
  }
  if (lower.includes('test')) {
    return 'missing tests';
  }
  return 'other';
}

/**
 * Run verifier calibration analysis on milestone VERIFICATION.md corpus.
 * @param {string} planningDir - Path to .planning directory
 * @param {string} _cwd - Project working directory (unused)
 * @returns {object} Calibration findings
 */
function calibrateVerifier(planningDir, _cwd) {
  const milestonesDir = path.join(planningDir, 'milestones');
  const verificationFiles = findVerificationFiles(milestonesDir);

  if (verificationFiles.length === 0) {
    return {
      success: true,
      corpus_size: 0,
      pass_rate: 0,
      recommendations_count: 0,
      recommendations: [],
      output_path: null
    };
  }

  // Parse all VERIFICATION.md files
  const records = [];
  for (const f of verificationFiles) {
    try {
      records.push(parseVerification(f));
    } catch (_e) {
      // Skip unparseable files
    }
  }

  const corpusSize = records.length;
  const passedCount = records.filter(r => r.status === 'passed' || r.status === 'pass').length;
  const passRate = corpusSize > 0 ? Math.round((passedCount / corpusSize) * 100) / 100 : 0;

  // Gap category distribution
  const gapCategories = {};
  const allGaps = [];
  for (const r of records) {
    for (const gap of r.gaps) {
      allGaps.push(gap);
      const cat = categorizeGap(gap);
      gapCategories[cat] = (gapCategories[cat] || 0) + 1;
    }
  }

  // Common patterns: group by keywords
  const patternCounts = {};
  for (const gap of allGaps) {
    const words = gap.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    const key = words.slice(0, 4).join(' ');
    if (key) {
      patternCounts[key] = (patternCounts[key] || 0) + 1;
    }
  }
  const commonPatterns = Object.entries(patternCounts)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pattern, count]) => ({ pattern, count }));

  // Load trust scores
  const trustScores = loadScores(planningDir);
  const verifierTrust = trustScores.verifier || {};

  // Generate recommendations
  const recommendations = [];

  if (passRate < 0.8) {
    recommendations.push('Pass rate is below 80% -- consider adding more few-shot examples to verifier prompt');
  }

  const sortedCategories = Object.entries(gapCategories).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedCategories) {
    if (count >= 2) {
      recommendations.push('Verifier consistently finds "' + cat + '" gaps (' + count + ' occurrences) -- consider adding few-shot example for this pattern');
    }
  }

  for (const cp of commonPatterns) {
    if (cp.count >= 3) {
      recommendations.push('Recurring gap pattern: "' + cp.pattern + '" (' + cp.count + ' times) -- may indicate systematic executor weakness');
    }
  }

  if (Object.keys(verifierTrust).length > 0) {
    for (const [category, data] of Object.entries(verifierTrust)) {
      if (data.rate !== undefined && data.rate < 0.7) {
        recommendations.push('Trust score for verifier/' + category + ' is ' + (data.rate * 100).toFixed(0) + '% -- below 70% threshold');
      }
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('No actionable patterns detected -- verifier performance appears healthy');
  }

  // Build findings object
  const findings = {
    corpus_size: corpusSize,
    pass_rate: passRate,
    gap_categories: gapCategories,
    common_patterns: commonPatterns,
    trust_score: verifierTrust,
    recommendations,
    generated: new Date().toISOString()
  };

  // Write output file
  const intelDir = path.join(planningDir, 'intel');
  fs.mkdirSync(intelDir, { recursive: true });
  const outputPath = path.join(intelDir, 'verifier-calibration.md');

  const gapTable = sortedCategories.length > 0
    ? sortedCategories.map(function(pair) { return '| ' + pair[0] + ' | ' + pair[1] + ' |'; }).join('\n')
    : '| (none) | 0 |';

  const patternList = commonPatterns.length > 0
    ? commonPatterns.map(function(p) { return '- "' + p.pattern + '" (' + p.count + ' occurrences)'; }).join('\n')
    : '- No recurring patterns detected';

  const recList = recommendations.map(function(r) { return '- ' + r; }).join('\n');

  const trustSection = Object.keys(verifierTrust).length > 0
    ? Object.entries(verifierTrust).map(function(pair) {
      var cat2 = pair[0], data2 = pair[1];
      return '- **' + cat2 + '**: ' + (data2.pass || 0) + ' pass / ' + (data2.fail || 0) + ' fail (rate: ' + (data2.rate !== undefined ? (data2.rate * 100).toFixed(0) + '%' : 'N/A') + ')';
    }).join('\n')
    : '- No trust data available for verifier agent';

  var lines = [
    '---',
    'generated: "' + findings.generated + '"',
    'corpus_size: ' + corpusSize,
    'pass_rate: ' + passRate,
    '---',
    '',
    '# Verifier Calibration Report',
    '',
    '## Corpus Summary',
    '',
    '- **Total verifications analyzed:** ' + corpusSize,
    '- **Pass rate:** ' + (passRate * 100).toFixed(0) + '%',
    '- **Total gaps found:** ' + allGaps.length,
    '',
    '## Gap Category Distribution',
    '',
    '| Category | Count |',
    '|----------|-------|',
    gapTable,
    '',
    '## Common Patterns',
    '',
    patternList,
    '',
    '## Trust Scores',
    '',
    trustSection,
    '',
    '## Recommendations',
    '',
    recList,
    ''
  ];

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');

  return {
    success: true,
    corpus_size: corpusSize,
    pass_rate: passRate,
    recommendations_count: recommendations.length,
    output_path: outputPath
  };
}

/**
 * Handle calibrate CLI command.
 * @param {string[]} args - CLI args (args[0] is 'calibrate', args[1] is target)
 * @param {object} ctx - { planningDir, cwd, output(), error() }
 */
function handleCalibrate(args, ctx) {
  var target = args[1];

  if (!target) {
    ctx.error('Usage: calibrate <target>\nAvailable targets: verifier');
    return;
  }

  if (target !== 'verifier') {
    ctx.error('Unknown calibration target: "' + target + '". Available targets: verifier');
    return;
  }

  var result = calibrateVerifier(ctx.planningDir, ctx.cwd);
  ctx.output(result);
}

module.exports = { handleCalibrate, calibrateVerifier, findVerificationFiles, parseVerification, categorizeGap };
