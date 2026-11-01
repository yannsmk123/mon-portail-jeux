'use strict';
// Lost Cities Duel Fusion V107 — duo en ligne (Render ou serveur privé), sans dépendance npm.
// Node.js >= 20 ; serveur de règles autoritaire : mains et pioche jamais exposées.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
const PORT = Number(process.env.PORT || config.port || 3000);
const HOST = process.env.HOST || config.host || '0.0.0.0';
// Ne jamais réutiliser DATA_FILE du portail (s'il est défini pour un autre jeu).
// L'ancien paramètre DATA_FILE reste reconnu au lancement autonome de Lost Cities.
const DATA_FILE = path.resolve(process.env.LOST_CITIES_DATA_FILE || (require.main===module?process.env.DATA_FILE:null) || path.join(__dirname,'data','parties.json'));
// Sur Render Free, ce fichier est temporaire ; utiliser DATA_FILE sur un disque persistant pour la conservation.
const JOIN_LIMIT = new Map();
const MAX_ROOMS = 60;
function cleanupRooms(){
 const now=Date.now();let changed=false;
 for(const [code,room] of ROOMS){
  const last=room.updated||room.created||0;
  const ttl=room.status==='waiting'?6*60*60*1000:room.final?2*24*60*60*1000:14*24*60*60*1000;
  if(last && now-last>ttl){ROOMS.delete(code);changed=true}
 }
 if(changed)persist();
 return changed;
}

const RATE_WINDOW_MS = 10 * 60 * 1000;
function permitLobbyRequest(req) {
 // Limitation des créations et tentatives de codes par IP (protection de base, un seul processus Node).
 // Ne PAS faire confiance à X-Forwarded-For fourni par un client non authentifié.
 const ip=req.socket.remoteAddress || 'unknown';
 const now=Date.now(), entry=JOIN_LIMIT.get(ip);
 if (!entry || now-entry.since > RATE_WINDOW_MS) { JOIN_LIMIT.set(ip,{since:now, count:1}); return true; }
 entry.count++;
 return entry.count <= 70;
}

const ROOMS = new Map();
const COLORS = ['Mer','Montagne','Volcan','Jungle','Désert','Glacier'];
const ACTIVE = count => count===5?[0,1,2,4,5]:[0,1,2,3,4,5];
const randomCode = () => crypto.randomBytes(4).toString('hex').toUpperCase().slice(0,6);
const token = () => crypto.randomBytes(24).toString('hex');
const validCode = x => typeof x==='string' && /^[A-F\d]{6}$/i.test(x.trim());
const safeName = x => String(x||'Explorateur').trim().replace(/[\x00-\x1f<>]/g,'').slice(0,24) || 'Explorateur';
const cardName = c => c.bet?`Joker ${COLORS[c.c]}`:`${c.v} ${COLORS[c.c]}`;
function buildDeck(count){
 const d=[];
 for(const c of ACTIVE(count)){
  for(let v=2;v<=10;v++)d.push({id:`${c}-v${v}`,c,v,bet:false});
  for(let b=0;b<3;b++)d.push({id:`${c}-r${b}`,c,v:0,bet:true});
 }
 for(let i=d.length-1;i>0;i--){const j=crypto.randomInt(i+1);[d[i],d[j]]=[d[j],d[i]]}
 return d;
}
function shuffleDeal(room){
 const deck=buildDeck(room.expeditionCount), hands=[[],[]];
 for(let i=0;i<8;i++){hands[0].push(deck.pop());hands[1].push(deck.pop())}
 room.deck=deck;
 room.players.forEach((p,i)=>{p.hand=hands[i];p.exp=Array.from({length:6},()=>[])});
 room.discards=Array.from({length:6},()=>[]);
 room.phase='draw';room.lastDeckDraw=false;room.ended=false;room.final=false;
 room.turns=1;room.logs=[];
}
function addLog(room,txt){room.logs.unshift({n:room.turns,text:txt});room.logs.length=Math.min(room.logs.length,200)}
function begin(room){room.round=1;room.rounds=room.rounds===3?3:1;room.scoreHistory=[];shuffleDeal(room);room.turn=room.first==='random'?crypto.randomInt(2):room.first;room.status='playing';addLog(room,`${room.players[room.turn].name} commence : pioche une carte avant de jouer.`);bump(room)}
function expScore(arr){if(!arr.length)return 0;const n=arr.reduce((s,c)=>s+c.v,0);return (n-20)*(1+arr.filter(c=>c.bet).length)+(arr.length>=8?20:0)}
function score(room,seat){return room.players[seat].exp.reduce((s,arr)=>s+expScore(arr),0)}
function bump(room){room.revision=(room.revision||0)+1;room.updated=Date.now();persist()}
function persist(){
 try{fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});const tmp=DATA_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify([...ROOMS.values()],null,2));fs.renameSync(tmp,DATA_FILE)}catch(e){console.error('Erreur de sauvegarde:',e.message)}
}
try{for(const room of JSON.parse(fs.readFileSync(DATA_FILE,'utf8'))){if(room?.code&&Array.isArray(room.players)){
  for(const p of room.players)p.lastSeen=0;
  if(room.youngest!==0&&room.youngest!==1)room.youngest=room.first===1?1:0; // Salons V107 déjà créés.
  ROOMS.set(room.code,room)
 }}}catch(e){if(e.code!=='ENOENT')console.warn('Sauvegarde non chargée:',e.message)}
