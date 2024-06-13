import {createHash, createSign, generateKeyPairSync} from 'node:crypto';
import {once}                                        from 'node:events';
import {createServer}                                from 'node:http';
import {connect}                                     from 'node:net';
import {gzipSync}                                    from 'node:zlib';

let privateKey, keyid;

switch (process.env.TEST_INTEGRITY) {
  case `invalid_signature`: {
    ({privateKey} = generateKeyPairSync(`ec`, {
      namedCurve: `sect239k1`,
    }));
  }
  // eslint-disable-next-line no-fallthrough
  case `invalid_integrity`:
  case `valid`: {
    const {privateKey: p, publicKey} = generateKeyPairSync(`ec`, {
      namedCurve: `sect239k1`,
      publicKeyEncoding: {
        type: `spki`,
        format: `pem`,
      },
    });
    privateKey ??= p;
    keyid = `SHA256:${createHash(`SHA256`).end(publicKey).digest(`base64`)}`;
    process.env.COREPACK_INTEGRITY_KEYS = JSON.stringify({npm: [{
      expires: null,
      keyid,
      keytype: `ecdsa-sha2-sect239k1`,
      scheme: `ecdsa-sha2-sect239k1`,
      key: publicKey.split(`\n`).slice(1, -2).join(``),
    }]});
    break;
  }
}


