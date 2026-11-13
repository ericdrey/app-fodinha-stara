import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, scoreboard, changeScore, configureScoreHand, finishScoreHand, undoScoreHand, verifySavedGame, nextBidderId, confirmScoreBid, undoScoreBid } from '../src/engine.js';

const start = () => scoreboard(createGame({ names:['Ana','Beto','Caio'], lives:3 }));
const bid = (g, values) => {
 while (nextBidderId(g)) {
  const id = nextBidderId(g);
  g = confirmScoreBid(changeScore(g,id,'bids',values[Number(id.slice(1))-1]));
 }
 return g;
};

test('placar por totais desconta a diferença, persiste os marcadores e desfaz o fechamento', () => {
 let g = configureScoreHand(start(), 3, 'p3');
 g = bid(g, [2,0,0]);
 g = changeScore(g,'p2','totals',1);
 assert.ok(verifySavedGame(g));
 const next = finishScoreHand(g);
 assert.deepEqual(next.players.map(p => p.lives), [1,2,3]);
 assert.equal(next.cards,4);
 assert.deepEqual(next.totals,{});
 assert.equal(next.history[0].tricks.length,0);
 assert.ok(verifySavedGame(next));
 assert.deepEqual(undoScoreHand(next), g);
});

test('palpites pendentes, regra do pé e somas impossíveis impedem finalizar', () => {
 assert.throws(() => finishScoreHand(start()), /palpite de todos/);
 assert.throws(() => finishScoreHand(bid(start(), [1,0,0])), /Regra do pé/);
 let g = bid(start(), [0,0,0]);
 g = changeScore(changeScore(g,'p1','totals',1),'p2','totals',1);
 assert.throws(() => finishScoreHand(g), /ultrapassar/);
 assert.throws(() => changeScore(start(),'p1','totals',-1), /entre zero/);
 assert.throws(() => configureScoreHand(start(),14,'p1'), /limite/);
});

test('eliminações, campeão e undo continuam sendo backups válidos', () => {
 let g = configureScoreHand(start(),3,'p3');
 g.players[0].lives = 1; g.players[1].lives = 1;
 g = bid(g,[1,2,1]);
 const next = finishScoreHand(g);
 assert.equal(next.stage,'finished');
 assert.deepEqual(next.players.map(p => p.lives),[0,0,2]);
 assert.ok(verifySavedGame(next));
 const restored = undoScoreHand(next);
 assert.ok(verifySavedGame(restored));
 assert.equal(restored.players[0].lives,1);
});

test('morte súbita e empate de três sobreviventes seguem as exceções do PDF', () => {
 let g = start(); g.players[2].lives = 0; g.players[0].lives = 1; g.players[1].lives = 1;
 g.handPlayerIds = ['p1','p2']; g = bidTwo(g);
 const next = finishScoreHand(g);
 assert.equal(next.deathmatch,true);
 assert.deepEqual(next.players.map(p => p.lives),[1,1,0]);
 assert.ok(verifySavedGame(next));
 g = start(); g.players.forEach(p => p.lives = 1); g = bid(g,[1,1,1]);
 assert.throws(() => finishScoreHand(g), /não determina/);
});
function bidTwo(g) { return bid(g,[1,1,0]); }

test('palpite em edição só libera o próximo após confirmar; pé fala por último e valor proibido não avança', () => {
 let g = start();
 assert.equal(nextBidderId(g),'p2');
 assert.throws(() => changeScore(g,'p1','bids',0), /vez/);
 assert.throws(() => changeScore(g,'p2','totals',0), /Confirme todos/);
 g = changeScore(g,'p2','bids',1);
 assert.equal(nextBidderId(g),'p2'); assert.equal(g.bids.p2,undefined);
 assert.ok(verifySavedGame(g));
 g = confirmScoreBid(g); assert.equal(nextBidderId(g),'p3');
 g = confirmScoreBid(changeScore(g,'p3','bids',0));
 assert.equal(nextBidderId(g),'p1');
 assert.throws(() => confirmScoreBid(changeScore(g,'p1','bids',0)), /Regra do pé/);
 g = confirmScoreBid(changeScore(g,'p1','bids',1));
 assert.equal(nextBidderId(g),null); assert.equal(g.stage,'tricks');
 assert.throws(() => changeScore(g,'p2','bids',0), /vez/);
 g = undoScoreBid(g); assert.equal(nextBidderId(g),'p1'); assert.equal(g.bidDraft,1);
 g = confirmScoreBid(g); g = changeScore(g,'p1','totals',1);
 assert.throws(() => undoScoreBid(g), /resultado/);
});

test('cartas sobem até o limite e descem até uma; undo restaura cartas, pé e vez', () => {
 let g = configureScoreHand(start(),12,'p3');
 g = finishScoreHand(bid(g,[0,0,0])); assert.equal(g.cards,13); assert.equal(g.dealerId,'p1');
 const peak = bid(g,[0,0,0]);
 g = finishScoreHand(peak); assert.equal(g.cards,12); assert.equal(g.direction,'down');
 const restoredPeak = {...peak}; delete restoredPeak.undoState;
 assert.deepEqual(undoScoreHand(g),restoredPeak);
 g = configureScoreHand(g,1,g.dealerId);
 g = finishScoreHand(bid(g,[0,0,0])); assert.equal(g.cards,2); assert.equal(g.direction,'up');
 assert.equal(nextBidderId(g),'p1'); assert.ok(verifySavedGame(g));
});

test('eliminação pula o jogador na vez e no pé e recalcula o limite de cartas', () => {
 let g = scoreboard(createGame({names:['A','B','C','D']}));
 g = configureScoreHand(g,9,'p3'); g.players[3].lives=1;
 g = finishScoreHand(bid(g,[0,0,0,1]));
 assert.equal(g.players[3].lives,0); assert.equal(g.dealerId,'p1');
 assert.equal(g.cards,10); assert.equal(g.capAtRoundStart,13); assert.equal(nextBidderId(g),'p2');
 assert.throws(() => changeScore(g,'p4','bids',0), /fora/);
 g = finishScoreHand(bid(g,[0,0,0,0])); assert.equal(g.cards,11);
 assert.ok(verifySavedGame(g));
});

test('o palpite começa em zero a cada vez e o zero padrão continua sujeito à regra do pé', () => {
 let g = start(); assert.equal(g.bidDraft,0);
 g = confirmScoreBid(g); assert.equal(g.bids.p2,0); assert.equal(g.bidDraft,0);
 g = confirmScoreBid(g); assert.equal(g.bids.p3,0); assert.equal(g.bidDraft,0);
 g = confirmScoreBid(g); assert.equal(g.bids.p1,0); assert.equal(g.stage,'tricks');
 g = finishScoreHand(g); assert.equal(g.bidDraft,0);
 g = changeScore(g,nextBidderId(g),'bids',2);
 assert.equal(scoreboard(g).bidDraft,2);
 g = confirmScoreBid(g); g = confirmScoreBid(g);
 assert.equal(g.bidDraft,0);
 assert.throws(() => confirmScoreBid(g), /Regra do pé/);
});
