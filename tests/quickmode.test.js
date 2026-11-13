import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,placeBid,nextBidderId,undoBid,addTrick,setHandTotals,handResults,backToTricks,settleHand} from '../src/engine.js';
const bidAll = (g,values) => values.reduce((acc,v)=>placeBid(acc,nextBidderId(acc),v),g);
test('desfaz último palpite mesmo após última aposta, se ainda não houve vaza',()=>{
 let g=bidAll(createGame({names:['Ana','Beto','Caio']}),[0,0,0]);
 assert.equal(g.stage,'tricks');g=undoBid(g);
 assert.equal(g.stage,'bidding');assert.equal(Object.keys(g.bids).length,2);
 g=placeBid(g,nextBidderId(g),0);g=addTrick(g,'p1');
 assert.throws(()=>undoBid(g),/vazas/);
});
test('totais rápidos registram vazas meladas e perdem vidas por diferença',()=>{
 let g=bidAll(createGame({names:['Ana','Beto','Caio']}),[0,0,0]);
 g=setHandTotals(g,{p1:1,p2:0,p3:0});
 assert.equal(g.stage,'review');assert.equal(g.manualResults.p1,1);
 const result=handResults(g);
 assert.equal(result.find(x=>x.id==='p1').lost,1);
 assert.equal(result.find(x=>x.id==='p2').lost,0);
 let next=settleHand(g);
 assert.equal(next.history[0].manualResults.p1,1);
 assert.equal(next.players[0].lives,4);
});
test('critério B exige que todas as vazas tenham vencedor e total não pode exceder',()=>{
 let g=bidAll(createGame({names:['Ana','Beto','Caio'],criterion:'B'}),[0,0,0]);
 assert.throws(()=>setHandTotals(g,{p1:0,p2:0,p3:0}),/vencedor/);
 assert.throws(()=>setHandTotals(g,{p1:1,p2:1,p3:0}),/ultrapassar/);
 g=setHandTotals(g,{p1:1,p2:0,p3:0});
 g=backToTricks(g);assert.equal(g.stage,'tricks');assert.equal(g.manualResults,undefined);
});
test('regra do pé em 7 cartas: se os quatro primeiros somam 1, proíbe 6',()=>{
 let g=createGame({names:['A','B','C','D','E'],dealerIndex:4});
 g.cards=7;
 g=placeBid(g,'p1',0);g=placeBid(g,'p2',0);g=placeBid(g,'p3',0);g=placeBid(g,'p4',1);
 assert.throws(()=>placeBid(g,'p5',6),/Regra do pé/);
 assert.equal(placeBid(g,'p5',7).stage,'tricks');
});
