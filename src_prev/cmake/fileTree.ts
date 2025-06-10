import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CmakeListsParser } from '../cmake/cmakeListsParser';
import { parseQrcContent } from '../common/qrcParser';
import { registerTreeMenuCommands } from '../common/treeMenu';
import { FileTreeItem } from '../common/fileTreeItem';


// 自定义树数据提供者类，实现 vscode.TreeDataProvider 接口
export class FileTreeDataProvider implements vscode.TreeDataProvider<FileTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileTreeItem | undefined | null | void> = new vscode.EventEmitter<FileTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FileTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
  private watcher: vscode.FileSystemWatcher | undefined;

  constructor() {
    this.setupWatcher();
    //注册菜单命令
    registerTreeMenuCommands(this);
  }

  // 刷新树视图
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  // 获取树项
  getTreeItem(element: FileTreeItem): vscode.TreeItem {
    return element;
  }

  // 递归处理文件夹
  private processFolder(folderPath: string): FileTreeItem[] {
    const items: FileTreeItem[] = [];
    let cmakeListFile: FileTreeItem | null = null;
    const headerFiles: FileTreeItem[] = [];
    const sourceFiles: FileTreeItem[] = [];
    const otherFolders: FileTreeItem[] = [];
    const otherFiles: FileTreeItem[] = [];
    const qrcFiles: FileTreeItem[] = [];

    let qmlModuleSources: string[] = [];
    let qmlModuleQmlFiles: string[] = [];
    let qmlModuleResources: string[] = [];

    let resourcesFolder: FileTreeItem



    const cmakeFilePath = path.join(folderPath, 'CMakeLists.txt');
    let qtSources: string[] = [];
    let useQtSources = false;

    if (fs.existsSync(cmakeFilePath)) {
      const cmakeContent = fs.readFileSync(cmakeFilePath, 'utf-8');
      const parser = new CmakeListsParser();
      const sources = parser.parseQtAddExecutableStatement(cmakeContent);
      if (sources) {
        qtSources = sources;
        useQtSources = true;
      }
    }

    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });

      // 分离不同类型的文件和文件夹
      entries.forEach(entry => {
        const fullPath = path.join(folderPath, entry.name);
        if (entry.isDirectory()) {
          const folderItem = new FileTreeItem(entry.name, vscode.TreeItemCollapsibleState.Collapsed, fullPath);
          folderItem.children = this.processFolder(fullPath)
          otherFolders.push(folderItem);
        } else {
          //文件
          if (entry.name === 'CMakeLists.txt') {
            cmakeListFile = new FileTreeItem(entry.name, vscode.TreeItemCollapsibleState.None, fullPath);
          } else if (useQtSources && qtSources.includes(entry.name)) {
            if (path.extname(entry.name) === '.h') {
              const fileItem = new FileTreeItem(entry.name, vscode.TreeItemCollapsibleState.None, fullPath);
              headerFiles.push(fileItem);
            } else {
              const fileItem = new FileTreeItem(entry.name, vscode.TreeItemCollapsibleState.None, fullPath);
              sourceFiles.push(fileItem);
              if (path.extname(entry.name) === '.qrc') {
                qrcFiles.push(fileItem);
                // 避免.qrc文件添加到其他文件中
                return;
              }
            }
          } else if (!useQtSources) {
            if (path.extname(entry.name) === '.h') {
              const fileItem = new FileTreeItem(entry.name, vscode.TreeItemCollapsibleState.None, fullPath);
              headerFiles.push(fileItem);
            } else if (path.extname(entry.name) === '.cpp') {
              const fileItem = new FileTreeItem(entry.name, vscode.TreeItemCollapsibleState.None, fullPath);
              sourceFiles.push(fileItem);
            } else {
              const fileItem = new FileTreeItem(entry.name, vscode.TreeItemCollapsibleState.None, fullPath);
              otherFiles.push(fileItem);
            }
          } else {
            const fileItem = new FileTreeItem(entry.name, vscode.TreeItemCollapsibleState.None, fullPath);
            otherFiles.push(fileItem);
          }
        }
      });

      // 添加 CMakeLists.txt
      if (cmakeListFile) {
        items.push(cmakeListFile);
      }

      // 添加 Header Files 文件夹
      if (headerFiles.length > 0) {
        const headerFolder = new FileTreeItem('Header Files', vscode.TreeItemCollapsibleState.Collapsed, '', folderPath);
        headerFolder.children = headerFiles;
        items.push(headerFolder);
      }

      // 添加 Source Files 文件夹
      if (sourceFiles.length > 0) {
        const sourceFolder = new FileTreeItem('Source Files', vscode.TreeItemCollapsibleState.Collapsed, '', folderPath);
        sourceFolder.children = sourceFiles;
        items.push(sourceFolder);
      }

      // 处理 .qrc 文件
      const qrcFilePaths: string[] = [];
      if (qrcFiles.length > 0) {
        resourcesFolder = new FileTreeItem('Resources', vscode.TreeItemCollapsibleState.Collapsed, '', folderPath);
        qrcFiles.forEach(qrcFile => {
          const qrcFilePath = qrcFile.filePath!;
          const qrcContent = fs.readFileSync(qrcFilePath, 'utf-8');
          const parsedQrc = parseQrcContent(qrcContent);

          const qrcFolder = new FileTreeItem(qrcFile.label, vscode.TreeItemCollapsibleState.Collapsed, '', folderPath);
          parsedQrc.forEach(({ prefix, files }) => {
            const prefixFolder = new FileTreeItem(prefix, vscode.TreeItemCollapsibleState.Collapsed, '', folderPath);
            files.forEach(file => {
              const fileItemPath = path.join(folderPath, file.name);
              qrcFilePaths.push(fileItemPath);
              const fileItem = new FileTreeItem(file.name, vscode.TreeItemCollapsibleState.None, fileItemPath);
              prefixFolder.children.push(fileItem);
            });
            qrcFolder.children.push(prefixFolder);
          });
          resourcesFolder.children.push(qrcFolder);
        });
        items.push(resourcesFolder);
      }

      // 从 otherFiles 中移除在 .qrc 文件里的文件
      const filteredOtherFiles = otherFiles.filter(item => {
        return !qrcFilePaths.includes(item.filePath!);
      });

      // 对文件夹和其他文件分别按字典序排序
      otherFolders.sort((a, b) => a.label.localeCompare(b.label));
      filteredOtherFiles.sort((a, b) => a.label.localeCompare(b.label));

      // 添加其他文件(夹)
      items.push(...otherFolders);
      items.push(...filteredOtherFiles);
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to read directory: ${folderPath}`);
    }

    return items
  }

  // 获取子树项
  getChildren(element?: FileTreeItem): Thenable<FileTreeItem[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showInformationMessage('No workspace is opened.');
      return Promise.resolve([]);
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const cmakeFilePath = path.join(workspaceRoot, 'CMakeLists.txt');

    if (element) {
      if (element.filePath) {
        // 如果传入的是文件夹树项，递归处理其内部结构
        return Promise.resolve(this.processFolder(element.filePath));
      }
      // 如果传入的是分组树项，返回其对应的子文件树项
      return Promise.resolve(element.children);
    }

    return new Promise((resolve) => {
      if (!fs.existsSync(cmakeFilePath)) {
        vscode.window.showInformationMessage('CMakeLists.txt not found in the workspace root.');
        resolve([]);
        return;
      }

      const cmakeContent = fs.readFileSync(cmakeFilePath, 'utf-8');
      const parser = new CmakeListsParser();
      const subdirectories = parser.parseAddSubdirectoryStatement(cmakeContent);

      const treeItems: FileTreeItem[] = [];

      if (subdirectories.length > 0) {
        // 添加根目录下的 CMakeLists.txt 文件
        const rootCmakeList = new FileTreeItem('CMakeLists.txt', vscode.TreeItemCollapsibleState.None, cmakeFilePath);
        treeItems.push(rootCmakeList);

        subdirectories.forEach((subdirectory) => {
          const subDirPath = path.join(workspaceRoot, subdirectory);
          if (fs.existsSync(subDirPath) && fs.statSync(subDirPath).isDirectory()) {
            const groupItem = new FileTreeItem(subdirectory, vscode.TreeItemCollapsibleState.Collapsed, subDirPath);
            groupItem.children = this.processFolder(subDirPath)
            treeItems.push(groupItem);
          }
        });
      } else {
        // 没有子目录，直接处理根目录
        const rootFolderItems = this.processFolder(workspaceRoot)
        treeItems.push(...rootFolderItems);
      }

      resolve(treeItems);
    });
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

  // 清理观察器
  public dispose() {
    if (this.watcher) {
      this.watcher.dispose();
    }
  }
}