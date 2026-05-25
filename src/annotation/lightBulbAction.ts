import * as vscode from 'vscode'
import { AnnotationStore } from './annotationStore'
import { InlineNoteProvider } from './inLineNoteProvider'


export class AddNoteCodeAction implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [vscode.CodeActionKind.Empty];

    constructor(
        private readonly store: AnnotationStore,
        private readonly inlineProvider: InlineNoteProvider,
    ){}

    provideCodeActions(
        document: vscode.TextDocument, 
        range: vscode.Range,
    ): vscode.CodeAction[]{
        if(range.isEmpty) return []; 

        const action = new vscode.CodeAction(
            'DevNotes: Add Note',
            vscode.CodeActionKind.Empty
        );
        action.command = {
            command: 'devnotes.addNote',
            title: 'Add note',
            arguments: [document, range],
        };
        return [action];
    }
}