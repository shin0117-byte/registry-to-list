import { createServer } from 'node:http';
import { access, readFile, stat } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
const root = process.cwd();
const installer = join(root, '安裝PaddleOCR精準模式.cmd');
const venvPython = join(root, '.paddleocr-venv', 'Scripts', 'python.exe');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.wasm':'application/wasm', '.gz':'application/gzip', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg' };
const hasPython = () => ['py', 'python'].some(command => { const result = spawnSync(command, ['--version'], { windowsHide: true }); return result.status === 0; });
const sendJson = (res, status, payload) => { const body = Buffer.from(JSON.stringify(payload)); res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }).end(body); };
const hasFile = async path => { try { await access(path); return true; } catch { return false; } };
createServer(async (req, res) => {
  const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (req.method === 'GET' && requestPath === '/api/paddleocr-status') return sendJson(res, 200, { pythonAvailable: hasPython(), installed: await hasFile(venvPython) });
  if (req.method === 'POST' && requestPath === '/api/start-paddleocr-install') {
    if (!hasPython()) return sendJson(res, 409, { code: 'python-required' });
    if (!(await hasFile(installer))) return sendJson(res, 500, { code: 'installer-missing' });
    const setup = spawn('cmd.exe', ['/c', 'start', 'PaddleOCR precision setup', installer], { detached: true, stdio: 'ignore', windowsHide: false });
    setup.unref(); return sendJson(res, 202, { started: true });
  }
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, ''); const target = normalize(join(root, relative));
  if (!target.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
  try { const info = await stat(target); if (!info.isFile()) throw new Error('not file'); const data = await readFile(target); res.writeHead(200, {'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control':'no-store'}).end(data); }
  catch { res.writeHead(404).end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log('http://127.0.0.1:4173'));
