# Audit complet de *films

Date : 12 novembre 2026. Version auditée : celle en ligne sur `github.com/Ricojrlyon/films` (branche `main`), identique à la copie locale : `app.js?v=21`, `style.css?v=15`.

**Comment l'audit a été fait**
- **Six relectures en parallèle** : bugs et navigation ; données et enregistrement ; sécurité ; performance et parcours réel ; accessibilité et compatibilité ; code inutile, README et conformité.
- **Contre-vérification** : chaque constat d'abord classé « haute » a été refait par une seconde relecture indépendante, avec ses propres tests. Trois ont été confirmés en « haute », trois ramenés à « moyenne ».
- **Essais réels** : le site a été servi en local et parcouru avec Edge et WebKit (le moteur de Safari) sans fenêtre, en 375 px (téléphone) et en grand écran. Lighthouse a été lancé en mobile et en ordinateur.
- **Sans aucun risque pour le site** :
  - aucun fichier du site n'a été modifié ;
  - aucune écriture vers GitHub : un garde-fou bloquait toute requête d'écriture, et aucune n'a été tentée ;
  - les enregistrements, les conflits et les pannes ont été joués avec un faux GitHub dans la page et un faux token ;
  - les réponses TMDB étaient gardées sur disque, donc chaque appel n'est parti qu'une fois.

**Échelle de gravité utilisée**
- **critique** : perte de données probable, ou site cassé pour tout le monde ;
- **haute** : perte de données possible, fonction promise qui ne marche pas, ou défaut qui gêne tout le monde en permanence ;
- **moyenne** : défaut réel, mais limité à certains cas ou à certains écrans ;
- **basse** : défaut mineur, ou amélioration.

---

## 1. Résumé

1. Le site est sain et bien construit pour un projet sans framework. Sur tous les parcours, en téléphone comme en grand écran : aucune erreur dans la console, aucun blocage par la politique de sécurité, aucune requête en échec.
2. La sécurité est solide. La politique de sécurité interdit tout script ajouté, les textes externes sont neutralisés, et le token ne part que vers GitHub.
3. Le bouton précédent est fiable : 27 enchaînements testés, rechargement compris.
4. Aucun constat critique. Trois constats de gravité haute, une trentaine de gravité moyenne, le reste mineur.
5. **Risque n°1, perte de données (D1)**. Un onglet resté ouvert, ou l'appli du téléphone gardée en mémoire, peut écraser en silence une note faite sur un autre appareil, faire revenir un film supprimé ou en effacer un ajouté. Démontré deux fois, par deux relectures indépendantes.
6. **Risque n°2, « à lyon » ne voit qu'environ une journée (R1)**. Le robot des cinémas demande les jours à AlloCiné dans un format qu'AlloCiné ignore. Depuis son premier passage, il n'a jamais récupéré plus que « aujourd'hui et demain matin ».
7. **Risque n°3, textes secondaires trop pâles (X1)**. Année et réal sous les cartes, sous-titres des stats, pied de page : contraste de 2,4 à 3,0 pour 1, il faudrait 4,5.
8. Les autres défauts sont des cas limites : réponses qui arrivent dans le désordre, double clic, recherche qui ne trouve pas « l’ » contre « l' », messages trompeurs quand TMDB est en panne. Ou des points d'accessibilité : clavier, lecteurs d'écran.
9. Il n'existe aucun test. La stratégie proposée a été essayée : `app.js` se charge sans navigateur, 5 tests passent en 0,08 s.
10. Notes par axe :

| Axe | Note /10 |
|---|---|
| Bugs et logique des écrans | 6 |
| Données et enregistrement | 6 |
| Robots (workflows GitHub) | 5 |
| Sécurité | 8 |
| Performance | 7 |
| Accessibilité | 5 |
| Compatibilité | 8 |
| Code et maintenabilité | 7 |
| Conformité (TMDB, JustWatch, mentions) | 7 |
| README fidèle au code | 8 |
| Tests | 0 |

---

## 2. Tableau des constats

Préfixes : **D** données, **R** robots, **B** bugs d'écran, **P** performance, **X** accessibilité, **C** compatibilité, **S** sécurité, **L** conformité, **M** code et maintenance.

Confiance : **confirmé** (reproduit par un test), **probable** (lu dans le code, pas reproduit), **à vérifier**.

### 2.1 Gravités haute et moyenne

