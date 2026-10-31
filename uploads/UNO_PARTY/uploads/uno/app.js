(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(window.location.search);
  const COLORS = {red:'Rouge',yellow:'Jaune',green:'Vert',blue:'Bleu'};
  const SYMBOLS = {skip:'⊘',reverse:'↺',draw2:'+2',wild:'★',wild4:'+4'};
  const socket = io('/uno', {transports:['websocket', 'polling'], reconnection: true, reconnectionDelayMax: 4000});
  let state = null;
  let pendingWild = null;
  let lastEventId = 0;
  let activeCode = null;
  let winShown = false;
  let muted = localStorage.getItem('uno.muted') === 'true';
  const assets = new UnoAssets.UnoMediaStore();
  let prefs = {...UnoAssets.defaults};
  const loadedSfx = {};
  let musicAudio = null;
  let musicIndex = 0;
  let soundCtx = null;
  let toastTimeout;
  let actionInProgress = false;

  $('playerName').value = localStorage.getItem('uno.name') || '';
  $('joinCode').value = (qs.get('salon') || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
  updateSoundButton();

  function getName() {
    const value = $('playerName').value.replace(/[<>]/g, '').trim().slice(0, 18) || 'Invité';
    localStorage.setItem('uno.name', value);
    return value;
  }
  function getSession() {
    try { return JSON.parse(localStorage.getItem('uno.session') || 'null'); }
    catch { return null; }
  }
  function saveSession(info) {
    localStorage.setItem('uno.session', JSON.stringify({code:info.code, token:info.token}));
    const url = new URL(location.href);
    url.searchParams.set('salon', info.code);
    history.replaceState({}, '', url);
    $('joinCode').value = info.code;
    activeCode = info.code;
  }
  function clearSession() {
    localStorage.removeItem('uno.session');
    const url = new URL(location.href);
    url.searchParams.delete('salon');
    history.replaceState({}, '', url);
    activeCode = null;
    state = null;
    winShown = false;
  }
  function showScreen(name) {
    for (const screen of ['welcome','lobby','gameScreen']) $(screen).classList.toggle('hidden', screen !== name);
    $('footer').classList.toggle('hidden', name === 'gameScreen');
  }
  function showToast(message, error = false) {
    const toast = $('toast');
    toast.textContent = message;
    toast.style.background = error ? '#ffced9' : '#fff';
    toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3300);
  }
  function beep(tone = 'click') {
    if (muted || !prefs.sfxEnabled) return;
    const key = tone === 'uno' || tone === 'win' || tone === 'draw' ? tone : 'click';
    if (loadedSfx[key]) {
      const audio = new Audio(loadedSfx[key]);
      audio.volume = Math.max(0, Math.min(1, prefs.sfxVolume / 100));
      audio.play().catch(() => {});
      return;
    }
    assets.resource('sound-' + key).then(media => { if (media?.type.startsWith('audio/')) loadedSfx[key] = media.data; }).catch(() => {});
    try {
      soundCtx = soundCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (soundCtx.state === 'suspended') soundCtx.resume();
      const notes = tone === 'win' ? [523,659,784,1047] : tone === 'uno' ? [600,850] : tone === 'draw' ? [260] : [550];
      notes.forEach((freq, index) => {
        const osc = soundCtx.createOscillator();
        const gain = soundCtx.createGain();
        const t = soundCtx.currentTime + index * .115;
        osc.type = tone === 'draw' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(.0001, t);
        gain.gain.exponentialRampToValueAtTime(Math.max(.0001,.08 * prefs.sfxVolume/60), t + .018);
        gain.gain.exponentialRampToValueAtTime(.0001, t + .16);
        osc.connect(gain).connect(soundCtx.destination);
        osc.start(t); osc.stop(t + .17);
      });
    } catch (_) { /* Son facultatif */ }
  }
  function updateSoundButton() {
    $('soundBtn').textContent = muted ? '🔇' : '🔊';
    $('soundBtn').setAttribute('aria-label', muted ? 'Activer le son' : 'Couper le son');
  }
  function send(event, args = {}, onSuccess) {
    if (!socket.connected) { showToast('Connexion perdue. Reconnexion en cours…', true); return; }
    socket.timeout(9000).emit(event, args, (err, result) => {
      if (err) return showToast('Le serveur ne répond pas. Réessaie.', true);
      if (!result || !result.ok) return showToast(result?.error || 'Action impossible.', true);
      if (typeof onSuccess === 'function') onSuccess(result);
    });
  }
  function joinSuccessful(result) { saveSession(result); beep(); }
  function createRoom(solo = false) {
    if (actionInProgress) return;
    actionInProgress = true;
    setTimeout(() => { actionInProgress = false; }, 1200);
    send('room:create', {name:getName()}, result => {
      joinSuccessful(result);
      if (solo) send('room:set-bots', {count:3}, () => send('game:start'));
    });
  }
  function joinRoom(code, token = undefined) {
    send('room:join', {code, token, name:getName()}, result => joinSuccessful(result));
  }
  function copyInvite() {
    if (!state) return;
    const url = new URL(window.location.href);
    url.searchParams.set('salon', state.code);
    const link = url.toString();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link).then(() => showToast('🔗 Lien copié ! Envoie-le à tes amis.')).catch(() => fallbackCopy(link));
    } else fallbackCopy(link);
  }
  function fallbackCopy(value) {
    const input = document.createElement('textarea');
    input.value = value; input.style.position='fixed';input.style.opacity='0';
    document.body.appendChild(input); input.select();
    try { document.execCommand('copy');showToast('Lien copié !'); } catch { showToast('Code du salon : ' + state.code); }
    input.remove();
  }
  function leaveRoom() {
    send('room:leave');
    clearSession();
    $('winModal').classList.add('hidden');
    $('colorModal').classList.add('hidden');
    showScreen('welcome');
  }
  function elem(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function makeCard(card, playable = false, drawn = false) {
    const type = card.color || 'wild';
    const el = elem('div', `game-card ${type}${playable ? ' playable' : ''}${drawn ? ' drawn' : ''}`);
    const symbol = SYMBOLS[card.value] || card.value;
    el.append(elem('span','card-corner',symbol));
    el.append(elem('span',`card-center${String(symbol).length>1 ? ' long':''}`,symbol));
    el.append(elem('span','card-corner bottom',symbol));
    el.setAttribute('aria-label', card.color ? `${card.value} ${COLORS[card.color]}` : `${card.value} joker`);
    if (playable) {
      el.setAttribute('role','button');
      el.tabIndex = 0;
      el.addEventListener('click', () => selectCard(card));
      el.addEventListener('keydown', e => {if(e.key==='Enter' || e.key===' '){e.preventDefault();selectCard(card);}});
    }
    return el;
  }
  function canPlay(card) {
    const game = state?.game;
    if (!game || state.status !== 'playing' || game.currentPlayerId !== state.meId) return false;
    if (game.drawnCardId && game.drawnCardId !== card.id) return false;
    if (card.value === 'wild') return true;
    if (card.value === 'wild4') return !state.hand.some(c => c.id !== card.id && c.color === game.currentColor);
    return card.color === game.currentColor || (game.topCard.color && card.value === game.topCard.value);
  }
  function selectCard(card) {
    if (!canPlay(card)) return;
    if (card.color === null) {
      pendingWild = card.id;
      $('colorModal').classList.remove('hidden');
    } else {
      send('game:play', {cardId:card.id}, () => beep('click'));
    }
  }
  function renderLobby() {
    showScreen('lobby');
    $('winModal').classList.add('hidden');
    $('lobbyCode').textContent = state.code;
    $('playerAmount').textContent = `${state.players.length} / 4`;
    const target = $('lobbyPlayers'); target.replaceChildren();
    for (let i = 0; i < 4; i++) {
      const player = state.players[i];
      const row = elem('div', `lobby-player${player ? '' : ' empty'}`);
      row.append(elem('div','lobby-avatar',player ? player.avatar : '＋'));
      const detail = elem('div');
      detail.append(elem('strong','',player ? player.name : 'Place libre'));
      detail.append(elem('small','',player ? (player.id === state.hostId ? '👑 Hôte' : player.connected ? 'Prêt à jouer' : 'Déconnecté') : 'En attente…'));
      row.append(detail); target.append(row);
    }
    const isHost = state.hostId === state.meId;
    $('botConfig').classList.toggle('hidden', !isHost);
    $('startBtn').classList.toggle('hidden', !isHost);
    const botSelect = $('botSelect'); botSelect.replaceChildren();
    for (let i = 0; i <= 4-state.players.length; i++) {
      const option = elem('option','',`${i} bot${i>1?'s':''}`);
      option.value = String(i);botSelect.append(option);
    }
    botSelect.value = String(Math.min(state.botCount,4-state.players.length));
    const total = state.players.filter(p => p.connected).length + state.botCount;
    $('startBtn').disabled = total < 2;
    $('lobbyHint').textContent = isHost ? `Participants prévus : ${total} sur 4. ${total < 2 ? 'Ajoute un bot ou invite un ami.' : 'Tout est prêt !'}` : 'En attente du lancement par l’hôte…';
  }
  function renderOpponents() {
    const target = $('opponents'); target.replaceChildren();
    state.players.filter(p => p.id !== state.meId).forEach(player => {
      const active = player.id === state.game?.currentPlayerId;
      const box = elem('div', `opponent${active ? ' active' : ''}`);
      box.append(elem('div','opponent-avatar',player.avatar));
      const info = elem('div','opponent-info');
      info.append(elem('div','opponent-name',player.name));
      const suffix = player.isBot ? ' 🤖' : !player.connected ? ' (hors ligne)' : '';
      info.append(elem('div','opponent-status', active ? '⚡ À son tour' : `${player.handCount} carte${player.handCount>1?'s':''}${suffix}`));
      const backs = elem('div','opponent-cardbacks');
      for (let i=0;i<Math.min(5,player.handCount);i++) backs.append(elem('span','mini-back'));
      info.append(backs);
      box.append(info);target.append(box);
    });
  }
  function renderGame() {
    showScreen('gameScreen');
    const game = state.game;
    if (!game) return;
    const myTurn = state.status === 'playing' && game.currentPlayerId === state.meId;
    const myself = state.players.find(p => p.id === state.meId);
    const turnPlayer = state.players.find(p => p.id === game.currentPlayerId);
    $('gameCode').textContent = state.code;
    $('gameDirection').textContent = game.direction === 1 ? '↻ Sens horaire' : '↺ Sens inversé';
    $('myAvatar').textContent = myself?.avatar || '🎴';
    $('myName').textContent = myself?.name || 'Joueur';
    $('handCount').textContent = `${state.hand.length} carte${state.hand.length !== 1 ? 's' : ''}`;
    $('deckCount').textContent = String(game.drawCount);
    $('turnBanner').textContent = state.status === 'finished' ? '🎉 Fin de partie !' : myTurn ? '✨ À TOI DE JOUER ! ✨' : `⏳ Au tour de ${turnPlayer?.name || '…'}`;
    $('turnBanner').classList.toggle('your-turn',myTurn);
    $('discardCard').replaceChildren(makeCard(game.topCard));
    const colorDot = $('colorStatus').querySelector('.color-dot');
    colorDot.className = `color-dot ${game.currentColor}`;
    $('colorStatus').querySelector('strong').textContent = (COLORS[game.currentColor] || '').toUpperCase();
    $('drawPile').disabled = !myTurn || !!game.drawnCardId;
    $('drawPile').title = myTurn ? 'Piocher une carte' : 'Attends ton tour';
    renderOpponents();
    const hand = $('hand'); hand.replaceChildren();
    for (const card of state.hand) hand.append(makeCard(card,canPlay(card),game.drawnCardId === card.id));
    const meCanUno = state.status === 'playing' && game.unoTargetId === state.meId && !myself?.unoDeclared;
    const target = state.players.find(p => p.id === game.unoTargetId);
    const canCatch = state.status === 'playing' && !!target && target.id !== state.meId && !target.unoDeclared;
    $('unoBtn').classList.toggle('hidden', !meCanUno);
    $('catchBtn').classList.toggle('hidden', !canCatch);
    $('passBtn').classList.toggle('hidden', !myTurn || !game.drawnCardId);
    $('turnHint').classList.toggle('hidden', myTurn || meCanUno || canCatch);
    $('turnHint').textContent = state.status === 'finished' ? 'Manche terminée' : 'Ton tour arrive bientôt !';
    if (game.drawnCardId) $('turnBanner').textContent = '🎴 Joue la carte piochée… ou passe !';
    const latest = game.feed.at(-1);
    $('lastEvent').textContent = latest ? latest.message : 'Que la meilleure main gagne !';
    if (latest && latest.id > lastEventId) {
      if (lastEventId !== 0 && ['uno','catch','win'].includes(latest.kind)) {showToast(latest.message);beep(latest.kind === 'win' ? 'win' : 'uno');}
      lastEventId = latest.id;
    }
    if (state.status === 'finished') renderWin();
    else { $('winModal').classList.add('hidden'); winShown=false; }
  }
  function renderWin() {
    if (!state?.game?.winnerId) return;
    const winner = state.players.find(p => p.id === state.game.winnerId);
    const isWinner = winner?.id === state.meId;
    $('winTitle').textContent = isWinner ? 'TU AS GAGNÉ ! 🎉' : `${winner?.name || 'Un joueur'} a gagné !`;
    $('winText').textContent = isWinner ? 'Incroyable ! Quelle masterclass, champion·ne ! 🏆' : 'La revanche s’annonce épique ! 🔥';
    const isHost = state.hostId === state.meId;
    $('rematchBtn').classList.toggle('hidden', !isHost);
    if (!isHost) $('winText').textContent += ' L’hôte peut relancer une manche.';
    $('winModal').classList.remove('hidden');
    if (!winShown) {winShown=true;spawnConfetti();beep('win');}
  }
  function spawnConfetti() {
    const el = $('confetti');el.replaceChildren();
    const palette = ['#ffda56','#ff5c80','#54d7a2','#8ca5ff','#dc8df2'];
    for (let i = 0; i < Math.round(45 * Math.max(0, prefs.animationIntensity) / 100); i++) {
      const piece = elem('span','confetti-piece');
      piece.style.setProperty('--x',`${(i*47.3)%100}%`);
      piece.style.setProperty('--duration',`${3+(i%9)*.25}s`);
      piece.style.setProperty('--delay',`${(i%13)*-.27}s`);
      piece.style.setProperty('--color',palette[i%palette.length]);
      piece.style.setProperty('--rotation',`${i*38}deg`);
      el.append(piece);
    }
  }
  socket.on('connect', () => {
    $('connection').classList.add('online');
    $('connection').lastElementChild.textContent = 'En ligne';
    const saved = getSession();
    const invite = (new URLSearchParams(location.search).get('salon') || '').toUpperCase();
    if (saved && (!invite || invite === saved.code)) {
      joinRoom(saved.code,saved.token);
    } else if (!state) showScreen('welcome');
  });
  socket.on('disconnect', () => {
    $('connection').classList.remove('online');
    $('connection').lastElementChild.textContent = 'Reconnexion…';
  });
  socket.on('connect_error', () => { $('connection').lastElementChild.textContent = 'Hors ligne'; });
  socket.on('session:replaced', () => {clearSession();showScreen('welcome');showToast('Cette session est ouverte dans un autre onglet.',true);});
  socket.on('game:state', next => {
    if (activeCode !== next.code) {lastEventId = 0;winShown=false;activeCode=next.code;}
    if (state?.status === 'finished' && next.status === 'lobby') {winShown=false;lastEventId=0;}
    state = next;
    if (next.status === 'lobby') renderLobby();
    else renderGame();
  });
  $('createBtn').addEventListener('click', () => createRoom(false));
  $('soloBtn').addEventListener('click', () => createRoom(true));
  $('joinBtn').addEventListener('click', () => {
    const code = $('joinCode').value.replace(/[^A-Za-z0-9]/g,'').toUpperCase();
    if (code.length !== 6) return showToast('Entre un code de salon à 6 caractères.',true);
    joinRoom(code);
  });
  $('joinCode').addEventListener('keydown', e => {if(e.key==='Enter') $('joinBtn').click();});
  $('playerName').addEventListener('keydown', e => {if(e.key==='Enter') $('createBtn').click();});
  $('joinCode').addEventListener('input', e => {e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');});
  $('copyBtn').addEventListener('click', copyInvite);
  $('copyGameBtn').addEventListener('click', copyInvite);
  $('startBtn').addEventListener('click', () => send('game:start',{},()=>beep('uno')));
  $('botSelect').addEventListener('change', e => send('room:set-bots',{count:Number(e.target.value)}));
  $('leaveLobbyBtn').addEventListener('click',leaveRoom);
  $('leaveGameBtn').addEventListener('click', () => {if(confirm('Quitter la partie ? Un bot continuera à ta place.'))leaveRoom();});
  $('drawPile').addEventListener('click',()=>send('game:draw',{},()=>beep('draw')));
  $('passBtn').addEventListener('click',()=>send('game:pass'));
  $('unoBtn').addEventListener('click',()=>send('game:uno',{},()=>beep('uno')));
  $('catchBtn').addEventListener('click',()=>send('game:catch',{},()=>beep('uno')));
  document.querySelectorAll('[data-color]').forEach(btn => btn.addEventListener('click',()=>{
    if (!pendingWild) return;
    const cardId = pendingWild;
    pendingWild = null;
    $('colorModal').classList.add('hidden');
    send('game:play',{cardId,color:btn.dataset.color},()=>beep('uno'));
  }));
  $('cancelColor').addEventListener('click',()=>{pendingWild=null;$('colorModal').classList.add('hidden');});
  $('rematchBtn').addEventListener('click',()=>send('game:restart'));
  $('winLeaveBtn').addEventListener('click',leaveRoom);
  $('helpBtn').addEventListener('click',()=>$('rulesModal').classList.remove('hidden'));
  $('closeRules').addEventListener('click',()=>$('rulesModal').classList.add('hidden'));
  $('gotRules').addEventListener('click',()=>$('rulesModal').classList.add('hidden'));
  $('soundBtn').addEventListener('click',()=>{muted=!muted;localStorage.setItem('uno.muted',String(muted));updateSoundButton();if(musicAudio)musicAudio.muted=muted;if(!muted)beep();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('rulesModal').classList.add('hidden');$('colorModal').classList.add('hidden');pendingWild=null;}});
  ['rulesModal','colorModal'].forEach(id=>$(id).addEventListener('click',e=>{if(e.target===$(id)){$(id).classList.add('hidden');pendingWild=null;}}));

  // Chargement des ressources independent du moteur reseau : jamais de cartes ni de secrets dans le JSON.
  const forcedDiagnostics = qs.get('json-tools') === '1';
  async function refreshResources() {
    $('jsonTools').classList.remove('hidden');
    $('jsonStatus').textContent = 'Vérification du manifeste léger…';
    try {
      await assets.check();
      prefs = assets.settings();
      applyPreferences();
      // Illustration officielle chargée une seule fois, puis réutilisée via IndexedDB.
      await assets.loadPack('visuals');
      await applyVisuals();
      $('jsonStatus').textContent = (assets.offline ? 'Mode hors ligne : ressources locales.' : 'Ressources à jour.') + (assets.degraded ? ' Cache persistant indisponible sur ce navigateur.' : ' Cache IndexedDB actif.');
      if (!forcedDiagnostics && !diagnosticsOpened) $('jsonTools').classList.add('hidden');
    } catch (err) {
      $('jsonStatus').textContent = 'Erreur médias : ' + err.message + '. Le jeu reste jouable avec ses cartes CSS.';
      $('jsonTools').classList.remove('hidden');
    }
  }
  let diagnosticsOpened = false;
  async function applyVisuals() {
    const card = await assets.resource('card-back');
    const table = await assets.resource('table-background');
    const deck = $('drawPile');
    deck.classList.toggle('custom-back', !!card?.type.startsWith('image/'));
    deck.style.backgroundImage = card?.type.startsWith('image/') ? 'url(' + JSON.stringify(card.data) + ')' : '';
    const arena = document.querySelector('.game-table');
    arena.classList.toggle('custom-table', !!table?.type.startsWith('image/'));
    arena.style.backgroundImage = table?.type.startsWith('image/') ? 'url(' + JSON.stringify(table.data) + ')' : '';
  }
  function applyPreferences() {
    const ids = ['sfxEnabled','sfxVolume','musicEnabled','musicVolume','musicShuffle','musicLoop','animationEnabled','animationIntensity','animationSpeed'];
    for (const id of ids) {
      if ($(id).type === 'checkbox') $(id).checked = !!prefs[id];
      else $(id).value = prefs[id];
    }
    $('sfxVolumeValue').textContent = prefs.sfxVolume + ' %';
    $('musicVolumeValue').textContent = prefs.musicVolume + ' %';
    $('animationValue').textContent = prefs.animationIntensity + ' %';
    $('animationSpeedValue').textContent = prefs.animationSpeed + ' %';
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.body.classList.toggle('reduced-animations', !prefs.animationEnabled || reduce);
    const speed = Math.max(.5,prefs.animationSpeed/100);
    document.documentElement.style.setProperty('--animation-speed', String(speed));
    document.documentElement.style.setProperty('--animation-intensity', String(Math.max(0,prefs.animationIntensity/100)));
    if (musicAudio) { musicAudio.volume = prefs.musicVolume/100;musicAudio.muted = muted;musicAudio.loop = prefs.musicLoop; if (!prefs.musicEnabled) musicAudio.pause(); }
  }
  async function playMusic(next = false) {
    if (musicAudio) { musicAudio.pause(); musicAudio = null; }
    if (!prefs.musicEnabled) { $('musicTrack').textContent = 'Musique désactivée'; return; }
    const list = assets.manifest?.config?.playlist || [];
    if (!list.length) { $('musicTrack').textContent = 'Aucune musique dans le JSON'; return; }
    musicIndex = next ? prefs.musicShuffle ? Math.floor(Math.random()*list.length) : (musicIndex + 1) % list.length : musicIndex % list.length;
    try {
      const media = await assets.resource(list[musicIndex]);
      if (!media?.type.startsWith('audio/')) throw new Error('Piste manquante');
      musicAudio = new Audio(media.data);
      musicAudio.volume = prefs.musicVolume / 100;
      musicAudio.muted = muted;
      musicAudio.loop = prefs.musicLoop;
      musicAudio.addEventListener('ended', () => { if (prefs.musicEnabled && !prefs.musicLoop) playMusic(true); });
      $('musicTrack').textContent = '♫ ' + media.name;
      await musicAudio.play();
    } catch (err) { $('musicTrack').textContent = 'Lecture impossible : appuie sur musique'; }
  }
  function downloadJson(data, name) {
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');a.href = url;a.download = name;a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function loadFileJson(file) {
    if (!file || file.size > 12*1024*1024) throw new Error('Fichier JSON trop volumineux.');
    return JSON.parse(await file.text());
  }
  async function showSlot() {
    const slot = $('customSlot').value.trim().toLowerCase() || $('mediaSlot').value;
    const deleted = assets.overrideData.deleted.includes(slot);
    $('mediaStatus').textContent = deleted ? `« ${slot} » supprimé localement (suppression conservée).` : assets.overrideData.media[slot] ? `« ${slot} » personnalisé.` : `« ${slot} » : valeur du JSON officiel.`;
  }
  $('settingsBtn').addEventListener('click',()=>{$('settingsModal').classList.remove('hidden');showSlot();});
  $('closeSettings').addEventListener('click',()=>$('settingsModal').classList.add('hidden'));
  $('settingsModal').addEventListener('click',e=>{if(e.target===$('settingsModal'))$('settingsModal').classList.add('hidden');});
  for (const id of ['sfxEnabled','sfxVolume','musicEnabled','musicVolume','musicShuffle','musicLoop','animationEnabled','animationIntensity','animationSpeed']) {
    $(id).addEventListener('change',async () => {
      prefs[id] = $(id).type === 'checkbox' ? $(id).checked : Number($(id).value);
      await assets.setSetting(id,prefs[id]);
      applyPreferences();
      if (id === 'musicEnabled' || id === 'musicShuffle' || id === 'musicLoop') playMusic();
    });
    if ($(id).type === 'range') $(id).addEventListener('input', () => {
      const out = $(id === 'sfxVolume' ? 'sfxVolumeValue' : id === 'musicVolume' ? 'musicVolumeValue' : id === 'animationIntensity' ? 'animationValue' : 'animationSpeedValue');
      out.textContent = $(id).value + ' %';
    });
  }
  $('nextMusic').addEventListener('click',()=>playMusic(true));
  $('mediaSlot').addEventListener('change',showSlot);
  $('customSlot').addEventListener('input',showSlot);
  $('saveMedia').addEventListener('click',async()=>{
    try {
      const file=$('mediaFile').files?.[0];if(!file)throw new Error('Choisis un fichier image ou audio.');
      const slot=$('customSlot').value.trim().toLowerCase()||$('mediaSlot').value;
      await assets.addResource(slot,file);
      await applyVisuals();
      for (const key of Object.keys(loadedSfx)) delete loadedSfx[key];
      showSlot();showToast('Média enregistré uniquement sur cet appareil.');
    }catch(err){showToast(err.message,true);}
  });
  $('deleteMedia').addEventListener('click',async()=>{
    const slot=$('customSlot').value.trim().toLowerCase()||$('mediaSlot').value;
    await assets.deleteResource(slot); await applyVisuals();
    for (const key of Object.keys(loadedSfx)) delete loadedSfx[key];
    showSlot();showToast('Suppression conservée localement.');
  });
  $('exportPrefs').addEventListener('click',()=>downloadJson(assets.exportPreferences(),'uno-personnalisations.json'));
  $('importPrefs').addEventListener('change',async e=>{
    try {await assets.importPreferences(await loadFileJson(e.target.files?.[0]));prefs=assets.settings();applyPreferences();await applyVisuals();showSlot();showToast('Personnalisations importées !');}
    catch(err){showToast(err.message,true);}e.target.value='';
  });
  $('restorePrefs').addEventListener('click',async()=>{
    if (!confirm('Effacer les personnalisations locales et restaurer les réglages officiels ? La partie en cours sera conservée.'))return;
    await assets.resetPreferences();prefs=assets.settings();applyPreferences();await applyVisuals();showSlot();showToast('Personnalisations restaurées.');
  });
  $('openJsonTools').addEventListener('click',()=>{diagnosticsOpened=true;$('jsonTools').classList.remove('hidden');$('settingsModal').classList.add('hidden');});
  $('checkJson').addEventListener('click',refreshResources);
  $('resetJson').addEventListener('click',async()=>{
    try {await assets.resetOfficialCache();await refreshResources();showToast('Fichiers officiels vérifiés.');}
    catch(err){$('jsonStatus').textContent=err.message;}
  });
  $('chooseJson').addEventListener('change',async e=>{
    try {
      const json=await loadFileJson(e.target.files?.[0]);
      if (json.format === 'uno-preferences-v1') { await assets.importPreferences(json);prefs=assets.settings();applyPreferences(); }
      else {await assets.chooseManifest(json);await assets.loadPack('visuals');}
      await applyVisuals();$('jsonStatus').textContent='Fichier JSON chargé. Les fragments liés doivent exister sur Render.';showToast('Fichier JSON accepté.');
    } catch(err) {$('jsonStatus').textContent=err.message;showToast('JSON invalide : '+err.message,true);}
    e.target.value='';
  });
  $('hideJsonTools').addEventListener('click',()=>{diagnosticsOpened=false;if(!forcedDiagnostics)$('jsonTools').classList.add('hidden');});
  window.addEventListener('keydown',e=>{if(e.key==='Escape')$('settingsModal').classList.add('hidden');});
  refreshResources();
})();
