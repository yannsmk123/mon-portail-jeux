# MY GAME ARCADE — V109 : ajouter un jeu en quelques clics

Cette mise à jour ajoute une interface simple au bouton **+ Ajouter un jeu** de ton portail existant : https://mon-portail-jeux.onrender.com/

**Aucun second serveur Render.** Le serveur déjà utilisé par Marvel Fusion et Lost Cities reste en place. Le système utilise GitHub pour enregistrer durablement les jeux, puis Render déploie les nouveautés.

## A. Installer la V109 sur ton dépôt GitHub (une fois)

1. Ouvre ton dépôt sur GitHub et crée une **sauvegarde** en cliquant sur **Code → Download ZIP**.
2. Décompresse le fichier `MISE_A_JOUR_portail_AJOUT_FACILE_V109.zip`.
3. Tu trouveras les fichiers aux emplacements suivants :
   - `server.js` et `zip-games.js` **à la racine du dépôt** (remplacer uniquement ces deux fichiers) ;
   - `public/index.html`, `public/portal.js`, `public/styles.css` **dans `public/`** ;
   - `tests/admin-upload.test.js` **dans `tests/`** (nouveau fichier de tests) ;
   - ce guide `GUIDE_AJOUT_JEUX_FACILE_V109.md` à la racine (facultatif mais recommandé).
4. Dans GitHub, sélectionne **Add file → Upload files**, importe les éléments de la mise à jour en préservant leur dossier, puis **Commit changes**. Si GitHub n'accepte pas de glisser tous les sous-dossiers en une fois, fais une opération à la racine, une dans `public/`, une dans `tests/`. **Ne crée pas de dossier de mise à jour supplémentaire.**
5. Ne modifie **pas** `marvel/`, `lost-cities-online/`, `games-config.json`, `render.yaml` ou `uploads/` : ils sont conservés.
6. Dans Render, choisis le service actuel `mon-portail-jeux`. Le déploiement suit normalement la dernière modification GitHub. Sinon, utilise **Manual Deploy → Deploy latest commit**. Vérifie que l'état devient **Live**.

> Le ZIP complet `mon_portail_jeux_complet_AJOUT_FACILE_V109.zip` est une sauvegarde complète possible, mais le petit ZIP de mise à jour est préférable pour conserver les nouveautés que tu aurais ajoutées sur GitHub entre-temps.

## B. Activer « Ajouter un jeu » directement sur le site (une fois)

Ton portail dispose déjà d'une connexion GitHub possible. Pour l'activer, **trois paramètres secrets** doivent être configurés sur Render. C'est la seule partie un peu technique ; après elle, tout se fait sur le site.

### Étape 1 — Créer un jeton GitHub

1. Connecte-toi à GitHub.
2. Ouvre **Settings → Developer settings → Personal access tokens → Fine-grained tokens**, puis **Generate new token**.
3. Donne-lui un nom, par exemple `Portail jeux - publication`.
4. Choisis ton compte comme **Resource owner**.
5. Dans **Repository access**, sélectionne **Only select repositories** puis ton dépôt du portail (celui qui contient `server.js` et `uploads/`).
6. Dans **Repository permissions**, choisis **Contents → Read and write**. Les autres autorisations restent au minimum. L'autorisation **Metadata: Read-only** est ajoutée automatiquement par GitHub.
7. Valide la création, puis **copie le jeton dans un endroit privé**. Il peut n'apparaître qu'une fois.

**Ne place pas ce jeton dans les fichiers GitHub ni dans la conversation ChatGPT.**

### Étape 2 — Ajouter trois variables sur Render

1. Ouvre https://dashboard.render.com/.
2. Choisis le service Web **mon-portail-jeux** (ton serveur actuel).
3. Dans le menu du service, clique sur **Environment**.
4. Ajoute ces variables (bouton du type **Add Environment Variable**), une ligne par variable :

| Nom exact | Valeur à renseigner |
|---|---|
| `ADMIN_PASSWORD` | Ton **nouveau mot de passe administrateur**, long et difficile à deviner. Il servira uniquement dans la fenêtre « Ajouter un jeu ». |
| `GITHUB_REPOSITORY` | `nom-de-ton-compte/nom-de-ton-depot` : reprends **exactement** le nom figurant dans l'URL GitHub de ton dépôt. Exemple fictif : `mon-compte/mon-portail-jeux`. |
| `GITHUB_TOKEN` | Le jeton GitHub créé à l'étape 1. |

