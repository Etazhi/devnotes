import * as vscode from 'vscode';
import { AuthSession } from './types';

export async function loginWithGitHub(): Promise<AuthSession | undefined> {
  const vsSession = await vscode.authentication.getSession(
    'github',
    ['repo', 'read:user'],
    { createIfNone: true }
  );

  if (!vsSession) return undefined;

  return {
    provider: 'github',
    username: vsSession.account.label,
    displayName: vsSession.account.label,
    token: vsSession.accessToken,
  };
}

export async function isGithLoged() {
  const session = await vscode.authentication.getSession(
    'github',
    ['repo', 'read:user'],
    { createIfNone: false }
  );
  return session !== undefined;
}