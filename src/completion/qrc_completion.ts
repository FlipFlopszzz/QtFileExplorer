import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

function getFilesAndDirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function resolveInputPath(input: string, workspaceRoot: string, currentFileDir: string): string {
  if (input.match(/^[a-zA-Z]:[\\/]/)) {
    // Windows绝对路径
    return path.resolve(input);
  } else if (input.startsWith('/')) {
    // UNIX绝对路径
    return input;
  } else if (input.startsWith('./')) {
    return path.resolve(currentFileDir, input.slice(2));
  } else if (input.startsWith('../')) {
    return path.resolve(currentFileDir, input);
  } else {
    // 默认相对于当前目录
    return path.resolve(currentFileDir, input);
  }
}

export class QrcCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[]> {
    const line = document.lineAt(position.line).text;
    const cursor = position.character;
    const left = line.lastIndexOf('<file>', cursor);
    const right = line.indexOf('</file>', cursor);

    if (left === -1 || (right !== -1 && right < cursor)) {
      return undefined;
    }

    const fileTagStart = left + '<file>'.length;
    const input = line.slice(fileTagStart, cursor).trim();

    const currentFileDir = path.dirname(document.uri.fsPath);
    const wsFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = wsFolders && wsFolders.length > 0 ? wsFolders[0].uri.fsPath : currentFileDir;

    let baseDir = '';
    let partial = '';

    const lastSlash = Math.max(input.lastIndexOf('/'), input.lastIndexOf('\\'));
    if (lastSlash !== -1) {
      baseDir = resolveInputPath(input.slice(0, lastSlash + 1), workspaceRoot, currentFileDir);
      partial = input.slice(lastSlash + 1);
    } else {
      baseDir = currentFileDir;
      partial = input;
    }

    const partialLower = partial.toLowerCase();
    let items: vscode.CompletionItem[] = [];
    const filesAndDirs = getFilesAndDirs(baseDir);

    for (const name of filesAndDirs) {
      if (!name.toLowerCase().startsWith(partialLower)) continue;
      let fullPath = path.join(baseDir, name);
      let stat: fs.Stats;
      stat = fs.statSync(fullPath);
      const kind = stat.isDirectory() ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File;
      let item = new vscode.CompletionItem(name, kind);
      item.insertText = stat.isDirectory() ? name + '/' : name;
      if (stat.isDirectory()) {
        item.command = { title: 'Trigger Suggest', command: 'editor.action.triggerSuggest' };
      }
      items.push(item);
    }
    return items;
  }
}