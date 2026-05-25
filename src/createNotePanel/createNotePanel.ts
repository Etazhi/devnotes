import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'

export interface CreateNoteContext {
    document?: vscode.TextDocument;
    range?: vscode.Range;
}

export class CreateNotePanel {
    private panel: vscode.WebviewPanel | undefined;
    private currentCodeCtx: { filePath: string; line: number; lineEnd: number } | undefined;
    private currentCodeSnippet: string | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly onSave: (
            text: string,
            scope: string,
            codeContext?: { filePath: string; line: number; lineEnd: number },
            codeSnippet?: string,
        ) => void,
    ) {}

    open(noteContext?: CreateNoteContext): void {
        const editor = vscode.window.activeTextEditor;

        let selectedCode: string | undefined;
        let fileName: string | undefined;
        let lines: string | undefined;

        const doc   = noteContext?.document ?? editor?.document;
        const range = noteContext?.range ?? (editor && !editor.selection.isEmpty ? editor.selection : undefined);

        if (doc && range) {
            selectedCode = doc.getText(range);
            fileName = path.basename(doc.fileName);
            const filePath = vscode.workspace.asRelativePath(doc.uri);
            const lineStart = range.start.line + 1;
            const lineEnd = range.end.line + 1;
            lines = lineStart === lineEnd ? `L${lineStart}` : `L${lineStart}-L${lineEnd}`;
            this.currentCodeCtx = { filePath, line: lineStart, lineEnd };
            this.currentCodeSnippet = selectedCode;
        } else {
            this.currentCodeCtx = undefined;
        }

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            this._sendInit(selectedCode, fileName, lines, doc?.languageId);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'createNotePanel',
            'CodeNotes - New Note',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'webview')),
                ],
            }
        );

        this.panel.webview.html = this._getHtml(this.panel.webview);
        this._sendInit(selectedCode, fileName, lines, doc?.languageId);

        this.panel.webview.onDidReceiveMessage(msg => {
            if (msg.type === 'save') {
                this.onSave(msg.text, msg.scope, this.currentCodeCtx, this.currentCodeSnippet);
                this.panel?.dispose();
            }
            if (msg.type === 'cancel') {
                this.panel?.dispose();
            }
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.currentCodeCtx = undefined;
            this.currentCodeSnippet = undefined;
        });
    }

    private _sendInit(
        code?: string,
        fileName?: string,
        lines?: string,
        languageId?: string,
    ): void {
        this.panel?.webview.postMessage({ type: 'init', code, fileName, lines, languageId });
    }

    private _getHtml(webview: vscode.Webview): string {
        const cssUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'css', 'createNote', 'createNote.css')
        );
        const htmlPath = path.join(this.context.extensionPath, 'webview', 'createNote', 'createNote.html');

        if (fs.existsSync(htmlPath)) {
            const nonce = crypto.randomUUID();

            const csp = [
                `default-src 'none'`,
                `style-src ${webview.cspSource} https://cdn.jsdelivr.net 'unsafe-inline'`,
                `script-src 'nonce-${nonce}' https://cdn.jsdelivr.net`,
                `font-src https://cdn.jsdelivr.net https://use.fontawesome.com`,
                `img-src ${webview.cspSource} https: data:`,
            ].join('; ');

            let html = fs.readFileSync(htmlPath, 'utf-8');
            html = html.replace('{{CSS_URI}}', cssUri.toString());
            html = html.replace('{{NONCE}}', nonce);
            html = html.replace('{{CSP}}', csp);
            return html;
        }

        return '<html><body>Error: createNote.html not found</body></html>';
    }
}