import { randomBytes } from 'node:crypto';
import { blankStore, validStore } from './store.js';

const json = (res,status,body) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}); res.end(JSON.stringify(body)); };
const fail = (message,status = 400) => Object.assign(new Error(message),{status});
async function readBody(req) {
 if (!req.headers['content-type']?.startsWith('application/json')) throw fail('Envie JSON.',415);
 let raw = '';
 if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
 else {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 4 * 1024 * 1024) throw fail('Use um backup de até 4 MB.',413); chunks.push(Buffer.from(chunk)); }
  raw = Buffer.concat(chunks).toString('utf8');
 }
 if (Buffer.byteLength(raw) > 4 * 1024 * 1024) throw fail('Use um backup de até 4 MB.',413);
 try { return JSON.parse(raw); } catch { throw fail('JSON inválido.'); }
}

export function createApiHandler({getDatabase,addresses = () => []}) {
 return async (req,res) => {
  try {
   const url = new URL(req.url,'http://localhost');
   const route = url.searchParams.get('route') || url.pathname.replace(/^\/api\//,'');
   if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return json(res,403,{error:'Origem não autorizada.'});
   if (route === 'info' && req.method === 'GET') return json(res,200,{addresses:addresses()});
   if (route === 'health' && req.method === 'GET') {
    const db = await getDatabase(); await db.execute('SELECT 1');
    return json(res,200,{ok:true,storage:process.env.VERCEL ? 'turso' : process.env.TURSO_DATABASE_URL ? 'turso' : 'sqlite'});
   }
   if (route === 'tables' && req.method === 'POST') {
    const body = await readBody(req); const state = body?.state ?? blankStore();
    if (!validStore(state)) return json(res,400,{error:'Dados da mesa inválidos.'});
    const db = await getDatabase(), token = randomBytes(16).toString('hex'), updatedAt = new Date().toISOString();
    await db.execute('INSERT INTO tables VALUES (?, 1, ?, ?)',[token,JSON.stringify(state),updatedAt]);
    return json(res,201,{token,revision:1,state,updatedAt});
   }
   if (route !== 'table') return json(res,404,{error:'Endereço não encontrado.'});
   const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{32})$/)?.[1];
   if (!token) return json(res,401,{error:'Abra o link compartilhado da mesa.'});
   const db = await getDatabase();
   const row = (await db.execute('SELECT revision, state, updated_at FROM tables WHERE token = ?',[token])).rows[0];
   if (!row) return json(res,404,{error:'Mesa não encontrada neste servidor. Confira o link ou restaure um backup.'});
   if (req.method === 'GET') return json(res,200,{revision:row.revision,state:JSON.parse(row.state),updatedAt:row.updated_at});
   if (req.method !== 'PUT') return json(res,405,{error:'Método não permitido.'});
   const body = await readBody(req);
   if (!body || !Number.isSafeInteger(body.revision) || !validStore(body.state)) return json(res,400,{error:'Dados da mesa inválidos.'});
   const updatedAt = new Date().toISOString();
   const result = await db.execute('UPDATE tables SET state = ?, revision = revision + 1, updated_at = ? WHERE token = ? AND revision = ?',[JSON.stringify(body.state),updatedAt,token,body.revision]);
   if (!result.changes) return json(res,409,{error:'A mesa mudou em outro celular. Carregue o placar salvo antes de continuar.'});
   return json(res,200,{revision:body.revision+1,updatedAt});
  } catch (error) {
   return json(res,error.status || 503,{error:error.status ? error.message : 'Banco indisponível. Confira a configuração do servidor e tente novamente.'});
  }
 };
}
