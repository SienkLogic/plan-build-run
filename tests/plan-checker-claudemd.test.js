const fs = require('fs');
const path = require('path');

describe('Plan-Checker D10: CLAUDE.md Compliance', () => {
  let agentContent;

  beforeAll(() => {
    agentContent = fs.readFileSync(
      path.join(__dirname, '..', 'plugins', 'pbr', 'agents', 'plan-checker.md'),
      'utf8'
    );
  });

  // Structural tests
  test('plan-checker contains D10 section', async () => {
    expect(agentContent).toContain('### D10: CLAUDE.md Compliance');
  });

  test('D10 has BLOCKER severity for contradicting directives', async () => {
    expect(agentContent).toMatch(/contradicts.*CLAUDE\.md.*directive.*BLOCKER/si);
  });

  test('D10 has BLOCKER severity for forbidden patterns', async () => {
    expect(agentContent).toMatch(/forbids.*BLOCKER|BLOCKER.*forbid/si);
  });

  test('D10 has WARNING severity for omitted steps', async () => {
    expect(agentContent).toMatch(/omits.*WARNING|WARNING.*omit/si);
  });

  test('D10 listed in always-run dimensions', async () => {
    // D10 should appear in the "Always run" section, not the "Skip" section
    const alwaysRunMatch = agentContent.match(/Always run.*?(?=Skip|$)/si);
    expect(alwaysRunMatch).toBeTruthy();
    expect(alwaysRunMatch[0]).toContain('D10');
  });

  test('dimension count updated to 10', async () => {
    expect(agentContent).toContain('10 Verification Dimensions');
    expect(agentContent).not.toContain('9 Verification Dimensions');
  });

  test('description mentions 10 dimensions', async () => {
    const descMatch = agentContent.match(/description:\s*"([^"]+)"/);
    expect(descMatch).toBeTruthy();
    expect(descMatch[1]).toContain('10');
  });

  test('success criteria references D1-D10', async () => {
    expect(agentContent).toContain('D1-D10');
  });

  test('D10 defines extraction patterns for CLAUDE.md parsing', async () => {
    expect(agentContent).toMatch(/NEVER.*ALWAYS.*MUST/si);
  });

  test('D10 handles missing CLAUDE.md gracefully', async () => {
    expect(agentContent).toMatch(/No CLAUDE\.md.*skip/si);
  });

  test('quick depth dimensions_checked is 8', async () => {
    expect(agentContent).toMatch(/dimensions_checked.*8.*not 10/si);
  });
});
