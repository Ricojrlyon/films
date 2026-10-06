# \*films — ma collection de films

Application personnelle de suivi de films (et séries), hébergée sur GitHub Pages, sans build ni backend : **trois fichiers** en HTML/CSS/JS vanilla — `index.html` (structure), `style.css` (apparence), `app.js` (code). Les données vivent dans `films.json`, lu et écrit via l'API GitHub directement depuis le navigateur.

## Fonctionnalités

- **Collection** — deux onglets : « à voir », dans l'ordre d'ajout (le plus récent en premier), et « vus », par date de visionnage (le plus récent en premier). Recherche (titre, réal, casting, insensible aux accents), filtres (genre, lieu, décennie, année et mois de visionnage, pays du film, pays de naissance du·de la réal, notes) et tris (ajout, date vue, note, titre, année).
- **Fiche film** — affiche, synopsis, casting cliquable, note perso face à la moyenne TMDB, bande-annonce, liens TMDB / Allociné. La note : 1 à 5 étoiles, ou ❤ coup de cœur (voir « Notation »).
- **Stats** — films vus, temps cumulé, note moyenne /10, coups de cœur, cadence par mois et par année, distribution des notes, genre × note, note moyenne par genre, pays d'origine, pays des réalisateur·rices, top réalisateur·rices et acteur·rices, parité, film de l'année. Un clic sur une barre ou une case ouvre les films vus correspondants.
- **Découvrir** — au cinéma / tendances / prochainement (films, via TMDB), avec au plus un film américain sur trois (voir « Découvrir : rééquilibrage ») ; recherche libre (films, séries, personnes) ; badges « au ciné » et « dans ma collec », bouton « masquer ma collec ».
- **Reco** — 24 films proches de tes films bien notés récents, renouvelés chaque mois (voir « Algorithme de reco »).
- **Mode édition** (🔒) — ajouter, noter, modifier, supprimer, re-matcher un film sur une autre fiche TMDB, enrichir en masse (pays, genre et pays de naissance des personnes, latinisation des noms non latins). Les boutons d'enrichissement des stats n'apparaissent qu'en mode édition.

## Architecture

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page, balises d'en-tête (sécurité, partage), liens vers les deux fichiers suivants |
| `style.css` | Apparence (tout le CSS) |
| `app.js` | Code de l'application (tout le JavaScript), chargé à la fin de la page |
| `films.json` | Base de données — un tableau de films + métadonnées |
| `apercu.png` | Image d'aperçu affichée quand on partage le lien (1200 × 630) |
| `README.md` | Ce document |

Flux de données :

