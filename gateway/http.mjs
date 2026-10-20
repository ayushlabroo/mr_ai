import http from 'node:http';

const MAX_BODY_BYTES = 64_000;

export function createGatewayHttpServer({ gateway, port }) {
  const server = http.createServer(
    { requestTimeout: 10_000, headersTimeout: 5000, maxHeaderSize: 8192 },
    async (req, res) => {
      // A runtime fixture may ask the OS for a free port (listen(0)). Production
      // still binds the explicitly configured port. Unbound parser tests use port.
      const address = server.address();
      const boundPort = address && typeof address === 'object' ? address.port : port;
      function reject(status) {
        res.writeHead(status, { connection: 'close', 'cache-control': 'no-store' });
        res.end();
      }
      // Node's normalized headers discard some duplicates. Reject ambiguous
      // authority/authentication before converting to Fetch Headers.
      if (
        ['host', 'authorization', 'content-type', 'origin'].some(
          (name) => (req.headersDistinct[name]?.length ?? 0) > 1,
        )
      ) {
        reject(400);
        return;
      }
      if (![`127.0.0.1:${boundPort}`, `localhost:${boundPort}`].includes(req.headers.host ?? '')) {
        reject(403);
        return;
      }
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) {
        reject(400);
        return;
      }
      if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
        reject(413);
        return;
      }
      try {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > MAX_BODY_BYTES) {
            reject(413);
            return;
          }
          chunks.push(chunk);
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers))
          if (typeof value === 'string') headers.set(name, value);
        const response = await gateway.handle(
          new Request(`http://127.0.0.1:${boundPort}${req.url}`, {
            method: req.method,
            headers,
            ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }),
          }),
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
      } catch {
        if (res.destroyed) return;
        if (!res.headersSent) reject(400);
        else res.end();
      }
    },
  );
  server.maxConnections = 20;
  return server;
}
