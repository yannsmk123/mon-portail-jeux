'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {unpackZip,fromUpload,pathSafe}=require('../zip-games');
const {server,catalog}=require('../server');
const root=path.join(__dirname,'..');
function zipFromFiles(files){
  const local=[],central=[];let offset=0;
  const crc32=(buffer)=>{let c=~0;for(const n of buffer){c^=n;for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1))}return ~c>>>0};
  for(const [name,value] of files){const n=Buffer.from(name),raw=Buffer.from(value),z=zlib.deflateRawSync(raw),crc=crc32(raw);
    const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50);lh.writeUInt16LE(20,4);lh.writeUInt16LE(8,8);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(z.length,18);lh.writeUInt32LE(raw.length,22);lh.writeUInt16LE(n.length,26);
    local.push(lh,n,z);const cent=Buffer.alloc(46);cent.writeUInt32LE(0x02014b50);cent.writeUInt16LE(20,4);cent.writeUInt16LE(20,6);cent.writeUInt16LE(8,10);cent.writeUInt32LE(crc,16);cent.writeUInt32LE(z.length,20);cent.writeUInt32LE(raw.length,24);cent.writeUInt16LE(n.length,28);cent.writeUInt32LE(offset,42);central.push(cent,n);offset+=lh.length+n.length+z.length;
  }
  const middle=Buffer.concat(central),eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50);eocd.writeUInt16LE(files.length,8);eocd.writeUInt16LE(files.length,10);eocd.writeUInt32LE(middle.length,12);eocd.writeUInt32LE(offset,16);return Buffer.concat([...local,middle,eocd]);
}
test('zip lecteur: jeu intégré déjà présent',()=>{
 const g=catalog.get('marvel-fusion');assert.ok(g);assert.ok(g.files.get('index.html').toString().includes('MARVEL FUSION'));
 assert.equal(g.multiplayer,true);
});
test('zip lecteur: sous-dossier et fichiers CSS et JS',()=>{
 const sample=zipFromFiles([['mygame/index.html','<title>Demo</title>'],['mygame/assets/main.css','body{color:red}'],['mygame/assets/main.js','console.log(1)']]);
 const g=unpackZip(sample);assert.ok(g.has('index.html'));assert.ok(g.has('assets/main.css'));assert.ok(g.has('assets/main.js'));
});
test('zip lecteur: HTML simple et chemins dangereux',()=>{
 assert.equal(fromUpload('game.html',Buffer.from('<h1>Jeu</h1>')).get('index.html').toString(),'<h1>Jeu</h1>');
 assert.equal(pathSafe('../config'),false);assert.equal(pathSafe('/etc/passwd'),false);assert.equal(pathSafe('images/picto.png'),true);
});
test('zip lecteur: interdit une archive sans HTML',()=>{
 assert.throws(()=>unpackZip(zipFromFiles([['readme.txt','hi']])),/HTML/);
});
test('portail et jeu distant: routes complètes, création de salle, connexion du second joueur',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(route,data)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json());
 try{
   const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/MY GAME ARCADE/);
   const data=await fetch(base+'/api/portal/games').then(r=>r.json());assert.equal(data.games[0].id,'marvel-fusion');
   const game=await fetch(base+'/games/marvel-fusion/');assert.equal(game.status,200);assert.match(await game.text(),/MARVEL FUSION/);
   const room=await post('/api/create',{name:'PC 1'});assert.match(room.code,/^[A-F0-9]{6}$/);assert.ok(room.token);
   const join=await post('/api/join',{code:room.code,name:'PC 2'});assert.equal(join.side,1);
   const begun=await post('/api/start',{code:room.code,token:room.token,lokis:4,first:0});assert.equal(begun.phase,'playing');
   const guest=await post('/api/state',{code:room.code,token:join.token});assert.equal(guest.phase,'playing');assert.equal(guest.me,1);
   const invalid=await fetch(base+'/games/marvel-fusion/server.js');assert.equal(invalid.status,404);
   const upload=await post('/api/portal/upload',{});assert.match(upload.error,/non configuré/);
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
});
