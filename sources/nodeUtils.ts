import os from 'os';

export interface NodeError extends Error {
  code: string;
}

function getEndOfLine(content: string) {
  const matches = content.match(/\r?\n/g);
  if (matches === null)
    return os.EOL;

  const crlf = matches.filter(nl => nl === `\r\n`).length;
  const lf = matches.length - crlf;

  return crlf > lf ? `\r\n` : `\n`;
}

export function normalizeLineEndings(originalContent: string, newContent: string) {
  return newContent.replace(/\r?\n/g, getEndOfLine(originalContent));
}

function getIndent(content: string) {
  const indentMatch = content.match(/^[ \t]+/m);

  if (indentMatch) {
    return indentMatch[0];
  } else {
    return `  `;
  }
}

function stripBOM(content: string) {
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1);
  } else {
    return content;
  }
}


export function readPackageJson(content: string) {
  return {
    data: JSON.parse(stripBOM(content) || `{}`),
    indent: getIndent(content),
  };
}
