import * as vscode from 'vscode';
import { AnnotationStore } from './annotationStore';
import { Annotation } from './annotation';
import { NotePanel } from './notePanel';
import { getLevelColor, getDecorationForLevel, disposeAllDecorations } from '../colors/nestingColors';

export class InlineNoteProvider implements
    vscode.CodeLensProvider,
    vscode.HoverProvider
{

    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    constructor(
        private readonly store: AnnotationStore,
        private readonly notePanel: NotePanel,
        private readonly isLoggedIn: () => boolean = () => true,
    ) {}

    // ─── Helpers ───────────────────────────────────────────────────────────────

    private lineNotesFor(filePath: string): Annotation[] {
        return this.store.getAll().filter(
            n => n.filePath === filePath && n.line != null
        );
    }

    private getNestingLevel(note: Annotation, allNotes: Annotation[]): number {
        const noteStart = note.line!;
        const noteEnd   = note.lineEnd ?? noteStart;

        return allNotes.filter(other => {
            if (other.id === note.id || other.line == null) return false;
            const otherStart = other.line;
            const otherEnd   = other.lineEnd ?? otherStart;
            return otherStart <= noteStart && otherEnd >= noteEnd;
        }).length;
    }

    // ─── CodeLensProvider ──────────────────────────────────────────────────────

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (!this.isLoggedIn()) return [];

        const filePath = vscode.workspace.asRelativePath(document.uri);
        const notes    = this.lineNotesFor(filePath);

        return notes.map(note => {
            const line  = note.line! - 1;
            const range = new vscode.Range(line, 0, line, 0);
            const title = (note.text ?? '').split('\n')[0].trim();
            return new vscode.CodeLens(range, {
                title: `${title}`,
                command: 'devnotes.openNote',
                arguments: [note.id, document],
                tooltip: 'Click to open note',
            });
        });
    }

    // ─── HoverProvider ─────────────────────────────────────────────────────────

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | undefined {
        if (!this.isLoggedIn()) return undefined;

        const filePath = vscode.workspace.asRelativePath(document.uri);
        const notes    = this.lineNotesFor(filePath).filter(
            n => position.line + 1 >= n.line! &&
                 position.line + 1 <= (n.lineEnd ?? n.line!)
        );
        if (notes.length === 0) return undefined;

        // Nota mais aninhada (menor span) sob o cursor
        const note = notes.reduce((smallest, curr) => {
            const sSize = (smallest.lineEnd ?? smallest.line!) - smallest.line!;
            const cSize = (curr.lineEnd     ?? curr.line!)     - curr.line!;
            return cSize < sSize ? curr : smallest;
        });

        const allLineNotes = this.lineNotesFor(filePath);
        const level = this.getNestingLevel(note, allLineNotes);
        const color = getLevelColor(level);

        const md = new vscode.MarkdownString();
        md.isTrusted        = true;
        md.supportThemeIcons = true;
        const title = (note.text ?? '').split('\n')[0].trim();
        md.appendMarkdown(
            `<span style="color:${color};">●</span> **${title}**` +
            `&nbsp;&nbsp;` +
            `[$(eye) Open note](command:devnotes.openNote?${encodeURIComponent(JSON.stringify([note.id]))})` +
            `&nbsp;&nbsp;` +
            `[$(trash) Delete](command:devnotes.deleteNote?${encodeURIComponent(JSON.stringify([note.id]))})`
        );

        return new vscode.Hover(md);
    }

    // ─── Decorações ────────────────────────────────────────────────────────────

    applyDecorations(): void {
        const editor = vscode.window.activeTextEditor;
        if(!editor) return;

        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const notes = this.lineNotesFor(filePath);

        const levels = [...new Set(notes.map(n => this.getNestingLevel(n ,notes)))];

        levels.forEach(level => {
            editor.setDecorations(getDecorationForLevel(level), []);
        });

        levels.forEach(level => {
            const ranges = notes
                .filter(n => this.getNestingLevel(n, notes)===level)
                .map(n => new vscode.Range(
                    n.line! - 1,0,
                    (n.lineEnd ?? n.line)! - 1,Number.MAX_SAFE_INTEGER
                ));
                editor.setDecorations(getDecorationForLevel(level), ranges);
        });
    }

    // ─── Lifecycle ─────────────────────────────────────────────────────────────

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
        this.applyDecorations();
    }

    clearAll(): void {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const filePath = vscode.workspace.asRelativePath(editor.document.uri);
            const notes = this.lineNotesFor(filePath);
            const levels = [...new Set(notes.map(n => this.getNestingLevel(n,notes)))];
            levels.forEach(level => {
                editor.setDecorations(getDecorationForLevel(level), []);
            });
        }
        this._onDidChangeCodeLenses.fire();
    }

    dispose(): void {
        disposeAllDecorations();
        this._onDidChangeCodeLenses.dispose();
    }
}