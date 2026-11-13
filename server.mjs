import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { openDatabase } from './src/database.js';
import { createApiHandler } from './src/api.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.pdf':'application/pdf'};
export function createAppServer({databasePath = process.env.DATABASE_PATH || path.join(root,'data','fodinha.sqlite'), databaseUrl = process.env.TURSO_DATABASE_URL, authToken = process.env.TURSO_AUTH_TOKEN} = {}) {
 let database, opening;
 const api = createApiHandler({
  getDatabase:() => {
   opening ??= openDatabase({databasePath,url:databaseUrl,authToken}).then(db => database = db).catch(error => {opening = undefined; throw error;});
   return opening;
  },
  addresses:() => Object.values(networkInterfaces()).flat().filter(x => x.family === 'IPv4' && !x.internal).map(x => `http://${x.address}:${server.address().port}`)
 });
 const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer');
  try {
   const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if (pathname.startsWith('/api/')) return await api(req,res);
   if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405); return res.end();}
   const allowed = ['/','/index.html','/styles.css','/manifest.webmanifest','/sw.js','/assets/icon.svg','/docs/regulamento_fodinha.pdf','/src/app.js','/src/engine.js','/src/store.js'];
   if (!allowed.includes(pathname)) {res.writeHead(404); return res.end('Arquivo não encontrado');}
   const file = path.join(root,pathname === '/' ? 'index.html' : pathname.slice(1));
   const info = await stat(file);
   if (!info.isFile()) {res.writeHead(404); return res.end();}
   res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache'});
   if (req.method === 'HEAD') return res.end();
   createReadStream(file).on('error',() => res.destroy()).pipe(res);
  } catch (error) {
   if (!res.headersSent) {res.writeHead(error.code === 'ENOENT' ? 404 : 400); res.end('Não foi possível abrir este endereço.');}
   else res.destroy();
  }
 });
 server.on('close',() => database?.close());
 return server;
}
export function startServer() {
 const port = Number(process.env.PORT || 3000), server = createAppServer();
 server.on('error',error => {console.error(error.code === 'EADDRINUSE' ? `A porta ${port} está ocupada. Escolha outra com PORT.` : error.message); process.exitCode=1;});
 server.listen(port,process.env.HOST || '0.0.0.0',() => {
  console.log(`Fodinha Stara: http://localhost:${port}`);
  for (const item of Object.values(networkInterfaces()).flat()) if (item.family === 'IPv4' && !item.internal) console.log(`Celulares na mesma rede: http://${item.address}:${port}`);
 });
 return server;
}
