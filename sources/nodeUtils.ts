import os from 'os';

export interface NodeError extends Error {
  code: string;
}

export function isNodeError(err: any): err is NodeError {
  return !!err?.code;
}

export function isExistError(err: NodeError) {
  return err.code === `EEXIST` || err.code === `ENOTEMPTY`;
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

export function setPackageManager(content: string, packageManager: string) {
  const {data, indent} = readPackageJson(content);
  const value = JSON.stringify(packageManager);

  if (content === ``)
    return normalizeLineEndings(content, `${JSON.stringify({packageManager}, null, indent)}\n`);

  if (typeof data !== `object` || data === null || Array.isArray(data))
    throw new TypeError(`Expected package.json to contain an object`);

  const edits: Array<{start: number, end: number}> = [];
  let depth = 0;
  let name: string | undefined;
  let valueStart = -1;
  let lastTokenEnd = 0;

  // JSON.parse above validates the input. Tokenize strings as a whole so that
  // escaped quotes and punctuation inside them cannot affect nesting depth.
  for (const match of content.matchAll(/"(?:\\.|[^"\\])*"|[^\s]/g)) {
    const token = match[0];
    if (depth === 1) {
      if (token === `,` || token === `}`) {
        if (name === `packageManager`)
          edits.push({start: valueStart, end: lastTokenEnd});

        name = undefined;
        valueStart = -1;
      } else if (name === undefined) {
        name = JSON.parse(token);
      } else if (token !== `:` && valueStart === -1) {
        valueStart = match.index;
      }

      if (token === `}`) {
        break;
      }
    }

    if (token === `{` || token === `[`) depth++;
    if (token === `}` || token === `]`) depth--;
    lastTokenEnd = match.index + token.length;
  }

  if (edits.length > 0) {
    // Update duplicate keys too, without touching similarly named nested keys.
    for (const {start, end} of edits.reverse())
      content = content.slice(0, start) + value + content.slice(end);

    return content;
  }

  const separator = Object.keys(data).length > 0 ? `,` : ``;
  const spacing = /\r?\n/.test(content.slice(0, content.lastIndexOf(`}`))) ? `${getEndOfLine(content)}${indent}` : ``;
  return `${content.slice(0, lastTokenEnd)}${separator}${spacing}"packageManager": ${value}${content.slice(lastTokenEnd)}`;
}
