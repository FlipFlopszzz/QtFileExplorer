import * as vscode from 'vscode';
import { CMakeFileTreeDataProvider } from './explorer/cmake/fileTree';
import { QrcCompletionItemProvider } from './completion/qrc_completion';

const fileTreeDataProvider = new CMakeFileTreeDataProvider();
export const treeView = vscode.window.createTreeView('qtfileexplorer.explorer', {
  treeDataProvider: fileTreeDataProvider,
  showCollapseAll: true,
  canSelectMany: false
});

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push({
    dispose: () => fileTreeDataProvider.dispose()
  });
  context.subscriptions.push(treeView);
  const disposable = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'qrc' },
    new QrcCompletionItemProvider(),
    '/',
    '\\'
  );
  context.subscriptions.push(disposable);
}

//3.qmake，xmake支持 4.qrc跳转文件和补全 5.根目录逻辑完善 6.qrc多层读取，嵌套文件等 7.cmakelists自动修改