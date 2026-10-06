import { createServer } from 'node:http';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  function getOption(name: string): string | undefined {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? undefined : args[index + 1];
  }

  const portText = getOption('port');
  const originText = getOption('origin');
  const clearCache = args.includes('--clear-cache');

  if (!portText) {
    console.error('Usage: --port <port> [--origin <url>] [--clear-cache]');
    process.exitCode = 1;
    return;
  }

  const port = Number(portText);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('--port must be an integer between 1 and 65535');
    process.exitCode = 1;
    return;
  }

  if (clearCache) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/__admin/cache/clear`,
        { method: 'POST' },
      );

      if (!response.ok) {
        throw new Error(`Proxy returned HTTP ${response.status}`);
      }

      console.log('Cache cleared');
    } catch (error) {
      console.error('Could not clear the cache:', error);
      process.exitCode = 1;
    }

    return;
  }

  if (!originText) {
    console.error('Usage: --port <port> --origin <url>');
    process.exitCode = 1;
    return;
  }

  let origin: URL;
  try {
    origin = new URL(originText);
  } catch {
    console.error('--origin must be a valid URL');
    process.exitCode = 1;
    return;
  }

  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') {
    console.error('--origin must use http or https');
    process.exitCode = 1;
    return;
  }

  const cache = new Map<
    string,
    { status: number; contentType: string; body: Buffer }
  >();

  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;

    if (path === '/__admin/cache/clear') {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }

      cache.clear();
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const upstreamUrl = new URL(req.url ?? '/', origin);

      const cacheKey = upstreamUrl.toString();
      const cached = cache.get(cacheKey);

      if (req.method === 'GET' && cached) {
        res.writeHead(cached.status, {
          'content-type': cached.contentType,
          'x-cache': 'HIT',
        });
        res.end(cached.body);
        return;
      }

      const upstream = await fetch(upstreamUrl);
      const body = await upstream.arrayBuffer();

      const contentType =
        upstream.headers.get('content-type') ?? 'application/octet-stream';
      const responseBody = Buffer.from(body);

      if (req.method === 'GET' && upstream.ok) {
        cache.set(cacheKey, {
          status: upstream.status,
          contentType,
          body: responseBody,
        });
      }

      res.writeHead(upstream.status, {
        'content-type': contentType,
        'x-cache': 'MISS',
      });
      res.end(responseBody);
    } catch (error) {
      console.error('Request to origin failed:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway\n');
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Proxy listening at http://127.0.0.1:${port}`);
    console.log(`Origin configured as ${origin.origin}`);
  });
}

void main();