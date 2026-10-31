'use strict';

const { randomInt } = require('node:crypto');
const COLORS = ['red', 'yellow', 'green', 'blue'];
const BOT_NAMES = ['Pixel', 'Nova', 'Biscuit', 'Cosmo', 'Turbo', 'Mochi'];
let nextCardId = 0;

function makeCard(color, value) {
  return { id: `c${++nextCardId}`, color, value };
}
function deck108() {
  const cards = [];
  for (const color of COLORS) {
    cards.push(makeCard(color, '0'));
    for (let i = 1; i <= 9; i++) {
      cards.push(makeCard(color, String(i)), makeCard(color, String(i)));
    }
    for (const value of ['skip', 'reverse', 'draw2']) {
      cards.push(makeCard(color, value), makeCard(color, value));
    }
  }
  for (let i = 0; i < 4; i++) {
    cards.push(makeCard(null, 'wild'), makeCard(null, 'wild4'));
  }
  return cards;
}
function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
function createGame(players) {
  if (players.length < 2 || players.length > 4) throw new Error('Il faut entre 2 et 4 joueurs.');
  const deck = shuffle(deck108());
  for (const player of players) {
    player.hand = [];
    player.unoDeclared = false;
    for (let i = 0; i < 7; i++) player.hand.push(deck.pop());
  }
  // On commence avec une carte numerotee pour une regle d'ouverture claire.
  let first = deck.findIndex(c => c.color !== null && /^\d$/.test(c.value));
  const [openingCard] = deck.splice(first, 1);
  const game = {
    drawPile: deck,
    discardPile: [openingCard],
    currentColor: openingCard.color,
    turnIndex: 0,
    direction: 1,
    drawnCardId: null,
    unoTargetId: null,
    winnerId: null,
    feed: [],
    eventId: 0
  };
  addEvent(game, `La partie commence ! ${players[0].name} joue en premier.`, 'start');
  return game;
}
function addEvent(game, message, kind = 'info') {
  game.feed.push({ id: ++game.eventId, message, kind });
  if (game.feed.length > 16) game.feed.shift();
}
function topCard(game) { return game.discardPile[game.discardPile.length - 1]; }
function currentPlayer(players, game) { return players[game.turnIndex]; }
function advance(game, playerCount, steps = 1) {
  game.turnIndex = (game.turnIndex + game.direction * steps % playerCount + playerCount * 5) % playerCount;
  game.drawnCardId = null;
}
function refill(game) {
  if (game.drawPile.length > 0 || game.discardPile.length < 2) return;
  const top = game.discardPile.pop();
  game.drawPile = shuffle(game.discardPile);
  game.discardPile = [top];
}
function take(game, player, count) {
  let received = 0;
  for (let i = 0; i < count; i++) {
    refill(game);
    if (game.drawPile.length === 0) break;
    player.hand.push(game.drawPile.pop());
    received++;
  }
  return received;
}
function isPlayable(card, game, hand) {
  if (!card) return false;
  if (card.value === 'wild') return true;
  if (card.value === 'wild4') {
    return !hand.some(c => c.id !== card.id && c.color === game.currentColor);
  }
  const top = topCard(game);
  return card.color === game.currentColor || (top.color !== null && card.value === top.value);
}
function assertTurn(players, game, playerId) {
  if (game.winnerId) throw new Error('La partie est terminée.');
  if (currentPlayer(players, game).id !== playerId) throw new Error('Ce n’est pas ton tour.');
}
function expireUnoOnAction(game, playerId) {
  if (game.unoTargetId && game.unoTargetId !== playerId) game.unoTargetId = null;
}
function chooseColor(hand) {
  const counts = Object.fromEntries(COLORS.map(c => [c, 0]));
  hand.forEach(c => { if (c.color) counts[c.color]++; });
  return COLORS.reduce((best, c) => counts[c] > counts[best] ? c : best, COLORS[0]);
}
function play(players, game, playerId, cardId, selectedColor) {
  assertTurn(players, game, playerId);
  const player = currentPlayer(players, game);
  const card = player.hand.find(c => c.id === cardId);
  if (!card) throw new Error('Cette carte n’est pas dans ta main.');
  if (game.drawnCardId && game.drawnCardId !== cardId) {
    throw new Error('Après avoir pioché, tu peux seulement jouer la carte piochée.');
  }
  if (!isPlayable(card, game, player.hand)) {
    throw new Error('Cette carte ne peut pas être jouée maintenant.');
  }
  if (card.color === null && !COLORS.includes(selectedColor)) {
    throw new Error('Choisis une couleur pour le joker.');
  }
  expireUnoOnAction(game, playerId);
  player.hand.splice(player.hand.indexOf(card), 1);
  game.discardPile.push(card);
  game.currentColor = card.color || selectedColor;
  game.drawnCardId = null;
  player.unoDeclared = false;
  const actionNames = { skip: 'passe son tour ⛔', reverse: 'inverse le sens 🔄', draw2: 'inflige +2 🃏', wild: `choisit ${colorName(game.currentColor)} 🌈`, wild4: `inflige +4 (${colorName(game.currentColor)}) 💥` };
  addEvent(game, `${player.name} ${actionNames[card.value] || `joue ${card.value} ${colorName(card.color)}`}.`, card.value.startsWith('wild') ? 'wild' : 'play');
  if (player.hand.length === 0) {
    game.winnerId = player.id;
    game.unoTargetId = null;
    addEvent(game, `🏆 ${player.name} remporte la manche !`, 'win');
    return;
  }
  game.unoTargetId = player.hand.length === 1 ? player.id : null;
  let steps = 1;
  if (card.value === 'reverse') {
    game.direction *= -1;
    if (players.length === 2) steps = 2;
  }
  if (card.value === 'skip') steps = 2;
  if (card.value === 'draw2' || card.value === 'wild4') {
    const nextIndex = (game.turnIndex + game.direction + players.length) % players.length;
    const nextPlayer = players[nextIndex];
    const count = take(game, nextPlayer, card.value === 'draw2' ? 2 : 4);
    nextPlayer.unoDeclared = false;
    addEvent(game, `${nextPlayer.name} pioche ${count} carte${count > 1 ? 's' : ''} et passe son tour.`, 'draw');
    steps = 2;
  }
  advance(game, players.length, steps);
}
function draw(players, game, playerId) {
  assertTurn(players, game, playerId);
  if (game.drawnCardId) throw new Error('Tu as déjà pioché : joue cette carte ou passe.');
  expireUnoOnAction(game, playerId);
  const player = currentPlayer(players, game);
  const count = take(game, player, 1);
  if (!count) {
    addEvent(game, `${player.name} ne peut pas piocher (pioche vide).`, 'draw');
    advance(game, players.length);
    return;
  }
  const card = player.hand[player.hand.length - 1];
  player.unoDeclared = false;
  addEvent(game, `${player.name} pioche une carte.`, 'draw');
  if (isPlayable(card, game, player.hand)) {
    game.drawnCardId = card.id;
  } else {
    advance(game, players.length);
  }
}
function pass(players, game, playerId) {
  assertTurn(players, game, playerId);
  if (!game.drawnCardId) throw new Error('Tu dois d’abord piocher.');
  expireUnoOnAction(game, playerId);
  addEvent(game, `${currentPlayer(players, game).name} passe.`, 'info');
  advance(game, players.length);
}
function callUno(players, game, playerId) {
  if (game.winnerId) throw new Error('La partie est terminée.');
  const player = players.find(p => p.id === playerId);
  if (!player || game.unoTargetId !== playerId || player.hand.length !== 1) {
    throw new Error('Tu pourras annoncer UNO quand il te restera une carte.');
  }
  if (player.unoDeclared) throw new Error('UNO déjà annoncé !');
  player.unoDeclared = true;
  addEvent(game, `📢 ${player.name} crie UNO !`, 'uno');
}
function catchUno(players, game, playerId) {
  if (game.winnerId) throw new Error('La partie est terminée.');
  const target = players.find(p => p.id === game.unoTargetId);
  if (!target || target.id === playerId || target.unoDeclared || target.hand.length !== 1) {
    throw new Error('Personne à prendre en faute pour le moment.');
  }
  const count = take(game, target, 2);
  target.unoDeclared = false;
  game.unoTargetId = null;
  addEvent(game, `👀 ${target.name} a oublié UNO ! +${count} cartes.`, 'catch');
}
function colorName(color) {
  return { red: 'rouge', blue: 'bleu', green: 'vert', yellow: 'jaune' }[color] || color;
}
function botMove(players, game, botId) {
  assertTurn(players, game, botId);
  const bot = currentPlayer(players, game);
  if (!bot.isBot) return;
  if (game.drawnCardId) {
    const chosen = bot.hand.find(c => c.id === game.drawnCardId);
    if (chosen && isPlayable(chosen, game, bot.hand)) play(players, game, botId, chosen.id, chosen.color ? undefined : chooseColor(bot.hand.filter(c => c.id !== chosen.id)));
    else pass(players, game, botId);
    if (game.unoTargetId === botId) callUno(players, game, botId);
    return;
  }
  const playable = bot.hand.filter(card => isPlayable(card, game, bot.hand));
  // Garder les jokers en reserve et privilegier les cartes de la couleur dominante.
  playable.sort((a, b) => {
    const rank = c => c.value === 'wild4' ? 5 : c.value === 'wild' ? 4 : c.value === 'draw2' ? 0 : c.value === 'skip' ? 1 : c.value === 'reverse' ? 2 : 3;
    return rank(a) - rank(b);
  });
  if (playable.length) {
    const card = playable[0];
    play(players, game, botId, card.id, card.color ? undefined : chooseColor(bot.hand.filter(c => c.id !== card.id)));
  } else {
    draw(players, game, botId);
  }
  if (game.unoTargetId === botId) callUno(players, game, botId);
}
module.exports = { COLORS, BOT_NAMES, deck108, createGame, topCard, currentPlayer, isPlayable, play, draw, pass, callUno, catchUno, botMove, addEvent };
