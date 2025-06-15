import * as vscode from 'vscode';
import * as path from 'path';
import { getCmakeApiReplyDirectory, parseCodeModelJson, createTreeItemForTargetJson, getBaseName } from './parser';
import { FileTreeItem, createFileTreeItem } from '../common/fileTreeItem';
import { registerTreeMenuCommands } from '../common/treeMenu';
import { treeView } from '../../extension';

// 自定义树数据提供者类，实现 vscode.TreeDataProvider 接口
export class CMakeFileTreeDataProvider implements vscode.TreeDataProvider<FileTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileTreeItem | undefined | null | void> = new vscode.EventEmitter<FileTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FileTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
  private watcher: vscode.FileSystemWatcher | undefined;

  private rootSourceDir: string = ''
  private rootBuildDir: string = ''


  constructor() {
    this.setupWatcher();
    //注册菜单命令
    registerTreeMenuCommands(this);
  }

  // 获取树项
  getTreeItem(element: FileTreeItem): vscode.TreeItem {
    return element;
  }

  private getRootItems(): FileTreeItem[] | undefined {
    const replyDirectory = getCmakeApiReplyDirectory()
    if (!replyDirectory) return
    const codemodelResult = parseCodeModelJson(replyDirectory)
    if (!codemodelResult) return
    const config = codemodelResult.configurations[0]
    //根目录(.)
    this.rootSourceDir = codemodelResult.paths.source
    this.rootBuildDir = codemodelResult.paths.build
    const buildType = config.name
    const targets = config.targets;
    // console.log(targets)
    const rootItems: FileTreeItem[] = []
    let currentIsRoot: boolean = false

    targets.forEach(target => {
      const createResult = createTreeItemForTargetJson(target.jsonFile, this.rootSourceDir, this.rootBuildDir)
      if (!createResult) return
      const [dirItem, isRoot] = createResult
      if (isRoot) {
        //这里后边再细致处理了
        rootItems.push(...dirItem.children)
        currentIsRoot = isRoot
      } else {
        rootItems.push(dirItem)
        //字典序排序
        rootItems.sort((a, b) => a.label.localeCompare(b.label));
      }
    })

    if (!currentIsRoot) {
      //根目录cmakelists
      const rootCmakeListsAbsPath = path.resolve(this.rootSourceDir, 'CMakeLists.txt')
      const rootCmakeListsItem = createFileTreeItem(
        'CMakeLists.txt',
        vscode.TreeItemCollapsibleState.None,
        rootCmakeListsAbsPath
      )
      rootCmakeListsItem && rootItems.unshift(rootCmakeListsItem)
    }
    treeView.title = getBaseName(this.rootSourceDir) + '<' + buildType + '>'
    return rootItems
  }

  getChildren(element?: FileTreeItem | undefined): vscode.ProviderResult<FileTreeItem[]> {
    if (!element) {
      // 返回根项
      return this.getRootItems();
    } else {
      // 返回子项（如果有）
      return element.children || [];
    }
  }

  // 设置文件系统观察器
  private setupWatcher() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      this.watcher = vscode.workspace.createFileSystemWatcher(`${workspaceRoot}/**`);

      this.watcher.onDidCreate(() => this.refresh());
      this.watcher.onDidChange(() => this.refresh());
      this.watcher.onDidDelete(() => this.refresh());
    }
  }

  // 刷新树视图
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  // 清理观察器
  public dispose() {
    if (this.watcher) {
      this.watcher.dispose();
    }
  }
}