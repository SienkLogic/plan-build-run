export interface DashboardPhase {
  id: number;
  name: string;
  description: string;
  status: string;
}

export interface DashboardCurrentPhase {
  id: number;
  total: number;
  name: string;
  planStatus: string;
  status: string;
}

export interface DashboardData {
  projectName: string;
  currentPhase: DashboardCurrentPhase;
  lastActivity: { date: string; description: string };
  progress: number;
  phases: DashboardPhase[];
  recentActivity: Array<{ path: string; timestamp: string; type: string }>;
  quickActions: Array<{ label: string; href: string; primary: boolean }>;
  nextAction?: string | null;
}

export function getDashboardData(projectDir: string): Promise<DashboardData>;
export function parseStateFile(projectDir: string): Promise<{
  projectName: string;
  currentPhase: DashboardCurrentPhase;
  lastActivity: { date: string; description: string };
  progress: number;
  nextAction: string | null;
}>;
export function parseRoadmapFile(projectDir: string): Promise<unknown>;
export function derivePhaseStatuses(phases: DashboardPhase[], currentPhase: DashboardCurrentPhase): DashboardPhase[];
export function getRecentActivity(projectDir: string): Promise<Array<{ path: string; timestamp: string; type: string }>>;
export function deriveQuickActions(currentPhase: DashboardCurrentPhase): Array<{ label: string; href: string; primary: boolean }>;
export function _clearActivityCache(): void;
