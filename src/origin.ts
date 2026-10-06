import { createServer } from 'node:http';

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ message: 'Hello from the origin!' }));
});

server.listen(4000, '127.0.0.1', () => {
  console.log('Origin listening at http://127.0.0.1:4000');
});