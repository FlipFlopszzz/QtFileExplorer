import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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

export class QrcDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
    const line = document.lineAt(position.line).text;
    const cursor = position.character;

    const left = line.lastIndexOf('<file>', cursor);
    const right = line.indexOf('</file>', cursor);

    if (left === -1 || (right !== -1 && right < cursor)) {
      return undefined;
    }

    const fileTagStart = left + '<file>'.length;
    const fileTagEnd = right === -1 ? line.length : right;

    // 只在文件名区间才高亮和跳转
    if (cursor < fileTagStart || cursor > fileTagEnd) {
      return undefined;
    }

    const input = line.slice(fileTagStart, fileTagEnd).trim();
    if (!input) {
      return undefined;
    }

    const currentFileDir = path.dirname(document.uri.fsPath);
    const wsFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = wsFolders && wsFolders.length > 0 ? wsFolders[0].uri.fsPath : currentFileDir;
    const resolvedPath = resolveInputPath(input, workspaceRoot, currentFileDir);

    if (!fs.existsSync(resolvedPath)) {
      return undefined;
    }

    // 只高亮文件名部分
    const range = new vscode.Range(position.line, fileTagStart, position.line, fileTagEnd);
    const uri = vscode.Uri.file(resolvedPath);

    // 返回 LocationLink，能让下划线只在文件名整体上出现
    const locationLink: vscode.LocationLink = {
      originSelectionRange: range,
      targetUri: uri,
      targetRange: new vscode.Range(0, 0, 0, 0)
    };

    return [locationLink];
  }
}