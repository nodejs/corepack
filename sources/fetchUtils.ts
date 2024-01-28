import {UsageError} from 'clipanion';

export async function fetchWrapper(input: string | URL, init?: RequestInit) {
  if (process.env.COREPACK_ENABLE_NETWORK === `0`)
    throw new UsageError(`Network access disabled by the environment; can't reach ${input}`);

  const agent = await getAgent(input);

  let response;
  try {
    response = await fetch(input, {
      ...init,
      dispatcher: agent,
    });
  } catch (error) {
    throw new Error(`Error when performing the request to ${input}; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting`, {cause: error});
  }

  if (!response.ok) {
    await response.arrayBuffer();
    throw new Error(`Server answered with HTTP ${response.status} when performing the request to ${input}; for troubleshooting help, see https://github.com/nodejs/corepack#troubleshooting`);
  }

  return response;
}

async function getAgent(input: string | URL) {
  const {getProxyForUrl} = await import(`proxy-from-env`);

  const proxy = getProxyForUrl(input.toString());

  if (!proxy)
    return undefined;

  // Doing a deep import here since undici isn't tree-shakeable
  const {default: ProxyAgent} = (await import(
    // @ts-expect-error No types for this specific file
    `undici/lib/proxy-agent.js`
  )) as { default: typeof import('undici').ProxyAgent };

  return new ProxyAgent(proxy);
}
