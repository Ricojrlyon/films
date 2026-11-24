# \*films · ma collection de films

Site personnel de suivi de films et séries, sur GitHub Pages, sans build ni serveur : `index.html`, `style.css`, `app.js` (JavaScript sans librairie). Les données sont dans `films.json`, lu et écrit depuis le navigateur par l'API GitHub. Les fiches viennent de TMDB.

## Fonctionnalités

- **Collection** : onglets « à voir » (ordre d'ajout) et « vus » (date de visionnage), recherche, filtres (genre, lieu, décennie, année et mois vus, pays du film, pays du réal, réalisé par une femme ou un homme, premier rôle, notes), tris.
- **Fiche** : affiche, synopsis, casting cliquable, ta note face à la moyenne TMDB, bande-annonce, « où le voir » (salles de Lyon, plateformes en France via JustWatch).
- **Filmographie** : un clic sur un nom ouvre ses films, « vu X sur Y ».
- **Découvrir** : à lyon, au cinéma, tendances, prochainement, canal+ ; la recherche cherche dans la catégorie affichée ; au plus un film américain sur trois en tri par popularité.
- **Explorer** : recherche dans tout TMDB (films, séries, personnes), mêmes filtres que Découvrir.
- **Reco** : 24 films proches de tes films aimés récents, renouvelés chaque mois, la moitié réalisés par des femmes quand c'est possible.
- **Stats** : chiffres clés, bilan de l'année (top 5, flop 5, tour du monde), par mois, par année, notes, genres, pays, tops réals et acteurs, parité, tes coups de cœur. Presque tout est cliquable et ouvre les films vus correspondants.
- **Ton année en films** : bouton du bilan, 10 écrans animés façon stories.
- **Style « signal »** sur tout le site : vert acide, grain, glitch. Sous le haut de page, deux rubans (tes chiffres, tes derniers vus). Chaque page a son bandeau dessiné comme celui des stats, avec sa couleur et ses chiffres (`majHabillage`). La page se lit en quatre zones : navigation, réglages, bandeau, films. Les infos du film sont posées sur l'affiche, les étiquettes restent à l'intérieur. La fiche montre un polaroïd et les notes en duel. Sur téléphone, rien ne redessine la page en continu.
- **Mode édition** (cadenas) : ajouter, noter, modifier, supprimer, re-matcher, enrichir.
- **Application** : s'installe sur l'écran d'accueil (manifeste et icône « \*F » vert acide décalé de rose et de bleu, comme l'aperçu de partage et l'icône d'onglet). Le bouton « précédent » referme ce qui a été ouvert en dernier.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | Le site |
| `films.json` | La base de données vivante |
| `cinemas_lyon.json`, `canal_plus.json` | Écrits chaque jour par les robots |
| `fonts/` | Les 4 polices (licence OFL), `polices.css` |
| `manifest.webmanifest`, `icone-*.png`, `apple-touch-icon.png`, `apercu.png`, `tmdb.svg` | Application, aperçu de partage, logo TMDB |
| `.github/workflows/`, `.github/scripts/` | Robots (Canal+, cinémas de Lyon) et lancement des tests |
| `tests/` | Tests, à côté du site (le site n'en dépend pas) |

## Règles à respecter

- **Pousser ensemble** les fichiers modifiés, en un seul envoi.
- **Numéros de version** : à chaque changement de `style.css` ou `app.js`, augmenter `?v=…` dans `index.html` et pousser `index.html` avec. Pour une nouvelle icône ou un nouvel aperçu, augmenter aussi le `?v=` des images (`index.html` et `manifest.webmanifest`).
- **Ne jamais pousser** une copie locale de `films.json`, `cinemas_lyon.json` ou `canal_plus.json` : ce sont les données vivantes du dépôt.
- **Sécurité (CSP d'`index.html`)** : seul `app.js` exécute du code (pas de `<script>` ni d'`onclick` dans la page), styles seulement dans `style.css` (les attributs `style=` sont permis). Toute nouvelle ressource externe doit être ajoutée à la CSP.
- Tout texte venant de TMDB ou de `films.json` passe par `escapeHtml`, toute adresse par `safeUrl`.
- Mettre ce README à jour à chaque changement, en restant court.

## Données

Un film : `id` (`movie-123`), `tmdb_id`, `type`, titres, `year`, `release_date`, `director` et `director_genders`, `director_countries`, `cast` et `cast_genders`, `runtime`, `genres`, `country` (noms anglais séparés par « · », traduits à l'affichage par `countryFr`), `poster`, `synopsis`, `tmdb_rating`, `source` (dates d'ajout et de lecture TMDB), et `user` : `statut` (`a_voir` ou `vu`), `rating`, `favorite`, `lieu`, `date_vue`.

- **Ordre du tableau = ordre d'ajout** (insertion en tête).
- **Note** : 1 à 5 étoiles, ou 6 = coup de cœur (❤). Sur 10 : 2, 4, 6, 8, 9,5, 10.
- **`date_vue`** : `AAAA`, `AAAA-MM` ou `before-2022`.
- **Genres des personnes** : 0 inconnu, 1 femme, 2 homme (TMDB). Un film « réalisé par une femme » compte au moins une femme à la réalisation (`genreReal`).
- **Règle TMDB des 6 mois** : rien de TMDB n'est gardé plus de 6 mois. Le mode édition relit les fiches de plus de 5 mois à son ouverture ; le robot du matin ouvre un ticket s'il faut le faire.

## Robots

- **Canal+** (`canal-plus.yml`, chaque jour) : un ticket GitHub (envoyé par mail) quand un film « à voir » arrive sur Canal+ ; écrit `canal_plus.json` (Canal+ et Apple TV, fournisseurs `381|350`, la même valeur qu'`ABONNEMENT_CANAL` d'`app.js`) pour les pastilles ; ticket « données TMDB à relire » au-delà de 5 mois.
- **Cinémas de Lyon** (`cinemas-lyon.yml`, programmé à 22 h 30 UTC pour partir vers 7 h à Paris, GitHub ayant 6 à 8 h de retard) : le programme des 7 prochains jours de 10 salles (Lumière, Comœdia, UGC, Pathé) lu sur AlloCiné, retrouvé chez TMDB, dans `cinemas_lyon.json`. La lecture d'AlloCiné n'est pas un service officiel : en cas de demande, désactiver le robot.
- **Tests** (`tests.yml`) : à chaque envoi qui touche au code.
- Lancer un robot à la main : onglet Actions, choisir le robot, Run workflow. GitHub suspend les robots d'un dépôt inactif 60 jours.

## Mode édition et sécurité

- Token GitHub fine-grained (Contents, ce seul dépôt), chiffré avec ton code (PBKDF2 + AES-GCM) dans le navigateur ; le code le déverrouille à chaque session.
- Actif seulement sur `*.github.io`. Le dépôt est public, `films.json` compris.
- `ricojrlyon.github.io` peut héberger d'autres sites, qui partagent le même stockage du navigateur.
- Conflit entre deux appareils (409) : fusion film par film ; un film modifié ici depuis le dernier enregistrement garde sa version.

## Tests

```
node --test tests/*.test.mjs                                   # fonctions d'app.js et style.css
python -m unittest discover -s .github/scripts -p "test_*.py"  # robots, sans réseau
python -m unittest discover -s tests/navigateur                # écrans dans un vrai navigateur (Playwright)
```

Les tests navigateur simulent TMDB (`tests/navigateur/banc.py`) et bloquent toute écriture vers GitHub ; le mode édition y est testé avec un faux GitHub. `FILMS_APP_JS`, `FILMS_STYLE_CSS`, `FILMS_INDEX_HTML=<chemin>` font tester une autre copie. Chaque correction arrive avec un test qui échouait avant.

## En local

`python -m http.server 8000` dans le dossier : tout marche sauf le mode édition.
