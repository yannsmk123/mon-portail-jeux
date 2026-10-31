'use strict';
// MARVEL FUSION LAN — serveur sans dépendance externe, Node.js >= 20.
const http=require('node:http');const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const PORT=Number(process.env.PORT||3000),HOST=process.env.HOST||'0.0.0.0';
const rooms=new Map(),roomWatchers=new Map(),SUITS=['red','blue','yellow','green'],S_NAMES={red:'Rubis',blue:'Cosmos',yellow:'Éclair',green:'Gamma'};
const random=n=>crypto.randomInt(n),token=()=>crypto.randomBytes(24).toString('hex');
function shuffle(a){for(let i=a.length-1;i>0;i--){let j=random(i+1);[a[i],a[j]]=[a[j],a[i]];}return a}
function deck(lokis){let a=[],id=0;for(let copy=0;copy<2;copy++)for(let suit of SUITS)for(let n=0;n<=9;n++)a.push({id:'c'+id++,n,suit,joker:false});for(let n=0;n<lokis;n++)a.push({id:'c'+id++,n:null,suit:null,joker:true});return shuffle(a)}
function publicCard(c){return {id:c.id,n:c.n,suit:c.suit,joker:c.joker,asN:c.asN,asSuit:c.asSuit}}
function newRoom(name){let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code));const r={code,players:[{name:name.slice(0,24),token:token(),online:false},null],phase:'lobby',version:1,updated:Date.now(),events:[]};rooms.set(code,r);return r}
function event(r,msg){r.events.unshift(msg);r.events.length=Math.min(25,r.events.length);r.version++;r.updated=Date.now();
 // Group changes per event loop tick: the request action completes before clients fetch.
 if(!r.notifyScheduled){r.notifyScheduled=true;setImmediate(()=>{r.notifyScheduled=false;const watchers=roomWatchers.get(r.code);if(watchers)for(const wake of [...watchers])wake();});}
}
function waitRoom(r,req,res,version){
 if(r.version!==version){send(res,200,view(r,r.players.findIndex(p=>p?.token===req.mfToken)));return;}
 let done=false;let timer;
 const watchers=roomWatchers.get(r.code)||new Set();roomWatchers.set(r.code,watchers);
 const finish=()=>{if(done)return;done=true;clearTimeout(timer);watchers.delete(finish);if(!watchers.size)roomWatchers.delete(r.code);
  res.off('close',onClose);if(!res.writableEnded&&!res.destroyed){const side=r.players.findIndex(p=>p?.token===req.mfToken);if(side>=0)send(res,200,view(r,side));else send(res,403,{error:'Accès refusé.'});}
 };
 const onClose=()=>{if(done)return;done=true;clearTimeout(timer);watchers.delete(finish);if(!watchers.size)roomWatchers.delete(r.code)};
 watchers.add(finish);timer=setTimeout(finish,18000);res.on('close',onClose);
}

