# Mon Portail Jeux — V111 : Paramètres et Éditeur de jeu

Cette version ajoute deux boutons visibles en haut de la page : **⚙ Paramètres** et **✎ Éditeur de jeu**. Ils utilisent **le même mot de passe administrateur** et les **mêmes variables Render** que le bouton « ＋ Ajouter un jeu ».

## Installation avec GitHub Desktop (sans coder)

1. **Sauvegarde ton portail** : dans GitHub Desktop, clique sur *Repository → Show in Explorer* (Windows) ou *Show in Finder* (Mac), puis garde une copie des fichiers existants si tu veux pouvoir revenir en arrière. Vérifie que tu travailles bien sur le dépôt de ton portail et la branche `main`.
2. Télécharge `MISE_A_JOUR_portail_EDITEUR_V111.zip` et décompresse-le sur ton ordinateur.
3. Ouvre le dossier de ton dépôt local avec GitHub Desktop (*Repository → Show in Explorer/Finder*).
4. **Copie le contenu** du ZIP de mise à jour **à la racine de ton dépôt**, et accepte le remplacement de ces fichiers uniquement :
   - `server.js`
   - `public/index.html`
   - `public/portal.js`
   - `public/styles.css`
   - `tests/portal-editor.test.js` (nouveaux tests)
   - `GUIDE_PARAMETRES_EDITEUR_V111.md` (ce guide)
5. **Ne copie pas le ZIP en bloc dans `uploads/`**. N'efface pas et ne remplace pas les dossiers `uploads`, `marvel` ou `lost-cities-online`.
6. Dans GitHub Desktop, onglet *Changes*, coche tous les fichiers à envoyer. Saisis `V111 - paramètres et éditeur de jeux` dans *Summary*.
7. Clique **une seule fois** sur *Commit to main*, puis sur *Push origin*.
8. Sur https://dashboard.render.com/ , ouvre ton service existant **mon-portail-jeux**. Si Render ne se redéploie pas tout seul, utilise *Manual Deploy → Deploy latest commit*.
9. Quand le service affiche **Live**, recharge https://mon-portail-jeux.onrender.com/ (Ctrl+F5 sur PC).

## Configuration unique si tu n'as pas encore activé l'administration

Dans Render, ouvre ton service **mon-portail-jeux** → **Environment**. Assure-toi que ces variables existent :

- `ADMIN_PASSWORD` : un mot de passe administrateur que **toi seul connais** ;
- `GITHUB_REPOSITORY` : `propriétaire/nom-du-depot` (exemple de forme : `moncompte/mon-portail-jeux`, à adapter à ton vrai dépôt) ;
- `GITHUB_TOKEN` : jeton GitHub avec autorisation **Contents → Read and write** limitée à ton dépôt.

N'envoie **jamais** ton jeton GitHub dans le chat ou dans un fichier du dépôt. S'il était déjà configuré pour la V109/V110, **tu n'as rien à ajouter sur Render**.

## Modifier la fiche d'un jeu

1. Ouvre le portail ; clique **✎ Éditeur de jeu** dans la barre supérieure.
2. Dans **Jeu à modifier**, choisis Marvel Fusion, Lost Cities ou un jeu HTML de ta collection.
3. Modifie le **titre**, le **texte de présentation**, la **catégorie**, l'**icône** et la **couleur**.
4. Pour la **couverture** : conserve celle déjà affichée, **choisis une nouvelle image** (PNG/JPG/WebP, **2 Mo maximum**) ou **retire** la couverture pour afficher l'icône.
5. Regarde l'**aperçu de la vignette**.
6. Entre ton **mot de passe administrateur** et clique sur **💾 Enregistrer les modifications**.
7. Le portail enregistre automatiquement sur **GitHub**. Render redéploie le serveur : les visiteurs verront la fiche modifiée une fois le statut **Live** affiché (cela ne se produit pas instantanément).

### Où la couverture est-elle rangée ?

Pour un jeu nommé `mon-jeu`, la fiche et l'image sont enregistrées dans **le dossier dédié à ce jeu sur GitHub** :

```text
uploads/
  mon-jeu/
    mon-jeu.zip                 # Si jeu importé depuis la V110
    _presentation_portail.json # Titre, description, catégorie, icône et couleur
    couverture-portail.webp    # Image choisie dans l'éditeur (extension selon le fichier)
```

Si tu modifies un ancien jeu dont le fichier ZIP se trouve directement dans `uploads/`, le portail crée le dossier `uploads/nom-du-jeu/` pour **sa fiche et sa couverture**, sans déplacer ni réimporter son ZIP. Pour Marvel Fusion et Lost Cities, il crée de la même façon un dossier dédié à la **présentation** du jeu, sans toucher à leur moteur.

L'image est intégrée au catalogue à l'adresse `/games/nom-du-jeu/couverture-portail.webp` (avec la vraie extension du fichier). Le jeu lui-même continue de fonctionner **sans modification**.

Les anciennes couvertures importées avec un jeu restent en place : « Retirer la couverture » masque l'image dans la bibliothèque, mais ne supprime pas physiquement les anciens fichiers GitHub. Tu peux donc revenir en arrière si nécessaire.

## Modifier le nom et les textes de ton portail

1. Clique sur **⚙ Paramètres**.
2. Modifie le nom du portail, son sous-titre, les deux lignes du grand titre ou la présentation de la page d'accueil.
3. Entre ton mot de passe administrateur et clique sur **💾 Enregistrer les paramètres**.
4. Les réglages sont enregistrés dans **`portal-settings.json` à la racine du dépôt**, puis publiés après le déploiement Render.

Les réglages des jeux restent séparés des réglages globaux du portail.

## Ce qui est conservé

- Tous les jeux déjà présents, y compris **Marvel Fusion** et **Lost Cities Duel** (solo et multijoueur).
- Le bouton **Ajouter un jeu** et le rangement automatique V110 des nouveaux imports.
- Le serveur unique Render et ses anciennes routes API.
- Les fichiers ZIP, illustrations et autres ressources des jeux ; l'éditeur ne remplace pas leur code.

## En cas de problème

- **« Administration non configurée »** : vérifie les trois variables dans Render et attends le redéploiement.
- **« Mot de passe incorrect »** : utilise la valeur `ADMIN_PASSWORD` que tu as définie, pas ton mot de passe GitHub.
- **« GitHub : 401 / 403 »** : vérifie le jeton et son autorisation Contents: Read and write.
- **« GitHub : 409 »** : une autre modification a peut-être été faite au même moment. Recharge et réessaie.
- **Les changements ne se voient pas** : sur Render, attends **Live** ; recharge ensuite le portail en vidant le cache (Ctrl+F5).

**À savoir** : les changements de fiches et de paramètres sont envoyés vers GitHub, puis publiés au prochain déploiement Render. Ils ne sont pas écrits seulement sur le disque temporaire de Render. Aucune modification n'a été envoyée à ton vrai compte GitHub pendant les tests : tu dois installer le ZIP.
