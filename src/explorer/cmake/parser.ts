import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { CMakeCodeModelResult, CMakeConfiguration, CMakeDirectory, CMakeProject, CMakeTarget, SourceGroup, SourceItem, TargetJsonResult } from "./interfaces"
import { createFileTreeItem, FileTreeItem } from '../common/fileTreeItem';
import { parseQrcContent } from '../common/qrcParser';
// 错误消息常量
const ERROR_MESSAGES = {
  NO_WORKSPACE: '未打开工作区文件夹',
  NO_BUILD_DIR: '无法确定CMake构建目录',
  INVALID_PATH: '路径配置无效'
};

/**
 * 解析VSCode变量引用
 * @param input 包含变量的输入字符串
 * @returns 替换后的字符串
 */
function resolveVSCodeVariables(input: string): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return input;
  }

  const activeEditor = vscode.window.activeTextEditor;
  const firstWorkspaceFolder = workspaceFolders[0];

  // 变量映射表
  const variables: { [key: string]: string } = {
    'workspaceFolder': firstWorkspaceFolder.uri.fsPath,
    'workspaceFolderBasename': path.basename(firstWorkspaceFolder.uri.fsPath),
    'file': activeEditor?.document.uri.fsPath || '',
    'relativeFile': activeEditor?.document.uri.fsPath
      ? path.relative(firstWorkspaceFolder.uri.fsPath, activeEditor.document.uri.fsPath)
      : '',
    'relativeFileDirname': activeEditor?.document.uri.fsPath
      ? path.relative(firstWorkspaceFolder.uri.fsPath, path.dirname(activeEditor.document.uri.fsPath))
      : '',
    'fileBasename': activeEditor?.document.fileName || '',
    'fileBasenameNoExtension': activeEditor?.document.fileName
      ? path.basename(activeEditor.document.fileName, path.extname(activeEditor.document.fileName))
      : '',
    'fileDirname': activeEditor?.document.uri.fsPath
      ? path.dirname(activeEditor.document.uri.fsPath)
      : '',
    'fileExtname': activeEditor?.document.fileName
      ? path.extname(activeEditor.document.fileName)
      : '',
    'cwd': firstWorkspaceFolder.uri.fsPath,
    'lineNumber': activeEditor?.selection.active.line.toString() || '0',
    'selectedText': activeEditor?.document.getText(activeEditor.selection) || '',
    'execPath': process.execPath,
    'pathSeparator': path.sep,
    'home': os.homedir(),
    'userHome': os.homedir()
  };

  // 替换变量
  let resolvedPath = input;
  for (const [variable, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\$\\{${variable}\\}`, 'g');
    resolvedPath = resolvedPath.replace(regex, value);
  }

  // 处理多根工作区的情况
  if (workspaceFolders.length > 1) {
    for (let i = 0; i < workspaceFolders.length; i++) {
      const folder = workspaceFolders[i];
      const regex = new RegExp(`\\$\\{workspaceFolder:${folder.name}\\}`, 'g');
      resolvedPath = resolvedPath.replace(regex, folder.uri.fsPath);
    }
  }

  return resolvedPath;
}

/**
 * 解析并规范化路径（处理变量、转为绝对路径）
 * @param pathInput 输入路径
 * @param baseDir 基础目录（用于相对路径）
 * @returns 规范化后的绝对路径或null
 */
function resolveAndNormalizePath(pathInput: string, baseDir?: string): string | undefined {
  if (!pathInput || typeof pathInput !== 'string') {
    return;
  }

  // 解析VSCode变量
  const resolvedPath = resolveVSCodeVariables(pathInput);

  // 检查路径是否有效
  if (!resolvedPath.trim()) {
    return;
  }

  // 转换为绝对路径
  let absolutePath: string;
  if (path.isAbsolute(resolvedPath)) {
    absolutePath = resolvedPath;
  } else {
    // 使用提供的基础目录或工作区根目录
    const rootDir = baseDir ||
      (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '');

    if (!rootDir) {
      return;
    }

    absolutePath = path.resolve(rootDir, resolvedPath);
  }

  return absolutePath;
}

/**
 * 检查路径是否存在且为目录
 * @param path 路径
 * @returns 是否存在且为目录
 */
function directoryExists(path: string): boolean {
  try {
    return fs.statSync(path).isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * 获取CMake构建目录的绝对路径
 * @returns 构建目录的绝对路径或null
 */
function getCMakeBuildDirectory(): string | undefined {
  // 读取扩展配置
  const extensionConfig = vscode.workspace.getConfiguration('qtFileExplorer');
  const buildDirSetting = extensionConfig.get<string>('cmakeBuildDirectory');

  // 特殊值处理
  if (buildDirSetting === 'cmake.buildDirectory') {
    // 使用CMake扩展的配置
    const cmakeConfig = vscode.workspace.getConfiguration('cmake');
    const cmakeBuildDir = cmakeConfig.get<string>('buildDirectory');

    if (!cmakeBuildDir) {
      // console.warn(ERROR_MESSAGES.NO_BUILD_DIR);
      return;
    }

    return resolveAndNormalizePath(cmakeBuildDir);
  } else {
    // 使用用户自定义路径
    return resolveAndNormalizePath(buildDirSetting || '');
  }
}

/**
 * 获取CMake API reply目录的绝对路径
 * @returns API reply目录的绝对路径或null
 */
function getCmakeApiReplyDirectory(): string | undefined {
  const buildDir = getCMakeBuildDirectory();

  if (!buildDir) {
    vscode.window.showErrorMessage(ERROR_MESSAGES.NO_BUILD_DIR);
    return;
  }

  // 拼接路径
  const apiReplyPath = path.join(buildDir, '.cmake', 'api', 'v1', 'reply');

  // 可选：检查目录是否存在
  if (!directoryExists(apiReplyPath)) {
    vscode.window.showErrorMessage(`CMake API reply目录不存在: ${apiReplyPath}`);
    return;
  }

  return apiReplyPath;
}

/**
 * 在指定目录下查找符合前缀+哈希格式的JSON文件
 * @param directory 要搜索的目录路径
 * @param prefix 文件名前缀
 * @returns 匹配的JSON文件的绝对路径，未找到时返回null
 */
function findJsonFileByPrefix(directory: string, prefix: string): string | undefined {
  // 验证输入目录
  if (!directory || !fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    console.warn(`目录不存在或无效: ${directory}`);
    return;
  }

  // 构建匹配正则表达式：prefix + 任意哈希字符 + .json
  // 哈希部分匹配常见的字母数字组合（至少3个字符）
  const filePattern = new RegExp(`^${escapeRegExp(prefix)}[a-zA-Z0-9]{3,}\\.(json)$`, 'i');

  try {
    // 读取目录内容并过滤匹配的文件
    const files = fs.readdirSync(directory);
    const match = files.find(file => filePattern.test(file));

    if (match) {
      return path.resolve(directory, match);
    } else {
      console.info(`未找到匹配 ${prefix}+哈希.json 格式的文件`);
      return;
    }
  } catch (error) {
    console.error(`读取目录失败: ${directory}`, error);
    return;
  }
}

/**
 * 转义正则表达式中的特殊字符
 * @param text 要转义的文本
 * @returns 转义后的正则表达式字符串
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 读取并解析JSON文件，按严格要求提取指定字段
 * @param jsonPath JSON文件绝对路径
 * @returns 处理后的对象，失败返回null
 */
function parseCodeModelJson(replyDirectory: string): CMakeCodeModelResult | undefined {
  const jsonPath = findJsonFileByPrefix(replyDirectory, 'codemodel-v2-')
  if (!jsonPath || !fs.existsSync(jsonPath) || !fs.statSync(jsonPath).isFile()) {
    console.error(`文件不存在或无效: ${jsonPath}`);
    return;
  }

  try {
    const content = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(content);

    if (!Array.isArray(data.configurations) || data.configurations.length === 0) {
      console.error('configurations字段不存在或为空数组');
      return;
    }

    // 处理每个configuration
    const processedConfigs: CMakeConfiguration[] = data.configurations.map((config: any) => {
      // 1. 提取directories结构
      const directories: CMakeDirectory[] = (config.directories || []).map((dir: any) => {
        const directory: CMakeDirectory = {
          build: dir.build,
          source: dir.source
        };
        // 仅当存在时添加parentIndex字段
        if (dir.hasOwnProperty('parentIndex')) {
          directory.parentIndex = dir.parentIndex;
        }
        return directory;
      });

      // 2. 提取构建类型name
      const buildType = config.name || 'Unknown';

      // 3. 提取projects的name组成数组
      const projectNames = (config.projects || []).map((proj: CMakeProject) => proj.name || '');

      // 4. 筛选targets中name匹配projectNames的项
      const matchedTargets: CMakeTarget[] = (config.targets || [])
        .filter((target: any) => projectNames.includes(target.name))
        .map((target: any) => ({
          name: target.name,
          jsonFile: getNormalizedAbsPath(replyDirectory, target.jsonFile)
        }));

      // 返回符合CMakeConfiguration接口的对象
      return {
        directories,
        name: buildType,
        projects: projectNames,
        targets: matchedTargets
      };
    });

    // 构建最终结果，使用类型断言确保类型匹配
    const { configurations, ...otherFields } = data;
    return {
      configurations: processedConfigs,
      ...otherFields
    } as CMakeCodeModelResult;
  } catch (error: any) {
    console.error(`JSON解析失败: ${error.message}`);
    return;
  }
}

/**
 * 解析target-xxx-<buildType>文件
 * @param jsonPath json文件绝对路径
 * @param rootSourceDir 根部源文件目录
 * @param rootBuildDir 根部构建目录
 * @returns 解析结果(包括target包含的文件)，target所在子/根目录，是否为根节点的标志位
 */
function parseTargetJson(jsonPath: string, rootSourceDir: string, rootBuildDir: string): [TargetJsonResult, string, boolean] | undefined {
  /**
   * 示例：
   * rootSourceDir: D:/proj
   * rootBuildDir:  D:/proj/build
   * currentSourceDir: D:/proj/src
   * currentBuildDir:  D:/proj/build/src
   * source.path: src/main.cpp
   * 所以要用rootSourceDir+source.path拼接
   */
  if (!fs.existsSync(jsonPath) || !fs.statSync(jsonPath).isFile()) {
    console.error(`文件无效: ${jsonPath}`);
    return;
  }

  try {
    const content = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(content);

    const currentBuildDir = getNormalizedAbsPath(rootBuildDir, data.paths.build)
    const currentSourceDir = getNormalizedAbsPath(rootSourceDir, data.paths.source)
    const isRoot = isSamePath(rootSourceDir, currentSourceDir)

    // 使用接口直接构建返回对象
    const result: TargetJsonResult = {
      type: data.type,
      name: data.name,
      paths: { build: currentBuildDir, source: currentSourceDir },
      sourceGroups: []
    };

    const sources: SourceItem[] = data.sources || [];

    // 定义期望的组名顺序
    const groupOrder: string[] = ['Header Files', 'Source Files', 'Resources'];

    // 收集并合并资源组
    const resourcesGroup: SourceGroup = (data.sourceGroups || [])
      .filter((g: SourceGroup) => g.name === 'Resources' || g.name === '')
      .reduce((merged: SourceGroup, group: SourceGroup) => {
        merged.sourceIndexes.push(...group.sourceIndexes);
        return merged;
      }, { name: 'Resources', sourceIndexes: [] } as SourceGroup);

    // 收集并过滤其他组
    const otherGroups = (data.sourceGroups || [])
      .filter((g: SourceGroup) => g.name === 'Header Files' || g.name === 'Source Files');

    // 按顺序排列并过滤空组
    const mergedGroups = groupOrder
      .map(name => {
        if (name === 'Resources') return resourcesGroup;
        return otherGroups.find((g: SourceGroup) => g.name === name) || undefined;
      })
      .filter((g: SourceGroup) => g !== null && g.sourceIndexes.length > 0);

    mergedGroups.forEach((group: SourceGroup) => {
      const matchedSources = group.sourceIndexes
        .map((idx) => sources[idx])
        .filter((source): source is SourceItem =>
          source !== undefined &&
          !source.isGenerated &&
          isPathInDirectory(
            getNormalizedAbsPath(rootSourceDir, source.path),
            currentSourceDir
          ) &&
          !isPathInDirectory(
            getNormalizedAbsPath(rootSourceDir, source.path),
            currentBuildDir
          )
        )
        .map((source) => {
          return getNormalizedAbsPath(rootSourceDir, source.path);
        });

      group.sources = matchedSources;
    });

    // 3. 组装结果
    result.sourceGroups = mergedGroups;
    return [result, currentSourceDir, isRoot];
  } catch (error: any) {
    console.error(`解析失败: ${error.message}`);
    return;
  }
}

/**
 * 为Resources分组创建树节点
 * @param group Resources分组
 * @param currentSourceDir 当前所在源文件目录
 * @returns Resources目录节点，Resources分组中去除掉放入qrc内部的剩余文件的绝对路径数组
 */
function createTreeItemForResourcesGroup(group: SourceGroup, currentSourceDir: string): [FileTreeItem, string[]] | undefined {
  //滤除空的分组
  if (!group.sources || group.sources.length === 0 || group.name !== 'Resources') {
    return
  }
  const groupItem = createFileTreeItem(
    group.name,
    vscode.TreeItemCollapsibleState.Collapsed,
    '',
    currentSourceDir
  )
  if (!groupItem) return
  const qrcFiles: string[] = findFilesByExtension('.qrc', group.sources)
  if (qrcFiles.length === 0) return
  //用于后续从sources数组中排除掉被放到resources分组中的文件
  const resourceFiles: string[] = []
  qrcFiles.forEach((qrcFile, index) => {
    const qrcContent = fs.readFileSync(qrcFile, 'utf-8');
    const parsedQrcContent = parseQrcContent(qrcContent);
    const qrcFolderItem = createFileTreeItem(getBaseName(qrcFile, true), vscode.TreeItemCollapsibleState.Collapsed, qrcFile);
    if (!qrcFolderItem) return
    resourceFiles.push(qrcFile)
    parsedQrcContent.forEach(({ prefix, files }) => {
      const prefixFolderItem = createFileTreeItem(prefix, vscode.TreeItemCollapsibleState.Collapsed, '', currentSourceDir);
      if (!prefixFolderItem) return
      files.forEach(file => {
        const fileAbsPath = getNormalizedAbsPath(currentSourceDir, file.name);
        resourceFiles.push(fileAbsPath);
        //alias和name后边再处理
        const fileItem = createFileTreeItem(file.name, vscode.TreeItemCollapsibleState.None, fileAbsPath);
        if (!fileItem) return
        prefixFolderItem.children.push(fileItem);
      });
      qrcFolderItem.children.push(prefixFolderItem);
    });
    groupItem.children.push(qrcFolderItem)
  })
  const resourceFiles_set = new Set(resourceFiles)
  const otherFiles = group.sources.filter(f => !resourceFiles_set.has(f))
  return [groupItem, otherFiles]
}

/**
 * 为Header Files和Source Files创建树节点
 * @param group Header Files/Source Files分组
 * @param currentSourceDir 当前所在源文件目录
 * @returns Header Files/Source Files目录节点
 */
function createTreeItemForCppGroup(group: SourceGroup, currentSourceDir: string): FileTreeItem | undefined {
  // Header/Source Files
  if (!group.sources || group.sources.length === 0 ||
    (group.name !== 'Header Files' && group.name !== 'Source Files')) {
    return;
  }
  return createTreeItemRecursively(group.sources, currentSourceDir, group.name);
}

/**
 * 为其他文件创建树节点
 * @param otherFiles 其他文件绝对路径数组
 * @param currentSourceDir 当前所在源文件目录
 * @returns 其他文件树节点
 */
function createTreeItemForOtherFiles(otherFiles: string[], currentSourceDir: string): FileTreeItem | undefined {
  //对三个分组都没包含进去的也就是Resources中的剩余文件进行处理
  if (otherFiles.length === 0) {
    return
  }
  return createTreeItemRecursively(otherFiles, currentSourceDir, '')
}

/**
 * 创建target-json的树节点
 * @param jsonPath json文件绝对路径
 * @param rootSourceDir 根部源文件目录
 * @param rootBuildDir 根部构建目录
 * @returns 当前target对应的子/根目录节点，是否为根目录的标志位，如果是根目录就在使用时把根节点的children提取出来
 */
function createTreeItemForTargetJson(jsonPath: string, rootSourceDir: string, rootBuildDir: string): [FileTreeItem, boolean] | undefined {
  const parseResult = parseTargetJson(jsonPath, rootSourceDir, rootBuildDir)
  if (!parseResult) return
  const [targetJsonResult, currentSourceDir, isRoot] = parseResult
  const sourceGroups = targetJsonResult.sourceGroups
  const dirName = getBaseName(targetJsonResult.paths.source)
  //子目录，比如src
  const dirItem = createFileTreeItem(
    dirName,
    vscode.TreeItemCollapsibleState.Collapsed,
    currentSourceDir
  )
  if (!dirItem) return
  const cmakeListsItem = createFileTreeItem(
    'CMakeLists.txt',
    vscode.TreeItemCollapsibleState.None,
    path.resolve(currentSourceDir, 'CMakeLists.txt')
  )
  if (!cmakeListsItem) return
  dirItem.children.push(cmakeListsItem)

  //对于resources处理，有多种情况：1.没有resources这个分组，说明没有otherfiles 2.有这个分组，但是createResult=空 3.createResult不为空
  sourceGroups.forEach(group => {
    let createResult
    if (group.name === 'Header Files' || group.name === 'Source Files') {
      createResult = createTreeItemForCppGroup(group, currentSourceDir)
      if (createResult) dirItem.children.push(createResult)
    } else if (group.name === 'Resources') {
      //这里逻辑后边还得优化
      createResult = createTreeItemForResourcesGroup(group, currentSourceDir)
      if (createResult) {
        //3.createResult不为空，使用它提供的otherfiles
        const [resItem, otherFiles] = createResult
        dirItem.children.push(resItem)
        const otherFilesItem = createTreeItemForOtherFiles(otherFiles, currentSourceDir)
        if (!otherFilesItem) return
        dirItem.children.push(...otherFilesItem.children)
      } else {
        //2.createResult=空，直接使用resources分组内容
        //这里的逻辑只用于测试
        if (!group.sources) return
        const otherFilesItem = createTreeItemForOtherFiles(group.sources, currentSourceDir)
        if (!otherFilesItem) return
        dirItem.children.push(...otherFilesItem.children)
      }
    }
  })
  return [dirItem, isRoot]
}


/**
 * 格式化输入的任何路径(绝对，相对，文件名)为绝对路径
 * @param currentDir 当前目录
 * @param inputPath 绝对路径/相对路径/文件名
 * @returns 标准的绝对路径
 */
function getNormalizedAbsPath(currentDir: string, inputPath: string): string {
  // 处理绝对路径
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }

  // 处理相对路径和文件名
  const absolutePath = path.resolve(currentDir, inputPath);
  return path.normalize(absolutePath);
}

/**
 * @param targetPath 用于判断的绝对路径
 * @param directory 当前目录
 * @returns targetPath是否在directory这个目录下
 */
function isPathInDirectory(targetPath: string, directory: string): boolean {
  const relativePath = path.relative(directory, targetPath);
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

/**
 * 在字符串数组中查找指定扩展名的文件
 * @param ext 扩展名（带或不带点号均可，如 "js" 或 ".js"）
 * @param files 文件路径数组
 * @returns 匹配的文件路径数组
 */
function findFilesByExtension(ext: string, files: string[]): string[] {
  // 规范化扩展名（确保以点号开头）
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;

  // 使用 filter 和 endsWith 进行匹配
  return files.filter(file =>
    file.toLowerCase().endsWith(normalizedExt.toLowerCase())
  );
}

/**
 * 判断两个路径是否指向同一位置
 * @param path1 路径1
 * @param path2 路径2
 * @param options 可选配置
 * @returns 是否为同一路径
 */
function isSamePath(
  path1: string,
  path2: string,
  options: { caseSensitive?: boolean } = {}
): boolean {
  // 处理选项（默认根据操作系统决定大小写敏感性）
  const caseSensitive = options.caseSensitive ??
    (process.platform !== 'win32' && process.platform !== 'darwin');

  // 转换为绝对路径并规范化
  const resolvedPath1 = path.resolve(path1);
  const resolvedPath2 = path.resolve(path2);

  // 比较结果（根据大小写敏感性决定是否忽略大小写）
  return caseSensitive
    ? resolvedPath1 === resolvedPath2
    : resolvedPath1.toLowerCase() === resolvedPath2.toLowerCase();
}

/**
 * 递归解析文件绝对路径数组，构建文件结构树
 * @param filePaths 文件绝对路径数组
 * @param currentSourceDir 源文件目录
 * @param rootLabel 根节点的label
 * @returns 根节点，如果需要其内部节点，使用其children属性
 */
function createTreeItemRecursively(filePaths: string[], currentSourceDir: string, rootLabel: string): FileTreeItem | undefined {
  const normalizedBaseDir = path.normalize(currentSourceDir);
  const dirMap = new Map<string, FileTreeItem>();

  // 创建根目录节点
  const rootDirItem = createFileTreeItem(
    rootLabel,
    vscode.TreeItemCollapsibleState.Collapsed,
    '',
    normalizedBaseDir
  );
  if (!rootDirItem) return
  dirMap.set(normalizedBaseDir, rootDirItem);

  // 处理文件路径...
  for (const filePath of filePaths) {
    if (!isPathInDirectory(filePath, normalizedBaseDir)) continue;

    const relativePath = path.relative(normalizedBaseDir, filePath);
    const parts = relativePath.split(path.sep).filter(part => part.length > 0);
    if (parts.length === 0) continue;

    let currentDir = normalizedBaseDir;
    let parentItem: FileTreeItem = rootDirItem; // 从根目录开始

    // 处理目录层级
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      currentDir = path.join(currentDir, dirName);

      if (!dirMap.has(currentDir)) {
        const dirItem = createFileTreeItem(
          dirName,
          vscode.TreeItemCollapsibleState.Collapsed,
          currentDir
        );
        if (!dirItem) return
        dirMap.set(currentDir, dirItem);
        parentItem.children.push(dirItem); // 添加到父节点的 children
      }

      parentItem = dirMap.get(currentDir)!;
    }

    // 添加文件到父目录
    const fileName = parts[parts.length - 1];
    const fileItem = createFileTreeItem(
      fileName,
      vscode.TreeItemCollapsibleState.None,
      filePath
    );
    if (!fileItem) return
    parentItem.children.push(fileItem);
  }

  // 对每个目录的子项进行排序：目录在前，文件在后，同类按名称排序
  dirMap.forEach((dirItem) => {
    dirItem.children.sort((a, b) => {
      const isADir = a.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed;
      const isBDir = b.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed;

      // 目录优先
      if (isADir && !isBDir) return -1;
      if (!isADir && isBDir) return 1;

      // 同类按名称排序（忽略大小写）
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
  });

  return rootDirItem;
}

/**
 * 获取路径中的最后一级名称（文件或目录）
 * @param filePath 输入路径（绝对或相对）
 * @param includeExt 是否包含扩展名（仅对文件有效）
 * @returns 最后一级名称（目录名或文件名）
 */
function getBaseName(filePath: string, includeExt = true): string {
  if (!filePath) return '';

  // 规范化路径并移除末尾的路径分隔符
  const normalizedPath = path.normalize(filePath).replace(/[\\/]+$/, '');

  try {
    // 使用 fs.statSync 获取文件信息
    const stats: fs.Stats = fs.statSync(normalizedPath);

    // 获取最后一级名称
    const baseName = path.basename(normalizedPath);

    // 如果是目录或不需要扩展名，则直接返回
    if (stats.isDirectory() || !includeExt) {
      return baseName;
    }

    // 如果是文件且需要扩展名，返回完整文件名
    return baseName;
  } catch (error) {
    // 处理错误（如路径不存在）
    console.error(`无法获取路径信息: ${normalizedPath}`, error);

    // 回退策略：通过扩展名判断
    const baseName = path.basename(normalizedPath);
    return includeExt ? baseName : baseName.replace(path.extname(baseName), '');
  }
}

/**
 * 处理windows下的盘符大小写问题,全部大写
 * @param filePath 
 * @returns 格式化盘符后的路径
 */
function normalizeDriveLetter(filePath: string): string {
  let norm = path.normalize(filePath);
  // 只在 Windows 下处理盘符
  if (process.platform === 'win32') {
    // 检查是不是绝对路径，并且以盘符开头
    if (/^[a-zA-Z]:/.test(norm)) {
      norm = norm[0].toUpperCase() + norm.slice(1);
    }
  }
  return norm;
}

export {
  getBaseName,
  getNormalizedAbsPath,
  getCmakeApiReplyDirectory,
  parseCodeModelJson,
  createTreeItemForTargetJson,
  normalizeDriveLetter
}