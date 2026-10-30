# 🎮 Installer ton portail de jeux sans coder

**Objectif :** un site pour 2–3 personnes, avec plusieurs jeux HTML, MARVEL FUSION en multijoueur **entre deux maisons différentes**, pour **0 € / an** grâce aux offres gratuites de GitHub et Render. Pas de nom de domaine à acheter.

## 1 — Crée tes deux comptes gratuits

- GitHub : https://github.com/signup
- Render : https://dashboard.render.com/register

Tu vas faire ces étapes **une seule fois**. Tes amis n'ont pas besoin de compte GitHub ou Render.

## 2 — Mets le portail dans ton GitHub (aucune ligne de code)

Le plus simple est d'utiliser **GitHub Desktop**, l'application graphique gratuite : https://desktop.github.com/ .

1. Décompresse entièrement l'archive `PORTAIL_JEUX_PERSONNELS_PRET_A_PUBLIER.zip` dans un dossier, par exemple `Mes Jeux en Ligne`.
2. Dans GitHub Desktop, connecte-toi avec ton compte GitHub.
3. Fais **File → Add local repository**, puis sélectionne ton dossier `Mes Jeux en Ligne`. Si l'application propose de créer un dépôt dans ce dossier, accepte ; sinon fais **File → New repository**, et choisis ce dossier en emplacement.
4. Clique **Publish repository**. Nomme-le `mon-portail-jeux` et conserve-le **Private** si tu préfères (Render peut accéder aux dépôts privés que tu l'autorises à lire).
5. Vérifie sur github.com que tu vois les fichiers `server.js`, `package.json`, `public/` et `uploads/marvel-fusion.zip` à la racine du dépôt.

Tu peux aussi utiliser GitHub directement dans le navigateur : crée un dépôt vide et utilise **Add file → Upload files** pour y déposer les fichiers et dossiers **décompressés**, pas le ZIP global du portail.

## 3 — Publie gratuitement chez Render

1. Connecte-toi sur https://dashboard.render.com/ .
2. Sélectionne **New → Web Service**, puis **Git Provider / GitHub**. Autorise Render à accéder à ton dépôt `mon-portail-jeux`.
3. Choisis ce dépôt et renseigne les valeurs suivantes :

| Réglage Render | Valeur à choisir |
|---|---|
| Name | `mon-portail-jeux` (ou un nom libre) |
| Language / Runtime | **Node** |
| Branch | `main` (ou la branche créée par GitHub Desktop) |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type / Plan | **Free — 0 $/mois** |
| Root directory | laisser vide |
| Auto Deploy | **On** |

4. Dans **Environment Variables**, tu peux ajouter **SITE_ACCESS_CODE** et choisir un code secret que tu donneras à tes deux ou trois amis. C'est **facultatif**, mais conseillé si le site est privé.
5. Clique **Create Web Service** ou **Deploy**. Après le déploiement, Render t'indique une URL, par exemple : `https://mon-portail-jeux.onrender.com`.
6. Ouvre cette URL. **MARVEL FUSION** apparaît déjà comme premier jeu.

**Ne choisis pas Static Site** : MARVEL FUSION en ligne a besoin d'un véritable **Web Service** pour coordonner les deux joueurs.

## 4 — Jouer avec ton ami depuis chez lui

1. Envoie-lui l'URL `https://...onrender.com` de ton portail.
2. Ouvrez MARVEL FUSION, chacun dans son navigateur.
3. L'un crée une salle en mode **2 joueurs** et transmet le code de salle.
4. L'autre rejoint la salle avec ce code.
5. Lancez la partie. **Pas besoin d'être sur la même box ou le même Wi-Fi**. Aucun port à ouvrir.

**Astuce :** attends que les deux pages du site soient ouvertes avant de démarrer. Le serveur gratuit peut mettre environ une minute à se réveiller après une période d'inactivité.

## 5 — Ajouter d'autres jeux HTML SANS coder

### Méthode A — La plus simple, sans configuration supplémentaire

1. Prépare ton jeu :
   - un seul fichier HTML indépendant → garde ton fichier `.html` ;
   - un jeu avec images, CSS, sons et JS → crée un fichier `.zip` contenant `index.html` et tous les dossiers/fichiers du jeu.
2. Ouvre ton dépôt GitHub dans le navigateur et entre dans le dossier **`uploads`**.
3. Clique **Add file → Upload files**.
4. Glisse ton fichier `.html` ou `.zip`, puis clique **Commit changes**.
5. Render déploie automatiquement cette nouvelle version du site. Le jeu apparaît ensuite dans la bibliothèque. **Aucune modification de code nécessaire.**

Le portail lit le nom du jeu à partir de la balise `<title>` déjà présente dans ton HTML (si disponible). Sinon, il utilise le nom du fichier.

Tu peux remplacer une ancienne version d'un jeu en lui conservant le même nom de fichier lors de sa mise à jour dans GitHub.

### Méthode B — Ajout depuis le bouton « ＋ Ajouter un jeu » du portail

Cette méthode est **facultative** et demande une configuration unique pour autoriser le portail à enregistrer les fichiers dans **ton propre GitHub**.

1. Dans Render, ouvre ton service → **Environment**.
2. Ajoute ces trois variables :

| Nom | Valeur |
|---|---|
| `ADMIN_PASSWORD` | Ton mot de passe administrateur privé, long et unique |
| `GITHUB_REPOSITORY` | `ton-identifiant-github/mon-portail-jeux` |
| `GITHUB_TOKEN` | Un jeton GitHub à créer avec les étapes ci-dessous |

3. Sur GitHub, ouvre **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
4. Sélectionne **uniquement ton dépôt** `mon-portail-jeux`. Dans **Repository permissions**, accorde **Contents: Read and write** ; garde les autres autorisations minimales. Copie le token dans la variable `GITHUB_TOKEN` de Render et sauvegarde.
5. Laisse Render redémarrer. Sur le portail, clique **＋ Ajouter un jeu**. Choisis ton `.html` ou `.zip`, saisis ton mot de passe administrateur et publie.
6. Le nouveau jeu sera commité dans GitHub automatiquement, puis déployé par Render, **sans aucune manipulation de code ni de dépôt** pour les ajouts suivants.

**Sécurité :** ne communique **jamais** ton `GITHUB_TOKEN` ou ton `ADMIN_PASSWORD` à tes amis. Ils n'ont besoin que de l'URL et, éventuellement, de `SITE_ACCESS_CODE`. Si le token GitHub expire, crée-en un autre et remplace-le dans Render.

## 6 — Ce que le portail accepte

✅ Un seul jeu `.html` autonome (JavaScript et CSS intégrés).

✅ Un fichier `.zip` contenant `index.html`, images, sons, vidéo, fichiers CSS et JS, sous-dossiers.

✅ Un ZIP dont `index.html` est dans un unique sous-dossier (le portail le détecte).

✅ Plusieurs jeux présents ensemble ; pas de limite stricte de nombre, mais taille totale raisonnable pour l'offre gratuite.

❌ Un jeu dépendant d'un serveur PHP, Python ou Node.js **personnalisé** ne devient pas automatiquement multijoueur en téléversant seulement son HTML. Il faut intégrer sa logique côté serveur séparément. MARVEL FUSION bénéficie déjà de cette intégration.

❌ Un jeu qui charge ses médias avec des chemins absolus commençant par `/` peut devoir être adapté pour utiliser des chemins relatifs (ex. `images/logo.png`).

## 7 — Budget, limites et précautions

| Poste | Coût si tu conserves Free |
|---|---:|
| GitHub — dépôt contenant les jeux | 0 € |
| Render Web Service Free | 0 € |
| Sous-domaine `*.onrender.com` + HTTPS | 0 € |
| Total annuel estimé | **0 €** |

**Render Free n'est pas un hébergement garanti 24 h/24 :** mise en sommeil après ~15 minutes d'inactivité, réveil pouvant prendre ~1 minute, redémarrages possibles, mémoire des salles perdue en cas de redémarrage. Les salles sont stockées **en mémoire**, pas dans une base persistante. Une mise à jour du portail interrompt les parties en cours ; attends la fin d'une partie pour publier un nouveau jeu.

**Fichiers des jeux :** les ZIP sont dans GitHub, pas sur le disque éphémère de Render. Ils sont donc conservés quand le serveur redémarre. Limite de ce portail : **20 Mo par ZIP ou fichier HTML** et **90 Mo de contenu décompressé au total** (limites conservatrices adaptées au petit hébergement gratuit).

**Accès :** sans `SITE_ACCESS_CODE`, n'importe qui connaissant l'URL peut visiter le site. Le code réduit les visites involontaires mais ce n'est pas un système de comptes utilisateurs.

**Tarifs / offres susceptibles d'évoluer :** vérifie les conditions actuelles avant de renseigner un moyen de paiement ou de changer de plan. Ne sélectionne aucun plan payant.

## 8 — Vérifier rapidement le portail en local

Si tu as Node.js version 20 ou plus (https://nodejs.org/), double-clique `LANCER_PORTAIL_WINDOWS.bat`, puis ouvre `http://localhost:3000/`. Tu peux tester tous les menus du portail localement avant la mise en ligne.

## Liens de référence

- https://render.com/docs/free
- https://render.com/docs/deploy-node-express-app
- https://render.com/docs/web-services
- https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
