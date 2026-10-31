'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto').webcrypto;
const {UnoMediaStore} = require('../uploads/uno/media-loader');
const dir = path.resolve(__dirname,'../uploads/uno');
const BASE = 'http://localhost/games/uno/';
function server({manifestOverride,corrupt,middleMissing}={}) {
 const requests=[];
 async function fetcher(url) {
  const local = new URL(url);
  assert.equal(local.origin, 'http://localhost');
  const filename = decodeURIComponent(local.pathname.split('/games/uno/')[1]);
  requests.push(filename);
  if (middleMissing && filename === middleMissing) return {ok:false,status:404};
  const buffer = filename === 'assets.json' && manifestOverride ? Buffer.from(JSON.stringify(manifestOverride)) : await fs.readFile(path.join(dir,filename));
  const data = corrupt && filename === corrupt ? Buffer.from(buffer.toString()+'BAD') : buffer;
  return {ok:true, json:async()=>JSON.parse(data.toString()), arrayBuffer:async()=>Uint8Array.from(data).buffer};
 }
 return {requests,fetcher};
}
function create(fetcher) { return new UnoMediaStore({base:BASE,fetcher,dbFactory:null,cryptoImpl:crypto}); }

test('manifeste minuscule (< 5 ko) et ressources optionnelles en trois packs distincts',async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'assets.json'),'utf8'));
 assert.ok(Buffer.byteLength(JSON.stringify(manifest))<5000);
 assert.deepEqual(manifest.packs.map(x=>x.id),['visuals','sfx','music']);
 assert.equal(manifest.packs.find(x=>x.id==='music').parts.length,5);
});
test('première ouverture = manifeste + illustrations, et aucun fichier audio',async()=>{
 const req=server();const media=create(req.fetcher);
 await media.check();await media.loadPack('visuals');
 assert.deepEqual(req.requests,['assets.json','packs/visuals.part-01.txt']);
 assert.match((await media.resource('card-back')).data,/^data:image\/svg\+xml;base64,/);
 assert.deepEqual(req.requests,['assets.json','packs/visuals.part-01.txt']);
});
test('réouverture et manifeste inchangé : aucun gros fichier téléchargé',async()=>{
 const req=server();const media=create(req.fetcher);
 await media.check();await media.loadPack('visuals');
 await media.check();await media.loadPack('visuals');
 assert.equal(req.requests.filter(x=>x.endsWith('.txt')).length,1);
 assert.equal(req.requests.filter(x=>x==='assets.json').length,2);
});
test('mise à jour ciblée du visuel : recharge uniquement le pack modifié',async()=>{
 const req=server();const media=create(req.fetcher);
 await media.check();await media.loadPack('visuals');
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'assets.json'),'utf8'));
 manifest.packs.find(x=>x.id==='visuals').version='2.0.0';
 const next=server({manifestOverride:manifest});
 media.fetcher=next.fetcher;await media.check();await media.loadPack('visuals');
 assert.deepEqual(next.requests,['assets.json','packs/visuals.part-01.txt']);
});
test('intégrité SHA-256 invalide : pack rejeté, sans cache empoisonné',async()=>{
 const req=server({corrupt:'packs/visuals.part-01.txt'});const media=create(req.fetcher);
 await media.check();
 await assert.rejects(media.loadPack('visuals'),/SHA-256 invalide/);
 assert.equal(await media.read('pack:visuals'),undefined);
});
test('partie manquante => message explicite',async()=>{
 const req=server({middleMissing:'packs/music.part-03.txt'});const media=create(req.fetcher);
 await media.check();await assert.rejects(media.loadPack('music'),/Ressource manquante/);
});
test('suppression personnalisée conservée malgré une nouvelle vérification du JSON',async()=>{
 const req=server();const media=create(req.fetcher);
 await media.check();await media.deleteResource('card-back');
 assert.equal(await media.resource('card-back'),null);
 await media.check();assert.equal(await media.resource('card-back'),null);
 const backup=media.exportPreferences();
 const restored=create(req.fetcher);await restored.check();await restored.importPreferences(backup);
 assert.equal(await restored.resource('card-back'),null);
 await restored.resetPreferences();assert.ok(await restored.resource('card-back'));
});
test('configuration audio et progression serveur restent séparées du JSON exporté',async()=>{
 const req=server();const media=create(req.fetcher);
 await media.check();await media.setSetting('musicVolume',43);
 assert.equal(media.settings().musicVolume,43);
 assert.ok(!JSON.stringify(media.exportPreferences()).includes('token'));
 await media.resetOfficialCache();assert.equal(media.settings().musicVolume,43);
});
test('aucun chemin traversant et aucune URL externe acceptés dans le manifeste',async()=>{
 const req=server();const media=create(req.fetcher);
 await media.check();
 const bad=structuredClone(media.manifest);bad.packs[0].parts[0].path='../../secret';
 assert.throws(()=>media.validateManifest(bad),/Chemin/);
 bad.packs[0].parts[0].path='https://evil.test/a';
 assert.throws(()=>media.validateManifest(bad),/Chemin/);
});
test('tous les fragments des trois packs sont lisibles et vérifiés',async()=>{
 const req=server();const media=create(req.fetcher);
 await media.check();
 for (const pack of media.manifest.packs) {
  const result=await media.loadPack(pack.id);
  assert.ok(result.assets.length>0);
 }
 assert.ok((await media.resource('music-1')).data.startsWith('data:audio/wav;base64,'));
});
