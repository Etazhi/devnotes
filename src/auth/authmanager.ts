import * as vscode from 'vscode';
import { AuthSession } from './types';
import { loginWithGitHub } from './gitHubAuthProvider';
import { loginWithAzure } from './azureAuthProvider';

const SESSION_KEY = 'devnotes.session';

export class AuthManager {
  private restorePromise: Promise<void>;  
  private _onDidChangeSession = new vscode.EventEmitter<AuthSession | undefined>();

  readonly onDidChangeSession = this._onDidChangeSession.event;

  constructor(private readonly globalState: vscode.Memento, 
              private readonly extensionContext: vscode.ExtensionContext,
  ) {
    this.restorePromise = this.restoreSession();
    this.registerProviderListeners();  
  }

  waitForRestore(): Promise<void> { 
    return this.restorePromise;
  }

  private registerProviderListeners(): void{
    const gitHubWatcher = vscode.authentication.onDidChangeSessions(async e => {
      if (e.provider.id !== 'github') return;
        await this.handleProviderSessionChange('github');
    });

    const azureWatcher = vscode.authentication.onDidChangeSessions(async e => {
      if (e.provider.id !== 'microsoft') return;
        await this.handleProviderSessionChange('azure');
    });

    this.extensionContext.subscriptions.push(gitHubWatcher,azureWatcher);
  }

  private async handleProviderSessionChange(provider: 'github' | 'azure'): Promise<void> {
    const current = this.getSession();

    if(!current || current.provider !== provider) return;

    const stillActive = await this.isProviderSessionActive(provider);
    if (!stillActive) {
      this.clearSession();
      vscode.window.showWarningMessage(
        `CodeNotes: session ${provider === 'github' ? 'GitHub' : 'Azure'} logged out. Please make the log in and try again.`    
      );
    }
  }

  private async restoreSession(): Promise<void> {
    const stored = this.getSession();

    if (stored){
      const stillActive = await this.isProviderSessionActive(stored.provider);
      if (!stillActive){
        this.clearSession();
      }
      return; 
    }

    const ghSession = await vscode.authentication.getSession(
      'github',
      ['repo', 'read:user'],
      { createIfNone: false }
    );
    if (ghSession) {
      this.persistSession({
        provider: 'github',
        username: ghSession.account.label,
        displayName: ghSession.account.label,
        token: ghSession.accessToken,
      });
      return;
    }

    const azSession = await vscode.authentication.getSession(
      'microsoft',
      ['https://management.azure.com/.default'],
      { createIfNone: false }
    );
    if (azSession) {
      this.persistSession({
        provider: 'azure',
        username: azSession.account.label,
        displayName: azSession.account.label,
        token: azSession.accessToken,
      });
    }
  }

  private async isProviderSessionActive(provider: 'github' | 'azure'): Promise<boolean> {
    if (provider === 'github') {
      const s = await vscode.authentication.getSession(
        'github',
        ['repo', 'read:user'],
        { createIfNone: false }
      );
      return s !== undefined;
    } else {
      const s = await vscode.authentication.getSession(
        'microsoft',
        ['https://management.azure.com/.default'],
        { createIfNone: false }
      );
      return s !== undefined;
    }
  }

  async loginWithGitHub(): Promise<AuthSession | undefined> {
    const session = await loginWithGitHub();
    if (session) this.persistSession(session);
    return session;
  }

  async loginWithAzure(): Promise<AuthSession | undefined> {
    const session = await loginWithAzure();
    if (session) this.persistSession(session);
    return session;
  }

  getSession(): AuthSession | undefined {
    return this.globalState.get<AuthSession>(SESSION_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getSession();
  }

  logout(): void {
    this.clearSession();
  }

  private clearSession(): void{
    this.globalState.update(SESSION_KEY, undefined);
    this._onDidChangeSession.fire(undefined);
  }

  private persistSession(session: AuthSession): void {
    this.globalState.update(SESSION_KEY, session);
    this._onDidChangeSession.fire(session);
  }

  dispose(): void{
    this._onDidChangeSession.dispose();
  }
}