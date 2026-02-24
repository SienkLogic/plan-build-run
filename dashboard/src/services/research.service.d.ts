export interface ResearchDoc {
  filename: string;
  slug: string;
  title: string;
  topic: string | null;
  date: string | null;
  confidence: string | null;
  coverage: string | null;
  html: string;
}

export interface CodebaseDoc {
  filename: string;
  slug: string;
  title: string;
  date: string | null;
  html: string;
}

export interface ResearchDocDetail extends ResearchDoc {
  sources_checked: string | null;
  section: string;
}

export function listResearchDocs(projectDir: string): Promise<ResearchDoc[]>;
export function listCodebaseDocs(projectDir: string): Promise<CodebaseDoc[]>;
export function getResearchDocBySlug(projectDir: string, slug: string): Promise<ResearchDocDetail | null>;
