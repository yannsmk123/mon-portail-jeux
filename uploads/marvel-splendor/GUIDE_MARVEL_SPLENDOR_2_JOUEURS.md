# MARVEL SPLENDOR — 2 joueurs en ligne

## À lire en premier

Votre jeu solo contre Ultron, ses règles, ses sons, ses images et les autres jeux du portail ont été conservés. Seuls les fichiers listés ci-dessous changent. Le mode réseau a été intégré au **même serveur Render**, sans service supplémentaire.

**Les deux joueurs doivent ouvrir Marvel Splendor depuis le portail Render** (par exemple `https://votre-portail.onrender.com/games/splendor/`). Le jeu ouvert directement en fichier local, sur GitHub Pages ou sur un autre hébergement ne possède pas ce serveur réseau.

**Important — limite du service Render gratuit :** les parties se reconnectent après une coupure Internet ou une fermeture d'onglet tant que le processus Render reste actif et que la salle n'a pas expiré (24 h d'inactivité). Si Render redémarre, se met en veille ou redéploie, la mémoire des salles disparaît. Il faut alors créer une nouvelle partie. Ne déployez pas de nouvelle version pendant une partie importante.

## Archives fournies

1. `MARVEL_SPLENDOR_PATCH_GITHUB.zip` : **recommandé pour installer**. Contient uniquement les fichiers nécessaires à copier dans votre dépôt GitHub existant.
2. `MON_PORTAIL_JEUX_COMPLET_2_JOUEURS.zip` : sauvegarde intégrale du portail avec tous les jeux et médias. **Ne chargez pas ce ZIP tel quel dans le portail** : c'est une archive de projet GitHub, pas un fichier de jeu à ajouter.

## Option A — méthode la plus simple : GitHub Desktop (aucune ligne de code)

1. Dans GitHub, ouvrez votre dépôt habituel `mon-portail-jeux` (le nom peut varier). **Avant de modifier quoi que ce soit**, faites une sauvegarde : bouton vert **Code** > **Download ZIP**. Conservez cette archive quelque part.
2. Installez **GitHub Desktop** via <https://desktop.github.com/> et connectez votre compte GitHub.
3. Cliquez **File** > **Clone repository** > onglet **GitHub.com**. Sélectionnez le dépôt de votre portail, puis **Clone**. Si le dépôt est déjà présent dans GitHub Desktop, ouvrez-le directement.
4. Cliquez **Fetch origin**, puis **Pull origin** si proposé : vous travaillez ainsi sur la version la plus récente.
5. Cliquez **Repository** > **Show in Explorer** (Windows) ou **Show in Finder** (Mac) pour ouvrir le dossier du projet.
6. Décompressez `MARVEL_SPLENDOR_PATCH_GITHUB.zip` dans un autre dossier. Ouvrez-le. Sélectionnez **tous ses fichiers et dossiers**, puis copiez-les dans **le dossier du projet GitHub** ouvert à l'étape 5. Acceptez **Remplacer les fichiers existants**. Important : copiez **le contenu** de l'archive, pas le dossier contenant l'archive.
7. Revenez dans GitHub Desktop, onglet **Changes**. Vous devriez voir les fichiers modifiés et ajoutés. Dans **Summary**, écrivez `Ajouter 2 joueurs en ligne à Marvel Splendor`.
8. Cliquez **Commit to main** (ou **Commit to [nom de branche]** si votre branche a un autre nom), puis **Push origin**.
9. Sur Render, si le déploiement automatique est activé, le nouveau déploiement démarre tout seul. Sinon, rendez-vous dans votre service web Render > **Manual Deploy** > **Deploy latest commit**. Vérifiez sur la page **Events / Deploys** que le dernier déploiement affiche **Live**.
10. Ouvrez votre portail Render, puis Marvel Splendor. Cliquez **🌐 2 joueurs en ligne**.

### Où vont exactement les fichiers du patch ?

| Chemin dans l'archive | Chemin dans votre dépôt GitHub |
| --- | --- |
| `server.js` | à la racine du dépôt, à côté de `render.yaml` |
| `package.json` | à la racine |
| `package-lock.json` | à la racine |
| `games-config.json` | à la racine |
| `splendor-online/server.js` | nouveau sous-dossier `splendor-online` |
| `uploads/marvel-splendor/index.html` | dossier existant `uploads` > `marvel-splendor` ; remplace **uniquement** `index.html` |
| `tests/splendor-online.test.js` | dossier existant `tests` (test technique, sans influence sur le jeu) |
| `GUIDE_MARVEL_SPLENDOR_2_JOUEURS.md` | à la racine (facultatif pour l'exécution) |

**Ne supprimez aucun fichier `marvel-splendor-assets.part-XX.txt`, ni `medias/`, ni les jeux `UNO_PARTY`, `marvel-fusion` ou `lost-cities-online`.**

## Option B — directement sur GitHub, sans installer de logiciel

Vous pouvez également extraire le ZIP de correctif et envoyer les fichiers via le navigateur en **3 groupes** :

1. Sur la page principale du dépôt, bouton **Add file** > **Upload files**. Glissez les quatre fichiers `server.js`, `package.json`, `package-lock.json` et `games-config.json` extraits du ZIP. En bas, saisissez un message, puis **Commit changes** / **Propose changes** (selon l'interface). Les fichiers portant le même nom remplaceront ceux de la même place.
2. Ouvrez le dossier **uploads** > **marvel-splendor** du dépôt. Faites **Add file** > **Upload files** et envoyez **seulement le nouveau `index.html`** du correctif. Validez.
3. Revenez à la racine du dépôt, faites **Add file** > **Upload files** et glissez le **dossier** `splendor-online` extrait du ZIP (ou créez ce dossier avec **Add file** > **Create new file**, nom `splendor-online/server.js`, puis collez le contenu : la méthode GitHub Desktop reste plus simple). Facultatif : envoyez aussi le test dans le dossier `tests`.
4. Déployez sur Render comme expliqué plus haut.

**Attention :** ne déposez pas l'archive `.zip` directement dans `uploads/`. Ce serait interprété comme un nouveau jeu, pas comme une mise à jour du portail.

## Comment jouer sur deux appareils

1. Sur **le premier appareil**, ouvrez le portail Render, choisissez **Marvel Splendor** > **🌐 2 joueurs en ligne** > **➕ Créer une partie**. Le jeu affiche un **code à six caractères**.
2. Envoyez ce code à votre ami par message. **Ne partagez pas votre accès personnel de reprise enregistré dans le navigateur** (il n'est pas affiché).
3. Sur **le second appareil**, ouvrez exactement le **même site Render** et le même jeu > **🌐 2 joueurs en ligne**. Saisissez le code, puis **🔗 Rejoindre avec le code**.
4. Le joueur 1 démarre automatiquement le plateau dès que le joueur 2 entre. Les cartes disponibles, les gemmes, les scores, les conquêtes et les tours sont synchronisés.
5. En cas de coupure, les actions sont temporairement bloquées et une reconnexion est tentée. Après avoir fermé l'onglet, rouvrez le jeu **sur le même appareil / navigateur** : il tente de reprendre automatiquement. Le bouton **↻ Reprendre ma partie** est aussi prévu.
6. Pour arrêter complètement, ouvrez le menu réseau et cliquez **✕ Quitter définitivement**. Pour revenir au mode solo, cliquez ensuite **Nouvelle partie** > **Contre Ultron**.

## Comment vérifier que le mode solo n'a pas changé

- Cliquez **Nouvelle partie** > **Contre Ultron** ; faites quelques tours en solo.
- Vérifiez que vos cartes et sons sont toujours présents.
- Revenez au portail et ouvrez UNO, Lost Cities et Marvel Fusion : aucun de leurs fichiers n'a été modifié.
- Testez une partie à deux, puis coupez le Wi-Fi pendant quelques secondes sur l'un des appareils. Réactivez-le et vérifiez que le même plateau revient.
- Testez aussi une fermeture/reprise de l'onglet (même appareil) tant que Render n'a pas redémarré.

## Si quelque chose ne fonctionne pas

- **Le bouton 2 joueurs est absent** : la nouvelle version de `uploads/marvel-splendor/index.html` n'a pas été envoyée dans le bon dossier. Rechargez également la page avec `Ctrl+F5`.
- **Connexion refusée / serveur indisponible** : vérifiez que les fichiers `server.js` et `splendor-online/server.js` sont tous les deux en place, ainsi que `package.json`, puis que Render affiche **Live**. Les deux joueurs doivent utiliser l'URL Render.
- **Code inconnu** : le serveur a peut-être redémarré, la salle a expiré, ou le code a été mal recopié. Créez une nouvelle partie.
- **Le joueur 2 ne voit pas l'image d'une carte personnalisée** : les personnalisations d'illustrations enregistrées uniquement dans un navigateur ne sont pas transférées. Les illustrations fournies avec le jeu restent disponibles sur les deux appareils.
- **Le portail ne démarre plus** : sur Render > **Events / Deploys**, ouvrez les journaux de déploiement. Vous pouvez faire **Rollback** vers un déploiement précédent réussi ou rétablir les fichiers depuis votre sauvegarde GitHub. Ne supprimez pas les autres jeux.

## Détails techniques, facultatifs

- Route réseau isolée : `/splendor-socket` (WebSocket sécurisé automatiquement en HTTPS).
- Un seul serveur Node (`npm start`) et un seul service Render. Les routes existantes de Marvel Fusion, Lost Cities et UNO restent intactes.
- Le joueur 1 valide les actions du joueur 2 dans **le moteur de règles original** ; le serveur garde le dernier état pour la reprise. Il s'agit d'un modèle hôte-autoritaire : il n'empêche pas un joueur 1 malveillant de modifier son propre navigateur.
- Les salons sont en mémoire (pas de stockage PostgreSQL de Splendor dans cette version) : **une reconnexion pendant la vie du service est gérée, pas une reprise garantie après redémarrage Render**.
- Les sauvegardes du solo utilisent toujours leur stockage d'origine et ne sont jamais remplacées par l'état d'une partie réseau.
