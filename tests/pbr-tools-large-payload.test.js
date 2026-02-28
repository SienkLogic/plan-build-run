const fs = require('fs');

// We need to test the output() function which calls process.exit and process.stdout.write.
// To avoid actually exiting the process, we mock both before importing (or we test via
// the module's exported function with careful mocking).

describe('output() @file: escape hatch (core.js)', () => {
  let output;
  let writeSpy;
  let exitSpy;
  const tmpFiles = [];

  beforeAll(() => {
    // Mock process.exit before requiring to prevent test runner from exiting
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // Require after mocking so calls are captured
    output = require('../plugins/pbr/scripts/lib/core').output;
  });

  beforeEach(() => {
    writeSpy.mockClear();
    exitSpy.mockClear();
  });

  afterAll(() => {
    writeSpy.mockRestore();
    exitSpy.mockRestore();

    // Clean up any tmpfiles created during tests
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f); } catch (_e) { /* best-effort cleanup */ }
    }
  });

  test('small payload writes JSON inline (not @file:)', () => {
    const data = { hello: 'world', count: 42 };
    output(data);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = writeSpy.mock.calls[0][0];
    expect(written).not.toMatch(/^@file:/);
    const parsed = JSON.parse(written.trim());
    expect(parsed).toEqual(data);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('large payload (>50KB) writes to tmpfile and emits @file: path', () => {
    // Create a payload whose JSON stringification exceeds 50000 chars
    const largeString = 'x'.repeat(60000);
    const data = { payload: largeString };

    output(data);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = writeSpy.mock.calls[0][0];
    expect(written.trim()).toMatch(/^@file:/);

    // Extract the file path
    const filePath = written.trim().replace(/^@file:/, '');
    tmpFiles.push(filePath);

    // File must exist and contain valid JSON matching the original data
    expect(fs.existsSync(filePath)).toBe(true);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(fileContent);
    expect(parsed).toEqual(data);

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('payload exactly at 50000 chars writes inline (boundary: equal is NOT over)', () => {
    // JSON.stringify({ value: "..." }) length must be exactly 50000
    // JSON template: {"value":"..."}\n — overhead is 12 chars: {"value":"" }
    // '{"value":"' (10) + '"}\n' (3 if we include newline, but stringify doesn't add one)
    // JSON.stringify({ value: str }) = '{\n  "value": "' + str + '"\n}' with indent 2
    // Let's calculate empirically:
    const probe = JSON.stringify({ value: '' }, null, 2); // '{\n  "value": ""\n}' = 18 chars
    const overhead = probe.length; // 18
    const targetLength = 50000;
    const strLen = targetLength - overhead;
    const str = 'a'.repeat(strLen);
    const data = { value: str };

    const json = JSON.stringify(data, null, 2);
    expect(json.length).toBe(targetLength);

    output(data);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = writeSpy.mock.calls[0][0];
    // Exactly 50000 is NOT > 50000, so it should go inline
    expect(written.trim()).not.toMatch(/^@file:/);
    const parsed = JSON.parse(written.trim());
    expect(parsed).toEqual(data);

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test('payload one byte over (50001 chars) writes to tmpfile', () => {
    // Build a JSON string that is exactly 50001 chars
    const probe = JSON.stringify({ value: '' }, null, 2); // 18 chars overhead
    const overhead = probe.length;
    const targetLength = 50001;
    const strLen = targetLength - overhead;
    const str = 'b'.repeat(strLen);
    const data = { value: str };

    const json = JSON.stringify(data, null, 2);
    expect(json.length).toBe(targetLength);

    output(data);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = writeSpy.mock.calls[0][0];
    expect(written.trim()).toMatch(/^@file:/);

    const filePath = written.trim().replace(/^@file:/, '');
    tmpFiles.push(filePath);

    // Verify tmpfile content matches original object
    expect(fs.existsSync(filePath)).toBe(true);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(fileContent);
    expect(parsed).toEqual(data);

    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
