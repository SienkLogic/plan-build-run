/**
 * Phase 20: Integration & Verification tests
 *
 * Validates INTG-01 through INTG-06 requirements:
 * - INTG-01: install.js has no 'gsd' directory path references
 * - INTG-02: install.js supports multi-runtime installation flags
 * - INTG-03: package.json has correct files array and scripts
 * - INTG-04: install.js is syntactically valid and exports work in test mode
 * - INTG-06: CLAUDE.md exists with correct PBR architecture documentation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const INSTALL_JS = path.join(ROOT, 'bin', 'install.js');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');

// ---------------------------------------------------------------------------
// INTG-01: install.js has zero 'gsd' directory path references
// ---------------------------------------------------------------------------
describe('INTG-01: install.js PBR branding (no gsd path refs)', () => {
  let installContent;

  beforeAll(() => {
    installContent = fs.readFileSync(INSTALL_JS, 'utf8');
  });

  test('install.js contains no single-quoted gsd path references', () => {
    // Match 'gsd' as a string literal used as a directory component
    const matches = installContent.match(/'gsd'/g);
    expect(matches).toBeNull();
  });

  test('install.js references commands/pbr directory', () => {
    expect(installContent).toContain("'pbr'");
    // Verify the path join pattern uses pbr
    expect(installContent).toMatch(/commands['"],\s*['"]pbr['"]/);
  });

  test('install.js has PBR branding in banner text', () => {
    expect(installContent).toContain('Plan-Build-Run');
  });
});

// ---------------------------------------------------------------------------
// INTG-02: Multi-runtime installation support
// ---------------------------------------------------------------------------
describe('INTG-02: install.js supports multi-runtime flags', () => {
  let installContent;

  beforeAll(() => {
    installContent = fs.readFileSync(INSTALL_JS, 'utf8');
  });

  test('install.js supports --claude flag', () => {
    expect(installContent).toContain('--claude');
  });

  test('install.js supports --opencode flag', () => {
    expect(installContent).toContain('--opencode');
  });

  test('install.js supports --gemini flag', () => {
    expect(installContent).toContain('--gemini');
  });

  test('install.js supports --codex flag', () => {
    expect(installContent).toContain('--codex');
  });

  test('install.js supports --all flag for all runtimes', () => {
    expect(installContent).toContain('--all');
  });
});

// ---------------------------------------------------------------------------
// INTG-03: package.json has correct files, scripts, and metadata
// ---------------------------------------------------------------------------
describe('INTG-03: package.json publishable structure', () => {
  let pkg;

  beforeAll(() => {
    pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  });

  test('package.json files array includes plugins/', () => {
    expect(pkg.files).toContain('plugins/');
  });

  test('package.json files array includes CLAUDE.md', () => {
    expect(pkg.files).toContain('CLAUDE.md');
  });

  test('package.json files array includes core directories', () => {
    expect(pkg.files).toContain('bin');
    expect(pkg.files).toContain('commands');
    expect(pkg.files).toContain('plan-build-run');
    expect(pkg.files).toContain('agents');
  });

  test('package.json has sync:generate script', () => {
    expect(pkg.scripts['sync:generate']).toBeDefined();
    expect(pkg.scripts['sync:generate']).toContain('generate-derivatives');
  });

  test('package.json has sync:verify script', () => {
    expect(pkg.scripts['sync:verify']).toBeDefined();
    expect(pkg.scripts['sync:verify']).toContain('--verify');
  });

  test('package.json has lint script', () => {
    expect(pkg.scripts.lint).toBeDefined();
  });

  test('package.json has test script', () => {
    expect(pkg.scripts.test).toBeDefined();
    expect(pkg.scripts.test).toContain('jest');
  });

  test('package.json name is PBR branded', () => {
    expect(pkg.name).toContain('plan-build-run');
  });
});

// ---------------------------------------------------------------------------
// INTG-04: install.js syntax valid and exports work in test mode
// ---------------------------------------------------------------------------
describe('INTG-04: install.js integrity and test-mode exports', () => {
  test('install.js passes syntax check', () => {
    expect(() => {
      execSync(`node -c "${INSTALL_JS}"`, { encoding: 'utf8' });
    }).not.toThrow();
  });

  test('install.js loads and exports functions in PBR_TEST_MODE', () => {
    // Module loads without throwing and exports at least one function
    expect(() => {
      execSync(
        `node -e "process.env.PBR_TEST_MODE='1'; const m = require('./bin/install.js'); if (Object.keys(m).length < 1) process.exit(1);"`,
        { cwd: ROOT, encoding: 'utf8' }
      );
    }).not.toThrow();
  });

  test('install.js test-mode exports include PBR-specific functions', () => {
    const result = execSync(
      `node -e "process.env.PBR_TEST_MODE='1'; const m = require('./bin/install.js'); console.log(Object.keys(m).join(','))"`,
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    // Should have Codex-related exports (PBR multi-runtime)
    expect(result).toContain('Codex');
  });

  test('directory structure has expected agent count', () => {
    const agentsDir = path.join(ROOT, 'agents');
    const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    expect(agents.length).toBe(17);
  });

  test('directory structure has expected commands count', () => {
    const commandsDir = path.join(ROOT, 'commands', 'pbr');
    const commands = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    expect(commands.length).toBe(59);
  });

  test('directory structure has hooks', () => {
    const hooksDir = path.join(ROOT, 'hooks');
    const hooks = fs.readdirSync(hooksDir).filter(f => f.endsWith('.js'));
    expect(hooks.length).toBeGreaterThanOrEqual(40);
  });

  test('directory structure has plugins', () => {
    const pluginsDir = path.join(ROOT, 'plugins');
    const subdirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());
    expect(subdirs.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// INTG-06: CLAUDE.md documents PBR architecture accurately
// ---------------------------------------------------------------------------
describe('INTG-06: CLAUDE.md architecture documentation', () => {
  let claudeContent;

  beforeAll(() => {
    claudeContent = fs.readFileSync(CLAUDE_MD, 'utf8');
  });

  test('CLAUDE.md exists and is at least 80 lines', () => {
    const lineCount = claudeContent.split('\n').length;
    expect(lineCount).toBeGreaterThanOrEqual(80);
  });

  test('CLAUDE.md references pbr-tools', () => {
    expect(claudeContent).toContain('pbr-tools');
  });

  test('CLAUDE.md references commands/pbr/', () => {
    expect(claudeContent).toContain('commands/pbr');
  });

  test('CLAUDE.md references hooks/ directory', () => {
    expect(claudeContent).toContain('hooks/');
  });

  test('CLAUDE.md describes the three-layer architecture', () => {
    expect(claudeContent).toMatch(/[Ss]kills/);
    expect(claudeContent).toMatch(/[Aa]gents/);
    expect(claudeContent).toMatch(/[Hh]ooks/);
  });

  test('CLAUDE.md references correct coverage config file', () => {
    // Thresholds should reference jest.config.cjs, not package.json
    expect(claudeContent).toContain('jest.config.cjs');
  });

  test('CLAUDE.md has no GSD branding in user-facing text', () => {
    // Should not contain get-shit-done or GSD as a product name
    // (GSD may appear in hook detection comments, but not as the product name)
    expect(claudeContent).not.toMatch(/get-shit-done/i);
  });

  test('CLAUDE.md documents testing commands', () => {
    expect(claudeContent).toContain('npm test');
  });
});
