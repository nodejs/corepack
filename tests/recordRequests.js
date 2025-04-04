"use strict";
const path = require(`node:path`);
const crypto = require(`node:crypto`);
const SQLite3 = require(`better-sqlite3`);
const FakeTimers = require(`@sinonjs/fake-timers`);

const db = new SQLite3(path.join(__dirname, `nocks.db`));
process.once(`exit`, () => {
  db.close();
});

db.exec(`CREATE TABLE IF NOT EXISTS nocks (
  hash BLOB PRIMARY KEY NOT NULL,
  body BLOB NOT NULL,
  headers BLOB NOT NULL,
  status INTEGER NOT NULL
)`);


/**
 * @param {string | URL} input
 * @param {RequestInit | undefined} init
 */
function getRequestHash(input, init) {
  const hash = crypto.createHash(`sha256`);
  hash.update(`${input}\0`);

  if (init) {
    for (const key in init) {
      if (init[key] === undefined || key === `signal`) continue;

      switch (key) {
        case `headers`:
          hash.update(`${JSON.stringify(Object.fromEntries(new Headers(init.headers || {})))}\0`);
          break;
        default:
          throw new Error(`Hashing for "${key}" not implemented`);
      }
    }
  }

  return hash.digest();
}

const originalFetch = globalThis.fetch;
const passthroughUrls = [];

if (process.env.NOCK_ENV === `record`) {
  const insertNockStatement = db.prepare(`INSERT OR REPLACE INTO nocks (hash, body, headers, status) VALUES (?, ?, jsonb(?), ?)`);

  globalThis.fetch = async (input, init) => {
    if (passthroughUrls.some(passThrough => input.toString().startsWith(passThrough)))
      return originalFetch(input, init);
    if (process.env.BLOCK_SIGSTORE_TUF_REQUESTS && input.toString().startsWith(`https://tuf-repo-cdn.sigstore.dev`))
      throw new Error(`Request to Sigstore TUF repository are blocked`);


    const response = await originalFetch(input, init);
    const data = await response.arrayBuffer();

    const minimalHeaders = new Headers();
    for (const headerName of [`content-type`, `content-length`]) {
      const headerValue = response.headers.get(headerName);
      if (headerValue != null) {
        minimalHeaders.set(headerName, headerValue);
      }
    }

    const requestHash = getRequestHash(input, init);
    insertNockStatement.run(
      requestHash,
      Buffer.from(data),
      JSON.stringify(Object.fromEntries(minimalHeaders)),
      response.status,
    );

    return new Response(data, {
      status: response.status,
      headers: minimalHeaders,
    });
  };
} else {
  FakeTimers.install({
    // When you re-record requests this needs to be set to the time of the
    // recording so that TUF accepts recorded requests.
    now: new Date(`2025-04-09`),
    toFake: [`Date`],
  });

  const getNockStatement = db.prepare(`SELECT body, json(headers) as headers, status FROM nocks WHERE hash = ?`);

  globalThis.fetch = async (input, init) => {
    if (passthroughUrls.some(passThrough => input.toString().startsWith(passThrough)))
      return originalFetch(input, init);
    if (process.env.BLOCK_SIGSTORE_TUF_REQUESTS && input.toString().startsWith(`https://tuf-repo-cdn.sigstore.dev`))
      throw new Error(`Request to Sigstore TUF repository are blocked`);

    const requestHash = getRequestHash(input, init);

    const mock = getNockStatement.get(requestHash);
    if (!mock) {
      // Crash process so that corepack cannot catch this error
      console.error(Error(`No mock found for ${input}; run the tests with NOCK_ENV=record to generate one`));
      process.exit(10);
    }

    return new Response(mock.body, {
      status: mock.status,
      headers: JSON.parse(mock.headers),
    });
  };
}

globalThis.fetch.passthroughUrls = passthroughUrls;
