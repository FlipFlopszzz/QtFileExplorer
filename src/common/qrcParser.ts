import { XMLParser } from 'fast-xml-parser';
import { FileTreeItem } from './fileTreeItem';
import * as fs from 'fs'
import * as vscode from 'vscode'
import { getBaseName, getNormalizedAbsPath } from '../cmake/parser';


export function parseQrcContent(qrcContent: string): { prefix: string; files: { name: string; alias: string }[] }[] {
  const parserOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  };
  const parser: XMLParser = new XMLParser(parserOptions);
  const parsedXml: any = parser.parse(qrcContent);

  const result: { prefix: string; files: { name: string; alias: string }[] }[] = [];

  if (parsedXml.RCC && parsedXml.RCC.qresource) {
    const qresources: any[] = Array.isArray(parsedXml.RCC.qresource)
      ? parsedXml.RCC.qresource
      : [parsedXml.RCC.qresource];

    for (const qresource of qresources) {
      const prefix: string = qresource['@_prefix'] || '/';
      const files: { name: string; alias: string }[] = [];

      if (qresource.file) {
        const fileList: any[] = Array.isArray(qresource.file)
          ? qresource.file
          : [qresource.file];

        for (const file of fileList) {
          let name: string = '';
          let alias: string = '';

          if (typeof file === 'object') {
            name = file['@_name'] || (file['#text']?.trim() || '');
            alias = file['@_alias'] || '';
          } else if (typeof file === 'string') {
            name = file.trim();
          }

          if (name) {
            files.push({ name, alias });
          }
        }
      }

      result.push({ prefix, files });
    }
  }

  return result;
}

export function createTreeItemForQrc(qrcFile: string, currentSourceDir: string): FileTreeItem {
  const resourceFiles: string[] = []
  const qrcContent = fs.readFileSync(qrcFile, 'utf-8');
  const parsedQrcContent = parseQrcContent(qrcContent);
  const qrcFolderItem = new FileTreeItem(getBaseName(qrcFile, true), vscode.TreeItemCollapsibleState.Collapsed, qrcFile);
  parsedQrcContent.forEach(({ prefix, files }) => {
    const prefixFolderItem = new FileTreeItem(prefix, vscode.TreeItemCollapsibleState.Collapsed, '', currentSourceDir);
    files.forEach(file => {
      const fileAbsPath = getNormalizedAbsPath(currentSourceDir, file.name);
      resourceFiles.push(fileAbsPath);
      //alias和name后边再处理
      const fileItem = new FileTreeItem(file.name, vscode.TreeItemCollapsibleState.None, fileAbsPath);
      prefixFolderItem.children.push(fileItem);
    });
    qrcFolderItem.children.push(prefixFolderItem);
  });
  return qrcFolderItem
}