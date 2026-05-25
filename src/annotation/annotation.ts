export type NoteType = 'text' | 'checklist' | 'table';
export type NoteScope = 'private' | 'public';

export interface Annotation {
  id: string;
  scope: NoteScope;
  type: NoteType;
  createdAt: string;
  ownerId?: string;         

  filePath?: string;
  line?: number;
  lineEnd? : number;
  codeSnippet?: string;
  workspacePath?: string;

  text?: string;
  checklistItems?: { id: string; text: string; checked: boolean }[];
  tableHeaders?: string[];
  tableRows?: { id: string; cells: string[] }[];
}