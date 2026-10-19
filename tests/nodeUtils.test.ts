import {describe, expect, it} from 'vitest';

import {setPackageManager}    from '../sources/nodeUtils.ts';

describe(`setPackageManager`, () => {
  const version = `pnpm@9.0.0+sha512.abc`;
  const value = JSON.stringify(version);

  it.each([`\n`, `\r\n`])(`preserves blank lines and unrelated values with %j line endings`, eol => {
    const before = [
      `{`,
      `\t"name" : "example",`,
      ``,
      `\t"scripts": {"test": "echo \\"ok\\""},`,
      `\t"number": 1e+2,`,
      ``,
      `\t"dependencies": {`,
      `\t\t"a": "1",`,
      ``,
      `\t\t"b": "2"`,
      `\t}`,
      ``,
      `}`,
      ``,
    ].join(eol);
    const expected = before.replace(`${eol}\t}${eol}`, `${eol}\t},${eol}\t"packageManager": ${value}${eol}`);

    expect(setPackageManager(before, version)).toBe(expected);
    expect(JSON.parse(expected).packageManager).toBe(version);
  });

  it.each([`"old"`, `null`, `false`, `123`, `[]`, `{"nested": ["}", {"packageManager": "untouched"}]}`])(`replaces an existing %s value without reformatting`, old => {
    const before = `{\n  "name": "example",\n\n  "packageManager" : ${old}  ,\n  "private": true\n}`;
    expect(setPackageManager(before, version)).toBe(before.replace(`: ${old}`, `: ${value}`));
  });

  it(`recognizes escaped and duplicate top-level keys`, () => {
    const before = `{"packageManager":"first", "package\\u004danager": ["last"]}`;
    expect(setPackageManager(before, version)).toBe(`{"packageManager":${value}, "package\\u004danager": ${value}}`);
  });

  it(`does not replace nested keys or punctuation inside strings`, () => {
    const before = `{"nested":[{"packageManager":"old"}],"text":"\\"},[packageManager"}`;
    expect(setPackageManager(before, version)).toBe(`${before.slice(0, -1)},"packageManager": ${value}}`);
  });

  it.each([`{}`, `{}\n`, `{}\r\n`, `{  }`, `\uFEFF{}\n`])(`preserves whitespace around an empty object %j`, before => {
    expect(setPackageManager(before, version)).toBe(before.replace(`{`, `{"packageManager": ${value}`));
  });

  it(`creates a new manifest`, () => {
    expect(JSON.parse(setPackageManager(``, version))).toEqual({packageManager: version});
  });

  it(`rejects invalid JSON before editing`, () => {
    expect(() => setPackageManager(`{"name": }`, version)).toThrow(SyntaxError);
  });
});