function start(r,opts){const lokis=[2,4,6].includes(opts.lokis)?opts.lokis:4,first=opts.first==='random'?random(2):opts.first===1?1:0;const g={hands:[[],[]],melds:[],deck:deck(lokis),discard:[],scores:[0,0],current:first,drawn:false,turn:1,shields:[false,false],winner:null,forfeitedBy:null,nextId:1,pending:null,needsDiscard:false,lokis,actions:[],actionSeq:0};for(let i=0;i<2;i++)for(let k=0;k<8;k++)g.hands[i].push(g.deck.pop());r.game=g;r.phase='playing';event(r,`Partie commencée. ${r.players[first].name} joue en premier.`)}
function action(g,kind,info={}){g.actions.push({seq:++g.actionSeq,kind,...info});if(g.actions.length>35)g.actions.shift()}
function view(r,side){const g=r.game;return {code:r.code,phase:r.phase,me:side,version:r.version,players:r.players.map((p,i)=>p?{name:p.name,connected:!!p.online}:null),options:side===0?{lokis:g?.lokis||4}:null,events:r.events,game:g?{hands:[side===0?g.hands[0].map(publicCard):g.hands[0].length,side===1?g.hands[1].map(publicCard):g.hands[1].length],melds:g.melds.map(m=>({...m,cards:m.cards.map(publicCard)})),deckCount:g.deck.length,discardCount:g.discard.length,discardTop:g.discard.at(-1)||null,scores:g.scores,shields:[...g.shields],current:g.current,drawn:g.drawn,turn:g.turn,winner:g.winner,forfeitedBy:g.forfeitedBy??null,pending:g.pending?{by:g.pending.by,number:g.pending.number,kind:g.pending.kind,info:g.pending.info||'',stage:g.pending.stage,remaining:g.pending.remaining??0,chosen:g.pending.by===side?[...(g.pending.chosen||[])]:[]}:null,needsDiscard:g.needsDiscard,actions:g.actions,powerChoices:g.pending&&g.pending.by===side?powerOptions(g,side):[],revealedHand:g.pending&&g.pending.by===side&&['enemy-discard','steal','observe'].includes(g.pending.stage)?g.hands[1-side].map(publicCard):null}:null}}
function oldStable(next,old){return !old||old.every(a=>{let x=next.find(b=>b.id===a.id);return x&&x.asN===a.asN&&x.asSuit===a.asSuit})}
function meldCandidates(cards,old=null){const result=[],real=cards.filter(x=>!x.joker),js=cards.filter(x=>x.joker),len=cards.length;if(real.length<2)return result;
if((len===3||len===4)&&real.every(x=>x.n===real[0].n)&&new Set(real.map(x=>x.suit)).size===real.length&&js.length<=1){for(let suit of SUITS.filter(s=>!real.some(c=>c.suit===s))){const cc=cards.map(c=>c.joker?{...c,asN:real[0].n,asSuit:suit}:{...c,asN:c.n,asSuit:c.suit});if(oldStable(cc,old))result.push({kind:'set',cards:cc})}if(!js.length){const cc=cards.map(c=>({...c,asN:c.n,asSuit:c.suit}));if(oldStable(cc,old))result.push({kind:'set',cards:cc})}}
if(len>=3&&len<=10&&new Set(real.map(x=>x.suit)).size===1&&new Set(real.map(x=>x.n)).size===real.length){const suit=real[0].suit,values=new Set(real.map(c=>c.n));for(let start=0;start+len<=10;start++){const range=Array.from({length:len},(_,i)=>start+i);if(!real.every(c=>range.includes(c.n)))continue;let missing=range.filter(x=>!values.has(x));if(missing.length!==js.length||missing.some((n,i)=>i>0&&n-missing[i-1]===1))continue;const cc=cards.map(c=>c.joker?{...c,asN:missing[js.findIndex(j=>j.id===c.id)],asSuit:suit}:{...c,asN:c.n,asSuit:c.suit}).sort((a,b)=>a.asN-b.asN);if(oldStable(cc,old))result.push({kind:'run',cards:cc})}}return result}
function complete(m){return m.kind==='set'&&m.cards.length===4&&m.cards.every(c=>!c.joker)||m.kind==='run'&&m.cards.length===10&&m.cards.every(c=>!c.joker)&&m.cards[0].asN===0&&m.cards.at(-1).asN===9}
function drawInto(g,p,n){for(let k=0;k<n;k++){if(!g.deck.length&&g.discard.length>1){let keep=g.discard.pop();g.deck=shuffle(g.discard.splice(0));g.discard=[keep]}if(!g.deck.length)break;g.hands[p].push(g.deck.pop())}}
// Même règle que le solo : une main vide reçoit automatiquement 8 cartes.
// L'action publique transmet uniquement un nombre, jamais les cartes privées.
function refillEmptyHand(r,side,reason=''){const g=r.game;if(g.hands[side].length)return false;
 drawInto(g,side,8);const count=g.hands[side].length;
 action(g,'refill',{by:side,count});
 event(r,count?`${r.players[side].name} reçoit une nouvelle main de ${count} carte${count>1?'s':''}${reason?' ('+reason+')':''}.`:`${r.players[side].name} a la main vide : plus de cartes disponibles dans la pioche ou la défausse.`);
 return count>0;
}
function finishTurn(r){let g=r.game;refillEmptyHand(r,g.current,'après défausse');refillEmptyHand(r,1-g.current);if(g.scores.some(x=>x>=30)){g.winner=g.scores[0]>=30?0:1;r.phase='finished';action(g,'outcome',{winner:g.winner});event(r,`${r.players[g.winner].name} gagne !`);return}g.current=1-g.current;g.drawn=false;g.needsDiscard=false;g.turn++;g.shields[g.current]=false;event(r,`Tour de ${r.players[g.current].name}.`)}
// La résolution suit le solo : choix interactifs des cartes adverses,
// pioche de Groot, Magneto et récupération Punisher. Le serveur valide chaque choix.
function losePoints(g,player,n){if(g.shields[player])return 0;const lost=Math.min(n,g.scores[player]);g.scores[player]-=lost;return lost}
function powerOptions(g,side){const p=g.pending;if(!p||p.by!==side)return [];const op=1-side;
 switch(p.stage){case 'enemy-discard':case 'steal':case 'observe':return g.hands[op].map(publicCard);
 case 'groot':return g.deck.slice(-3).reverse().map(publicCard);
 case 'punisher':return g.discard.slice(-3).reverse().map(publicCard);
 case 'magneto':return g.hands[side].map(publicCard);
 default:return []}}
