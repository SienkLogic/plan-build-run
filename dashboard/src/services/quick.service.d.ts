export interface QuickTask {
  id: string;
  slug: string;
  dirName: string;
  title: string;
  status: string;
}

export interface QuickTaskDetail extends QuickTask {
  planHtml: string | null;
  summaryHtml: string | null;
}

export function listQuickTasks(projectDir: string): Promise<QuickTask[]>;
export function getQuickTask(projectDir: string, id: string): Promise<QuickTaskDetail | null>;