function createSimpleTarArchive(fileName, fileContent, mode = 0o644) {
  const contentBuffer = Buffer.from(fileContent);

  const header = Buffer.alloc(512); // TAR headers are 512 bytes
  header.write(fileName);
  header.write(`100${mode.toString(8)} `, 100, 7, `utf-8`); // File mode (octal) followed by a space
  header.write(`0001750 `, 108, 8, `utf-8`); // Owner's numeric user ID (octal) followed by a space
  header.write(`0001750 `, 116, 8, `utf-8`); // Group's numeric user ID (octal) followed by a space
  header.write(`${contentBuffer.length.toString(8)} `, 124, 12, `utf-8`); // File size in bytes (octal) followed by a space
  header.write(`${Math.floor(new Date(2000, 1, 1) / 1000).toString(8)} `, 136, 12, `utf-8`); // Last modification time in numeric Unix time format (octal) followed by a space
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
const integrity = `sha512-${createHash(`sha512`).update(
  process.env.TEST_INTEGRITY === `invalid_integrity` ?
    mockPackageTarGz.subarray(1) :
    mockPackageTarGz,
).digest(`base64`)}`;

const registry = {
  __proto__: null,
  yarn: [`1.9998.9999`],
  pnpm: [`1.9998.9999`],
  // eslint-disable-next-line @typescript-eslint/naming-convention
  '@yarnpkg/cli-dist': [`5.9999.9999`],
  customPkgManager: [`1.0.0`],
};

function generateSignature(packageName, version) {
  if (privateKey == null) return undefined;
  const sign = createSign(`SHA256`).end(`${packageName}@${version}:${integrity}`);
  return {signatures: [{
    keyid,
    sig: sign.sign(privateKey, `base64`),
  }]};
}
function generateVersionMetadata(packageName, version) {
  return {
    name: packageName,
    version,
    bin: {
      [packageName]: `./bin/${packageName}.js`,
    },
    dist: {
      integrity,
      shasum,
      size: mockPackageTarGz.length,
      noattachment: false,
      tarball: `https://registry.npmjs.org/${packageName}/-/${packageName}-${version}.tgz`,
      ...generateSignature(packageName, version),
    },
  };
}

const TOKEN_MOCK = `SOME_DUMMY_VALUE`;

const server = createServer((req, res) => {
  const auth = req.headers.authorization;

  if (
    auth == null ||
    (auth.startsWith(`Bearer `) && auth.slice(`Bearer `.length) !== TOKEN_MOCK) ||
    (auth.startsWith(`Basic `) && Buffer.from(auth.slice(`Basic `.length), `base64`).toString() !== `user:pass`) ||
    !/^(Basic|Bearer) /.test(auth)
  ) {
    res.writeHead(401).end(`Unauthorized`);
    return;
  }

  let slashPosition = req.url.indexOf(`/`, 1);
  if (req.url.charAt(1) === `@`) slashPosition = req.url.indexOf(`/`, slashPosition + 1);

  const packageName = req.url.slice(1, slashPosition === -1 ? undefined : slashPosition);
  if (packageName in registry) {
    if (req.url === `/${packageName}`) {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      res.end(JSON.stringify({"dist-tags": {
        latest: registry[packageName].at(-1),
      }, versions: Object.fromEntries(registry[packageName].map(version =>
        [version, generateVersionMetadata(packageName, version)],
      ))}));
      return;
    }
    const isDownloadingRequest = req.url.slice(packageName.length + 1, packageName.length + 4) === `/-/`;
    let version;
    if (isDownloadingRequest) {
      const match = /^(.+)-(.+)\.tgz$/.exec(req.url.slice(packageName.length + 4));
      if (match?.[1] === packageName) {
        version = match[2];
      }
    } else {
      version = req.url.slice(packageName.length + 2);
    }
    if (version === `latest`) version = registry[packageName].at(-1);
    if (registry[packageName].includes(version)) {
      res.end(
        isDownloadingRequest ?
          mockPackageTarGz :
          JSON.stringify(generateVersionMetadata(packageName, version)),
      );
    } else {
      res.writeHead(404).end(`Not Found`);
      throw new Error(`unsupported request`, {cause: {url: req.url, packageName, version, isDownloadingRequest}});
    }
  } else {
    res.writeHead(500).end(`Internal Error`);
    throw new Error(`unsupported request`, {cause: {url: req.url, packageName}});
  }
});

if (process.env.AUTH_TYPE === `PROXY`) {
  const proxy = createServer((req, res) => {
    res.writeHead(200, {[`Content-Type`]: `text/plain`});
    res.end(`okay`);
  });
  proxy.on(`connect`, (req, clientSocket, head) => {
    if (req.url !== `example.com:80`) {
      // Reject all requests except those to `example.com`
      clientSocket.end(`HTTP/1.1 404 Not Found\r\n\r\n`);
      return;
    }
    const {address, port} = server.address();
    const serverSocket = connect(port, address, () => {
      clientSocket.write(`HTTP/1.1 200 Connection Established\r\n` +
      `Proxy-agent: Node.js-Proxy\r\n` +
      `\r\n`);
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });
  });
  proxy.listen(0, `localhost`);
  await once(proxy, `listening`);
  const {address, port} = proxy.address();
  process.env.ALL_PROXY = `http://${address.includes(`:`) ? `[${address}]` : address}:${port}`;

  proxy.unref();
}

server.listen(0, `localhost`);
await once(server, `listening`);

const {address, port} = server.address();
switch (process.env.AUTH_TYPE) {
  case `PROXY`:
    // The proxy set up above will redirect all requests to our custom registry,
    process.env.COREPACK_NPM_REGISTRY = `http://user:pass@example.com`;
    break;

  case `COREPACK_NPM_REGISTRY`:
    process.env.COREPACK_NPM_REGISTRY = `http://user:pass@${address.includes(`:`) ? `[${address}]` : address}:${port}`;
    break;

  case `COREPACK_NPM_TOKEN`:
    process.env.COREPACK_NPM_REGISTRY = `http://${address.includes(`:`) ? `[${address}]` : address}:${port}`;
    process.env.COREPACK_NPM_TOKEN = TOKEN_MOCK;
    break;

  case `COREPACK_NPM_PASSWORD`:
    process.env.COREPACK_NPM_REGISTRY = `http://${address.includes(`:`) ? `[${address}]` : address}:${port}`;
    process.env.COREPACK_NPM_USERNAME = `user`;
    process.env.COREPACK_NPM_PASSWORD = `pass`;
    break;

  default: throw new Error(`Invalid AUTH_TYPE in env`, {cause: process.env.AUTH_TYPE});
}

if (process.env.NOCK_ENV === `replay`) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function fetch(i) {
    if (!`${i}`.startsWith(
      process.env.AUTH_TYPE === `PROXY` ?
        `http://example.com` :
        `http://${address.includes(`:`) ? `[${address}]` : address}:${port}`))
      throw new Error(`Unexpected request to  ${i}`);

    return Reflect.apply(originalFetch, this, arguments);
  };
}

server.unref();
