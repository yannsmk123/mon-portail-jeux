# Lost Cities Duel Fusion V107 — Installer le mode « 2 joueurs en ligne » sur GitHub et Render

Ce guide est écrit pour quelqu'un qui **ne programme pas**. Vous pouvez tester avec deux appareils, sur des réseaux différents. **Ne remplacez aucun fichier de votre portail existant** par ce pack.

## 1 — Ce qui est fourni

Le dossier `lost-cities-online/` comprend :

| Fichier | Utilité |
|---|---|
| `index.html` | Jeu complet : solo contre IA, deux joueurs sur le même écran, deux joueurs en ligne, visuels et personnalisation |
| `server.js` | Serveur Node.js : parties, règles, actions et protection des cartes cachées |
| `config.json` | Configuration pour l'essai sur votre PC (Render utilise automatiquement son propre port) |
| `package.json` | Permet à Render de démarrer le serveur avec `npm start` |
| `.gitignore` | Évite de mettre vos sauvegardes privées sur GitHub |
| `tests/smoke.test.js` | Vérifications automatiques facultatives |
| `DEMARRER_WINDOWS.bat` | Essai local sur Windows (facultatif) |
| `data/LISEZ_MOI.txt` | Explique l'emplacement des sauvegardes |

**Important :** seul le code du jeu va sur GitHub. Les jetons secrets, mains et ordres de pioche sont conservés dans le serveur, pas envoyés à l'adversaire. Le code d'invitation n'est pas un jeton de reconnexion.

## 2 — Solution recommandée : un nouveau dépôt GitHub pour le jeu

Cette méthode est la plus sûre pour **ne pas casser les autres jeux de votre portail**. Vous aurez un site Render pour Lost Cities Duel, et votre portail pointera simplement vers ce site.

