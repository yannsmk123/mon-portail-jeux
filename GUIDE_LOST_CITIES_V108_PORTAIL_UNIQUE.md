# Lost Cities Duel — Fusion V108 : installation sur TON portail existant

## Résultat

Cette version intègre Lost Cities directement dans `mon-portail-jeux` avec **UN SEUL service Render**. Il n'est pas nécessaire de créer un deuxième service ou un nouveau dépôt GitHub.

- Le portail et Marvel Fusion restent présents.
- Lost Cities apparaît automatiquement dans le catalogue sous « LOST CITIES DUEL — FUSION ».
- Clic sur « Jouer » : `https://mon-portail-jeux.onrender.com/games/lost-cities-duel/`.
- La même page propose trois modes : **Solo contre IA**, **Deux joueurs (même écran)** et **🌐 2 joueurs en ligne**.
- Le mode en ligne utilise `https://mon-portail-jeux.onrender.com/api/lost-cities/...`, sur le même port que ton portail. Il ne remplace pas les API Marvel (`/api/create`, `/api/state`, etc.).
- Le jeu crée des salons privés (code à 6 caractères), protège la main de l'adversaire et permet de reprendre une partie tant que le serveur conserve ses données.

## Méthode recommandée : installer le petit ZIP de mise à jour

Avant tout, fais une copie de sauvegarde de ton dépôt : sur GitHub, **Code → Download ZIP**. Garde ce fichier sur ton ordinateur.

1. Télécharge `MISE_A_JOUR_portail_Lost_Cities_V108.zip` fourni avec ce guide.
2. Sur ton ordinateur, décompresse le ZIP. Il contient **6 fichiers** rangés comme dans ton projet GitHub :

   ```text
   games-config.json
   package.json
   server.js
   lost-cities-online/
     index.html
     server.js
   tests/
     lost-cities-portal.test.js
   ```

3. Ouvre GitHub, puis **ton dépôt mon-portail-jeux** (branche `main`). Tu dois voir les dossiers `marvel`, `public`, `tests`, `uploads`, `lost-cities-online` ainsi que `server.js` et `games-config.json`.
4. Dans la page principale du dépôt (pas dans un sous-dossier), clique **Add file → Upload files**.
5. **Glisse le contenu du dossier décompressé dans GitHub** : les trois fichiers racine `server.js`, `package.json`, `games-config.json`, ainsi que les deux dossiers `lost-cities-online` et `tests`. Tu peux déposer le dossier complet des fichiers de mise à jour si GitHub conserve leurs sous-dossiers, mais vérifie bien l'arborescence avant validation.
6. Vérifie que GitHub annonce la mise à jour des fichiers existants, **pas la création d'un dossier supplémentaire** `MISE_A_JOUR_portail...` ou `mon-portail-jeux-main` à la racine.
7. Termine avec **Commit changes**.

Si l'envoi en une seule fois ne fonctionne pas, fais-le plus simplement **fichier par fichier** : ouvre le fichier à remplacer dans GitHub → icône du crayon **Edit this file** → colle le contenu du fichier de même nom fourni dans le ZIP → **Commit changes**. Pour `tests/lost-cities-portal.test.js`, ajoute le fichier au sous-dossier `tests` (il est seulement destiné aux vérifications, donc il n'empêche pas le jeu de fonctionner si tu l'omets).

**NE FAIS PAS** les opérations suivantes :
- Ne dépose PAS ce ZIP dans le dossier `uploads/` ni dans le bouton « + Ajouter un jeu » du portail : ce ZIP contient un serveur, pas seulement un jeu HTML.
- Ne supprime PAS `marvel/`, `public/`, `uploads/`, `zip-games.js`, `render.yaml` et leurs contenus.
- Ne remplace PAS tout ton site par l'ancien `server.js` indépendant de Lost Cities.
- Ne crée PAS de deuxième service Render : le serveur principal pilote maintenant les deux jeux.

## Sur Render (ton service existant)

1. Ouvre https://dashboard.render.com/ et connecte-toi.
2. Clique **mon-portail-jeux**, ton service Render **déjà existant**.
3. Va dans **Events / Deploys** et vérifie que le commit GitHub de la mise à jour est pris en compte.
4. Si rien ne démarre automatiquement, sélectionne **Manual Deploy → Deploy latest commit**.
5. Le service doit finir avec le statut **Live**.
6. **Ne change pas** le répertoire racine (Root Directory) actuel de ton service ; il doit continuer à utiliser le `package.json` et le `server.js` de ton portail. La commande de lancement reste `npm start`.
7. Ouvre https://mon-portail-jeux.onrender.com/ et actualise avec `Ctrl + F5` (ou Ctrl + Maj + R).
8. Tu dois voir **MARVEL FUSION** et **LOST CITIES DUEL — FUSION** dans la bibliothèque.

