'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs');
const http=require('node:http');
const {install}=require('../scripts/installer-uno');
const {serveUnoStatic}=require('../uno-server/static');

function makePortal(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'uno-portal-'));
  fs.mkdirSync(path.join(root,'uploads','uno'),{recursive:true});
  fs.mkdirSync(path.join(root,'uno-server'));
  fs.writeFileSync(path.join(root,'uploads','uno','index.html'),'<html></html>');
  fs.writeFileSync(path.join(root,'uno-server','native.js'),'module.exports = {}');
  // Ancres de la structure réelle du 31/10/2026, sans aucune dépendance serveur.
  fs.writeFileSync(path.join(root,'server.js'),
    "const http=require('node:http');\nconst PORT=3000;\nconst userAllowed=()=>true;\n"+
    "const server=http.createServer((req,res)=>{const pn=new URL(req.url,'http://localhost').pathname;\n"+
    "if(req.method==='GET'&&pn.startsWith('/games/')){res.end('autre jeu');return;}\nres.end('autre route');\n});\n"+
    "if(require.main===module)server.listen(PORT,'0.0.0.0',()=>{\nconsole.log('Portail démarré');\n});\n\n"+
    "module.exports={server,catalog,discoverGames,metadata,adminConfigured};\n");
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({scripts:{start:'node server.js'},dependencies:{}}));
  fs.writeFileSync(path.join(root,'games-config.json'),JSON.stringify({'lost-cities-duel':{featured:true}}));
  return root;
}

test('installateur ajoute une route isolée, sans écraser la configuration existante',()=>{
  const root=makePortal();
  try{
    const original=fs.readFileSync(path.join(root,'server.js'),'utf8');
    assert.equal(install(root).changed,true);
    const next=fs.readFileSync(path.join(root,'server.js'),'utf8');
    assert.ok(next.includes(original.match(/if\(req.method==='GET'&&pn.startsWith\('\/games\/'\)\)\{/)[0]));
    assert.match(next,/serveUnoStatic/);
    assert.match(next,/installUnoNative/);
    const cfg=JSON.parse(fs.readFileSync(path.join(root,'games-config.json')));
    assert.equal(cfg['lost-cities-duel'].featured,true);
    assert.equal(cfg.uno.multiplayer,true);
    const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
    assert.equal(pkg.scripts.start,'node server.js');
    assert.ok(pkg.dependencies['socket.io']);
    assert.ok(pkg.dependencies.pg);
    // Rejouer l'installateur ne duplique pas les routes.
    assert.equal(install(root).already,true);
    const twice=fs.readFileSync(path.join(root,'server.js'),'utf8');
    assert.equal(twice.split('serveUnoStatic').length,2);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('si la structure du portail a changé, aucune écriture automatique',()=>{
  const root=makePortal();
  try{
    const file=path.join(root,'server.js');
    fs.writeFileSync(file,'const serveurNouveau = true;');
    const pkgBefore=fs.readFileSync(path.join(root,'package.json'),'utf8');
    assert.throws(()=>install(root),/patch automatique refusé/);
    assert.equal(fs.readFileSync(file,'utf8'),'const serveurNouveau = true;');
    assert.equal(fs.readFileSync(path.join(root,'package.json'),'utf8'),pkgBefore);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

async function withWebServer(fn){
  const server=http.createServer((req,res)=>serveUnoStatic(req,res,new URL(req.url,'http://localhost').pathname));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {return await fn(`http://127.0.0.1:${server.address().port}`);}
  finally {await new Promise(resolve=>server.close(resolve));}
}
test('les fichiers UNO sont servis à la demande avec les bons en-têtes de cache',async()=>{
  await withWebServer(async base=>{
    const a=await fetch(base+'/games/uno/');
    assert.equal(a.status,200);
    assert.match(a.headers.get('content-type'),/text\/html/);
    assert.equal(a.headers.get('cache-control'),'no-cache');
    assert.match(await a.text(),/UNO PARTY|UNO Party/i);
    const b=await fetch(base+'/games/uno/assets.json');
    assert.equal(b.status,200);
    assert.equal(b.headers.get('cache-control'),'no-cache');
    assert.ok(JSON.parse(await b.text()).packs);
    const c=await fetch(base+'/games/uno/packs/visuals.part-01.txt');
    assert.equal(c.status,200);
    assert.match(c.headers.get('cache-control'),/max-age=300/);
  });
});

test('l’accès à des fichiers hors du dossier UNO est bloqué',async()=>{
  await withWebServer(async base=>{
    for(const bad of ['/games/uno/%2e%2e%2fserver.js','/games/uno/%5cserver.js','/games/uno/.env','/games/uno/../server.js']){
      const url=bad.includes('../')?base+bad.replace('../','%2E%2E/'):base+bad;
      const res=await fetch(url,{redirect:'manual'});
      assert.ok([403,404].includes(res.status),`${bad}: HTTP ${res.status}`);
    }
    const x=await fetch(base+'/games/uno/'); assert.equal(x.status,200);
  });
});
