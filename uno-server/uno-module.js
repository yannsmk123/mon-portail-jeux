'use strict';

// Module autonome : integrable dans un serveur Express / Socket.IO existant.
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const engine = require('./game');

const rooms = new Map();
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AVATARS = ['🦊', '🐼', '🐸', '🐯', '🐧', '🦄', '🐙', '🐨', '🦁', '🐱'];
const MAX_ROOMS = 400;

function roomCode() {
  let code;
  do {
    code = Array.from({length: 6}, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}
function safeName(name) {
  return String(name || 'Joueur').replace(/[<>\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18) || 'Joueur';
}
function asRoomCode(code) {
  return String(code || '').trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
function publicState(room, playerId) {
  const me = room.players.find(p => p.id === playerId);
  const game = room.game;
  const active = game && !game.winnerId;
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    meId: playerId,
    botCount: room.botCount,
    maxPlayers: 4,
    players: room.players.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar,
      connected: p.connected, isBot: p.isBot,
      handCount: Array.isArray(p.hand) ? p.hand.length : 0,
      unoDeclared: p.unoDeclared || false
    })),
    hand: game && me ? me.hand : [],
    game: game ? {
      topCard: engine.topCard(game),
      currentColor: game.currentColor,
      currentPlayerId: active ? engine.currentPlayer(room.players, game).id : null,
      direction: game.direction,
      drawCount: game.drawPile.length,
      drawnCardId: active && engine.currentPlayer(room.players, game).id === playerId ? game.drawnCardId : null,
      phase: active && engine.currentPlayer(room.players, game).id === playerId && game.drawnCardId ? 'drawn' : 'normal',
      unoTargetId: game.unoTargetId,
      winnerId: game.winnerId,
      feed: game.feed.slice(-8)
    } : null
  };
}

