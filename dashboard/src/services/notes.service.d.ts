export interface NoteItem {
  filename: string;
  title: string;
  date: string | null;
  promoted: boolean;
  html: string;
}

export interface NoteDetail extends NoteItem {
  slug: string;
}

export function listNotes(projectDir: string): Promise<NoteItem[]>;
export function getNoteBySlug(projectDir: string, slug: string): Promise<NoteDetail | null>;