La variable `GITHUB_BRANCH` est facultative : elle vaut `main` par défaut. Si ton dépôt utilise une autre branche, renseigne son nom exact à la place.

5. Clique sur **Save, Deploy** (ou le bouton de sauvegarde présenté par Render) et attends le statut **Live**.
6. Recharge ton portail : https://mon-portail-jeux.onrender.com/.

> Ton ancien `SITE_ACCESS_CODE` (si tu en utilises un) est différent du mot de passe administrateur `ADMIN_PASSWORD`.

## C. Ajouter ensuite un jeu, sans revenir sur GitHub

1. Sur ton portail, clique sur **+ Ajouter un jeu** (en haut à droite).
2. Clique sur **Choisir ou glisser ton jeu HTML / ZIP**, puis sélectionne le jeu sur ton PC.
   - Jeu dans un seul fichier : un `.html` suffit.
   - Jeu avec images, sons, scripts et CSS : crée un **ZIP** qui contient tous les fichiers du jeu. Un `index.html` est recommandé, mais le portail accepte aussi un autre fichier HTML si nécessaire.
3. Le formulaire propose automatiquement un nom d'après le fichier. Tu peux le changer, ajouter une description, une catégorie, une icône et, si tu veux, une **image de couverture**.
4. Vérifie l'aperçu de la vignette.
5. Entre **ton mot de passe administrateur**, puis clique sur **🚀 Ajouter le jeu au portail**.
6. Le portail envoie le jeu à GitHub et Render redéploie. Une fois le jeu publié, il apparaît dans ta bibliothèque. Si tu gardes la fenêtre ouverte, elle essaie de détecter automatiquement la mise en ligne.

**Le jeu ne remplace jamais Marvel Fusion ni Lost Cities.** Si le nom est déjà utilisé, tu dois simplement en choisir un autre pour une nouvelle fiche.

## D. Quelles sont les limites ?

- Fichier HTML ou ZIP **20 Mo maximum** avant import, **45 Mo maximum une fois décompressé** ; couverture PNG/JPG/WebP **2 Mo maximum**.
- Le formulaire concerne les jeux **HTML exécutables dans le navigateur**. Pour un jeu qui a besoin de son propre serveur Node.js, le code serveur doit être intégré spécialement, comme pour le mode réseau de Lost Cities.
- Les jeux téléchargés par les visiteurs peuvent contenir du code JavaScript : n'importe quel jeu HTML que tu publies s'exécute sur le même domaine que ton portail. **N'ajoute que des jeux dont tu connais et fais confiance au code.**
- Chaque ajout provoque une nouvelle publication Render. Cela peut interrompre brièvement une partie en ligne ; ajoute de préférence les jeux entre deux parties.
- Les fichiers sont enregistrés dans GitHub, pas seulement sur le disque temporaire de Render. Ainsi, ils sont conservés lors du redémarrage du service.
- Un jeton GitHub expiré ou révoqué empêche les nouvelles publications : il faut alors le renouveler sur GitHub et modifier `GITHUB_TOKEN` sur Render. Les jeux déjà publiés restent accessibles.
- Les jeux enregistrés directement dans le dossier `uploads/` continuent à fonctionner ; tu n'es **pas obligé** de les réimporter.

## E. Si le bouton affiche encore « Activer l'ajout automatique »

Cela signifie qu'au moins une des trois variables `ADMIN_PASSWORD`, `GITHUB_REPOSITORY`, `GITHUB_TOKEN` manque sur Render, que le service n'a pas encore terminé son redéploiement ou que tu visites une ancienne version en cache. Vérifie les noms exacts, l'état **Live**, puis actualise avec `Ctrl + F5`.

### Si GitHub refuse la publication

Vérifie les permissions **Contents: Read and write**, que le jeton autorise le bon dépôt, que `GITHUB_REPOSITORY` est exactement `compte/depot`, et que la bonne branche est configurée. Ne communique jamais le jeton en cherchant de l'aide ; copie seulement le **message d'erreur**, sans secret.

### Si le jeu n'apparaît pas

Vérifie **Render → Events / Deploys** pour voir si le dernier déploiement est terminé. Si l'adresse du jeu reste introuvable, recharge le portail après le statut **Live**. Le jeu doit alors apparaître dans « La bibliothèque ».

---

**Avant publication sur ton dépôt réel :** la V109 a été testée localement avec un simulacre d'API GitHub et des navigateurs de test, mais personne n'a utilisé ton vrai jeton ni modifié ton compte GitHub/Render.
