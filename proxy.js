const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    // Collect request body first, then proxy to Flask
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);

      const options = {
        hostname: '127.0.0.1',
        port: 5000,
        path: req.url,
        method: req.method,
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/json',
          'Content-Length': body.length,
        },
        timeout: 120000,
      };

      const proxyReq = http.request(options, (proxyRes) => {
        // Filter out hop-by-hop headers that Node handles automatically
        const headers = { ...proxyRes.headers };
        delete headers['transfer-encoding'];  // Node adds its own chunked encoding
        delete headers['connection'];          // Node manages connection
        delete headers['keep-alive'];

        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res, { end: true });
      });

      proxyReq.on('error', (err) => {
        console.error('Proxy error:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: '代理请求失败: ' + err.message }));
        } else {
          res.end();
        }
      });

      proxyReq.on('timeout', () => {
        console.error('Proxy timeout');
        proxyReq.destroy();
      });

      proxyReq.write(body);
      proxyReq.end();
    });

    req.on('error', (err) => {
      console.error('Request error:', err.message);
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '请求读取失败' }));
      }
    });

  } else {
    // Static files - pipe directly
    const options = {
      hostname: '127.0.0.1',
      port: 8080,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const headers = { ...proxyRes.headers };
      delete headers['transfer-encoding'];
      delete headers['connection'];
      delete headers['keep-alive'];

      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
      }
      res.end('Bad Gateway');
    });

    req.pipe(proxyReq, { end: true });
  }
});

server.timeout = 120000;
server.listen(8000, '0.0.0.0', () => {
  console.log('Proxy server running on port 8000');
  console.log('  /api/* -> Flask (5000) [SSE + large body supported]');
  console.log('  /*    -> Static (8080)');
});
