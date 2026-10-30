'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fromUpload,pathSafe,MAX_ARCHIVE}=require('./zip-games');
const {server:marvelServer}=require('./marvel/server');
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
function discoverGames(){
 if(!fs.existsSync(UPLOADS))fs.mkdirSync(UPLOADS,{recursive:true});
 const files=fs.readdirSync(UPLOADS).filter(x=>/\.(zip|html?|htm)$/i.test(x)).sort();
 let total=0;
 for(const filename of files){
   try{const id=asSlug(filename.replace(/\.(zip|html?)$/i,''));if(!id||catalog.has(id))throw Error('Nom de jeu en double.');
     const bytes=fs.readFileSync(path.join(UPLOADS,filename));if(bytes.length>MAX_ARCHIVE)throw Error('Archive de plus de 20 Mo.');
     const content=fromUpload(filename,bytes);total+=[...content.values()].reduce((n,b)=>n+b.length,0);if(total>90*1024*1024)throw Error('Limite mémoire des jeux atteinte.');
     const given=presets[id]||{}; const meta=metadata(content,id.replaceAll('-',' '));
     catalog.set(id,{id,files:content,title:given.title||meta.title,description:given.description||meta.description,category:given.category||'Jeux HTML',icon:given.icon||'🎮',accent:given.accent||'#64dbe3',cover:meta.cover,multiplayer:!!given.multiplayer,featured:!!given.featured});
   }catch(e){errors.push(`${filename}: ${e.message}`);console.error('Jeu ignoré :',filename,e.message)}
 }
}
discoverGames();
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
   const staged=[];const hash=crypto.createHash('sha256');let grandTotal=0;
   for(const {filename,filepath,kind} of sourceFiles){
    const bytes=fs.readFileSync(filepath);grandTotal+=bytes.length;
    if(grandTotal>120*1024*1024)throw Error('Pack de médias trop volumineux (120 Mio maximum).');
    const parsed=JSON.parse(bytes.toString('utf8'));
    if(kind==='medias'){
     if(parsed.format!=='marvel-fusion-media-pack-v1'||parsed.version!==1||!Array.isArray(parsed.assets))throw Error(filename+' : format de pack médias invalide.');
     if(parsed.assets.length>600)throw Error(filename+' : trop de médias.');
    }else if(!(Array.isArray(parsed.assets)&&parsed.links&&typeof parsed.links==='object')){
     throw Error(filename+' : atelier de cartes invalide.');
    }
    const uri='medias/'+filename;
    staged.push({uri,bytes});hash.update(filename).update(bytes);
   }
   for(const {uri,bytes} of staged)gameMarvel.files.set(uri,bytes);
   hostedMediaInfo={available:true,kind:sourceFiles[0].kind,sha256:hash.digest('hex'),parts:staged.map(s=>s.uri),error:null};
   console.log('Médias MARVEL FUSION : '+staged.length+' fichier(s), '+(grandTotal/1048576).toFixed(1)+' Mio, installation automatique.');
  }else console.log('Médias MARVEL FUSION : aucun pack publié dans uploads/marvel-medias/.');
 }catch(err){hostedMediaInfo.error=err.message;console.error('Médias MARVEL FUSION :',err.message)}
 gameMarvel.files.set('medias-par-defaut-version.json',Buffer.from(JSON.stringify(hostedMediaInfo)));
}
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
async function githubUpload({name,filename,content}){
 const slug=asSlug(name||filename.replace(/\.[^.]+$/,''));if(!slug)throw Error('Donne un nom au jeu.');
 const ext=filename.toLowerCase().endsWith('.zip')?'zip':'html';
 const target=`uploads/${slug}.${ext}`;
 const repository=process.env.GITHUB_REPOSITORY,branch=process.env.GITHUB_BRANCH||'main';
 const endpoint=`https://api.github.com/repos/${repository}/contents/${target}`;
 const headers={Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Portail-Jeux-Perso','Content-Type':'application/json'};
 let sha;
 const get=await fetch(endpoint+'?ref='+encodeURIComponent(branch),{headers});
 if(get.status===200){sha=(await get.json()).sha}
 else if(get.status!==404)throw Error('Impossible de vérifier le dépôt GitHub ('+get.status+').');
 const payload={message:`Ajouter ou actualiser le jeu ${slug}`,content:content.toString('base64'),branch};
 if(sha)payload.sha=sha;
 const resp=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify(payload)});
 if(!resp.ok){const error=await resp.json().catch(()=>({}));throw Error(`GitHub a refusé l'envoi (${resp.status}) : ${cleanText(error.message||'Vérifie les permissions Contents: Read and write du jeton.')}`)}
 return {slug,overwrite:!!sha};
}
const publicRoot=path.join(ROOT,'public');
const handlers=marvelServer.listeners('request');
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
   if(req.method==='GET'&&pn==='/api/portal/games'){
     return json(res,200,{games:[...catalog.values()].map(({files,...meta})=>meta),adminAvailable:adminConfigured(),repository:process.env.GITHUB_REPOSITORY||'',errors:errors.length?errors:undefined});
   }
   if(req.method==='POST'&&pn==='/api/portal/upload'){
      if(!adminConfigured())return json(res,503,{error:'Envoi direct non configuré : utilise GitHub > uploads > Add file > Upload files.'});
      const raw=await read(req,23*1024*1024);let data;
      try{data=JSON.parse(raw.toString('utf8'))}catch{throw Error('Requête invalide.')}
      if(!equal(data.password,process.env.ADMIN_PASSWORD))return json(res,403,{error:'Mot de passe administrateur incorrect.'});
      const name=cleanText(data.name),filename=path.basename(String(data.filename||''));
      if(!/\.(zip|html?)$/i.test(filename))throw Error('Seuls les fichiers HTML et ZIP sont acceptés.');
      const binary=Buffer.from(String(data.base64||''),'base64');
      if(!binary.length||binary.length>MAX_ARCHIVE)throw Error('Jeu vide ou trop volumineux (20 Mo maximum).');
      fromUpload(filename,binary); // Valide le jeu AVANT d’enregistrer sa version définitive.
      const written=await githubUpload({name,filename,content:binary});
      return json(res,200,{ok:true,...written,message:'Jeu envoyé à GitHub. Render le publiera automatiquement après son redéploiement.'});
   }
   if(req.method==='GET'&&(pn==='/'||pn==='/index.html')){
      return respond(res,200,fs.readFileSync(path.join(publicRoot,'index.html')),mime['.html'],{'Cache-Control':'no-cache'});
   }
   if(req.method==='GET'&&pn==='/styles.css')return respond(res,200,fs.readFileSync(path.join(publicRoot,'styles.css')),mime['.css']);
   if(req.method==='GET'&&pn==='/portal.js')return respond(res,200,fs.readFileSync(path.join(publicRoot,'portal.js')),mime['.js']);
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
 }catch(e){console.error('Erreur portail:',e.message);if(!res.headersSent)json(res,e.message.includes('volumineux')?413:400,{error:e.message||'Erreur du serveur.'})}
});
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>{
 console.log(`\n🎮 PORTAIL DE JEUX — http://localhost:${PORT}`);
 console.log(`   ${catalog.size} jeu(x) disponibles. MARVEL FUSION : /games/marvel-fusion/`);
 console.log(`   Déploiement Render : HTTPS public, sans redirection de port.`);
 console.log(`   Ajout direct depuis le portail : ${adminConfigured()?'activé':'optionnel, non configuré'}`);
 if(errors.length)console.warn('Jeux ignorés :',errors.join('; '));
});
module.exports={server,catalog,discoverGames,metadata,adminConfigured};
