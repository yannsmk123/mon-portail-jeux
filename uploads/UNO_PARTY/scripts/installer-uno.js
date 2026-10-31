'use strict';
/**
 * Installateur ciblé, à exécuter à la RACINE de yannsmk123/mon-portail-jeux.
 * Ne remplace jamais le portail. Préserve ses fonctionnalités et ses autres jeux.
 * N'écrit rien si les marqueurs du server.js ne correspondent pas.
 */
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const portalFile=path.join(ROOT,'server.js');
const pkgFile=path.join(ROOT,'package.json');
const catalogFile=path.join(ROOT,'games-config.json');
const portalMarker='// UNO PARTY V3 — début route statique isolée';
const startupMarker="require('./uno-server/native').installUnoNative(server,userAllowed)";
const routeAnchor="if(req.method==='GET'&&pn.startsWith('/games/')){";
const startupAnchor="if(require.main===module)server.listen(PORT,'0.0.0.0',()=>{";
const endAnchor='});\n\nmodule.exports={server,catalog,discoverGames,metadata,adminConfigured};';

function abort(message) {throw new Error('[UNO] '+message+' Rien n’a été modifié.');}
function install(root=ROOT,{dryRun=false}={}) {
  const serverPath=path.join(root,'server.js');
  const pkgPath=path.join(root,'package.json');
  const configPath=path.join(root,'games-config.json');
  if (![serverPath,pkgPath,configPath,path.join(root,'uploads','uno','index.html'),path.join(root,'uno-server','native.js')].every(fs.existsSync)) {
    abort('Le dossier doit être fusionné avec la racine de mon-portail-jeux (server.js / package.json / games-config.json absents ou fichiers UNO manquants).');
  }
  let original=fs.readFileSync(serverPath,'utf8');
  const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
  const cfg=JSON.parse(fs.readFileSync(configPath,'utf8'));
  if(original.includes(portalMarker)!==original.includes(startupMarker)) abort('Installation UNO partielle détectée : vérifie le server.js avant de continuer.');
  const already=original.includes(portalMarker);
  let next=original;
  if(!already){
    if(!original.includes(routeAnchor) || !original.includes(startupAnchor) || !original.includes(endAnchor)) {
      abort('Le server.js du portail a changé : patch automatique refusé pour protéger les autres jeux.');
    }
    if(original.split(routeAnchor).length !== 2 || original.split(startupAnchor).length !== 2 || original.split(endAnchor).length !== 2) abort('Marqueurs ambigus dans server.js.');
    const route=`${portalMarker}\nif((req.method==='GET'||req.method==='HEAD')&&(pn==='/games/uno'||pn.startsWith('/games/uno/'))){\n  return require('./uno-server/static').serveUnoStatic(req,res,pn);\n}\n// UNO PARTY V3 — fin route statique isolée\n\n${routeAnchor}`;
    next=next.replace(routeAnchor,route);
    next=next.replace(startupAnchor,"if(require.main===module)"+startupMarker+".then(()=>server.listen(PORT,'0.0.0.0',()=>{");
    next=next.replace(endAnchor,"})).catch(err=>{console.error('[UNO] Erreur de démarrage :',err);process.exitCode=1;});\n\nmodule.exports={server,catalog,discoverGames,metadata,adminConfigured};");
  }
  pkg.dependencies={...pkg.dependencies,'socket.io':pkg.dependencies?.['socket.io']||'^4.8.1','pg':pkg.dependencies?.pg||'^8.13.1'};
  if(!cfg.uno){ cfg.uno={title:'UNO PARTY 🎉',description:'Défie tes amis jusqu’à 4 joueurs, ou affronte des bots !',category:'Cartes & stratégie',icon:'🃏',accent:'#ff6b4a',multiplayer:true,featured:true}; }
  if(dryRun) { return {already,changed:!already,files:['server.js','package.json','games-config.json']}; }
  if(!already) fs.writeFileSync(serverPath,next);
  fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
  fs.writeFileSync(configPath,JSON.stringify(cfg,null,2)+'\n');
  console.log(already?'✅ UNO était déjà connecté ; dépendances et fiche vérifiées.':'✅ Route UNO et Socket.IO raccordés au serveur natif.');
  console.log('✅ Catalogue MY GAME ARCADE : UNO Party est configuré.');
  console.log('➡️ Lance ensuite : npm install && npm test && npm start');
  return {already,changed:!already};
}
if(require.main===module){
  try{install(ROOT,{dryRun:process.argv.includes('--check')});}
  catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={install};
