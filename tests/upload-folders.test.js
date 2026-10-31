'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {packZip}=require('../zip-games');
const {catalog,discoverGames,server}=require('../server');
const root=path.join(__dirname,'..','uploads');
const slug='v110-test-repertoire';
const folder=path.join(root,slug);
const legacy='v110-test-ancien-format.html';

test('V110: détecte automatiquement les dossiers de jeux ET les anciens jeux à la racine',async()=>{
 fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,slug+'.zip'),packZip(new Map([
  ['index.html',Buffer.from('<!doctype html><title>Jeu dans son dossier</title><link rel="stylesheet" href="assets/theme.css"><script src="assets/app.js"></script>')],
  ['assets/theme.css',Buffer.from('body{color:red}')],
  ['assets/app.js',Buffer.from('window.testOk=true;')],
  ['_portail_jeu.json',Buffer.from(JSON.stringify({title:'Jeu rangé et reconnu',description:'Détection automatique V110',category:'Jeux HTML'}))]
 ])));
 fs.writeFileSync(path.join(root,legacy),'<h1>Jeu ancien toujours compatible</h1>');
 try{
  discoverGames();
  const one=catalog.get(slug),old=catalog.get('v110-test-ancien-format');
  assert.equal(one?.title,'Jeu rangé et reconnu');
  assert.match(one.files.get('assets/theme.css').toString(),/color:red/);
  assert.match(old.files.get('index.html').toString(),/Jeu ancien/);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const list=await fetch(base+'/api/portal/games').then(r=>r.json());
  assert.ok(list.games.some(g=>g.id===slug));
  const html=await fetch(base+'/games/'+slug+'/');
  assert.equal(html.status,200);assert.match(await html.text(),/Jeu dans son dossier/);
  const css=await fetch(base+'/games/'+slug+'/assets/theme.css');
  assert.equal(css.status,200);assert.match(await css.text(),/color:red/);
  const previous=await fetch(base+'/games/v110-test-ancien-format/');
  assert.equal(previous.status,200);assert.match(await previous.text(),/Jeu ancien/);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  catalog.delete(slug);catalog.delete('v110-test-ancien-format');
  fs.rmSync(folder,{recursive:true,force:true});fs.rmSync(path.join(root,legacy),{force:true});
 }
});
