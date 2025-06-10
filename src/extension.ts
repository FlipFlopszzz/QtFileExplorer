import * as vscode from 'vscode';
import { FileTreeDataProvider } from './explorer/fileTree';
import { CMakeFileTreeDataProvider } from './cmake/fileTree';

export function activate(context: vscode.ExtensionContext) {
  // const fileTreeDataProvider = new FileTreeDataProvider();
  const fileTreeDataProvider = new CMakeFileTreeDataProvider();
  const treeView = vscode.window.createTreeView('qtfileexplorer.explorer', {
    treeDataProvider: fileTreeDataProvider,
    showCollapseAll: true,
    canSelectMany: false
  });
  // treeView.title = 'qwewqeq'
  context.subscriptions.push({
    dispose: () => fileTreeDataProvider.dispose()
  });
  context.subscriptions.push(treeView);
}

// const filePaths = [
//   'D:/FluentUI/qhotkey/qhotkey.cpp',
//   'D:/FluentUI/qhotkey/qhotkey.h',
//   'D:/FluentUI/FluentIconDef.h',
//   'D:/FluentUI/FluWatermark.h'
// ];


// const items = buildFileTree(filePaths, 'D:/FluentUI', 'Header Files');
// console.log(items)

import { getCmakeApiReplyDirectory, findJsonFileByPrefix, parseCodeModelJson, parseTargetJson } from './cmake/parser';

// let a = getCMakeBuildDirectory()

// let a = getCmakeApiReplyDirectory()
// console.log(a)
// let b
// if (a) { b = findJsonFileByPrefix(a, 'codemodel-v2-') }
// console.log(b)

// const c = parseCodeModelJson("d:\\Qt_proj\\FluentDownloader\\build\\Desktop_Qt_6_6_2_MinGW_64_bit-Release\\.cmake\\api\\v1\\reply\\codemodel-v2-69e790d1782dc75a5f2d.json")
// console.log(c)

// const d = parseTargetJson("D:\\Qt_proj\\FluentDownloader\\build\\.cmake\\api\\v1\\reply\\target-FluentDownloader-Release-5b788f2571fd1b5dc7a3.json", 'D:\\Qt_proj\\FluentDownloader', 'D:\\Qt_proj\\FluentDownloader\\build')

// const d = parseTargetJson("D:\\Qt_proj\\FluentDownloader\\build\\.cmake\\api\\v1\\reply\\target-fluentuiplugin-Release-f9cc854424a2f6080118.json", 'D:\\Qt_proj\\FluentDownloader', 'D:\\Qt_proj\\FluentDownloader\\build')

// const d = parseTargetJson("D:\\Qt_proj\\OneDownloader\\build\\.cmake\\api\\v1\\reply\\target-OneDownloader-Debug-fa0b4964b6e2af5c33af.json", 'D:\\Qt_proj\\OneDownloader', 'D:\\Qt_proj\\OneDownloader\\build')
// console.log(d)
// const d_ = d?.[0].sourceGroups[2]!
// const d__ = d?.[1]!
// const f = createTreeItemForSourceGroup(d_, d__)
// console.log(f)