import * as vscode from 'vscode';
import { AuthSession } from './types';

export async function loginWithAzure(): Promise<AuthSession | undefined> {
  const vsSession = await vscode.authentication.getSession(
    'microsoft',
    ['https://management.azure.com/.default'],
    { createIfNone: true }
  );

  if (!vsSession) return undefined;

  return {
    provider: 'azure',
    username: vsSession.account.label,
    displayName: vsSession.account.label,
    token: vsSession.accessToken,
  };
}

export async function isAzureLoged() {
  const session = await vscode.authentication.getSession(
    'microsoft',
    ['https://management.azure.com/.default'],
    { createIfNone: false }
  );
  return session !== undefined;
}