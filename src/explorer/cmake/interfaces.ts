/**
 * CMake项目目录结构
 */
interface CMakeDirectory {
  build: string;
  source: string;
  parentIndex?: number;
}

/**
 * CMake项目信息
 */
interface CMakeProject {
  name: string;
}

/**
 * CMake目标信息
 */
interface CMakeTarget {
  name: string;
  jsonFile: string;
}

/**
 * CMake配置信息
 */
interface CMakeConfiguration {
  directories: CMakeDirectory[];
  name: string;
  projects: string[];
  targets: CMakeTarget[];
}

/**
 * CMake CodeModel文件解析结果
 */
interface CMakeCodeModelResult {
  configurations: CMakeConfiguration[];
  kind: string;
  paths: {
    build: string;
    source: string;
  };
  version: {
    major: number;
    minor: number;
  }
}

/**
 * 源文件项
 */
interface SourceItem {
  path: string;
  isGenerated?: boolean;
}

/**
 * 源文件分组
 */
interface SourceGroup {
  name: string;
  sourceIndexes: number[];
  sources?: string[];
}

/**
 * Target JSON文件解析结果
 */
interface TargetJsonResult {
  type: string;
  name: string;
  paths: { build: string; source: string };
  sourceGroups: SourceGroup[];
}

export { CMakeCodeModelResult, CMakeConfiguration, CMakeDirectory, CMakeProject, CMakeTarget, TargetJsonResult, SourceGroup, SourceItem }