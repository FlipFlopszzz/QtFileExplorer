import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileTreeItem } from './fileTreeItem';

export function registerTreeMenuCommands(provider: any) {
  // 在文件资源管理器中显示
  vscode.commands.registerCommand('qtfileexplorer.revealFileInOS', (treeItem: FileTreeItem) => {
    if (treeItem.filePath) {
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(treeItem.filePath));
    }
  });
  // 重命名
  vscode.commands.registerCommand('qtfileexplorer.renameFile', async (treeItem: FileTreeItem) => {
    if (!treeItem || !treeItem.resourceUri) {
      return;
    }

    const fileToRename = treeItem.resourceUri.fsPath;
    const fullDisplayName = treeItem.label;
    const ext = path.extname(fullDisplayName);
    const baseName = path.basename(fullDisplayName, ext);
    const dirName = path.dirname(fileToRename);

    // 判断是否为.h/.cpp文件
    const isHeader = ext === '.h';
    const isSource = ext === '.cpp';

    // 检查同名的对应文件是否存在
    let relatedFilePath: string | null = null;
    let relatedExt = '';
    if (isHeader) {
      const cppPath = path.join(dirName, baseName + '.cpp');
      if (await fileExists(cppPath)) {
        relatedFilePath = cppPath;
        relatedExt = '.cpp';
      }
    } else if (isSource) {
      const hPath = path.join(dirName, baseName + '.h');
      if (await fileExists(hPath)) {
        relatedFilePath = hPath;
        relatedExt = '.h';
      }
    }

    // 让用户输入新名字
    const newName = await vscode.window.showInputBox({
      value: fullDisplayName,
      prompt: '输入新的文件名',
      placeHolder: '新文件名'
    });

    if (!newName) {
      return;
    }

    // 判断是否需要询问同时重命名对应文件
    let renameRelated = false;
    if (relatedFilePath) {
      const relatedNewName = path.basename(newName, ext) + relatedExt;
      const answer = await vscode.window.showInputBox({
        value: relatedNewName,
        prompt: `检测到有同名${relatedExt}文件，是否一并重命名？（直接回车同意，ESC取消，输入新文件名可修改）`,
        placeHolder: `新${relatedExt}文件名`
      });
      if (answer !== undefined) {
        // 用户未ESC，说明同意
        renameRelated = true;
        // 允许用户修改新文件名
        await doRenameFile(relatedFilePath, path.join(dirName, answer));
      }
    }

    // 主文件重命名
    await doRenameFile(fileToRename, path.join(dirName, newName));
  });

  // 判断文件是否存在
  async function fileExists(filePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return true;
    } catch {
      return false;
    }
  }

  // 执行重命名
  async function doRenameFile(oldPath: string, newPath: string) {
    const oldUri = vscode.Uri.file(oldPath);
    const newUri = vscode.Uri.file(newPath);
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.renameFile(oldUri, newUri, { overwrite: true });
    await vscode.workspace.applyEdit(workspaceEdit);
  }

  vscode.commands.registerCommand('qtfileexplorer.deleteFile', async (treeItem: FileTreeItem) => {
    if (treeItem.filePath) {
      const uri = vscode.Uri.file(treeItem.filePath);
      try {
        await vscode.workspace.fs.delete(uri, { useTrash: true });
      } catch (err) {
        vscode.window.showErrorMessage('Delete Error: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  });

  vscode.commands.registerCommand('qtfileexplorer.newFile', async (treeItem: FileTreeItem) => {
    // 1. 选择目录
    let dirPath = '';
    if (!treeItem) {
      vscode.window.showErrorMessage('未获取到目录节点。');
      return;
    }
    if (treeItem.dir) {
      // 若为文件夹
      dirPath = treeItem.dir;
    } else if (treeItem.resourceUri) {
      const stat = await vscode.workspace.fs.stat(treeItem.resourceUri);
      if (stat.type & vscode.FileType.Directory) {
        dirPath = treeItem.resourceUri.fsPath;
      } else {
        dirPath = path.dirname(treeItem.resourceUri.fsPath);
      }
    } else if (treeItem.dir) {
      dirPath = treeItem.dir;
    } else {
      vscode.window.showErrorMessage('无法获取目录路径。');
      return;
    }

    // 2. 输入文件名
    const fileName = await vscode.window.showInputBox({
      prompt: '请输入新文件名（如 test.cpp 或 test.h）',
      placeHolder: '文件名'
    });
    if (!fileName) return;

    const targetPath = path.join(dirPath, fileName);
    const ext = path.extname(fileName).toLowerCase();
    const baseName = path.basename(fileName, ext);

    // 3. 检查并询问是否需要创建配对文件
    let needPair = false;
    let pairExt = '';
    let pairFileName = '';
    let pairPath = '';

    if (ext === '.h') {
      pairExt = '.cpp';
      pairFileName = baseName + pairExt;
      pairPath = path.join(dirPath, pairFileName);
      const answer = await vscode.window.showQuickPick(
        [`是，同时创建 ${pairFileName}`, '否，仅创建头文件'],
        { placeHolder: `是否要同时创建 ${pairFileName}？` }
      );
      needPair = answer?.startsWith('是') ?? false;
    } else if (ext === '.cpp') {
      pairExt = '.h';
      pairFileName = baseName + pairExt;
      pairPath = path.join(dirPath, pairFileName);
      const answer = await vscode.window.showQuickPick(
        [`是，同时创建 ${pairFileName}`, '否，仅创建源文件'],
        { placeHolder: `是否要同时创建 ${pairFileName}？` }
      );
      needPair = answer?.startsWith('是') ?? false;
    }

    // 4. 写入主文件内容
    if (ext === '.h') {
      await writeFileWithContent(targetPath, genHeaderContent(baseName));
    } else if (ext === '.cpp') {
      await writeFileWithContent(targetPath, genCppContent(baseName));
    } else {
      await writeFileWithContent(targetPath, ''); // 其它文件为空
    }

    // 5. 写入配对文件内容
    if (needPair) {
      if (pairExt === '.h') {
        await writeFileWithContent(pairPath, genHeaderContent(baseName));
      } else if (pairExt === '.cpp') {
        await writeFileWithContent(pairPath, genCppContent(baseName));
      }
    }

    // 6. 打开新建的主文件
    const doc = await vscode.workspace.openTextDocument(targetPath);
    vscode.window.showTextDocument(doc);
  });
}

// 写文件（存在则不覆盖）
async function writeFileWithContent(filePath: string, content: string) {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    vscode.window.showWarningMessage(`文件 ${path.basename(filePath)} 已存在，未覆盖。`);
  } catch {
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(filePath),
      Buffer.from(content, 'utf8')
    );
  }
}

// 生成头文件内容
function genHeaderContent(baseName: string) {
  const macro = baseName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase() + '_H';
  return (
    `#ifndef ${macro}\n` +
    `#define ${macro}\n\n` +
    `\n` +
    `#endif // ${macro}\n`
  );
}

// 生成cpp文件内容
function genCppContent(baseName: string) {
  return `#include "${baseName}.h"\n\n`;
}

/*1.删除
  2.重命名（h+cpp）
  3.文件资源管理器中显示
  4.新建文件(h+cpp)
*/