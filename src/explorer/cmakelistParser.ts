export class CmakelistParser {
  parseProjectStatement(line: string): { projectName: string; version: string } | null {
    const regex = /project\s*\(\s*(\w+)\s*(?:VERSION\s+(\S+))?\s*\)/;
    const match = line.match(regex);
    if (match) {
      const projectName = match[1];
      const version = match[2] || 'Unknown';
      return { projectName, version };
    }
    return null;
  }

  parseAddSubdirectoryStatement(content: string): string[] {
    const regex = /add_subdirectory\s*\(\s*(\S+)\s*\)/g;
    const subdirectories: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      subdirectories.push(match[1]);
    }
    return subdirectories;
  }

  parseFindPackageStatement(content: string): string[][] {
    const regex = /find_package\s*\(\s*(\S+)(?:\s+NAMES\s+([\w\s]+))?(?:\s+REQUIRED\s+COMPONENTS\s+([\w\s]+))?\s*\)/g;
    const packages: string[][] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      const packageName = match[1];
      const names = match[2] ? match[2].split(/\s+/) : [];
      const components = match[3] ? match[3].split(/\s+/) : [];
      packages.push([packageName, ...names, ...components]);
    }
    return packages;
  }

  parseSetStatement(content: string): { key: string; value: string[] }[] {
    const regex = /set\s*\(\s*(\w+)\s*([^)]+)\)/gs;
    const result: { key: string; value: string[] }[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      const key = match[1];
      const value = match[2].trim().split(/\s+/).filter(item => item);
      result.push({ key, value });
    }
    return result;
  }

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
    parts.shift();

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
        sources.push(part);
      }
    }

    return sources;
  }

  // parseQtAddQmlModuleStatement(content: string): { [key: string]: string[] } {
  //   const result: { [key: string]: string[] } = {};
  //   const qtAddQmlModuleRegex = /qt_add_qml_module\(\s*(\w+)\s*([\s\S]*?)\)/;
  //   const match = content.match(qtAddQmlModuleRegex);

  //   if (match) {
  //     const moduleContent = match[2];
  //     const resourceTypes = ['SOURCES', 'QML_FILES', 'RESOURCES'];

  //     resourceTypes.forEach(type => {
  //       result[type] = [];
  //       const typeRegex = new RegExp(`${type}\\s+([\\s\\S]*?)(?=\\s+(?:SOURCES|QML_FILES|RESOURCES|\\))|$)`, 'g');
  //       let typeMatch;
  //       while ((typeMatch = typeRegex.exec(moduleContent)) !== null) {
  //         const files = typeMatch[1].trim().split(/\s+/);
  //         result[type] = result[type].concat(files.filter(file => file.length > 0));
  //       }
  //     });

  //     // 移除 SOURCES 中属于 RESOURCES 的文件
  //     const resourcesSet = new Set(result['RESOURCES']);
  //     result['SOURCES'] = result['SOURCES'].filter(file => !resourcesSet.has(file));
  //   }

  //   return result;
  // }

  //寻找匹配的闭合括号
  private findMatchingParenIndex(content: string, startIndex: number): number {
    let parenCount = 1;
    for (let i = startIndex + 1; i < content.length; i++) {
      if (content[i] === '(') {
        parenCount++;
      } else if (content[i] === ')') {
        parenCount--;
        if (parenCount === 0) {
          return i;
        }
      }
    }
    return -1;
  }
}

