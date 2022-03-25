import 'module';

declare module 'module' {
  const _cache: {[p: string]: NodeModule};

  function _nodeModulePaths(from: string): Array<string>;
  function _resolveFilename(request: string, parent: NodeModule | null | undefined, isMain: boolean): string;
}

declare global {
  namespace NodeJS {
    interface Module {
      load(path: string): void;
    }
  }
}
