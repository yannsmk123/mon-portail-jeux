'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {server,catalog,discoverGames}=require('../server');
const OLD={ADMIN_PASSWORD:process.env.ADMIN_PASSWORD,GITHUB_TOKEN:process.env.GITHUB_TOKEN,GITHUB_REPOSITORY:process.env.GITHUB_REPOSITORY};
const realFetch=global.fetch;
function restore(){for(const [key,v] of Object.entries(OLD))if(v===undefined)delete process.env[key];else process.env[key]=v;}
test('V111 : éditeur et paramètres envoient uniquement des fiches et couvertures dans leur dossier GitHub',async()=>{
 process.env.ADMIN_PASSWORD='admin-for-tests';process.env.GITHUB_TOKEN='token-test';process.env.GITHUB_REPOSITORY='demo/portail';
 const seen=new Map(),calls=[];
 global.fetch=async(input,options={})=>{
  const url=String(input);
  if(!url.startsWith('https://api.github.com/'))return realFetch(input,options);
  const pathname=url.split('?')[0],method=options.method||'GET';
  if(method==='GET')return seen.has(pathname)?Response.json({type:'file',sha:seen.get(pathname).sha}):new Response('{}',{status:404});
  if(method!=='PUT')throw Error('Unsupported method '+method);
  const body=JSON.parse(options.body);calls.push({pathname,body});
  const n=(seen.get(pathname)?.n||0)+1;
  assert.equal(body.sha, n===1?undefined:`sha-${n-1}`);
  seen.set(pathname,{sha:`sha-${n}`,n,content:Buffer.from(body.content,'base64')});
  return Response.json({content:{sha:`sha-${n}`}}, {status:201});
 };
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(route,body,origin)=>{
  const resp=await realFetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  return {status:resp.status,body:await resp.json()};
 };
 try{
  const list=await realFetch(base+'/api/portal/games').then(r=>r.json());
  assert.ok(list.games.some(g=>g.id==='marvel-fusion'));assert.ok(list.games.some(g=>g.id==='lost-cities-duel'));
  assert.ok(list.settings.siteName);assert.equal(list.adminAvailable,true);
  const body={id:'lost-cities-duel',title:'Le Grand Tournoi',description:'Un jeu fantastique.',category:'Aventure',icon:'🧭',accent:'#11bbff',password:process.env.ADMIN_PASSWORD};
  const before=calls.length;
  const wrong=await post('/api/portal/editor/save',{...body,password:'wrong'});assert.equal(wrong.status,403);assert.equal(calls.length,before);
  const unknown=await post('/api/portal/editor/save',{...body,id:'jeuinconnu'});assert.equal(unknown.status,404);
  const origin=await post('/api/portal/editor/save',body,'https://evil.example');assert.equal(origin.status,403);
  const noImage=await post('/api/portal/editor/save',body);assert.equal(noImage.status,200,JSON.stringify(noImage));
  assert.equal(noImage.body.path,'uploads/lost-cities-duel/_presentation_portail.json');
  let last=calls.at(-1);assert.equal(JSON.parse(Buffer.from(last.body.content,'base64').toString()).title,'Le Grand Tournoi');
  const img=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489','hex');
  const changed=await post('/api/portal/editor/save',{...body,coverAction:'replace',coverName:'visuel.png',coverBase64:img.toString('base64')});assert.equal(changed.status,200,JSON.stringify(changed));
  assert.equal(calls.at(-2).pathname,'https://api.github.com/repos/demo/portail/contents/uploads/lost-cities-duel/couverture-portail.png');
  assert.equal(calls.at(-1).body.sha,'sha-1');
  const metadata=JSON.parse(seen.get(calls.at(-1).pathname).content.toString());assert.equal(metadata.cover,'couverture-portail.png');
  assert.deepEqual(seen.get(calls.at(-2).pathname).content,img);
  const invalid=await post('/api/portal/editor/save',{...body,coverAction:'replace',coverName:'visuel.png',coverBase64:Buffer.from('fake image').toString('base64')});assert.equal(invalid.status,400);
  const removed=await post('/api/portal/editor/save',{...body,coverAction:'remove'});assert.equal(removed.status,200);
  assert.equal(JSON.parse(seen.get(calls.at(-1).pathname).content.toString()).cover,'');
  const settings={siteName:'Mon Palais des Jeux',subtitle:'Collection personnelle',heroTitle:'Tous mes jeux',heroHighlight:'Pour jouer en famille',intro:'Choisis un jeu dans la collection.'};
  const saved=await post('/api/portal/settings/save',{password:process.env.ADMIN_PASSWORD,settings});assert.equal(saved.status,200,JSON.stringify(saved));
  assert.equal(saved.body.path,'portal-settings.json');assert.equal(JSON.parse(seen.get(calls.at(-1).pathname).content.toString()).siteName,settings.siteName);
  const savedAgain=await post('/api/portal/settings/save',{password:process.env.ADMIN_PASSWORD,settings});assert.equal(savedAgain.status,200);
  assert.equal(calls.at(-1).body.sha,'sha-1');
 }finally{global.fetch=realFetch;restore();await new Promise(done=>server.close(done));}
});
test('V111 : retrouve la fiche de jeu et la couverture conservées dans uploads/id, même pour les jeux natifs',async()=>{
 const dir=path.join(__dirname,'..','uploads','lost-cities-duel');fs.mkdirSync(dir,{recursive:true});
 const json=path.join(dir,'_presentation_portail.json');const png=path.join(dir,'couverture-portail.png');
 const sample=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489','hex');
 try{
  fs.writeFileSync(png,sample);fs.writeFileSync(json,JSON.stringify({title:'Test fiche de jeu',description:'Test V111',category:'Test',icon:'🎲',accent:'#22ccaa',cover:'couverture-portail.png'}));
  discoverGames();
  const g=catalog.get('lost-cities-duel');assert.equal(g.title,'Test fiche de jeu');assert.equal(g.cover,'couverture-portail.png');
  assert.deepEqual(g.files.get('couverture-portail.png'),sample);
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const origin='http://127.0.0.1:'+server.address().port;
  const result=await fetch(origin+'/games/lost-cities-duel/couverture-portail.png');assert.equal(result.status,200);
  assert.equal(result.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await result.arrayBuffer()),sample);
 }finally{
  if(server.listening)await new Promise(done=>server.close(done));
  fs.rmSync(json,{force:true});fs.rmSync(png,{force:true});fs.rmdirSync(dir);
  // Remettre la fiche originale en mémoire pour ne pas contaminer les autres tests.
  const game=catalog.get('lost-cities-duel');game.title='LOST CITIES DUEL — FUSION';game.description='Pars à l’aventure contre l’IA, sur le même écran ou contre un ami en ligne avec un code de salon.';game.category='Cartes & stratégie';game.icon='🧭';game.cover=null;game.accent='#75c8fa';game.files.delete('couverture-portail.png');
 }
});
