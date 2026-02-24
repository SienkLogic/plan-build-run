export interface Requirement {
  id: string;
  text: string;
  planRefs: string[];
  covered: boolean;
}

export interface RequirementSection {
  sectionTitle: string;
  requirements: Requirement[];
}

export interface RequirementsData {
  sections: RequirementSection[];
  totalCount: number;
  coveredCount: number;
}

export function getRequirementsData(projectDir: string): Promise<RequirementsData>;
