# \*films · ma collection de films

Application personnelle de suivi de films (et séries), hébergée sur GitHub Pages, sans build ni backend. Le site tient en **trois fichiers** HTML/CSS/JS vanilla : `index.html` (structure), `style.css` (apparence) et `app.js` (code). Les données vivent dans `films.json`, lu et écrit via l'API GitHub directement depuis le navigateur.

## Fonctionnalités

- **Collection** : deux onglets, « à voir » dans l'ordre d'ajout (le plus récent en premier) et « vus » par date de visionnage (le plus récent en premier). Recherche (titre, réal, casting, insensible aux accents), filtres (genre, lieu, décennie, année et mois de visionnage, pays du film, pays de naissance du·de la réal, notes) et tris (ajout, date vue, note, titre, année). Chaque carte affiche le mois et l'année de sortie en France (voir « Affichage »).
- **Fiche film** : affiche, synopsis, casting cliquable, note perso face à la moyenne TMDB, bande-annonce, liens TMDB et Allociné. La note va de 1 à 5 étoiles, ou ❤ coup de cœur (voir « Notation »). Rubrique **où le voir en France** : logos des plateformes (abonnement, gratuit, location · achat), lue à l'ouverture sur TMDB (`/watch/providers`, pays FR, données JustWatch : mention obligatoire, affichée). Les variantes d'une plateforme (« Netflix Standard with Ads ») sont fondues dans la principale ; les logos mènent à la page TMDB qui liste les liens vers chaque offre. Gardé en mémoire le temps de la visite ; si TMDB ne répond pas, la rubrique n'apparaît pas.
- **Filmographie** : un clic sur un nom (réal ou casting d'une fiche, tops des stats) ouvre la filmographie de la personne dans le site, avec un bouton « retour » vers la vue d'avant (le bouton « précédent » du navigateur marche aussi, voir « Bouton précédent »). Photo, naissance, onglets réalisation et interprétation, « vu X sur Y » sur ce qui est sorti, projets à venir en tête. Films, séries et courts-métrages comptent (TMDB ne distingue pas les courts : les écarter coûterait une requête par film), ainsi que les documentaires réalisés par la personne. L'onglet interprétation écarte les apparitions dans des documentaires (genre TMDB 99 : interview, narration, « dans son propre rôle »), les émissions télé (talk-shows, infos, téléréalité) et les apparitions télé « dans son propre rôle ». Les films de la collection gardent leur carte (note, « à voir »). La personne est retrouvée par les crédits TMDB du film d'où l'on vient (pas de confusion entre homonymes), sinon d'un autre film de la collection, en dernier recours par une recherche par nom. Le clic du milieu ouvre toujours la recherche TMDB.
- **Stats** : **bilan de l'année** (une année au choix depuis 2022 : films, heures, note moyenne, coups de cœur, part du cinéma et des réalisatrices, comparés à l'année d'avant, à la même date pour l'année en cours ; temps forts et top 5), films vus, temps cumulé, note moyenne /10, coups de cœur, cadence par mois et par année, distribution des notes, genre × note, note moyenne par genre, pays d'origine, pays des réalisateur·rices, top réalisateur·rices et acteur·rices, parité, film de l'année. Un clic sur une barre ou une case ouvre les films vus correspondants. Toutes les stats, tops compris, ne portent que sur les films vus : les « à voir » ne comptent nulle part.
- **Découvrir** (onglet appelé « recherche » du 21 au 26 octobre 2026) : au cinéma, tendances, prochainement, **canal+** et **à lyon** (films, via TMDB ; « à lyon » : séances AlloCiné), avec au plus un film américain sur trois (voir « Découvrir : rééquilibrage ») ; recherche libre (films, séries, personnes) ; badges « au ciné » et « dans ma collec », bouton « masquer ma collec ». Après un ajout, la liste affichée (résultats de recherche ou catégorie filtrée) reste telle quelle, à la même position, et le film ajouté y passe « dans ma collec ».
- **Reco** : 24 films proches de tes films bien notés récents, renouvelés chaque mois (voir « Algorithme de reco »).
- **Mode édition** (bouton cadenas, en haut à droite) : ajouter, noter, modifier, supprimer, re-matcher un film sur une autre fiche TMDB, enrichir en masse (pays, genre et pays de naissance des personnes, latinisation des noms non latins). Les boutons d'enrichissement des stats n'apparaissent qu'en mode édition, et seulement s'il reste des fiches incomplètes (un genre que TMDB ne connaît pas ne compte pas : le bouton n'y pourrait rien). Sur la fiche d'un film hors collection, deux boutons identiques : « déjà vu » (ouvre le formulaire note, lieu, date) et « à voir » (ajout direct). Passer un film « à voir » en « vu », ou l'ajouter avec « déjà vu », pré-remplit le mois et l'année en cours (`currentYearMonth()`), à corriger pour un rattrapage ; un film qui a déjà une date, ou la case « vu avant 2022 », n'est pas touché.

## Architecture

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page, balises d'en-tête (sécurité, partage), liens vers les deux fichiers suivants |
| `style.css` | Apparence (tout le CSS) |
| `app.js` | Code de l'application (tout le JavaScript), chargé à la fin de la page |
| `films.json` | Base de données : un tableau de films et leurs métadonnées |
| `apercu.png` | Image d'aperçu affichée quand on partage le lien (1200 × 630) |
| `manifest.webmanifest` | Description de l'application installable : nom, couleurs, page de départ, icônes (voir « Application sur téléphone ») |
| `icone-192.png`, `icone-512.png`, `apple-touch-icon.png` | Icônes de l'application (Android, iPhone) : « \*F », même famille que l'icône « \*N » de nocturne (voir « Application sur téléphone ») |
| `fonts/` | Les quatre polices du site (Bungee, Bricolage Grotesque, Inter Tight, JetBrains Mono), hébergées sur le site : fichiers `.woff2`, leurs déclarations dans `fonts/polices.css`, leurs licences `OFL-*.txt` (voir « Polices ») |
| `tmdb.svg` | Logo officiel de TMDB, affiché en blanc dans les mentions légales, rubrique crédits (voir « Partage et référencement ») |
| `.github/workflows/canal-plus.yml` | Le robot de l'alerte Canal+ : chaque matin, un ticket GitHub (envoyé par mail) pour chaque film « à voir » arrivé sur Canal+ (voir « Alerte Canal+ ») |
| `.github/workflows/cinemas-lyon.yml` | Le robot des cinémas de Lyon : chaque nuit, le programme de la semaine de dix salles, dans `cinemas_lyon.json` (voir « Cinémas de Lyon ») |
| `cinemas_lyon.json` | Programme des cinémas de Lyon, réécrit chaque nuit par le robot : ne pas le modifier ni le pousser à la main |
| `README.md` | Ce document |

Flux de données :

- **Lecture** : au chargement, `fetch('./films.json?t=…')` (cache-buster : le CDN de Pages garde les fichiers ~10 min). À l'activation du mode édition, relecture via l'API GitHub pour repartir de l'état réellement enregistré. Ces relectures ne passent jamais par le cache du navigateur ; au-delà de 1 Mo, l'API ne renvoie plus le contenu sous sa forme habituelle et `films.json` est relu au format brut (jusqu'à 100 Mo).
- **Écriture** : `PUT /repos/{owner}/{repo}/contents/films.json` avec le token GitHub. Le fichier entier est réécrit à chaque sauvegarde, en JSON compact.
- **Enrichissement** : API TMDB v3 (clé embarquée dans le code, risque assumé : données publiques, lecture seule).

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
  "source": { "added_via": "admin", "added_at": "2026-07-08T…", "tmdb_at": "2026-10-22T…" },
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

- **L'ordre du tableau est l'ordre d'ajout** (insertion en tête) : le tri par défaut de « à voir » en dépend, et la fusion de conflit le préserve.
- `id` = `{type}-{tmdb_id}` ; un re-match vers une autre fiche TMDB change l'id.
- `rating` / `favorite` : voir « Notation ».
- `date_vue` : `"YYYY"`, `"YYYY-MM"` ou `"before-2022"` (bucket legacy).
- `director_gender` / `director_genders` / `cast_genders` : convention TMDB (0 inconnu, 1 femme, 2 homme).
- `country` : pays de production, noms anglais de TMDB séparés par « · » (ex. `"USA · Denmark · UK"`). Ils restent en anglais dans le fichier ; tout ce qui s'affiche (fiche, filtres, graphes, liste des pays de Découvrir) passe par `countryFr()` et sa table `COUNTRY_FR`, et le nom français sert aussi de valeur aux filtres. Un pays absent de la table s'affiche en anglais : l'y ajouter.
- `director_countries` : pays de naissance des réalisateur·rices (un par réal, `""` si inconnu), tiré du lieu de naissance TMDB, qui est du texte libre. `normalizeBirthCountry()` ramène les variantes (autres langues, villes et régions sans pays, mentions historiques, pour lesquelles on retient le pays actuel) au même vocabulaire que les pays de production, à l'enregistrement **et** à l'affichage : d'anciennes valeurs brutes sont donc corrigées sans réécrire le fichier. À l'affichage, ils sont traduits en français comme les pays de production. Ils sont récupérés dès l'ajout ou le re-match d'un film (`fillDirectorCountries`, un appel TMDB `/person` par réal), comme le genre ; le bouton « enrichir genres & réalisateurs » des stats ne sert plus qu'aux fiches anciennes, ou à un ajout pendant lequel TMDB n'a pas répondu (le champ reste alors absent).
- Repasser un film en « à voir » **conserve** note, date et lieu (masqués, restaurés s'il repasse en « vu »).
- Les clés préfixées `_` sont des drapeaux transitoires, filtrées à la sérialisation.
- `source.tmdb_at` : date de la dernière lecture des données TMDB du film (voir « Données TMDB : 6 mois au plus »). Absente sur les fiches jamais relues : le film compte alors depuis `added_at`, `rematched_at` ou, pour l'import CSV (`csv_title`), le 19 mai 2026.

## Données TMDB : 6 mois au plus

Les conditions de l'API TMDB (§1.C) interdisent de garder plus de 6 mois une information obtenue de TMDB (« Cache, for longer than 6 months, any information obtained through or from TMDB or the TMDB APIs »). Le site s'y tient de deux façons.

**Mémoires du navigateur** (`localStorage`) :

- Noms des réalisateurs, titres latins et dates de sortie françaises des cartes (`films_card_directors`, `films_card_titles`, `films_card_release_fr`) : chaque entrée garde sa date (`tmdbMemory()`, format `{ d: 1, e: { id: [valeur, date] } }`). À l'ouverture de la page, celles de plus de 6 mois sont effacées, puis relues à la demande. L'ancien format, sans date, a été effacé une fois (2026-10-22) et se reconstruit au fil de l'affichage.
- Reco : profils des films gardés 60 jours ; listes du mois (`films_reco_pool_…`) des mois passés effacées dès l'ouverture de la page (`purgeTmdbMemories()`), et plus seulement quand l'onglet reco reconstruit sa liste.
- Films à l'affiche : relus toutes les 24 h ; une valeur de plus de 6 mois est effacée à l'ouverture.
- Catalogue Canal+ (`films_canal_fr`) : relu toutes les 24 h ; une valeur de plus de 6 mois est effacée à l'ouverture.
- En mémoire vive seulement (perdues en fermant la page) : offres « où le voir », filmographies.

**films.json**, relu automatiquement (`refreshTmdbData()`) :

- Au déverrouillage du mode édition, 3 secondes après, les films dont les données TMDB ont plus de 5 mois (un mois de marge) sont relus en arrière-plan, quatre à la fois, exactement comme à l'ajout : fiche TMDB complète (`buildFilmFromTmdb`), noms restés non latins passés par la fiche personne, pays de naissance des réalisateurs. Une petite barre en bas à gauche montre l'avancement.
- Seuls les champs venus de TMDB changent (`TMDB_FIELDS` : titre, réalisateurs, casting, genres, pays, affiches, synopsis, note TMDB, bande-annonce…), puis `source.tmdb_at` reçoit la date. Statut, note, date, lieu (`user`) et l'origine de la fiche (`csv_title`, `added_at`…) ne sont jamais touchés.
- Enregistrement par lots de 100 films (un commit « tmdb: données relues (100 films) » chacun) ; si la page est fermée en route, les films restants sont relus au déverrouillage suivant. Reverrouiller arrête la relecture sans rien enregistrer de plus.
- Si TMDB ne répond pas pour un film, il garde ses données et sera réessayé la fois suivante (le message de fin indique combien).
- Conflit avec un autre appareil (409) : un film seulement relu ici prend la version distante (statut, note… changés ailleurs) avec les données TMDB relues.
- Répétition le 2026-10-22 sur la base en ligne, enregistrement intercepté : 530 films relus en 49 s, aucun échec, plus aucun nom non latin. Changent surtout la note TMDB, la bande-annonce et la langue d'origine (champ ajouté) ; parfois un titre, l'ordre des co-réalisateurs, un pays de naissance mal écrit (« Великобритания » devenu « UK »). Une erreur de TMDB se propage aussi : au 2026-10-22, le titre français de *Nausicaä de la vallée du vent* (`movie-81`) y était « Le Vaisseau fantôme » ; la corriger sur themoviedb.org (fiche ouverte à tous).
- L'historique git garde les anciennes versions de `films.json` : on ne le réécrit pas, ce serait disproportionné pour un site personnel.

## Cinémas de Lyon (catégorie « à lyon », pastille, fiche)

Depuis le 2026-10-27, le site connaît le programme de dix salles lyonnaises : Lumière Terreaux, Lumière Bellecour, Lumière Fourmi, Comœdia, UGC Part-Dieu, UGC Astoria, UGC Cité Internationale, UGC Confluence, Pathé Bellecour et Pathé Vaise.

- **Le robot** (`.github/workflows/cinemas-lyon.yml`, chaque nuit à 3 h 30 UTC, ou à la main : Actions, « cinémas lyon », Run workflow) lit sur AlloCiné les séances des 7 prochains jours de chaque salle (`/_/showtimes/theater-<code>/d-<jour>/`, par pages de 15 films ; codes AlloCiné dans la liste `SALLES`), retrouve chaque film chez TMDB (titre original puis français, année parmi ses dates de sortie : une ressortie retrouve le film d'origine) et dépose `cinemas_lyon.json` à la racine du dépôt (API GitHub, un commit par nuit, qui republie le site). Une correspondance TMDB est reprise d'une nuit à l'autre pendant 30 jours, puis relue (conditions TMDB : 6 mois au plus). Au 2026-10-27 : 69 films, 64 retrouvés ; les autres (captations de ballet, documentaires absents de TMDB) ne s'affichent pas. Python seul, sans brique externe (pas d'avertissement Node.js), environ une minute et demie.
- **Limite** : l'adresse d'AlloCiné n'est pas un service officiel ; ses conditions interdisent en principe la lecture automatique. Quelques centaines de lectures par nuit, pour un usage personnel ; si AlloCiné la change ou la bloque, la catégorie et les pastilles s'éteignent jusqu'à ce que le robot soit adapté.
- **Séances** : `[« AAAA-MM-JJTHH:MM », version]`, version « VO », « VF » (doublée) ou vide (film français). Seules les séances pas encore passées comptent.
- **Catégorie « à lyon »** (Découvrir) : les films qui passent encore cette semaine, avec sous le titre les salles qui les jouent. Tri par défaut « selon tes goûts » (`classerSelonGouts`, ci-dessous), propre à cette catégorie ; « populaires », « mieux notés » (les films de moins de 20 votes après les autres) et « sorties récentes » restent proposés. Filtres genre et pays ; 40 films à la fois, « charger plus de films ».
- **Pastille « à lyon »** (ambre) sur les cartes des films à voir qui passent cette semaine dans une de ces salles ; elle remplace « au ciné ».
- **Fiche** : rubrique « à lyon cette semaine », avant « où le voir » : chaque salle (lien vers ses séances sur AlloCiné), puis les horaires jour par jour (« auj. », « demain », « jeu. 29 »), VO ou VF signalée.

**Tri « selon tes goûts »** : chaque film reçoit une note d'affinité avec les films vus notés 4★ et plus :

- **ressemblance (40 %)** : comme la Reco (mots-clés pondérés par leur rareté, genres, même réal ou acteurs communs), moyenne des 5 films aimés les plus proches, chacun pesant sa note ;
- **pays (35 %) et genres (25 %)** : leur place parmi les films aimés. Indispensable : les sorties françaises récentes ont souvent peu ou pas de mots-clés chez TMDB (*Melpomène* et *Garance* aucun, *Notre salut* un seul) ;
- **critères de la Reco** : réalisatrice ×1,6, production américaine ×0,6 ;
- **présence** : jusqu'à -35 % pour un film sans aucun vote TMDB (complet à 100 votes) ;
- les films de la liste « à voir » passent devant ; les films déjà vus restent à leur place (étiquette « dans ma collec »).

Réglages dans l'objet `GOUTS` d'`app.js`, ajustés le 2026-10-27 sur les films à l'affiche en France et les exemples d'Emeric (*Le Corset* 2e, *Garance* 4e, *Melpomène* 11e, *Notre salut* 23e ; *Street Fighter* 133e et *Détective Conan* 156e sur 182). Ce tri a été le tri par défaut de « au cinéma » le 27 octobre, puis déplacé sur « à lyon » le même jour à la demande d'Emeric : « au cinéma » a retrouvé son ordre d'avant (popularité, au plus un film américain sur trois), sans « charger plus ».

## Découvrir : prochainement

Depuis le 2026-10-27, « prochainement » suit le calendrier des salles françaises : les sorties les plus proches d'abord (cette semaine, puis la suivante…). Tri par défaut « dates les plus proches » (`release_date.asc`, propre à cette catégorie et proposé seulement là ; « sorties récentes », de la plus récente à la plus ancienne, y est masqué). Requête : TMDB `/discover/movie` avec `region=FR`, `release_date.gte` = aujourd'hui et `with_release_type=2|3` (sortie limitée ou nationale) : avec `region`, la date porte sur la sortie en France, pas sur la première sortie mondiale ; l'ordre de TMDB est gardé tel quel. Au 2026-10-27 : 313 films à venir. Les ressorties de films anciens (date d'origine de plus d'un an, par exemple *Les Diables*, 1971) sont écartées ; les séances événement (concerts filmés, avant-premières) restent. 40 films à la fois, « charger plus de films » au bas de la liste. Avec le tri « populaires », la liste de TMDB « upcoming » est utilisée comme avant.

## Découvrir : canal+

La catégorie « canal+ » montre les films que l'abonnement Canal+ permet de voir en France, en streaming : TMDB `/discover/movie` avec les offres de JustWatch (`watch_region=FR`, `with_watch_providers=381`, Canal+, et `with_watch_monetization_types=flatrate`, l'abonnement seul). Canal VOD (fournisseur 58, location et achat) n'en fait pas partie. Au 2026-10-26, 791 films. Comme « tendances », elle couvre toutes les époques : le filtre de période s'y applique (`discoverAvecPeriode`), avec les mêmes planchers de votes pour les tris « mieux notés » et « sorties récentes ». Les offres changent : la fiche (« où le voir ») dit ce qu'il en est au moment où on l'ouvre.

- **« charger plus de films »**, au bas des listes « canal+ » et « prochainement » (`DISCOVER_PLUS`, `loadMoreDiscover`) : 40 films de plus à chaque clic. La liste est relue en entier avec plus de pages TMDB (10 de plus par clic avec le rééquilibrage, 2 sinon, jamais plus que TMDB n'en a) ; le rééquilibrage choisit les mêmes films pour les premières places, si bien que les suivants s'ajoutent dessous sans que la page bouge (vérifié : mêmes 40 puis mêmes 80 premiers, aucun doublon). Le bouton disparaît au bout du catalogue (791 films au 2026-10-26), sous des résultats de recherche et dans les autres catégories ; la liste allongée est gardée le temps de la visite.
- **Tri par défaut : « sorties récentes »** (`discoverSortDefaut`, depuis le 2026-10-26, à la demande d'Emeric), alors que les autres catégories partent de la popularité. Il trie par date de sortie du film (première sortie, en salle ou ailleurs), pas par date d'arrivée sur Canal+ : TMDB ne dit pas quand un film arrive sur une plateforme. Les films récents arrivant sur Canal+ environ 6 mois après la salle, il montre surtout des arrivées récentes, mais pas les films plus anciens que Canal+ ajoute à son catalogue. Le tri choisi sur « canal+ » lui reste propre (`state.discoverSortsPropres`, comme pour « prochainement ») ; celui de « au cinéma » et « tendances » leur est commun. Le menu de tri affiche celui de la catégorie ouverte, mis en avant seulement s'il diffère du tri par défaut de cette catégorie.
- **Pastille « canal+ »** sur toutes les cartes (à voir, vus, Découvrir, Reco, filmographies, résultats de recherche) des films et séries disponibles avec l'abonnement Canal+, sauf dans la liste « canal+ » elle-même où tous le sont. En bleu (celui de « dans ma collec »), dans le coin bas-droite comme « au ciné » (au-dessus d'elle si les deux sont là). `ensureCanalFR` lit une fois par jour le catalogue complet de Canal+ en France, films et séries (TMDB `/discover` avec `with_watch_providers=381` et `with_watch_monetization_types=flatrate` : l'abonnement seul) : environ 60 pages, 1 156 titres au 2026-10-26, gardés 24 h sur l'appareil (`localStorage`, clé `films_canal_fr`, `{ ts, ids }`) ; une liste incomplète (page TMDB manquante) sert pour la visite sans être enregistrée. Comparée le 2026-10-26 aux offres lues film par film (`/watch/providers`) pour 99 films de la collection : aucun désaccord. Ce jour-là : 3 films à voir sur 19 et 36 vus ; aucun dans « au cinéma », « tendances » ni la Reco (un film arrive sur Canal+ environ 6 mois après la salle).

## Découvrir : rééquilibrage

Les quatre catégories suivent la popularité mondiale de TMDB, qui place les films américains en tête. Dans l'ordre par défaut (pas de filtre de pays, tri par popularité) :

- 5 pages TMDB sont chargées au lieu de 2 (10 pour « canal+ », `DISCOVER_CANAL_PAGES` : son catalogue est si américain qu'avec 5 pages il ne restait que 14 films ; avec 10, les 40 places sont remplies, en 4 s environ à la première visite), puis chaque place revient au film le mieux classé qui ne fait pas dépasser **un film américain sur trois** (`DISCOVER_MAX_US_SHARE`) ; tout film coproduit par les États-Unis compte comme américain.
- Les films indiens (`DISCOVER_NO_BOOST`) ne profitent pas des places libérées : ils restent à leur rang TMDB.
- S'il ne reste que des films américains, la liste s'arrête plutôt que de dépasser la part : « tendances » peut compter moins de 40 films.
- Le pays de production vient du profil de film de la reco (cache partagé, 60 jours).

## Algorithme de reco

Tous les réglages sont dans l'objet `RECO` d'`app.js`. En modifier un invalide de lui-même le pool mis en cache.

1. **Films de départ** : 4★ et plus vus dans les 6 derniers mois ; à défaut de 5 films, le critère s'élargit (3★+, puis 12 mois, puis toutes périodes). 30 films au maximum.
2. **Voisinage** : pour chaque film de départ, ses recos et ses « similaires » TMDB (candidats d'au moins 20 votes). Un candidat n'est retenu que sur **preuve de proximité** : un mot-clé de thème en commun, le même réal ou des acteurs communs, ou une reco TMDB d'un film d'au moins 100 votes. Le genre seul ne suffit pas. Proximité = mots-clés (50 %, pondérés par leur rareté) + genres (20 %) + reco TMDB (15 %) + équipe commune (15 %), seuil 0,20. Le mot-clé TMDB « woman director » est ignoré : il réintroduirait un critère sur le film de départ.
3. **Critères, sur le film proposé** : réalisé par une femme ×1,6 ; produit aux États-Unis ×0,6, au prorata des pays de production. Ils décident lesquels des voisins sont gardés (8 par film de départ) et pèsent sur le tirage.
4. **Grille** : 24 films tirés au sort, pondérés par le score (proximité × note du film de départ × critères), dont **la moitié réalisée par des femmes** quand il y en a assez parmi les voisins, et 2 au plus par film de départ. Tirage et ordre d'affichage sont fixés pour le mois.

Coût : de l'ordre de 600 appels TMDB au premier calcul sur un appareil (une vingtaine de secondes, progression affichée). Les profils de films restent en cache 60 jours, donc les recalculs suivants (nouvelle note, nouveau mois) sont rapides. Si TMDB ne répond pas, la Reco l'indique et rien n'est mis en cache.

## Mode édition et sécurité

À la première activation, le mode édition demande un **token GitHub fine-grained** (accès Contents en lecture/écriture sur ce seul repo) et un **code personnel**. Le token est chiffré avec le code (PBKDF2 150k itérations + AES-GCM) et stocké en `localStorage` ; à chaque session, le code suffit à le déverrouiller. Le token déchiffré ne reste qu'en mémoire et n'est envoyé qu'à `api.github.com`. « Tout réinitialiser » efface le blob chiffré.

Le mode édition n'est actif que sur `*.github.io` (détection automatique du repo depuis l'URL). Domaine custom : renseigner `REPO_OVERRIDE` dans `app.js`. La branche des données se règle via `GH_BRANCH` (défaut `main`).

- **Politique de sécurité (CSP)** : une balise `Content-Security-Policy` en tête d'`index.html` limite ce que la page peut charger et contacter : `app.js`, `style.css` et les polices du site, images TMDB, API TMDB et GitHub. C'est un filet de sécurité : un code injecté ne pourrait ni s'exécuter ni envoyer de données ailleurs. **Toute nouvelle ressource externe doit y être ajoutée**, sinon elle sera bloquée (le blocage apparaît dans la console du navigateur).
- **Seul `app.js` peut exécuter du code** (`script-src 'self'`, sans `'unsafe-inline'`) : une balise `<script>` écrite dans la page ou un attribut `onclick=` / `onerror=` seraient bloqués. Tout nouveau code va dans `app.js`, et les événements se branchent avec `addEventListener`. Les styles, eux, gardent `'unsafe-inline'` (attributs `style=` dans le HTML généré).
- Tous les textes venant de TMDB ou de `films.json` sont neutralisés (`escapeHtml`) avant affichage ; les URL insérées passent par `safeUrl`.
- Les liens qui s'ouvrent dans un nouvel onglet portent `rel="noopener"` : la page ouverte ne peut pas agir sur celle de \*films. À reprendre pour tout nouveau lien `target="_blank"`.
- **Tout est public** : le dépôt l'est, `films.json` compris (notes, dates et lieux de visionnage).

## Partage et référencement

- Description et aperçu Open Graph (titre, texte, `apercu.png`) : un lien partagé s'affiche avec une carte. L'adresse de l'image est absolue (`https://ricojrlyon.github.io/films/apercu.png`) : à adapter si le site change d'adresse.
- Pied de page, sobre (petit texte gris en minuscules), sur une ligne : « \*films », lien « code source ↗ » vers le dépôt GitHub, « mentions légales », bouton « ↑ haut de page ». JustWatch, source des offres « où le voir », est aussi cité dans la fiche, sous ces offres.
- **Mentions légales** : fenêtre ouverte par le lien du pied de page (elle compte pour le bouton précédent, Échap la ferme). Texte fourni par Emeric le 2026-10-22. Éditeur : site personnel, non professionnel et non commercial, sans nom (la loi pour la confiance dans l'économie numérique permet à un particulier de ne donner que l'hébergeur, qui connaît son identité). Hébergeur : GitHub, Inc., adresse prise dans sa politique de confidentialité (GitHub ne publie pas de numéro de téléphone). Données personnelles : aucune collecte ; ce que reçoivent TMDB (adresse IP, texte des recherches) et GitHub (adresse IP) ; base légale, l'intérêt légitime ; transferts vers les États-Unis : TMDB et GitHub sont couverts par le Data Privacy Framework (vérifié le 2026-10-22 sur dataprivacyframework.gov : GitHub y est inscrit ; TMDB est exploité par TiVo Platform Technologies LLC, d'après ses conditions d'utilisation de l'API, société couverte par l'inscription de sa maison mère Xperi Inc.). Crédits : le logo de TMDB (fichier officiel « primary short », page « Logos & Attribution » de themoviedb.org, téléchargé le 2026-10-21) et la mention en anglais que demandent les conditions d'utilisation de TMDB ; la FAQ de TMDB demande de les placer dans une rubrique « About » ou « Credits », et n'autorise le logo qu'en blanc, en noir ou dans ses couleurs : il est affiché en blanc par le CSS (`filter: brightness(0) invert(1)`, le fichier n'est pas modifié). Les affiches restent la propriété de leurs ayants droit ; JustWatch ; les polices. Les obligations des sites professionnels (RCS, TVA, conditions de vente) ne s'appliquent pas. **À revoir si le site change** : nouveau service externe, mesure d'audience, formulaire, cookies.
- Le site demande aux moteurs de recherche de **ne pas l'indexer** (`<meta name="robots" content="noindex, nofollow">`). Le dépôt public sur github.com reste, lui, visible sur GitHub.

## Application sur téléphone

Le site s'installe sur l'écran d'accueil comme une application, sans store : `manifest.webmanifest` (nom « \*films », plein écran, fond `#161f25`, page de départ `./`) et les icônes, déclarés dans l'en-tête d'`index.html` avec l'icône iPhone (`apple-touch-icon`). Le contenu reste celui du site en ligne : chaque mise à jour poussée arrive dans l'application.

- **iPhone** : Safari → Partager → « Sur l'écran d'accueil ». L'application a sa propre mémoire, séparée de Safari : le mode édition (token GitHub + code) est à réactiver une fois, et les mémoires du site (Reco, dates françaises) se reconstruisent.
- **Android, Chrome** : menu ⋮ → « Installer l'application ». Vraie installation (liste des applis), mémoire partagée avec Chrome.
- **Android, Brave** (comme Firefox ou Edge) : en général un raccourci sur l'écran d'accueil plutôt qu'une installation complète, l'installation passant par un service réservé à Chrome ; mémoire partagée avec Brave. Une installation complète dans Brave pourrait demander un mode hors connexion (non fait).
- Pas de mode hors connexion pour l'instant : sans réseau, l'application ne s'ouvre pas.

**L'icône « \*F »** suit les règles de l'icône « \*N » de nocturne (ricojrlyon/nocturne-lyon), pour que les deux applications aient l'air de la même famille sur un téléphone :

- PNG carré, opaque, sans coins arrondis (le téléphone les arrondit lui-même) : 512 et 192 px pour Android, 180 px pour l'iPhone (`apple-touch-icon.png`).
- Fond `#161f25`, F crème `#e7dfbe`, astérisque ocre `#d4a574`, police Bungee (graisse normale, licence libre OFL). « \* » puis la lettre, collés, sans espace ; l'astérisque garde sa place naturelle, son haut aligné sur le haut de la lettre.
- Même taille de lettre que le N : police à 46,4 % du côté (237,6 px à 512, 89,1 px à 192, 83,5 px à 180). C'est la taille où le rectangle « \*N » (largeur du texte × hauteur des capitales) a une diagonale de 76 % du côté. « \*F », plus étroit, garde cette taille ; son rectangle (317,4 × 171 px à 512) est centré, ligne de base arrondie au pixel du dessous.
- Le dessin tient dans le disque de 80 % du côté qu'Android ne rogne jamais : `icone-512.png` sert donc aussi de forme adaptable (« maskable ») dans le manifeste, comme chez nocturne.
- Dessinées comme celles de nocturne : texte SVG affiché par un navigateur de la famille Chrome sans fenêtre (Edge). La même méthode refait le « \*N » de nocturne au pixel près.
- Un téléphone garde l'icône du jour de l'installation : pour voir une nouvelle icône, retirer l'application de l'écran d'accueil puis l'ajouter de nouveau (Chrome sur Android peut la remplacer seul, en quelques jours).

## Bouton précédent

Le bouton « précédent » du navigateur ou du téléphone (geste retour sur Android, y compris dans l'application installée ; glissé depuis le bord gauche sur iPhone dans Safari, l'application installée sur iPhone n'ayant pas de retour) referme ce qui a été ouvert en dernier, comme la croix : fiche (de la collection ou de TMDB), filmographie, page stats, vus filtrés depuis une stat, onglet (à voir, vus, découvrir, reco), fenêtre du mode édition, re-match. Il rend l'écran d'avant à la même position dans la page, avec ses filtres, son tri et le panneau des filtres ouvert ou fermé. Exemple : fiche, puis clic sur la réalisatrice, puis « précédent » : la fiche revient ; encore « précédent » : la liste. Autre exemple : stats, clic sur « Drame », puis « précédent » deux fois : les stats, puis « à voir » sans le filtre Drame. « Suivant » rouvre dans l'ordre. Un aller-retour d'onglets ne s'empile pas : à voir, vus, puis à voir de nouveau revient à la première étape. À l'écran de départ, « précédent » quitte le site (ou ferme l'application).

- Chaque ouverture ajoute une étape à l'historique (`history.pushState`) qui décrit l'écran : page, onglet, filmographie (nom, rôle, onglet), fiche (id du film), fenêtre, position dans la page, filtres et tri de la collection. Changer un filtre ou le tri ne fait pas une étape : ils sont notés au moment où l'on quitte l'écran (au clic), et rendus par « précédent » (`navRendFiltres`). « Précédent » déclenche `popstate`, et `navApply` passe de l'écran affiché à celui de l'étape : il ferme ce qui est en trop et rouvre ce qui manque (une fiche hors collection est rechargée depuis TMDB, une filmographie aussi).
- Fermer autrement (croix, Échap, clic à côté, « ← retour », enregistrement, suppression, ajout) recule l'historique jusqu'à l'étape qui montre le même écran (`history.go`), pour que « précédent » ne tombe jamais sur une fiche déjà fermée. « ← retour » garde donc son comportement : retour à la vue d'avant la filmographie, sans rouvrir la fiche d'où l'on venait.
- Ouvertures et fermetures d'un même geste comptent pour une étape (ouvrir une filmographie ferme la fiche : c'est un seul nouvel écran). Le code est dans app.js, section « BOUTON PRÉCÉDENT » (`navLater`, `navFlush`, `navApply`).
- Après un rechargement de la page, rien n'est ouvert ; les étapes d'avant restent atteignables par « précédent ».

## Polices

Les quatre polices sont hébergées sur le site (`fonts/`) et non plus chez Google Fonts, qui recevait l'adresse IP de chaque visiteur. Le dossier est repris tel quel de nocturne-lyon, qui utilise les mêmes polices : ce sont les fichiers que Google servait au 2026-10-01, avec ses déclarations à l'identique (familles, graisses, découpage par alphabet), seules les adresses deviennent locales. Vérifié le 2026-10-21 : les 52 déclarations correspondent à celles que Google sert aujourd'hui pour \*films (seule différence, quatre symboles de monnaie récents dans l'alphabet latin étendu, sans effet sur du texte français), et un même texte a exactement la même largeur, au centième de pixel, dans les quatre polices et toutes leurs graisses.

- Un navigateur ne télécharge que les alphabets dont la page a besoin. Les quatre fichiers de l'alphabet latin de base sont demandés dès l'ouverture (`<link rel="preload">` dans `index.html`).
- Licence SIL Open Font License 1.1, qui en autorise la redistribution : les textes sont à côté, `fonts/OFL-*.txt`.
- `fonts/polices.css` n'a pas de numéro de version : s'il change un jour, lui en ajouter un (`polices.css?v=2`) dans `index.html`.

## Affichage

- Le site se déclare sombre (`<meta name="color-scheme" content="dark">`). Ce que dessine le navigateur lui-même suit donc le thème sombre : listes déroulantes ouvertes, barres de défilement, case à cocher du mode édition. Les éléments du site gardent leurs couleurs, toutes définies dans le CSS.
- Date des cartes : mois et année de sortie en France (`10/2026`), lue sur TMDB (`/movie/{id}/release_dates`, pays FR) : sortie en salles (type 3, sinon 2), à défaut sortie en ligne (type 4). Une avant-première ou un festival ne compte pas ; une date française plus de 2 ans après la date principale est une ressortie et n'est pas retenue. Sans date française (ou en attendant la réponse), la carte affiche la date principale de TMDB, souvent la première sortie mondiale ; les séries gardent leur première diffusion. Les dates passées restent en mémoire sur l'appareil 6 mois au plus (`localStorage`, clé `films_card_release_fr`, voir « Données TMDB : 6 mois au plus ») ; une sortie à venir ou introuvable est revérifiée au chargement suivant. Rien n'est écrit dans `films.json` : les filtres et tris par année gardent l'année principale.
- Affiche introuvable (image retirée de TMDB, réseau coupé) : la carte affiche le titre du film à la place, comme une carte sans affiche (`showPoster`, pour toutes les grilles).
- Effets de flou : chaque `backdrop-filter` est doublé de `-webkit-backdrop-filter`, seule forme comprise par Safari avant la version 18. À reprendre pour tout nouveau flou.

## Accessibilité

- Navigation clavier : les cartes et les films de l'année sont atteignables avec Tab (contour doré, visible seulement au clavier) ; Entrée ouvre la fiche.
- Fiche film : déclarée comme fenêtre de dialogue, nommée par le titre du film. À l'ouverture, la sélection clavier entre dans la fiche ; Tab y reste tant qu'elle est au premier plan ; Échap la ferme et la sélection revient à la carte d'origine.
- Petits écrans : les quatre catégories de Découvrir passent sur deux lignes quand la place manque, au lieu de sortir de l'écran (« canal+ » restait caché à droite jusqu'à 400 px de large) ; sur ordinateur, une seule ligne.
- Bouton du mode édition : un cadenas dessiné (`cadenasSvg` dans app.js), d'une seule couleur, celle du texte du bouton (gris, vert une fois déverrouillé, ouvert), à la place de l'emoji en couleurs ; il est nommé « mode édition » pour les lecteurs d'écran (`aria-label`). Le même cadenas, en petit, figure dans les phrases qui y renvoient.
- Lecteurs d'écran : les deux champs de recherche ont un nom (`aria-label`), et les titres des stats sont des `h2`, juste sous le titre du site (`h1`), sans niveau sauté.
- Listes de filtres et de tri : dans la collection, chacune est reliée à son étiquette visible (`aria-labelledby` vers l'id `label-…`), donc le nom annoncé suit le texte affiché. Dans Découvrir, sans étiquettes visibles, elles ont un nom invisible (`aria-label`), sauf « période », nommée par son info-bulle.

## Alerte Canal+

Chaque matin, un robot GitHub (`.github/workflows/canal-plus.yml`, mis en place le 2026-10-26) prévient quand un film de la liste « à voir » entre dans le catalogue Canal+ (abonnement, pas achat ni location) : il ouvre un ticket (issue) « « Hamnet » est sur Canal+ » dans le dépôt, et GitHub l'envoie par mail et sur son application.

- Il lit `films.json` et la clé TMDB d'`app.js` sur le dépôt, puis le catalogue Canal+ en France, films et séries (TMDB `/discover`, fournisseur 381, `flatrate`), comme la pastille « canal+ ».
- Les tickets (étiquette `canal+`) servent de mémoire, rien n'est écrit dans le dépôt ni republié : un film n'est signalé qu'une fois par arrivée. Le ticket peut être fermé quand on veut. Quand le film quitte Canal+ ou n'est plus « à voir » (vu, supprimé), le robot ferme son ticket avec un mot et l'étiquette `terminé` ; s'il revient plus tard sur Canal+, une nouvelle alerte part. Un catalogue lu incomplètement (TMDB en panne) ne ferme rien.
- Le ticket nomme le propriétaire du dépôt (`@ricojrlyon`) : la notification arrive même si l'on ne suit pas tout le dépôt. Réglages : https://github.com/settings/notifications (mail pour « Participating, @mentions » et « Watching »).
- Premier passage : les films à voir déjà sur Canal+ sont signalés aussi (choix d'Emeric). Au 2026-10-26, un seul : Hamnet.
- Écrit sans brique externe (pas d'`actions/checkout`) : Python seul, déjà présent sur les machines de GitHub, d'où aucun avertissement Node.js. Jeton : celui que GitHub donne au robot (`GITHUB_TOKEN`, droit d'écrire des tickets seulement), aucun secret à créer.
- Lancer à la main : onglet Actions, « alerte canal+ », Run workflow. Le passage programmé est à 6 h UTC (7 h ou 8 h à Paris), avec parfois du retard chez GitHub. GitHub suspend les passages programmés d'un dépôt public resté 60 jours sans aucun changement : chaque modification de `films.json` (ajout, note) suffit à l'éviter ; sinon le réactiver dans l'onglet Actions.
- Essayé le 2026-10-26 en simulation (rien d'écrit) sur la base en ligne : alerte pour Hamnet ; et, avec de faux tickets, pas de seconde alerte, nouvelle alerte après un retour, ticket fermé à la main respecté, fin pour un film parti de Canal+ ou vu.

## Synchronisation multi-appareils

Chaque sauvegarde réécrit tout le fichier, donc les écritures concurrentes sont gérées explicitement :

- **File d'attente locale** : les sauvegardes d'un même onglet sont sérialisées (un enrichissement de masse ne peut pas percuter une édition).
- **Conflit 409** (le fichier a changé depuis notre lecture, sur un autre appareil) : **fusion film par film** au lieu d'écrasement. Un film modifié dans la session garde sa version locale ; un film non touché prend la version distante ; les ajouts des deux côtés sont conservés (les distants en tête) ; les suppressions des deux côtés sont respectées. La fusion relit le fichier distant quelle que soit sa taille.
- Cas limite assumé : si un conflit survient pendant un enrichissement de masse, l'enrichissement des films non touchés manuellement peut être perdu. Le relancer suffit : aucune donnée personnelle n'est en jeu. La relecture automatique des données TMDB, elle, est gardée à la fusion (voir « Données TMDB : 6 mois au plus »).

## Développement local et déploiement

N'importe quel serveur statique suffit :

```
python -m http.server 8000    # ou équivalent
```

En local, la collection, les stats, Découvrir et la Reco fonctionnent (lecture de `films.json` + TMDB) ; le mode édition est désactivé (pas de repo détectable).

Déploiement : pousser sur la branche `main` les fichiers modifiés, **ensemble, en une seule fois** (le dossier `fonts/` se pousse entier, en glissant le dossier dans « Upload files ») (`index.html` a besoin de `style.css` et `app.js`). **Ne jamais pousser une copie locale de `films.json`** : celui du dépôt est la base de données vivante, réécrite par le mode édition, et une copie locale, même récente, peut effacer des films ajoutés depuis.

**Numéros de version** : `index.html` appelle `style.css?v=…` et `app.js?v=…`. À chaque modification de l'un de ces deux fichiers, augmenter son numéro dans `index.html` (et pousser `index.html` avec). GitHub Pages laisse les navigateurs garder un fichier 10 minutes : sans nouveau numéro, un visiteur qui recharge la page peut recevoir la nouvelle page avec l'ancien code. Le numéro change l'adresse du fichier et force le navigateur à prendre la nouvelle version ; l'autre fichier, s'il n'a pas changé, reste en cache. `films.json` n'est pas concerné : il est toujours relu à neuf.

Ce README est tenu à jour à chaque modification du site.
