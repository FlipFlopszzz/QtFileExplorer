import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getBaseName } from '../cmake/parser';

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
    if (this.filePath && path.extname(getBaseName(this.filePath, true)) === '.qrc') this.contextValue = 'qrcFile'
    //icon
    if (collapsibleState === 0) {
      this.iconPath = vscode.ThemeIcon.File
    } else {
      this.iconPath = vscode.ThemeIcon.Folder
      if (this.contextValue === 'qrcFile') {
        this.iconPath = vscode.ThemeIcon.File
      }
    }

    if (filePath) {
      if (!fs.existsSync(filePath)) {
        console.log(filePath)
        return;
      }
      this.resourceUri = vscode.Uri.file(filePath);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile() && this.contextValue !== 'qrcFile') {
          this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [this.resourceUri]
          };
        }
      } catch {
      }
    }
  }
}

export function createFileTreeItem(label: string, collapsibleState: vscode.TreeItemCollapsibleState, filePath?: string, dir?: string): FileTreeItem | undefined {
  if (filePath && !fs.existsSync(filePath)) return
  return new FileTreeItem(label, collapsibleState, filePath, dir)
}