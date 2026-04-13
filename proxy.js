const http = require('http');
const httpProxy = require('http-proxy');

const proxy = httpProxy.createProxyServer({});

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    // Proxy API requests to Flask backend
    proxy.web(req, res, { target: 'http://127.0.0.1:5000', changeOrigin: true }, (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway: ' + err.message);
    });
  } else {
    // Proxy static files to Python HTTP server
    proxy.web(req, res, { target: 'http://127.0.0.1:8080', changeOrigin: true }, (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway: ' + err.message);
    });
  }
});

// Handle SSE (Server-Sent Events) - disable buffering
server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head);
});

server.listen(8000, '0.0.0.0', () => {
  console.log('Proxy server running on port 8000');
  console.log('  /api/* -> Flask (5000)');
  console.log('  /*    -> Static (8080)');
});
