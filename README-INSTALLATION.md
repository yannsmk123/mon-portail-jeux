# 🎉 UNO PARTY V3 — Intégration pour MY GAME ARCADE

Ce pack a été adapté à la structure publique du dépôt **github.com/yannsmk123/mon-portail-jeux** consultée le **31 octobre 2026**. Le portail est écrit en **Node.js avec `node:http`**, **pas en Express**. Il sert Marvel Fusion, Marvel Splendor et Lost Cities depuis **un seul port**. Le portail affiche automatiquement les jeux trouvés dans `uploads/`.

## Installation recommandée (GitHub Desktop)

1. Sur ton ordinateur, ouvre **GitHub Desktop**, clone/synchronise le dépôt `yannsmk123/mon-portail-jeux` (branche `main`). Pense à garder une sauvegarde ou créer une branche `ajout-uno`.
2. **Décompresse ce ZIP dans le dossier local du dépôt**. Les dossiers `uploads`, `uno-server`, `scripts` et `tests` doivent être **fusionnés**, et les fichiers existants de Marvel/Lost Cities conservés. Le ZIP **ne contient pas** de `server.js` ni de `portal.js` à remplacer.
3. Ouvre un terminal dans la racine du dépôt (là où se trouvent `server.js` et `package.json`). Exécute :

   ```bash
   node scripts/installer-uno.js
   npm install
   npm test
   npm start
   ```

   Le script insère uniquement les lignes UNO dans `server.js`, ajoute `socket.io` / `pg` à `package.json`, et une fiche UNO à `games-config.json`. Il **refuse** de patcher si la structure du serveur a changé.
4. Ouvre `http://localhost:3000/games/uno/` dans deux navigateurs/onglets différents. Crée un salon puis rejoins-le avec son code. Contrôle aussi l'accueil et les jeux existants.
5. Reviens à GitHub Desktop : vérifie les modifications, committe et pousse vers GitHub. Render a déjà `npm install`, `npm start`, et le déploiement automatique sur commit via `render.yaml`.
6. Après le déploiement réussi, UNO sera accessible à **https://mon-portail-jeux.onrender.com/games/uno/** et listé sur l'accueil, sans redirection GitHub Pages.

## Pourquoi ne pas envoyer simplement un ZIP depuis « Ajouter un jeu » ?

Parce que ce jeu est multijoueur : le bouton d'import de jeux du portail ne peut installer que les fichiers statiques HTML/ZIP. L'autorité réseau pour les cartes, les salons et les bots doit être raccordée **une fois au serveur Node.js**, via l'installateur. **Il ne faut pas téléverser l'archive V3 entière** via le bouton « Ajouter un jeu ».

## Fichiers installés

```text
mon-portail-jeux/
├── server.js               ← modifié très localement par l'installateur
├── package.json            ← deux dépendances ajoutées sans toucher aux scripts
├── games-config.json       ← entrée « uno » ajoutée
├── public/                 ← INCHANGÉ
├── marvel/                 ← INCHANGÉ
├── lost-cities-online/     ← INCHANGÉ
├── uploads/
│   ├── marvel-splendor/    ← INCHANGÉ
│   └── uno/
│       ├── index.html
│       ├── app.js
│       ├── media-loader.js
│       ├── styles.css
│       ├── assets.json
│       ├── favicon.svg
│       └── packs/*.txt
├── uno-server/
│   ├── game.js
│   ├── uno-module.js
│   ├── native.js           ← Nouveau raccordement au vrai serveur HTTP
│   ├── static.js           ← Fichiers UNO diffusés à la demande
│   └── persistence.js
├── scripts/installer-uno.js
└── tests/uno-*.test.js    ← Tests UNO (en plus des tests du portail)
```

## Données, confidentialité, performances

- Les salons et mains sont contrôlés par le serveur. Les mains adverses ne sont pas exposées aux autres joueurs.
- Le **code d'accès de ton portail** (`SITE_ACCESS_CODE`), si activé, est vérifié aussi au moment de la connexion Socket.IO.
- Le manifeste JSON vérifie les empreintes et utilise IndexedDB : les médias inchangés sont réutilisés, et la musique n'est chargée que sur demande.
- Les fichiers `.txt` des packs sont servis au besoin depuis `uploads/uno/packs/`, sans être tous stockés en RAM côté serveur.
- Avec `DATABASE_URL` (PostgreSQL) configuré sur Render, les salons peuvent être conservés. Sans PostgreSQL, les salons disparaissent après redémarrage du service. Les réglages restent dans le navigateur.
- Les règles du jeu sont une adaptation simplifiée de UNO (sans contestation du +4 ni cumul de +2).

## Autres précautions

- **Ne pas remplacer `server.js` par un serveur de démonstration** : cela casserait le portail.
- Le script ne touche ni `public/portal.js` ni `public/index.html` : ton catalogue existe déjà et lit `uploads/uno/index.html`.
- `npm install` peut être effectué sur ton ordinateur et, sur Render, sera relancé automatiquement d'après `render.yaml`.
- Après une modification GitHub récente du portail, l'installateur pourrait refuser de modifier `server.js` : dans ce cas, ne force pas, fais vérifier les ancres de la version actuelle.
- Sauvegarde de préférence / ressources personnalisées ≠ sauvegarde des parties multijoueurs.

## Vérifications / limites

Les tests unitaires des règles et du cache peuvent s'exécuter avec `node --test tests/*.test.js`. Une intégration en situation réelle avec 2 à 4 connexions Socket.IO et un navigateur doit être effectuée après `npm install` et le déploiement. **Aucune publication GitHub ni mise en ligne Render n'a été réalisée par l'assistant**.
