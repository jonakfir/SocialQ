/**
 * Minimal HTTP server for App Runner / Docker debugging only.
 * Temporarily set Dockerfile CMD to: node server-minimal.js
 * Revert to server.js for production.
 */
const http = require('http');
const PORT = Number(process.env.PORT) || 8080;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[minimal] Listening on 0.0.0.0:${PORT}`);
});
