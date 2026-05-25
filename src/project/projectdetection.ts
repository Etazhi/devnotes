import * as vscode from 'vscode'; 

export interface ProjectInfo {
    repoRoot: string;
    remoteUrl: string; 
    owner: string;
    repo: string; 
    provider: 'github' | 'azure' | 'unknown'; 
}

export async function detectProject(): Promise<ProjectInfo | undefined> {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  console.log('gitExtension:', gitExtension);
  if (!gitExtension) { return undefined; }

  const git = gitExtension.exports.getAPI(1);
  console.log('repositórios:', git.repositories.length);
  const repository = git.repositories[0];
  if (!repository) { return undefined; }

  const remoteUrl: string = repository.state.remotes[0]?.fetchUrl ?? '';
  console.log('remotes:', JSON.stringify(repository.state.remotes));
  console.log('remoteUrl:', remoteUrl);
  if (!remoteUrl) { return undefined; }

  return parceRemoteUrl(remoteUrl, repository.rootUri.fsPath);
}

function parceRemoteUrl(remoteUrl: string, repoRoot: string): ProjectInfo | undefined {
  const github = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (github) {
    return { repoRoot, remoteUrl, owner: github[1], repo: github[2], provider: 'github' };
  }

  // Azure DevOps
  const azure = remoteUrl.match(/dev\.azure\.com\/([^/]+)\/([^/]+)/);
  if (azure) {
    return { repoRoot, remoteUrl, owner: azure[1], repo: azure[2], provider: 'azure' };
  }

  return undefined;
}