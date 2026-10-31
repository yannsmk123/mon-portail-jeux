'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fromUpload,packZip,pathSafe,MAX_ARCHIVE}=require('./zip-games');
const {server:marvelServer}=require('./marvel/server');
// Lost Cities rejoint le serveur HTTP EXISTANT : aucun deuxième port ou service Render.
const {server:lostCitiesServer}=require('./lost-cities-online/server');
const lostCitiesHandler=lostCitiesServer.listeners('request')[0];
const PORT=Number(process.env.PORT||3000);
const ROOT=__dirname,UPLOADS=path.join(ROOT,'uploads');
const presets=JSON.parse(fs.readFileSync(path.join(ROOT,'games-config.json'),'utf8'));
const catalog=new Map(),errors=[];
const asSlug=(s)=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55);
function cleanText(s){return String(s||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,130)}
function htmlText(raw){return String(raw).replace(/<[^>]*>/g,' ').replace(/&(amp|quot|lt|gt|nbsp|#39);/g,(_,x)=>({amp:'&',quot:'"',lt:'<',gt:'>',nbsp:' ', '#39':"'"}[x]||' ')).trim()}
function metadata(content,name){const html=(content.get('index.html')||Buffer.alloc(0)).toString('utf8').slice(0,250000);
 const title=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
 const desc=html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']{1,350})["'][^>]*>/i)?.[1];
 const cover=['cover.webp','cover.png','cover.jpg','cover.jpeg','preview.webp','preview.png','preview.jpg'].find(x=>content.has(x));
 return {title:cleanText(htmlText(title||name).replace(/\s+[—–|·]\s+(Le jeu de cartes|Le Jeu de Cartes|le jeu)$/i,'')),description:cleanText(htmlText(desc||'Un jeu HTML à découvrir sur le portail.')),cover:cover||null}}
// V110 : les nouveaux jeux sont rangés dans uploads/nom-du-fichier/nom-du-fichier.zip.
// Les anciens ZIP et HTML directement dans uploads/ restent pris en charge sans migration.
function listUploadedGames(){
 const candidates=[];
 const gameFile=name=>/\.(zip|html?)$/i.test(name);
 for(const entry of fs.readdirSync(UPLOADS,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(entry.name.startsWith('.'))continue;
  if(entry.isFile()&&gameFile(entry.name)){
   candidates.push({filename:entry.name,relative:entry.name,id:asSlug(entry.name.replace(/\.(zip|html?)$/i,''))});
  }else if(entry.isDirectory()){
   // Marvel Splendor est servi directement par Render, sans empaqueter ses médias en mémoire.
   if(entry.name==='marvel-splendor')continue;
   // Ne parcourir qu'un niveau : ignore par ex. les packs de médias Marvel et les ressources imbriquées.
   for(const inside of fs.readdirSync(path.join(UPLOADS,entry.name),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(inside.isFile()&&gameFile(inside.name)){
     candidates.push({filename:inside.name,relative:entry.name+'/'+inside.name,id:asSlug(entry.name)});
    }
   }
  }
 }
 return candidates;
}
function discoverGames(){
 if(!fs.existsSync(UPLOADS))fs.mkdirSync(UPLOADS,{recursive:true});
 const files=listUploadedGames();
 let total=0;
 for(const {filename,relative,id} of files){
   try{if(!id||catalog.has(id))throw Error('Nom de jeu en double.');
     const bytes=fs.readFileSync(path.join(UPLOADS,relative));if(bytes.length>MAX_ARCHIVE)throw Error('Archive de plus de 20 Mo.');
     const content=fromUpload(filename,bytes);total+=[...content.values()].reduce((n,b)=>n+b.length,0);if(total>90*1024*1024)throw Error('Limite mémoire des jeux atteinte.');
     const given=presets[id]||{}; const meta=metadata(content,id.replaceAll('-',' '));
     let uploadInfo={};
     if(content.has('_portail_jeu.json'))try{uploadInfo=JSON.parse(content.get('_portail_jeu.json').toString('utf8'))}catch(_){}
     const title=cleanText(uploadInfo.title)||given.title||meta.title;
     const description=cleanText(uploadInfo.description)||given.description||meta.description;
     const category=cleanText(uploadInfo.category)||given.category||'Jeux HTML';
     const icon=cleanText(uploadInfo.icon).slice(0,6)||given.icon||'🎮';
     const cover=uploadInfo.cover&&content.has(uploadInfo.cover)?uploadInfo.cover:meta.cover;
     catalog.set(id,{id,files:content,title,description,category,icon,accent:given.accent||'#64dbe3',cover,multiplayer:!!given.multiplayer,featured:!!given.featured});
   }catch(e){errors.push(`${relative}: ${e.message}`);console.error('Jeu ignoré :',relative,e.message)}
 }
 applyPresentationOverlays();
}
discoverGames();
// MARVEL SPLENDOR : version du dossier GitHub uploads/marvel-splendor/.
// Le HTML est petit, mais le JSON découpé en cinq fichiers est trop volumineux
// pour le chargeur ZIP (20 Mo) : les médias seront diffusés depuis le disque.
const SPLENDOR_FOLDER=path.join(UPLOADS,'marvel-splendor');
const splendorIndex=path.join(SPLENDOR_FOLDER,'index.html');
if(fs.existsSync(splendorIndex)){
 const data=fs.readFileSync(splendorIndex);
 const meta=metadata(new Map([['index.html',data]]),'Marvel Splendor');
 const cfg=presets.splendor||presets['marvel-splendor']||{};
 catalog.set('splendor',{
  id:'splendor',storageId:'marvel-splendor',
  files:new Map([['index.html',data]]),
  title:cfg.title||'Marvel Splendor',
  description:cfg.description||meta.description,
  category:cfg.category||'Cartes & stratégie',
  icon:cfg.icon||'🃏',accent:cfg.accent||'#d3ae6e',
  cover:null,multiplayer:!!cfg.multiplayer,featured:!!cfg.featured
 });
}else errors.push('uploads/marvel-splendor/index.html absent : Marvel Splendor non publié sur Render.');
// Jeu embarqué dans un dossier dédié, ajouté au catalogue sans modifier les ZIP existants.
// Une copie du HTML est servie par /games/lost-cities-duel/ ; son API multijoueur
// passe uniquement par /api/lost-cities/* et ne touche jamais aux routes MARVEL.
const LOST_CITIES_ID='lost-cities-duel';
const lostIndex=path.join(ROOT,'lost-cities-online','index.html');
if(fs.existsSync(lostIndex)){
 const settings=presets[LOST_CITIES_ID]||{};
 catalog.set(LOST_CITIES_ID,{
  id:LOST_CITIES_ID,
  files:new Map([['index.html',fs.readFileSync(lostIndex)]]),
  title:settings.title||'LOST CITIES DUEL — FUSION',
  description:settings.description||'Explore six expéditions en solo contre l’IA, à deux sur le même écran ou avec un ami en ligne.',
  category:settings.category||'Cartes & stratégie',
  icon:settings.icon||'🧭',accent:settings.accent||'#75c8fa',
  cover:null,multiplayer:true,featured:!!settings.featured
 });
}else errors.push('lost-cities-online/index.html absent : Lost Cities non publié.');
// MARVEL FUSION : pack du site dans uploads/marvel-medias/.
// 1 JSON direct possible; les gros packs peuvent être découpés en
// pack-part-01.json, pack-part-02.json, etc. Chaque fichier est publié via /games/.
// Le navigateur importe automatiquement ces parties dans les deux modes.
const gameMarvel=catalog.get('marvel-fusion');
function hostedMediaFiles(){
 const folder=path.join(UPLOADS,'marvel-medias');
 if(fs.existsSync(folder)){
  const all=fs.readdirSync(folder).filter(name=>/\.json$/i.test(name)).sort();
  const parts=all.filter(name=>/^pack-part-\d+\.json$/i.test(name));
  if(parts.length){
   const indices=parts.map(name=>Number(name.match(/\d+/)[0]));
   if(indices[0]!==1||indices.some((num,i)=>num!==i+1))throw Error('Les fichiers pack-part doivent être numérotés sans trou depuis 01.');
   return parts.map(filename=>({filename,filepath:path.join(folder,filename),kind:'medias'}));
  }
  // Tu peux aussi déposer directement le JSON exporté, quel que soit son nom.
  const singles=all.filter(name=>!/^pack-part-/i.test(name));
  if(singles.length){
   const filename=singles.find(x=>/^pack\.json$/i.test(x))||singles[0];
   if(singles.length>1)console.warn('Plusieurs JSON dans marvel-medias : seul '+filename+' est chargé.');
   return [{filename,filepath:path.join(folder,filename),kind:'medias'}];
  }
 }
 // Rétrocompatibilité avec le premier portail médias : uploads/.
 for(const [filename,kind] of [['marvel-fusion-medias.json','medias'],['marvel-fusion-mes-cartes.json','cartes']]){
  const filepath=path.join(UPLOADS,filename);
  if(fs.existsSync(filepath))return [{filename,filepath,kind}];
 }
 return [];
}
let hostedMediaInfo={available:false,kind:null,sha256:null,parts:[],error:null};
if(gameMarvel){
 try{
  const sourceFiles=hostedMediaFiles();
  if(sourceFiles.length){
   const staged=[];const hash=crypto.createHash('sha256');let grandTotal=0;const counts={soloAudio:0,soloPower:0,soloOutcome:0,lanMedia:0,workshopAssets:0};
   for(const {filename,filepath,kind} of sourceFiles){
    const bytes=fs.readFileSync(filepath);grandTotal+=bytes.length;
    if(grandTotal>120*1024*1024)throw Error('Pack de médias trop volumineux (120 Mio maximum).');
    const parsed=JSON.parse(bytes.toString('utf8'));
    if(kind==='medias'){
     if(parsed.format!=='marvel-fusion-media-pack-v1'||parsed.version!==1||!Array.isArray(parsed.assets))throw Error(filename+' : format de pack médias invalide.');
     if(parsed.assets.length>600)throw Error(filename+' : trop de médias.');for(const entry of parsed.assets)if(Object.prototype.hasOwnProperty.call(counts,entry.scope))counts[entry.scope]++;if(Array.isArray(parsed.workshop?.assets))counts.workshopAssets=Math.max(counts.workshopAssets,parsed.workshop.assets.length);
    }else if(!(Array.isArray(parsed.assets)&&parsed.links&&typeof parsed.links==='object')){
     throw Error(filename+' : atelier de cartes invalide.');
    }
    const uri='medias/'+filename;
    staged.push({uri,bytes});hash.update(filename).update(bytes);
   }
   for(const {uri,bytes} of staged)gameMarvel.files.set(uri,bytes);
   hostedMediaInfo={available:true,kind:sourceFiles[0].kind,sha256:hash.digest('hex'),parts:staged.map(s=>s.uri),counts,error:null};
   console.log('Médias MARVEL FUSION : '+staged.length+' fichier(s), '+(grandTotal/1048576).toFixed(1)+' Mio, installation automatique.');
  }else console.log('Médias MARVEL FUSION : aucun pack publié dans uploads/marvel-medias/.');
 }catch(err){hostedMediaInfo.error=err.message;console.error('Médias MARVEL FUSION :',err.message)}
 gameMarvel.files.set('medias-par-defaut-version.json',Buffer.from(JSON.stringify(hostedMediaInfo)));
}
applyPresentationOverlays();
const mime={'.html':'text/html; charset=utf-8','.htm':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.mp4':'video/mp4','.webm':'video/webm','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8','.pdf':'application/pdf'};
function respond(res,code,data,type='text/html; charset=utf-8',headers={}){res.writeHead(code,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...headers});res.end(data)}
function json(res,code,obj){respond(res,code,JSON.stringify(obj),'application/json; charset=utf-8',{'Cache-Control':'no-store'})}
function read(req,max){return new Promise((resolve,reject)=>{let parts=[],len=0;req.on('data',d=>{len+=d.length;if(len>max){reject(Error('Fichier trop volumineux.'));req.destroy()}else parts.push(d)});req.on('end',()=>resolve(Buffer.concat(parts)));req.on('error',reject)})}
const siteCode=process.env.SITE_ACCESS_CODE||'';
const sigKey=crypto.createHash('sha256').update('portal-access:'+siteCode).digest();
function equal(a,b){const ba=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));return ba.length===bb.length && crypto.timingSafeEqual(ba,bb)}
function userAllowed(req){if(!siteCode)return true;
 const cookie=(req.headers.cookie||'').match(/(?:^|;\s*)jeu_session=([^;]+)/)?.[1];if(!cookie)return false;
 const [expiry,hmac]=cookie.split('.');if(!/^\d{10,14}$/.test(expiry||'')||Number(expiry)<Date.now())return false;
 return equal(hmac,crypto.createHmac('sha256',sigKey).update(expiry).digest('hex'))}
function loginPage(bad=false){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accès au portail</title><style>body{min-height:100vh;display:grid;place-items:center;background:#0a1022;color:#f4f7ff;font:16px system-ui;margin:0}.box{width:min(420px,calc(100vw - 38px));padding:34px;background:#182642;border:1px solid #446380;border-radius:20px;box-sizing:border-box}h1{font-size:25px}input,button{box-sizing:border-box;width:100%;padding:15px;border-radius:9px;margin:6px 0;font:inherit}input{background:#091529;border:1px solid #526984;color:white}button{background:#e95779;color:white;font-weight:800;border:0;cursor:pointer}.error{color:#ffa4ba}</style></head><body><form class="box" action="/access" method="post"><div style="font-size:40px">🎮</div><h1>Portail de jeux privé</h1><p>Entre le code donné par l'hôte pour accéder aux jeux.</p>${bad?'<p class="error">Code incorrect, réessaie.</p>':''}<input aria-label="Code d’accès" name="code" type="password" autocomplete="off" required autofocus><button>Entrer</button></form></body></html>`}
function adminConfigured(){return !!(process.env.ADMIN_PASSWORD&&process.env.GITHUB_TOKEN&&/^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPOSITORY||''))}
// V111 : réglages du portail et fiches de jeux stockés dans GitHub.
// Pas de disque temporaire Render : les réglages survivent aux redéploiements.
const PORTAL_SETTINGS_FILE=path.join(ROOT,'portal-settings.json');
const DEFAULT_PORTAL_SETTINGS={siteName:'MY GAME ARCADE',subtitle:'LE PORTAIL DES JEUX MAISON',heroTitle:'Des jeux faits maison.',heroHighlight:'Des parties sans frontières.',intro:'Retrouve tous mes jeux au même endroit. Joue en solo, lance un défi à un ami et partage des moments, même à distance.'};
function safeSettings(data){return {
 siteName:cleanText(data?.siteName).slice(0,55)||DEFAULT_PORTAL_SETTINGS.siteName,
 subtitle:cleanText(data?.subtitle).slice(0,90)||DEFAULT_PORTAL_SETTINGS.subtitle,
 heroTitle:cleanText(data?.heroTitle).slice(0,110)||DEFAULT_PORTAL_SETTINGS.heroTitle,
 heroHighlight:cleanText(data?.heroHighlight).slice(0,110)||DEFAULT_PORTAL_SETTINGS.heroHighlight,
 intro:String(data?.intro||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,400)||DEFAULT_PORTAL_SETTINGS.intro
}}
function portalSettings(){try{return safeSettings(JSON.parse(fs.readFileSync(PORTAL_SETTINGS_FILE,'utf8')))}catch(_){return {...DEFAULT_PORTAL_SETTINGS}}}
function cleanDescription(raw){return String(raw||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,350)}
function safePresentation(info){
 const title=cleanText(info?.title).slice(0,80);
 if(!title)throw Error('Le titre du jeu est obligatoire.');
 const accent=String(info?.accent||'').trim();
 if(accent&&!/^#[0-9a-fA-F]{6}$/.test(accent))throw Error('Couleur invalide.');
 return {title,description:cleanDescription(info?.description),category:cleanText(info?.category).slice(0,55)||'Jeux HTML',icon:cleanText(info?.icon).slice(0,6)||'🎮',accent:accent||'#64dbe3'};
}
function coverImage(imageBase64,coverName){
 const image=Buffer.from(String(imageBase64||''),'base64');
 if(image.length<12||image.length>2*1024*1024)throw Error('Couverture : maximum 2 Mo.');
 const ext=String(coverName||'').toLowerCase().match(/\.(png|jpe?g|webp)$/)?.[1];
 const valid=ext==='png'&&image.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||
  (ext==='jpg'||ext==='jpeg')&&image.subarray(0,3).equals(Buffer.from('ffd8ff','hex'))||
  ext==='webp'&&image.toString('ascii',0,4)==='RIFF'&&image.toString('ascii',8,12)==='WEBP';
 if(!valid)throw Error('Choisis une vraie image PNG, JPG ou WebP.');
 return {bytes:image,filename:'couverture-portail.'+(ext==='jpeg'?'jpg':ext)};
}
function applyPresentationOverlays(){
 for(const game of catalog.values()){
  const base=path.join(UPLOADS,game.storageId||game.id);
  const metaFile=path.join(base,'_presentation_portail.json');
  if(!fs.existsSync(metaFile))continue;
  try{
   const data=JSON.parse(fs.readFileSync(metaFile,'utf8'));
   const validated=safePresentation(data);
   Object.assign(game,validated);
   if(Object.prototype.hasOwnProperty.call(data,'cover')){
    const file=String(data.cover||'');
    if(!file)game.cover=null;
    else if(/^couverture-portail\.(png|jpg|jpeg|webp)$/.test(file)){
     const location=path.join(base,file);
     if(fs.existsSync(location)){
      const bytes=fs.readFileSync(location);
      if(bytes.length<=2*1024*1024){game.files.set(file,bytes);game.cover=file}
     }
    }else if(game.files.has(file)){game.cover=file}
   }
  }catch(err){console.warn('Fiche portail ignorée pour',game.id,err.message)}
 }
}
function checkAdminOrigin(req){
 const origin=req.headers.origin;
 if(!origin)return true;const host=req.headers['x-forwarded-host']||req.headers.host||'';
 try{return new URL(origin).host===host}catch(_){return false}
}
function githubHeaders(){return {Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Portail-Jeux-Perso','Content-Type':'application/json'}}
async function githubSaveFile(target,content,message){
 const repo=process.env.GITHUB_REPOSITORY,branch=process.env.GITHUB_BRANCH||'main';
 const url=`https://api.github.com/repos/${repo}/contents/${target}`;
 const headers=githubHeaders();
 const found=await fetch(url+'?ref='+encodeURIComponent(branch),{headers,signal:AbortSignal.timeout(15000)});
 let sha;
 if(found.ok){const j=await found.json();if(j.type!=='file'||!j.sha)throw Error('Chemin GitHub non modifiable.');sha=j.sha}
 else if(found.status!==404)throw Error('GitHub : vérification impossible ('+found.status+').');
 const payload={message,content:content.toString('base64'),branch};if(sha)payload.sha=sha;
 const saved=await fetch(url,{method:'PUT',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
 if(!saved.ok){const x=await saved.json().catch(()=>({}));throw Error('GitHub : '+saved.status+' '+cleanText(x.message||'Vérifie ton jeton et ses permissions.'))}
 return {path:target,sha:(await saved.json()).content?.sha};
}

async function githubUpload({name,filename,content}){
 // Le NOM DU FICHIER importé détermine le nom du sous-dossier. Le titre du jeu reste libre.
 const slug=asSlug(filename.replace(/\.(zip|html?)$/i,''));
 if(!slug)throw Error('Le nom du fichier doit contenir au moins une lettre ou un chiffre.');
 if(['marvel-fusion','lost-cities-duel'].includes(slug)||catalog.has(slug)){
  const e=Error('Un jeu utilise déjà ce nom de fichier. Renomme ton fichier avant de réessayer.');e.status=409;throw e;
 }
 const folder=`uploads/${slug}`;
 const target=`${folder}/${slug}.zip`;
 const repository=process.env.GITHUB_REPOSITORY,branch=process.env.GITHUB_BRANCH||'main';
 const root=`https://api.github.com/repos/${repository}/contents/`;
 const endpoint=root+target;
 const headers={Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Portail-Jeux-Perso','Content-Type':'application/json'};
 // Empêche de mélanger deux jeux dans un même sous-dossier, même si le serveur n'a pas encore été redéployé.
 const get=await fetch(root+folder+'?ref='+encodeURIComponent(branch),{headers,signal:AbortSignal.timeout(15000)});
 if(get.status===200){const e=Error('Un dossier existe déjà pour ce fichier sur GitHub. Renomme ton fichier et réessaie.');e.status=409;throw e;}
 if(get.status!==404)throw Error('GitHub ne répond pas à la vérification ('+get.status+'). Vérifie le dépôt et le jeton.');
 const payload={message:`Ajouter le jeu ${slug} dans son dossier uploads`,content:content.toString('base64'),branch};
 const resp=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
 if(!resp.ok){const error=await resp.json().catch(()=>({}));throw Error(`GitHub a refusé l'envoi (${resp.status}) : ${cleanText(error.message||'Vérifie les permissions Contents: Read and write du jeton.')}`)}
 return {slug,folder:folder+'/',path:target};
}
function gameUpload({name,description,category,icon,filename,base64,coverBase64,coverName}){
 const binary=Buffer.from(String(base64||''),'base64');
 if(!binary.length||binary.length>MAX_ARCHIVE)throw Error('Le fichier de jeu doit faire au maximum 20 Mo.');
 if(!/\.(zip|html?)$/i.test(filename))throw Error('Fichier accepté : HTML ou ZIP.');
 const files=fromUpload(filename,binary);
 for(const key of files.keys())if(key.startsWith('.')||key.split('/').some(piece=>piece.startsWith('.')))files.delete(key);
 // Rendre visible la fiche sur le portail sans modifier le code HTML du jeu.
 const info={title:cleanText(name).slice(0,80),description:cleanText(description).slice(0,130)||'Un jeu à découvrir sur le portail.',category:cleanText(category).slice(0,55)||'Jeux HTML',icon:cleanText(icon).slice(0,6)||'🎮'};
 if(!info.title)throw Error('Choisis un nom pour ton jeu.');
 if(coverBase64){
  const image=Buffer.from(String(coverBase64),'base64');
  if(image.length<12||image.length>2*1024*1024)throw Error('Image de couverture limitée à 2 Mo.');
  const extension=String(coverName||'').toLowerCase().match(/\.(png|jpe?g|webp)$/)?.[1];
  const recognized=extension==='png'&&image.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) ||
    (extension==='jpg'||extension==='jpeg')&&image.subarray(0,3).equals(Buffer.from('ffd8ff','hex')) ||
    extension==='webp'&&image.toString('ascii',0,4)==='RIFF'&&image.toString('ascii',8,12)==='WEBP';
  if(!recognized)throw Error('Utilise une couverture PNG, JPG ou WebP valide.');
  info.cover='_couverture_portail.'+(extension==='jpeg'?'jpg':extension);
  files.set(info.cover,image);
 }
 files.set('_portail_jeu.json',Buffer.from(JSON.stringify(info),'utf8'));
 return packZip(files);
}

const publicRoot=path.join(ROOT,'public');
const handlers=marvelServer.listeners('request');
// Route dédiée pour Marvel Splendor. Ne charger QUE le fichier demandé :
// les cinq parties JSON (~75 Mo en tout) ne passent jamais dans catalog.files.
function serveSplendor(req,res,relative){
 if(!fs.existsSync(SPLENDOR_FOLDER))return respond(res,404,'Marvel Splendor non installé.','text/plain; charset=utf-8');
 let name;
 try{name=decodeURIComponent(relative||'index.html')}catch(_){return respond(res,400,'Chemin invalide.','text/plain; charset=utf-8')}
 if(!name||name.endsWith('/'))name+='index.html';
 if(!pathSafe(name)||name.startsWith('.')||name.split('/').some(x=>!x||x.startsWith('.')||x==='..')||name.includes('\\'))
  return respond(res,403,'Chemin interdit.','text/plain; charset=utf-8');
 const pathname=path.resolve(SPLENDOR_FOLDER,name);
 // Les liens symboliques ne peuvent pas permettre de sortir du dossier du jeu.
 let real,root,stat;
 try{
  root=fs.realpathSync(SPLENDOR_FOLDER);
  real=fs.realpathSync(pathname);
  if(real!==root&&!real.startsWith(root+path.sep))return respond(res,403,'Chemin interdit.','text/plain; charset=utf-8');
  stat=fs.statSync(real);
 }catch(_){return respond(res,404,'Ressource introuvable : '+name,'text/plain; charset=utf-8')}
 if(!stat.isFile())return respond(res,404,'Fichier introuvable.','text/plain; charset=utf-8');
 const ext=path.extname(real).toLowerCase();
 const contentType=mime[ext];
 if(!contentType||['.js','.mjs','.html','.htm','.css','.svg','.png','.jpg','.jpeg','.gif','.webp','.ico','.mp3','.wav','.ogg','.mp4','.webm','.json','.wasm','.woff2','.woff','.ttf','.txt'].includes(ext)===false)
  return respond(res,403,'Type de fichier non publié.','text/plain; charset=utf-8');
 res.writeHead(200,{'Content-Type':contentType,'Content-Length':stat.size,
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',
  'Cross-Origin-Resource-Policy':'same-origin',
  'Cache-Control':(ext==='.html'||ext==='.json'||name.startsWith('marvel-splendor-assets.part-'))?'no-store':'public, max-age=300'});
 const source=fs.createReadStream(real);
 source.on('error',e=>{console.error('Fichier Splendor :',e.message);res.destroy(e)});
 source.pipe(res);
}
const server=http.createServer(async (req,res)=>{
 try{
   const url=new URL(req.url||'/','http://localhost'); const pn=url.pathname;
   if(pn==='/health'){return json(res,200,{ok:true,portal:true,games:catalog.size,marvelOnline:true});}
   if(pn==='/access'&&req.method==='POST'&&siteCode){
     const body=await read(req,4096),code=new URLSearchParams(body.toString()).get('code')||'';
     if(!equal(code,siteCode))return respond(res,403,loginPage(true));
     const exp=String(Date.now()+30*24*60*60*1000),mac=crypto.createHmac('sha256',sigKey).update(exp).digest('hex');
     res.writeHead(303,{Location:'/', 'Set-Cookie':`jeu_session=${exp}.${mac}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${req.headers['x-forwarded-proto']==='https'?'; Secure':''}`});return res.end();
   }
   if(!userAllowed(req))return respond(res,403,loginPage());
   // Le serveur Lost Cities partage ce même port : réécriture interne du seul préfixe.
   // /api/create et /api/state restent réservés à MARVEL FUSION, sans collision.
   if(pn.startsWith('/api/lost-cities/')){
     req.url='/api/'+req.url.slice('/api/lost-cities/'.length);
     return lostCitiesHandler.call(lostCitiesServer,req,res);
   }
   if(req.method==='GET'&&pn==='/api/portal/games'){
     return json(res,200,{games:[...catalog.values()].map(({files,...meta})=>meta),settings:portalSettings(),adminAvailable:adminConfigured(),repository:process.env.GITHUB_REPOSITORY||'',errors:errors.length?errors:undefined});
   }
   if(req.method==='POST'&&(pn==='/api/portal/editor/save'||pn==='/api/portal/settings/save')){
    if(!adminConfigured())return json(res,503,{error:'Configure ADMIN_PASSWORD, GITHUB_TOKEN et GITHUB_REPOSITORY sur Render pour utiliser l’administration.'});
    if(!checkAdminOrigin(req))return json(res,403,{error:'Requête provenant d’un autre site refusée.'});
    let payload;
    try{payload=JSON.parse((await read(req,3*1024*1024)).toString('utf8'))}catch(_){return json(res,400,{error:'Données invalides ou trop volumineuses.'})}
    if(!equal(payload.password,process.env.ADMIN_PASSWORD))return json(res,403,{error:'Mot de passe administrateur incorrect.'});
    if(pn==='/api/portal/settings/save'){
     const settings=safeSettings(payload.settings);
     const saved=await githubSaveFile('portal-settings.json',Buffer.from(JSON.stringify(settings,null,2)+'\n'),'Modifier les paramètres du portail');
     return json(res,200,{ok:true,settings,path:saved.path,message:'Paramètres enregistrés sur GitHub. Ils apparaîtront après le redéploiement Render.'});
    }
    const id=String(payload.id||'');const game=catalog.get(id);
    if(!game||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))return json(res,404,{error:'Jeu introuvable.'});
    const info=safePresentation(payload);
    const folderId=game.storageId||id;
    const coverAction=payload.coverAction||'keep';
    if(!['keep','replace','remove'].includes(coverAction))throw Error('Option de couverture invalide.');
    // Toujours dans le dossier du jeu : uploads/identifiant-du-jeu/couverture-portail.ext.
    // Les ZIP existants restent intacts, y compris MARVEL et LOST CITIES.
    let cover=game.cover||'';
    if(coverAction==='remove')cover='';
    if(coverAction==='replace'){
     const image=coverImage(payload.coverBase64,payload.coverName);
     cover=image.filename;
     await githubSaveFile(`uploads/${folderId}/${image.filename}`,image.bytes,`Couverture du jeu ${id}`);
    }
    const meta={...info,cover};
    const saved=await githubSaveFile(`uploads/${folderId}/_presentation_portail.json`,Buffer.from(JSON.stringify(meta,null,2)+'\n'),`Modifier la présentation du jeu ${id}`);
    return json(res,200,{ok:true,path:saved.path,coverPath:coverAction==='replace'?`uploads/${folderId}/${cover}`:null,message:'Fiche enregistrée sur GitHub. Elle sera visible après le redéploiement de Render.'});
   }
   if(req.method==='POST'&&pn==='/api/portal/upload'){
      if(!adminConfigured())return json(res,503,{error:'Envoi direct non configuré : utilise GitHub > uploads > Add file > Upload files.'});
      const origin=req.headers.origin;
      if(origin){const targetHost=req.headers['x-forwarded-host']||req.headers.host||'';try{if(new URL(origin).host!==targetHost)return json(res,403,{error:'Envoi depuis un autre site refusé.'})}catch(_){return json(res,403,{error:'Origine invalide.'})}}
      const raw=await read(req,34*1024*1024);let data;
      try{data=JSON.parse(raw.toString('utf8'))}catch{throw Error('Requête invalide.')}
      if(!equal(data.password,process.env.ADMIN_PASSWORD))return json(res,403,{error:'Mot de passe administrateur incorrect.'});
      // L'image et les renseignements du jeu sont inclus dans le même ZIP : un seul commit GitHub.
      const filename=path.basename(String(data.filename||''));
      const packed=gameUpload({name:data.name,description:data.description,category:data.category,icon:data.icon,filename,base64:data.base64,coverBase64:data.coverBase64,coverName:data.coverName});
      const written=await githubUpload({name:data.name,filename,content:packed});
      return json(res,201,{ok:true,...written,message:'Ton jeu a été envoyé sur GitHub. Il apparaîtra sur le portail après le redéploiement de Render.'});
   }
   if(req.method==='GET'&&(pn==='/'||pn==='/index.html')){
      return respond(res,200,fs.readFileSync(path.join(publicRoot,'index.html')),mime['.html'],{'Cache-Control':'no-cache'});
   }
   if(req.method==='GET'&&pn==='/styles.css')return respond(res,200,fs.readFileSync(path.join(publicRoot,'styles.css')),mime['.css']);
   if(req.method==='GET'&&pn==='/portal.js')return respond(res,200,fs.readFileSync(path.join(publicRoot,'portal.js')),mime['.js'],{'Cache-Control':'no-cache'});
   // Ancienne adresse Render : la garder comme alias, pour les favoris existants.
   if(req.method==='GET'&&(pn==='/games/marvel-splendor'||pn.startsWith('/games/marvel-splendor/'))){
    const suffix=pn.slice('/games/marvel-splendor'.length);
    res.writeHead(302,{Location:'/games/splendor'+(suffix||'/')+url.search,'Cache-Control':'no-store'});
    return res.end();
   }
   if(req.method==='GET'&&(pn==='/games/splendor'||pn.startsWith('/games/splendor/'))){
    if(pn==='/games/splendor'){res.writeHead(302,{Location:'/games/splendor/'+url.search,'Cache-Control':'no-store'});return res.end();}
    return serveSplendor(req,res,pn.slice('/games/splendor/'.length));
   }
   // UNO PARTY V3 — début route statique isolée
if((req.method==='GET'||req.method==='HEAD')&&(pn==='/games/uno'||pn.startsWith('/games/uno/'))){
  return require('./uno-server/static').serveUnoStatic(req,res,pn);
}
// UNO PARTY V3 — fin route statique isolée

if(req.method==='GET'&&pn.startsWith('/games/')){
     const segments=pn.slice('/games/'.length).split('/');
     const id=segments.shift(),game=catalog.get(id);
     if(!game)return respond(res,404,'Jeu introuvable.','text/plain; charset=utf-8');
     let filepath=segments.map(s=>decodeURIComponent(s)).join('/')||'index.html';
     if(filepath.endsWith('/'))filepath+='index.html';
     if(!pathSafe(filepath) || filepath.startsWith('.') || filepath.split('/').some(s=>s.startsWith('.')))return respond(res,403,'Chemin interdit.','text/plain; charset=utf-8');
     const content=game.files.get(filepath);
     if(!content)return respond(res,404,'Fichier introuvable : '+filepath,'text/plain; charset=utf-8');
     if(/(^|\/)(server\.js|package(-lock)?\.json|LANCER_WINDOWS\.bat)$/i.test(filepath)||filepath.startsWith('tests/'))return respond(res,404,'Fichier non publié.','text/plain; charset=utf-8');
     const type=mime[path.extname(filepath).toLowerCase()]||'application/octet-stream';
     return respond(res,200,content,type,{'Cache-Control':(filepath==='index.html'||filepath==='version.txt'||filepath==='medias-par-defaut-version.json'||filepath.startsWith('medias/'))?'no-store':'public, max-age=300','Cross-Origin-Resource-Policy':'same-origin'});
   }
   // API de MARVEL FUSION conservée, même logique de jeu en local et à distance.
   if(pn.startsWith('/api/') || ['/solo','/solo.html','/jeu','/play','/diagnostic','/favicon.ico'].includes(pn)){
      return handlers[0].call(marvelServer,req,res);
   }
   return respond(res,404,'Page introuvable.','text/plain; charset=utf-8');
 }catch(e){console.error('Erreur portail:',e.message);if(!res.headersSent)json(res,e.status||((e.message.includes('volumineux')||e.message.includes('dépasse 20 Mo'))?413:400),{error:e.message||'Erreur du serveur.'})}
});
if(require.main===module)require('./uno-server/native').installUnoNative(server,userAllowed).then(()=>server.listen(PORT,'0.0.0.0',()=>{
 console.log(`\n🎮 PORTAIL DE JEUX — http://localhost:${PORT}`);
 console.log(`   ${catalog.size} jeu(x) disponibles. MARVEL FUSION : /games/marvel-fusion/`);
 console.log(`   Déploiement Render : HTTPS public, sans redirection de port.`);
 console.log(`   Ajout direct depuis le portail : ${adminConfigured()?'activé':'optionnel, non configuré'}`);
 if(errors.length)console.warn('Jeux ignorés :',errors.join('; '));
})).catch(err=>{console.error('[UNO] Erreur de démarrage :',err);process.exitCode=1;});

module.exports={server,catalog,discoverGames,metadata,adminConfigured};
