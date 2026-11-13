import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAppServer } from '../server.mjs';
import { blankStore } from '../src/store.js';

const listen = async server => {
 await new Promise((resolve, reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
 return `http://127.0.0.1:${server.address().port}`;
};
const close = server => new Promise((resolve,reject) => server.close(error => error ? reject(error) : resolve()));

test('SQLite salva em disco, retoma após reinício, isola mesas e rejeita alterações concorrentes', async () => {
 const dir = await mkdtemp(path.join(tmpdir(),'fodinha-test-'));
 const databasePath = path.join(dir,'test.sqlite');
 let server = createAppServer({databasePath});
 let base = await listen(server);
 try {
  const created = await fetch(`${base}/api/tables`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(created.status,201);
  const table = await created.json(); assert.match(table.token,/^[a-f0-9]{32}$/);
  const headers = {'Content-Type':'application/json',Authorization:`Bearer ${table.token}`};
  const state = blankStore(); state.config.players[0].name = 'Ana';
  const body = JSON.stringify({revision:1,state});
  const writes = await Promise.all([1,2].map(() => fetch(`${base}/api/table`,{method:'PUT',headers,body})));
  assert.deepEqual(writes.map(r => r.status).sort(),[200,409]);
  await Promise.all(writes.map(r => r.arrayBuffer()));
  assert.equal((await fetch(`${base}/api/table`)).status,401);
  assert.equal((await fetch(`${base}/api/table`,{headers:{Authorization:`Bearer ${'0'.repeat(32)}`}})).status,404);
  assert.equal((await fetch(`${base}/data/fodinha.sqlite`)).status,404);
  assert.equal((await fetch(`${base}/server.mjs`)).status,404);
  assert.equal((await fetch(`${base}/api/table`,{method:'PUT',headers,body:JSON.stringify({revision:2,state:{version:2}})})).status,400);
  assert.equal((await fetch(`${base}/api/table`,{method:'PUT',headers:{...headers,Origin:'https://other.example'},body})).status,403);
  await close(server);
  server = createAppServer({databasePath}); base = await listen(server);
  const saved = await (await fetch(`${base}/api/table`,{headers})).json();
  assert.equal(saved.revision,2); assert.equal(saved.state.config.players[0].name,'Ana');
  const pdf = await fetch(`${base}/docs/regulamento_fodinha.pdf`); assert.equal(pdf.status,200); assert.equal(pdf.headers.get('content-type'),'application/pdf'); await pdf.arrayBuffer();
  const page = await fetch(base); assert.equal(page.status,200); assert.match(await page.text(),/Finalizar rodada/);
 } finally {
  if (server.listening) await close(server);
  for (const name of ['test.sqlite','test.sqlite-wal','test.sqlite-shm']) await unlink(path.join(dir,name)).catch(error => {if (error.code !== 'ENOENT') throw error;});
  await rmdir(dir);
 }
});