| ID | Gravité | Axe | Emplacement | Problème | Correction (résumé) | Effort | Risque | Confiance |
|---|---|---|---|---|---|---|---|---|
| D1 | **haute** | données | `app.js:4581`, `4594-4615`, `4648-4683` | Les marques « modifié ici » ne sont jamais effacées : au conflit suivant, une version périmée gagne | Oublier les marques d'un envoi réussi | S | faible | confirmé ×2 |
| R1 | **haute** | robots | `cinemas-lyon.yml:116` | Adresse AlloCiné `d-1`…`d-6` ignorée : environ 1 jour de séances au lieu de 7 | Demander `d-AAAA-MM-JJ` | S | faible | confirmé |
| X1 | **haute** | accessibilité | `style.css:11` (`--ink-mute`) | Texte gris à 2,4-3,0:1 partout (cartes, stats, pied de page) | `--ink-mute: #8d97a1` | S | faible (visuel) | confirmé ×2 |
| D2 | moyenne | données | `app.js:5109`, `5260` | Après un conflit puis un échec, le retour arrière touche un autre film | Retrouver le film par son id | S | faible | confirmé ×2 |
| D3 | moyenne | données | `app.js:5223-5240` | Re-match vers un film déjà présent : doublon, puis une note perdue | Refuser comme l'ajout | S | nul | confirmé |
| D4 | moyenne | données | `app.js:3580` | Stockage du navigateur interdit : le site ne démarre pas du tout | `try/catch` | S | nul | confirmé |
| B1 | moyenne | écrans | `app.js:669`, `672`, `729`, `5709` | Découvrir : recherche et catégorie s'écrasent l'une l'autre | Vérifier la case de recherche avant d'afficher | S | faible | confirmé |
| B2 | moyenne | écrans | `app.js:536-538` | Retour sur Découvrir : liste de la catégorie sous une case qui dit encore « dune » | Refaire la recherche si la case est remplie | S | faible | confirmé |
| B3 | moyenne | écrans | `app.js:1256-1265` | Fiche TMDB lente : elle remplace la fiche ouverte entre-temps | Vérifier l'id de la fiche ouverte | S | très faible | confirmé |
| B4 | moyenne | écrans | `app.js:4371-4379` | Une réponse TMDB tardive redessine la fiche et efface une saisie en cours | Ne pas redessiner après le début d'une saisie | S | faible | confirmé |
| B5 | moyenne | écrans | `app.js:5693-5711`, `355-359` | Au démarrage, « aucun film ne correspond » s'affiche ; si films.json échoue, son message d'erreur est effacé | Ne pas dessiner avant films.json | S | très faible | confirmé ×2 |
| B6 | moyenne | écrans | `app.js:3901`, `666` | TMDB en erreur : « aucun film ne correspond, élargis tes filtres », gardé toute la visite | Traiter l'erreur HTTP comme une erreur | S | faible | confirmé |
| B7 | moyenne | écrans | `app.js:5412-5414` | Double clic sur une carte (ordinateur) : la fiche s'ouvre et se referme | Ignorer le 2e clic | S | très faible | confirmé |
| B8 | moyenne | écrans | `app.js:281-283` | Recherche : espace final du clavier de téléphone, `’` contre `'`, espace insécable, `œ` | Compléter `normSearch` | S | faible | confirmé |
| P1 | moyenne | performance | `app.js:3400-3448` | Ouverture des stats : environ 0,5 s figée sur téléphone (116 000 appels à `normSearch`) | Normaliser une seule fois | S | très faible | confirmé ×2 |
| P2 | moyenne | performance | `app.js:3676-3712`, `5696` | Catalogue Canal+ : 131 appels et 716 Ko par jour et par appareil, au démarrage | Le faire écrire par le robot de nuit | M | faible | confirmé |
| P3 | moyenne | performance | `app.js:1875-1877`, `2028` | Fiche : affiche w500 et fond w1280, soit 178 Ko de trop par fiche | w342 et w780 | S | faible | confirmé |
| P4 | moyenne | performance | `app.js:266-279` | Filtre après « charger plus » jusqu'au bout : 1,9 s sur téléphone (fondu sur 581 cartes) | Pas de fondu au-delà de 120 cartes | S | très faible | confirmé |
| X2 | moyenne | accessibilité | `style.css:1994-1998` | Repère du clavier invisible sur tous les liens (Chrome, Brave) | Ajouter `a:focus-visible` | S | très faible | confirmé ×2 |
| X3 | moyenne | accessibilité | `style.css:352-458`, `1834-1851` | Pastilles sur les affiches illisibles sur affiche claire (37 sur 109 sous le seuil) | Voile plus sombre | S | faible (visuel) | confirmé |
| X4 | moyenne | accessibilité | `app.js:2792` ; `style.css:286-290`, `371-377` | Chiffres de la heatmap et blanc sur orange : 1,9 à 3,9:1 | Couleurs de texte foncées | S | très faible | confirmé |
| X5 | moyenne | accessibilité | `app.js:2985-2995`, `2793-2805`, `2659`, `3414-3430`, `3371-3385` | Stats : 208 éléments cliquables à la souris seulement ; « ton film de l'année » sourd à Entrée | Rendre activables au clavier | M | faible | confirmé |
| X6 | moyenne | accessibilité | `index.html:393`, `477` ; `app.js:5426-5439` | Fenêtres mode édition, re-match et mentions : Tab s'en échappe ; fuite dans la fiche sous Safari | `role="dialog"` et `inert` | M | moyen | confirmé |
| X7 | moyenne | accessibilité | `app.js:420-427`, `1232-1235` ; `index.html:71-74`, `91-95`, `171-176` | Cartes sans rôle, boutons bascules sans état annoncé | `role="button"`, `aria-pressed` | S | très faible | confirmé |
| X8 | moyenne | accessibilité | `style.css:1074-1075` | `content-visibility` cache 10 titres de stats sur 13 aux lecteurs d'écran | Retirer ces deux lignes | S | faible | confirmé |
| X9 | moyenne | accessibilité | `index.html:493`, `197-199` | Toasts et nombre de résultats jamais annoncés | `role="status"`, `aria-live` | S | nul | confirmé |
| X10 | moyenne | accessibilité | `style.css:156` | Bouton « + filtres » coupé sous 348 px (petit téléphone, texte agrandi) | `min-width: 0` | S | très faible | confirmé |
| C1 | moyenne | compatibilité | `index.html:12` | `viewport-fit=cover` sans marges de sécurité : contenu sous l'encoche de l'iPhone | Retirer `viewport-fit=cover` | S | très faible | probable |
| S1 | moyenne | sécurité | hébergement | *films partage son origine `ricojrlyon.github.io` avec nocturne-lyon : un défaut de nocturne suffirait à voler le token | Documenter ; à terme, domaine propre | M | moyen | confirmé |
| L1 | moyenne | conformité | `app.js:4391`, `4799`, `4843` | Règle TMDB des 6 mois : dépend d'un déverrouillage manuel (5 films à relire avant le 15/12/2026) | Alerte par le robot du matin | S | faible | confirmé |
| L2 | moyenne | conformité | `cinemas-lyon.yml:123-129`, `204-220` | Le robot republie publiquement chaque nuit des données extraites d'AlloCiné ; 3 champs inutiles | Retirer les champs, compléter le README | S | faible | confirmé (faits) |

### 2.2 Gravité basse

