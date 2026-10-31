# Mon Portail Jeux — V110 : rangement automatique dans uploads/

Cette mise à jour permet d'ajouter des jeux directement depuis le bouton **+ Ajouter un jeu**, tout en rangeant chaque nouveauté dans un **sous-dossier créé automatiquement** à partir du nom de son fichier.

## Ce qui change

Exemple : tu importes le fichier `Mon Jeu de Cartes.html` ou `Mon Jeu de Cartes.zip`.

Le portail envoie à GitHub :

```text
uploads/
├── marvel-fusion.zip              ← ancien jeu, inchangé
├── marvel-medias/                 ← médias Marvel, inchangés
│   ├── pack-part-01.json
│   └── pack-part-02.json
└── mon-jeu-de-cartes/            ← NOUVEAU dossier automatique
    └── mon-jeu-de-cartes.zip      ← jeu et éventuelle couverture dans un ZIP
```

- Le dossier reprend le **nom du fichier importé** sous une forme propre, en minuscules, avec des tirets à la place des espaces ou caractères spéciaux.
- Tu peux toujours choisir librement le **titre visible sur le portail**, ainsi que la description, la catégorie, l'icône et la couverture.
- Le jeu reste accessible aux visiteurs via `/games/mon-jeu-de-cartes/`.
- Il n'est pas nécessaire de créer toi-même le dossier dans GitHub : la publication le fait automatiquement.
- Les anciens jeux déposés directement dans `uploads/` restent reconnus. **Ne les déplace pas** : ce n'est pas nécessaire.
- Si un dossier du même nom existe déjà, le portail refuse la publication pour éviter de remplacer le jeu existant. Dans ce cas, renomme ton **fichier HTML ou ZIP** avant de le réimporter.
- Les jeux nécessitant leur propre serveur Node.js, comme le mode en ligne de Lost Cities, demandent toujours une intégration particulière au serveur. Ce bouton sert aux jeux HTML classiques.

## Installer la V110 avec GitHub Desktop (une seule fois)

1. Télécharge **`MISE_A_JOUR_portail_RANGEMENT_V110.zip`** et décompresse-le sur ton PC.
2. Dans **GitHub Desktop**, choisis ton dépôt du portail, sur la branche **main**.
3. Clique sur **Repository → Show in Explorer** (Windows) ou **Show in Finder** (macOS) : tu verras le dossier local de ton dépôt.
4. **Copie le contenu** du ZIP de mise à jour **dans ce dossier**. Accepte le remplacement uniquement pour les fichiers indiqués dans le ZIP. Leurs chemins sont préservés :
   - `server.js` à la racine ;
   - `public/index.html`, `public/portal.js`, `public/styles.css` dans `public/` ;
   - `tests/admin-upload.test.js`, `tests/upload-folders.test.js` dans `tests/` ;
   - `GUIDE_RANGEMENT_AUTOMATIQUE_V110.md` à la racine.
5. **Ne supprime et ne remplace pas** les dossiers `uploads/`, `marvel/` ni `lost-cities-online/`. Le ZIP de mise à jour ne les contient pas.
6. Retourne dans **GitHub Desktop → Changes**. Assure-toi que tous les fichiers à publier sont cochés (une seule case en haut permet de tout sélectionner).
7. Dans **Summary**, écris `V110 - rangement automatique des jeux`.
8. Clique **une seule fois** sur **Commit to main**, puis **Push origin**.
9. Dans Render, ouvre ton service existant `mon-portail-jeux`. Le déploiement se déclenche normalement automatiquement. Sinon, clique **Manual Deploy → Deploy latest commit**.
10. Attends que l'état soit **Live** et recharge https://mon-portail-jeux.onrender.com/ avec `Ctrl + F5`.

**Important :** les trois variables Render du système d'import de la V109 (`ADMIN_PASSWORD`, `GITHUB_REPOSITORY`, `GITHUB_TOKEN`) doivent toujours être configurées. Pas besoin de nouveau serveur ni de nouveau jeton pour la V110 si l'ajout de jeux fonctionnait déjà.

## Ajouter ensuite un jeu depuis le portail

1. Clique sur **+ Ajouter un jeu**.
2. Sélectionne ton `.html`, `.htm` ou `.zip` (20 Mo maximum pour l'archive).
3. Juste sous le sélecteur de fichier, vérifie le chemin **📁 Rangement automatique : uploads/nom-du-fichier/nom-du-fichier.zip**.
4. Renseigne le titre affiché, la description, la catégorie et éventuellement la couverture.
5. Entre ton mot de passe administrateur puis clique sur **🚀 Ajouter le jeu au portail**.
6. Le portail crée le dossier sur GitHub, y enregistre le ZIP et attend le redéploiement de Render.
7. Lorsque le site est à jour, le jeu apparaît normalement dans la bibliothèque.

## Pourquoi conserver un ZIP à l'intérieur du dossier ?

Cela permet de garder **tous les fichiers du jeu ensemble**, même quand il comprend des images, des musiques et des scripts. Cette méthode utilise **un seul commit GitHub** par ajout et évite que les fichiers de différents jeux se mélangent.

## Tests et précautions

- 8 tests Node réussis, y compris Marvel, Lost Cities et l'ancien format `uploads/jeu.zip`.
- Nouveau format `uploads/jeu/jeu.zip` reconnu et servi avec ses fichiers internes CSS et JS.
- Test du formulaire dans Chromium, avec aperçu du sous-dossier et retour de publication simulé.
- Tests effectués localement : aucun vrai changement n'a été envoyé sur ton GitHub ou ton service Render.
- Ne publie que des jeux HTML dont tu connais le contenu : leur JavaScript est exécuté sur ton domaine.

Pour préserver tes autres jeux, privilégie le **petit ZIP de mise à jour** plutôt que le ZIP complet si ton dépôt a changé depuis la V109.
