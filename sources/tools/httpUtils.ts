import got from 'got';

export function fetchUrlStream(url: string) {
    return got.stream(url);
}

export async function fetchUrlBuffer(url: string) {
    const stream = await fetchUrlStream(url);

    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];

        stream.on(`data`, chunk => {
            chunks.push(chunk);
        });

        stream.on(`end`, () => {
            try {
                resolve(Buffer.concat(chunks));
            } catch (error) {
                reject(error);
            }
        });
    });
}

export async function fetchUrlText(url: string) {
    const buffer = await fetchUrlBuffer(url);

    return buffer.toString();
}

export async function fetchUrlJson(url: string) {
    const content = await fetchUrlText(url);

    return JSON.parse(content);
}