function endPower(r){const g=r.game,p=g.pending;if(!p)return;refillEmptyHand(r,0);refillEmptyHand(r,1);event(r,`${r.players[p.by].name} a terminé ${p.name||'son pouvoir'}.`);g.pending=null;if(g.scores.some(x=>x>=30)){g.winner=g.scores[0]>=30?0:1;r.phase='finished';action(g,'outcome',{winner:g.winner});event(r,`${r.players[g.winner].name} gagne !`)}}
function activatePower(r){const g=r.game,p=g.pending;if(!p||p.stage!=='activate')throw Error('Pouvoir indisponible.');const me=p.by,op=1-me,n=p.number;action(g,'power',{by:me,number:n});event(r,`${r.players[me].name} active le pouvoir de ${p.name}.`);
 switch(n){
 case 0:losePoints(g,op,5);break;
 case 1:g.scores[me]+=5;break;
 case 2:drawInto(g,me,2);p.stage='observe';return;
 case 3:p.remaining=Math.min(2,g.hands[op].length);if(p.remaining){p.stage='enemy-discard';return}break;
 case 4:g.scores[me]+=3;g.shields[me]=true;break;
 case 5:case 10:drawInto(g,me,2);p.remaining=Math.min(1,g.hands[op].length);if(p.remaining){p.stage='enemy-discard';return}break;
 case 6:if(g.hands[op].length){p.stage='steal';return}break;
 case 7:if(!g.deck.length&&g.discard.length>1){const top=g.discard.pop();g.deck=shuffle(g.discard.splice(0));g.discard=[top]}if(g.deck.length){p.stage='groot';return}break;
 case 8:p.stage='magneto';p.chosen=[];return;
 case 9:losePoints(g,op,3);p.remaining=Math.min(1,g.hands[op].length);if(p.remaining){p.stage='enemy-discard';return}break;
 case 11:g.scores[me]+=losePoints(g,op,2);break;
 case 12:drawInto(g,me,2);g.scores[me]++;break;
 case 13:if(g.discard.length){p.stage='punisher';return}break;
 }endPower(r)
}
function resolvePowerChoice(r,side,body){const g=r.game,p=g.pending;if(!p||p.by!==side)throw Error('Aucun pouvoir à résoudre.');if(body.type==='power'&&p.stage==='activate'){activatePower(r);return}if(body.type!=='power-choice')throw Error('Termine le pouvoir en cours.');const opt=powerOptions(g,side);const by=p.by,op=1-by;
 if(p.stage==='observe'){if(body.choice!=='continue')throw Error('Confirme pour continuer.');endPower(r);return}
 if(p.stage==='magneto'){
   if(body.choice==='toggle'){const id=String(body.card||'');if(!opt.some(c=>c.id===id))throw Error('Carte introuvable.');p.chosen=p.chosen||[];if(p.chosen.includes(id))p.chosen=p.chosen.filter(x=>x!==id);else{if(p.chosen.length>=Math.min(3,Math.max(0,g.hands[by].length-1)))throw Error('Maximum 3 cartes, garde au moins une carte.');p.chosen.push(id)}event(r,'Choix Magneto modifié.');return}
   if(body.choice!=='confirm')throw Error('Confirme le choix de Magneto.');for(const id of p.chosen||[]){const i=g.hands[by].findIndex(c=>c.id===id);if(i>=0){const c=g.hands[by].splice(i,1)[0];g.discard.push(c);action(g,'discard',{by,card:publicCard(c),source:'power'})}}drawInto(g,by,3);endPower(r);return;
 }
 const card=opt.find(c=>c.id===body.card);if(!card)throw Error('Choisis une carte proposée par le pouvoir.');
 if(p.stage==='enemy-discard'){const i=g.hands[op].findIndex(c=>c.id===card.id);const c=g.hands[op].splice(i,1)[0];g.discard.push(c);action(g,'discard',{by:op,card:publicCard(c),source:'power'});refillEmptyHand(r,op,'après défausse forcée');p.remaining--;if(p.remaining>0&&g.hands[op].length){event(r,'Choisis la prochaine carte adverse.');return}}
 else if(p.stage==='steal'){const i=g.hands[op].findIndex(c=>c.id===card.id);g.hands[by].push(g.hands[op].splice(i,1)[0]);action(g,'steal',{by,card:publicCard(card)});refillEmptyHand(r,op,'après vol');}
 else if(p.stage==='groot'){const i=g.deck.findIndex(c=>c.id===card.id);if(i<0)throw Error('Cette carte n’est plus dans la pioche.');g.hands[by].push(g.deck.splice(i,1)[0]);}
 else if(p.stage==='punisher'){const i=g.discard.findIndex(c=>c.id===card.id);if(i<0)throw Error('Cette carte n’est plus dans la défausse.');g.hands[by].push(g.discard.splice(i,1)[0]);}
 else throw Error('Action de pouvoir incorrecte.');endPower(r)
}
function previewMeld(r,side,body){const g=r.game;
 if(!g||r.phase!=='playing'||g.current!==side||!g.drawn||g.pending)throw Error('Tu ne peux pas poser de cartes maintenant.');
 if(!Array.isArray(body.cards)||body.cards.length<1||body.cards.length>10||new Set(body.cards).size!==body.cards.length)throw Error('Sélection invalide.');
 const hand=g.hands[side],cards=body.cards.map(id=>hand.find(c=>c.id===id));
 if(cards.some(c=>!c))throw Error('Carte absente de la main.');
 if(hand.length<=cards.length)throw Error('Garde une carte pour la défausse de fin de tour.');
 if(!body.meld&&cards.length<3)throw Error('Pose impossible : il faut au moins 3 cartes formant une suite ou un brelan.');
 const target=body.meld?g.melds.find(m=>m.id===body.meld):null;
 if(body.meld&&!target)throw Error('Combinaison introuvable.');
 if(target&&target.kind==='set'&&target.cards.length+cards.length!==4)throw Error('Un brelan reçoit une seule carte.');
 let choices=meldCandidates(target?[...target.cards,...cards]:cards,target?.cards);
 if(target)choices=choices.filter(c=>c.kind===target.kind&&c.cards.length>target.cards.length);
 if(!choices.length)throw Error(target?'Cette carte ne peut pas être ajoutée à cette combinaison.':'Ces cartes ne forment ni une suite ni un brelan valides.');
 return choices.map((choice,index)=>({index,kind:choice.kind,length:choice.cards.length,
  lokis:choice.cards.filter(c=>c.joker).map(c=>({id:c.id,asN:c.asN,asSuit:c.asSuit}))}));
}
function move(r,side,body){let g=r.game;if(!g||r.phase!=='playing')throw Error('La partie n’est pas en cours.');if(g.current!==side)throw Error('Ce n’est pas ton tour.');if(g.pending){resolvePowerChoice(r,side,body);return}
const hand=g.hands[side],other=1-side;
if(body.type==='draw'){if(g.drawn)throw Error('Tu as déjà pioché.');if(body.source==='discard'){if(!g.discard.length)throw Error('Défausse vide.');hand.push(g.discard.pop())}else if(body.source==='deck'){let before=hand.length;drawInto(g,side,1);if(hand.length===before)throw Error('Pioche vide.')}else throw Error('Source inconnue.');g.drawn=true;action(g,'draw',{by:side,source:body.source});event(r,`${r.players[side].name} pioche une carte.`);return}
if(!g.drawn)throw Error('Pioche une carte avant de jouer.');if(!Array.isArray(body.cards)||body.cards.length<1||body.cards.length>10||new Set(body.cards).size!==body.cards.length)throw Error('Sélection invalide.');const cards=body.cards.map(id=>hand.find(c=>c.id===id));if(cards.some(c=>!c))throw Error('Une carte choisie n’est pas dans ta main.');
if(body.type==='discard'){if(cards.length!==1)throw Error('Une seule carte doit être défaussée.');hand.splice(hand.findIndex(c=>c.id===cards[0].id),1);g.discard.push(cards[0]);action(g,'discard',{by:side,card:publicCard(cards[0]),source:'hand'});event(r,`${r.players[side].name} défausse une carte.`);finishTurn(r);return}
if(body.type==='swap'){if(cards.length!==1||cards[0].joker)throw Error('Choisis une carte réelle.');const m=g.melds.find(m=>m.id===body.meld);if(!m)throw Error('Combinaison introuvable.');let j=m.cards.find(c=>c.joker&&c.asN===cards[0].n&&c.asSuit===cards[0].suit);if(!j)throw Error('Aucun Loki correspondant.');m.cards[m.cards.findIndex(c=>c.id===j.id)]={...cards[0],asN:cards[0].n,asSuit:cards[0].suit};hand.splice(hand.findIndex(c=>c.id===cards[0].id),1,{id:j.id,n:null,suit:null,joker:true});if(m.owner===side)g.scores[side]++;action(g,'swap',{by:side,card:publicCard(cards[0]),meldId:m.id});if(complete(m)){if(m.kind==='run')g.scores[side]+=3;
 const square=m.kind==='set',hero=cards[0].n,all=[...m.cards.filter(c=>c.id!==cards[0].id),...m.cards.filter(c=>c.id===cards[0].id)];
 g.discard.push(...all);g.melds=g.melds.filter(x=>x!==m);action(g,'clear-meld',{by:side,cards:all.map(publicCard),meldId:m.id});event(r,'Combinaison terminée → défausse.');
 if(square){g.pending={by:side,kind:'square',number:hero,stage:'activate',name:['Hulk','Iron Man','Dr Strange','Black Panther','Captain America','Thor','Spider-Man','Groot','Magneto','Hela','Venom','Star-Lord','Rocket Raccoon','Punisher'][hero],info:'Activer le pouvoir du carré.'};action(g,'power-ready',{by:side,number:hero,source:'swap'});event(r,`Pouvoir ${hero} prêt à être activé.`);}
 }event(r,`${r.players[side].name} remplace un Loki.`);if(!g.pending&&g.scores.some(x=>x>=30)){g.winner=g.scores[0]>=30?0:1;r.phase='finished';action(g,'outcome',{winner:g.winner});event(r,`${r.players[g.winner].name} gagne !`)}return}
if(body.type!=='meld')throw Error('Action inconnue.');if(hand.length<=cards.length)throw Error('Garde une carte pour la défausse de fin de tour.');if(!body.meld&&cards.length<3)throw Error('Pose impossible : il faut au moins 3 cartes formant une suite ou un brelan.');let target=body.meld?g.melds.find(m=>m.id===body.meld):null;if(body.meld&&!target)throw Error('Combinaison introuvable.');if(target&&target.kind==='set'&&target.cards.length+cards.length!==4)throw Error('Un brelan reçoit une seule carte.');let choices=meldCandidates(target?[...target.cards,...cards]:cards,target?.cards);if(target)choices=choices.filter(c=>c.kind===target.kind&&c.cards.length>target.cards.length);if(!choices.length)throw Error(target?'Cette carte ne peut pas être ajoutée à cette combinaison.':'Ces cartes ne forment ni une suite ni un brelan valides.');let variant=body.variant==null?0:Number(body.variant);if(!Number.isSafeInteger(variant)||variant<0||variant>=choices.length)throw Error('Variante de Loki invalide.');let c=choices[variant],oldJ=target?.cards.some(x=>x.joker),newJ=c.cards.some(x=>x.joker),isSquare=c.kind==='set'&&c.cards.length===4&&!newJ,bonus=c.kind==='run'&&complete(c)?3:0;
let base=0;if(!target){base=isSquare?7:Math.max(0,c.cards.length-(newJ?1:0))}else if(target.owner===side){base=c.kind==='run'?Math.max(0,cards.length-(newJ&&!oldJ?1:0)):cards.filter(x=>!x.joker).length}g.scores[side]+=base+bonus;
for(const card of cards)hand.splice(hand.findIndex(x=>x.id===card.id),1);if(target){target.cards=c.cards}else{target={id:'m'+g.nextId++,owner:side,kind:c.kind,cards:c.cards};g.melds.push(target)}action(g,'pose',{by:side,cards:cards.map(card=>publicCard(c.cards.find(x=>x.id===card.id)||card)),result:c.cards.map(publicCard),meldId:target.id,meldKind:c.kind,completed:complete(target),power:isSquare?c.cards.find(x=>!x.joker)?.n:null});event(r,`${r.players[side].name} pose ${cards.length} carte(s) : ${c.kind==='run'?'suite':'brelan'} (${base+bonus>=0?'+':''}${base+bonus} pt).`);
if(complete(target)){g.discard.push(...target.cards);g.melds=g.melds.filter(x=>x!==target);action(g,'clear-meld',{by:side,cards:target.cards.map(publicCard),meldId:target.id});event(r,'Combinaison terminée → défausse.');if(isSquare){const finishing=c.cards.filter(x=>cards.some(y=>y.id===x.id)).at(-1)||c.cards.at(-1);g.pending={by:side,kind:'square',number:finishing.n,stage:'activate',name:['Hulk','Iron Man','Dr Strange','Black Panther','Captain America','Thor','Spider-Man','Groot','Magneto','Hela','Venom','Star-Lord','Rocket Raccoon','Punisher'][finishing.n],info:'Activer le pouvoir du carré.'};event(r,`Pouvoir ${finishing.n} prêt à être activé.`)}}if(!g.pending&&g.scores.some(x=>x>=30)){g.winner=g.scores[0]>=30?0:1;r.phase='finished';action(g,'outcome',{winner:g.winner});event(r,`${r.players[g.winner].name} gagne !`)}}
const allowOrigin=()=>({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
function send(res,status,data){let body=JSON.stringify(data);res.writeHead(status,{...allowOrigin(),'Content-Type':'application/json; charset=utf-8'});res.end(body)}
function fail(res,e){send(res,400,{error:e.message||'Action refusée.'})}
function readBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',d=>{s+=d;if(s.length>16000){reject(Error('Requête trop grande.'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'))}catch{reject(Error('JSON invalide.'))}});req.on('error',reject)})}
function auth(b){const r=rooms.get(String(b.code||'').toUpperCase());if(!r)throw Error('Salle inconnue.');const side=r.players.findIndex(p=>p&&p.token===b.token);if(side<0)throw Error('Accès refusé.');r.players[side].online=true;return {r,side}}
function browserBase(req){
  // Utilise exactement l'adresse que le navigateur a employée pour le diagnostic.
  const requested=String(req.headers.host||`localhost:${PORT}`);
  const host=/^[a-zA-Z0-9.\[\]:-]+$/.test(requested)?requested:`localhost:${PORT}`;
  return `http://${host}`;
}
function diagnosticPage(req){
  const base=browserBase(req);
  const u=new URL(base);
  const safeHost=u.host.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MARVEL FUSION — Diagnostic réseau</title><style>body{font:16px system-ui,Arial,sans-serif;max-width:620px;margin:8vh auto;padding:22px;background:#081321;color:#f3f7ff}main{padding:25px;background:#15314c;border:1px solid #456785;border-radius:18px}a{color:#9fe2ff;overflow-wrap:anywhere}code{background:#071a2c;padding:4px;border-radius:5px}.ok{color:#7ef5cb}button{padding:12px 18px;border-radius:9px;background:#c73659;border:0;color:#fff;font:inherit;cursor:pointer}</style></head><body><main><h1>MARVEL FUSION · Diagnostic PC 2</h1><p class="ok">✓ Cette page arrive bien depuis le serveur Node.js.</p><p>Adresse utilisée : <code>${safeHost}</code></p><p><a href="/">🎮 OUVRIR LE JEU — ${base}/</a></p><p><a href="/index.html">Autre accès : /index.html</a></p><p><button onclick="location.href='/'">Lancer MARVEL FUSION</button></p><p id="test">Vérification du serveur…</p><script>fetch('/health',{cache:'no-store'}).then(r=>r.json()).then(j=>{document.getElementById('test').textContent=j.ok?'✓ Serveur disponible':'Réponse inattendue'}).catch(e=>{document.getElementById('test').textContent='Serveur inaccessible : '+e.message});<\/script></main></body></html>`;
}
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');if(req.method==='GET'&&['/enhancements.css','/enhancements.js'].includes(u.pathname)){const file=path.join(__dirname,u.pathname.slice(1));res.writeHead(200,{'Content-Type':u.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(fs.readFileSync(file));return;}if(req.method==='GET'&&(u.pathname==='/solo'||u.pathname==='/solo.html')){const bytes=fs.readFileSync(path.join(__dirname,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(bytes);return;}if(req.method==='GET'&&(u.pathname==='/'||u.pathname==='/index.html'||u.pathname==='/jeu'||u.pathname==='/play')){const bytes=fs.readFileSync(path.join(__dirname,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(bytes);return}if(req.method==='GET'&&u.pathname==='/diagnostic'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(diagnosticPage(req));return;
}
if(u.pathname==='/health'){
  send(res,200,{ok:true,rooms:rooms.size,jeu:browserBase(req)+'/',diagnostic:browserBase(req)+'/diagnostic'});return;
}
if(u.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}if(u.pathname.startsWith('/api/')&&req.method==='POST'){try{let b=await readBody(req);if(u.pathname==='/api/create'){const r=newRoom(String(b.name||'Joueur 1').trim()||'Joueur 1');send(res,200,{code:r.code,token:r.players[0].token,side:0});return}if(u.pathname==='/api/join'){let r=rooms.get(String(b.code||'').trim().toUpperCase());if(!r||r.players[1]||r.phase!=='lobby')throw Error('Salle inexistante ou déjà pleine.');r.players[1]={name:String(b.name||'Joueur 2').trim().slice(0,24)||'Joueur 2',token:token(),online:true};event(r,`${r.players[1].name} rejoint la salle.`);send(res,200,{code:r.code,token:r.players[1].token,side:1});return}const {r,side}=auth(b);if(u.pathname==='/api/wait'){req.mfToken=b.token;waitRoom(r,req,res,Number(b.version));return}if(u.pathname==='/api/state'){send(res,200,view(r,side));return}if(u.pathname==='/api/start'){if(side!==0||r.phase!=='lobby'||!r.players[1])throw Error('Seul l’hôte peut démarrer avec deux joueurs.');start(r,{lokis:Number(b.lokis),first:b.first});send(res,200,view(r,side));return}if(u.pathname==='/api/options'){send(res,200,{options:previewMeld(r,side,b)});return}if(u.pathname==='/api/forfeit'){
  if(r.phase!=='playing'||!r.game)throw Error('La partie n’est plus en cours.');
  r.game.forfeitedBy=side;
  r.game.winner=1-side;
  r.game.pending=null;
  r.phase='finished';
  action(r.game,'outcome',{winner:r.game.winner,reason:'forfeit',by:side});
  event(r,`${r.players[side].name} abandonne la partie. ${r.players[1-side].name} gagne par abandon.`);
  send(res,200,view(r,side));return;
 }
 if(u.pathname==='/api/leave'){
  if(r.phase!=='lobby')throw Error('La salle a déjà commencé.');
  if(side===0){rooms.delete(r.code)}
  else {r.players[1]=null;event(r,'Le deuxième joueur a quitté la salle.');}
  send(res,200,{ok:true});return;
 }
 if(u.pathname==='/api/move'){move(r,side,b);send(res,200,view(r,side));return}throw Error('Route inconnue.')}catch(e){fail(res,e)}return}res.writeHead(404);res.end('404')});
if(require.main===module)server.listen(PORT,HOST,()=>{
  console.log('\n=== MARVEL FUSION · RESEAU LOCAL ===');
  console.log(`PC hôte : http://localhost:${PORT}/`);
  console.log('PC 2 — recopiez une adresse ci-dessous (HTTP, pas HTTPS) :');
  const addresses=new Set();
  for(const [name,ifs] of Object.entries(os.networkInterfaces())){
    for(const i of ifs||[]){if(i.family==='IPv4'&&!i.internal){addresses.add(i.address);console.log(`  ${name} : http://${i.address}:${PORT}/diagnostic`);}}
  }
  if(!addresses.size)console.log('  Aucune adresse IPv4 privée trouvée : utilisez ipconfig.');
  console.log('Si /health marche sur PC 2, visitez /diagnostic sur EXACTEMENT la même adresse.\n');
});
module.exports={server,rooms,deck,meldCandidates,previewMeld,move,start,view};
