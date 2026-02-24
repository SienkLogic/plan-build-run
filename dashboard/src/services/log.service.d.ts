export function listLogFiles(
  projectDir: string
): Promise<Array<{ name: string; size: number; modified: string }>>;

export function readLogPage(
  filePath: string,
  opts?: { page?: number; pageSize?: number; typeFilter?: string; q?: string }
): Promise<{ entries: object[]; total: number; page: number; pageSize: number }>;

export function tailLogFile(
  filePath: string,
  onLine: (entry: object) => void
): Promise<() => void>;
