export interface MilestoneStats {
  phaseCount: number;
  commitCount: number;
  deliverables: string[];
  statsHtml?: string;
}

export interface MilestoneItem {
  version: string;
  name: string;
  date: string;
  duration: string;
  files: string[];
  stats?: MilestoneStats;
}

export interface MilestoneSection {
  type: string;
  frontmatter: Record<string, unknown>;
  html: string;
}

export interface MilestoneDetail {
  version: string;
  sections: MilestoneSection[];
}

export interface AllMilestones {
  active: MilestoneItem[];
  archived: MilestoneItem[];
}

export function listArchivedMilestones(projectDir: string): Promise<MilestoneItem[]>;
export function getAllMilestones(projectDir: string): Promise<AllMilestones>;
export function getMilestoneDetail(projectDir: string, version: string): Promise<MilestoneDetail>;
