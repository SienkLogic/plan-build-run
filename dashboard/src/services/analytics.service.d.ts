export interface PhaseAnalytics {
  phaseId: string;
  phaseName: string;
  commitCount: number;
  duration: string | null;
  planCount: number;
  linesChanged: number;
}

export interface AnalyticsSummary {
  totalCommits: number;
  totalPhases: number;
  avgDuration: string;
  totalLinesChanged: number;
}

export interface ProjectAnalytics {
  phases: PhaseAnalytics[];
  summary: AnalyticsSummary;
  warning?: string;
}

export declare const cache: any;
export declare function getProjectAnalytics(projectDir: string): Promise<ProjectAnalytics>;
