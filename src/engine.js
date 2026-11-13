/** Regras do marcador baseadas no regulamento fornecido pelo usuário. */
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 3;
export const DECK_SIZE = 40;
export const STORAGE_KEY = 'fodinha-marcador-v1';

export const CARD_HIERARCHY = [
  ['1 de Espadas', 'Espadão'],
  ['1 de Paus', 'Bastão'],
  ['7 de Espadas', 'Manilha de Espadas'],
  ['7 de Ouros', 'Manilha de Ouros'],
  ['Todos os 3', 'Ternos'],
  ['Todos os 2', 'Duques'],
  ['1 de Copas / 1 de Ouros', 'Ases falsos'],
  ['Todos os 12', 'Reis'],
  ['Todos os 11', 'Cavalos'],
  ['Todos os 10', 'Sotas'],
  ['7 de Copas / 7 de Paus', 'Setes falsos'],
  ['Todos os 6', 'Seis'],
  ['Todos os 5', 'Cincos'],
  ['Todos os 4', 'Quatros'],
];

const clone = obj => JSON.parse(JSON.stringify(obj));
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function createGame({ names, lives = 5, criterion = 'A', dealerIndex = 0 }) {
  const clean = names.map(s => String(s).trim()).filter(Boolean);
  ensure(clean.length >= MIN_PLAYERS && clean.length <= MAX_PLAYERS, 'Informe de 3 a 8 jogadores.');
  ensure(new Set(clean.map(n => n.toLocaleLowerCase('pt-BR'))).size === clean.length, 'Os jogadores precisam ter nomes diferentes.');
  ensure(clean.every(n => n.length <= 30), 'Use nomes com até 30 caracteres.');
  ensure(lives === 5 || lives === 3, 'As vidas iniciais devem ser 3 ou 5.');
  ensure(criterion === 'A' || criterion === 'B', 'Critério de empate inválido.');
  ensure(Number.isInteger(dealerIndex) && dealerIndex >= 0 && dealerIndex < clean.length, 'Carteador inválido.');
  const players = clean.map((name, index) => ({ id: `p${index + 1}`, name, lives, position: index }));
  return {
    version: 1, createdAt: new Date().toISOString(), initialLives: lives, criterion,
    players, dealerId: players[dealerIndex].id, roundNumber: 1, cards: 1,
    capAtRoundStart: Math.floor(DECK_SIZE / players.length), direction: 'up', stage: 'bidding',
    handPlayerIds: players.map(p => p.id), bids: {}, tricks: [], penalties: [], history: [],
    deathmatch: false, lastSavedAt: new Date().toISOString(),
  };
}

export const playerById = (game, id) => game.players.find(p => p.id === id);
export const handPlayers = game => game.handPlayerIds.map(id => playerById(game, id)).filter(Boolean);
export const livingPlayers = game => game.players.filter(p => p.lives > 0);

/** No placar, cadastre os nomes no sentido horário; o pé sempre fala por último. */
export function biddingOrder(game) {
  const active = game.handPlayerIds;
  const idx = active.indexOf(game.dealerId);
  ensure(idx >= 0, 'Carteador precisa fazer parte da mão.');
  return [...active.slice(idx + 1), ...active.slice(0, idx + 1)];
}
export function nextBidderId(game) {
  if (game.stage !== 'bidding') return null;
  return biddingOrder(game).find(id => !Object.hasOwn(game.bids, id)) ?? null;
}
export function forbiddenBid(game) {
  const current = nextBidderId(game);
  if (current !== game.dealerId) return null;
  const value = game.cards - Object.values(game.bids).reduce((a, b) => a + b, 0);
  return value >= 0 && value <= game.cards ? value : null;
}
export function placeBid(source, playerId, value) {
  const game = clone(source);
  ensure(game.stage === 'bidding', 'Não estamos na fase de palpites.');
  ensure(playerId === nextBidderId(game), 'Aguarde a vez desse jogador.');
  ensure(Number.isInteger(value) && value >= 0 && value <= game.cards, 'Palpite fora do intervalo permitido.');
  ensure(forbiddenBid(game) !== value, 'Regra do pé: a soma dos palpites não pode ser igual às cartas da mão.');
  game.bids[playerId] = value;
  if (!nextBidderId(game)) game.stage = 'tricks';
  return game;
}
/** Desfaz o último palpite, apenas enquanto nenhuma vaza foi registrada. */
export function undoBid(source) {
  const game = clone(source);
  ensure((game.stage === 'bidding' || game.stage === 'tricks') && game.tricks.length === 0, 'Não é possível desfazer palpites depois das vazas.');
  const placed = biddingOrder(game).filter(id => Object.hasOwn(game.bids, id));
  ensure(placed.length, 'Não há palpite a desfazer.');
  delete game.bids[placed.at(-1)];
  game.stage = 'bidding';
  return game;
}

