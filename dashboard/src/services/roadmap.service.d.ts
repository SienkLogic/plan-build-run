export interface RoadmapPhase {
  id: number;
  name: string;
  status: string;
  planCount: number;
  dependencies: number[];
}

export interface RoadmapMilestone {
  name: string;
  goal: string;
  startPhase: number;
  endPhase: number;
  completed?: boolean;
}

export interface RoadmapData {
  phases: RoadmapPhase[];
  milestones: RoadmapMilestone[];
}

export function getRoadmapData(projectDir: string): Promise<RoadmapData>;
export function generateDependencyMermaid(projectDir: string): Promise<string>;
