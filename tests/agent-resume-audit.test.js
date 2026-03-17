/**
 * Audit test: ensures no deprecated Agent tool `resume` parameter
 * exists in the PBR codebase.
 *
 * The Agent tool's `resume` parameter was deprecated by Claude Code.
 * PBR uses a fresh-spawn pattern via Task() with subagent_type instead.
 * This test guards against re-introducing the deprecated pattern.
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/**
 * Run grep for "resume:" in the given directory with the given include pattern.
 * Returns an array of matching lines, or empty array if no matches.
 */
function grepResume(dir, includePattern) {
  try {
    const result = execSync(
      `grep -rn "resume:" "${dir}" --include="${includePattern}"`,
      { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return result.trim().split('\n').filter(Boolean);
  } catch (err) {
    // grep exit code 1 = no matches (success for us)
    if (err.status === 1) return [];
    throw err;
  }
}

/**
 * Filter out known non-deprecated uses of the word "resume:".
 * These are legitimate references that are NOT the Agent tool's resume parameter.
 */
function filterLegitimateUses(lines) {
  return lines.filter(line => {
    // The resume skill directory itself (the /pbr:resume command)
    if (line.includes(path.join('resume', '').replace(/\\/g, '/'))) return false;
    if (line.includes(path.join('resume', '').replace(/\//g, '\\'))) return false;
    // Normalize for cross-platform matching
    if (/[/\\]resume[/\\]/.test(line)) return false;

    // resume-work or resume-signal are PBR state tokens, not Agent params
    if (/resume-work/i.test(line)) return false;
    if (/resume-signal/i.test(line)) return false;

    // /pbr:resume is the resume skill command reference
    if (/\/pbr:resume/.test(line)) return false;

    // resume_at is a continuation state field, not the Agent param
    if (/resume_at/.test(line)) return false;

    // process.stdin.resume is Node.js stream API
    if (/process\.stdin\.resume/.test(line)) return false;

    // "resume" in prose/documentation (not a YAML key being set)
    // Lines that mention "resume" as part of a sentence, not as a parameter
    if (/deprecated.*resume|resume.*deprecated/i.test(line)) return false;

    return true;
  });
}

describe('Agent resume parameter audit', () => {
  test('no deprecated resume parameter in skill files', () => {
    const skillDir = path.join('plugins', 'pbr', 'skills');
    const mdMatches = grepResume(skillDir, '*.md');
    const tmplMatches = grepResume(skillDir, '*.tmpl');
    const allMatches = [...mdMatches, ...tmplMatches];
    const filtered = filterLegitimateUses(allMatches);

    if (filtered.length > 0) {
      console.error('Deprecated resume parameter found in skill files:');
      filtered.forEach(l => console.error('  ', l));
    }
    expect(filtered).toEqual([]);
  });

  test('no deprecated resume parameter in agent files', () => {
    const agentDir = path.join('plugins', 'pbr', 'agents');
    const matches = grepResume(agentDir, '*.md');
    const filtered = filterLegitimateUses(matches);

    if (filtered.length > 0) {
      console.error('Deprecated resume parameter found in agent files:');
      filtered.forEach(l => console.error('  ', l));
    }
    expect(filtered).toEqual([]);
  });

  test('no deprecated resume parameter in hook scripts', () => {
    const scriptsDir = path.join('plugins', 'pbr', 'scripts');
    const matches = grepResume(scriptsDir, '*.js');
    const filtered = filterLegitimateUses(matches);

    if (filtered.length > 0) {
      console.error('Deprecated resume parameter found in hook scripts:');
      filtered.forEach(l => console.error('  ', l));
    }
    expect(filtered).toEqual([]);
  });
});
