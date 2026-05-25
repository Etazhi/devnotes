import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AnnotationStore } from './annotationStore';
import { Annotation } from './annotation';
import { AuthManager } from '../auth/authmanager';


export class NotePanel {
    private currentPanel: vscode.WebviewPanel | undefined;

    constructor(
        private readonly store: AnnotationStore,
        private readonly context: vscode.ExtensionContext,
        private readonly authManager: AuthManager,
        private readonly onDelete?: () => void,
    ) {}

    // ─── Public API ────────────────────────────────────────────────────────────

    open(noteId: string, document?: vscode.TextDocument): void {
        const note = this.store.getAll().find(n => n.id === noteId);
        if (!note) { return; }

        const codeLines = this._resolveCodeLines(note, document);
        console.log('[NotePanel] noteId:', noteId);
        console.log('[NotePanel] codeSnippet:', note.codeSnippet);
        console.log('[NotePanel] codeLines:', codeLines);
        const languageId = this._resolveLanguageId(note, document);

        const session = this.authManager.getSession();
        const currentUser = session?.username ?? null;
        const isOwner = !note.ownerId || note.ownerId === currentUser;

        this._ensurePanel();

        const noteText = note.text??'';
        this.currentPanel!.title = `Note: ${noteText.slice(0, 30)}${noteText.length > 30 ? '…' : ''}`;

        this.currentPanel!.webview.html = this._buildHtml(
            note,
            codeLines,
            languageId,
            isOwner,
            this.currentPanel!.webview,
        );
    }

    dispose(): void {
        this.currentPanel?.dispose();
    }

    // ─── Internals ─────────────────────────────────────────────────────────────

    private _resolveCodeLines(note: Annotation, document?: vscode.TextDocument): string[]{
        if(note.line == null) { return[]; }

        const liveDoc = this._matchingOpenDocument(note,document);
        if (liveDoc){
            return this._readLiveLines(note,liveDoc);
        }
        if(note.codeSnippet){
            return note.codeSnippet.split('\n');
        }
        return[];
    }

    private _matchingOpenDocument(
        note: Annotation,
        document?: vscode.TextDocument,
    ): vscode.TextDocument | undefined{
        if(!note.filePath){ return undefined; }
        const candidates = [
            document,
            vscode.window.activeTextEditor?.document,
        ].filter(Boolean) as vscode.TextDocument[];

        return candidates.find(doc => {
            const rel = vscode.workspace.asRelativePath(doc.uri);
            return rel === note.filePath;
        });
    }

    private _readLiveLines(note: Annotation, doc: vscode.TextDocument): string[]{
        const start = note.line! - 1;
        const end = (note.lineEnd ?? note.line!)-1;
        const lines: string[] = [];
        for(let i = start; i <= end; i++){
            if (i < doc.lineCount){
                lines.push(doc.lineAt(i).text);
            }
        }
        return lines; 
    }

    private _resolveLanguageId(note: Annotation, document?: vscode.TextDocument): string{
        const liveDoc = this._matchingOpenDocument(note, document);
        if(liveDoc) { return liveDoc.languageId; }

        if(note.filePath){
            const ext = path.extname(note.filePath).slice(1);
            if (ext) { return ext; }
        }
        return 'plaintext';
    }

    private _ensurePanel(): void {
        if (this.currentPanel) {
            // Painel já existe — apenas trazer para primeiro plano.
            // Não destruir: evita o flash/delay de recriar o webview.
            this.currentPanel.reveal(vscode.ViewColumn.Beside, true);
            return;
        }

        this.currentPanel = vscode.window.createWebviewPanel(
            'codenotePanel',
            'CodeNote',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'webview')),
                ],
            }
        );

        this.currentPanel.onDidDispose(() => {
            this.currentPanel = undefined;
        });

        this.currentPanel.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'delete') {
                this.store.delete(msg.id);
                this.currentPanel?.dispose();
                this.onDelete?.();
            }

            if(msg.command === 'save') {
                const note = this.store.getAll().find(n => n.id === msg.id);
                if(!note) { return; }
                this.store.update(msg.id, {text: msg.text});

                const updateNote = this.store.getAll().find(n => n.id === msg.id)!;
                const session = this.authManager.getSession();
                const isOwner = !updateNote.ownerId || updateNote.ownerId === session?.username;

                const codeLines = this._resolveCodeLines(updateNote); 
                const languageId = this._resolveLanguageId(updateNote);

                this.currentPanel!.webview.html = this._buildHtml(
                    updateNote,
                    codeLines,
                    languageId,
                    isOwner,
                    this.currentPanel!.webview,
                );

                this.onDelete?.();
            }
        });
    }

    // ─── HTML ──────────────────────────────────────────────────────────────────

    private _buildHtml(
        note: Annotation,
        codeLines: string[],
        languageId: string,
        isOwner: boolean,
        webview: vscode.Webview,
    ): string {
        const escHtml = (s: string) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const nonce     = crypto.randomUUID().replace(/-/g, '');
        const cspSource = webview.cspSource;

        const cssUri   = webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'webview', 'css', 'notePanel', 'notePanel.css'))
        );
        const htmlPath = path.join(this.context.extensionPath, 'webview', 'notePanel', 'notePanel.html');
        const template = fs.readFileSync(htmlPath, 'utf8');

        const dateStr  = note.createdAt ? note.createdAt.slice(0, 10) : '';
        const fileInfo = note.filePath
            ? `<span class="chip chip-file">&#128196; ${escHtml(note.filePath)}${note.line ? ` : ${note.line}` : ''}</span>`
            : '';

        const codeBlockHtml = codeLines.length > 0
            ? `<div class="code-block">
                 <div class="code-bar">
                   <span class="code-bar-dot"></span><span class="code-bar-dot"></span><span class="code-bar-dot"></span>
                   <span class="code-bar-label">Lines ${note.line}–${note.lineEnd ?? note.line} &nbsp;·&nbsp; ${escHtml(languageId)}</span>
                 </div>
                 <pre><code class="language-${escHtml(languageId)}">${escHtml(codeLines.join('\n'))}</code></pre>
               </div>`
            : '';

        const deleteButtonHtml = isOwner
            ? `<div class="footer">
                 <button id="btn-delete" class="btn-delete" data-id="${note.id}">
                   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                     <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                   </svg>
                   Delete note
                 </button>
               </div>`
            : '';

        const markdownHtml = renderMarkdown(note.text ?? '', escHtml);

        const editButtonHtml = isOwner 
        ?`<button id="btn-edit" class="btn-edit">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit
          </button>`: '';

        return template
            .replace(/\{\{NONCE\}\}/g,    nonce)
            .replace('{{CSP_SOURCE}}',    cspSource)
            .replace('{{CSS_URI}}',       cssUri.toString())
            .replace('{{DATE}}',          dateStr)
            .replace('{{FILE_INFO}}',     fileInfo)
            .replace('{{CODE_BLOCK}}',    codeBlockHtml)
            .replace('{{MARKDOWN}}',
                `<div id="view-mode">${markdownHtml}</div>
                <textarea id="edit-mode" style="display:none">${escHtml(note.text ?? '')}</textarea>`
            )
            .replace('{{NOTE_ID}}',       note.id)  
            .replace('{{EDIT_BUTTON}}',   editButtonHtml)
            .replace('{{DELETE_BUTTON}}', deleteButtonHtml);
    }
}

