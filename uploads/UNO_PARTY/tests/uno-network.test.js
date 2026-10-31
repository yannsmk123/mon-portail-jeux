'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
// Le transport est simulé : le site de production utilise Socket.IO.
const {attachUno}=require('../uno-server/uno-module');
function harness(){
 const handlers={};const sockets=new Map();
 const nsp={sockets,on(event,callback){handlers[event]=callback;},to(socketId){return {emit(event,data){sockets.get(socketId)?.received.push({event,data});}};}};
 const io={of(namespace){assert.equal(namespace,'/uno');return nsp;}};
 attachUno(null,io,{path:'/games/uno'});
 function connect(id){
  const socket={id,data:{},handlers:{},received:[],on(k,fn){this.handlers[k]=fn;},use(fn){this.middleware=fn;},join(){},leave(){},emit(event,data){this.received.push({event,data});}};
  sockets.set(id,socket);handlers.connection(socket);return socket;
 }
 function call(socket,event,args={}){
  let result;socket.handlers[event](args,response=>result=response);return result;
 }
 return {connect,call};
}
test('le module natif initialise le namespace UNO sans nécessiter Express',()=>{
 assert.ok(harness().connect('ok'));
});
test('jusqu’à quatre personnes dans un salon, jamais cinq',()=>{
 const h=harness();const clients=Array.from({length:5},(_,i)=>h.connect('mock'+i));
 const first=h.call(clients[0],'room:create',{name:'Alice'});
 assert.equal(first.ok,true);assert.equal(first.code.length,6);
 for(let i=1;i<4;i++)assert.equal(h.call(clients[i],'room:join',{code:first.code,name:'J'+i}).ok,true);
 assert.match(h.call(clients[4],'room:join',{code:first.code,name:'Invité'}).error,/complet/);
});
test('le serveur ne transmet que la main de la personne destinataire',()=>{
 const h=harness();const a=h.connect('a'),b=h.connect('b');
 const id=h.call(a,'room:create',{name:'Alice'});
 h.call(b,'room:join',{code:id.code,name:'Bob'});
 h.call(a,'room:set-bots',{count:0});
 assert.equal(h.call(a,'game:start').ok,true);
 const aState=a.received.filter(x=>x.event==='game:state').at(-1).data;
 const bState=b.received.filter(x=>x.event==='game:state').at(-1).data;
 assert.equal(aState.hand.length,7);assert.equal(bState.hand.length,7);
 assert.equal(aState.players.length,2);
 assert.ok(!aState.players[1].hand);assert.ok(!bState.players[0].hand);
 assert.equal(aState.players[1].handCount,7);
 assert.notEqual(aState.meId,bState.meId);
});
test('un client ne peut pas jouer une carte absente de sa main ou hors tour',()=>{
 const h=harness();const a=h.connect('turn-a'),b=h.connect('turn-b');
 const one=h.call(a,'room:create',{name:'Un'});
 h.call(b,'room:join',{code:one.code,name:'Deux'});
 h.call(a,'room:set-bots',{count:0});h.call(a,'game:start');
 assert.match(h.call(a,'game:play',{cardId:'carte_inconnue'}).error,/pas dans ta main/);
 assert.match(h.call(b,'game:draw').error,/pas ton tour/);
});
test('reconnexion avec jeton : la même main est retrouvée',()=>{
 const h=harness();const a=h.connect('reco-a'),b=h.connect('reco-b');
 const one=h.call(a,'room:create',{name:'Reconnexion'});
 h.call(b,'room:join',{code:one.code,name:'Ami'});
 h.call(a,'room:set-bots',{count:0});h.call(a,'game:start');
 const before=a.received.filter(x=>x.event==='game:state').at(-1).data.hand;
 a.handlers.disconnect();
 const a2=h.connect('reco-a2');
 assert.equal(h.call(a2,'room:join',{code:one.code,token:one.token,name:'Nouveau'}).ok,true);
 assert.deepEqual(a2.received.filter(x=>x.event==='game:state').at(-1).data.hand,before);
});
