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
byId('uploadFile').addEventListener('change',e=>{
 const f=e.target.files[0];if(!f)return;byId('fileLabel').textContent=f.name;
 if(!byId('uploadName').value)byId('uploadName').value=f.name.replace(/\.(zip|html?)$/i,'').replace(/[-_]+/g,' ');
});
const zone=byId('dropZone');
for(const t of ['dragenter','dragover'])zone.addEventListener(t,e=>{e.preventDefault();zone.classList.add('over')});
for(const t of ['dragleave','drop'])zone.addEventListener(t,e=>{e.preventDefault();zone.classList.remove('over')});
zone.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(!f)return;const dt=new DataTransfer();dt.items.add(f);byId('uploadFile').files=dt.files;byId('uploadFile').dispatchEvent(new Event('change'))});
const toBase64=async(file)=>{
 const bytes=new Uint8Array(await file.arrayBuffer());let chunks=[];
 for(let i=0;i<bytes.length;i+=0x8000)chunks.push(String.fromCharCode(...bytes.subarray(i,i+0x8000)));
 return btoa(chunks.join(''));
};
byId('uploadForm').addEventListener('submit',async e=>{
 e.preventDefault();const file=byId('uploadFile').files[0],password=byId('uploadPassword').value,name=byId('uploadName').value.trim(),status=byId('uploadStatus');
 if(!file||!name)return;if(file.size>20*1024*1024){status.textContent='Fichier trop volumineux (20 Mo maximum).';status.classList.add('error');return}
 const button=byId('sendUpload');button.disabled=true;button.textContent='Envoi du jeu…';status.classList.remove('error');status.textContent='Préparation du fichier…';
 try{
   const base64=await toBase64(file);
   const res=await fetch('/api/portal/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,filename:file.name,password,base64})});
   const result=await res.json();if(!res.ok)throw Error(result.error||'Erreur lors de la publication.');
   status.textContent='✓ '+result.message+' Le nouveau jeu apparaîtra après quelques instants.';
   byId('uploadForm').reset();byId('fileLabel').textContent='Choisir ou glisser un fichier HTML / ZIP';
 }catch(err){status.classList.add('error');status.textContent=err.message}
 finally{button.disabled=false;button.textContent='Publier le jeu ↗'}
});
loadPortal();
