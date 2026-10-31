'use strict';
/**
 * Route HTTP /games/uno/ sur le serveur Node.js natif du portail.
 * Ne charge aucun média en mémoire au démarrage (streaming à la demande).
 */
const fs = require('node:fs');
const path = require('node:path');
const UNO_ROOT = path.join(__dirname, '..', 'uploads', 'uno');
const ALLOWED = new Map([
  ['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],
  ['.css','text/css; charset=utf-8'],['.json','application/json; charset=utf-8'],
  ['.txt','text/plain; charset=utf-8'],['.svg','image/svg+xml'],
  ['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],
  ['.webp','image/webp'],['.mp3','audio/mpeg'],['.ogg','audio/ogg'],
  ['.wav','audio/wav'],['.woff2','font/woff2']
]);
function error(res, code, message) {
  res.writeHead(code, {'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
  res.end(message);
}
function serveUnoStatic(req, res, pathname) {
  if (!['GET','HEAD'].includes(req.method)) return error(res, 405, 'Méthode non autorisée.');
  if (pathname === '/games/uno') {
    res.writeHead(302, {Location:'/games/uno/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''), 'Cache-Control':'no-store'});
    return res.end();
  }
  if (!pathname.startsWith('/games/uno/')) return error(res, 404, 'Ressource introuvable.');
  const suffix = pathname.slice('/games/uno/'.length) || 'index.html';
  if (suffix.includes('%2f') || suffix.includes('%2F') || suffix.includes('%5c') || suffix.includes('%5C')) return error(res,403,'Chemin interdit.');
  let name;
  try { name=decodeURIComponent(suffix); }
  catch (_err) { return error(res,400,'URL invalide.'); }
  if (name.endsWith('/')) name += 'index.html';
  const parts = name.split('/');
  if (name.includes('\\') || name.includes('\0') || parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.')) || name.length > 240) return error(res,403,'Chemin interdit.');
  const candidate = path.resolve(UNO_ROOT, name);
  let real, root, stat;
  try {
    root = fs.realpathSync(UNO_ROOT);
    real = fs.realpathSync(candidate);
    if (real !== root && !real.startsWith(root + path.sep)) return error(res,403,'Chemin interdit.');
    stat = fs.statSync(real);
  } catch (_err) { return error(res,404,'Fichier introuvable.'); }
  if (!stat.isFile()) return error(res,404,'Fichier introuvable.');
  const type = ALLOWED.get(path.extname(real).toLowerCase());
  if (!type) return error(res,403,'Type de fichier interdit.');
  const noCache = name==='index.html' || name==='assets.json';
  res.writeHead(200,{
    'Content-Type':type,'Content-Length':stat.size,
    'X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin',
    'Referrer-Policy':'same-origin',
    'Cache-Control':noCache?'no-cache':'public, max-age=300'
  });
  if (req.method==='HEAD') return res.end();
  const stream=fs.createReadStream(real);
  stream.on('error', err => { console.error('[UNO] Lecture du fichier:',err.message);res.destroy(err); });
  stream.pipe(res);
}
module.exports={serveUnoStatic};
