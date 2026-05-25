import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { AuthManager } from './auth/authmanager';
import { detectProject } from './project/projectdetection';
import { AnnotationStore } from './annotation/annotationStore';
import { SidebarProvider } from './sidebar/sidebarProvider';
import { InlineNoteProvider } from './annotation/inLineNoteProvider';
import { AddNoteCodeAction } from './annotation/lightBulbAction';
import { NotePanel } from './annotation/notePanel';
import { CreateNotePanel } from './createNotePanel/createNotePanel';

export async function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "devnotes" is now active!');

  const authManager     = new AuthManager(context.globalState, context);
  const annotationStore = new AnnotationStore(context.globalState, authManager);

  await authManager.waitForRestore();

  // ── NotePanel — shared detail viewer (inline + sidebar) ─────────────────
  const notePanel = new NotePanel(
    annotationStore,
    context,
    authManager,
    () => {
      inlineProvider.refresh();
      sidebarProvider.refresh();
    },  // onDelete: atualiza CodeLens e sidebar após apagar
  );
  context.subscriptions.push({ dispose: () => notePanel.dispose() });

  // ── CreateNotePanel — shared editor (inline + sidebar) ──────────────────
  const createNotePanel = new CreateNotePanel(
    context,
    (text, scope, codeCtx, codeSnippet) => {
      annotationStore.save({
        scope: scope as any,
        type: 'text',
        text,
        ownerId:   authManager.getSession()?.username,
        filePath:  codeCtx?.filePath,
        line:      codeCtx?.line,
        lineEnd:   codeCtx?.lineEnd,
        codeSnippet:   codeSnippet,
        // só guardado quando há filePath — identifica o projecto da nota ancorada
        workspacePath: codeCtx?.filePath
          ? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          : undefined,
      });
      inlineProvider.refresh();
      sidebarProvider.refresh();
    }
  );

  // ── Sidebar ──────────────────────────────────────────────────────────────
  const sidebarProvider = new SidebarProvider(context, authManager, annotationStore, createNotePanel, notePanel);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('devnotesView', sidebarProvider)
  );

  // ── Git detection ────────────────────────────────────────────────────────
  const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
  const git = gitExtension?.getAPI(1);

  git?.onDidOpenRepository((repository: any) => {
    repository.state.onDidChange(async () => {
      if (repository.state.remotes.length > 0) {
        const project = await detectProject();
        if (project) {
          console.log(`Project detected: ${project.owner}/${project.repo} (${project.provider})`);
        } else {
          console.log('No Git repository detected.');
        }
      }
    });
  });

  // ── Inline provider ──────────────────────────────────────────────────────
  const inlineProvider = new InlineNoteProvider(
    annotationStore,
    notePanel,
    () => authManager.isLoggedIn(),
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider('*', inlineProvider),
    vscode.languages.registerHoverProvider('*', inlineProvider),
    vscode.languages.registerCodeActionsProvider(
      '*',
      new AddNoteCodeAction(annotationStore, inlineProvider),
      { providedCodeActionKinds: AddNoteCodeAction.providedCodeActionKinds }
    ),
    vscode.window.onDidChangeActiveTextEditor(() => inlineProvider.applyDecorations()),
    vscode.window.onDidChangeVisibleTextEditors(() => inlineProvider.applyDecorations()),
  );

  // Aplicar decorações ao editor já aberto quando a extensão activa
  inlineProvider.applyDecorations();

  context.subscriptions.push(
    authManager.onDidChangeSession(session => {
      if (!session) {
        inlineProvider.clearAll();
      }
    })
  );

  // ── Commands ─────────────────────────────────────────────────────────────
  context.subscriptions.push(

    vscode.commands.registerCommand('devnotes.signInGitHub', async () => {
      const session = await authManager.loginWithGitHub();
      if (session) {
        vscode.window.showInformationMessage(`Hello, ${session.displayName}!`);
      } else {
        vscode.window.showWarningMessage('Login cancelled.');
      }
    }),

    vscode.commands.registerCommand('devnotes.signInAzure', async () => {
      const session = await authManager.loginWithAzure();
      if (session) {
        vscode.window.showInformationMessage(`Hello, ${session.displayName}!`);
      } else {
        vscode.window.showWarningMessage('Login cancelled.');
      }
    }),

    vscode.commands.registerCommand('devnotes.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World from Teste1!');
    }),

    vscode.commands.registerCommand(
      'devnotes.addNote',
      (document: vscode.TextDocument, range: vscode.Range) => {
        if (!authManager.isLoggedIn()) {
          vscode.window.showWarningMessage('DevNotes: please log in first.');
          return;
        }
        createNotePanel.open({ document, range });
      }
    ),

    vscode.commands.registerCommand(
      'devnotes.deleteNote',
      (id: string) => {
        annotationStore.delete(id);
        inlineProvider.refresh();
        sidebarProvider.refresh();
      }
    ),

    vscode.commands.registerCommand(
      'devnotes.openNote',
      (noteId: string, document?: vscode.TextDocument) => {
        if (!authManager.isLoggedIn()) {
          vscode.window.showWarningMessage('DevNotes: Make log in first.');
          return;
        }
        notePanel.open(noteId, document);
      }
    ),

    vscode.commands.registerCommand('devnotes.clearData', async () => {
      const choice = await vscode.window.showQuickPick(
        [
          { label: '$(lock) Personal notes', description: 'Cleats your private notes (VS Code storage)', value: 'private'},
          { label: '$(lock) Project notes', description: 'Deletes notes.json from the workspace', value: 'public'},
          { label: '$(lock) All notes', description:'Clears both personal and project notes', value: 'all'},
        ],
        {placeHolder: 'What do you want to clear?'}
      );
      if(!choice) {return;}

      if(choice.value === 'private' || choice.value === 'all'){
        context.globalState.update('devnotes.private', undefined);
      }

      if(choice.value === 'public' || choice.value === 'all'){
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if(workspace){
          const dir = path.join(workspace.uri.fsPath, '.devnotes');
          if(fs.existsSync(dir)){
            fs.rmSync(dir, { recursive: true, force: true });
          }
        }
      }
      inlineProvider.refresh();
      sidebarProvider.refresh();
      vscode.window.showInformationMessage('DevNotes: Storage Cleard!');

    }),
    vscode.commands.registerCommand('devnotes.clearSession', () => {
        context.globalState.update('devnotes.session', undefined);
        vscode.window.showInformationMessage('Session cleared, please log in again.');
    }),

    vscode.commands.registerCommand('devnotes.debug', async () => {
      const privateData = context.globalState.get('devnotes.private');
      const projectData = annotationStore.getProject();
      console.log('Private Storage:', JSON.stringify(privateData, null, 2));
      console.log('Project storage:', JSON.stringify(projectData, null, 2));
      const s = await vscode.authentication.getSession('github', ['repo', 'read:user'], { createIfNone: false });
    console.log('account.id:', s?.account.id);
    console.log('account.label:', s?.account.label);
    console.log('stored session:', JSON.stringify(authManager.getSession(), null, 2));
    }),
    vscode.commands.registerCommand('devnotes.debug2', async () => {
      await context.globalState.update('devnotes.session', undefined);
      console.log('session after clear:', authManager.getSession());
      
      const s = await vscode.authentication.getSession('github', ['repo', 'read:user'], { createIfNone: false });
      console.log('account.id:', s?.account.id);
      console.log('account.label:', s?.account.label);
      
      await authManager.loginWithGitHub();
      console.log('session after login:', JSON.stringify(authManager.getSession(), null, 2));
    }),
  );
}

export function deactivate() {}