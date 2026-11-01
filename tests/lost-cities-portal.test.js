'use strict';
// Vérifie la cohabitation Marvel/Lost Cities sur UN port, sans tests sur Render public.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.join(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lost-portal-integration-'));
const saveFile=path.join(temp,'lost-parties.json');
let server;
function check(cond,message){assert.ok(cond,message)}
async function req(base,endpoint,data,token,code){
 const headers={'Content-Type':'application/json'};
 if(token)headers['x-player-token']=token;
 if(code)headers['x-room-code']=code;
 const r=await fetch(base+endpoint,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data)});
 return {status:r.status,...await r.json()};
}
async function waitFor(url){for(let t=0;t<60;t++){try{const r=await fetch(url+'/health');if(r.ok)return}catch(_){}await new Promise(ok=>setTimeout(ok,75))}throw Error('Portail serveur inaccessible')}
// Démarrage du portail sur un port libre dans un processus isolé.
async function unusedPort(){const net=require('node:net');return new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))});s.on('error',reject)})}
function start(port){server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),SITE_ACCESS_CODE:'',LOST_CITIES_DATA_FILE:saveFile},stdio:['ignore','pipe','pipe']});return server}
async function stop(){if(!server||server.exitCode!==null)return;server.kill();await new Promise(done=>server.once('exit',done))}
test('Portail actuel + Marvel + Lost Cities en ligne sur un seul service HTTP',async()=>{
 const port=await unusedPort(),base='http://127.0.0.1:'+port;
 start(port);
 try{
  await waitFor(base);
  const health=await req(base,'/health');check(health.portal&&health.marvelOnline,'Portail et Marvel conservés');
  const catalog=await req(base,'/api/portal/games');
  const ids=catalog.games.map(x=>x.id);
  check(ids.includes('marvel-fusion')&&ids.includes('lost-cities-duel'),'Les deux jeux sont visibles dans le catalogue');
  const pub=await fetch(base+'/');check(pub.status===200&&(await pub.text()).includes('MY GAME ARCADE'),'Accueil intact');
  const marvel=await fetch(base+'/games/marvel-fusion/');check(marvel.status===200&&(await marvel.text()).includes('MARVEL FUSION'),'Marvel reste accessible');
  const lost=await fetch(base+'/games/lost-cities-duel/');const html=await lost.text();
  check(lost.status===200&&html.includes('Solo contre IA')&&html.includes('2 joueurs en ligne'),'Lost Cities solo et bouton réseau accessibles');
  check(html.includes("fetch('/api/lost-cities'+route.slice(4),opt)"),'Le jeu utilise le préfixe API dédié');
  // Le JSON est présent sur le portail Render, relu sans cache et complet.
  for(let visit=0;visit<2;visit++){
   const mediaResponse=await fetch(base+'/games/lost-cities-duel/media-pack.json?check='+visit,{cache:'no-store'});
   check(mediaResponse.status===200&&mediaResponse.headers.get('cache-control')==='no-store','Pack Lost Cities publié sans cache');
   const media=await mediaResponse.json();
   check(media.format==='lost-cities-media-pack-v1'&&Object.keys(media.images.cards).length===72&&media.images.scenes.length===6,'Les 72 cartes et les 6 images sont dans le JSON');
   check(Object.keys(media.sfx).length===9&&media.music&&Array.isArray(media.music.tracks),'SFX et musiques prévus dans le JSON');
  }
  const leak=await fetch(base+'/games/lost-cities-duel/server.js');check(leak.status===404,'Le code du serveur Lost Cities n’est pas public');
  const dataUrl=await fetch(base+'/games/lost-cities-duel/data/parties.json');check(dataUrl.status===404,'Les secrets des parties ne sont pas publics');
  const alien=await fetch(base+'/api/lost-cities/create',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.example'},body:'{}'});
  check(alien.status===403,'Requêtes intersites refusées');
  const a=await req(base,'/api/lost-cities/create',{name:'Alice',expeditionCount:6,rounds:3,first:0});
  check(a.status===201&&/^[A-F0-9]{6}$/.test(a.code),'Salle créée avec invitation');
  const b=await req(base,'/api/lost-cities/join',{name:'Bob',code:a.code});
  check(b.status===200&&b.seat===1&&b.view.status==='playing','Second PC rejoint la salle');
  let alice=await req(base,'/api/lost-cities/state?revision=0',undefined,a.token,a.code);
  check(alice.view.state.players[1].hand.every(x=>x===null),'La main de Bob est secrète pour Alice');
  check(b.view.state.players[1].hand.every(x=>x===null),'La main d’Alice est secrète pour Bob');
  check(alice.view.state.deck.every(x=>x===null),'La pioche reste cachée');
  const unauthorized=await req(base,'/api/lost-cities/action',{code:a.code,type:'draw',from:'deck'},'faux-jeton');
  check(unauthorized.status===400,'Jeton invalide refusé');
  const premature=await req(base,'/api/lost-cities/action',{code:a.code,type:'draw',from:'deck'},b.token,a.code);
  check(premature.status===400,'Le joueur qui n’a pas le tour est bloqué');
  let draw=await req(base,'/api/lost-cities/action',{code:a.code,type:'draw',from:'deck'},a.token,a.code);
  check(draw.status===200&&draw.view.state.players[0].hand.length===9,'Pioche de 8 à 9 cartes');
  let played=await req(base,'/api/lost-cities/action',{code:a.code,type:'play',action:'discard',id:draw.view.state.players[0].hand[0].id},a.token,a.code);
  check(played.status===200&&played.view.state.turn===1,'Défausse et changement de joueur');
  let bob=await req(base,'/api/lost-cities/state?revision=0',undefined,b.token,a.code);
  check(bob.status===200&&bob.view.state.players[0].name==='Bob','Synchronisation du deuxième navigateur');
  const third=await req(base,'/api/lost-cities/join',{name:'Charlie',code:a.code});
  check(third.status===409,'Un troisième joueur ne peut pas voler une place');
  check(fs.existsSync(saveFile),'Sauvegarde de partie écrite dans un fichier dédié');
  // Jeu solo : non détourné vers le serveur. Le HTML conserve aussi les modes local et IA.
  check(html.includes('Deux joueurs (même écran)')&&html.includes('Solo contre IA'),'Solo et jeu local restent présents');
  // Vérifie la préservation des anciennes routes de jeu Marvel.
  const marvelApi=await req(base,'/api/create',{name:'Marvel intact'});check(marvelApi.status===200&&marvelApi.side===0&&!!marvelApi.token,'API Marvel non absorbée par Lost Cities');
  // Reconnexion après redémarrage d'un seul serveur.
  await stop();start(port);await waitFor(base);
  bob=await req(base,'/api/lost-cities/state?revision=0',undefined,b.token,a.code);
  check(bob.status===200&&bob.view.state.players[0].name==='Bob','Reconnexion après redémarrage si le stockage subsiste');
  // Jouer la première manche jusqu'au bout : 56 cartes dans la pioche à 6 expéditions.
  // Une pioche ayant déjà eu lieu, il reste 55 cycles pioche + défausse à alterner.
  let active=1;
  for(let n=0;n<55;n++){
   const tk=active===0?a.token:b.token;
   const d=await req(base,'/api/lost-cities/action',{code:a.code,type:'draw',from:'deck'},tk,a.code);
   assert.equal(d.status,200,'Pioche tour '+n+' : '+JSON.stringify(d.error));
   const card=d.view.state.players[0].hand[0];
   const play=await req(base,'/api/lost-cities/action',{code:a.code,type:'play',action:'discard',id:card.id},tk,a.code);
   assert.equal(play.status,200,'Pose tour '+n+' : '+JSON.stringify(play.error));
   active=1-active;
  }
  const ended=await req(base,'/api/lost-cities/state?revision=0',undefined,a.token,a.code);
  check(ended.view.state.ended===true&&ended.view.state.scoreHistory.length===1,'Manche complète et scores synchronisés');
  const following=await req(base,'/api/lost-cities/action',{code:a.code,type:'nextRound'},b.token,a.code);
  check(following.status===200&&following.view.state.round===2&&following.view.state.deck.length===56,'Manche 2 créée sans perte des manches précédentes');
  // Le serveur redémarré n'a pas perdu Marvel ou le catalogue.
  const after=await req(base,'/api/portal/games');check(after.games.length>=2,'Portail toujours disponible après redémarrage');
 }
 finally{await stop();fs.rmSync(temp,{recursive:true,force:true})}
});
