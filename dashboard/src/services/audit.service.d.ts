export interface AuditReport {
  filename: string;
  date: string | null;
  slug: string;
  title: string;
}

export interface AuditReportDetail extends AuditReport {
  frontmatter: Record<string, unknown>;
  html: string;
}

export function listAuditReports(projectDir: string): Promise<AuditReport[]>;
export function getAuditReport(projectDir: string, filename: string): Promise<AuditReportDetail | null>;
