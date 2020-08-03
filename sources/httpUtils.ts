import https, {RequestOptions} from 'https';
import {IncomingMessage} from 'http';

export function fetchUrlStream(url: string, options: RequestOptions = {}) {
    return new Promise<IncomingMessage>((resolve, reject) => {
        const request = https.get(url, options, response => {
            const statusCode = response.statusCode ?? 500;
            if (!(statusCode >= 200 && statusCode < 300))
                return reject(new Error(`Server answered with HTTP ${statusCode}`));

            resolve(response);
        });

        request.on(`error`, err => {
            reject(err);
        });
    });
}

export async function fetchAsBuffer(url: string, options?: RequestOptions) {
    const response = await fetchUrlStream(url, options);

    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];

        response.on(`data`, chunk => {
            chunks.push(chunk);                
        });

        response.on(`error`, error => {
            reject(error);
        });

        response.on(`end`, () => {
            resolve(Buffer.concat(chunks));
        });
    });
}

export async function fetchAsJson(url: string, options?: RequestOptions) {
    const buffer = await fetchAsBuffer(url, options);
    const asText = buffer.toString();

    try {
        return JSON.parse(asText);
    } catch (error) {
        const truncated = asText.length > 30
            ? asText.slice(0, 30) + `...`
            : asText;

        throw new Error(`Couldn't parse JSON data: ${JSON.stringify(truncated)}`);
    }
}
