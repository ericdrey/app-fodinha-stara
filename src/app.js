import {
 STORAGE_KEY, CARD_HIERARCHY, uid, createGame, playerById, livingPlayers,
 addPenalty, removeLastPenalty, redeal, adjustLives, verifySavedGame,
 scoreboard, changeScore, configureScoreHand, finishScoreHand, undoScoreHand,
 nextBidderId, forbiddenBid, confirmScoreBid, undoScoreBid
} from './engine.js';
import { mkPlayer, blankStore, validConfig, validStore } from './store.js';

const APP_KEY = 'fodinha-marcador-v2';
const ROOM_KEY = 'fodinha-mesa-servidor';
const root = document.getElementById('app');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const deepClone = value => JSON.parse(JSON.stringify(value));
let store = blankStore(), draft = deepClone(store.config), tab = 'config';
let token = '', revision = 0, pending = null, saving = false, conflict = false, connected = false;
let status = 'Conectando…', startupError = '', shareOrigin = '', toastTimeout;
const game = () => store.game;
const activePeople = () => game().handPlayerIds.map(id => playerById(game(), id));
const countWord = (n, s, p) => `${n} ${n === 1 ? s : p}`;
function showToast(text, isError = false) {
 const t = document.getElementById('toast');
 t.textContent = text; t.classList.toggle('error', isError); t.hidden = false;
 clearTimeout(toastTimeout); toastTimeout = setTimeout(() => t.hidden = true, 4200);
}
async function request(url, options = {}) {
 const response = await fetch(url, { ...options, cache:'no-store', headers:{ 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}), ...options.headers }, signal:AbortSignal.timeout(10000) });
 const data = await response.json();
 if (!response.ok) throw Object.assign(new Error(data.error || 'Não foi possível salvar.'), { status:response.status });
 return data;
}
function syncStatus() {
 const el = document.getElementById('sync-state'); if (el) el.textContent = status;
 const banner = document.getElementById('connection-banner');
 if (banner) banner.innerHTML = conflict
  ? `<div class="connection-warning"><strong>A mesa mudou em outro celular.</strong><p>Exporte seus ajustes se precisar guardá-los e carregue o placar salvo para continuar.</p>${action('Exportar meus ajustes','export','text-button')}${action('Carregar placar salvo','reload-server','button quiet')}</div>`
  : !connected && pending ? `<div class="connection-warning"><strong>Alterações ainda não salvas.</strong><p>Mantenha esta página aberta. Tentaremos novamente ao reconectar.</p>${action('Tentar salvar','retry-save','button quiet')}${action('Exportar backup','export','text-button')}</div>` : '';
}
function persist() { pending = deepClone(store); flush(); }
async function flush() {
 if (saving || conflict || !token || !pending) return;
 saving = true; status = 'Salvando…'; syncStatus();
 try {
  while (pending) {
   const snapshot = pending; pending = null;
   try { const result = await request('/api/table', { method:'PUT', body:JSON.stringify({ revision, state:snapshot }) }); revision = result.revision; }
   catch (error) { pending ??= snapshot; throw error; }
  }
  connected = true; status = 'Salvo no banco';
 } catch (error) { connected = false; conflict = error.status === 409; status = conflict ? 'Revisar conflito' : 'Não salvo'; showToast(error.message || 'Sem conexão com o servidor.', true); }
 finally { saving = false; syncStatus(); }
}
async function poll() {
 if (!token || saving || pending || conflict || !connected || document.hidden || tab === 'config') return;
 try {
  const result = await request('/api/table');
  if (saving || pending || conflict) return;
  connected = true; status = 'Salvo no banco'; syncStatus();
  if (result.revision <= revision) return;
  if (!validStore(result.state)) throw new Error('Dados recebidos inválidos.');
  store = result.state; revision = result.revision;
  if (store.game) store.game = scoreboard(store.game);
  if (tab !== 'config') render();
 } catch { status = 'Verificando conexão…'; syncStatus(); }
}
function legacyImport(src) {
 if (!verifySavedGame(src)) throw new Error('Arquivo de backup inválido.');
 const config = {ready:true, players:src.players.map(p => mkPlayer(p.name)), lives:src.initialLives, criterion:src.criterion, dealerIndex:src.players.findIndex(p => p.id === src.dealerId)};
 src.players.forEach((p,i) => p.profileId = config.players[i].id); src.id ||= uid();
 return {version:2, config, game:src, records:[]};
}
function readLegacy() {
 try { const s = JSON.parse(localStorage.getItem(APP_KEY) || 'null'); if (validStore(s)) return s; } catch {}
 try { const g = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); if (g) return legacyImport(g); } catch {}
 return blankStore();
}
async function boot() {
 startupError = ''; renderLoading();
 try {
  if (location.protocol === 'file:') throw new Error('Execute npm run dev e abra http://localhost:3000 para usar o banco de dados.');
  const hashToken = new URLSearchParams(location.hash.slice(1)).get('mesa');
  try { token = hashToken || localStorage.getItem(ROOM_KEY) || ''; } catch { token = hashToken || ''; }
  if (token && !/^[a-f0-9]{32}$/.test(token)) throw new Error('Link de mesa inválido. Confira o link compartilhado.');
  const result = token ? await request('/api/table') : await request('/api/tables', {method:'POST', body:JSON.stringify({state:readLegacy()})});
  if (!validStore(result.state)) throw new Error('Os dados salvos não são compatíveis.');
  token = result.token || token; revision = result.revision; store = result.state;
  if (store.game) store.game = scoreboard(store.game);
  try { localStorage.setItem(ROOM_KEY, token); } catch {}
  history.replaceState(null, '', `#mesa=${token}`);
  draft = deepClone(store.config); tab = store.game ? 'jogo' : 'config';
  connected = true; status = 'Salvo no banco'; render();
  try { const info = await request('/api/info'); shareOrigin = ['localhost','127.0.0.1'].includes(location.hostname) ? info.addresses[0] || location.origin : location.origin; } catch { shareOrigin = location.origin; }
 } catch (error) { startupError = error.message || 'Não foi possível conectar ao servidor.'; renderLoading(); }
}
function renderLoading() {
 root.innerHTML = `<main class="startup"><h1>Fodinha</h1><p>${escapeHTML(startupError || 'Carregando a mesa…')}</p>${startupError ? action('Tentar novamente','retry-boot','button primary') : ''}</main>`;
}
function commit(next, success) {
 store.game = next; persist(); render(); if (success) showToast(success);
}
function startNew() {
 const c = store.config;
 if (!c.ready) throw new Error('Informe os jogadores primeiro.');
 const g = scoreboard(createGame({names:c.players.map(p => p.name), lives:c.lives, criterion:c.criterion, dealerIndex:c.dealerIndex}));
 g.id = uid(); g.players.forEach((p,i) => p.profileId = c.players[i].id);
 tab = 'jogo'; commit(g);
}
function navigate(next) {
 tab = next === 'jogo' && !game() ? 'config' : next;
 if (tab === 'config') draft = deepClone(store.config);
 render(true);
}
function action(label, act, klass = '', extra = '') {
 return `<button type="button" class="${klass}" data-action="${act}" ${extra}>${label}</button>`;
}
function pageTitle(kicker, title, description = '') {
 return `<div class="page-intro"><h1>${title}</h1>${description ? `<p>${description}</p>` : ''}</div>`;
}
function header() {
 return `<header class="page-header">${game() ? action('← Voltar','show-game','text-button') : '<strong>Fodinha</strong>'}${tab === 'regras' ? action('Configurar partida','edit-config','text-button') : action('Regras','show-rules','text-button')}</header>`;
}
const scoreValue = (g,id,field) => (field === 'bids' && id === nextBidderId(g) ? g.bidDraft : g[field]?.[id]) ?? 0;
const scoreLocked = (g,id,field) => g.stage === 'finished' || !g.handPlayerIds.includes(id) || (field === 'bids' ? id !== nextBidderId(g) : g.stage !== 'tricks');
function scoreControl(g, p, field, disabled) {
 const val = scoreValue(g,p.id,field), label = field === 'bids' ? 'Palpite' : 'Fez';
 disabled ||= scoreLocked(g,p.id,field);
 return `<div class="score-control"><label for="${field}-${p.id}">${label}</label><input id="${field}-${p.id}" type="number" inputmode="numeric" min="0" max="${g.cards}" step="1" value="${val ?? (field === 'totals' ? 0 : '')}" placeholder="—" data-score-id="${p.id}" data-score-field="${field}" aria-label="${label} de ${escapeHTML(p.name)}" ${disabled ? 'disabled' : ''}><div class="counter-buttons">${action('−','score-step','score-step',`data-id="${p.id}" data-field="${field}" data-delta="-1" aria-label="Diminuir ${label.toLowerCase()} de ${escapeHTML(p.name)}" ${disabled || val === 0 ? 'disabled' : ''}`)}${action('+','score-step','score-step',`data-id="${p.id}" data-field="${field}" data-delta="1" aria-label="Aumentar ${label.toLowerCase()} de ${escapeHTML(p.name)}" ${disabled || val >= g.cards ? 'disabled' : ''}`)}</div></div>`;
}
function renderMenu(g) {
 const active = activePeople();
 return `<dialog id="menu-dialog" class="menu-dialog"><div class="menu-heading"><h2>Menu</h2>${action('×','close-menu','icon-button','aria-label="Fechar menu"')}</div><div class="menu-items">${action('Regras','show-rules','menu-item')}${action('Reiniciar jogo','restart','menu-item restart-item')}${action('Configurar nova partida','edit-config','menu-item')}${g.undoState ? action('Desfazer última rodada','undo-settle','menu-item') : ''}${g.stage !== 'finished' && Object.keys(g.bids).length && Object.values(g.totals).every(n => n === 0) ? action('Desfazer último palpite','undo-score-bid','menu-item') : ''}${g.stage !== 'finished' ? `<details class="menu-corrections"><summary>Ajustes da rodada</summary><label class="field-caption" for="hand-dealer">Pé da rodada</label><select id="hand-dealer" class="select-input">${active.map(p => `<option value="${p.id}" ${p.id === g.dealerId ? 'selected' : ''}>${escapeHTML(p.name)}</option>`).join('')}</select>${action('Corrigir vidas','toggle-lives','menu-item')}${action('Aplicar penalidade','toggle-penalty','menu-item')}${action('Redistribuir cartas','redeal','menu-item')}<div id="admin-detail"></div></details>` : ''}<details class="menu-corrections"><summary>Dados da mesa</summary>${action('Compartilhar mesa','share','menu-item')}${action('Exportar backup','export','menu-item')}${action('Importar backup','import','menu-item')}<span id="sync-state" class="sync-state">${status}</span></details></div></dialog>`;
}
function roundStatus(g) {
 const active = g.handPlayerIds.map(id => playerById(g,id)), finished = g.stage === 'finished';
 const turn = nextBidderId(g);
 if (turn) {
  const name = playerById(g,turn).name, forbidden = forbiddenBid(g);
  const issue = !Number.isInteger(g.bidDraft) ? `Informe o palpite de ${name}, inclusive zero.` : forbidden !== null && forbidden === g.bidDraft ? `O pé não pode pedir ${forbidden}: a soma igualaria as cartas.` : '';
  return {turn,issue,message:issue || `Vez de ${name}${turn === g.dealerId ? ' · Pé, último a falar' : ''}`};
 }
 const missing = active.filter(p => !Object.hasOwn(g.bids,p.id)).length;
 const total = active.reduce((sum,p) => sum + (g.totals[p.id] ?? 0),0);
 const bids = active.reduce((sum,p) => sum + (g.bids[p.id] ?? 0),0);
 const issue = missing ? `Informe ${countWord(missing,'palpite','palpites')}, inclusive zero.` : bids === g.cards ? 'A soma dos palpites não pode ser igual às cartas.' : total > g.cards ? 'O total feito ultrapassa as cartas.' : g.criterion === 'B' && total !== g.cards ? 'O total feito deve ser igual às cartas.' : '';
 const message = finished ? `${livingPlayers(g)[0].name} venceu a partida.` : issue || (total < g.cards ? `${g.cards-total} ${g.cards-total === 1 ? 'vaza melada' : 'vazas meladas'}` : g.deathmatch ? 'Morte súbita · 1 vida para cada finalista' : '');
 return {turn:null,issue,message};
}
function syncBoard() {
 const g = game(), {turn,issue,message} = roundStatus(g);
 const note = root.querySelector('#round-message'); if (note) note.textContent = message;
 const finish = root.querySelector(turn ? '[data-action="confirm-bid"]' : '[data-action="finish-score"]'); if (finish) finish.disabled = !!issue || conflict;
 for (const b of root.querySelectorAll('[data-action="score-step"]')) {
  const {id,field,delta} = b.dataset, value = scoreValue(g,id,field);
  b.disabled = conflict || scoreLocked(g,id,field) || (Number(delta) < 0 ? value === 0 : value >= g.cards);
 }
}
function clockwiseSlots(count,columns) {
 const rows = Math.ceil(count/columns), slots = [];
 const width = row => Math.min(columns,count-row*columns);
 const add = (row,column) => { const slot = row*columns+column; if (!slots.includes(slot)) slots.push(slot); };
 for (let c=0;c<width(0);c++) add(0,c);
 for (let r=1;r<rows;r++) add(r,width(r)-1);
 for (let c=width(rows-1)-2;c>=0;c--) add(rows-1,c);
 for (let r=rows-2;r>0;r--) add(r,0);
 return slots;
}
function renderGame() {
 const g = game(); if (!g) return renderSettings();
 const active = activePeople(), finished = g.stage === 'finished';
 const {turn,issue,message} = roundStatus(g);
 const count = g.players.length, columns = count <= 3 ? 1 : 2, wideColumns = count <= 3 ? count : count <= 4 ? 2 : count <= 6 ? 3 : 4;
 const winner = finished ? livingPlayers(g)[0] : null;
 const slots = clockwiseSlots(count,columns), wideSlots = clockwiseSlots(count,wideColumns);
 return `<div class="game-shell"><header class="game-toolbar">${action('☰ <span>Menu</span>','open-menu','menu-button','aria-label="Abrir menu"')}<strong>Fodinha</strong><label class="cards-control" for="hand-cards"><span>Cartas</span><select id="hand-cards" aria-label="Quantidade de cartas da rodada" ${finished || conflict ? 'disabled' : ''}>${Array.from({length:Math.floor(40/active.length)},(_,i) => `<option value="${i+1}" ${g.cards === i+1 ? 'selected' : ''}>${i+1}</option>`).join('')}</select></label></header><div id="connection-banner"></div><main class="participant-grid" data-count="${count}" aria-label="Placar dos ${count} participantes" style="--columns:${columns};--rows:${Math.ceil(count/columns)};--wide-columns:${wideColumns};--wide-rows:${Math.ceil(count/wideColumns)}">${g.players.map(p => {
  const out = p.lives === 0, disabled = out || finished || conflict;
  const index = g.players.indexOf(p), dealer = p.id === g.dealerId && !finished;
  const span = columns > 1 && count % columns && slots[index] === count-1 ? 2 : 1;
  const wideSpan = wideColumns > 1 && count % wideColumns && wideSlots[index] === count-1 ? 2 : 1;
  return `<section class="participant-block ${out ? 'is-out' : ''} ${winner?.id === p.id ? 'is-winner' : ''} ${dealer ? 'is-dealer' : ''} ${p.id === turn ? 'is-turn' : ''}" style="--slot:${slots[index]};--wide-slot:${wideSlots[index]};--span:${span};--wide-span:${wideSpan}" aria-label="Placar de ${escapeHTML(p.name)}"><div class="participant-heading"><h2 title="${escapeHTML(p.name)}">${escapeHTML(p.name)}</h2>${dealer ? '<span class="foot-marker">PÉ</span>' : ''}<span class="participant-lives" aria-label="${p.lives} vidas restantes"><span aria-hidden="true">♥</span> ${p.lives}</span></div><div class="participant-values">${scoreControl(g,p,'bids',disabled)}${scoreControl(g,p,'totals',disabled)}</div>${out ? '<span class="participant-status">Eliminado</span>' : winner?.id === p.id ? '<span class="participant-status">Vencedor</span>' : p.id === turn ? '<span class="participant-status">Sua vez</span>' : ''}</section>`;
 }).join('')}</main><footer class="round-actions"><p id="round-message" role="status">${escapeHTML(message)}</p>${finished ? action('Nova partida','edit-config','button primary full') : turn ? action('Confirmar palpite','confirm-bid','button primary full',issue || conflict ? 'disabled' : '') : action('Finalizar rodada','finish-score','button primary full',issue || conflict ? 'disabled' : '')}</footer>${renderMenu(g)}</div>`;
}
function renderSettings() {
 const c = draft;
 return `<div class="settings-wrap">${pageTitle('','Nova partida')}<form id="config-form" class="settings-card"><label class="field-caption" for="player-count">Quantidade de jogadores</label><select id="player-count" name="playerCount" class="select-input">${Array.from({length:6},(_,i) => `<option value="${i+3}" ${c.players.length === i+3 ? 'selected' : ''}>${i+3} jogadores</option>`).join('')}</select><p class="setup-order">Nomes em sentido horário ↻</p><div class="setup-players">${c.players.map((p,i) => `<label class="setup-row"><span>${i+1}</span><input required maxlength="30" name="player-${i}" data-player-name="${i}" placeholder="Nome do jogador" autocomplete="off" value="${escapeHTML(p.name)}" aria-label="Nome do jogador ${i+1}"></label>`).join('')}</div><div class="settings-options"><label>Vidas iniciais<select name="lives" class="select-input"><option value="5" ${c.lives === 5 ? 'selected' : ''}>5 vidas</option><option value="3" ${c.lives === 3 ? 'selected' : ''}>3 vidas</option></select></label><label>Critério de desempate<select name="criterion" class="select-input"><option value="A" ${c.criterion === 'A' ? 'selected' : ''}>Vaza melada</option><option value="B" ${c.criterion === 'B' ? 'selected' : ''}>Primeiro a jogar ganha</option></select></label></div><label class="field-caption" for="dealer">Primeiro pé</label><select id="dealer" name="dealerIndex" class="select-input">${c.players.map((p,i) => `<option value="${i}" ${i === c.dealerIndex ? 'selected' : ''}>${escapeHTML(p.name || 'Jogador '+(i+1))}</option>`).join('')}</select><button type="submit" class="button primary full">Iniciar partida</button></form></div>`;
}
function render(scrollTop = false) {
 const y = window.scrollY, playing = tab === 'jogo' && !!game();
 root.innerHTML = `${playing ? renderGame() : `${header()}<main class="page-main"><div id="connection-banner"></div>${tab === 'regras' ? renderRules() : renderSettings()}</main>`}<input hidden type="file" id="import-file" accept="application/json,.json">`;
 syncStatus();
 if (scrollTop) window.scrollTo(0,0); else if (y > 0) window.scrollTo(0,y);
}

