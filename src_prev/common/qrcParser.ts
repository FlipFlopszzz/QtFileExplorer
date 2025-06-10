import { XMLParser } from 'fast-xml-parser';
import { FileTreeItem } from './fileTreeItem';

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
