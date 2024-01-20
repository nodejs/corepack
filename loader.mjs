import {fileURLToPath} from 'node:url';
import {transform}     from 'sucrase';

export async function resolve(specifier, context, next) {
  if (specifier.endsWith(`.json`)) {
    const result = await next(specifier, context);
    return {...result, importAttributes: {type: `json`}};
  }
  if (specifier[0] === `.` && !specifier.endsWith(`.js`) && !specifier.endsWith(`.cjs`)) specifier += `.ts`;
  try {
    return await next(specifier, context);
  } catch (err) {
    if (err?.code === `ERR_MODULE_NOT_FOUND` && specifier.endsWith(`.js`)) {
      try {
        return await next(specifier.replace(/\.js$/, `.ts`), context);
      } catch (err2) {
        if (err2) {
          err2.cause = err;
          throw err2;
        }
        throw err;
      }
    }
    throw err;
  }
}

export async function load(urlStr, context, next) {
  const url = new URL(urlStr);
  if (url.pathname.endsWith(`.ts`)) {
    const {source} = await next(urlStr, {...context, format: `module`});
    const {code} = transform(source.toString(`utf-8`), {
      transforms: [`typescript`],
      disableESTransforms: true,
      filePath: fileURLToPath(url),
    });
    return {
      source: urlStr.endsWith(`/types.ts`) ? code.replace(/\] ?= ?"(Npm|Pnpm|Yarn)";/g, s => s.toLowerCase()) : code,
      format: `module`,
    };
  } else {
    return next(urlStr, context);
  }
}