function view(room,seat){
 const opp=1-seat,connected=room.players.map(p=>!!p&&Date.now()-(p.lastSeen||0)<12000);
 const data={
  code:room.code,seat,revision:room.revision,status:room.status,connected,
  names:room.players.map(p=>p?.name||null),expeditionCount:room.expeditionCount,rounds:room.rounds,first:room.first,
  state:null
 };
 if(room.status!=='playing'||room.players.length<2)return data;
 const p=room.players[seat],other=room.players[opp];
 data.state={version:6,mode:'network',expeditionCount:room.expeditionCount,rounds:room.rounds,round:room.round,
  // Une égalité doit donner le MÊME vainqueur aux deux appareils, même si le départ était aléatoire.
  oldest:(room.youngest===1?1:0)===seat?0:1,turn:room.turn===seat?0:1,phase:room.phase,
  deck:Array(room.deck.length).fill(null),players:[{name:p.name,hand:p.hand,exp:p.exp},{name:other.name,hand:Array(other.hand.length).fill(null),exp:other.exp}],
  discards:room.discards,blockedDiscard:-1,lastDeckDraw:room.lastDeckDraw,logs:room.logs,lastAiPlayed:null,
  turns:room.turns,ended:room.ended,awaitPass:false,scoreHistory:room.scoreHistory.map(s=>[s[seat],s[opp]]),final:room.final
 };
 return data;
}
function applyAction(room,seat,act){
 if(room.status!=='playing'||room.players.length<2)throw Error('En attente du deuxième joueur.');
 if(!act||typeof act!=='object')throw Error('Action inconnue.');
 if(act.type==='nextRound'){
  if(!room.ended||room.final)throw Error('Aucune manche suivante.');
  room.round++;
  const sums=[0,1].map(i=>room.scoreHistory.reduce((s,row)=>s+row[i],0));
  const leader=sums[0]===sums[1]?(room.first==='random'?crypto.randomInt(2):room.first):(sums[0]>sums[1]?0:1);
  shuffleDeal(room);room.turn=leader;
  addLog(room,`Manche ${room.round}/${room.rounds} : ${room.players[room.turn].name} commence.`);bump(room);return;
 }
 if(room.ended)throw Error('Manche terminée.');
 if(room.turn!==seat)throw Error('Ce n’est pas ton tour.');
 const player=room.players[seat];
 if(act.type==='draw'){
  if(room.phase!=='draw')throw Error('Tu dois poser ou défausser une carte.');
  let card;
  if(act.from==='deck'){
   if(!room.deck.length)throw Error('Pioche épuisée.');
   card=room.deck.pop();room.lastDeckDraw=room.deck.length===0;
   addLog(room,`${player.name} pioche dans le paquet.`);
  } else {
   const c=Number(act.from);
   if(!Number.isInteger(c)||!ACTIVE(room.expeditionCount).includes(c)||!room.discards[c].length)throw Error('Défausse vide ou inactive.');
   card=room.discards[c].pop();
   addLog(room,`${player.name} pioche dans la défausse ${COLORS[c]}.`);
  }
  player.hand.push(card);room.phase='play';bump(room);return;
 }
 if(act.type==='play'){
  if(room.phase!=='play')throw Error('Pioche d’abord une carte.');
  if(!['place','discard'].includes(act.action))throw Error('Destination inconnue.');
  if(typeof act.id!=='string')throw Error('Carte inconnue.');
  const ix=player.hand.findIndex(c=>c.id===act.id);
  if(ix<0)throw Error('Cette carte n’est pas dans ta main.');
  const card=player.hand[ix];
  if(act.action==='place'){
   const arr=player.exp[card.c],last=arr.filter(c=>!c.bet).at(-1);
   if(card.bet&&last)throw Error('Le Joker doit être joué avant les numéros.');
   if(!card.bet&&last&&card.v<=last.v)throw Error('Les numéros doivent être strictement croissants.');
  }
  player.hand.splice(ix,1);
  if(act.action==='place'){
   player.exp[card.c].push(card);
   addLog(room,`${player.name} pose ${cardName(card)}.`);
  }else{room.discards[card.c].push(card);addLog(room,`${player.name} défausse ${cardName(card)}.`)}
  if(room.lastDeckDraw){
   room.ended=true;room.phase='ended';room.final=room.round>=room.rounds;
   const scores=[score(room,0),score(room,1)];room.scoreHistory.push(scores);
   addLog(room,`Fin de la manche ${room.round} : ${scores[0]} / ${scores[1]} points.`);
  }else{room.turn=1-room.turn;room.turns++;room.phase='draw'}
  bump(room);return;
 }
 throw Error('Action non reconnue.');
}
function send(res,code,data){const json=JSON.stringify(data);res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'});res.end(json)}
function error(res,code,msg){return send(res,code,{ok:false,error:msg})}
function readBody(req){return new Promise((resolve,reject)=>{
 let buf='',size=0;req.on('data',chunk=>{size+=chunk.length;if(size>8192){reject(Error('Requête trop volumineuse'));req.destroy();return}buf+=chunk.toString('utf8')});req.on('end',()=>{try{resolve(JSON.parse(buf||'{}'))}catch(_){reject(Error('JSON invalide'))}});req.on('error',reject)
})}
function session(req,body){
 const code=String(body?.code||req.headers['x-room-code']||'').toUpperCase().trim();
 const tk=String(req.headers['x-player-token']||body?.token||'');
 const room=ROOMS.get(code);if(!room)throw Error('Salon introuvable.');
 const seat=room.players.findIndex(p=>p.token===tk);
 if(seat<0)throw Error('Accès refusé : jeton de joueur invalide.');
 room.players[seat].lastSeen=Date.now();return {room,seat};
}
function allowRequest(req){
 // Same-origin requests only. File:// is not an eligible client.
 const origin=req.headers.origin;
 if(!origin)return true;
 try{const u=new URL(origin);return u.host===req.headers.host}catch(_){return false}
}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  // Alias pratique si ce serveur est exécuté seul au lieu d'être monté dans le portail.
  if(url.pathname.startsWith('/api/lost-cities/'))url.pathname='/api/'+url.pathname.slice('/api/lost-cities/'.length);
  if(url.pathname==='/health'&&req.method==='GET')return send(res,200,{ok:true,rooms:ROOMS.size,service:'Lost Cities Duel Online'});
  if(url.pathname.startsWith('/api/')){
   if(!allowRequest(req))return error(res,403,'Origine non autorisée. Ouvre le jeu depuis le serveur.');
   if(req.method==='POST'&&url.pathname==='/api/create'){
    cleanupRooms();
    if(!permitLobbyRequest(req))return error(res,429,'Trop de tentatives. Réessaie dans quelques minutes.');
    const b=await readBody(req);
    if(ROOMS.size>=MAX_ROOMS)return error(res,429,'Trop de salons ouverts.');
    let code;do{code=randomCode()}while(ROOMS.has(code));
    const tk=token();const room={code,revision:1,status:'waiting',created:Date.now(),expeditionCount:b.expeditionCount===5?5:6,rounds:b.rounds===3?3:1,
      first:b.first==='random'?'random':b.first===1?1:0,
      // Le départ et le départage des égalités sont deux choix indépendants.
      youngest:b.youngest===1?1:0,players:[{name:safeName(b.name),token:tk,lastSeen:Date.now()}]};
    ROOMS.set(code,room);persist();return send(res,201,{ok:true,code,token:tk,seat:0,view:view(room,0)});
   }
   if(req.method==='POST'&&url.pathname==='/api/join'){
    if(!permitLobbyRequest(req))return error(res,429,'Trop de tentatives. Réessaie dans quelques minutes.');
    const b=await readBody(req),code=String(b.code||'').trim().toUpperCase();
    if(!validCode(code))return error(res,400,'Code de salon invalide.');
    const room=ROOMS.get(code);if(!room)return error(res,404,'Salon introuvable.');
    if(room.players.length!==1||room.status!=='waiting')return error(res,409,'Salon complet ou partie déjà commencée.');
    const tk=token();room.players.push({name:safeName(b.name),token:tk,lastSeen:Date.now()});begin(room);
    return send(res,200,{ok:true,code,token:tk,seat:1,view:view(room,1)});
   }
   if(req.method==='GET'&&url.pathname==='/api/state'){
    const {room,seat}=session(req,{code:req.headers['x-room-code']});
    const revision=Number(url.searchParams.get('revision'));
    // Returns a compact signal if state unchanged, but updates presence.
    if(revision===room.revision){return send(res,200,{ok:true,unchanged:true,connected:room.players.map(p=>Date.now()-p.lastSeen<12000)})}
    return send(res,200,{ok:true,view:view(room,seat)});
   }
   if(req.method==='POST'&&url.pathname==='/api/action'){
    const b=await readBody(req),{room,seat}=session(req,b);applyAction(room,seat,b);
    return send(res,200,{ok:true,view:view(room,seat)});
   }
   return error(res,404,'Route inconnue.');
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return error(res,405,'Méthode non autorisée.');
  const files={'/':'index.html','/index.html':'index.html'};
  const file=files[url.pathname];if(!file)return error(res,404,'Fichier introuvable.');
  const data=fs.readFileSync(path.join(__dirname,file));
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'});
  res.end(req.method==='HEAD'?undefined:data);
 }catch(e){console.error(e?.message||e);error(res,400,e.message||'Erreur du serveur.')}});
// Démarrage direct possible pour les tests autonomes, mais aucun port supplémentaire
// lors de require('./lost-cities-online/server') depuis le portail principal.
if(require.main===module)server.listen(PORT,HOST,()=>{console.log(`\nLost Cities Duel — en ligne : port ${PORT} (écoute ${HOST})`);console.log(`Local : http://localhost:${PORT}`);console.log('Render : utiliser l’URL HTTPS fournie dans le tableau de bord.\n')});
module.exports={server};
