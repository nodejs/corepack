"use strict";
const path = require(`node:path`);
const crypto = require(`node:crypto`);
const SQLite3 = require(`better-sqlite3`);

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
      if (init[key] === undefined) continue;

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

if (process.env.NOCK_ENV === `record`) {
  const insertNockStatement = db.prepare(`INSERT OR REPLACE INTO nocks (hash, body, headers, status) VALUES (?, ?, jsonb(?), ?)`);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await realFetch(input, init);
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
} else if (process.env.NOCK_ENV === `replay`) {
  const getNockStatement = db.prepare(`SELECT body, json(headers) as headers, status FROM nocks WHERE hash = ?`);

  globalThis.fetch = async (input, init) => {
    const requestHash = getRequestHash(input, init);

    const mock = getNockStatement.get(requestHash);
    if (!mock) throw new Error(`No mock found for ${input}; run the tests with NOCK_ENV=record to generate one`);

    return new Response(mock.body, {
      status: mock.status,
      headers: JSON.parse(mock.headers),
    });
  };
}
