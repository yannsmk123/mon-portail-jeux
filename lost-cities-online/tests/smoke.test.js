'use strict';
// Test d'intégration autonome : node tests/smoke.test.js, sans dépendances.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lost-cities-lan-test-'));
const dataFile=path.join(tmp,'parties.json');
let server;
function freePort(){return new Promise((resolve,reject)=>{let s=net.createServer();s.listen(0,'127.0.0.1',()=>{let p=s.address().port;s.close(()=>resolve(p))});s.on('error',reject)})}
function start(port){server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_FILE:dataFile},stdio:'ignore'})}
async function waitForServer(url){for(let i=0;i<60;i++){try{const r=await fetch(url+'/health');if(r.ok)return}catch(_){}await new Promise(r=>setTimeout(r,50))}throw new Error('Serveur inaccessible')}
async function call(url,route,body,tk,code){const headers={'Content-Type':'application/json'};if(tk)headers['x-player-token']=tk;if(code)headers['x-room-code']=code;const r=await fetch(url+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()}}
const check=(condition,label)=>{assert.ok(condition,label);console.log('✓',label)};
async function main(){
 const port=await freePort(),url='http://127.0.0.1:'+port;start(port);await waitForServer(url);
 let a=await call(url,'/api/create',{name:'Alice',expeditionCount:5,rounds:3,first:0});
 check(a.status===201&&a.code.length===6,'Salon privé créé');
 const denied=await fetch(url+'/data/parties.json');check(denied.status===404,'Fichier de sauvegarde privé inaccessible via HTTP');
 const alien=await fetch(url+'/api/create',{method:'POST',headers:{'Content-Type':'application/json','Origin':'http://evil.example'},body:JSON.stringify({name:'X'})});check(alien.status===403,'Origine externe rejetée');
 const code=a.code,tokA=a.token;
 let b=await call(url,'/api/join',{name:'Bob',code});const tokB=b.token;
 check(b.status===200&&b.view.status==='playing','Second joueur rejoint et démarre la manche');
 check(a.code===b.code&&b.view.state.players[0].hand.length===8,'Le joueur B reçoit huit cartes');
 a=await call(url,'/api/state',undefined,tokA,code);
 check(a.view.state.expeditionCount===5&&a.view.state.rounds===3,'5 expéditions et 3 manches');
 check(a.view.state.players[1].hand.every(x=>x===null),'Aucun contenu de la main de Bob révélé à Alice');
 check(b.view.state.players[1].hand.every(x=>x===null),'Aucun contenu de la main d’Alice révélé à Bob');
 check(a.view.state.deck.every(x=>x===null),'Pioche secrète');
 const before=a.view.state.players[0].hand.length;
 let x=await call(url,'/api/action',{code,type:'draw',from:'deck'},tokB);
 check(x.status===400,'Le joueur B ne peut pas piocher hors de son tour');
 x=await call(url,'/api/action',{code,type:'draw',from:'deck'},'invalide');
 check(x.status===400,'Jeton invalide rejeté');
 x=await call(url,'/api/action',{code,type:'draw',from:'deck'},tokA);
 check(x.status===200&&x.view.state.players[0].hand.length===before+1,'La pioche passe de 8 à 9 cartes');
 x=await call(url,'/api/action',{code,type:'play',id:'9-v10',action:'place'},tokA);
 check(x.status===400,'Une carte absente de la main ne peut pas être posée');
 const card=a.view.state.players[0].hand[0];
 x=await call(url,'/api/action',{code,type:'play',id:card.id,action:'place'},tokA);
 check(x.status===200&&x.view.state.turn===1,'Pose valide et passage au joueur B');
 const dup=await call(url,'/api/action',{code,type:'play',id:card.id,action:'place'},tokA);
 check(dup.status===400,'Impossible de rejouer le même coup');
 x=await call(url,'/api/action',{code,type:'draw',from:3},tokB);
 check(x.status===400,'La Jungle inactive est bloquée');
 x=await call(url,'/api/action',{code,type:'draw',from:'deck'},tokB);
 check(x.status===200,'Le deuxième joueur peut piocher');
 x=await call(url,'/api/action',{code,type:'play',id:x.view.state.players[0].hand[0].id,action:'discard'},tokB);
 check(x.status===200,'Défausse par le deuxième joueur');
 let second=await call(url,'/api/join',{name:'Eve',code});
 check(second.status===409,'Un troisième joueur ne peut pas rejoindre');
 check(fs.existsSync(dataFile),'Sauvegarde JSON créée sur le serveur');
 // Un redémarrage doit conserver la partie et les jetons.
 server.kill();await new Promise(resolve=>server.once('exit',resolve));start(port);await waitForServer(url);
 let restored=await call(url,'/api/state',undefined,tokB,code);
 check(restored.status===200&&restored.view.state.players[0].name==='Bob','Reconnexion après redémarrage de Node.js');
 // Terminer la pioche et la manche pour vérifier le score sans révéler les cartes du paquet.
 for(let i=0;i<42;i++){
  const player=i%2===0?tokA:tokB;
  let draw=await call(url,'/api/action',{code,type:'draw',from:'deck'},player);
  assert.equal(draw.status,200,JSON.stringify(draw));
  const c=draw.view.state.players[0].hand[0];
  let play=await call(url,'/api/action',{code,type:'play',id:c.id,action:'discard'},player);
  assert.equal(play.status,200,JSON.stringify(play));
 }
 const end=await call(url,'/api/state',undefined,tokA,code);
 check(end.view.state.ended===true&&end.view.state.scoreHistory.length===1,'Fin de manche et scores validés');
 x=await call(url,'/api/action',{code,type:'nextRound'},tokB);
 check(x.status===200&&x.view.state.round===2&&x.view.state.players[0].hand.length===8,'La manche suivante démarre sans perte des scores');
 const other=await call(url,'/api/create',{name:'Charles',expeditionCount:6,rounds:1,first:'random',youngest:1});
 check(other.status===201,'Salons multiples et six expéditions');
 let join=await call(url,'/api/join',{name:'Dana',code:other.code});
 check(join.view.state.expeditionCount===6&&join.view.state.deck.length===56,'6 expéditions : 56 cartes de pioche');
 check(join.view.state.oldest===0,'Le joueur 2 est le plus jeune, quelle que soit la personne qui commence');
 const charles=await call(url,'/api/state',undefined,other.token,other.code);
 check(charles.view.state.oldest===1,'Le départage est symétrique : seul le joueur 2 est désigné par les deux appareils');
 // Égalité au score final : chaque joueur défausse toutes ses cartes, sans lancer d'expédition.
 // Un départ aléatoire ne doit surtout pas donner deux vainqueurs différents.
 for(let i=0;i<56;i++){
  const current=await call(url,'/api/state',undefined,other.token,other.code);
  const seat=current.view.state.turn===0?0:1;
  const who=seat===0?other.token:join.token;
  const drawn=await call(url,'/api/action',{code:other.code,type:'draw',from:'deck'},who,other.code);
  assert.equal(drawn.status,200,'Pioche de la manche à égalité : '+i);
  const discarded=await call(url,'/api/action',{code:other.code,type:'play',action:'discard',id:drawn.view.state.players[0].hand[0].id},who,other.code);
  assert.equal(discarded.status,200,'Défausse de la manche à égalité : '+i);
 }
 const final1=await call(url,'/api/state',undefined,other.token,other.code);
 const final2=await call(url,'/api/state',undefined,join.token,other.code);
 check(final1.view.state.ended&&final2.view.state.ended,'Les deux joueurs voient la fin de la partie');
 check(final1.view.state.scoreHistory[0][0]===0&&final1.view.state.scoreHistory[0][1]===0,'Tous les scores sont égaux (0 / 0)');
 check(final1.view.state.oldest===1&&final2.view.state.oldest===0,'En cas d’égalité le joueur 2 est l’unique vainqueur');
 console.log('\nTous les tests ont réussi.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{if(server)server.kill();fs.rmSync(tmp,{recursive:true,force:true})});