// ─── Markdown renderer (server-side, sem dependências) ──────────────────────

function renderMarkdown(text: string, escHtml: (s: string) => string): string {
    const lines  = text.split('\n');
    let   html   = '';
    let   inCode = false;
    let   codeBuf: string[] = [];
    let   inList  = false;
    let   listItems: string[] = [];
    let   inTable = false;
    let   tableRows: string[][] = [];

    function flushCode() {
        if (!codeBuf.length) { return; }
        html += `<pre><code>${escHtml(codeBuf.join('\n'))}</code></pre>`;
        codeBuf = []; inCode = false;
    }
    function flushList() {
        if (!listItems.length) { return; }
        html += '<ul class="md-checklist">' + listItems.join('') + '</ul>';
        listItems = []; inList = false;
    }
    function flushTable() {
        if (!tableRows.length) { return; }
        let t = '<table class="md-table">';
        tableRows.forEach((row, i) => {
            if (row.every(c => /^[-: ]+$/.test(c.trim()))) { return; }
            const tag = i === 0 ? 'th' : 'td';
            t += '<tr>' + row.map(c => `<${tag}>${inline(c.trim())}</${tag}>`).join('') + '</tr>';
        });
        t += '</table>';
        html += t;
        tableRows = []; inTable = false;
    }

    function inline(s: string): string {
        return escHtml(s)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,     '<em>$1</em>')
            .replace(/_(.+?)_/g,       '<em>$1</em>')
            .replace(/`(.+?)`/g,       '<code>$1</code>');
    }

    for (const line of lines) {
        // Fenced code block
        if (line.startsWith('```')) {
            if (inCode) { flushCode(); }
            else        { if (inList) { flushList(); } if (inTable) { flushTable(); } inCode = true; }
            continue;
        }
        if (inCode) { codeBuf.push(line); continue; }

        // Table
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            if (inList) { flushList(); }
            inTable = true;
            tableRows.push(line.trim().slice(1, -1).split('|'));
            continue;
        }
        if (inTable) { flushTable(); }

        // Checklist
        const todoMatch = line.match(/^- \[([ xX])\] (.+)/);
        if (todoMatch) {
            if (inTable) { flushTable(); }
            inList = true;
            const checked = todoMatch[1].toLowerCase() === 'x';
            const uid     = 'chk-' + Math.random().toString(36).slice(2, 7);
            listItems.push(
                `<li class="md-todo${checked ? ' done' : ''}">` +
                `<input type="checkbox" id="${uid}"${checked ? ' checked' : ''}>` +
                `<label for="${uid}">${escHtml(todoMatch[2])}</label></li>`
            );
            continue;
        }
        if (inList) { flushList(); }

        // Blank line
        if (!line.trim()) { html += '<p style="margin:0 0 8px"></p>'; continue; }

        // HR
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { html += '<hr class="md-hr">'; continue; }

        // Headings
        const hMatch = line.match(/^(#{1,3})\s+(.+)/);
        if (hMatch) {
            const lvl = hMatch[1].length;
            html += `<h${lvl}>${escHtml(hMatch[2])}</h${lvl}>`;
            continue;
        }

        // Blockquote
        const bqMatch = line.match(/^>\s?(.*)/);
        if (bqMatch) { html += `<blockquote>${inline(bqMatch[1])}</blockquote>`; continue; }

        // Unordered list
        const ulMatch = line.match(/^[-*+]\s+(.+)/);
        if (ulMatch) { html += `<ul style="margin:0 0 4px;padding-left:20px"><li>${inline(ulMatch[1])}</li></ul>`; continue; }

        // Ordered list
        const olMatch = line.match(/^\d+\.\s+(.+)/);
        if (olMatch) { html += `<ol style="margin:0 0 4px;padding-left:20px"><li>${inline(olMatch[1])}</li></ol>`; continue; }

        // Paragraph
        html += `<p>${inline(line)}</p>`;
    }

    if (inCode)  { flushCode(); }
    if (inList)  { flushList(); }
    if (inTable) { flushTable(); }

    return html;
}