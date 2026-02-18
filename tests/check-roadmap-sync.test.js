const { parseState, getRoadmapPhaseStatus } = require('../plugins/pbr/scripts/check-roadmap-sync');

describe('check-roadmap-sync.js', () => {
  describe('parseState', () => {
    test('parses bold Phase format', () => {
      const content = '**Phase**: 03 - auth-system\n**Status**: planned';
      const result = parseState(content);
      expect(result.phase).toBe('3');
      expect(result.status).toBe('planned');
    });

    test('parses plain Phase format', () => {
      const content = 'Phase: 3\nStatus: building';
      const result = parseState(content);
      expect(result.phase).toBe('3');
      expect(result.status).toBe('building');
    });

    test('parses "Current phase" format', () => {
      const content = 'Current Phase: 03-slug-name\nPhase Status: built';
      const result = parseState(content);
      expect(result.phase).toBe('3');
      expect(result.status).toBe('built');
    });

    test('parses bold status', () => {
      const content = '**Phase**: 05\n**Status**: verified';
      const result = parseState(content);
      expect(result.phase).toBe('5');
      expect(result.status).toBe('verified');
    });

    test('parses quoted status', () => {
      const content = 'Phase: 2\nStatus: "planned"';
      const result = parseState(content);
      expect(result.status).toBe('planned');
    });

    test('returns null for missing phase', () => {
      const content = 'Status: planned';
      const result = parseState(content);
      expect(result).toBeNull();
    });

    test('returns null for missing status', () => {
      const content = 'Phase: 3\nSome other content';
      const result = parseState(content);
      expect(result).toBeNull();
    });

    test('returns null for empty content', () => {
      const result = parseState('');
      expect(result).toBeNull();
    });

    test('normalizes leading zeros', () => {
      const content = '**Phase**: 01\n**Status**: planned';
      const result = parseState(content);
      expect(result.phase).toBe('1');
    });

    test('handles decimal phase numbers', () => {
      const content = 'Phase: 3.1\nStatus: planned';
      const result = parseState(content);
      expect(result.phase).toBe('3.1');
    });
  });

  describe('getRoadmapPhaseStatus', () => {
    const standardTable = `# Roadmap

## Phase Overview
| Phase | Name | Goal | Plans | Wave | Status |
|-------|------|------|-------|------|--------|
| 01 | Setup | Init project | 2 | 1 | planned |
| 02 | Auth | Add login | 3 | 1 | built |
| 03 | API | REST endpoints | 4 | 2 | pending |
`;

    test('finds status for a matching phase', () => {
      expect(getRoadmapPhaseStatus(standardTable, '1')).toBe('planned');
      expect(getRoadmapPhaseStatus(standardTable, '2')).toBe('built');
      expect(getRoadmapPhaseStatus(standardTable, '3')).toBe('pending');
    });

    test('normalizes phase numbers (03 matches 3)', () => {
      // The table has "01" but we query with "1"
      expect(getRoadmapPhaseStatus(standardTable, '1')).toBe('planned');
    });

    test('returns null for missing phase', () => {
      expect(getRoadmapPhaseStatus(standardTable, '99')).toBeNull();
    });

    test('returns null for empty content', () => {
      expect(getRoadmapPhaseStatus('', '1')).toBeNull();
    });

    test('returns null for content without table', () => {
      expect(getRoadmapPhaseStatus('# Roadmap\nNo table here', '1')).toBeNull();
    });

    test('handles varying column counts', () => {
      const table = `| Phase | Name | Status |
|-------|------|--------|
| 01 | Setup | done |
`;
      expect(getRoadmapPhaseStatus(table, '1')).toBe('done');
    });

    test('handles case-insensitive column headers', () => {
      const table = `| phase | name | goal | plans | wave | status |
|-------|------|------|-------|------|--------|
| 01 | Setup | Init | 2 | 1 | verified |
`;
      expect(getRoadmapPhaseStatus(table, '1')).toBe('verified');
    });

    test('handles table not under Phase Overview heading', () => {
      // getRoadmapPhaseStatus looks for any table with Phase/Status columns
      const table = `# Something Else
| Phase | Name | Status |
|-------|------|--------|
| 05 | Deploy | complete |
`;
      expect(getRoadmapPhaseStatus(table, '5')).toBe('complete');
    });
  });
});
