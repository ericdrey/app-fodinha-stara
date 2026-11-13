import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const inline = html.match(/<script>\s*(\/\*\* Regras[\s\S]*?)<\/script>/)?.[1];
const tick = () => new Promise(resolve => setImmediate(resolve));
async function boot(initialState = null) {
 const handlers = {}, data = new Map(), elements = new Map();
 const confirmations = []; let confirmationAnswer = true;
 const dummy = () => ({hidden:true,textContent:'',innerHTML:'',classList:{toggle(){}},showModal(){this.open=true},close(){this.open=false}});
 const query = id => { if (!elements.has(id)) elements.set(id,dummy()); return elements.get(id); };
 const root = {innerHTML:'', addEventListener:(name,fn) => handlers[name] = fn, querySelector:query,querySelectorAll:() => []};
 let remote = null, rev = 1, fail = false;
 const document = {hidden:false,getElementById:id => id === 'app' ? root : query(id),createElement:() => ({click(){},remove(){}}),body:{append(){}}};
 const ctx = {document,location:{protocol:'http:',hash:'',hostname:'localhost',origin:'http://localhost:3000',pathname:'/',reload(){}},history:{replaceState(){}},URLSearchParams,AbortSignal,
 window:{scrollY:0,scrollTo(){},addEventListener(){}},localStorage:{getItem:k => data.get(k) || null,setItem:(k,v) => data.set(k,v)},crypto:{randomUUID:() => Math.random().toString(36).slice(2)},confirm:message => { confirmations.push(message); return confirmationAnswer; },setTimeout:() => 1,clearTimeout(){},setInterval(){},console,
 fetch:async (url, opts) => {
  if (fail) throw new Error('Sem conexão');
  let body = {}, status = 200;
  if (url === '/api/tables') { remote = initialState || JSON.parse(opts.body).state; body = {state:remote,revision:rev,token:'a'.repeat(32)}; }
  else if (url === '/api/info') body = {addresses:[]};
  else if (opts.method === 'PUT') {
   const input = JSON.parse(opts.body);
   if (input.revision !== rev) { status = 409; body = {error:'Conflito'}; }
   else { remote = input.state; body = {revision:++rev}; }
  } else body = {state:remote,revision:rev};
  return {ok:status < 400,status,json:async () => body};
 }};
 ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(inline,ctx); await tick();
 const run = code => vm.runInContext(code,ctx);
 return {root,run,data,query,confirmations,setConfirmation:v => confirmationAnswer = v,offline:v => fail = v,remote:() => remote,otherWriter:() => rev++,
 click:async (act,other = {}) => {await handlers.click({target:{closest:() => ({dataset:{action:act,...other}})}});await tick();},
 change:async fields => {const target={dataset:{},...fields}; await handlers.change({target});await tick();return target},
 submit:async id => {await handlers.submit({preventDefault(){},target:{id}});await tick();}};
}
async function configure(app, count = 4) {
 await app.change({name:'playerCount',value:String(count)});
 app.run("draft.players.forEach((p,i) => p.name = ['Ana','Beto','Caio','Duda','Eva','Fabi','Gabi','Hugo'][i])");
 await app.submit('config-form');
}
const blocks = app => (app.root.innerHTML.match(/class="participant-block /g) || []).length;
async function confirmAll(app) {
 while (app.run('nextBidderId(game())')) {
  const id = app.run('nextBidderId(game())');
  await app.change({value:'0',dataset:{scoreId:id,scoreField:'bids'}});
  await app.click('confirm-bid');
 }
}

test('abertura pede quantidade, nomes e configurações; mudar quantidade preserva nomes e ajusta o pé', async () => {
 const app = await boot();
 assert.match(app.root.innerHTML,/Quantidade de jogadores/);
 assert.match(app.root.innerHTML,/Vidas iniciais/);
 assert.match(app.root.innerHTML,/Critério de desempate/);
 assert.match(app.root.innerHTML,/Primeiro pé/);
 assert.equal(app.run('draft.players.length'),4);
 app.run("draft.players[0].name='Ana'");
 await app.change({name:'playerCount',value:'8'});
 await app.change({name:'dealerIndex',value:'7'});
 await app.change({name:'playerCount',value:'3'});
 assert.equal(app.run('draft.players.length'),3);
 assert.equal(app.run('draft.players[0].name'),'Ana');
 assert.equal(app.run('draft.dealerIndex'),0);
 await configure(app,3);
 await app.change({id:'hand-cards',value:'2'});
 assert.equal(app.run('store.game.cards'),2);
});

test('grade tem exatamente um bloco por participante de 3 a 8 e quatro jogadores usam 2 × 2', async () => {
 for (let n=3;n<=8;n++) {
  const app = await boot(); await configure(app,n);
  assert.equal(blocks(app),n);
  assert.match(app.root.innerHTML,new RegExp(`data-count="${n}"`));
  assert.equal((app.root.innerHTML.match(/data-action="confirm-bid"/g) || []).length,1);
  assert.match(app.root.innerHTML,/Confirmar palpite/);
  assert.doesNotMatch(app.root.innerHTML,/Valendo|Na medida|Ranking|Conquistas|mobile-nav|board-note/);
  if(n===4) assert.match(app.root.innerHTML,/--columns:2;--rows:2;/);
 }
});

test('marcação direta habilita fechamento sem recriar campos; resultado e desfazer preservam os blocos', async () => {
 const app = await boot(); await configure(app);
 const before = app.root.innerHTML;
 await app.change({value:'0',dataset:{scoreId:'p2',scoreField:'bids'}});
 assert.equal(app.root.innerHTML,before); // evita perder o clique ao sair do campo numérico
 assert.equal(app.query('[data-action="confirm-bid"]').disabled,false);
 await app.click('confirm-bid'); await confirmAll(app);
 assert.match(app.root.innerHTML,/Finalizar rodada/);
 await app.click('score-step',{id:'p1',field:'totals',delta:'1'});
 await app.click('finish-score');
 assert.equal(app.run('store.game.players[0].lives'),4);
 assert.equal(app.run('store.game.history.length'),1);
 assert.equal(app.run('store.game.cards'),2);
 assert.equal(app.run('store.game.dealerId'),'p2');
 assert.equal(app.run('nextBidderId(game())'),'p3');
 assert.equal(app.run('store.records.length'),0);
 assert.equal(app.remote().game.players[0].lives,4);
 assert.equal(blocks(app),4);
 await app.click('undo-settle');
 assert.equal(app.run('store.game.players[0].lives'),5);
 assert.equal(app.run('store.game.history.length'),0);
 assert.equal(app.run('store.game.cards'),1);
 assert.equal(app.run('store.game.dealerId'),'p1');
 const invalid = await app.change({value:'99',dataset:{scoreId:'p1',scoreField:'totals'}});
 assert.equal(invalid.value,1); // volta ao valor salvo após rejeitar entrada inválida
 assert.equal(app.run('store.game.totals.p1'),1);
});

test('eliminados mantêm seu espaço; campeão aparece sem estatísticas; regras continuam no menu', async () => {
 const app = await boot(); await configure(app);
 app.run(`store.game.players.forEach(p => p.lives = ['p2','p4'].includes(p.id) ? 1 : 0); store.game.handPlayerIds=['p2','p4']; store.game.dealerId='p4'; store.game.bids={p2:0,p4:0}; store.game.totals={p2:1,p4:0};`);
 await app.click('finish-score');
 assert.equal(app.run('store.game.stage'),'finished');
 assert.equal(app.run('validStore(store)'),true);
 assert.match(app.root.innerHTML,/Duda venceu a partida/);
 assert.equal(blocks(app),4);
 assert.equal((app.root.innerHTML.match(/participant-block is-out/g) || []).length,3);
 assert.equal(app.run('store.records.length'),0);
 await app.click('open-menu'); assert.equal(app.query('#menu-dialog').open,true);
 await app.click('show-rules');
 assert.match(app.root.innerHTML,/Força das cartas/); assert.match(app.root.innerHTML,/regulamento_fodinha.pdf/);
 await app.click('show-game'); await app.click('undo-settle');
 assert.equal(app.run('store.game.players[1].lives'),1);
 await app.click('edit-config'); await configure(app,5);
 assert.equal(blocks(app),5); assert.equal(app.run('store.game.history.length'),0);
 assert.equal(app.data.has('fodinha-marcador-v2'),false);
});

test('configuração salva sem partida abre formulário; partida em andamento é retomada', async () => {
 const app = await boot(); await configure(app,4);
 const saved = JSON.parse(JSON.stringify(app.remote()));
 const resume = await boot(saved); assert.equal(blocks(resume),4);
 saved.game = null;
 const setup = await boot(saved); assert.match(setup.root.innerHTML,/Quantidade de jogadores/); assert.equal(blocks(setup),0);
});

test('queda de conexão mantém ajustes pendentes; conflito impede sobrescrever outro celular', async () => {
 const app = await boot(); await configure(app);
 app.offline(true);
 await app.click('score-step',{id:'p2',field:'bids',delta:'1'});
 assert.equal(app.run('pending.game.bidDraft'),1);
 assert.equal(app.run('connected'),false);
 app.offline(false); await app.click('retry-save');
 assert.equal(app.remote().game.bidDraft,1);
 assert.equal(app.run('pending'),null);
 app.otherWriter();
 await app.click('score-step',{id:'p2',field:'bids',delta:'-1'});
 assert.equal(app.run('conflict'),true);
 assert.equal(app.remote().game.bidDraft,1);
 await app.click('reload-server');
 assert.equal(app.run('conflict'),false);
 assert.equal(app.run('store.game.bids.p2'),undefined);
 assert.equal(app.run('store.game.bidDraft'),1);
});

test('somente a vez pode editar palpite; confirmar desbloqueia o próximo e o pé fica destacado', async () => {
 const app = await boot(); await configure(app);
 const input = id => app.root.innerHTML.match(new RegExp(`<input id="bids-${id}"[^>]*>`))[0];
 assert.match(app.root.innerHTML,/is-dealer/); assert.match(app.root.innerHTML,/class="foot-marker">PÉ/);
 assert.match(input('p1'),/disabled/); assert.doesNotMatch(input('p2'),/disabled/); assert.match(input('p3'),/disabled/);
 await app.change({value:'0',dataset:{scoreId:'p3',scoreField:'bids'}});
 assert.equal(app.run('store.game.bidDraft'),0);
 await app.change({value:'0',dataset:{scoreId:'p2',scoreField:'bids'}});
 assert.equal(app.run('nextBidderId(game())'),'p2');
 await app.click('confirm-bid');
 assert.match(input('p2'),/disabled/); assert.doesNotMatch(input('p3'),/disabled/);
 await app.click('undo-score-bid');
 assert.equal(app.run('nextBidderId(game())'),'p2'); assert.equal(app.run('store.game.bidDraft'),0);
 assert.doesNotMatch(input('p2'),/disabled/);
 const saved = JSON.parse(JSON.stringify(app.remote()));
 const resumed = await boot(saved); assert.equal(resumed.run('nextBidderId(game())'),'p2'); assert.equal(resumed.run('store.game.bidDraft'),0);
});

test('a posição dos nomes acompanha a ordem horária em ambas as orientações', async () => {
 const app = await boot();
 assert.deepEqual(JSON.parse(app.run('JSON.stringify(clockwiseSlots(4,2))')),[0,1,3,2]);
 for (let count=3;count<=8;count++) {
  for (const columns of [count<=3?1:2,count<=3?count:count<=4?2:count<=6?3:4]) {
   const slots = JSON.parse(app.run(`JSON.stringify(clockwiseSlots(${count},${columns}))`));
   assert.deepEqual([...slots].sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i));
  }
 }
});

test('palpites mostram zero e podem ser confirmados sem tocar nos marcadores', async () => {
 const app = await boot(); await configure(app);
 for(let i=0;i<4;i++) {
  const id = app.run('nextBidderId(game())');
  assert.equal(app.run('store.game.bidDraft'),0);
  assert.equal(app.run('roundStatus(game()).issue'),'');
  assert.match(app.root.innerHTML,new RegExp(`<input id="bids-${id}"[^>]*value="0"`));
  await app.click('confirm-bid');
 }
 assert.equal(app.run('store.game.stage'),'tricks');
 assert.equal(app.run('Object.values(store.game.bids).every(n => n === 0)'),true);
 await app.click('finish-score');
 assert.equal(app.run('store.game.cards'),2);
 assert.equal(app.run('store.game.bidDraft'),0);
});

test('reiniciar exige a confirmação exata; cancelar preserva a partida e confirmar restaura a configuração inicial', async () => {
 const app = await boot();
 await app.change({name:'lives',value:'3'});
 await app.change({name:'criterion',value:'B'});
 await app.change({name:'dealerIndex',value:'2'});
 await configure(app);
 await confirmAll(app);
 await app.click('score-step',{id:'p1',field:'totals',delta:'1'});
 await app.click('finish-score');
 const before = app.run('JSON.stringify(store)'), oldId = app.run('game().id');
 assert.equal(app.run('game().history.length'),1);
 assert.match(app.root.innerHTML,/Reiniciar jogo/);
 app.setConfirmation(false); await app.click('restart');
 assert.equal(app.confirmations.at(-1),'Deseja realmente iniciar um novo jogo?');
 assert.equal(app.run('JSON.stringify(store)'),before);
 app.setConfirmation(true); await app.click('restart');
 assert.equal(app.confirmations.at(-1),'Deseja realmente iniciar um novo jogo?');
 assert.notEqual(app.run('game().id'),oldId);
 assert.equal(app.run('game().history.length'),0);
 assert.equal(app.run('game().cards'),1);
 assert.equal(app.run('game().dealerId'),'p3');
 assert.equal(app.run('game().criterion'),'B');
 assert.equal(app.run('game().players.every(p => p.lives === 3)'),true);
 assert.equal(app.run('game().players.map(p => p.name).join(",")'),'Ana,Beto,Caio,Duda');
 assert.equal(app.run('Object.keys(game().bids).length'),0);
 assert.equal(app.run('game().bidDraft'),0);
 assert.equal(app.remote().game.id,app.run('game().id'));
 assert.equal(app.run('validStore(store)'),true);
});
