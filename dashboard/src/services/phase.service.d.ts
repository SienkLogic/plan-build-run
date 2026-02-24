export interface PlanMeta {
  planTitle: string | null;
  taskCount: number;
}

export interface PlanCommit {
  task: string;
  status: string;
  hash: string;
  files: number;
  verify: string;
}

export interface MustHave {
  category: string;
  text: string;
  passed: boolean;
}

export interface VerificationFrontmatter {
  result?: string;
  gaps?: string[];
  must_haves?: Record<string, string[]>;
  mustHaves?: MustHave[];
  [key: string]: unknown;
}

export interface PlanSummary {
  planId: string;
  planFile: string;
  planTitle: string | null;
  taskCount: number;
  summary: Record<string, unknown> | null;
  content: string | null;
  commits: PlanCommit[];
}

export interface PhaseDetail {
  phaseId: string;
  phaseName: string;
  phaseDir: string | null;
  plans: PlanSummary[];
  verification: VerificationFrontmatter | null;
}

export interface PhaseDocument {
  phaseId: string;
  planId: string;
  docType: string;
  phaseName: string;
  frontmatter: Record<string, unknown> | null;
  html: string | null;
}

export function extractPlanMeta(rawContent: string | null): PlanMeta;
export function enrichVerification(frontmatter: Record<string, unknown> | null | undefined): VerificationFrontmatter | null | undefined;
export function parseTaskResultsTable(rawContent: string | null): PlanCommit[];
export function getPhaseDetail(projectDir: string, phaseId: string): Promise<PhaseDetail>;
export function getPhaseDocument(projectDir: string, phaseId: string, planId: string, docType: string): Promise<PhaseDocument | null>;
