'use strict';

const fs = require("fs/promises");
const path = require("path");

const pirates = require('pirates');
const { transform } = require('sucrase');

/**
 * @param {string} extension File extension. All files with said file extension
 *                           that go through the CJS loader will be transpiled.
 * @param {import('sucrase').Options} [options] Options to pass to the Sucrase transform function.
 * @returns {import('pirates').RevertFunction}
 */
function addHook(extension, options) {
	return pirates.addHook(
		(code, filePath) => {
			if (!options?.transforms) {
				// If there are no Sucrase transform necessary, we can return the code as is.
				return code;
			}
			const { code: transformedCode, sourceMap } = transform(
				// Replace dynamic imports of `.ts` files with `require`.
				// Hooking into the Node.js ESM resolver would take more effort.
				code,
				{
					...options,
					sourceMapOptions: { compiledFilename: filePath },
					filePath,
				},
			);
			// Split the source map comment across two strings so that tools like
			// source-map-support don't accidentally interpret it as a source map
			// comment for this file.
			const sourceMappingURL = 'sourceMappingURL';
			const suffix = `//# ${sourceMappingURL}=data:application/json,${encodeURIComponent(
				JSON.stringify(sourceMap),
			)}`;
			return `${filePath.endsWith(`types.ts`) ? transformedCode.replace(/\] ?= ?"(Npm|Pnpm|Yarn)";/g, s => s.toLowerCase()) :transformedCode}\n${suffix}`;
		},
		{ exts: [extension] },
	);
}

	addHook('.ts', {
		transforms: ['imports', 'typescript'],
		disableESTransforms: true,
		// We ask Sucrase to preserve dynamic imports because we replace them
		// ourselves.
		preserveDynamicImport: true,
	});



async function* findTestFiles(dirpath) {
  for await (const dirent of await fs.opendir(dirpath)) {
    if (dirent.name === "node_modules") continue;

    if (dirent.isDirectory())
      yield* findTestFiles(path.join(dirpath, dirent.name));
    else if (dirent.name.endsWith(".test.ts")) yield path.join(dirpath, dirent.name);
  }
}

(async () => {
  for await (const file of findTestFiles(__dirname)) {
    require(file);
  }
})()
