import {UsageError} from 'clipanion';

export async function fetchWrapper(input: string | URL, init?: RequestInit) {
  if (process.env.COREPACK_ENABLE_NETWORK === `0`)
    throw new UsageError(`Network access disabled by the environment; can't reach ${input}`);

  let response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    throw new Error(`Error when performing the request to ${input}; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting`, {cause: error});
  }

  if (!response.ok) {
    await response.arrayBuffer();
    throw new Error(`Server answered with HTTP ${response.status} when performing the request to ${input}; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting`);
  }

  return response;
}
