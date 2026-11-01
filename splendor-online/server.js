'use strict';
// Marvel Splendor seulement : WebSocket sur le même port que le portail.
// L'hôte fait tourner le moteur d'origine et valide les intentions de l'invité.
const {WebSocketServer,WebSocket}=require('ws');
const crypto=require('node:crypto');
const ROOM_TTL=24*60*60*1000;
const MAX_ROOMS=500;
const MAX_STATE=512*1024;
const MAX_MESSAGE=576*1024;
const rooms=new Map();
const now=()=>Date.now();
const key=()=>crypto.randomBytes(24).toString('hex');
const code=()=>crypto.randomBytes(3).toString('hex').toUpperCase();
function send(ws,data){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
function reject(ws,message){send(ws,{type:'error',message});}
function broadcastStatus(room){for(const side of ['host','guest'])send(room[side].ws,{type:'peer_status',connected:room[side==='host'?'guest':'host'].ws?.readyState===WebSocket.OPEN});}
function clearSocket(room,side,ws){
 if(room[side].ws!==ws)return;
 room[side].ws=null;room.waitingAction=false;room.changed=now();broadcastStatus(room);
}
function evict(room){rooms.delete(room.code);for(const side of ['host','guest']){send(room[side].ws,{type:'peer_left',message:'Partie fermée par l’autre joueur.'});try{room[side].ws?.close(1000,'Partie terminee');}catch(_){}}}
function associate(ws,room,side){
 const old=room[side].ws;room[side].ws=ws;
 ws.room=room;ws.side=side;
 if(old&&old!==ws){try{old.close(4001,'Session reprise dans un autre onglet');}catch(_){}}
 room.changed=now();
}
function safeState(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.mode!=='online'||!Array.isArray(value.players)||value.players.length!==2)return false;
 // Validation fine du moteur existant côté navigateur ; ici, taille et champs structurants.
 return Array.isArray(value.market)&&value.market.length===3&&Array.isArray(value.bank)&&value.bank.length===7&&Number.isInteger(value.turn)&&[-1,0,1].includes(value.turn)&&Number.isInteger(value.moves)&&value.moves>=0&&value.moves<=100000&&typeof value.end==='boolean';
}
function installSplendorOnline(server,isAuthorized=()=>true){
 const wss=new WebSocketServer({noServer:true,maxPayload:MAX_MESSAGE,perMessageDeflate:false});
 server.on('upgrade',(req,socket,head)=>{
  let pathname;
  try{pathname=new URL(req.url,'http://localhost').pathname;}catch(_){return;}
  if(pathname!=='/splendor-socket')return; // Ne jamais toucher à /socket.io (UNO).
  const origin=req.headers.origin;
  let originOK=false;
  try{if(origin){const u=new URL(origin);originOK=(u.host===(req.headers['x-forwarded-host']||req.headers.host))&&['https:','http:'].includes(u.protocol);}}catch(_){/* fail closed */}
  if(!originOK||!isAuthorized(req)){
   socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;
  }
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',ws=>{
  ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true;});
  ws.on('message',(raw,isBinary)=>{
   if(isBinary)return reject(ws,'Message binaire non accepté.');
   let msg;
   try{msg=JSON.parse(raw.toString('utf8'));}catch(_){return reject(ws,'Message JSON invalide.');}
   if(!msg||typeof msg!=='object'||Array.isArray(msg))return reject(ws,'Message invalide.');
   if(!ws.room){
    if(msg.type==='create'){
     if(rooms.size>=MAX_ROOMS)return reject(ws,'Trop de parties en cours. Réessaie ultérieurement.');
     let id;do{id=code();}while(rooms.has(id));
     const room={code:id,host:{token:key(),ws:null},guest:{token:key(),ws:null},revision:0,state:null,changed:now(),waitingAction:false};
     rooms.set(id,room);associate(ws,room,'host');
     return send(ws,{type:'created',code:id,token:room.host.token});
    }
    if(msg.type==='join'){
     const id=String(msg.code||'').toUpperCase();const room=rooms.get(id);
     if(!/^[A-F0-9]{6}$/.test(id)||!room)return reject(ws,'Code inconnu ou partie expirée.');
     if(room.guest.ws||room.guestJoined)return reject(ws,'Cette salle contient déjà deux joueurs. Pour revenir, utilise « Reprendre ma partie ».');
     room.guestJoined=true;associate(ws,room,'guest');
     send(ws,{type:'joined',code:id,token:room.guest.token});
     send(room.host.ws,{type:'guest_joined'});
     broadcastStatus(room);return;
    }
    if(msg.type==='resume'){
     const room=rooms.get(String(msg.code||'').toUpperCase());
     const side=msg.role==='host'?'host':msg.role==='guest'?'guest':null;
     if(!room||!side||!room[side].token||room[side].token!==msg.token||(side==='guest'&&!room.guestJoined))return reject(ws,'Impossible de retrouver cette partie : code ou accès expiré.');
     associate(ws,room,side);
     send(ws,{type:'resumed',code:room.code,role:side,token:room[side].token,revision:room.revision,state:room.state,peerOnline:!!room[side==='host'?'guest':'host'].ws});
     broadcastStatus(room);return;
    }
    return reject(ws,'Crée ou rejoins d’abord une partie.');
   }
   const room=ws.room,side=ws.side;
   if(room[side].ws!==ws)return; // Un ancien onglet n'a plus le droit de jouer.
   room.changed=now();
   if(msg.type==='leave'){evict(room);return;}
   if(msg.type==='resync'){
    if(room.state)return send(ws,{type:'state',revision:room.revision,state:room.state});
    return reject(ws,'En attente du premier plateau.');
   }
   if(msg.type==='state'){
    if(side!=='host'||!room.guestJoined)return reject(ws,'Seul le joueur 1 peut synchroniser le plateau.');
    const length=Buffer.byteLength(JSON.stringify(msg.state));
    if(length>MAX_STATE||!safeState(msg.state))return reject(ws,'Plateau trop volumineux ou invalide.');
    // Le serveur mémorise le dernier plateau complet pour les retours et reconnexions.
    room.state=msg.state;room.revision++;room.waitingAction=false;
    send(ws,{type:'confirmed',revision:room.revision});
    send(room.guest.ws,{type:'state',revision:room.revision,state:room.state});
    return;
   }
   if(msg.type==='action'){
    if(side!=='guest'||!room.state||!room.host.ws||room.host.ws.readyState!==WebSocket.OPEN)return send(ws,{type:'rejected',message:'Joueur 1 momentanément déconnecté.'});
    if(room.waitingAction)return send(ws,{type:'rejected',message:'Action précédente en cours de validation.'});
    if(msg.revision!==room.revision)return send(ws,{type:'rejected',message:'Plateau actualisé : action à refaire.'});
    if(room.state.end||room.state.turn!==1)return send(ws,{type:'rejected',message:'Ce n’est pas le tour du joueur 2.'});
    if(!['take','reserve','buy','conquer','pass'].includes(msg.action)||!msg.payload||typeof msg.payload!=='object'||Array.isArray(msg.payload))return send(ws,{type:'rejected',message:'Action inconnue.'});
    if(Buffer.byteLength(JSON.stringify(msg.payload))>4000)return send(ws,{type:'rejected',message:'Action trop volumineuse.'});
    room.waitingAction=true;
    send(room.host.ws,{type:'action',action:msg.action,payload:msg.payload,revision:room.revision});
    return;
   }
   if(msg.type==='reject'&&side==='host'){
    room.waitingAction=false;send(room.guest.ws,{type:'rejected',message:'Action refusée par les règles du jeu.'});return;
   }
   if(msg.type==='rematch'&&side==='host'&&room.guestJoined){
    room.waitingAction=false;
    send(room.guest.ws,{type:'rematch'});return;
   }
   reject(ws,'Commande inconnue.');
  });
  ws.on('close',()=>{if(ws.room)clearSocket(ws.room,ws.side,ws);});
  ws.on('error',()=>{/* La fermeture libère la présence en salle. */});
 });
 const heartbeat=setInterval(()=>{
  for(const room of rooms.values())if(now()-room.changed>ROOM_TTL)evict(room);
  for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}
 },30000);heartbeat.unref();
 wss.on('close',()=>clearInterval(heartbeat));
 return {wss,rooms};
}
module.exports={installSplendorOnline};
