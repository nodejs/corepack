import Module from 'module';
import path   from 'path';

declare const __non_webpack_require__: NodeRequire | undefined;

export const dynamicRequire: NodeRequire = typeof __non_webpack_require__ !== `undefined`
  ? __non_webpack_require__
  : require;

/**
 * Loads a module as a main module, enabling the `require.main === module` pattern.
 */
export function loadMainModule(id: string): void {
  const modulePath = Module._resolveFilename(id, null, true);

  const module = new Module(modulePath, undefined);

  module.filename = modulePath;
  module.paths = Module._nodeModulePaths(path.dirname(modulePath));

  Module._cache[modulePath] = module;

  process.mainModule = module;
  module.id = `.`;

  try {
    return module.load(modulePath);
  } catch (error) {
    delete Module._cache[modulePath];
    throw error;
  }
}

export interface NodeError extends Error {
  code: string;
}
