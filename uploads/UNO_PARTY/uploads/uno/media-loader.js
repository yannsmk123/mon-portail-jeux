/* UNO Party / MY GAME ARCADE — medias versionnes, cache IndexedDB et preferences separees.
   Ne contient aucun code relatif aux regles, aux cartes distribuees ou aux salons. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UnoAssets = api;
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict';
  const DB_NAME = 'my-game-arcade-uno-media-v1';
  const MAX_PACK_BYTES = 100 * 1024 * 1024;
  const MAX_CUSTOM_BYTES = 5 * 1024 * 1024;
  const MIME = /^(image\/(?:png|jpeg|webp|svg\+xml)|audio\/(?:mpeg|ogg|wav|mp4))$/;
  const safePath = p => typeof p === 'string' && /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(p) && !p.split('/').some(x => x === '.' || x === '..');
  const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  const defaults = {
    sfxEnabled: true, sfxVolume: 60, musicEnabled: false, musicVolume: 25,
    musicShuffle: false, musicLoop: true,
    animationEnabled: true, animationIntensity: 100, animationSpeed: 100
  };
  class UnoMediaStore {
    constructor({base = './', fetcher, dbFactory, cryptoImpl} = {}) {
      this.base = new URL(base, typeof location === 'undefined' ? 'http://localhost/games/uno/' : location.href);
      this.fetcher = fetcher || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
      this.dbFactory = dbFactory === undefined ? (typeof indexedDB !== 'undefined' ? indexedDB : null) : dbFactory;
      this.crypto = cryptoImpl || (typeof crypto !== 'undefined' ? crypto : null);
      this.manifest = null;
      this.overrideData = { settings: {}, media: {}, deleted: [] };
      this.memory = new Map();
      this.dbPromise = null;
      this.degraded = !this.dbFactory;
    }
    async db() {
      if (!this.dbFactory) return null;
      if (!this.dbPromise) this.dbPromise = new Promise(resolve => {
        try {
          const req = this.dbFactory.open(DB_NAME, 1);
          req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains('values')) req.result.createObjectStore('values');
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => { this.degraded = true; resolve(null); };
          req.onblocked = () => { this.degraded = true; resolve(null); };
        } catch { this.degraded = true; resolve(null); }
      });
      return this.dbPromise;
    }
    async read(key) {
      const db = await this.db();
      if (!db) return this.memory.get(key);
      return new Promise(resolve => {
        const tx = db.transaction('values', 'readonly');
        const req = tx.objectStore('values').get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(this.memory.get(key));
      });
    }
    async write(key, val) {
      this.memory.set(key, val);
      const db = await this.db();
      if (!db) return;
      return new Promise((resolve, reject) => {
        const tx = db.transaction('values', 'readwrite');
        tx.objectStore('values').put(val, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(new Error('Cache navigateur indisponible.'));
      });
    }
    async remove(key) {
      this.memory.delete(key);
      const db = await this.db();
      if (!db) return;
      return new Promise(resolve => {
        const tx = db.transaction('values', 'readwrite');
        tx.objectStore('values').delete(key);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }
    async hash(bytes) {
      if (!this.crypto?.subtle) throw new Error('Vérification SHA-256 indisponible : utilise HTTPS ou localhost.');
      return hex(await this.crypto.subtle.digest('SHA-256', bytes));
    }
    validateManifest(manifest) {
      if (!manifest || manifest.schemaVersion !== 1 || typeof manifest.version !== 'string' || !Array.isArray(manifest.packs) || !manifest.config || !manifest.assetIndex) {
        throw new Error('Format du manifeste assets.json non reconnu.');
      }
      if (manifest.packs.length > 40) throw new Error('Trop de packs.');
      for (const pack of manifest.packs) {
        if (!/^[a-z0-9_-]{1,40}$/.test(pack.id || '') || !/^[a-f0-9]{64}$/.test(pack.sha256 || '') || !Array.isArray(pack.parts) || !pack.parts.length || pack.parts.length > 200 || typeof pack.version !== 'string') {
          throw new Error('Description d’un pack invalide.');
        }
        if (pack.parts.some(p => !safePath(p.path) || !/^[a-f0-9]{64}$/.test(p.sha256 || ''))) throw new Error('Chemin ou empreinte de fichier incorrect.');
      }
      return manifest;
    }
    async check() {
      if (!this.fetcher) throw new Error('Téléchargement des médias indisponible.');
      try {
        const res = await this.fetcher(new URL('assets.json', this.base).href, {cache: 'no-store'});
        if (!res.ok) throw new Error('Manifeste introuvable (HTTP ' + res.status + ').');
        const manifest = this.validateManifest(await res.json());
        this.manifest = manifest;
        this.offline = false;
        await this.write('manifest', manifest);
      } catch (err) {
        const cached = await this.read('manifest');
        if (!cached) throw err;
        this.manifest = this.validateManifest(cached);
        this.offline = true;
      }
      const selected = await this.read('custom-manifest');
      if (selected) this.manifest = this.validateManifest(selected);
      this.overrideData = this.sanitizeOverrides(await this.read('overrides'));
      return this.manifest;
    }
    async loadPack(id) {
      if (!this.manifest) await this.check();
      const pack = this.manifest.packs.find(p => p.id === id);
      if (!pack) throw new Error('Pack inconnu : ' + id);
      const cacheKey = 'pack:' + id;
      const cached = await this.read(cacheKey);
      if (cached && cached.version === pack.version && cached.sha256 === pack.sha256) return cached.payload;
      const pieces = [];
      let size = 0;
      for (const part of pack.parts) {
        const res = await this.fetcher(new URL(part.path, this.base).href, {cache: 'no-cache'});
        if (!res.ok) throw new Error('Ressource manquante : ' + part.path);
        const arr = new Uint8Array(await res.arrayBuffer());
        size += arr.length;
        if (size > MAX_PACK_BYTES) throw new Error('Pack trop volumineux.');
        if (await this.hash(arr) !== part.sha256) throw new Error('Intégrité SHA-256 invalide : ' + part.path);
        pieces.push(arr);
      }
      const buffer = new Uint8Array(size);
      let offset = 0;
      for (const arr of pieces) { buffer.set(arr, offset); offset += arr.length; }
      if (await this.hash(buffer) !== pack.sha256) throw new Error('Intégrité du pack invalide : ' + id);
      let payload;
      try { payload = JSON.parse(new TextDecoder().decode(buffer)); }
      catch { throw new Error('Pack JSON illisible : ' + id); }
      if (!payload || !Array.isArray(payload.assets) || payload.assets.length > 500) throw new Error('Contenu du pack invalide.');
      await this.write(cacheKey, {version:pack.version,sha256:pack.sha256,payload});
      return payload;
    }
    async resource(slot) {
      if (!this.manifest) await this.check();
      if (this.overrideData.deleted.includes(slot)) return null; // suppression persistante
      const override = this.overrideData.media[slot];
      if (override) return override;
      const id = this.manifest.config.bindings?.[slot];
      const packId = this.manifest.assetIndex[id];
      if (!packId) return null;
      const payload = await this.loadPack(packId);
      const item = payload.assets.find(asset => asset.id === id);
      if (!item || !MIME.test(item.mime) || !/^[A-Za-z0-9+/=]+$/.test(item.base64)) return null;
      return {type:item.mime, data:'data:' + item.mime + ';base64,' + item.base64, name:item.name || id};
    }
    settings() { return {...defaults,...this.manifest?.config?.defaults,...this.overrideData.settings}; }
    sanitizeOverrides(raw) {
      const clean = {settings:{},media:{},deleted:[]};
      if (!raw || typeof raw !== 'object') return clean;
      for (const key of Object.keys(defaults)) {
        const value = raw.settings?.[key];
        if (typeof defaults[key] === 'boolean' && typeof value === 'boolean') clean.settings[key] = value;
        if (typeof defaults[key] === 'number' && Number.isFinite(value)) clean.settings[key] = Math.max(0, Math.min(200, value));
      }
      if (Array.isArray(raw.deleted)) clean.deleted = [...new Set(raw.deleted.filter(x => typeof x === 'string' && /^[a-z0-9_-]{1,60}$/.test(x)))].slice(0, 200);
      if (raw.media && typeof raw.media === 'object') {
        for (const [key, value] of Object.entries(raw.media).slice(0, 100)) {
          if (/^[a-z0-9_-]{1,60}$/.test(key) && value && MIME.test(value.type || '') && typeof value.data === 'string' && value.data.startsWith('data:' + value.type + ';base64,') && value.data.length < MAX_CUSTOM_BYTES * 1.4) {
            clean.media[key] = {type:value.type,data:value.data,name:String(value.name || key).slice(0,100)};
          }
        }
      }
      return clean;
    }
    async setSetting(key, value) {
      const candidate = this.sanitizeOverrides({settings:{[key]:value}});
      if (!Object.prototype.hasOwnProperty.call(candidate.settings,key)) return;
      this.overrideData.settings[key] = candidate.settings[key];
      await this.write('overrides', this.overrideData);
    }
    async addResource(slot, file) {
      if (!/^[a-z0-9_-]{1,60}$/.test(slot)) throw new Error('Identifiant invalide (lettres minuscules, chiffres et tirets).');
      if (!MIME.test(file.type) || file.size > MAX_CUSTOM_BYTES) throw new Error('Format non reconnu ou média supérieur à 5 Mo.');
      const data = await new Promise((resolve,reject) => { const reader = new FileReader();reader.onload = () => resolve(reader.result);reader.onerror = () => reject(new Error('Lecture impossible.'));reader.readAsDataURL(file); });
      const next = {...this.overrideData,media:{...this.overrideData.media,[slot]:{type:file.type,data,name:file.name}},deleted:this.overrideData.deleted.filter(x => x !== slot)};
      await this.write('overrides', next);
      this.overrideData = next;
    }
    async deleteResource(slot) {
      if (!/^[a-z0-9_-]{1,60}$/.test(slot)) return;
      const media = {...this.overrideData.media};delete media[slot];
      const next = {...this.overrideData,media,deleted:[...new Set([...this.overrideData.deleted,slot])]};
      await this.write('overrides', next);
      this.overrideData = next;
    }
    async resetPreferences() {
      this.overrideData = this.sanitizeOverrides(null);
      await this.remove('overrides');
    }
    async importPreferences(data) {
      if (!data || data.format !== 'uno-preferences-v1') throw new Error('Fichier de préférences non reconnu.');
      const next = this.sanitizeOverrides(data.preferences);
      await this.write('overrides', next);
      this.overrideData = next;
    }
    exportPreferences() { return {format:'uno-preferences-v1',exportedAt:new Date().toISOString(),preferences:this.overrideData}; }
    async chooseManifest(json) {
      const manifest = this.validateManifest(json);
      if (!manifest.packs.some(p => p.id === 'visuals')) throw new Error('Pack visuals obligatoire.');
      const previous = this.manifest;
      this.manifest = manifest;
      try {
        await this.loadPack('visuals'); // vérifier les fragments AVANT de conserver le nouveau manifeste
        await this.write('custom-manifest', manifest);
        return manifest;
      } catch (err) {this.manifest = previous;throw err;}
    }
    async resetOfficialCache() {
      if (!this.manifest) await this.check();
      await this.remove('custom-manifest');
      for (const pack of this.manifest.packs) await this.remove('pack:' + pack.id);
      // La personnalisation est conservee volontairement : jamais confondue avec les ressources communes.
      return this.check();
    }
  }
  return {UnoMediaStore, defaults};
});