export function firstLeaderId(game) { return biddingOrder(game)[0]; }
export function trickLeaderId(game) {
  let leader = firstLeaderId(game);
  for (const trick of game.tricks) {
    if (trick.winnerId) leader = trick.winnerId;
  }
  return leader;
}
export function addTrick(source, winnerId) {
  const game = clone(source);
  ensure(game.stage === 'tricks', 'Não estamos na fase das vazas.');
  ensure(game.tricks.length < game.cards, 'Todas as vazas já foram registradas.');
  ensure(winnerId === null ? game.criterion === 'A' : game.handPlayerIds.includes(winnerId), 'Resultado de vaza inválido.');
  delete game.manualResults;
  game.tricks.push({ winnerId, openedById: trickLeaderId(game) });
  if (game.tricks.length === game.cards) game.stage = 'review';
  return game;
}
export function undoTrick(source) {
  const game = clone(source);
  ensure((game.stage === 'tricks' || game.stage === 'review') && game.tricks.length > 0, 'Não há vaza a desfazer.');
  game.tricks.pop();
  game.stage = 'tricks';
  return game;
}
export function addPenalty(source, playerId, reason) {
  const game = clone(source);
  ensure(['bidding', 'tricks', 'review'].includes(game.stage), 'Não é possível penalizar nesta etapa.');
  ensure(game.handPlayerIds.includes(playerId), 'Jogador não está nesta mão.');
  ensure(['forehead', 'signals'].includes(reason), 'Tipo de penalidade inválido.');
  ensure(reason !== 'forehead' || game.cards === 1, 'A infração da testa só existe em mãos de 1 carta.');
  game.penalties.push({ playerId, reason });
  return game;
}
export function removeLastPenalty(source) {
  const game = clone(source);
  ensure(game.penalties.length > 0, 'Não há penalidades a desfazer.');
  game.penalties.pop();
  return game;
}
export function redeal(source) {
  const game = clone(source);
  ensure(['bidding', 'tricks', 'review'].includes(game.stage), 'Esta mão não pode ser redistribuída.');
  // O carteador perde uma vida se o erro de distribuição é percebido após iniciados os palpites.
  if (Object.keys(game.bids).length > 0) game.penalties.push({ playerId: game.dealerId, reason: 'misdeal' });
  game.bids = {};
  game.tricks = [];
  delete game.bidDraft;
  delete game.manualResults;
  game.stage = 'bidding';
  return game;
}
/** Modo rápido: registra a quantidade final de vazas, sem indicar cada vaza individualmente. */
export function setHandTotals(source, totals) {
  const game = clone(source);
  ensure(game.stage === 'tricks', 'O resultado só pode ser registrado na fase das vazas.');
  ensure(totals && typeof totals === 'object', 'Informe as vazas feitas por cada jogador.');
  const counts = {};
  for (const id of game.handPlayerIds) {
    const n = totals[id];
    ensure(Number.isInteger(n) && n >= 0 && n <= game.cards, 'Quantidade de vazas inválida.');
    counts[id] = n;
  }
  const sum = Object.values(counts).reduce((a,b) => a+b, 0);
  ensure(sum <= game.cards, 'A soma das vazas feitas não pode ultrapassar as cartas da mão.');
  ensure(game.criterion === 'A' || sum === game.cards, 'Neste critério, toda vaza precisa ter um vencedor.');
  game.manualResults = counts;
  game.tricks = [];
  game.stage = 'review';
  return game;
}
export function backToTricks(source) {
  const game = clone(source);
  ensure(game.stage === 'review', 'Não há resultado para corrigir.');
  game.stage = 'tricks';
  if (game.manualResults) delete game.manualResults;
  return game;
}
export function winsOf(game, playerId) {
  if (game.manualResults) return game.manualResults[playerId] ?? 0;
  return game.tricks.filter(t => t.winnerId === playerId).length;
}
export function handResults(game) {
  return handPlayers(game).map(p => {
    const bid = game.bids[p.id];
    const won = winsOf(game, p.id);
    const difference = Math.abs(bid - won);
    const penalty = game.penalties.filter(item => item.playerId === p.id).length;
    const lost = difference + penalty;
    return { id: p.id, name: p.name, bid, won, difference, penalty, lost, before: p.lives, after: Math.max(0, p.lives - lost) };
  });
}