1. Sur votre ordinateur, téléchargez le ZIP fourni dans la conversation.
2. Faites **clic droit → Extraire tout** pour obtenir le dossier `lost-cities-online`.
3. Ouvrez [github.com](https://github.com/), connectez-vous.
4. En haut, cliquez sur le symbole **+**, puis **New repository** (Nouveau dépôt).
5. Nom du dépôt : `lost-cities-duel-online`. Choisissez **Private** si vous préférez garder le code non public (Render doit avoir accès au dépôt). Cliquez sur **Create repository**.
6. Dans le nouveau dépôt, cliquez sur **uploading an existing file** si ce lien apparaît, ou **Add file → Upload files**.
7. Ouvrez le dossier `lost-cities-online` sur votre ordinateur, sélectionnez les fichiers et le dossier `tests`, puis glissez-les sur la zone GitHub. **Vérifiez que `server.js`, `index.html` et `package.json` sont visibles dans la racine du dépôt** (pas un niveau trop profond). Conservez `tests/smoke.test.js` dans son sous-dossier.
8. En bas, cliquez sur **Commit changes**.

Si vous avez placé le dossier **entier** `lost-cities-online/` dans le dépôt (au lieu de déposer son contenu), c'est également possible : le réglage Render **Root Directory** devra alors être `lost-cities-online`. Voir étape suivante.

## 3 — Créer le serveur sur Render

1. Allez sur [dashboard.render.com](https://dashboard.render.com/) et connectez-vous.
2. Cliquez sur **New + → Web Service** (**pas** « Static Site » : le mode réseau a besoin d'un serveur Node.js).
3. Sélectionnez votre dépôt GitHub `lost-cities-duel-online`, puis **Connect**. Si Render demande d'autoriser GitHub, acceptez pour ce dépôt.
4. Remplissez les champs comme ci-dessous.

| Champ sur Render | Valeur |
|---|---|
| **Name** | `lost-cities-duel-online` (ou autre nom disponible) |
| **Language / Runtime** | `Node` |
| **Branch** | `main` |
| **Root Directory** | *vide* si `server.js` est à la racine GitHub ; `lost-cities-online` si les fichiers sont dans ce dossier |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type / Plan** | `Free` pour commencer à tester |
| **Health Check Path** (facultatif) | `/health` |

5. Cliquez sur **Create Web Service** / **Deploy Web Service**.
6. Dans l'onglet **Logs** / **Deploys**, attendez que Render indique **Live** ou **Deploy succeeded**.
7. Render affiche une adresse HTTPS du type : `https://lost-cities-duel-online.onrender.com` (c'est **un exemple**, utilisez la vraie URL affichée chez vous).
8. Cliquez sur cette adresse pour ouvrir le jeu. Puis testez la santé du serveur en ajoutant `/health` à la fin : la page doit contenir `"ok":true`.

**Vous n'avez pas besoin d'installer Node.js sur les deux ordinateurs pour utiliser Render.** Render exécute Node.js pour vous. Vous n'avez pas besoin de votre IP 192.168.x.x, de modifier le pare-feu Windows ou d'ouvrir des ports sur la box.

## 4 — Faire une partie entre deux appareils

1. Les **deux personnes** ouvrent exactement **la même URL Render** dans Chrome, Firefox, Edge ou Safari. Les appareils peuvent être sur des réseaux Internet différents.
2. Joueur 1 : dans le menu, cliquez **« 2 joueurs en ligne » → « Créer une partie »**.
3. Indiquez votre pseudonyme et choisissez 5/6 expéditions, 1/3 manches, ordre de départ.
4. Cliquez sur **« Créer un salon »**. Un code de **6 caractères** s'affiche.
5. Envoyez le code au joueur 2, ou cliquez **« Copier le lien d'invitation »** et partagez ce lien.
6. Joueur 2 : ouvrez ce lien (le formulaire se remplit automatiquement) ou saisissez le code dans **« Rejoindre un ami »**. Cliquez sur **« Rejoindre le salon »**.
7. Le jeu démarre automatiquement. Chacun ne voit que **sa propre main**. Le plateau, les défausses, la pioche, les scores et les tours sont synchronisés.
8. Si une connexion est coupée, conservez l'onglet ou rechargez-le : le jeu retente la connexion avec la session sauvegardée dans votre navigateur, si le serveur possède encore la partie.

**Ne cliquez pas sur « Quitter le salon » si vous voulez seulement vous reconnecter** : ce bouton supprime le jeton local de reconnexion.

## 5 — Conserver le mode solo et éviter les conflits

- Le **mode Solo contre IA** est toujours dans `index.html` du jeu en ligne. Il ne demande aucun deuxième joueur.
- Le mode **Deux joueurs sur le même écran** reste aussi disponible.
- **Ne supprimez ni ne remplacez** les jeux et fichiers existants du portail.
- Sur votre portail, ajoutez **un nouveau jeu / une nouvelle vignette / un nouveau lien**, nommé « Lost Cities Duel — 2 joueurs en ligne », dont l'adresse est **la vraie URL Render** obtenue à l'étape 3. Si votre portail possède un formulaire « Ajouter un jeu », utilisez-le ; si son fonctionnement repose sur des fichiers HTML ou JSON, il faudra adapter ces fichiers après avoir vu leur structure exacte.
- La playlist musicale, les images personnelles et les noms de cartes sont **enregistrés séparément dans chaque navigateur**. Ils ne sont pas encore envoyés automatiquement entre joueurs ; chacun peut importer ses personnalisations.

### Si vous voulez absolument utiliser votre dépôt GitHub actuel (portail)

1. Dans **le dépôt du portail**, ajoutez **un nouveau sous-dossier** `lost-cities-online` et mettez-y tous les fichiers de ce pack.
2. **Ne touchez pas** au fichier `index.html`, à `package.json`, ni aux services Render existants du portail.
3. Créez un **nouveau Web Service Render** à partir du même dépôt, avec **Root Directory** = `lost-cities-online`, **Build** = `npm install` et **Start** = `npm start`.
4. Le nouveau service aura sa **propre URL**. Ajoutez seulement cette URL comme nouveau lien depuis le portail.

Cela évite qu'un serveur Node.js ajouté à la racine remplace le portail ou ses autres jeux.

## 6 — À savoir sur Render gratuit (TRÈS IMPORTANT)

Render **Free** arrête les services après une période d'inactivité (environ 15 minutes). Le réveil peut prendre une minute. **Les fichiers créés pendant l'exécution sont temporaires** et peuvent disparaître après redémarrage, mise en veille ou déploiement. Cela concerne notamment `data/parties.json`. Il est donc possible de **perdre un salon en cours**. La reconnexion fonctionne si le serveur possède encore les données ; elle ne ressuscite pas une salle effacée.

**Pour des parties durables**, la solution la plus simple est de passer à un **Web Service Render payant avec disque persistant** :

1. Dans Render, ouvrez le service Lost Cities, puis **Disk → Add Disk** (ou l'option disque dans les réglages avancés).
2. Montez le disque à l'emplacement `/var/data`.
3. Dans **Environment**, ajoutez la variable : nom **`DATA_FILE`**, valeur **`/var/data/parties.json`**.
4. Redéployez le service. Les salons créés **après** cette configuration pourront survivre aux redémarrages du processus (sous réserve de la disponibilité du stockage).

Render Free **ne prend pas en charge les disques persistants**. Il n'est pas nécessaire d'avoir un disque pour tester les parties en ligne, seulement pour conserver fiablement les parties entre les redémarrages.

## 7 — Vérification si quelque chose ne marche pas

- **« Service unavailable » / page très lente** : Render Free est peut-être en train de sortir de veille. Regardez **Render → Logs**.
- **`/health` ne montre pas `"ok":true`** : Render n'a probablement pas démarré le service. Vérifiez **Build Command**, **Start Command** et **Root Directory**.
- **« Salon introuvable »** : vérifiez les 6 caractères ; si Render a redémarré sans stockage persistant, créez une nouvelle partie.
- **« Salon complet »** : la place du joueur 2 est déjà occupée ; les deux joueurs existants peuvent se reconnecter depuis leurs navigateurs d'origine.
- **Le joueur 2 ne voit pas le jeu** : il doit utiliser l'adresse **https://...onrender.com** du jeu, et non l'adresse IP du PC 1 ou un fichier HTML ouvert en local.
- **Graphismes différents** : les illustrations personnalisées ne sont pas synchronisées. Importez les mêmes jeux de cartes sur les deux navigateurs.

## 8 — Essai local sur Windows (facultatif)

Si vous souhaitez tester sans Render, installez Node.js LTS depuis https://nodejs.org, décompressez le pack, double-cliquez sur `DEMARRER_WINDOWS.bat`, puis ouvrez `http://localhost:3000`. Le deuxième PC sur le même réseau utilisera l'adresse IP locale du PC hôte. Cette méthode est **facultative** pour les parties en ligne sur Render.

## 9 — Vérifications techniques réalisées

- Vérification de syntaxe JavaScript et démarrage Node.js.
- Tests automatiques serveur : création, confidentialité des mains et de la pioche, refus d'un troisième joueur, validation des coups, sauvegardes, scores et passage à la manche suivante.
- Test de deux navigateurs Chromium indépendants, avec accès réseau simulé vers un serveur Node.js réel : création du salon, connexion, pioche, défausse et synchronisation.
- Test de l'affichage du menu Solo et réseau ; **pas de déploiement réel sur votre compte GitHub ou Render**, car ces comptes ne sont pas connectés ici.

Les règles, les tours et les scores sont gérés par le serveur en mode en ligne. **L'IA solo et le jeu local restent côté navigateur**, donc ils ne sont pas dépendants des deux connexions réseau.
