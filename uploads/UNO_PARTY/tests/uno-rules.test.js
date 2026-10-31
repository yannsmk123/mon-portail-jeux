'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {deck108,createGame,isPlayable,play,draw,pass,callUno,catchUno,topCard,botMove} = require('../uno-server/game');

function players(n=3) {return Array.from({length:n},(_,i)=>({id:'p'+i,name:'P'+i,isBot:i>0,unoDeclared:false,hand:[]}));}
function newMatch(n=3){const ps=players(n);return {ps,g:createGame(ps)};}

test('pioche traditionnelle de 108 cartes',()=>{
 const cards=deck108();
 assert.equal(cards.length,108);
 assert.equal(new Set(cards.map(c=>c.id)).size,108);
 assert.equal(cards.filter(c=>c.value==='wild').length,4);
 assert.equal(cards.filter(c=>c.value==='wild4').length,4);
});
test('chaque joueur commence avec sept cartes',()=>{
 const {ps,g}=newMatch(4);
 assert.deepEqual(ps.map(p=>p.hand.length),[7,7,7,7]);
 assert.equal(g.drawPile.length,108-28-1);
 assert.match(topCard(g).value,/^\d$/);
});
test('carte numerotee jouable par couleur ou numero',()=>{
 const {g}=newMatch();
 g.currentColor='blue';g.discardPile=[{id:'top',color:'red',value:'8'}];
 assert.equal(isPlayable({id:'1',color:'blue',value:'1'},g,[]),true);
 assert.equal(isPlayable({id:'2',color:'yellow',value:'8'},g,[]),true);
 assert.equal(isPlayable({id:'3',color:'yellow',value:'1'},g,[]),false);
});
test('+4 interdit si une autre carte de la couleur en cours est presente',()=>{
 const {g}=newMatch();
 g.currentColor='red';
 const wild4={id:'a',color:null,value:'wild4'};
 assert.equal(isPlayable(wild4,g,[wild4,{id:'b',color:'red',value:'2'}]),false);
 assert.equal(isPlayable(wild4,g,[wild4,{id:'b',color:'blue',value:'2'}]),true);
});
test('les cartes +2 font piocher la prochaine personne qui saute son tour',()=>{
 const {ps,g}=newMatch(3);
 g.currentColor='red';g.discardPile=[{id:'top',color:'red',value:'5'}];
 ps[0].hand=[{id:'action',color:'red',value:'draw2'},{id:'rest',color:'blue',value:'1'}];
 const before=ps[1].hand.length;
 play(ps,g,ps[0].id,'action');
 assert.equal(ps[1].hand.length,before+2);
 assert.equal(g.turnIndex,2);
 assert.equal(g.unoTargetId,ps[0].id);
});
test('inversion avec deux joueurs donne a nouveau la main au meme joueur',()=>{
 const {ps,g}=newMatch(2);
 g.currentColor='green';
 ps[0].hand=[{id:'reverse',color:'green',value:'reverse'},{id:'x',color:'blue',value:'2'}];
 play(ps,g,ps[0].id,'reverse');
 assert.equal(g.turnIndex,0);
 assert.equal(g.direction,-1);
});
test('UNO oublie : les adversaires peuvent sanctionner de deux cartes',()=>{
 const {ps,g}=newMatch(3);
 g.currentColor='yellow';
 ps[0].hand=[{id:'lasttwo',color:'yellow',value:'7'},{id:'other',color:'blue',value:'3'}];
 play(ps,g,ps[0].id,'lasttwo');
 assert.equal(g.unoTargetId,ps[0].id);
 catchUno(ps,g,ps[1].id);
 assert.equal(ps[0].hand.length,3);
 assert.equal(g.unoTargetId,null);
});
test('UNO annonce : les adversaires ne peuvent pas sanctionner',()=>{
 const {ps,g}=newMatch(3);
 g.currentColor='blue';
 ps[0].hand=[{id:'pen',color:'blue',value:'9'},{id:'other',color:'red',value:'3'}];
 play(ps,g,ps[0].id,'pen');
 callUno(ps,g,ps[0].id);
 assert.throws(()=>catchUno(ps,g,ps[1].id),/Personne/);
});
test('piocher deux fois est impossible si une carte piochée est jouable',()=>{
 const {ps,g}=newMatch(2);
 g.currentColor='blue';
 g.drawPile=[{id:'drawn',color:'blue',value:'3'}];
 draw(ps,g,ps[0].id);
 assert.equal(g.drawnCardId,'drawn');
 assert.throws(()=>draw(ps,g,ps[0].id),/déjà pioché/);
 pass(ps,g,ps[0].id);
 assert.equal(g.turnIndex,1);
});
test('les bots peuvent faire avancer la partie sans erreur',()=>{
 const {ps,g}=newMatch(3);
 ps[0].isBot=true;
 for (let i=0;i<50 && !g.winnerId;i++) {
  const bot=ps[g.turnIndex];
  botMove(ps,g,bot.id);
 }
 assert.ok(g.turnIndex>=0 && g.turnIndex<3);
});
