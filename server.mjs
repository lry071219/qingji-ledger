import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.gz':'application/gzip'};
const server = http.createServer((req,res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch {res.writeHead(400).end(); return;}
  const target = path.resolve(root, '.' + (url === '/' ? '/index.html' : url));
  if (!target.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
  fs.stat(target,(err,stat) => {
    if(err || !stat.isFile()) {res.writeHead(404).end('Not found'); return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    fs.createReadStream(target).pipe(res);
  });
});
server.listen(4173,'0.0.0.0',()=>console.log('Local: http://localhost:4173'));
