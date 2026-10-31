'use strict';
const byId=(id)=>document.getElementById(id);
let storedGames=[],repo='',canUpload=false;
function node(tag,attrs={},contents=''){
 const el=document.createElement(tag);
 for(const [key,value] of Object.entries(attrs)){
   if(key==='class')el.className=value;
   else if(key==='style')el.style.setProperty('--accent',value);
   else el.setAttribute(key,value);
 }
 if(contents)el.textContent=contents;
 return el;
}
function showGames(query=''){
 const grid=byId('gameGrid');grid.replaceChildren();
 const filtered=storedGames.filter(g=>(g.title+' '+g.description+' '+g.category).toLowerCase().includes(query.toLowerCase()));
 if(!filtered.length){grid.append(node('div',{class:'no-games'},'Aucun jeu ne correspond à ta recherche.'));return}
 for(const g of filtered){
  const card=node('article',{class:'game-card'});
  const art=node('div',{class:'game-art',style:g.accent||'#a4fbd6'});
  art.append(node('span',{class:'game-tag'},g.multiplayer?'● EN LIGNE + SOLO':'✦ JEU HTML'));
  if(g.cover){const img=node('img',{src:`/games/${encodeURIComponent(g.id)}/${g.cover}`,alt:''});img.loading='lazy';art.append(img)}
  else art.append(node('span',{class:'game-icon','aria-hidden':'true'},g.icon||'🎮'));
  card.append(art);
  const body=node('div',{class:'game-body'});
  body.append(node('div',{class:'game-category'},g.category));body.append(node('h3',{},g.title));body.append(node('p',{class:'game-description'},g.description));
  const bottom=node('div',{class:'card-bottom'});
  bottom.append(node('span',{class:'card-meta'},g.multiplayer?'1–2 joueurs · navigateur':'Jouer dans le navigateur'));
  const a=node('a',{class:'play-link',href:`/games/${encodeURIComponent(g.id)}/`},'Jouer  ↗');
  bottom.append(a);body.append(bottom);card.append(body);grid.append(card);
 }
}
async function loadPortal(){
 try{
  const res=await fetch('/api/portal/games',{cache:'no-store'});if(!res.ok)throw Error('Serveur indisponible.');
  const data=await res.json();storedGames=data.games||[];repo=data.repository||'';canUpload=!!data.adminAvailable;
  byId('gameCount').textContent='· '+storedGames.length+' jeu'+(storedGames.length>1?'x':'');
  byId('adminConfigured').hidden=!canUpload;byId('adminManual').hidden=canUpload;
  if(repo)byId('githubUploadLink').href=`https://github.com/${repo}/upload/HEAD/uploads`;
  showGames();
 }catch(e){byId('gameGrid').replaceChildren(node('div',{class:'no-games'},'Le serveur ne répond pas : '+e.message))}
}
byId('search').addEventListener('input',e=>showGames(e.target.value));
byId('adminOpen').addEventListener('click',()=>byId('adminModal').showModal());
const up=id=>byId(id), MAX_GAME=20*1024*1024, MAX_COVER=2*1024*1024;
let coverPreviewUrl=null,uploadPoll=null;
function uploadFileSlug(filename){return String(filename||'').replace(/\.(zip|html?)$/i,'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55)}
function preview(){
 const file=up('uploadFile').files[0];up('uploadPreview').hidden=!file;
 const slug=uploadFileSlug(file?.name||'');up('uploadFolderHint').hidden=!slug;
 up('uploadFolderPath').textContent=slug?`uploads/${slug}/${slug}.zip`:'';
 up('uploadPreviewTitle').textContent=up('uploadName').value.trim()||file?.name||'Mon jeu';
 up('uploadPreviewDescription').textContent=up('uploadDescription').value.trim()||'Un jeu à découvrir sur le portail.';
 up('uploadPreviewIcon').textContent=up('uploadIcon').value;
 up('uploadPreviewIcon').hidden=!!coverPreviewUrl;
 const img=up('uploadCoverImage');img.hidden=!coverPreviewUrl;
 if(coverPreviewUrl)img.src=coverPreviewUrl;else img.removeAttribute('src');
}
function fileChanged(file){if(!file)return;
 up('fileLabel').textContent=file.name+' · '+(file.size/(1024*1024)).toFixed(2)+' Mo';
 if(!up('uploadName').value.trim())up('uploadName').value=file.name.replace(/\.(zip|html?)$/i,'').replace(/[-_]+/g,' ').trim();
 if(file.size>MAX_GAME)message('Le jeu dépasse 20 Mo. Compresse les images et sons avant de réessayer.',true);
 else message('');
 preview();
}
function message(text,isError=false){up('uploadStatus').textContent=text;up('uploadStatus').classList.toggle('error',isError)}
up('uploadFile').addEventListener('change',e=>fileChanged(e.target.files[0]));
for(const id of ['uploadName','uploadDescription','uploadIcon'])up(id).addEventListener('input',preview);
up('uploadCover').addEventListener('change',e=>{
 if(coverPreviewUrl)URL.revokeObjectURL(coverPreviewUrl);coverPreviewUrl=null;
 const file=e.target.files[0];if(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_COVER){message('Couverture : PNG, JPG ou WebP, 2 Mo maximum.',true);e.target.value=''}
  else{coverPreviewUrl=URL.createObjectURL(file);message('')}
 }preview();
});
const zone=up('dropZone');
for(const t of ['dragenter','dragover'])zone.addEventListener(t,e=>{e.preventDefault();zone.classList.add('over')});
for(const t of ['dragleave','drop'])zone.addEventListener(t,e=>{e.preventDefault();zone.classList.remove('over')});
zone.addEventListener('drop',e=>{const file=e.dataTransfer.files[0];if(!file)return;const dt=new DataTransfer();dt.items.add(file);up('uploadFile').files=dt.files;fileChanged(file)});
const toBase64=async(file)=>{const bytes=new Uint8Array(await file.arrayBuffer());const chunks=[];for(let i=0;i<bytes.length;i+=0x8000)chunks.push(String.fromCharCode(...bytes.subarray(i,i+0x8000)));return btoa(chunks.join(''))};
async function watchPublished(slug){
 if(uploadPoll)clearInterval(uploadPoll);
 let checks=0;
 const check=async()=>{
  checks++;try{
   const r=await fetch('/api/portal/games',{cache:'no-store'});
   if(r.ok){const data=await r.json();if((data.games||[]).some(g=>g.id===slug)){
    clearInterval(uploadPoll);uploadPoll=null;
    await loadPortal();
    up('uploadResultTitle').textContent='✅ Ton jeu est maintenant en ligne !';
    up('uploadResultInfo').textContent='Il apparaît dans la bibliothèque et tes visiteurs peuvent y jouer.';
    up('uploadResultLink').href='/games/'+encodeURIComponent(slug)+'/';up('uploadResultLink').hidden=false;
   }}
  }catch(_){} // Render peut temporairement redémarrer après la publication GitHub.
  if(checks>=36&&uploadPoll){clearInterval(uploadPoll);uploadPoll=null;up('uploadResultInfo').textContent='Le jeu a bien été envoyé sur GitHub. Si Render n’a pas encore terminé, recharge le portail après son redéploiement.'}
 };
 uploadPoll=setInterval(check,5000);
}
up('uploadForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const file=up('uploadFile').files[0],cover=up('uploadCover').files[0],name=up('uploadName').value.trim();
 if(!file||!name)return;
 if(file.size>MAX_GAME)return message('Le jeu dépasse 20 Mo.',true);
 if(!/\.(zip|html?)$/i.test(file.name))return message('Formats acceptés : .html, .htm ou .zip.',true);
 if(cover&&cover.size>MAX_COVER)return message('L’image dépasse 2 Mo.',true);
 const btn=up('sendUpload');btn.disabled=true;btn.textContent='Publication en cours…';up('uploadResult').hidden=true;
 message('Lecture du jeu puis envoi sécurisé à GitHub…');
 try{
  const req={name,description:up('uploadDescription').value.trim(),category:up('uploadCategory').value,icon:up('uploadIcon').value,
    filename:file.name,password:up('uploadPassword').value,base64:await toBase64(file)};
  if(cover){req.coverName=cover.name;req.coverBase64=await toBase64(cover)}
  const res=await fetch('/api/portal/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)});
  const result=await res.json();if(!res.ok)throw Error(result.error||'Erreur lors de la publication.');
  message('✅ Envoi réussi. Attente de la mise en ligne par Render…');
  up('uploadResult').hidden=false;up('uploadResultTitle').textContent='🚀 Ton jeu est envoyé sur GitHub !';
  up('uploadResultInfo').textContent='📁 Rangé dans '+result.folder+' sur GitHub. Render va actualiser le portail automatiquement.';
  up('uploadResultLink').hidden=true;
  up('uploadForm').reset();up('fileLabel').textContent='Choisir ou glisser ton jeu HTML / ZIP';
  if(coverPreviewUrl)URL.revokeObjectURL(coverPreviewUrl);coverPreviewUrl=null;preview();
  watchPublished(result.slug);
 }catch(error){message(error.message,true)}
 finally{btn.disabled=false;btn.textContent='🚀 Ajouter le jeu au portail ↗'}
});
loadPortal();
