import fs from "node:fs/promises";

async function* findTestFiles(url: URL): AsyncGenerator<URL> {
  for await (const dirent of await fs.opendir(url)) {
    if (dirent.name === "node_modules") continue;

    if (dirent.isDirectory())
      yield* findTestFiles(new URL(`${dirent.name}/`, url));
    else if (dirent.name.endsWith(".test.ts")) yield new URL(dirent.name, url);
  }
}

for await (const file of findTestFiles(new URL("../", import.meta.url))) {
  await import(file as any);
}
