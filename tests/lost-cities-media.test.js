'use strict';
// Vérifie le pack d'illustrations/sons livré et sa publication sans cache.
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const net=require('node:net');
const root=path.join(__dirname,'..');
const folder=path.join(root,'lost-cities-online');
const pack=JSON.parse(fs.readFileSync(path.join(folder,'media-pack.json'),'utf8'));
const ids=[];
for(let c=0;c<6;c++){for(let v=2;v<=10;v++)ids.push(`${c}-v${v}`);for(let j=0;j<3;j++)ids.push(`${c}-r${j}`)}
const types=['select','hover','boardHover','play','discard','draw','turn','win','lose'];
test('Pack Lost Cities : 72 cartes, 6 images SVG réelles, sons et SFX déclarés',()=>{
 assert.equal(pack.format,'lost-cities-media-pack-v1');assert.equal(pack.version,1);
 assert.equal(Object.keys(pack.images.cards).length,72);
 assert.equal(pack.images.scenes.length,6);
 for(const src of pack.images.scenes){assert.match(src,/^data:image\/svg\+xml;base64,/);const svg=Buffer.from(src.split(',')[1],'base64').toString('utf8');assert.match(svg,/<svg\s/);assert.match(svg,/<\/svg>/)}
 for(const id of ids)assert.match(pack.images.cards[id],/^scene:[0-5]$/);
 assert.deepEqual(Object.keys(pack.sfx).sort(),types.sort());
 for(const sound of Object.values(pack.sfx))assert.equal(sound.type,'synthetic');
 assert.equal(pack.music.type,'synthetic');assert.deepEqual(pack.music.tracks,[]);
});
function reservePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port))});server.on('error',reject)})}
test('Le serveur autonome livre media-pack.json sans cache à chaque visite, sans exposer les données des joueurs',async()=>{
 const port=await reservePort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:folder,env:{...process.env,PORT:String(port),LOST_CITIES_DATA_FILE:path.join(folder,'data','__test_lost_cities_media_nonexistent.json')},stdio:'ignore'});
 try{
  let ready=false;
  for(let n=0;n<60;n++){try{const res=await fetch(base+'/media-pack.json');if(res.ok){ready=true;break}}catch(_){}await new Promise(done=>setTimeout(done,60))}
  assert.ok(ready,'Le serveur doit démarrer');
  for(let visit=0;visit<2;visit++){
   const response=await fetch(base+'/media-pack.json?check='+Date.now()+'-'+visit,{cache:'no-store'});
   assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/json/);
   assert.equal(response.headers.get('cache-control'),'no-store');
   assert.equal((await response.json()).images.scenes.length,6);
  }
  const page=await fetch(base+'/');assert.match(await page.text(),/id="mediaIntegrity"/);
  const hidden=await fetch(base+'/data/parties.json');assert.equal(hidden.status,404);
 }finally{child.kill('SIGTERM');await new Promise(done=>child.once('exit',done))}
});