function attachUno(app, io, options = {}) {
  const prefix = options.path || '/games/uno';
  const store = options.store || null;
  for (const snapshot of options.restoredRooms || []) {
    if (!snapshot?.code || rooms.has(snapshot.code) || !Array.isArray(snapshot.players)) continue;
    const players = snapshot.players.map(p => ({...p,connected:!p.token,socketId:null,disconnectedAt:Date.now(),isBot:!!p.isBot || !!p.token}));
    rooms.set(snapshot.code,{...snapshot,players,botTimer:null,lastActive:Date.now()});
  }
  // Express est facultatif : le portail actuel possède son serveur HTTP natif.
  if (app) {
    const express = require('express');
    app.use(prefix, express.static(path.join(__dirname, '..', 'uploads', 'uno'), { index: 'index.html', maxAge: '1h' }));
  }
  // Namespace Socket.IO isole pour ne pas interferer avec les autres jeux du portail.
  const nsp = io.of('/uno');

  function publish(room) {
    room.lastActive = Date.now();
    for (const player of room.players) {
      if (player.socketId && !player.isBot) {
        nsp.to(player.socketId).emit('game:state', publicState(room, player.id));
      }
    }
    scheduleBot(room);
    if (store) store.save(room).catch(err => console.error('[UNO] Sauvegarde:',err.message));
  }
  function scheduleBot(room) {
    if (room.botTimer || room.status !== 'playing' || !room.game || room.game.winnerId) return;
    const player = engine.currentPlayer(room.players, room.game);
    if (!player.isBot) return;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      if (room.status !== 'playing' || room.game.winnerId) return;
      const current = engine.currentPlayer(room.players, room.game);
      if (current.id !== player.id || !current.isBot) return;
      try {
        engine.botMove(room.players, room.game, current.id);
        if (room.game.winnerId) room.status = 'finished';
      } catch (err) { console.error('[UNO] Action bot:', err); }
      publish(room);
    }, room.game.unoTargetId && !room.players.find(p => p.id === room.game.unoTargetId)?.unoDeclared ? 3400 : 850 + Math.floor(Math.random() * 700));
  }
  function removePlayerFromLobby(room, playerId) {
    const index = room.players.findIndex(p => p.id === playerId);
    if (index < 0) return;
    room.players.splice(index, 1);
    if (room.hostId === playerId) room.hostId = room.players.find(p => !p.isBot)?.id || null;
    if (!room.players.length) {
      rooms.delete(room.code);
      if (store) store.remove(room.code).catch(err => console.error('[UNO] Suppression:',err.message));
    } else {
      room.botCount = Math.min(room.botCount, 4 - room.players.length);
      publish(room);
    }
  }
  function detach(socket, explicit = false) {
    const { roomCode: code, playerId } = socket.data;
    socket.data.roomCode = null;
    socket.data.playerId = null;
    if (!code) return;
    socket.leave(code);
    const room = rooms.get(code);
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);
    if (!player || player.socketId !== socket.id) return;
    player.socketId = null;
    player.connected = false;
    player.disconnectedAt = Date.now();
    if (room.hostId === player.id) {
      const replacement = room.players.find(p => p.id !== player.id && p.connected && !p.isBot);
      if (replacement) room.hostId = replacement.id;
    }
    if (room.status === 'lobby' && explicit) {
      removePlayerFromLobby(room, player.id);
      return;
    }
    if (room.status === 'playing') {
      // Reprise par un bot sans perdre les cartes ou interrompre les autres.
      player.isBot = true;
      engine.addEvent(room.game, `${player.name} est déconnecté·e : un bot prend le relais.`, 'info');
    }
    publish(room);
  }
  function attachPlayer(socket, room, player) {
    // Autorise une reconnexion avec un jeton de session, sans exposer les mains des autres.
    if (player.socketId && player.socketId !== socket.id) {
      const oldSocket = nsp.sockets.get(player.socketId);
      if (oldSocket) {
        oldSocket.data.roomCode = null;
        oldSocket.data.playerId = null;
        oldSocket.emit('session:replaced');
        oldSocket.leave(room.code);
      }
    }
    detach(socket, true);
    player.socketId = socket.id;
    player.connected = true;
    player.disconnectedAt = null;
    player.isBot = false;
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
  }
  function respond(callback, payload) { if (typeof callback === 'function') callback(payload); }
  function perform(socket, callback, action) {
    const room = rooms.get(socket.data.roomCode);
    const playerId = socket.data.playerId;
    if (!room || !playerId || !room.players.some(p => p.id === playerId && p.connected)) {
      respond(callback, { ok: false, error: 'Reconnecte-toi au salon.' });
      return;
    }
    try {
      const result = action(room, playerId);
      respond(callback, { ok: true, ...(result || {}) });
      publish(room);
    } catch (err) {
      respond(callback, { ok: false, error: err.message || 'Action impossible.' });
    }
  }
  nsp.on('connection', socket => {
    socket.data.calls = 0;
    socket.data.bucketUntil = Date.now() + 3000;
    socket.use((packet, next) => {
      const now = Date.now();
      if (now > socket.data.bucketUntil) {
        socket.data.bucketUntil = now + 3000;
        socket.data.calls = 0;
      }
      if (++socket.data.calls > 65) return next(new Error('Trop de requêtes.'));
      next();
    });

    socket.on('room:create', (args = {}, callback) => {
      if (rooms.size >= MAX_ROOMS) return respond(callback, {ok: false, error: 'Trop de salons en cours, réessaie plus tard.'});
      detach(socket, true);
      const code = roomCode();
      const player = {
        id: randomUUID(), token: randomBytes(24).toString('hex'), name: safeName(args.name),
        avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
        socketId: null, connected: false, isBot: false, hand: [], unoDeclared: false
      };
      const room = {code, players: [player], hostId: player.id, botCount: 1, status: 'lobby', game: null, lastActive: Date.now(), botTimer: null};
      rooms.set(code, room);
      attachPlayer(socket, room, player);
      respond(callback, {ok: true, code, token: player.token, playerId: player.id});
      publish(room);
    });

    socket.on('room:join', (args = {}, callback) => {
      const code = asRoomCode(args.code);
      const room = rooms.get(code);
      if (!room) return respond(callback, {ok: false, error: 'Salon introuvable. Vérifie le code.'});
      let player = room.players.find(p => p.token && p.token === args.token && typeof args.token === 'string' && args.token.length > 10);
      if (!player && room.status !== 'lobby') return respond(callback, {ok: false, error: 'La partie a déjà commencé. Demande un nouveau salon.'});
      if (!player && room.players.length >= 4) return respond(callback, {ok: false, error: 'Ce salon est complet (4 joueurs maximum).'});
      if (!player) {
        player = {id: randomUUID(), token: randomBytes(24).toString('hex'), name: safeName(args.name),
          avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
          socketId: null, connected: false, isBot: false, hand: [], unoDeclared: false};
        room.players.push(player);
        room.botCount = Math.min(room.botCount, 4 - room.players.length);
      }
      attachPlayer(socket, room, player);
      respond(callback, {ok: true, code, token: player.token, playerId: player.id});
      publish(room);
    });

    socket.on('room:leave', (_, callback) => {
      detach(socket, true);
      respond(callback, {ok: true});
    });
    socket.on('room:set-bots', (args = {}, callback) => perform(socket, callback, (room, playerId) => {
      if (room.status !== 'lobby' || room.hostId !== playerId) throw new Error('Seul l’hôte peut modifier les bots avant le début.');
      if (!Number.isInteger(args.count) || args.count < 0 || args.count > 3 || room.players.length + args.count > 4) throw new Error('Maximum 4 joueurs au total.');
      room.botCount = args.count;
    }));
    socket.on('game:start', (_, callback) => perform(socket, callback, (room, playerId) => {
      if (room.status !== 'lobby' || room.hostId !== playerId) throw new Error('Seul l’hôte peut lancer la partie.');
      room.players = room.players.filter(p => p.connected);
      if (!room.players.some(p => p.id === playerId)) throw new Error('L’hôte doit être connecté.');
      if (room.players.length + room.botCount < 2) throw new Error('Il faut au moins 2 joueurs (ou un bot).');
      if (room.players.length + room.botCount > 4) throw new Error('4 joueurs maximum.');
      for (let i = 0; i < room.botCount; i++) {
        room.players.push({id: randomUUID(), name: engine.BOT_NAMES[i], avatar: ['🤖','👾','🛸'][i], isBot: true, connected: true, hand: [], unoDeclared: false});
      }
      room.game = engine.createGame(room.players);
      room.status = 'playing';
    }));
    socket.on('game:play', (args = {}, callback) => perform(socket, callback, (room, id) => {
      if (room.status !== 'playing') throw new Error('La partie n’est pas en cours.');
      engine.play(room.players, room.game, id, String(args.cardId || ''), args.color);
      if (room.game.winnerId) room.status = 'finished';
    }));
    socket.on('game:draw', (_, callback) => perform(socket, callback, (room, id) => {
      if (room.status !== 'playing') throw new Error('La partie n’est pas en cours.');
      engine.draw(room.players, room.game, id);
    }));
    socket.on('game:pass', (_, callback) => perform(socket, callback, (room, id) => {
      if (room.status !== 'playing') throw new Error('La partie n’est pas en cours.');
      engine.pass(room.players, room.game, id);
    }));
    socket.on('game:uno', (_, callback) => perform(socket, callback, (room, id) => {
      if (room.status !== 'playing') throw new Error('La partie n’est pas en cours.');
      engine.callUno(room.players, room.game, id);
    }));
    socket.on('game:catch', (_, callback) => perform(socket, callback, (room, id) => {
      if (room.status !== 'playing') throw new Error('La partie n’est pas en cours.');
      engine.catchUno(room.players, room.game, id);
    }));
    socket.on('game:restart', (_, callback) => perform(socket, callback, (room, id) => {
      if (room.status !== 'finished' || room.hostId !== id) throw new Error('Seul l’hôte peut préparer la revanche.');
      room.players = room.players.filter(p => !p.isBot);
      room.players.forEach(p => { p.hand = []; p.unoDeclared = false; });
      room.botCount = Math.min(room.botCount, 4 - room.players.length);
      room.game = null;
      room.status = 'lobby';
    }));
    socket.on('disconnect', () => detach(socket, false));
  });

  // Les salons sans activite et les connexions abandonnees expirent automatiquement.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.status === 'lobby') {
        for (const p of [...room.players]) {
          if (!p.connected && now - (p.disconnectedAt || now) > 120000) removePlayerFromLobby(room, p.id);
        }
      }
      if (now - room.lastActive > 1000 * 60 * 60 * 2 || (room.status !== 'playing' && !room.players.some(p => p.connected && !p.isBot) && now - room.lastActive > 120000)) {
        if (room.botTimer) clearTimeout(room.botTimer);
        rooms.delete(room.code);
        if (store) store.remove(room.code).catch(err => console.error('[UNO] Expiration:',err.message));
      }
    }
  }, 60000);
  sweeper.unref?.();
  return nsp;
}
module.exports = { attachUno };
