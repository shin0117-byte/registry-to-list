import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.wasm':'application/wasm', '.gz':'application/gzip', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg' };
createServer(async (req, res) => {
  const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const target = normalize(join(root, relative));
  if (!target.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
  try { const info = await stat(target); if (!info.isFile()) throw new Error('not file'); const data = await readFile(target); res.writeHead(200, {'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store'}).end(data); }
  catch { res.writeHead(404).end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('http://127.0.0.1:4173'));