| ID | Axe | Emplacement | Problème | Correction | Effort | Confiance |
|---|---|---|---|---|---|---|
| D5 | données | `app.js:106-169` | Une seule entrée abîmée dans films.json (à la main) vide le site, sans message | Remise en forme à la lecture | S | confirmé |
| D6 | données | `app.js:1677-1680` | Séances jugées à l'heure de l'appareil : fausses depuis l'étranger | Heure de Paris par `Intl` | S | confirmé |
| D7 | données | `app.js:849`, `1110`, `3860`, `1283` | « Aujourd'hui » pris en UTC (entre minuit et 1 h ou 2 h, c'est encore la veille) | `aujourdhuiParis()` | S | confirmé |
| D8 | données | `app.js:63-65` | Une note 7 devient 6 sans coup de cœur | Plafonner avant de décider | S | confirmé |
| D9 | données | `app.js:4524`, `4574`, `4849`, `5110` ; `4860` | Messages d'erreur techniques en anglais ; fiche encore modifiable après verrouillage | Traduire, fermer la fiche au verrouillage | S | confirmé |
| D10 | données | aucun `beforeunload` | Fermer la page pendant un envoi peut l'annuler sans prévenir | Retenir la fermeture | S | probable |
| B9 | écrans | `app.js:658-666` | Même liste de Découvrir chargée 3 fois en parallèle (jusqu'à 330 appels pour « à lyon ») | Partager la promesse en cours | S | confirmé |
| B10 | écrans | `app.js:5105`, `5130`, `2208`, `5256` | Un enregistrement lent referme une autre fiche ouverte entre-temps | Fermer seulement la bonne fiche | S | confirmé |
| B11 | écrans | `app.js:215-241` | Filtres « année vue, mois, note » laissés actifs sur « à voir » : liste vide | Les ignorer sur « à voir » | S | confirmé |
| B12 | écrans | `app.js:5608`, `5619` | Précédent puis suivant : le filtre posé entre-temps est perdu | `navReplace()` après chaque filtre | S | confirmé |
| B13 | écrans | `app.js:5645-5650` | Précédent juste après un rechargement : film de la collection rouvert comme fiche TMDB | Attendre films.json | S | confirmé |
| B14 | écrans | `app.js:658`, `724`, `1809` | « aucun film ne correspond » reste sous les messages de chargement | Masquer `#empty` | S | confirmé |
| P5 | performance | `index.html:71-72`, `201` ; `style.css:150` | La page saute au chargement (CLS 0,12 à 0,23) : onglets qui passent sur 2 lignes, pied de page | Largeur fixe des compteurs, place réservée | S | confirmé ×2 |
| P6 | performance | `app.js:1142-1166` | Dates et réals encore demandés pour des cartes déjà retirées (42 % après une recherche retapée) | `if (!c.isConnected) continue;` | S | confirmé |
| P7 | performance | `app.js:2699` | Un écouteur ajouté au graphique « par mois » à chaque redessin | Le poser une seule fois | S | confirmé |
| P8 | performance | `app.js:1056` | Série sans créateur redemandée à chaque rendu | Mémoriser aussi « aucun » | S | confirmé |
| P9 | performance | 20 `fetch` directs | Appels TMDB sans nouvel essai après une réponse 429 ; jusqu'à 21 appels simultanés | Passer par `tmdbJson` | M | à vérifier |
| S2 | sécurité | `app.js:3535-3541` | `safeUrl` laisse passer `&#41;` : sortie du `url()` CSS, fausse fenêtre en plein écran | Échapper `&` | S | confirmé |
| S3 | sécurité | `app.js:439-441`, `1929`, `4956`, `2583`, `2659`, `3377`, `5211` | Note, statut, id, année, dates insérés sans `escapeHtml` (une note piégée redirige vers un autre site) | `escapeHtml` ou nombre forcé | S | confirmé |
| S4 | sécurité | `app.js:4752-4882` | Token et code restent dans les champs après verrouillage et réinitialisation | Vider les champs | S | confirmé |
| S5 | sécurité | `app.js:3603`, `4767` ; `index.html:411-423` | Code de 4 caractères (retrouvé en 57 s), 150 000 itérations (OWASP : 600 000), token sans expiration | Code plus long, expiration d'un an | S | confirmé |
| S6 | sécurité | `index.html:11` | `style-src 'unsafe-inline'` laisse passer une balise `<style>` injectée | `style-src-attr 'unsafe-inline'`, `base-uri 'none'` | S | confirmé |
| R2 | robots | `canal-plus.yml:115`, `142-153` | Titre TMDB brut dans les tickets : `@mention`, et faux marqueur qui égare la mémoire du robot | Dernier marqueur, `@` neutralisé | S | probable |
| R3 | robots | `cinemas-lyon.yml:117`, `204-220` ; les deux fichiers | Programme vide publié quand même ; pas de `concurrency` ; `TimeoutError` non rattrapé dans canal-plus | Arrêt en erreur si vide, `concurrency` | S | probable |
| R4 | robots | `schedule:` des deux fichiers | Les robots tournent 6 à 8 h après l'heure prévue ; règle des 60 jours d'inactivité mal documentée | Le dire dans le README | S | confirmé |
| X11 | accessibilité | `app.js:4908-4937`, `1975-1997` ; `index.html:403-483` | Étiquettes du mode édition non reliées à leurs champs | `for` / `id` | S | confirmé |
| X12 | accessibilité | `app.js:2641` ; `style.css:1216`, `1325-1347` | Cibles de moins de 24 px : barres « par mois », heatmap sur téléphone, pied de page | Agrandir | S | confirmé |
| X13 | accessibilité | `app.js:859`, `906-978` | Focus perdu à l'ouverture et au retour de la filmographie | Focus sur « ← retour » | S | confirmé |
| L3 | conformité | `index.html:360-375` | Mentions : pas de contact ni de rappel des droits (CNIL) ; anonymat soumis à une condition à vérifier chez GitHub | Une ligne de contact et de droits | S | à vérifier |
| M1 | code | `app.js:1693`, `2382-2388`, `3780` | Code mort : `nomSalle`, `numericPerYear`, `peakYear`, `cinemaCount`, `_from_person` | Supprimer (8 lignes) | S | confirmé |
| M2 | code | `style.css:92-99`, `1514-1520`, `1852-1856`, `19-21` | CSS mort : `.sub`, `.search-result.selected`, `.search-result.in-collection`, variables `--motif-*` | Supprimer | S | confirmé |
| M3 | code | `app.js:2111`, `2181`, `4231-4232` | `csv_genres: []`, `imdb_id`, `original_language` écrits, jamais lus | Ne plus les écrire (en deux temps) | S | confirmé |
| M4 | code | `app.js:2133-2140`, `2889-2945`, `4238-4291` ; `index.html:271-274` | Outils de migration terminés : pays et bande-annonce « à la demande » (environ 110 lignes) | Retirer | M | probable |
| M5 | code | `app.js:1499-1518` et `1604-1622` ; `4203` et `4269-4276` | Mesures de ressemblance et choix de bande-annonce écrits deux fois | Une fonction commune | M | confirmé |
| M6 | code | `style.css:380-457` | Quatre pastilles CSS presque identiques (13 déclarations communes) | Une règle commune | S | confirmé |
| M7 | code | `app.js` (5 tableaux de mois, 3 listes de lieux, 3 tables de filtres) | Listes recopiées, nombres magiques | Constantes uniques | S | confirmé |
| M8 | code | `app.js:2751-2755` | Heatmap : choix des genres sur tous les films, « à voir » compris (sans effet aujourd'hui) | Filtrer sur « vu » | S | confirmé |
| M9 | README | voir section 2.4 | 14 écarts entre README et code, et beaucoup d'historique dans le corps du texte | Corriger, déplacer l'historique | S | confirmé |

### 2.3 Fiches détaillées (gravités haute et moyenne)

#### D1 · haute · Les marques « modifié ici » ne sont jamais effacées

**Le problème en clair.** Quand deux appareils enregistrent presque en même temps, GitHub refuse le second (« conflit 409 »). Le site fusionne alors film par film. Pour décider qui gagne, il se souvient des films « modifiés ici ». Mais il s'en souvient depuis l'ouverture de l'onglet, pas depuis le dernier enregistrement réussi. Un film modifié et enregistré lundi dans un onglet resté ouvert gagne donc encore mercredi contre une modification plus récente faite sur le téléphone.

```js
// app.js:4581, jamais vidé (aucun .clear() dans tout le fichier)
const sessionChanges = { added: new Set(), edited: new Set(), deleted: new Set() };
// app.js:4594 et 4599 : un film « touché » garde la version de l'onglet
const touched = id => sessionChanges.added.has(id) || sessionChanges.edited.has(id);
      if (touched(f.id)) merged.push(f);
```

**Preuve (deux relectures indépendantes, avec les vrais gestes du site et un faux GitHub).**
1. Onglet A : X noté 2★, Z noté 5★, W supprimé. Les trois enregistrements réussissent.
2. Autre appareil : X passe à 3★ avec « Cinéma » et une date, Z est supprimé, W est rajouté.
3. Plus tard, dans l'onglet A, on note Y. Le site reçoit un conflit 409, fusionne, enregistre et affiche « ✓ mis à jour ».

Résultat sur GitHub : X repasse à 2★ (note écrasée), Z est de retour (suppression annulée), W a disparu (ajout perdu). En vidant la liste avant l'étape 3, on obtient le bon résultat. La cause est donc bien celle-là.

Cas le plus probable : un film ajouté « à voir » sur le téléphone, puis noté « vu 4★ » sur l'ordinateur. L'appli du téléphone, restée ouverte, enregistre autre chose : le film repasse « à voir », sans note.

**Correction (essayée sur une copie : les trois pertes disparaissent, les cas sains restent sains).**
- Numéroter chaque marque.
- Après un envoi réussi, oublier les marques qui faisaient partie de l'envoi.
- Garder celles posées pendant l'envoi (numéro plus grand) : ne surtout pas tout vider, sinon une édition en attente dans la file serait perdue.

```js
const sessionChanges = { added: new Map(), edited: new Map(), deleted: new Map() };
let changeSeq = 0;
function marquer(liste, id) { liste.set(id, ++changeSeq); }
function oublierMarques(jusqua) { /* retirer les marques de numéro <= jusqua, idem tmdbRefreshed */ }
// doSaveFilmsToGithub, aux deux PUT : const seq = changeSeq; … ghPutFile(…); oublierMarques(seq);
```

Corriger aussi la phrase du README : « un film modifié depuis le dernier enregistrement réussi garde sa version locale ».

#### R1 · haute · Le robot des cinémas ne récupère qu'environ une journée

**Le problème en clair.** Le robot demande à AlloCiné les séances de chaque salle pour sept jours : `d-0`, `d-1`, … `d-6`. Mais AlloCiné attend une date complète (`d-2026-11-14`) : avec un simple numéro, il renvoie toujours la même page par défaut. Le robot reçoit sept fois la même chose et ne garde que les doublons écartés.

```python
# cinemas-lyon.yml:116
url = 'https://www.allocine.fr/_/showtimes/theater-%s/d-%d/%s' % (code, j, 'p-%d/' % page if page > 1 else '')
```

**Preuve.**
- Essai direct, 6 requêtes sur le Comœdia le 12/11 à 11 h 45 :
  - `d-0`, `d-1`, `d-2`, `d-3` donnent exactement la même réponse (séances du 11 et du 12) ;
  - `d-2026-11-14` donne les séances du 14 ;
  - `d-2026-11-15` donne celles du 15.
- Les 8 versions de `cinemas_lyon.json` relues dans l'historique (du 27/10 au 11/11) ne contiennent jamais que deux dates : le jour du passage (environ 420 séances) et le lendemain (90 à 195 séances, jusqu'en début d'après-midi).
- Le 12/11 à 11 h 45, le fichier en ligne ne garde que 93 séances à venir, la dernière à 15 h 20.

**Conséquence.** La catégorie « à lyon », la pastille et la ligne « en salle à lyon » ne montrent que les films qui passent aujourd'hui ou demain matin, au lieu de la semaine. Le README promet 7 jours.

**Correction.**
```python
jour = (aujourdhui + timedelta(days=j)).isoformat()
url = 'https://www.allocine.fr/_/showtimes/theater-%s/d-%s/%s' % (code, jour, 'p-%d/' % page if page > 1 else '')
```
Ajouter le garde-fou de R3 : si aucune séance n'est trouvée, arrêter en erreur au lieu de publier un fichier vide. Le fichier passera d'environ 40 Ko à environ 150 Ko, sans gêne. Il y aura aussi environ sept fois plus de lectures chez AlloCiné par nuit : à mettre en balance avec L2.

#### X1 · haute · Le gris « muet » est trop pâle

`--ink-mute: #5e6973` (`style.css:11`) colore du vrai texte de 9 à 13 px :
- l'année et le réal sous chaque carte ;
- les sous-titres des graphiques ;
- le texte d'aide des champs de recherche ;
- le pied de page ;
- « ta note » et « en salle à lyon » dans la fiche ;
- les rubriques des mentions légales.

Contraste mesuré (formule officielle, couleurs réelles relues dans la page) : 2,98:1 sur `--bg`, 2,71:1 sur `--bg-elev`, 2,41:1 sur `--bg-elev-2`. La règle demande 4,5:1. Lighthouse le signale aussi.

**Correction** : `--ink-mute: #8d97a1;` donne 5,6, 5,1 et 4,6:1. C'est le même gris froid, toujours distinct du beige `--ink-soft`. Une seule variable change ; à valider à l'œil. Compteurs des onglets : `opacity: .85` au lieu de 0,65.

#### D2 · Le retour arrière après un échec vise le mauvais film

Avant d'enregistrer, `saveEditedFilm` et `confirmRematch` notent la **position** du film dans la liste. En cas d'échec, ils remettent l'ancienne version à cette position (`app.js:5109`, `5260`). Mais si un conflit 409 a eu lieu entre-temps, la fusion a reconstruit la liste et mis en tête les films venus de l'autre appareil (`app.js:4619`) : la position désigne alors un autre film.

**Preuve** (deux relectures) : l'autre appareil ajoute un film ; ici, on note X ; conflit, fusion, puis le second envoi échoue.
- Le film voisin, « à voir », reçoit la note, le lieu et la date de X.
- Avec le re-match : le voisin disparaît de films.json et X est en double.
- Tout est écrit au prochain enregistrement réussi.

**Correction** : retrouver le film par son id, et ne défaire que si la fiche porte encore cette modification.
```js
const cur = state.films.find(f => f.id === filmId);
if (cur && cur.user === newUser) cur.user = prevUser;
```

#### D3 · Re-match vers un film déjà dans la collection

L'ajout refuse un film déjà présent (`app.js:2165`), mais pas le re-match. Le re-match crée alors deux entrées de même id, avec un message de réussite. À la fusion 409 suivante, les deux deviennent le même objet : la note de l'un est perdue. C'est très probablement l'origine de l'ancien doublon *Dogman*. **Correction** : avant la confirmation, `if (nouvelId !== oldFilm.id && state.films.some(f => f.id === nouvelId))`, afficher « ce film est déjà dans ta collection » et ne rien faire.

#### D4 · Stockage interdit : le site ne démarre pas

```js
function loadAdminCreds() {            // app.js:3579, première ligne du démarrage (5688)
  admin.encryptedPAT = localStorage.getItem('films_encrypted_pat') || null;
}
```

Si le navigateur bloque le stockage du site (cookies tous bloqués, certains navigateurs intégrés), lire `localStorage` lève une erreur. Le script s'arrête et la page reste vide : 0 carte, erreur « The operation is insecure ». Tous les autres accès au stockage sont protégés. **Correction** : entourer de `try { … } catch { admin.encryptedPAT = null; }`. Résultat vérifié : 22 cartes, 603 films.

#### B1 · Découvrir : recherche et catégorie s'écrasent l'une l'autre

- **Dans un sens** : on clique sur une catégorie lente, puis on tape « dune » ; les résultats de « dune » s'affichent, puis la catégorie arrive et les remplace, alors que la case dit toujours « dune ». La garde de `app.js:669` ne regarde pas la recherche.
- **Dans l'autre sens** : une recherche lente arrive après un clic sur une catégorie (la case a été vidée) et remplace la catégorie.
- **Même effet au démarrage** : la liste « au ciné » relance la catégorie et efface une recherche affichée (`app.js:5709`).

**Correction** : ne pas afficher une catégorie si la case contient au moins 2 caractères, et n'afficher une recherche que si la case contient encore ce texte. Au démarrage, redessiner sans relancer de chargement.

#### B2 · Retour sur Découvrir : la recherche n'est pas rendue

Après une recherche, une fiche, une filmographie puis « précédent », `setView` recharge la catégorie (`app.js:536-538`) sous une case qui affiche encore le mot cherché. **Correction** : si la case contient au moins 2 caractères, relancer `handleDiscoverSearch(q)` plutôt que la catégorie.

#### B3 · Une fiche lente remplace celle ouverte entre-temps

```js
// app.js:1259 : vérifie qu'une fiche est ouverte, pas laquelle
if (!document.getElementById('modal-backdrop').classList.contains('open')) return;
```

On ouvre une fiche de Découvrir, on la ferme avant qu'elle ait fini de charger, on en ouvre une autre : la première s'affiche par-dessus quand elle arrive. Il faut alors appuyer deux fois sur « précédent ». Si TMDB répond en erreur, c'est « erreur : TMDB details 500 » qui remplace la bonne fiche. **Correction** : vérifier aussi `openModalCtx.id === id`.

#### B4 · Une saisie en cours effacée par une réponse tardive

Quand TMDB complète un film (noms latins, titre, pays, bande-annonce), `reRenderModalIfShowing` redessine toute la fiche. Une note, un lieu ou une date en cours de saisie dans le formulaire disparaissent.

**Essai** : fiche TMDB en mode édition, « déjà vu », 5★ et « Stremio » choisis ; la réponse du titre arrive 3 s plus tard ; le formulaire est replié et vidé.

Cas réel : un film asiatique dans Découvrir ou la Reco, dont le casting est relu nom par nom (200 ms de pause entre chaque). **Correction** : ne plus redessiner une fiche où l'on a commencé à saisir. Les données enrichies servent à la prochaine ouverture.

#### B5 · Démarrage : « aucun film ne correspond », et message d'erreur effacé

Au démarrage, les listes Canal+ et « au ciné » (gardées 24 h) et le programme de Lyon arrivent avant films.json. Leurs suites appellent `renderGrid()` sur une liste vide, ce qui affiche « aucun film ne correspond / essaie d'élargir tes filtres ».

**Durée mesurée** : environ 0,2 s sur ordinateur, 0,6 à 1,5 s sur une 4G lente.

**Pire cas** : si films.json ne se charge pas, son message « impossible de charger films.json » s'affiche avec ce faux message, ou est carrément effacé 0,8 s plus tard. La seule panne grave du site devient invisible et trompeuse.

**Correction** : `if (!state.films.length) return;` en tête des trois suites (`app.js:5694`, `5697`, `5707`). Résultat vérifié : le message ne s'affiche plus jamais (0 ms).

#### B6 · TMDB en erreur : « élargis tes filtres », gardé toute la visite

```js
// app.js:3901
const page1 = () => fetch(baseUrl + '&page=1').then(r => r.ok ? r.json() : { results: [] });
```

Une erreur HTTP de TMDB (500, 503, 429) devient une liste vide. Le site affiche « aucun film ne correspond, essaie d'élargir tes filtres », ce qui est faux, et garde cette liste vide en mémoire jusqu'au rechargement. Une coupure réseau, elle, donne le bon message. **Correction** : lever une erreur si `!r.ok` ; le `catch` existant affiche alors l'erreur sans la garder.

#### B7 · Double clic sur une carte

Sur ordinateur, le second clic d'un double clic tombe sur le fond sombre (`app.js:5412-5414`) et referme la fiche aussitôt. Mesuré : cartes des bords, fiche refermée ; carte du centre, fiche ouverte. **Correction** : `if (e.target.id === 'modal-backdrop' && e.detail < 2) closeModal();`.

#### B8 · Recherche de la collection

Les accents sont bien ignorés. Mais :
- « kubrick␣ », avec l'espace qu'ajoute le clavier du téléphone, ne trouve rien (« kubrick » en trouve 4) ;
- « l'affaire marie » ne trouve pas « L’Affaire Marie-Claire » (apostrophe typographique) ;
- « au poste ! » ne trouve pas « Au poste ! » (espace insécable de TMDB) ;
- « coeur » ne trouvera pas « cœur » sur un film ajouté depuis TMDB.

**Correction** : dans `normSearch`, ramener les apostrophes à `'`, `œ` à `oe` et `æ` à `ae`, remplacer les espaces par une espace simple, puis `trim()`. La recherche ne peut que trouver plus.

#### P1 · Ouverture de la page stats

Pour écrire les infobulles « voir ces N films » des tops réalisateur·rices et acteur·rices, `countVusMatching` refiltre les 581 films vus pour chacune des 50 lignes, en repassant chaque texte dans `normSearch`. Cela fait 116 021 appels, compté par la seconde relecture.

**Mesure du clic sur « stats »** (téléphone simulé, processeur ralenti 4 fois) : 470 à 950 ms selon la charge ; 112 ms sur ordinateur. Le coût n'est payé qu'une fois par visite, et après chaque modification de la collection.

**Correction** (essayée dans la page, 97 infobulles identiques) : construire une seule fois la liste des textes normalisés des films vus. Résultat : 248 ms au lieu de 508 sur téléphone simulé.

#### P2 · Catalogue Canal+ au démarrage

Une fois par jour et par appareil, `ensureCanalFR` lit 131 pages TMDB (716 Ko), dès l'ouverture, en même temps que films.json et les affiches. C'est plus lourd que tout le site réuni, alors que ces pages ne servent qu'aux pastilles « canal+ ». Lighthouse en déduit un temps d'affichage simulé de 11,3 s sur mobile (0,5 s observé sans bridage).

**Corrections possibles**, de la plus simple à la plus efficace :
- lancer `ensureCanalFR()` après le premier affichage ;
- ou garder la liste 7 jours au lieu de 24 h ;
- ou, le plus efficace, la faire écrire chaque nuit par un robot dans un petit fichier (environ 12 Ko compressés), lu comme `cinemas_lyon.json`.

#### P3 · Images de la fiche trop grandes

L'affiche de la fiche est téléchargée en w500 pour une case de 100 à 140 px, et le fond en w1280 pour un bandeau de 760 × 240 px assombri. **Correction** : `tmdbResize(f.poster, 'w342')`, avec la fonction qui existe déjà ; l'affiche est alors déjà dans le cache, puisque les cartes utilisent w342. Et `tmdbResize(f.backdrop, 'w780')`. On passe de 246 Ko à 68 Ko par fiche, sans toucher films.json.

#### P4 · Fondu sur une très longue grille

Après « charger plus » jusqu'au bout (581 cartes), chaque filtre passe par `startViewTransition`, qui photographie toute la page. Filtre « Drame » sur téléphone simulé : 1 890 ms avec le fondu, 141 ms sans. **Correction** : pas de fondu au-delà de 120 cartes ; il reste pour l'usage courant (60 cartes).

#### X2 · Repère du clavier invisible sur les liens

La règle de focus (`style.css:1994-1998`) vise boutons, champs, listes et cartes, mais pas les liens. Chrome et Brave dessinent alors un anneau presque noir sur fond presque noir. Écart mesuré entre lien sélectionné et non sélectionné : 1,14 à 1,54:1, contre 7,5:1 pour les boutons.

Liens concernés : nom du réal, cases du casting, « tmdb ↗ », « allociné ↗ », logos des plateformes, pied de page.

**Correction** : ajouter `a:focus-visible, [tabindex]:focus-visible` à cette règle. Gravité ramenée de haute à moyenne : les commandes principales ont un anneau très net, et le site s'utilise surtout au doigt.

#### X3 · Pastilles posées sur les affiches

Les pastilles ont un fond à 30 % d'opacité flouté et un texte de 8 à 10 px. Sur 109 pastilles réelles mesurées, 37 sont sous 4,5:1 et 24 sous 3:1, avec un pire cas à 1,09:1 (« au ciné » sur une affiche claire). **Correction** : voile à 0,9 d'opacité, en gardant le flou. Pire cas sur une affiche blanche : 4,9 à 9,3:1.

#### X4 · Heatmap et blanc sur orange

- Chiffres de la heatmap : 1,9 à 3,9:1 (`app.js:2792`).
- Blanc sur l'orange `--hot` (puce et pastille coup de cœur) : 2,8:1.
- « supprimer » au survol : 3,1:1.

**Correction** : texte `var(--bg)` sur les fonds clairs, `var(--ink)` sur les fonds sombres.

#### X5 · Stats inutilisables au clavier

Ne peuvent être atteints qu'à la souris :
- les barres de notes (6) ;
- les cases de la heatmap (58) ;
- les barres « par mois » (47) ;
- les lignes des tops (97) ;
- la carte « coups de cœur » ;
- les résultats du re-match.

« Ton film de l'année » a bien `role="button" tabindex="0"`, mais Entrée ne fait rien (`app.js:3383-3385`, écouteur de clic seulement), contrairement au top 5 du bilan (`app.js:2604-2606`) et à ce que dit le README. **Correction** : une petite fonction `rendreActivable(el, action)` (`tabindex`, `role`, Entrée et Espace), appelée partout où un `div` reçoit un clic.

#### X6 · Fenêtres secondaires

Les fenêtres du mode édition et du re-match n'ont ni `role="dialog"` ni nom. Dans ces deux fenêtres et dans les mentions légales, Tab s'en échappe vers la page cachée derrière, et le focus n'est pas rendu au bouton d'origine à la fermeture.

Sous Safari (WebKit), qui saute les liens avec Tab, le piège de la fiche laisse fuir une touche sur deux.

`closeRematchModal` rend aussi la page de fond défilable alors que la fiche est encore ouverte.

**Correction** : `role="dialog" aria-modal="true"` et un nom sur les deux fenêtres ; une seule ligne qui rend inerte (`inert`) tout ce qui est sous la fenêtre du dessus ; mémoriser puis rendre le focus. Risque moyen : rejouer le bouton précédent après coup.

#### X7 · Cartes et boutons bascules

- Les cartes sont des `div` focalisables sans rôle : un lecteur d'écran ne dit pas qu'elles s'ouvrent.
- Onglets, puces de note, catégories de Découvrir et « masquer ma collec » n'exposent pas leur état sélectionné.
- Le modèle existe pourtant déjà : les onglets de la filmographie (`app.js:925`) ont `aria-pressed`.

**Correction** : `role="button"` sur les cartes, `aria-pressed` sur les bascules.

#### X8 · Titres des stats cachés aux lecteurs d'écran

`.chart-section { content-visibility: auto }` (`style.css:1074-1075`) : Chromium n'expose pas aux lecteurs d'écran le contenu hors écran. Sur 13 titres, 3 seulement sont visibles pour eux. Le gain de performance est faible, puisque les stats ne sont dessinées qu'à l'ouverture. **Correction** : retirer ces deux lignes. Ne pas étendre cette propriété aux cartes, comme cela avait été envisagé pour la performance.

#### X9 · Messages non annoncés

Le toast (« enregistré », « erreur… ») et le nombre de résultats ne sont pas dans une zone annoncée. **Correction** : `role="status" aria-live="polite"` sur `#toast` et `aria-live="polite"` sur le compteur.

#### X10 · Bouton « + filtres » coupé

`.search-wrap { min-width: 240px }`. Sous 348 px de large, le bouton déborde et `overflow-x: hidden` le coupe : à 320 px, on lit « + FILTR ». Cela concerne aussi un téléphone de 360 px avec la taille d'affichage Android agrandie. **Correction** : `min-width: 0; flex: 1 1 160px;`.

#### C1 · Encoche de l'iPhone

`viewport-fit=cover` (`index.html:12`) demande à Safari d'étendre la page sous l'encoche et la barre d'accueil. Mais aucun `env(safe-area-inset-*)` n'existe dans le CSS : en paysage, l'encoche couvre le début des lignes ; dans l'appli installée, toasts et barre de relecture TMDB se posent sur la barre d'accueil. **Correction** la plus simple : retirer `, viewport-fit=cover`. Non observable sous Windows ; à vérifier sur un iPhone à encoche.

#### S1 · Origine partagée avec nocturne-lyon

Pour le navigateur, `ricojrlyon.github.io/films/` et `ricojrlyon.github.io/nocturne-lyon/` sont le même site. Ils partagent le stockage (qui contient le token chiffré), et chacun peut piloter l'autre dans un cadre. La politique de sécurité de *films ne protège que *films. Or nocturne autorise les scripts écrits dans la page (`'unsafe-inline'`) et affiche des données collectées ailleurs.

**Essai** : une page voisine sur la même origine, simulée sans réseau, lit le blob chiffré, puis capte le token au déverrouillage suivant. Avec ce token, on peut réécrire `app.js` pour tous les visiteurs.

**Corrections, aucune urgente** :
- l'écrire dans le README ;
- côté nocturne, retirer `'unsafe-inline'` de `script-src` ;
- à terme, donner à *films son propre domaine. `REPO_OVERRIDE` est déjà prévu (`app.js:3550`).

#### L1 · Règle TMDB des 6 mois dépendante d'un geste manuel

Les données TMDB de films.json ne sont relues que lorsque tu déverrouilles le mode édition. 5 films ont été lus le 16 juin 2026 : ils sont à relire dès le 13 novembre, et dépasseront la limite de 6 mois des conditions TMDB le 15 décembre 2026. Aujourd'hui, tout est en règle. **Correction** : le robot du matin (`canal-plus.yml`) ouvre un ticket « données TMDB à relire : déverrouille le mode édition » quand une donnée a plus de 150 jours. Tu reçois alors un mail, comme pour les alertes Canal+.

#### L2 · Republication des données AlloCiné

Le README reconnaît que la lecture automatique d'AlloCiné n'est pas permise en principe. Il ne dit pas que le résultat est republié chaque nuit dans un dépôt public, avec une version par nuit dans l'historique. Le Code de la propriété intellectuelle (art. L342-2) vise justement « l'extraction ou la réutilisation répétée et systématique ».

Trois champs (`realisateurs`, `titre_vo`, `annees`) sont écrits dans le fichier sans que le site les lise jamais. **Correction** :
- ne plus les écrire ;
- compléter le paragraphe « Limite » du README, avec la conduite à tenir si AlloCiné le demande : arrêter le robot, vider le fichier.

R1 multiplie par sept les lectures : à décider en connaissance de cause. Le risque reste faible en pratique.

### 2.4 README et code : les écarts

Une soixantaine d'affirmations du README ont été vérifiées. Ces 14 ne correspondent pas au code :

| README | Affirmation | Réalité |
|---|---|---|
| l.10 | « les à voir ne comptent nulle part » | la heatmap choisit ses genres parmi tous les films (M8) |
| l.13 | boutons d'enrichissement « s'il reste des fiches incomplètes » | pour les pays, seulement au-delà de 5 films vus sans pays |
| l.49-83 | modèle de données | il manque `imdb_id` et `user.csv_genres` |
| l.92 | `country` en noms anglais | pour une série sans pays de production, des noms français (aucun cas aujourd'hui) |
| l.124 et suivantes | séances des 7 prochains jours | environ 1 jour (R1) |
| l.131 | goûts : films vus notés 4★ et plus | films seulement, pas les séries |
| l.149 | « charger plus » sur canal+ et prochainement | aussi sur « à lyon » ; 10 pages par clic pour canal+, 5 ailleurs |
| l.155, l.238 | « les quatre catégories » | il y en a cinq, avec des tris par défaut différents |
| l.167 | seul « woman director » est ignoré | deux mots-clés « scène post-générique » aussi |
| l.189 | l'hébergeur « connaît son identité » | condition à vérifier dans le compte GitHub (L3) |
| l.194 | application « plein écran » | `standalone` : sans barre du navigateur, pas plein écran |
| l.236 | Entrée ouvre la fiche des films de l'année | faux pour « ton film de l'année » (X5) |
| l.247 | robot Canal+ « comme la pastille » | la pastille compte aussi OCS et Apple TV, pas le robot |
| l.260 | « un film modifié dans la session garde sa version locale » | c'est la cause de D1 |

Le README raconte aussi beaucoup d'histoire datée dans le corps du texte (« au 2026-10-27 : 69 films », « du 21 au 26 octobre l'onglet s'appelait… »). À déplacer dans une section « Journal » en fin de fichier.

---

## 3. Gains rapides (moins de 30 minutes chacun)

| Gain | Constat | Ce qu'il faut faire | Bénéfice |
|---|---|---|---|
| 1 | R1 | Changer `d-%d` en date complète dans le robot | « à lyon » couvre enfin la semaine |
| 2 | X1 | Une variable CSS (`--ink-mute`) | Tous les textes secondaires lisibles |
| 3 | X2 | Ajouter `a:focus-visible` à la règle de focus | Navigation au clavier visible partout |
| 4 | D4 | `try/catch` autour d'une ligne | Le site s'ouvre même avec les cookies bloqués |
| 5 | B5 | `if (!state.films.length) return;` à 3 endroits | Plus de faux « aucun film » au démarrage ; l'erreur de chargement reste visible |
| 6 | B6 | Erreur HTTP traitée comme une erreur | Message juste quand TMDB est en panne |
| 7 | B7 | `e.detail < 2` | Le double clic n'annule plus l'ouverture |
| 8 | B3 | Comparer l'id de la fiche ouverte | Une fiche lente ne remplace plus l'autre |
| 9 | B8 | 3 lignes dans `normSearch` | La recherche trouve « l’ », « œ », et ignore l'espace final |
| 10 | P1 | Normaliser une fois les textes des vus | Stats deux fois plus rapides à s'ouvrir |
| 11 | P3 | `tmdbResize` vers w342 et w780 | 178 Ko de moins par fiche ouverte |
| 12 | P4 | Pas de fondu au-delà de 120 cartes | Filtres instantanés sur la liste complète |
| 13 | X8 | Retirer 2 lignes CSS | Tous les titres des stats lisibles par un lecteur d'écran |
| 14 | X9 | 2 attributs dans index.html | Toasts et résultats annoncés |
| 15 | X10 | `min-width: 0` | Bouton des filtres entier sur petit écran |
| 16 | D8 | Déplacer une ligne | Règle « 6 = coup de cœur » toujours respectée |
| 17 | S4 | Vider 4 champs au verrouillage | Le token n'est plus oublié dans le formulaire |
| 18 | M1, M2 | Supprimer environ 25 lignes de code et de CSS morts | Code plus clair |

---

## 4. Choix documentés à reconsidérer

1. **« Un film modifié dans la session garde sa version locale »** (README l.260). Le principe de la fusion est bon. C'est la durée de vie de la marque qui pose problème : il faut l'arrêter au dernier enregistrement réussi (D1).
2. **Chaque appareil relit chaque jour le catalogue Canal+ complet** (131 appels). Le robot de nuit le ferait une fois pour tous (P2), comme pour les cinémas.
3. **Robots sans `actions/checkout`**. Ce choix évitait l'avertissement « Node.js 20 ». Mais il oblige à écrire le Python dans le fichier YAML, ce qui le rend impossible à tester. `actions/checkout@v5`, qui tourne sous Node 24 (à vérifier au moment du changement), lève cette contrainte. Les scripts pourraient alors vivre dans `.github/scripts/` et être testés (section « Tests »).
4. **`content-visibility: auto` sur les stats** : faible gain, mais titres cachés aux lecteurs d'écran (X8). Ne pas l'étendre aux cartes.
5. **`viewport-fit=cover`** sans les marges qui vont avec (C1).
6. **Anonymat de l'éditeur**. La loi le permet, à condition que l'hébergeur ait l'identité complète, ce qui est à vérifier chez GitHub. Pourtant le README et `app.js` nomment « Emeric » à plusieurs reprises. Choisir l'un ou l'autre en connaissance de cause (L3).
7. **Hébergement sur `ricojrlyon.github.io`**, partagé avec nocturne (S1).
8. **Code de 4 caractères et token « sans expiration »**. Risques acceptés, à juste titre pour le principe, mais il existe deux améliorations gratuites : un code plus long et une expiration d'un an (S5).
9. **Règle des 6 mois appliquée à la main** : une alerte automatique la rendrait sûre (L1).
10. **Horaires des robots** (R4). Prévus à 3 h 30 et 6 h UTC, ils tournent réellement entre 9 h 50 et 14 h 40 UTC, d'après les 15 derniers passages. GitHub les décale fortement. Le programme de Lyon arrive donc vers midi, pas dans la nuit. Inutile de chercher une heure « exacte » : il suffit de le savoir.

---

## 5. Ce qui est bien fait et doit rester tel quel

- **La politique de sécurité** `script-src 'self'`, sans aucun script dans la page. Tous les scripts injectés pendant les essais ont été bloqués.
- **`escapeHtml` et `safeUrl`** : correctes et utilisées pour tous les textes venus de TMDB, d'AlloCiné et de films.json, à quelques exceptions près (S2, S3). `rel="noopener"` est présent sur les 11 liens qui ouvrent un onglet.
- **Le token** :
  - PBKDF2 et AES-GCM, sel et IV neufs à chaque chiffrement, clé non exportable ;
  - jamais dans la console ni dans une adresse ;
  - envoyé seulement à `api.github.com` ;
  - vérifié auprès de GitHub avant d'être gardé.
- **L'enregistrement** :
  - la file `saveFilmsQueue` : les envois partent l'un après l'autre, et un échec ne bloque pas la suite ;
  - la lecture sans cache, et la lecture brute au-delà de 1 Mo, vérifiée contre le vrai GitHub (le seuil sera atteint vers l'automne 2027 : c'est prêt) ;
  - `adoptFilmsFromApi` au déverrouillage, qui empêche une page vide d'écraser la base ;
  - le filtre des clés `_` ;
  - la relecture TMDB qui ne touche jamais aux données personnelles.
- **Le bouton précédent** : 27 enchaînements, rechargement compris, tous justes.
- **Les jetons anti-course existants** : `discoverSearchSeq`, `personSeq`, `rematchSearchSeq`, `recoBuildInFlight`, la vérification d'id dans `renderOuVoir`.
- **La règle des 6 mois côté navigateur** : `tmdbMemory`, avec une date par entrée et une purge au démarrage.
- **Les filtres combinés et les tris** : 6 combinaisons recalculées à part, mêmes résultats ; les 5 tris sont stables.
- **La pagination par 60 et les affiches** :
  - affiches chargées à l'approche, en w342, place réservée par `aspect-ratio` ;
  - aucun saut de page dû aux affiches ;
  - aucune fuite de mémoire après 20 fiches.
- **Les polices** hébergées sur le site, découpées par alphabet ; aucune requête vers Google.
- **La compatibilité** :
  - rien au-delà d'ES2020 ;
  - préfixes `-webkit-` systématiques ;
  - replis prévus pour `IntersectionObserver` et `startViewTransition` ;
  - 0 erreur sous WebKit (le moteur de Safari) ;
  - manifeste propre (l'icône 512 sert correctement de « maskable »).
- **Les robots** :
  - permissions minimales ;
  - `${{ }}` jamais dans les scripts ;
  - Python lancé par `<<'PY'` (rien n'est interprété par le shell) ;
  - aucune action tierce ;
  - adresses journalisées sans la clé TMDB.
- **La ligne `const TMDB_KEY = '…'` (`app.js:3568`)**. Les deux robots la retrouvent par une expression exacte. La renommer, changer les guillemets ou l'espacement les casse sans aucun message. **À ne jamais modifier.**
- **Les crédits TMDB et JustWatch** (logo officiel en blanc, phrase obligatoire), et la règle « ne jamais pousser films.json ni cinemas_lyon.json ».

---

## 6. Plan de correction par lots

Chaque lot se traite seul, sur « go lot N ». Chaque correction de bug vient avec un test qui échoue avant et passe après. Les numéros `?v=` sont augmentés dans `index.html`, et le README est tenu à jour.

### Lot 1 · Gravité haute, et mise en place des tests

**Fait le 12/11/2026** (`app.js?v=22`, `style.css?v=16`) : D1, D2, D3, R1, R3 (avec `concurrency`), X1, X2. 7 tests JavaScript et 3 tests Python, qui échouaient tous sur la version d'avant.

- **Contenu** :
  - **D1** : marques numérotées, oubliées après un envoi réussi ;
  - **D2** et **D3** : même code de sauvegarde et de retour arrière, mêmes tests ;
  - **R1** : dates complètes pour AlloCiné ;
  - **R3** : arrêt en erreur si le programme est vide ;
  - **X1** et **X2** : deux lignes de CSS.
- **Tests** :
  - dossier `tests/` (chargeur de `app.js` pour Node, déjà essayé) ;
  - un test de fusion qui reproduit la perte de D1 ;
  - les scripts Python des robots sortis dans `.github/scripts/`, avec un test de l'adresse AlloCiné ;
  - un workflow `tests.yml` qui lance tout à chaque envoi sur GitHub.
- **Fichiers** : `app.js`, `style.css`, `index.html` (numéros `?v=`), `README.md`, `.github/workflows/cinemas-lyon.yml`, `.github/scripts/cinemas_lyon.py` (nouveau), `.github/workflows/tests.yml` (nouveau), `tests/` (nouveau).

### Lot 2 · Données et écrans (gravité moyenne)

**Fait le 12/11/2026** (`app.js?v=23`) : D4, D5, B1, B2, B3, B4, B5, B6, B7, B8, B9, B10. 5 tests sans navigateur et 10 tests dans un navigateur (TMDB simulé), qui échouaient tous sur la version d'avant ; ces derniers tournent aussi sur GitHub.

- **Contenu** :
  - D4 (stockage interdit) ;
  - B5 (démarrage) et D5 (entrée abîmée) ;
  - B6 (TMDB en erreur) ;
  - B1, B2, B9 (Découvrir) ;
  - B3, B4, B10 (fiche) ;
  - B7 (double clic) ;
  - B8 (recherche).
- **Fichiers** : `app.js`, `index.html` (`?v=`), `README.md`, `tests/`.

### Lot 3 · Accessibilité et compatibilité

- **Contenu** : X3 à X10, C1, X11 à X13.
- **Fichiers** : `style.css`, `app.js`, `index.html`, `README.md`, `tests/`.
- **Précaution** : rejouer le bouton précédent (X6 touche aux fenêtres).

### Lot 4 · Performance

- **Contenu** :
  - P1 (stats) ;
  - P3 (images) ;
  - P4 (fondu) ;
  - P5 (saut de page) ;
  - P6, P7, P8 ;
  - P2 (catalogue Canal+), sous la forme que tu choisiras : reporté au démarrage, gardé 7 jours, ou écrit par le robot ;
  - P9.
- **Fichiers** : `app.js`, `style.css`, `index.html`, `README.md`, `tests/`. Plus `.github/workflows/canal-plus.yml` si P2 passe par le robot.

### Lot 5 · Robots, conformité et sécurité (gravité basse)

- **Contenu** :
  - L1 (alerte des 6 mois) ;
  - L2 (champs AlloCiné et README) ;
  - R2, R4 ;
  - S2 à S6 ;
  - S1 et L3 (texte du README et des mentions, selon tes choix).
- **Fichiers** : `.github/workflows/canal-plus.yml`, `.github/workflows/cinemas-lyon.yml`, `.github/scripts/`, `app.js`, `index.html`, `README.md`.

### Lot 6 · Ménage et dates

- **Contenu** :
  - M1 à M8 (code mort, champs inutiles, duplications, constantes) ;
  - D6 à D10 (heure de Paris, messages d'erreur, fermeture pendant un envoi) ;
  - B11 à B14 ;
  - M9 : README remis à jour, avec l'historique déplacé dans un « Journal ».
- **Fichiers** : `app.js`, `style.css`, `index.html`, `README.md`, `tests/`.

### Lot 7 · Tests de bout en bout

- **Contenu** : 5 scénarios Playwright :
  - démarrage sans erreur ;
  - fiche et bouton précédent ;
  - filtres et recherche ;
  - enregistrement avec conflit simulé ;
  - Découvrir avec TMDB simulé.
- **Ajouts au workflow** : ces scénarios rejoints à `tests.yml`.
- **Fichiers** : `tests/e2e/`, `tests/package.json` (dépendance de développement seulement, le site n'en dépend pas), `.github/workflows/tests.yml`.

---

## 7. Proposition de CLAUDE.md

À placer à la racine du dépôt. Ce fichier est relu au début de chaque session de Claude Code.

```markdown
# *films : règles du projet

## Le projet
Site personnel de collection de films : https://ricojrlyon.github.io/films/
Dépôt public ricojrlyon/films, branche main, publié par GitHub Pages.
Trois fichiers de code : index.html, style.css, app.js. Pas de framework,
pas d'étape de construction, aucune dépendance dans le site publié.
Le propriétaire, Emeric, n'est pas développeur : explique en français simple.

## Déploiement (manuel)
- Emeric téléverse lui-même les fichiers modifiés par l'interface web de
  GitHub (« Add files via upload »). Le dossier local n'a pas de git.
- À la fin de chaque série de modifications, donne la liste exacte des
  fichiers à téléverser ensemble et un message de commit.
- À chaque modification de style.css ou d'app.js, augmente son numéro
  `?v=N` dans index.html (GitHub Pages garde 10 min en cache).
- Vérifie ce qui est déjà en ligne (raw.githubusercontent.com) avant de
  dire qu'un fichier est à pousser.

## Intouchables
- films.json et cinemas_lyon.json sont des données vivantes : ne jamais
  les modifier, ne jamais les faire téléverser. films.json est écrit par le
  mode édition du site, cinemas_lyon.json par le robot de nuit.
- La gestion du token GitHub et de la clé TMDB : risques acceptés, ne pas
  changer sans demande explicite.
- La ligne `const TMDB_KEY = '…'` d'app.js : les deux robots la retrouvent
  par une expression exacte. Ne pas la renommer ni la reformater.
- Ne jamais saisir ni manipuler le vrai token d'Emeric.

## Sécurité
- CSP en balise meta (index.html) : `script-src 'self'`. Aucun script dans
  la page, aucun `onclick=` : tout le code va dans app.js, avec
  addEventListener.
- Tout texte externe (TMDB, AlloCiné, films.json) passe par escapeHtml ;
  toute adresse par safeUrl.
- Nouvelle origine contactée : l'ajouter à connect-src ou img-src, rien
  de plus large.
- Robots (.github/workflows) : jamais de `${{ }}` dans un `run:`, passer
  par `env:` ; permissions minimales.

## Qualité
- Mettre à jour README.md à chaque modification du site, pour qu'il
  décrive le comportement réel (l'historique va dans la section Journal).
- Tests : `node --test tests/` (fonctions d'app.js chargées sans
  navigateur) et `python -m unittest` pour les scripts des robots. Chaque
  correction de bug arrive avec un test qui échouait avant.
- Essais dans le navigateur : servir le dossier en local ; aucun appel
  d'écriture vers GitHub (simuler les réponses) ; appels TMDB modérés.

## Style
- Écrire comme le code autour : commentaires en français, même densité.
- Ne jamais écrire le tiret long, ni dans les messages, ni dans le code,
  ni dans le README.
```

---

## Annexe · Stratégie de tests

Il n'existe aucun test. La proposition ne touche pas au fonctionnement du site : les tests vivent à côté, dans `tests/` et `.github/`, et le site publié n'en dépend pas.

1. **Fonctions d'`app.js` avec `node --test`** (déjà essayé pendant l'audit) :
   - Un petit chargeur lit `app.js`, coupe la section « BOOT » et l'exécute dans un bac à sable Node, avec un faux `document` et un faux `localStorage`. Toutes les fonctions deviennent alors accessibles.
   - 5 tests essayés passent en 0,08 s : `escapeHtml`, `safeUrl`, `normSearch`, `normalizeRatings`, dates.
   - À couvrir en priorité : `mergeRemoteFilms` (D1, D2), `normalizeRatings` (D8), `normSearch` (B8), `safeUrl` (S2), `maintenantLocal` (D6), `countVusMatching` (P1).
   - Aucune installation : Node suffit.
2. **Scripts des robots** :
   - Sortir le Python des deux fichiers YAML dans `.github/scripts/canal_plus.py` et `cinemas_lyon.py`, avec des fonctions séparées (adresse AlloCiné, correspondance TMDB, fusion des tickets).
   - Les tester avec `python -m unittest`, sur des réponses enregistrées : aucun appel réseau pendant les tests.
3. **Quelques scénarios Playwright** (lot 7), avec TMDB et GitHub entièrement simulés. Aucun appel réel ni aucun secret dans les tests.
4. **Un workflow `tests.yml`** qui lance tout à chaque envoi sur GitHub. Si un test échoue, tu reçois un mail, comme pour les robots.

---

## Annexe · Ce qui a été installé pour l'audit (hors du site)

- **Dossier de travail temporaire de Claude** :
  - un Python avec Playwright, Node portable et Lighthouse ;
  - une copie des rapports détaillés et des scripts d'essai, utile pour la phase 2.
- **Navigateurs de test Firefox et WebKit**, environ 530 Mo, dans `C:\Users\Emeric\AppData\Local\ms-playwright`, installés le 12/11 pour l'audit. Ils peuvent être supprimés à la fin des corrections.
- **Le dossier `_audit/` du site a été supprimé** : il ne reste dans le dossier du site que ce fichier `AUDIT.md`.
