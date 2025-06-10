import * as vscode from 'vscode';
import * as fs from 'fs';
/**
 * 自定义树项类，继承自 vscode.TreeItem
 */
export class FileTreeItem extends vscode.TreeItem {
  public children: FileTreeItem[] = [];
  public menu: any[] = []
  public iconPath = vscode.ThemeIcon.File;

  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly filePath?: string,
    public readonly dir?: string
  ) {
    super(label, collapsibleState);
    //icon
    if (collapsibleState === 0) {
      this.iconPath = vscode.ThemeIcon.File
      // this.contextValue = 'file'
    } else if (collapsibleState === 1) {
      this.iconPath = vscode.ThemeIcon.Folder
      // this.contextValue = 'folder'
    }

    if (filePath) {
      this.resourceUri = vscode.Uri.file(filePath)
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [vscode.Uri.file(filePath)],
          };
        }
      } catch (err) {
        const error = err as NodeJS.ErrnoException;
        vscode.window.showErrorMessage(`Error checking file type: ${error.message}`);
      }
    }
  }
}