export function nextCardCount(game, nextActiveCount) {
  const nextCap = Math.floor(DECK_SIZE / nextActiveCount);
  let direction = game.direction;
  if (direction === 'up' && game.cards >= game.capAtRoundStart) direction = 'down';
  if (direction === 'down' && game.cards <= 1) direction = 'up';
  const cards = Math.max(1, Math.min(nextCap, game.cards + (direction === 'up' ? 1 : -1)));
  return { cards, direction, cap: nextCap };
}
export function nextDealer(game, activeIds) {
  const previousPosition = game.players.findIndex(p => p.id === game.dealerId);
  for (let i = 1; i <= game.players.length; i++) {
    const player = game.players[(previousPosition + i) % game.players.length];
    if (activeIds.includes(player.id)) return player.id;
  }
  return null;
}
export function finalOutcome(game) {
  const results = handResults(game);
  const remaining = results.filter(p => p.after > 0);
  const suddenDeath = game.handPlayerIds.length === 2 && remaining.length === 0;
  const unregulatedTie = game.handPlayerIds.length > 2 && remaining.length === 0;
  return { results, remaining, suddenDeath, unregulatedTie };
}
export function settleHand(source) {
  const game = clone(source);
  ensure(game.stage === 'review', 'Revise a mão antes de concluir.');
  const outcome = finalOutcome(game);
  ensure(!outcome.unregulatedTie, 'O regulamento não determina como resolver a eliminação simultânea de 3 ou mais jogadores.');
  const snapshot = {
    roundNumber: game.roundNumber, cards: game.cards, dealerId: game.dealerId,
    handPlayerIds: [...game.handPlayerIds], bids: { ...game.bids },
    tricks: clone(game.tricks), manualResults: game.manualResults ? clone(game.manualResults) : null, penalties: clone(game.penalties), results: clone(outcome.results),
    suddenDeath: outcome.suddenDeath, date: new Date().toISOString(),
  };
  game.history.unshift(snapshot);
  for (const result of outcome.results) {
    playerById(game, result.id).lives = outcome.suddenDeath ? 1 : result.after;
  }
  game.deathmatch = outcome.suddenDeath;
  const remaining = livingPlayers(game);
  if (remaining.length === 1) {
    game.stage = 'finished';
    return game;
  }
  const next = nextCardCount(game, remaining.length);
  game.dealerId = nextDealer(game, remaining.map(p => p.id));
  game.roundNumber++;
  game.cards = next.cards;
  game.direction = next.direction;
  game.capAtRoundStart = next.cap;
  game.handPlayerIds = remaining.map(p => p.id);
  game.bids = {};
  game.tricks = [];
  delete game.bidDraft;
  delete game.manualResults;
  game.penalties = [];
  game.stage = 'bidding';
  return game;
}
/** Ajuste de mesa administrativo, usado somente para solucionar uma exceção sem previsão no PDF. */
export function adjustLives(source, playerId, lives) {
  const game = clone(source);
  ensure(game.players.some(p => p.id === playerId), 'Jogador não encontrado.');
  ensure(Number.isInteger(lives) && lives >= 0 && lives <= 99, 'Informe de 0 a 99 vidas.');
  playerById(game, playerId).lives = lives;
  delete game.bidDraft;
  // Jogadores corrigidos entram ou saem do placar da mão atual.
  if (game.stage !== 'finished') {
    game.handPlayerIds = livingPlayers(game).map(p => p.id);
    ensure(game.handPlayerIds.length >= 2, 'Mantenha pelo menos dois jogadores; finalize pelo placar.');
    if (!game.handPlayerIds.includes(game.dealerId)) game.dealerId = game.handPlayerIds[0];
    for (const key of ['bids', 'totals', 'manualResults']) {
      if (game[key]) for (const id of Object.keys(game[key])) if (!game.handPlayerIds.includes(id)) delete game[key][id];
    }
    game.penalties = game.penalties.filter(p => game.handPlayerIds.includes(p.playerId));
  }
  return game.mode === 'scoreboard' ? scoreboard(game) : game;
}

