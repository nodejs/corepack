import {createHash}   from 'node:crypto';
import {once}         from 'node:events';
import {createServer} from 'node:http';
import {gzipSync}     from 'node:zlib';

function createSimpleTarArchive(fileName, fileContent, mode = 0o644) {
  const contentBuffer = Buffer.from(fileContent);

  const header = Buffer.alloc(512); // TAR headers are 512 bytes
  header.write(fileName);
  header.write(`100${mode.toString(8)} `, 100, 7, `utf-8`); // File mode (octal) followed by a space
  header.write(`0001750 `, 108, 8, `utf-8`); // Owner's numeric user ID (octal) followed by a space
  header.write(`0001750 `, 116, 8, `utf-8`); // Group's numeric user ID (octal) followed by a space
  header.write(`${contentBuffer.length.toString(8)} `, 124, 12, `utf-8`); // File size in bytes (octal) followed by a space
  header.write(`${Math.floor(Date.now() / 1000).toString(8)} `, 136, 12, `utf-8`); // Last modification time in numeric Unix time format (octal) followed by a space
  header.fill(` `, 148, 156); // Fill checksum area with spaces for calculation
  header.write(`ustar  `, 257, 8, `utf-8`); // UStar indicator

  // Calculate and write the checksum. Note: This is a simplified calculation not recommended for production
  const checksum = header.reduce((sum, value) => sum + value, 0);
  header.write(`${checksum.toString(8)}\0 `, 148, 8, `utf-8`); // Write checksum in octal followed by null and space


  return Buffer.concat([
    header,
    contentBuffer,
    Buffer.alloc(512 - (contentBuffer.length % 512)),
  ]);
}

const mockPackageTarGz = gzipSync(Buffer.concat([
  createSimpleTarArchive(`package/bin/customPkgManager.js`, `#!/usr/bin/env node\nconsole.log("customPkgManager: Hello from custom registry");\n`, 0o755),
  createSimpleTarArchive(`package/bin/pnpm.js`, `#!/usr/bin/env node\nconsole.log("pnpm: Hello from custom registry");\n`, 0o755),
  createSimpleTarArchive(`package/bin/yarn.js`, `#!/usr/bin/env node\nconsole.log("yarn: Hello from custom registry");\n`, 0o755),
  createSimpleTarArchive(`package/package.json`, JSON.stringify({bin: {yarn: `bin/yarn.js`, pnpm: `bin/pnpm.js`, customPkgManager: `bin/customPkgManager.js`}})),
  Buffer.alloc(1024),
]));
const shasum = createHash(`sha1`).update(mockPackageTarGz).digest(`hex`);


const server = createServer((req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith(`Bearer `) || Buffer.from(auth.slice(`Bearer `.length), `base64`).toString() !== `user:pass`) {
    res.statusCode = 401;
    res.end(`Unauthorized`);
    return;
  }
  switch (req.url) {
    case `/yarn`: {
      res.end(JSON.stringify({"dist-tags": {
        latest: `1.9998.9999`,
      }, versions: {'1.9998.9999': {
        dist: {
          shasum,
          size: mockPackageTarGz.length,
          noattachment: false,
          tarball: `${process.env.COREPACK_NPM_REGISTRY}/yarn.tgz`,
        },
      }}}));
      break;
    }

    case `/pnpm`: {
      res.end(JSON.stringify({"dist-tags": {
        latest: `1.9998.9999`,
      }, versions: {'1.9998.9999': {
        dist: {
          shasum,
          size: mockPackageTarGz.length,
          noattachment: false,
          tarball: `${process.env.COREPACK_NPM_REGISTRY}/pnpm/-/pnpm-1.9998.9999.tgz`,
        },
      }}}));
      break;
    }

    case `/@yarnpkg/cli-dist`: {
      res.end(JSON.stringify({"dist-tags": {
        latest: `5.9999.9999`,
      }, versions: {'5.9999.9999': {
        bin: {
          yarn: `./bin/yarn.js`,
          yarnpkg: `./bin/yarn.js`,
        },
        dist: {
          shasum,
          size: mockPackageTarGz.length,
          noattachment: false,
          tarball: `${process.env.COREPACK_NPM_REGISTRY}/yarn.tgz`,
        },
      }}}));
      break;
    }

    case `/customPkgManager`: {
      res.end(JSON.stringify({"dist-tags": {
        latest: `1.0.0`,
      }, versions: {'1.0.0': {
        bin: {
          customPkgManager: `./bin/customPkgManager.js`,
        },
        dist: {
          shasum,
          size: mockPackageTarGz.length,
          noattachment: false,
          tarball: `${process.env.COREPACK_NPM_REGISTRY}/customPkgManager/-/customPkgManager-1.0.0.tgz`,
        },
      }}}));
      break;
    }

    case `/pnpm/-/pnpm-1.9998.9999.tgz`:
    case `/yarn.tgz`:
    case `/customPkgManager/-/customPkgManager-1.0.0.tgz`:
      res.end(mockPackageTarGz);
      break;

    default:
      throw new Error(`unsupported request`, {cause: req.url});
  }
}).listen(0, `localhost`);

await once(server, `listening`);

const {address, port} = server.address();
process.env.COREPACK_NPM_REGISTRY = `http://user:pass@${address.includes(`:`) ? `[${address}]` : address}:${port}`;

server.unref();