### Vérification simple

- Portail : https://mon-portail-jeux.onrender.com/
- Lost Cities : https://mon-portail-jeux.onrender.com/games/lost-cities-duel/
- Santé du serveur : https://mon-portail-jeux.onrender.com/health

Sur la page santé, la valeur `"games"` doit être au moins `2` si Marvel Fusion est toujours installé.

## Faire une partie en ligne avec deux PC ou deux téléphones

1. Chacun ouvre **la même adresse du portail**, même si les appareils ne sont pas sur le même Wi-Fi.
2. Chacun clique sur la vignette **LOST CITIES DUEL — FUSION**.
3. Sur le premier appareil, clique **🌐 2 joueurs en ligne → Créer un salon**.
4. Copie le **code à six caractères** ou le **lien d'invitation**.
5. Sur le deuxième appareil, ouvre le lien ou clique **🌐 2 joueurs en ligne → Rejoindre le salon** et saisis le code.
6. Le jeu commence automatiquement. Les deux joueurs ne voient que leur propre main.
7. Si la connexion coupe, recharge la page **sur le même navigateur** : le jeu essaie de reprendre la session. Ne clique pas sur « Quitter le salon » si tu souhaites te reconnecter.

## Pour ajouter un jeu futur

Ton portail actuel détecte automatiquement les **fichiers `.html` et `.zip` ajoutés dans le dossier `uploads/`** et les affiche dans la bibliothèque au redéploiement. Pour un jeu solo HTML sans serveur, c'est la méthode habituelle : GitHub → `uploads` → **Add file → Upload files** → ton jeu HTML/ZIP → **Commit changes**. Le catalogue les publie à l'adresse `/games/nom-du-fichier/`.

En revanche, un jeu multijoueur qui possède son **propre `server.js`** nécessite une intégration de ses routes dans le serveur principal : **il ne suffit pas de déposer son ZIP dans `uploads`**. C'est précisément ce qui a été réalisé pour Lost Cities.

## Sauvegardes des parties et Render gratuit

Le mode en ligne conserve les salons temporairement dans `lost-cities-online/data/parties.json`, sur le **serveur Render**, pas sur GitHub. Sur un service Render **gratuit**, le disque du serveur est éphémère : un redéploiement ou redémarrage peut effacer les salons. Une reconnexion ne peut donc être garantie **qu'aussi longtemps que la sauvegarde existe**. Pour des parties qui résistent aux redémarrages, il faudra ensuite une base de données externe persistante. Les préférences et images personnalisées restent locales à chaque navigateur.

Si tu utilises un code d'accès privé pour l'ensemble du portail, les deux joueurs doivent d'abord se connecter au portail avant de rejoindre le salon.

## Tests effectués avant livraison

- `npm test` : **6 tests automatiques réussis**, dont un test complet de cohabitation avec Marvel.
- Contrôle du catalogue : les deux jeux sont visibles ; les fichiers privés du serveur ne sont pas publiés.
- Contrôle réseau : deux sessions de navigateur séparées ont créé/rejoint un salon, pioché, défaussé et observé le changement de tour.
- Vérification de la confidentialité : l'autre main et la composition de la pioche ne sont pas envoyées au joueur.
- Simulation d'une manche complète, scores, passage à la manche suivante et reconnexion après redémarrage avec stockage conservé.
- Test Chromium du **mode solo** : lancement avec huit cartes, sans erreur JavaScript.

Le déploiement réel sur ton compte Render ne peut pas être exécuté depuis cette conversation. Suis les étapes ci-dessus, puis teste sur le site publié.

## En cas de problème

- **Jeu invisible dans le portail :** vérifie que `games-config.json`, `server.js` et le dossier `lost-cities-online/` ont été remplacés aux bons endroits, pas dans un sous-dossier supplémentaire. Vérifie que Render est **Live** sur le dernier commit.
- **Lost Cities s'ouvre mais aucun salon ne se crée :** recharge la page, puis vérifie que l'API du jeu est bien `/api/lost-cities/create`. Le `server.js` principal fourni est indispensable.
- **Une partie disparaît après un redéploiement :** c'est la limite du stockage éphémère sur l'offre gratuite de Render, pas un problème avec le code d'invitation.
- **Une nouvelle mise à jour efface tes réglages ou images :** évite de vider les données de ton navigateur, et exporte tes personnalisations avant les modifications importantes.
