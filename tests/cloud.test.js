import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as sqlite from 'node:sqlite';
import { openDatabase } from '../src/database.js';
import { createApiHandler } from '../src/api.js';
import vercelHandler from '../api/index.js';
import { blankStore } from '../src/store.js';
import { readdir, readFile } from 'node:fs/promises';

test('Turso HTTP grava, recupera em outra instância e protege alterações concorrentes', async () => {
 const db = new (sqlite.Database ?? sqlite.DatabaseSync)(':memory:');
 const fetchImpl = async (url,options) => {
  assert.equal(url,'https://test.turso.io/v2/pipeline');
  assert.equal(options.headers.Authorization,'Bearer test-only-token');
  assert.equal(options.redirect,'error');
  const payload = JSON.parse(options.body);
  assert.equal(payload.requests.at(-1).type,'close');
  const {sql,args} = payload.requests[0].stmt;
  const values = args.map(arg => arg.type === 'integer' ? Number(arg.value) : arg.value);
  const stmt = db.prepare(sql); let rows = [], changes = 0;
  if (/^SELECT/.test(sql)) rows = stmt.all(...values); else changes = Number(stmt.run(...values).changes);
  const cols = rows.length ? Object.keys(rows[0]).map(name => ({name})) : [];
  return {ok:true,json:async () => ({results:[{type:'ok',response:{type:'execute',result:{cols,rows:rows.map(row => cols.map(c => ({type:typeof row[c.name] === 'number' ? 'integer' : 'text',value:String(row[c.name])}))),affected_row_count:changes}}}]})};
 };
 const options = {url:'libsql://test.turso.io',authToken:'test-only-token',fetchImpl,cloud:true};
 const first = await openDatabase(options), second = await openDatabase(options);
 const token = 'a'.repeat(32), state = blankStore();
 state.config.players[0].name = 'João';
 await first.execute('INSERT INTO tables VALUES (?, 1, ?, ?)',[token,JSON.stringify(state),'today']);
 const loaded = (await second.execute('SELECT revision, state, updated_at FROM tables WHERE token = ?',[token])).rows[0];
 assert.equal(loaded.revision,1); assert.equal(JSON.parse(loaded.state).config.players[0].name,'João');
 const writes = await Promise.all([first,second].map(client => client.execute('UPDATE tables SET revision = revision + 1 WHERE token = ? AND revision = ?',[token,1])));
 assert.deepEqual(writes.map(w => w.changes).sort(),[0,1]);
 first.close(); second.close(); db.close();
});

test('falha HTTP ou erro SQL não confirma uma gravação', async () => {
 for (const fetchImpl of [async () => ({ok:false}),async () => ({ok:true,json:async () => ({results:[{type:'error',error:{message:'private internal detail'}}]})})]) {
  await assert.rejects(openDatabase({url:'https://test.turso.io',authToken:'test-only-token',fetchImpl}),/banco Turso/);
 }
 await assert.rejects(openDatabase({url:'http://test.turso.io',authToken:'test-only-token'}),/URL HTTPS/);
 await assert.rejects(openDatabase({url:'https://test.turso.io',authToken:''}),/TURSO_AUTH_TOKEN/);
 await assert.rejects(openDatabase({url:'',cloud:true}),/TURSO_DATABASE_URL/);
});

test('handler Vercel aceita corpo JSON já interpretado e o caminho reescrito', async () => {
 const db = await openDatabase({databasePath:':memory:',url:'',cloud:false});
 const handler = createApiHandler({getDatabase:() => db});
 const invoke = async (url,method,body,authorization) => {
  let status, output;
  await handler({url,method,body,headers:{host:'mesa.vercel.app','content-type':'application/json',authorization}}, {writeHead(code){status=code},end(value){output=JSON.parse(value)}});
  return {status,body:output};
 };
 const created = await invoke('/api/index?route=tables','POST',{state:blankStore()});
 assert.equal(created.status,201);
 const auth = `Bearer ${created.body.token}`;
 const loaded = await invoke('/api/index?route=table','GET',undefined,auth);
 assert.equal(loaded.status,200);
 const state = loaded.body.state; state.config.players[0].name='Ana';
 const saved = await invoke('/api/index?route=table','PUT',{revision:1,state},auth);
 assert.equal(saved.status,200); assert.equal(saved.body.revision,2);
 assert.equal((await invoke('/api/index?route=table','PUT',{revision:1,state},auth)).status,409);
 assert.equal((await invoke('/api/index?route=info','GET')).body.addresses.length,0);
 assert.equal((await invoke('/api/index?route=health','GET')).status,200);
 assert.equal((await invoke('/api/index?route=tables','POST',{state:'x'.repeat(4*1024*1024)})).status,413);
 db.close();
});

test('sem configuração de nuvem, função responde 503 e não cria banco descartável', async () => {
 const oldUrl = process.env.TURSO_DATABASE_URL, oldToken = process.env.TURSO_AUTH_TOKEN;
 delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
 let status, output;
 try {
  await vercelHandler({url:'/api/health',method:'GET',headers:{host:'mesa.vercel.app'}},{writeHead(code){status=code},end(body){output=JSON.parse(body)}});
  assert.equal(status,503); assert.match(output.error,/Banco indisponível/);
 } finally {
  if (oldUrl !== undefined) process.env.TURSO_DATABASE_URL=oldUrl;
  if (oldToken !== undefined) process.env.TURSO_AUTH_TOKEN=oldToken;
 }
});

test('saída pública contém somente a interface e o regulamento', async () => {
 const collect = async dir => (await Promise.all((await readdir(dir,{withFileTypes:true})).map(async file => file.isDirectory() ? (await collect(`${dir}/${file.name}`)).map(name => `${file.name}/${name}`) : [file.name]))).flat();
 assert.deepEqual((await collect('public')).sort(),['assets/icon.svg','docs/regulamento_fodinha.pdf','index.html','manifest.webmanifest','sw.js']);
 const html = await readFile('public/index.html','utf8');
 assert.match(html,/Finalizar rodada/); assert.doesNotMatch(html,/TURSO_AUTH_TOKEN|TURSO_DATABASE_URL/);
});
