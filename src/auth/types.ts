export type Provider = 'github' | 'azure';

export interface AuthSession {
  provider: Provider;
  username: string;
  displayName: string;
  token: string;
}