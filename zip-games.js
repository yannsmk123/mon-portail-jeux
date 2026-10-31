'use strict';
// Lecteur ZIP sûr, sans dépendances : uniquement les formats ZIP usuels (stocké et deflate).
const zlib = require('node:zlib');
const MAX_ARCHIVE = 20 * 1024 * 1024;
const MAX_TOTAL = 45 * 1024 * 1024;
const MAX_FILES = 1300;
const MAX_FILE = 20 * 1024 * 1024;
function pathSafe(p) {
  if (!p || p.includes('\0') || p.includes('\\') || p.startsWith('/') || /^[a-z]:/i.test(p)) return false;
  const pieces = p.split('/');
  return pieces.every(x => x !== '..' && x !== '.');
}
function unpackZip(zip) {
  if (!Buffer.isBuffer(zip) || zip.length < 22 || zip.length > MAX_ARCHIVE) throw Error('Archive ZIP manquante ou trop volumineuse (20 Mo maximum).');
  let eocd = -1;
  for (let p=zip.length-22; p>=Math.max(0,zip.length-65557); p--){if(zip.readUInt32LE(p)===0x06054b50){eocd=p;break}}
  if(eocd<0)throw Error('Archive ZIP invalide.');
  const count=zip.readUInt16LE(eocd+10), start=zip.readUInt32LE(eocd+16);
  if (count > MAX_FILES || start>=zip.length) throw Error('Archive trop grande ou invalide.');
  const result = new Map(); let p = start, total = 0;
  for(let i=0;i<count;i++){
    if(p+46>zip.length || zip.readUInt32LE(p)!==0x02014b50) throw Error('Répertoire ZIP incorrect.');
    const flags=zip.readUInt16LE(p+8),method=zip.readUInt16LE(p+10);
    const compressed=zip.readUInt32LE(p+20),uncompressed=zip.readUInt32LE(p+24);
    const nameLen=zip.readUInt16LE(p+28),extra=zip.readUInt16LE(p+30),comment=zip.readUInt16LE(p+32),offset=zip.readUInt32LE(p+42);
    const end=p+46+nameLen+extra+comment;
    if(end>zip.length) throw Error('Nom de fichier ZIP invalide.');
    const name=zip.subarray(p+46,p+46+nameLen).toString((flags&0x800)?'utf8':'utf8').replace(/\\/g,'/');
    p=end;
    if(name.endsWith('/'))continue;
    if(!pathSafe(name) || name.startsWith('__MACOSX/') || /(^|\/)\.DS_Store$/.test(name))continue;
    if((flags&1) || ![0,8].includes(method)) throw Error('ZIP chiffré ou compression non supportée.');
    if(uncompressed>MAX_FILE || (total+=uncompressed)>MAX_TOTAL) throw Error('Jeu trop volumineux une fois décompressé.');
    if(offset+30>zip.length || zip.readUInt32LE(offset)!==0x04034b50)throw Error('Entrée ZIP invalide.');
    const localLength=zip.readUInt16LE(offset+26),localExtra=zip.readUInt16LE(offset+28);
    const begin=offset+30+localLength+localExtra;
    if(begin+compressed>zip.length)throw Error('Fichier ZIP incomplet.');
    const data=zip.subarray(begin,begin+compressed);
    const raw=method===0?Buffer.from(data):zlib.inflateRawSync(data,{maxOutputLength:MAX_FILE+1});
    if(raw.length!==uncompressed)throw Error('Taille des données ZIP incohérente.');
    result.set(name,raw);
  }
  if(!result.size)throw Error('Archive vide.');
  let html=[...result.keys()].filter(x=>x.toLowerCase().endsWith('/index.html') || x.toLowerCase()==='index.html');
  let root='';
  if(!result.has('index.html')){
    if(html.length){html.sort((a,b)=>a.split('/').length-b.split('/').length);root=html[0].slice(0,-10)}
    else {
      const candidates=[...result.keys()].filter(x=>/\.html?$/i.test(x));
      if(!candidates.length)throw Error('Ce ZIP ne contient aucun fichier HTML.');
      candidates.sort((a,b)=>a.split('/').length-b.split('/').length);root=candidates[0].slice(0,candidates[0].lastIndexOf('/')+1);
    }
  }
  const filtered=new Map();
  for(const [name,buffer] of result){if(!name.startsWith(root))continue;const relative=name.slice(root.length);if(relative && pathSafe(relative))filtered.set(relative,buffer)}
  if(!filtered.has('index.html')){
    const single=[...filtered.keys()].filter(x=>/\.html?$/i.test(x)).sort((a,b)=>a.split('/').length-b.split('/').length)[0];
    if(!single)throw Error('Aucun index.html lisible dans le ZIP.');
    filtered.set('index.html',filtered.get(single));
  }
  return filtered;
}
function fromUpload(filename,buffer){
  if(/\.zip$/i.test(filename))return unpackZip(buffer);
  if(/\.html?$/i.test(filename) && buffer.length<=MAX_FILE){return new Map([['index.html',buffer]])}
  throw Error('Formats autorisés : .zip, .html ou .htm.');
}
// Crée une archive sûre, avec une seule mise à jour GitHub pour le jeu et sa fiche.
function packZip(files){
  if(!(files instanceof Map)||!files.size||files.size>MAX_FILES)throw Error('Jeu vide ou trop de fichiers.');
  const local=[],central=[];let offset=0,total=0;
  function crc32(buffer){let c=~0;for(const n of buffer){c^=n;for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1))}return ~c>>>0}
  for(const [name,entry] of files){
    if(!pathSafe(name)||name.startsWith('.')||name.split('/').some(x=>x.startsWith('.')))throw Error('Nom de fichier invalide dans le jeu.');
    const fn=Buffer.from(name,'utf8'),raw=Buffer.isBuffer(entry)?entry:Buffer.from(entry);
    if(fn.length>500||raw.length>MAX_FILE||(total+=raw.length)>MAX_TOTAL)throw Error('Jeu trop volumineux.');
    const packed=zlib.deflateRawSync(raw,{level:6}),crc=crc32(raw);
    const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50);lh.writeUInt16LE(20,4);lh.writeUInt16LE(0x800,6);lh.writeUInt16LE(8,8);lh.writeUInt32LE(crc,14);lh.writeUInt32LE(packed.length,18);lh.writeUInt32LE(raw.length,22);lh.writeUInt16LE(fn.length,26);
    local.push(lh,fn,packed);
    const cent=Buffer.alloc(46);cent.writeUInt32LE(0x02014b50);cent.writeUInt16LE(20,4);cent.writeUInt16LE(20,6);cent.writeUInt16LE(0x800,8);cent.writeUInt16LE(8,10);cent.writeUInt32LE(crc,16);cent.writeUInt32LE(packed.length,20);cent.writeUInt32LE(raw.length,24);cent.writeUInt16LE(fn.length,28);cent.writeUInt32LE(offset,42);
    central.push(cent,fn);offset+=lh.length+fn.length+packed.length;
  }
  const centralBuf=Buffer.concat(central),eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50);eocd.writeUInt16LE(files.size,8);eocd.writeUInt16LE(files.size,10);eocd.writeUInt32LE(centralBuf.length,12);eocd.writeUInt32LE(offset,16);
  const result=Buffer.concat([...local,centralBuf,eocd]);
  if(result.length>MAX_ARCHIVE)throw Error('Le jeu avec sa couverture dépasse 20 Mo. Compresse les images avant de réessayer.');
  return result;
}
module.exports={unpackZip,fromUpload,packZip,pathSafe,MAX_ARCHIVE};
