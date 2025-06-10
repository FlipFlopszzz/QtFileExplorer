import * as vscode from 'vscode';
import { FileTreeDataProvider } from './cmake/fileTree';

export function activate(context: vscode.ExtensionContext) {
  const fileTreeDataProvider = new FileTreeDataProvider();
  const treeView = vscode.window.createTreeView('qtfileexplorer.explorer', {
    treeDataProvider: fileTreeDataProvider,
    showCollapseAll: true,
    canSelectMany: false
  });
  context.subscriptions.push({
    dispose: () => fileTreeDataProvider.dispose()
  });
  context.subscriptions.push(treeView);
}