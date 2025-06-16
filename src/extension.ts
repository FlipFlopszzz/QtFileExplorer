import * as vscode from 'vscode';
import { CMakeFileTreeDataProvider } from './explorer/cmake/fileTree';
import { QrcCompletionItemProvider } from './completion/qrc_completion';
import { QrcDefinitionProvider } from './definition/qrc_definition';

const fileTreeDataProvider = new CMakeFileTreeDataProvider();
export const treeView = vscode.window.createTreeView('qtfileexplorer.explorer', {
  treeDataProvider: fileTreeDataProvider,
  showCollapseAll: true,
  canSelectMany: false
});

vscode.window.onDidChangeActiveTextEditor(editor => {
  if (editor && editor.document) {
    const filePath = editor.document.uri.fsPath;
    const element = fileTreeDataProvider.findElementByPath(filePath);
    if (element) {
      console.log(element)
      treeView.reveal(element, { select: true, focus: false, expand: true });
    }
  }
});

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push({
    dispose: () => fileTreeDataProvider.dispose()
  });
  context.subscriptions.push(treeView);
  const qrcCompletionProvider = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: 'qrc' },
    new QrcCompletionItemProvider(),
    '/',
    '\\'
  );
  context.subscriptions.push(qrcCompletionProvider);
  const qrcDefinitionProvider = vscode.languages.registerDefinitionProvider(
    { scheme: 'file', language: 'qrc' },
    new QrcDefinitionProvider()
  );
  context.subscriptions.push(qrcDefinitionProvider)
}

//3.qmake，xmake支持 4.qrc跳转文件和补全 5.根目录逻辑完善 6.qrc多层读取，嵌套文件等 7.cmakelists自动修改