function renderRules(){
 const groups=[
 ['Visão geral',`<p>Este é o regulamento adotado pelos amigos da Stara. O Fodinha tem variações entre mesas. Na aplicação, os palpites seguem em sentido horário, conforme combinado; o PDF descreve sentido anti-horário.</p><p>O último jogador com vidas vence. A cada mão, cada participante promete quantas vazas vai ganhar; acertar exatamente mantém suas vidas.</p><div class="rules-points"><span>3 a 8 jogadores</span><span>Baralho espanhol de 40 cartas</span><span>5 vidas (ou 3 na partida rápida)</span><span>Sentido horário na aplicação</span></div><p>Use Espadas, Bastos (Paus), Copas e Ouros, sem 8, 9 ou curingas.</p>`],
 ['Força das cartas',`<p>Não há vira nem manilha móvel. Ordem da mais forte à mais fraca:</p><div class="card-ranking">${CARD_HIERARCHY.map(([card,title],i)=>`<div><span>${String(i+1).padStart(2,'0')}</span><strong>${escapeHTML(card)}</strong><small>${escapeHTML(title)}</small></div>`).join('')}</div><p>Cartas do mesmo nível empatam independentemente do naipe.</p>`],
 ['Mãos e distribuição',`<p>Primeira mão: 1 carta por jogador. Depois 2, 3, 4… até o máximo de <strong>⌊40 ÷ jogadores ativos⌋</strong>. Em seguida, desce uma carta por mão até 1 e reinicia o ciclo se ainda houver disputa.</p><p>O primeiro carteador é sorteado pela carta mais forte. Na aplicação, o pé passa ao próximo jogador ativo em sentido horário a cada mão. Quem está à esquerda do pé corta o baralho (ou dá toque).</p>`],
 ['Rodada da testa',`<p>Nas mãos de <strong>1 carta</strong>, ninguém pode olhar a própria carta. Cada jogador põe a carta na testa com a face para os outros.</p><p>Olhar a própria carta antes de jogá-la custa <strong>1 vida</strong> de penalidade.</p>`],
 ['Palpites e regra do pé',`<p>Na aplicação, começa o próximo jogador ativo no sentido horário após o pé, pedindo de 0 até o número de cartas. Confirme cada palpite para liberar o seguinte, sempre em sentido horário. O <strong>pé pede por último</strong>.</p><p><strong>A soma de todos os palpites não pode ser igual à quantidade de cartas da mão.</strong> Apenas o palpite do pé é limitado para impedir isso. Os palpites feitos não podem ser alterados.</p><div class="rule-example">Ex.: 3 cartas, três jogadores pediram 1 + 1 + 0 = 2. O pé não pode pedir 1.</div>`],
 ['Como funcionam as vazas',`<p>Na primeira vaza, começa quem abriu os palpites. Todos descartam uma carta aberta, seguindo a ordem combinada pela mesa, sem obrigação de seguir o naipe. A maior carta vence; quem venceu abre a próxima.</p><p><strong>Critério A — Melada (padrão):</strong> se as cartas de maior força empatarem, ninguém ganha a vaza. Quem abriu começa a próxima. Uma carta mais forte jogada depois desfaz o empate.</p><p><strong>Critério B — Primeiro a jogar:</strong> em empate das cartas mais fortes, ganha quem jogou primeiro. Escolha a variação na configuração da mesa.</p>`],
 ['Vidas e eliminação',`<p>Quem acerta exatamente o palpite não perde vida, inclusive quando pede zero e faz zero.</p><p>Quem erra perde <strong>1 vida por vaza de diferença</strong>, para mais ou para menos. Ex.: pediu 2, fez 0 → perde 2 vidas.</p><p>Quem chega a 0 ou menos é eliminado da mão seguinte; o teto de cartas é recalculado. Quando sobra um jogador, ele vence.</p><p>Com <strong>2 finalistas</strong>, se ambos zerarem na mesma mão, voltam com 1 vida cada para morte súbita.</p>`],
 ['Exceções e penalidades',`<p><strong>Distribuição errada:</strong> se percebida antes dos palpites, redistribui sem penalidade; depois de começar os palpites, o pé perde 1 vida e redistribui.</p><p><strong>Carta virada na distribuição:</strong> redistribui. Se o jogador expuser sua carta depois de recebê-la, a mão segue.</p><p><strong>Jogar fora da vez:</strong> a carta fica aberta aguardando o turno, sem voltar à mão.</p><p><strong>Combinar sinais:</strong> os envolvidos perdem 1 vida cada.</p><p><strong>Duelo final:</strong> a regra do pé segue valendo. O PDF não define um desempate para a eliminação simultânea de 3 ou mais jogadores.</p>`],
 ];
 return `<div class="content-wrap">${pageTitle('CONSULTA RÁPIDA','Regras do Fodinha','Nosso combinado: regulamento fornecido pela mesa, com baralho espanhol de truco.')}<section class="rule-list">${groups.map(([title,html],i)=>`<details class="rule-details" ${i===0?'open':''}><summary><span class="rule-index">${String(i+1).padStart(2,'0')}</span><strong>${title}</strong><span class="rule-chevron">⌄</span></summary><div class="rule-content">${html}</div></details>`).join('')}</section><a class="pdf-link" href="./docs/regulamento_fodinha.pdf" target="_blank" rel="noopener noreferrer">↗ Abrir regulamento original em PDF</a></div>`;
}
function saveBackup() {
 const url = URL.createObjectURL(new Blob([JSON.stringify(store,null,2)], {type:'application/json'}));
 const a = document.createElement('a'); a.href = url; a.download = `fodinha-backup-${new Date().toISOString().slice(0,10)}.json`;
 document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),2000); showToast('Backup exportado.');
}
async function shareTable() {
 const link = `${shareOrigin || location.origin}${location.pathname}#mesa=${token}`;
 const dialog = document.getElementById('share-dialog');
 dialog.querySelector('input').value = link;
 dialog.showModal();
 try { await navigator.clipboard.writeText(link); dialog.querySelector('.share-feedback').textContent = 'Link copiado! Envie para os amigos.'; }
 catch { dialog.querySelector('.share-feedback').textContent = 'Selecione e copie o link abaixo.'; }
}
function editPenalty() { return `<form id="penalty-form" class="nested-form"><label>Jogador<select name="playerId">${activePeople().map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')}</select></label><label>Motivo<select name="reason"><option value="signals">Sinais combinados</option>${game().cards === 1 ? '<option value="forehead">Olhou a carta da testa</option>' : ''}</select></label><button type="submit" class="button primary">Registrar −1 no fechamento</button>${game().penalties.length ? action('Desfazer penalidade','undo-penalty','text-button') : ''}</form>`; }
function editLives() { return `<form id="lives-form" class="nested-form"><p>Ajuste para corrigir uma marcação. Mantenha pelo menos dois jogadores; o campeão é definido ao finalizar a vaza.</p>${game().players.map(p => `<label>${escapeHTML(p.name)}<input type="number" min="0" max="99" name="life-${p.id}" value="${p.lives}" required></label>`).join('')}<button type="submit" class="button primary">Salvar vidas</button></form>`; }
root.addEventListener('input', e => {
 const idx = e.target?.dataset?.playerName;
 if (idx !== undefined) { draft.players[Number(idx)].name = e.target.value; const option = root.querySelector(`#dealer option[value="${idx}"]`); if (option) option.textContent = e.target.value.trim() || `Jogador ${Number(idx)+1}`; }
});
root.addEventListener('change', async e => {
 try {
  if (conflict) { render(); throw new Error('Carregue o placar salvo antes de editar.'); }
  if (e.target.name === 'playerCount') {
   const count = Number(e.target.value);
   if (!Number.isInteger(count) || count < 3 || count > 8) throw new Error('Escolha de 3 a 8 jogadores.');
   while (draft.players.length < count) draft.players.push(mkPlayer());
   draft.players = draft.players.slice(0,count);
   if (draft.dealerIndex >= count) draft.dealerIndex = 0;
   render();
  }
  if (e.target.name === 'lives') draft.lives = Number(e.target.value);
  if (e.target.name === 'criterion') draft.criterion = e.target.value;
  if (e.target.name === 'dealerIndex') draft.dealerIndex = Number(e.target.value);
  if (e.target.dataset.scoreId) {
   const {scoreId,scoreField} = e.target.dataset;
   if (e.target.value === '') { e.target.value = scoreValue(game(),scoreId,scoreField) ?? ''; return; }
   store.game = changeScore(game(),scoreId,scoreField,Number(e.target.value));
   e.target.value = String(Number(e.target.value)); persist(); syncBoard();
  }
  if (e.target.id === 'hand-cards') commit(configureScoreHand(game(),Number(e.target.value),game().dealerId));
  if (e.target.id === 'hand-dealer') commit(configureScoreHand(game(),game().cards,e.target.value));
  if (e.target.id === 'import-file') {
   const file = e.target.files?.[0]; if (!file) return;
   if (file.size > 4 * 1024 * 1024) throw new Error('Use um backup de até 4 MB.');
   const obj = JSON.parse(await file.text()); const parsed = obj.version === 2 ? obj : legacyImport(obj);
   if (!validStore(parsed)) throw new Error('Backup incompatível ou inválido.');
   if (!confirm('Restaurar backup nesta mesa? Os dados salvos serão substituídos para todos que usam o link.')) return;
   store = parsed; if (store.game) store.game = scoreboard(store.game); draft = deepClone(store.config); tab = store.game ? 'jogo' : 'config'; persist(); render(true); showToast('Backup restaurado.');
  }
 } catch (error) {
  if (e.target.dataset.scoreId) e.target.value = scoreValue(game(),e.target.dataset.scoreId,e.target.dataset.scoreField) ?? '';
  if (['hand-cards','hand-dealer'].includes(e.target.id)) render();
  showToast(error.message || 'Não foi possível salvar.',true);
 }
});
root.addEventListener('submit', e => {
 e.preventDefault();
 try {
  if (conflict) throw new Error('Carregue o placar salvo antes de editar.');
  if (e.target.id === 'config-form') {
   draft.players.forEach(p => p.name = p.name.trim()); draft.ready = true;
   if (!validConfig(draft)) throw new Error('Preencha todos os nomes, sem repetir jogadores.');
   if (game() && game().stage !== 'finished' && !confirm('Encerrar a partida atual e iniciar outra com esta configuração?')) return;
   store.config = deepClone(draft); startNew();
  } else if (e.target.id === 'penalty-form') {
   const d = new FormData(e.target); commit(addPenalty(game(),d.get('playerId'),d.get('reason')),'Penalidade será aplicada no fechamento.');
  } else if (e.target.id === 'lives-form') {
   const d = new FormData(e.target), updated = deepClone(game());
   for (const p of updated.players) p.lives = Number(d.get('life-'+p.id));
   // Aplica o lote inteiro antes de recalcular os jogadores ativos.
   const result = adjustLives(updated,updated.players[0].id,updated.players[0].lives);
   if (!verifySavedGame(result)) throw new Error('Informe vidas inteiras entre 0 e 99.');
   commit(result,'Vidas corrigidas.');
  }
 } catch (error) { showToast(error.message || 'Não foi possível salvar.',true); }
});
root.addEventListener('click', async e => {
 const b = e.target.closest('[data-action]'); if (!b || b.disabled) return;
 const act = b.dataset.action;
 try {
  if (conflict && !['show-game','show-rules','open-menu','close-menu','edit-config','reload-server','export','share'].includes(act)) throw new Error('Carregue o placar salvo antes de continuar.');
  switch (act) {
   case 'retry-boot': await boot(); break;
   case 'retry-save': await flush(); break;
   case 'reload-server': {
    if (!confirm('Carregar o placar salvo? Seus ajustes ainda não salvos serão descartados. Exporte-os primeiro se precisar.')) break;
    const result = await request('/api/table'); if (!validStore(result.state)) throw new Error('Dados recebidos inválidos.');
    pending = null; store = result.state; revision = result.revision; conflict = false; connected = true; status = 'Salvo no banco';
    if (store.game) store.game = scoreboard(store.game); draft = deepClone(store.config); render(); break;
   }
   case 'show-game': navigate('jogo'); break;
   case 'show-rules': navigate('regras'); break;
   case 'open-menu': root.querySelector('#menu-dialog').showModal(); break;
   case 'close-menu': root.querySelector('#menu-dialog').close(); break;
   case 'edit-config': navigate('config'); break;
   case 'restart': if (confirm('Deseja realmente iniciar um novo jogo?')) startNew(); break;
   case 'share': await shareTable(); break;
   case 'score-step': {
    const {id,field,delta} = b.dataset, current = scoreValue(game(),id,field);
    commit(changeScore(game(),id,field,current == null ? (Number(delta) < 0 ? 0 : 1) : current + Number(delta))); break;
   }
   case 'confirm-bid': commit(confirmScoreBid(game())); break;
   case 'undo-score-bid': commit(undoScoreBid(game()),'Último palpite aberto para correção.'); break;
   case 'finish-score': {
    commit(finishScoreHand(game()),'Rodada finalizada.'); break;
   }
   case 'undo-settle': {
    if (!confirm('Desfazer o último fechamento e restaurar as vidas e os marcadores anteriores?')) break;
    const g = game(), previous = undoScoreHand(g); store.records = store.records.filter(r => r.id !== g.id); commit(previous,'Fechamento desfeito.'); break;
   }
   case 'redeal': if (confirm('Redistribuir? Após o primeiro palpite, o pé recebe −1 vida no fechamento.')) { const next = redeal(game()); next.totals = {}; commit(scoreboard(next),'Marcadores zerados.'); } break;
   case 'toggle-penalty': root.querySelector('#admin-detail').innerHTML = editPenalty(); break;
   case 'toggle-lives': root.querySelector('#admin-detail').innerHTML = editLives(); break;
   case 'undo-penalty': commit(removeLastPenalty(game()),'Penalidade removida.'); break;
   case 'import': root.querySelector('#import-file')?.click(); break;
   case 'export': saveBackup(); break;
  }
 } catch (error) { showToast(error.message || 'Não foi possível realizar a ação.',true); }
});
window.addEventListener('online', () => { if (pending) flush(); else poll(); });
window.addEventListener('beforeunload', e => { if (pending || saving) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', () => location.reload());
setInterval(() => { if (pending && !conflict) flush(); else poll(); },4000);
boot();