- **Lecture** : au chargement, `fetch('./films.json?t=…')` (cache-buster : le CDN de Pages garde les fichiers ~10 min). À l'activation du mode édition, relecture via l'API GitHub pour repartir de l'état réellement enregistré. Ces relectures ne passent jamais par le cache du navigateur ; au-delà de 1 Mo, l'API ne renvoie plus le contenu sous sa forme habituelle et `films.json` est relu au format brut (jusqu'à 100 Mo).
- **Écriture** : `PUT /repos/{owner}/{repo}/contents/films.json` avec le token GitHub. Le fichier entier est réécrit à chaque sauvegarde, en JSON compact.
- **Enrichissement** : API TMDB v3 (clé embarquée dans le source, assumé — données publiques, lecture seule).

## Notation

`rating` a 6 crans **ordinaux et exclusifs** : 1 à 5 étoiles, ou `6` pour le coup de cœur (❤), le cran au-dessus de 5★. Un film porte des étoiles **ou** un ❤, jamais les deux. `6` implique `favorite: true` ; `normalizeRatings()` fait respecter l'invariant à chaque lecture.

Équivalent /10, affiché en regard de la moyenne TMDB (table `RATING_OUT_OF_10`) : **2, 4, 6, 8, 9,5, 10**. Les étoiles plafonnent à 9,5, le 10/10 est réservé au coup de cœur. Les crans n'étant pas équidistants, les moyennes (note moyenne, note par genre) sont calculées sur cette échelle /10.

## Modèle de données

Un film dans `films.json` :

```json
{
  "id": "movie-1483319",
  "tmdb_id": 1483319,
  "type": "movie",
  "title": "Shana",
  "original_title": "Shana",
  "original_language": "fr",
  "year": 2026,
  "release_date": "2026-…",
  "director": "Lila Pinell",
  "director_gender": 1,
  "director_genders": [1],
  "director_countries": ["France"],
  "cast": ["…"],
  "cast_genders": [1, 1, 0, 0, 0],
  "runtime": 80,
  "genres": ["Drame"],
  "country": "France",
  "poster": "https://image.tmdb.org/t/p/w500/….jpg",
  "backdrop": "https://image.tmdb.org/t/p/w1280/….jpg",
  "synopsis": "…",
  "tmdb_rating": 5.9,
  "trailer": "https://www.youtube.com/watch?v=…",
  "source": { "added_via": "admin", "added_at": "2026-07-08T…" },
  "user": {
    "statut": "a_voir",
    "rating": null,
    "favorite": false,
    "lieu": null,
    "date_vue": null,
    "date_vue_label": null
  }
}
```

Invariants à connaître avant de modifier le code :

- **L'ordre du tableau est l'ordre d'ajout** (insertion en tête) — le tri par défaut de « à voir » en dépend, et la fusion de conflit le préserve.
- `id` = `{type}-{tmdb_id}` ; un re-match vers une autre fiche TMDB change l'id.
- `rating` / `favorite` : voir « Notation ».
- `date_vue` : `"YYYY"`, `"YYYY-MM"` ou `"before-2022"` (bucket legacy).
- `director_gender` / `director_genders` / `cast_genders` : convention TMDB — 0 inconnu, 1 femme, 2 homme.
- `country` : pays de production, noms anglais de TMDB séparés par « · » (ex. `"USA · Denmark · UK"`). Ils restent en anglais dans le fichier ; tout ce qui s'affiche (fiche, filtres, graphes, liste des pays de Découvrir) passe par `countryFr()` et sa table `COUNTRY_FR`, et le nom français sert aussi de valeur aux filtres. Un pays absent de la table s'affiche en anglais : l'y ajouter.
- `director_countries` : pays de naissance des réalisateur·rices (un par réal, `""` si inconnu), tiré du lieu de naissance TMDB, qui est du texte libre. `normalizeBirthCountry()` ramène les variantes (autres langues, villes et régions sans pays, mentions historiques — on retient le pays actuel) au même vocabulaire que les pays de production, à l'enregistrement **et** à l'affichage : d'anciennes valeurs brutes sont donc corrigées sans réécrire le fichier. À l'affichage, ils sont traduits en français comme les pays de production.
- Repasser un film en « à voir » **conserve** note/date/lieu (masqués, restaurés s'il repasse en « vu »).
- Les clés préfixées `_` sont des drapeaux transitoires, filtrées à la sérialisation.

## Découvrir : rééquilibrage

Les trois onglets suivent la popularité mondiale de TMDB, qui place les films américains en tête. Dans l'ordre par défaut (pas de filtre de pays, tri par popularité) :

- 5 pages TMDB sont chargées au lieu de 2, puis chaque place revient au film le mieux classé qui ne fait pas dépasser **un film américain sur trois** (`DISCOVER_MAX_US_SHARE`) ; tout film coproduit par les États-Unis compte comme américain.
- Les films indiens (`DISCOVER_NO_BOOST`) ne profitent pas des places libérées : ils restent à leur rang TMDB.
- S'il ne reste que des films américains, la liste s'arrête plutôt que de dépasser la part : « tendances » peut compter moins de 40 films.
- Le pays de production vient du profil de film de la reco (cache partagé, 60 jours).

## Algorithme de reco

Tous les réglages sont dans l'objet `RECO` d'`app.js`. En modifier un invalide de lui-même le pool mis en cache.

1. **Films de départ** — 4★ et plus vus dans les 6 derniers mois ; à défaut de 5 films, le critère s'élargit (3★+, puis 12 mois, puis toutes périodes). 30 films au maximum.
2. **Voisinage** — pour chaque film de départ, ses recos et ses « similaires » TMDB (candidats d'au moins 20 votes). Un candidat n'est retenu que sur **preuve de proximité** : un mot-clé de thème en commun, le même réal ou des acteurs communs, ou une reco TMDB d'un film d'au moins 100 votes. Le genre seul ne suffit pas. Proximité = mots-clés (50 %, pondérés par leur rareté) + genres (20 %) + reco TMDB (15 %) + équipe commune (15 %), seuil 0,20. Le mot-clé TMDB « woman director » est ignoré : il réintroduirait un critère sur le film de départ.
3. **Critères, sur le film proposé** — réalisé par une femme ×1,6 ; produit aux États-Unis ×0,6, au prorata des pays de production. Ils décident lesquels des voisins sont gardés (8 par film de départ) et pèsent sur le tirage.
4. **Grille** — 24 films tirés au sort, pondérés par le score (proximité × note du film de départ × critères), dont **la moitié réalisée par des femmes** quand il y en a assez parmi les voisins, et 2 au plus par film de départ. Tirage et ordre d'affichage sont fixés pour le mois.

Coût : de l'ordre de 600 appels TMDB au premier calcul sur un appareil (une vingtaine de secondes, progression affichée). Les profils de films restent en cache 60 jours, donc les recalculs suivants (nouvelle note, nouveau mois) sont rapides. Si TMDB ne répond pas, la Reco l'indique et rien n'est mis en cache.

## Mode édition et sécurité

À la première activation, le mode édition demande un **token GitHub fine-grained** (accès Contents en lecture/écriture sur ce seul repo) et un **code personnel**. Le token est chiffré avec le code (PBKDF2 150k itérations + AES-GCM) et stocké en `localStorage` ; à chaque session, le code suffit à le déverrouiller. Le token déchiffré ne reste qu'en mémoire et n'est envoyé qu'à `api.github.com`. « Tout réinitialiser » efface le blob chiffré.

Le mode édition n'est actif que sur `*.github.io` (détection automatique du repo depuis l'URL). Domaine custom : renseigner `REPO_OVERRIDE` dans `app.js`. La branche des données se règle via `GH_BRANCH` (défaut `main`).

- **Politique de sécurité (CSP)** : une balise `Content-Security-Policy` en tête d'`index.html` limite ce que la page peut charger et contacter — `app.js` et `style.css` du site, polices Google Fonts, images TMDB, API TMDB et GitHub. C'est un filet de sécurité : un code injecté ne pourrait ni s'exécuter ni envoyer de données ailleurs. **Toute nouvelle ressource externe doit y être ajoutée**, sinon elle sera bloquée (le blocage apparaît dans la console du navigateur).
- **Seul `app.js` peut exécuter du code** (`script-src 'self'`, sans `'unsafe-inline'`) : une balise `<script>` écrite dans la page ou un attribut `onclick=` / `onerror=` seraient bloqués. Tout nouveau code va dans `app.js`, et les événements se branchent avec `addEventListener`. Les styles, eux, gardent `'unsafe-inline'` (attributs `style=` dans le HTML généré).
- Tous les textes venant de TMDB ou de `films.json` sont neutralisés (`escapeHtml`) avant affichage ; les URL insérées passent par `safeUrl`.
- Les liens qui s'ouvrent dans un nouvel onglet portent `rel="noopener"` : la page ouverte ne peut pas agir sur celle de \*films. À reprendre pour tout nouveau lien `target="_blank"`.
- **Tout est public** : le dépôt l'est, `films.json` compris (notes, dates et lieux de visionnage).

## Partage et référencement

- Description et aperçu Open Graph (titre, texte, `apercu.png`) : un lien partagé s'affiche avec une carte. L'adresse de l'image est absolue (`https://ricojrlyon.github.io/films/apercu.png`) : à adapter si le site change d'adresse.
- Le site demande aux moteurs de recherche de **ne pas l'indexer** (`<meta name="robots" content="noindex, nofollow">`). Le dépôt public sur github.com reste, lui, visible sur GitHub.

## Affichage

- Le site se déclare sombre (`<meta name="color-scheme" content="dark">`) : ce que dessine le navigateur lui-même — listes déroulantes ouvertes, barres de défilement, case à cocher du mode édition — suit le thème sombre. Les éléments du site gardent leurs couleurs, toutes définies dans le CSS.
- Affiche introuvable (image retirée de TMDB, réseau coupé) : la carte affiche le titre du film à la place, comme une carte sans affiche (`showPoster`, pour toutes les grilles).
- Effets de flou : chaque `backdrop-filter` est doublé de `-webkit-backdrop-filter`, seule forme comprise par Safari avant la version 18. À reprendre pour tout nouveau flou.

## Accessibilité

- Navigation clavier : les cartes et les films de l'année sont atteignables avec Tab (contour doré, visible seulement au clavier) ; Entrée ouvre la fiche.
- Fiche film : déclarée comme fenêtre de dialogue, nommée par le titre du film. À l'ouverture, la sélection clavier entre dans la fiche ; Tab y reste tant qu'elle est au premier plan ; Échap la ferme et la sélection revient à la carte d'origine.
- Petits écrans : les catégories de Découvrir tiennent sur une ligne jusqu'à 320 px de large.
- Lecteurs d'écran : les deux champs de recherche ont un nom (`aria-label`) ; les titres des stats sont des `h2`, juste sous le titre du site (`h1`), sans niveau sauté.

## Synchronisation multi-appareils

Chaque sauvegarde réécrit tout le fichier, donc les écritures concurrentes sont gérées explicitement :

- **File d'attente locale** : les sauvegardes d'un même onglet sont sérialisées (un enrichissement de masse ne peut pas percuter une édition).
- **Conflit 409** (le fichier a changé depuis notre lecture — autre appareil) : **fusion film par film** au lieu d'écrasement. Un film modifié dans la session garde sa version locale ; un film non touché prend la version distante ; les ajouts des deux côtés sont conservés (les distants en tête) ; les suppressions des deux côtés sont respectées. La fusion relit le fichier distant quelle que soit sa taille.
- Cas limite assumé : si un conflit survient pendant un enrichissement de masse, l'enrichissement des films non touchés manuellement peut être perdu — le relancer suffit, aucune donnée personnelle n'est en jeu.

## Développement local et déploiement

N'importe quel serveur statique suffit :

```
python -m http.server 8000    # ou équivalent
```

En local, la collection, les stats, Découvrir et la Reco fonctionnent (lecture de `films.json` + TMDB) ; le mode édition est désactivé (pas de repo détectable).

Déploiement : pousser sur la branche `main` les fichiers modifiés, **ensemble, en une seule fois** (`index.html` a besoin de `style.css` et `app.js`). **Ne jamais pousser une copie locale de `films.json`** : celui du dépôt est la base de données vivante, réécrite par le mode édition — une copie locale, même récente, peut effacer des films ajoutés depuis.

**Numéros de version** : `index.html` appelle `style.css?v=…` et `app.js?v=…`. À chaque modification de l'un de ces deux fichiers, augmenter son numéro dans `index.html` (et pousser `index.html` avec). GitHub Pages laisse les navigateurs garder un fichier 10 minutes : sans nouveau numéro, un visiteur qui recharge la page peut recevoir la nouvelle page avec l'ancien code. Le numéro change l'adresse du fichier et force le navigateur à prendre la nouvelle version ; l'autre fichier, s'il n'a pas changé, reste en cache. `films.json` n'est pas concerné : il est toujours relu à neuf.

Ce README est tenu à jour à chaque modification du site.
