import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createGame,biddingOrder,nextBidderId,forbiddenBid,placeBid,addTrick,undoTrick,
 handResults,settleHand,addPenalty,redeal,finalOutcome,nextCardCount,verifySavedGame
} from '../src/engine.js';

const game5=()=>createGame({names:['A','B','C','D','E'],dealerIndex:4});
const bidAll=(game,values)=>{
 let g=game;
 for(const v of values)g=placeBid(g,nextBidderId(g),v);
 return g;
};

test('inicia 5 vidas, uma carta, ordem anti-horária e carteador último',()=>{
 const g=game5();
 assert.equal(g.cards,1);assert.deepEqual(biddingOrder(g),['p1','p2','p3','p4','p5']);
 assert.equal(g.players[0].lives,5);assert.equal(g.capAtRoundStart,8);
});
test('limita 3 a 8 jogadores e não aceita duplicados',()=>{
 assert.throws(()=>createGame({names:['A','B']}));
 assert.throws(()=>createGame({names:Array(9).fill('A')}));
 assert.throws(()=>createGame({names:['A','a','C']}));
});
test('regra do pé proíbe apenas soma igual e aceita alternativas',()=>{
 let g=game5();
 for(const n of [0,0,0,1]) g=placeBid(g,nextBidderId(g),n);
 assert.equal(forbiddenBid(g),0); // 1 carta, soma anterior 1
 assert.throws(()=>placeBid(g,'p5',0),/Regra do pé/);
 assert.equal(placeBid(g,'p5',1).stage,'tricks');
});
test('palpites são travados após registro; cartas da mão limitam valores',()=>{
 const g=game5();
 assert.throws(()=>placeBid(g,'p5',0),/vez/);
 assert.throws(()=>placeBid(g,'p1',2),/intervalo/);
});
test('vaza melada não dá ponto; critério B não permite melar',()=>{
 let g=bidAll(game5(),[0,0,0,0,0]); // total 0 != 1
 g=addTrick(g,null);
 assert.equal(g.stage,'review');
 assert.equal(handResults(g).reduce((s,r)=>s+r.won,0),0);
 const b=createGame({names:['A','B','C'],criterion:'B'});
 const gb=bidAll(b,[0,0,0]);
 assert.throws(()=>addTrick(gb,null),/inválido/);
});
test('conta diferenças e penalidades; perda maior que vidas zera placar',()=>{
 let g=bidAll(game5(),[0,0,0,0,0]);
 g=addPenalty(g,'p1','forehead');
 g=addTrick(g,'p1');
 const r=handResults(g).find(x=>x.id==='p1');
 assert.equal(r.lost,2);assert.equal(r.after,3);
 const next=settleHand(g);
 assert.equal(next.players[0].lives,3);assert.equal(next.cards,2);assert.equal(next.dealerId,'p1');
 assert.equal(next.history[0].results[0].lost,2);
});
test('carta na testa só permite penalidade na mão de 1 carta',()=>{
 let g=bidAll(game5(),[0,0,0,0,0]); g=addTrick(g,'p1'); g=settleHand(g);
 assert.throws(()=>addPenalty(g,'p1','forehead'),/1 carta/);
});
test('redistribuição penaliza apenas depois dos primeiros palpites',()=>{
 let g=redeal(game5());assert.equal(g.penalties.length,0);
 g=placeBid(g,'p1',0); g=redeal(g);
 assert.deepEqual(g.bids,{});assert.equal(g.penalties.length,1);
 assert.equal(g.penalties[0].playerId,'p5');assert.equal(g.stage,'bidding');
});
test('desfaz última vaza na revisão e volta para vazas',()=>{
 let g=addTrick(bidAll(game5(),[0,0,0,0,0]),null);
 assert.equal(undoTrick(g).stage,'tricks');
});
test('atinge pico e desce, volta a subir depois de uma carta',()=>{
 const g={...game5(),cards:8,capAtRoundStart:8,direction:'up'};
 assert.deepEqual(nextCardCount(g,5),{cards:7,direction:'down',cap:8});
 assert.deepEqual(nextCardCount({...g,cards:1,direction:'down'},5),{cards:2,direction:'up',cap:8});
 assert.deepEqual(nextCardCount(g,4),{cards:7,direction:'down',cap:10});
});
test('morte súbita: ambos os finalistas zeram e voltam com uma vida',()=>{
 let g=createGame({names:['A','B','C'],lives:3});
 // cenário final fabricado para testar a regra terminal
 g.players[0].lives=1;g.players[1].lives=1;g.players[2].lives=0;
 g.handPlayerIds=['p1','p2'];g.dealerId='p2';g.cards=2;g.capAtRoundStart=20;
 g=bidAll(g,[1,2]); // 3 !== 2
 g=addTrick(g,null);g=addTrick(g,null);
 assert.equal(finalOutcome(g).suddenDeath,true);
 g=settleHand(g);assert.equal(g.players[0].lives,1);assert.equal(g.players[1].lives,1);
 assert.equal(g.history[0].suddenDeath,true);
});
test('três ou mais eliminados juntos não recebem regra inventada',()=>{
 let g=createGame({names:['A','B','C'],lives:3});g.players.forEach(p=>p.lives=1);
 g=bidAll(g,[1,1,1]); // 3 !== 1
 g=addTrick(g,null);
 assert.equal(finalOutcome(g).unregulatedTie,true);
 assert.throws(()=>settleHand(g),/não determina/);
});
test('valida backup válido',()=>assert.equal(verifySavedGame(game5()),true));
test('descarta backup com markup injetado no contador ou no histórico',()=>{
  const g=game5();
  g.roundNumber='<img src=x onerror=alert(1)>';
  assert.equal(verifySavedGame(g),false);
  const h=game5(); h.history=[{roundNumber:'<script>',cards:1,results:[]}];
  assert.equal(verifySavedGame(h),false);
});
