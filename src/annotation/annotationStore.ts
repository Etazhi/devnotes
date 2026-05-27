import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Annotation } from './annotation';
import { AuthManager } from '../auth/authmanager';
import { randomUUID } from 'crypto';

export class AnnotationStore {
  private readonly PRIVATE_KEY = 'devnotes.private';

  constructor(
    private readonly globalState: vscode.Memento,
    private readonly authManager: AuthManager,
  ) {}

  // ─── Read ──────────────────────────────────────────────────────────────────

  getAll(): Annotation[] {
    return [...this.getPrivate(), ...this.getProject()];
  }

  getPrivate(): Annotation[] {
    const all           = this.globalState.get<Annotation[]>(this.PRIVATE_KEY, []);
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const currentUser   = this.authManager.getSession()?.username;

    return all.filter(n => {
      if (n.ownerId && currentUser && n.ownerId !== currentUser) { return false; }

      if (!n.filePath) { return true; }

      if (!workspacePath || !n.workspacePath) { return false; }
      return n.workspacePath === workspacePath;
    });
  }

  getPrivateGlobal(): Annotation[] {
    return this.globalState.get<Annotation[]>(this.PRIVATE_KEY, [])
      .filter(n => !n.filePath);
  }

  getPrivateAnchored(): Annotation[] {
    if (!vscode.workspace.workspaceFolders?.[0]) { return []; }
    return this.globalState.get<Annotation[]>(this.PRIVATE_KEY, [])
      .filter(n => !!n.filePath);
  }

  getProject(): Annotation[] {
      const dir = this.getNotesDirPath();
      if (!dir) return [];

      try {
          return fs.readdirSync(dir)
              .filter(f => f.endsWith('.json'))
              .flatMap(f => {
                  try {
                      const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
                      return JSON.parse(raw) as Annotation[];
                  } catch {
                      return [];
                  }
              });
      } catch {
          return [];
      }
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  save(data: Omit<Annotation, 'id' | 'createdAt'>): Annotation {
    const annotation: Annotation = {
      ...data,
      scope: data.scope ?? 'private', 
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };

    if (annotation.scope === 'private') {
      if (!annotation.ownerId) {
        const currentUser = this.authManager.getSession()?.username;
        if (currentUser) { annotation.ownerId = currentUser; }
      }
      const privateAll = this.globalState.get<Annotation[]>(this.PRIVATE_KEY, []);
      privateAll.push(annotation);
      this.globalState.update(this.PRIVATE_KEY, privateAll);
    } else {
      const filePath = this.getUserFilePath();
      if (!filePath) throw new Error('No workspace or user session found');
      const userNotes = this.readUserFile(filePath);
      userNotes.push(annotation);
      this.writeUserFile(filePath, userNotes);
    }

    return annotation;
  }

  delete(id: string): void {
    const privateAll = this.globalState.get<Annotation[]>(this.PRIVATE_KEY, []);
    const privateFiltered = privateAll.filter(a => a.id !== id);
    if (privateFiltered.length !== privateAll.length) {
      this.globalState.update(this.PRIVATE_KEY, privateFiltered);
      return;
    }

    const filePath = this.getUserFilePath();
    if (!filePath) return;

    const userNotes = this.readUserFile(filePath).filter(a => a.id !== id);
    if (userNotes.length === 0) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } else {
      this.writeUserFile(filePath, userNotes);
    }
  }

  update(id: string, changes: Partial<Omit<Annotation, 'id' | 'createdAt'>>): void {
    const privateAll = this.globalState.get<Annotation[]>(this.PRIVATE_KEY, []);
    const privateIdx = privateAll.findIndex(a => a.id === id);
    if (privateIdx !== -1) {
      privateAll[privateIdx] = { ...privateAll[privateIdx], ...changes };
      this.globalState.update(this.PRIVATE_KEY, privateAll);
      return;
    }

    const filePath = this.getUserFilePath();
    if (!filePath) return;

    const userNotes = this.readUserFile(filePath);
    const idx = userNotes.findIndex(a => a.id === id);
    if (idx !== -1) {
      userNotes[idx] = { ...userNotes[idx], ...changes };
      this.writeUserFile(filePath, userNotes);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private getNotesDirPath(): string | null {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) return null;
    const dir = path.join(workspace.uri.fsPath, '.devnotes');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private getUserFilePath(): string | null {
    const dir = this.getNotesDirPath();
    if (!dir) return null;
    const username = this.authManager.getSession()?.username;
    if (!username) return null;
    const safe = username.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    return path.join(dir, `${safe}.json`);
  }

  private readUserFile(filePath: string): Annotation[] {
    if (!fs.existsSync(filePath)) return [];
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Annotation[];
    } catch {
      return [];
    }
  }

  private writeUserFile(filePath: string, annotations: Annotation[]): void {
    fs.writeFileSync(filePath, JSON.stringify(annotations, null, 2), 'utf-8');
  }
}