/** Placar por totais: nenhuma vaza individual precisa ser registrada. */
export function scoreboard(source) {
  const game = clone(source);
  game.mode = 'scoreboard';
  game.totals ??= Object.fromEntries(game.handPlayerIds.map(id => [id, winsOf(game, id)]));
  for (const id of Object.keys(game.totals)) if (!game.handPlayerIds.includes(id)) delete game.totals[id];
  if (game.stage !== 'finished') game.stage = game.handPlayerIds.every(id => Object.hasOwn(game.bids, id)) ? 'tricks' : 'bidding';
  if (game.stage === 'bidding') game.bidDraft ??= 0;
  return game;
}
export function changeScore(source, playerId, field, value) {
  const game = scoreboard(source);
  ensure(game.stage !== 'finished' && game.handPlayerIds.includes(playerId), 'Jogador fora da disputa.');
  ensure(['bids', 'totals'].includes(field), 'Marcador inválido.');
  ensure(Number.isInteger(value) && value >= 0 && value <= game.cards, 'Use um valor entre zero e as cartas da mão.');
  if (field === 'bids') {
    ensure(playerId === nextBidderId(game), 'Aguarde a vez desse jogador.');
    game.bidDraft = value;
  } else {
    ensure(game.stage === 'tricks', 'Confirme todos os palpites antes de marcar o resultado.');
    game.totals[playerId] = value;
  }
  return game;
}
export function confirmScoreBid(source) {
  const game = scoreboard(source);
  ensure(nextBidderId(game), 'Todos os palpites já foram confirmados.');
  ensure(Number.isInteger(game.bidDraft), 'Informe o palpite, inclusive zero.');
  const next = placeBid(game, nextBidderId(game), game.bidDraft);
  delete next.bidDraft;
  return scoreboard(next);
}
export function undoScoreBid(source) {
  const game = scoreboard(source);
  ensure(Object.values(game.totals).every(n => n === 0), 'Não é possível corrigir palpites após marcar o resultado.');
  const last = biddingOrder(game).filter(id => Object.hasOwn(game.bids, id)).at(-1);
  const next = undoBid(game);
  next.bidDraft = game.bids[last];
  return next;
}
export function configureScoreHand(source, cards, dealerId) {
  const game = scoreboard(source);
  ensure(game.stage !== 'finished', 'A partida já terminou.');
  ensure(Number.isInteger(cards) && cards >= 1 && cards <= Math.floor(DECK_SIZE / game.handPlayerIds.length), 'Quantidade de cartas fora do limite do baralho.');
  ensure(game.handPlayerIds.includes(dealerId), 'Escolha um pé em jogo.');
  ensure(dealerId === game.dealerId || Object.keys(game.bids).length === 0, 'Desfaça os palpites confirmados antes de trocar o pé.');
  ensure([...Object.values(game.bids), ...Object.values(game.totals)].every(n => n <= cards), 'Corrija os marcadores antes de diminuir as cartas.');
  ensure(game.bidDraft == null || game.bidDraft <= cards, 'Corrija o palpite em edição antes de diminuir as cartas.');
  if (dealerId !== game.dealerId) delete game.bidDraft;
  game.cards = cards;
  game.capAtRoundStart = Math.floor(DECK_SIZE / game.handPlayerIds.length);
  game.dealerId = dealerId;
  return scoreboard(game);
}
export function finishScoreHand(source) {
  let game = scoreboard(source);
  ensure(game.stage !== 'finished', 'A partida já terminou.');
  ensure(game.handPlayerIds.every(id => Object.hasOwn(game.bids, id)), 'Informe o palpite de todos os jogadores, inclusive zero.');
  ensure(Object.values(game.bids).reduce((a, b) => a + b, 0) !== game.cards, 'Regra do pé: a soma dos palpites não pode igualar as cartas da mão.');
  const previous = clone(game);
  delete previous.undoState;
  game = settleHand(setHandTotals(game, Object.fromEntries(game.handPlayerIds.map(id => [id, game.totals[id] ?? 0]))));
  if (game.stage !== 'finished') {
    game.totals = {};
  }
  game.undoState = previous;
  return scoreboard(game);
}
export function undoScoreHand(source) {
  ensure(source.undoState, 'Não há fechamento para desfazer.');
  return scoreboard(source.undoState);
}
export function verifySavedGame(data) {
  if (!data || typeof data !== 'object' || data.version !== 1) return false;
  if (!Array.isArray(data.players) || data.players.length < MIN_PLAYERS || data.players.length > MAX_PLAYERS) return false;
  if (!Number.isInteger(data.roundNumber) || data.roundNumber < 1 || data.roundNumber > 100000) return false;
  if (!Number.isInteger(data.cards) || data.cards < 1 || data.cards > 20) return false;
  if (!Number.isInteger(data.capAtRoundStart) || data.capAtRoundStart < 1 || data.capAtRoundStart > 20) return false;
  if (![3,5].includes(data.initialLives) || !['A','B'].includes(data.criterion)) return false;
  if (!['up','down'].includes(data.direction)) return false;
  if (!['bidding','tricks','review','finished'].includes(data.stage)) return false;
  if (!Array.isArray(data.handPlayerIds) || !data.handPlayerIds.length) return false;
  if (!data.bids || typeof data.bids !== 'object' || Array.isArray(data.bids)) return false;
  if (!Array.isArray(data.tricks) || data.tricks.length > data.cards) return false;
  if (data.manualResults != null && (typeof data.manualResults !== 'object' || Array.isArray(data.manualResults) ||
      !data.handPlayerIds.every(id => Number.isInteger(data.manualResults[id]) && data.manualResults[id] >= 0 && data.manualResults[id] <= data.cards) ||
      Object.values(data.manualResults).reduce((a,b)=>a+b, 0) > data.cards)) return false;
  if (!Array.isArray(data.penalties) || data.penalties.length > 5000) return false;
  if (!Array.isArray(data.history) || data.history.length > 100000) return false;
  const playersOK = data.players.every(p => p && typeof p.id === 'string' && /^p[1-8]$/.test(p.id) &&
    typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 30 &&
    Number.isInteger(p.lives) && p.lives >= 0 && p.lives <= 99 &&
    Number.isInteger(p.position) && p.position >= 0 && p.position < MAX_PLAYERS);
  if (!playersOK || new Set(data.players.map(p=>p.id)).size !== data.players.length) return false;
  const ids = data.players.map(p=>p.id);
  if (!data.handPlayerIds.every(id => ids.includes(id)) || !(data.stage === 'finished' ? ids : data.handPlayerIds).includes(data.dealerId)) return false;
  if (new Set(data.handPlayerIds).size !== data.handPlayerIds.length) return false;
  if (!Object.entries(data.bids).every(([id,bid])=>data.handPlayerIds.includes(id) && Number.isInteger(bid) && bid >= 0 && bid <= data.cards)) return false;
  if (!data.tricks.every(t=>t && (t.winnerId===null || data.handPlayerIds.includes(t.winnerId)) && data.handPlayerIds.includes(t.openedById))) return false;
  if (!data.penalties.every(p=>p && data.handPlayerIds.includes(p.playerId) && ['forehead','signals','misdeal'].includes(p.reason))) return false;
  if (data.totals != null && (typeof data.totals !== 'object' || Array.isArray(data.totals) || !Object.entries(data.totals).every(([id,n]) => data.handPlayerIds.includes(id) && Number.isInteger(n) && n >= 0 && n <= data.cards))) return false;
  if (data.bidDraft != null && (!Number.isInteger(data.bidDraft) || data.bidDraft < 0 || data.bidDraft > data.cards)) return false;
  if (data.undoState && (data.undoState.undoState || !verifySavedGame(data.undoState))) return false;
  if (!data.history.every(h=>h && Number.isInteger(h.roundNumber) && h.roundNumber > 0 &&
    Number.isInteger(h.cards) && h.cards >= 1 && h.cards <= 20 && ids.includes(h.dealerId) &&
    Array.isArray(h.results) && h.results.length <= MAX_PLAYERS && h.results.every(r=>r && ids.includes(r.id) && typeof r.name === 'string' && r.name.length <= 30 &&
      Number.isInteger(r.bid) && r.bid >= 0 && r.bid <= h.cards && Number.isInteger(r.won) && r.won >= 0 && r.won <= h.cards &&
      r.difference === Math.abs(r.bid - r.won) && Number.isInteger(r.penalty) && r.penalty >= 0 && r.penalty <= 5000 &&
      r.lost === r.difference + r.penalty))) return false;
  return true;
}
