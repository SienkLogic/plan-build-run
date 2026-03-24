const { normalizeMsysPath } = require('../plugins/pbr/scripts/lib/msys-path');

describe('normalizeMsysPath', () => {
  it('converts /d/Repos/foo to D:\\Repos\\foo', () => {
    expect(normalizeMsysPath('/d/Repos/foo')).toBe('D:\\Repos\\foo');
  });

  it('converts /D/Repos/foo to D:\\Repos\\foo (case-insensitive drive letter)', () => {
    expect(normalizeMsysPath('/D/Repos/foo')).toBe('D:\\Repos\\foo');
  });

  it('converts /c/Users/test/project to C:\\Users\\test\\project', () => {
    expect(normalizeMsysPath('/c/Users/test/project')).toBe('C:\\Users\\test\\project');
  });

  it('leaves Windows-native path D:\\Repos\\foo unchanged', () => {
    expect(normalizeMsysPath('D:\\Repos\\foo')).toBe('D:\\Repos\\foo');
  });

  it('leaves relative path plugins/pbr/scripts unchanged', () => {
    expect(normalizeMsysPath('plugins/pbr/scripts')).toBe('plugins/pbr/scripts');
  });

  it('leaves Unix absolute path /usr/local/bin unchanged', () => {
    expect(normalizeMsysPath('/usr/local/bin')).toBe('/usr/local/bin');
  });

  it('returns null for null input', () => {
    expect(normalizeMsysPath(null)).toBe(null);
  });

  it('returns empty string for empty input', () => {
    expect(normalizeMsysPath('')).toBe('');
  });

  it('converts deep nested MSYS path', () => {
    expect(normalizeMsysPath('/e/Projects/my-app/plugins/pbr/scripts/lib'))
      .toBe('E:\\Projects\\my-app\\plugins\\pbr\\scripts\\lib');
  });
});
