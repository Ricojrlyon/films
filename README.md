# \*films — ma collection de films

Application personnelle de suivi de films (et séries), hébergée sur GitHub Pages, sans build ni backend : **tout tient dans `index.html`** (HTML/CSS/JS vanilla). Les données vivent dans `films.json`, lu et écrit via l'API GitHub directement depuis le navigateur.

## Fonctionnalités

- **Collection** — deux onglets « à voir » et « vus », affichés par défaut dans l'ordre d'ajout (le plus récent en premier). Recherche (titre, réal, casting, insensible aux accents), filtres (genre, lieu, décennie, année de visionnage, notes) et tris (ajout, date vue, note, titre, année).
- **Fiche film** — affiche, synopsis, casting cliquable, note perso (/6, ❤ = coup de cœur) face à la moyenne TMDB, bande-annonce, liens TMDB/Allociné.
- **Stats** — films vus, temps cumulé, note moyenne, coups de cœur, cadence par mois et par année, distribution des notes, genre × note, pays d'origine, top réalisateurs·trices et acteurs·trices, parité de genre, meilleur film de chaque année.
- **Découvrir** — au cinéma / tendances / prochainement via TMDB, plus recherche libre (films, séries, personnes).
- **Reco** — recommandations TMDB croisées à partir des films bien notés récents, pondérées (langue, réalisatrices), renouvelées chaque mois.
- **Mode édition** (🔒) — ajouter, noter, modifier, supprimer, re-matcher un film sur une autre fiche TMDB, enrichir en masse (pays, genres des personnes, latinisation des noms non latins).

## Architecture

| Fichier | Rôle |
|---|---|
| `index.html` | Toute l'application : styles, markup, logique |
| `films.json` | Base de données — un tableau de films + métadonnées |

Flux de données :

- **Lecture** : au chargement, `fetch('./films.json?t=…')` (cache-buster, le CDN Pages cache ~10 min). À l'activation du mode édition, relecture via l'API GitHub pour repartir de l'état réellement persisté.
- **Écriture** : `PUT /repos/{owner}/{repo}/contents/films.json` avec le token GitHub. Le fichier entier est réécrit à chaque sauvegarde, en JSON compact (l'API Contents ne relit pas les fichiers > 1 Mo).
- **Enrichissement** : API TMDB v3 (clé embarquée dans le source, assumé — données publiques, lecture seule).

## Modèle de données

Un film dans `films.json` :

```json
{
  "id": "movie-1483319",
  "tmdb_id": 1483319,
  "type": "movie",
  "title": "Shana",
  "year": 2026,
  "director": "Lila Pinell",
  "director_gender": 1,
  "cast": ["…"],
  "cast_genders": [1, 1, 0, 0, 0],
  "runtime": 80,
  "genres": ["Drame"],
  "country": "France",
  "poster": "https://image.tmdb.org/t/p/w500/….jpg",
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

- **L'ordre du tableau est l'ordre d'ajout** (insertion en tête) — le tri par défaut des onglets en dépend, et la fusion de conflit le préserve.
- `id` = `{type}-{tmdb_id}` ; un re-match vers une autre fiche TMDB change l'id.
- `rating` : 1 à 6 ; `6` implique `favorite: true`.
- `date_vue` : `"YYYY"`, `"YYYY-MM"` ou `"before-2022"` (bucket legacy).
- `director_gender` / `cast_genders` : convention TMDB — 0 inconnu, 1 femme, 2 homme.
- Repasser un film en « à voir » **conserve** note/date/lieu (masqués, restaurés s'il repasse en « vu »).
- Les clés préfixées `_` sont des drapeaux transitoires, filtrées à la sérialisation.

## Mode édition et sécurité

À la première activation, le mode édition demande un **token GitHub fine-grained** (accès Contents en lecture/écriture sur ce seul repo) et un **code personnel**. Le token est chiffré avec le code (PBKDF2 150k itérations + AES-GCM) et stocké en `localStorage` ; à chaque session, le code suffit à le déverrouiller. « Tout réinitialiser » efface le blob chiffré.

Le mode édition n'est actif que sur `*.github.io` (détection automatique du repo depuis l'URL). Domaine custom : renseigner `REPO_OVERRIDE` dans le source. La branche des données se règle via `GH_BRANCH` (défaut `main`).

## Synchronisation multi-appareils

Chaque sauvegarde réécrit tout le fichier, donc les écritures concurrentes sont gérées explicitement :

- **File d'attente locale** : les sauvegardes d'un même onglet sont sérialisées (un enrichissement de masse ne peut pas percuter une édition).
- **Conflit 409** (le fichier a changé depuis notre lecture — autre appareil) : **fusion film par film** au lieu d'écrasement. Un film modifié dans la session garde sa version locale ; un film non touché prend la version distante ; les ajouts des deux côtés sont conservés (les distants en tête) ; les suppressions des deux côtés sont respectées.
- Cas limite assumé : si un conflit survient pendant un enrichissement de masse, l'enrichissement des films non touchés manuellement peut être perdu — le relancer suffit, aucune donnée personnelle n'est en jeu.

## Développement local

N'importe quel serveur statique suffit :

```
python -m http.server 8000    # ou équivalent
```

En local, la collection et les stats fonctionnent (lecture de `films.json` + TMDB) ; le mode édition est désactivé (pas de repo détectable). Le déploiement consiste à pousser `index.html` et `films.json` sur la branche `main` du repo servi par GitHub Pages — attention à ne jamais écraser le `films.json` distant avec une copie locale périmée : c'est lui la base de données vivante.
