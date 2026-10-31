'use strict';
/**
 * UNO Party sur l'instance HTTP native du portail MY GAME ARCADE.
 * N'ajoute pas un deuxième port et n'interfère pas avec les API Marvel / Lost Cities.
 */
const {Server} = require('socket.io');
const {attachUno} = require('./uno-module');
const {makeStore} = require('./persistence');

async function installUnoNative(httpServer, isAuthorized = () => true) {
  let store = makeStore();
  let restoredRooms = [];
  if (store) {
    try { await store.init(); restoredRooms = await store.load(); }
    catch (err) {
      console.error('[UNO] PostgreSQL indisponible : salons conservés en mémoire seulement.', err.message);
      try { await store.close(); } catch (_err) { /* Aucun bloqueur au démarrage du portail. */ }
      store = null;
    }
  }
  const io = new Server(httpServer, {
    path: '/socket.io',
    serveClient: true,
    transports: ['polling', 'websocket'],
    // Le code d'accès SITE_ACCESS_CODE du portail est aussi requis pour les sockets.
    allowRequest(request, done) {
      try { done(null, Boolean(isAuthorized(request))); }
      catch (_error) { done(null, false); }
    }
  });
  attachUno(null, io, {store, restoredRooms});
  console.log('[UNO Party] Socket.IO /uno initialisé sur le port du portail.');
  return io;
}
module.exports = {installUnoNative};
