import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

export class NotesJsonDetector {
    private watcher: vscode.FileSystemWatcher | undefined;
    private onDetectCallback: ((path:string)=> void) | undefined;
    private onRemoveCallback: (() => void) | undefined;

    check(): boolean {
        const workspace = vscode.workspace.workspaceFolders?.[0];

        if(!workspace) return false;

        const notePath = path.join(workspace.uri.fsPath, 'notes.json');
        return fs.existsSync(notePath);
    }   

    startWatching(
        context: vscode.ExtensionContext,
        onDetect: (path: string) => void,
        onRemove: () => void
    ): void{
        this.onDetectCallback = onDetect; 
        this.onRemoveCallback = onRemove;

        const workspace = vscode.workspace.workspaceFolders?.[0];

        if(!workspace) return;
        
        const pattern = new vscode.RelativePattern(workspace, 'notes.json');

        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.watcher.onDidCreate((uri) => {
            if(this.isAtRoot(uri)){
                console.log('[Json Detector] notes.json Created');
            }
        });

        this.watcher.onDidChange((uri) => {
            if(this.isAtRoot(uri)){
                console.log('[Json Detector] notes.json Changed');
                this.onDetectCallback?.(uri.fsPath);
            }
        });

        this.watcher.onDidDelete((uri) => {
            if(this.isAtRoot(uri)){
                console.log('[Json Detector] notes.json Deleted');
                this.onRemoveCallback?.();
            }
        });

        context.subscriptions.push(this.watcher);
    }

    stopWatching(): void{
        this.watcher?.dispose();
        this.watcher = undefined;
    }
    
    private isAtRoot(uri: vscode.Uri): boolean{
        const workspace = vscode.workspace.getWorkspaceFolder(uri);
        if(!workspace) return false; 

        const rootPath = path.normalize(workspace.uri.fsPath);
        const fileDir = path.normalize(path.dirname(uri.fsPath));

        return rootPath === fileDir;
    }
}

