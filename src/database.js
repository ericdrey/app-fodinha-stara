import { mkdirSync } from 'node:fs';
import path from 'node:path';

const schema = 'CREATE TABLE IF NOT EXISTS tables (token TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL, updated_at TEXT NOT NULL)';

// Turso SQL over HTTP: usa fetch nativo, sem instalar um driver.
export async function openDatabase({ databasePath = 'data/fodinha.sqlite', url = process.env.TURSO_DATABASE_URL, authToken = process.env.TURSO_AUTH_TOKEN, cloud = !!process.env.VERCEL, fetchImpl = globalThis.fetch } = {}) {
 let database;
 if (url) {
  const endpoint = new URL(url.replace(/^(libsql|turso):/, 'https:'));
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !['','/'].includes(endpoint.pathname.replace(/\/v2\/pipeline\/?$/, ''))) throw new Error('TURSO_DATABASE_URL deve ser uma URL HTTPS, libsql ou turso válida.');
  if (!authToken) throw new Error('Configure TURSO_AUTH_TOKEN no servidor.');
  endpoint.pathname = '/v2/pipeline';
  database = {
   async execute(sql, args = []) {
    const response = await fetchImpl(endpoint.href, {
     method:'POST', redirect:'error', signal:AbortSignal.timeout(10000),
     headers:{Authorization:`Bearer ${authToken}`, 'Content-Type':'application/json'},
     body:JSON.stringify({requests:[{type:'execute',stmt:{sql,args:args.map(value => Number.isSafeInteger(value) ? {type:'integer',value:String(value)} : {type:'text',value:String(value)}),want_rows:true}},{type:'close'}]})
    });
    if (!response.ok) throw new Error('Não foi possível conectar ao banco Turso. Confira a configuração do servidor.');
    const data = await response.json();
    const entry = data.results?.[0];
    if (entry?.type !== 'ok' || !entry.response?.result) throw new Error('O banco Turso não concluiu a operação.');
    const result = entry.response.result;
    return {
     rows:(result.rows || []).map(row => Object.fromEntries(result.cols.map((column,i) => [column.name, row[i].type === 'integer' ? Number(row[i].value) : row[i].type === 'null' ? null : row[i].value]))),
     changes:Number(result.affected_row_count || 0)
    };
   },
   close() {}
  };
 } else {
  if (cloud) throw new Error('Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN antes de publicar.');
  if (databasePath !== ':memory:') mkdirSync(path.dirname(path.resolve(databasePath)), {recursive:true});
  const sqlite = await import('node:sqlite');
  const db = new (sqlite.Database ?? sqlite.DatabaseSync)(databasePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000');
  database = {
   async execute(sql,args = []) {
    const statement = db.prepare(sql);
    return /^\s*SELECT\b/i.test(sql) ? {rows:statement.all(...args),changes:0} : {rows:[],changes:Number(statement.run(...args).changes)};
   },
   close:() => db.close()
  };
 }
 try { await database.execute(schema); return database; }
 catch (error) { database.close(); throw error; }
}
