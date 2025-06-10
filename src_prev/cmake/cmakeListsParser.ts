export class CmakeListsParser {
  /**
   * 解析project语句，提取项目名称和版本
   * 支持格式：project(ProjectName VERSION 1.0.0)
   */
  parseProjectStatement(line: string): { projectName: string; version: string } | null {
    // 改进的正则表达式，支持引号和更灵活的格式
    const regex = /project\s*\(\s*("([^"]+)"|'([^']+)'|(\w+))\s*(?:VERSION\s+("([^"]+)"|'([^']+)'|(\S+)))?\s*\)/;
    const match = line.match(regex);
    if (!match) {
      return null;
    }

    // 提取项目名称，处理引号情况
    const projectNameMatch = match[2] || match[3] || match[4];
    if (!projectNameMatch) {
      return null;
    }

    // 提取版本，处理引号情况
    const versionMatch = match[6] || match[7] || match[8];
    const version = versionMatch || 'Unknown';

    return { projectName: projectNameMatch, version };
  }

  /**
   * 解析add_subdirectory语句，提取子目录路径
   * 支持带引号和不带引号的路径
   */
  parseAddSubdirectoryStatement(content: string): string[] {
    const regex = /add_subdirectory\s*\(\s*([\s\S]*?)\s*\)/g; // 匹配整个括号内容
    const subdirectories: string[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      const args = match[1].trim().split(/\s+/).filter(arg => arg);
      if (args.length === 0) continue;

      // 提取第一个参数作为路径（支持引号和变量）
      const path = this.parsePathArgs(args)[0];
      if (path) subdirectories.push(path);
    }

    return subdirectories;
  }

  /**
   * 解析find_package语句，提取包名、别名和组件
   */
  parseFindPackageStatement(content: string): string[][] {
    // 改进的正则表达式，支持更灵活的格式
    const regex = /find_package\s*\(\s*("([^"]+)"|'([^']+)'|(\S+))(?:\s+NAMES\s+([\w\s"']+))?(?:\s+REQUIRED)?(?:\s+COMPONENTS\s+([\w\s"']+))?\s*\)/g;
    const packages: string[][] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      const packageName = match[2] || match[3] || match[4];
      if (!packageName) {
        continue;
      }

      // 处理NAMES参数，支持带引号的名称
      const names = match[5]
        ? match[5].split(/\s+/).map(name => name.replace(/^["']|["']$/g, ''))
        : [];

      // 处理COMPONENTS参数，支持带引号的组件名
      const components = match[6]
        ? match[6].split(/\s+/).map(component => component.replace(/^["']|["']$/g, ''))
        : [];

      packages.push([packageName, ...names, ...components]);
    }

    return packages;
  }

  /**
   * 解析set语句，提取变量名和值
   * 支持单值、多值和带引号的值
   */
  parseSetStatement(content: string): { key: string; value: string[] }[] {
    // 改进的正则表达式，支持更复杂的set语句
    const regex = /set\s*\(\s*(\w+)\s+([\s\S]*?)\s*\)/gs;
    const result: { key: string; value: string[] }[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      const key = match[1];
      const valueStr = match[2].trim();

      // 处理带引号的值和普通值
      let values: string[] = [];
      if (valueStr.startsWith('"') && valueStr.endsWith('"') ||
        valueStr.startsWith("'") && valueStr.endsWith("'")) {
        // 带引号的单个值
        values = [valueStr.slice(1, -1)];
      } else {
        // 多个值，可能包含引号
        values = valueStr.split(/\s+/).filter(item => item);
        // 处理带引号的值
        values = values.map(item => {
          if ((item.startsWith('"') && item.endsWith('"')) ||
            (item.startsWith("'") && item.endsWith("'"))) {
            return item.slice(1, -1);
          }
          return item;
        });
      }

      result.push({ key, value: values });
    }

    return result;
  }

  /**
   * 解析qt_add_executable语句，提取源文件列表
   * 支持变量替换和更复杂的格式
   */
  parseQtAddExecutableStatement(content: string): string[] | null {
    const startIndex = content.indexOf('qt_add_executable');
    if (startIndex === -1) {
      return null;
    }

    const startParenIndex = content.indexOf('(', startIndex);
    if (startParenIndex === -1) {
      return null;
    }

    const endParenIndex = this.findMatchingParenIndex(content, startParenIndex);
    if (endParenIndex === -1) {
      return null;
    }

    const innerContent = content.slice(startParenIndex + 1, endParenIndex).trim();
    let parts = innerContent.split(/\s+/).filter(part => part);

    // 移除目标名称
    if (parts.length > 0) {
      parts.shift();
    } else {
      return [];
    }

    const setStatements = this.parseSetStatement(content);
    const sources: string[] = [];

    for (const part of parts) {
      if (part.startsWith('${') && part.endsWith('}')) {
        const variableName = part.slice(2, -1);
        if (variableName === 'PROJECT_NAME') {
          continue;
        }

        const setStatement = setStatements.find(s => s.key === variableName);
        if (setStatement) {
          sources.push(...setStatement.value);
        }
      } else {
        // 处理带引号的源文件
        const source = part.replace(/^["']|["']$/g, '');
        sources.push(source);
      }
    }

    return sources;
  }

  /**
   * 解析qt_add_qml_module语句，提取各种资源文件
   * 支持 SOURCES, QML_FILES, RESOURCES 等参数
   */
  parseQtAddQmlModuleStatement(content: string): { [key: string]: string[] } {
    const result: { [key: string]: string[] } = {
      SOURCES: [],
      QML_FILES: [],
      RESOURCES: []
    };

    // 匹配整个qt_add_qml_module块
    const qtAddQmlModuleRegex = /qt_add_qml_module\s*\(\s*(\w+)\s+([\s\S]*?)\)/;
    const match = content.match(qtAddQmlModuleRegex);

    if (!match) {
      return result;
    }

    const moduleContent = match[2];
    const resourceTypes = ['SOURCES', 'QML_FILES', 'RESOURCES'];

    // 分别提取每种资源类型的文件列表
    resourceTypes.forEach(type => {
      // 匹配特定类型的资源块
      const typeRegex = new RegExp(`${type}\\s+([\\s\\S]*?)(?=\\s+(?:${resourceTypes.join('|')}|\\))|$)`, 'g');
      let typeMatch;

      while ((typeMatch = typeRegex.exec(moduleContent)) !== null) {
        const filesStr = typeMatch[1].trim();
        if (!filesStr) {
          continue;
        }

        // 处理带引号的文件名和变量
        let files: string[] = [];
        let inQuote = false;
        let currentFile = '';
        let quoteChar = '';

        for (let i = 0; i < filesStr.length; i++) {
          const char = filesStr[i];

          if (char === '"' || char === "'") {
            if (!inQuote) {
              // 开始引号
              inQuote = true;
              quoteChar = char;
              currentFile = '';
            } else if (char === quoteChar) {
              // 结束引号
              inQuote = false;
              files.push(currentFile);
              currentFile = '';
            } else {
              // 引号内的引号字符
              currentFile += char;
            }
          } else if (char === ' ' && !inQuote) {
            // 空格分隔符
            if (currentFile.trim()) {
              files.push(currentFile.trim());
            }
            currentFile = '';
          } else {
            // 普通字符
            currentFile += char;
          }
        }

        // 添加最后一个文件
        if (currentFile.trim()) {
          files.push(currentFile.trim());
        }

        // 处理变量替换
        const setStatements = this.parseSetStatement(content);
        const resolvedFiles = files.flatMap(file => {
          if (file.startsWith('${') && file.endsWith('}')) {
            const variableName = file.slice(2, -1);
            const setStatement = setStatements.find(s => s.key === variableName);
            return setStatement ? setStatement.value : [];
          }
          return [file];
        });

        result[type] = [...result[type], ...resolvedFiles];
      }
    });

    // 移除 SOURCES 中属于 RESOURCES 的文件
    const resourcesSet = new Set(result['RESOURCES']);
    result['SOURCES'] = result['SOURCES'].filter(file => !resourcesSet.has(file));

    return result;
  }

  /**
   * 寻找匹配的闭合括号
   * 返回闭合括号的索引，如果没找到返回-1
   */
  private findMatchingParenIndex(content: string, startIndex: number): number {
    let parenCount = 1;
    let inQuote = false;
    let quoteChar = '';

    for (let i = startIndex + 1; i < content.length; i++) {
      const char = content[i];

      // 处理引号
      if ((char === '"' || char === "'") &&
        (i === 0 || content[i - 1] !== '\\')) {
        if (!inQuote) {
          inQuote = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuote = false;
        }
      }

      // 不在引号内时处理括号
      if (!inQuote) {
        if (char === '(') {
          parenCount++;
        } else if (char === ')') {
          parenCount--;
          if (parenCount === 0) {
            return i;
          }
        }
      }
    }

    return -1;
  }



  private parsePathArgs(args: string[]): string[] {
    const paths: string[] = [];
    let currentPath = '';
    let inQuote = false;
    let quoteChar = '';

    for (const arg of args) {
      if (arg.startsWith('"') || arg.startsWith("'")) {
        // 处理引号开头的参数
        if (inQuote) {
          // 引号嵌套错误，直接添加参数（需根据实际需求调整）
          paths.push(arg);
          continue;
        }
        inQuote = true;
        quoteChar = arg[0];
        currentPath = arg.slice(1);
      } else if (inQuote) {
        // 拼接引号内的内容
        currentPath += ` ${arg}`;
        if (arg.endsWith(quoteChar)) {
          // 结束引号，添加完整路径
          inQuote = false;
          currentPath = currentPath.slice(0, -1).trim(); // 移除结尾引号
          paths.push(currentPath);
          currentPath = '';
        }
      } else {
        // 处理普通参数或变量
        if (arg.startsWith('${') && arg.endsWith('}')) {
          // 变量引用，暂存为原始值（需结合setStatement解析）
          paths.push(arg);
        } else {
          // 普通路径
          paths.push(arg);
        }
      }
    }

    // 处理未闭合的引号（可选逻辑）
    if (inQuote) {
      console.warn('Unclosed quote in path argument:', currentPath);
      paths.push(currentPath);
    }

    return paths;
  }
}