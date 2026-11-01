'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const EventEmitter=require('node:events');
const Module=require('node:module');
const fs=require('node:fs');
const path=require('node:path');
class FakeSocket extends EventEmitter{
 constructor(){super();this.readyState=1;this.messages=[];this.isAlive=true;}
 send(data){this.messages.push(JSON.parse(data));}
 close(){this.readyState=3;this.emit('close');}
 ping(){this.emit('pong');}
 terminate(){this.close();}
 receive(data){this.emit('message',Buffer.from(JSON.stringify(data)),false);}
 last(type){return this.messages.filter(m=>m.type===type).at(-1);}
}
class FakeWSS extends EventEmitter{
 constructor(){super();this.clients=new Set();}
 connect(){const s=new FakeSocket();this.clients.add(s);s.on('close',()=>this.clients.delete(s));this.emit('connection',s);return s;}
 handleUpgrade(_req,_socket,_head,cb){cb(this.connect());}
 close(){this.emit('close');}
}
function setup(){
 const original=Module._load;
 Module._load=function(name,...args){return name==='ws'?{WebSocketServer:FakeWSS,WebSocket:{OPEN:1}}:original.call(this,name,...args);};
 let install;
 try{const key=require.resolve('../splendor-online/server');delete require.cache[key];install=require('../splendor-online/server').installSplendorOnline;}finally{Module._load=original;}
 const server=new EventEmitter();const online=install(server);
 return {...online,server};
}
const plateau=(turn=0,moves=0)=>({mode:'online',turn,moves,end:false,players:[{},{}],market:[[],[],[]],bank:[4,4,4,4,4,5,20]});
test('Splendor : salle unique, code, deux accès privés et validation des tours',()=>{
 const {wss,rooms}=setup(),host=wss.connect();host.receive({type:'create'});
 const created=host.last('created');assert.match(created.code,/^[A-F0-9]{6}$/);assert.match(created.token,/^[a-f0-9]{48}$/);
 const guest=wss.connect();guest.receive({type:'join',code:created.code});
 assert.equal(host.last('guest_joined').type,'guest_joined');assert.notEqual(guest.last('joined').token,created.token);
 const third=wss.connect();third.receive({type:'join',code:created.code});assert.match(third.last('error').message,/deux joueurs/);
 host.receive({type:'state',state:plateau()});
 assert.equal(host.last('confirmed').revision,1);assert.equal(guest.last('state').revision,1);
 guest.receive({type:'action',action:'pass',payload:{},revision:1});assert.match(guest.last('rejected').message,/tour/);
 host.receive({type:'state',state:plateau(1,1)});assert.equal(guest.last('state').revision,2);
 guest.receive({type:'action',action:'take',payload:{colors:[0,1,2]},revision:1});assert.match(guest.last('rejected').message,/actualisé/);
 guest.receive({type:'action',action:'take',payload:{colors:[0,1,2]},revision:2});assert.equal(host.last('action').action,'take');
 host.receive({type:'state',state:plateau(0,2)});assert.equal(guest.last('state').revision,3);
 const fake=wss.connect();fake.receive({type:'resume',code:created.code,role:'guest',token:'bad'});assert.match(fake.last('error').message,/Impossible/);
 assert.equal(rooms.size,1);
 host.receive({type:'leave'});assert.equal(rooms.size,0);assert.equal(guest.last('peer_left').type,'peer_left');
 wss.close();
});
test('Splendor : coupure provisoire, reprise et état complet restauré',()=>{
 const {wss}=setup(),host=wss.connect();host.receive({type:'create'});const a=host.last('created');
 const guest=wss.connect();guest.receive({type:'join',code:a.code});const b=guest.last('joined');
 host.receive({type:'state',state:plateau(1,7)});
 guest.close();assert.equal(host.last('peer_status').connected,false);
 const other=wss.connect();other.receive({type:'resume',code:a.code,role:'guest',token:b.token});
 assert.equal(other.last('resumed').state.moves,7);assert.equal(other.last('resumed').revision,1);
 assert.equal(host.last('peer_status').connected,true);
 host.close();assert.equal(other.last('peer_status').connected,false);
 const back=wss.connect();back.receive({type:'resume',code:a.code,role:'host',token:a.token});
 assert.equal(back.last('resumed').state.turn,1);
 assert.equal(back.last('resumed').peerOnline,true);
 wss.close();
});
test('Le code solo et le menu dorigine restent dans le HTML du jeu',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../uploads/marvel-splendor/index.html'),'utf8');
 assert.match(html,/function fresh\(difficulty='normal',startingChoice='random',network=false\)/);
 assert.match(html,/game\.mode==='online'/);
 assert.match(html,/gemmes_prototype_v2/);
 assert.match(html,/2 joueurs en ligne/);
 assert.match(html,/\/splendor-socket/);
});
