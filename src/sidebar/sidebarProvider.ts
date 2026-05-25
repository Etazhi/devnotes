import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { AnnotationStore } from '../annotation/annotationStore';
import { Annotation } from '../annotation/annotation';
import { AuthManager } from '../auth/authmanager';
import { CreateNotePanel } from '../createNotePanel/createNotePanel';
import { NotePanel } from '../annotation/notePanel';

export class SidebarProvider implements vscode.WebviewViewProvider {

  private webviewView: vscode.WebviewView | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly authManager: AuthManager,
    private readonly store: AnnotationStore,
    private readonly createNotePanel: CreateNotePanel,
    private readonly notePanel: NotePanel,
  ) {
    context.subscriptions.push(
      authManager.onDidChangeSession(() => {
        if (this.webviewView) {
          const webviewDir = vscode.Uri.joinPath(this.context.extensionUri, 'webview');
          this.renderView(this.webviewView, webviewDir);
        }
      })
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    const webviewDir = vscode.Uri.joinPath(this.context.extensionUri, 'webview');
    try {
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [webviewDir],
      };

      this.authManager.waitForRestore().then(() => {
        this.renderView(webviewView, webviewDir);
      });

      webviewView.webview.onDidReceiveMessage(async message => {
        try {
          switch (message.type) {

            case 'ready': {
              await this.authManager.waitForRestore();
              if (!this.authManager.isLoggedIn()) {
                this.renderView(webviewView, webviewDir);
                return;
              }
              const notes  = this.store.getAll();
              const userId = this._getCurrentUserId();
              webviewView.webview.postMessage({ type: 'load', notes, userId });
              break;
            }
            case 'filter': {
              if(!this.authManager.isLoggedIn()) {return;}
              const userId = this._getCurrentUserId();
              let notes: Annotation[];

              switch (message.scope){
                case 'private': notes = this.store.getPrivate(); break;
                case 'public': notes = this.store.getProject(); break; 
                default: notes = this.store.getAll(); break;
              }

              webviewView.webview.postMessage({type: 'load', notes, userId});
              break;
            }

            case 'loginGitHub': {
              const session = await this.authManager.loginWithGitHub();
              if (session) {
                this.renderView(webviewView, webviewDir);
              } else {
                webviewView.webview.postMessage({ type: 'loginError', provider: 'github' });
              }
              break;
            }

            case 'loginAzure': {
              const session = await this.authManager.loginWithAzure();
              if (session) {
                this.renderView(webviewView, webviewDir);
              } else {
                webviewView.webview.postMessage({ type: 'loginError', provider: 'azure' });
              }
              break;
            }

            case 'logout': {
              this.authManager.logout();
              break;
            }

            case 'newNote': {
              if (!this.authManager.isLoggedIn()) {
                vscode.window.showWarningMessage('CodeNotes: please log in first.');
                return;
              }
              this.createNotePanel.open();
              break;
            }

            case 'openNote': {
              if (!message.id) { return; }
              this.notePanel.open(message.id);
              break;
            }

            case 'save': {
              if (!this.authManager.isLoggedIn()) { return; }
              const { text, scope, filePath, line } = message;
              if (!text?.trim()) { return; }

              const annotation: Omit<Annotation, 'id' | 'createdAt'> = {
                scope,
                type: 'text',
                text,
                ownerId:  this.authManager.getSession()?.username,
                filePath: filePath || undefined,
                line:     line || undefined,
              };
              this.store.save(annotation);
              const notes  = this.store.getAll();
              const userId = this._getCurrentUserId();
              webviewView.webview.postMessage({ type: 'load', notes, userId });
              break;
            }

            case 'delete': {
              if (!this.authManager.isLoggedIn()) { return; }
              this.store.delete(message.id);
              const notes  = this.store.getAll();
              const userId = this._getCurrentUserId();
              webviewView.webview.postMessage({ type: 'load', notes, userId });
              break;
            }

            case 'getContext': {
              const editor   = vscode.window.activeTextEditor;
              const filePath = editor
                ? vscode.workspace.asRelativePath(editor.document.uri)
                : null;
              const line = editor
                ? editor.selection.active.line + 1
                : null;
              webviewView.webview.postMessage({ type: 'context', filePath, line });
              break;
            }

            default: {
              console.warn('[CodeNotes] Unknown message:', message.type);
            }
          }
        } catch (err) {
          console.error('[CodeNotes] Error processing message:', message.type, err);
        }
      });

    } catch (err) {
      console.error('[CodeNotes] Error initializing WebView:', err);
      webviewView.webview.html = `
        <html><body style="padding:16px;font-family:sans-serif;color:#f48771;">
          <b>Erro ao carregar CodeNotes</b><br><br>${err}
        </body></html>`;
    }
  }

  private _getCurrentUserId(): string | null {
    return this.authManager.getSession()?.username ?? null;
  }

  private ativeFilter: 'all' | 'private' | 'public' = 'all';

  refresh(): void {
    if (!this.webviewView) { return; }
    let notes: Annotation[];

    switch(this.ativeFilter){
      case 'private': notes = this.store.getPrivate(); break;
      case 'public': notes = this.store.getProject(); break; 
      default: notes = this.store.getAll(); break;
    }
    const userId = this._getCurrentUserId();
    this.webviewView.webview.postMessage({ type: 'load', notes, userId });
  }

  private renderView(webviewView: vscode.WebviewView, webviewDir: vscode.Uri): void {
    if (this.authManager.isLoggedIn()) {
      webviewView.webview.html = this.getHtml(webviewView.webview, webviewDir, 'index.html');
    } else {
      webviewView.webview.html = this.getHtml(webviewView.webview, webviewDir, 'noSession.html');
    }
  }

  private getNonce(): string {
    return crypto.randomBytes(16).toString('base64');
  }

  private getHtml(webview: vscode.Webview, webviewDir: vscode.Uri, htmlFile: string): string {
    const nonce     = this.getNonce();
    const cspSource = webview.cspSource;

    const globalCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewDir, 'css', 'global.css')
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewDir, 'main.js')
    );
    const indexCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewDir, 'css', 'index', 'index.css')
    );
    const noSessionCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewDir, 'css', 'noSession', 'noSession.css')
    );
    const noteGroupsJsUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir,'noteGroups.js'));
    const editorJsUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'editor.js'));

    const isNoSession = htmlFile === 'noSession.html';
    const htmlPath = path.join(
      this.context.extensionPath,
      'webview',
      isNoSession ? 'noSession' : '',
      htmlFile
    );

    try {
      let html = fs.readFileSync(htmlPath, 'utf8');

      html = html.replace(/\{\{NONCE\}\}/g,              nonce);
      html = html.replace(/\{\{WEBVIEW_CSP_SOURCE\}\}/g, cspSource);
      html = html.replace(/\{\{JS_URI\}\}/g,             jsUri.toString());
      html = html.replace(/\{\{GLOBAL_CSS_URI\}\}/g,     globalCssUri.toString());
      html = html.replace(/\{\{INDEX_CSS_URI\}\}/g,      indexCssUri.toString());
      html = html.replace(/\{\{NO_SESSION_CSS_URI\}\}/g, noSessionCssUri.toString());
      html = html.replace('{{NOTE_GROUPS_JS_URI}}', noteGroupsJsUri.toString());
      html = html.replace('{{EDITOR_JS_URI}}',      editorJsUri.toString());

      return html;
    } catch (err) {
      console.error(`[CodeNotes] Erro ao ler ${htmlFile}:`, err);
      return `
        <html><body style="padding:16px;font-family:sans-serif;color:#f48771;">
          <b>Erro ao ler ${htmlFile}</b><br><br>
          Caminho: <code>${htmlPath}</code><br><br>
          ${err}
        </body></html>`;
    }
  }
}