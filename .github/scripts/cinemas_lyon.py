# Cinémas de Lyon : chaque nuit, le programme des 7 prochains jours de dix
# salles (séances AlloCiné), chaque film retrouvé chez TMDB, dans
# cinemas_lyon.json à la racine du dépôt (le site le lit).
# Lancé par .github/workflows/cinemas-lyon.yml ; testé par
# test_cinemas_lyon.py (python3 -m unittest, sans réseau).
import json, os, re, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request, base64
from datetime import datetime, timedelta, timezone

FICHIER = 'cinemas_lyon.json'
SALLES = [  # code AlloCiné, nom affiché
    ('P0017', 'Lumière Terreaux'), ('P0015', 'Lumière Bellecour'), ('W6903', 'Lumière Fourmi'),
    ('P3757', 'Comœdia'), ('P0036', 'UGC Part-Dieu'), ('P0005', 'UGC Astoria'),
    ('P0671', 'UGC Cité Internationale'), ('W6902', 'UGC Confluence'),
    ('P0012', 'Pathé Bellecour'), ('P6909', 'Pathé Vaise'),
]
JOURS = 7
NAVIGATEUR = {'User-Agent': 'Mozilla/5.0 (films, programme des cinemas de Lyon)'}


def lire(url, entetes=None, donnees=None, methode=None):
    for essai in range(4):
        req = urllib.request.Request(url, data=donnees, headers=entetes or NAVIGATEUR, method=methode)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                corps = r.read()
                return json.loads(corps) if corps else None
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429 or e.code >= 500:
                time.sleep(3 * (essai + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(3 * (essai + 1))
    raise RuntimeError('injoignable : ' + url.split('?')[0])


def norme(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def adresse_seances(code, aujourdhui, j, page=1):
    # Séances d'une salle, j jours après aujourd'hui, par pages de 15 films.
    # AlloCiné attend la date complète (d-2026-11-14) : un simple numéro
    # (d-2) est ignoré et rend toujours la page par défaut, soit aujourd'hui
    # et demain matin seulement (constaté le 2026-11-12).
    jour = (aujourdhui + timedelta(days=j)).isoformat()
    return 'https://www.allocine.fr/_/showtimes/theater-%s/d-%s/%s' % (code, jour, 'p-%d/' % page if page > 1 else '')


def verifier_programme(films):
    # Aucune séance du tout : AlloCiné a changé ou ne répond plus. On s'arrête
    # en erreur (visible dans l'onglet Actions, mail de GitHub) plutôt que de
    # publier un programme vide qui éteindrait « à lyon » sans prévenir.
    if not any(s for f in films.values() for s in f['salles'].values()):
        sys.exit('aucune séance lue chez AlloCiné : rien n\'est publié')


def lire_programme(lire, aujourdhui, salles=SALLES, jours=JOURS, pause=0.3):
    # 1. Le programme, salle par salle, jour par jour : id AlloCiné -> film
    films = {}
    for code, nom in salles:
        for j in range(jours):
            page, pages = 1, 1
            while page <= pages:
                d = lire(adresse_seances(code, aujourdhui, j, page)) or {}
                pages = int((d.get('pagination') or {}).get('totalPages') or 1)
                for r in d.get('results') or []:
                    m = r.get('movie') or {}
                    if not m.get('internalId'):
                        continue
                    f = films.setdefault(m['internalId'], {
                        'allocine': m['internalId'], 'titre': m.get('title'), 'titre_vo': m.get('originalTitle'),
                        'annees': sorted({int(x['releaseDate']['date'][:4]) for x in (m.get('releases') or [])
                                          if (x.get('releaseDate') or {}).get('date')}),
                        'salles': {},
                    })
                    seances = f['salles'].setdefault(code, [])
                    for liste in (r.get('showtimes') or {}).values():
                        for s in liste or []:
                            if not s.get('startsAt'):
                                continue
                            # VO (version originale), VF (doublée) ; un film français (LOCAL) : rien
                            v = {'ORIGINAL': 'VO', 'DUBBED': 'VF'}.get(s.get('diffusionVersion'), '')
                            cle = [s['startsAt'][:16], v]
                            if cle not in seances:
                                seances.append(cle)
                page += 1
                time.sleep(pause)
    for f in films.values():
        for s in f['salles'].values():
            s.sort()
    return films


# Champs d'AlloCiné qui ne servent qu'à retrouver le film chez TMDB pendant le
# passage : pas publiés (le site ne les lit pas ; moins de données reprises d'AlloCiné)
CHAMPS_DE_TRAVAIL = ('titre_vo', 'annees')


def contenu_fichier(films, aujourdhui, maintenant):
    return json.dumps({
        'genere': maintenant.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'du': aujourdhui.isoformat(), 'jours': JOURS,
        'salles': [{'code': c, 'nom': n, 'url': 'https://www.allocine.fr/seance/salle_gen_csalle=%s.html' % c} for c, n in SALLES],
        'films': sorted(({k: v for k, v in f.items() if k not in CHAMPS_DE_TRAVAIL} for f in films.values()),
                        key=lambda f: norme(f.get('titre'))),
    }, ensure_ascii=False, separators=(',', ':'))


def tmdb_cherche(lire, cle, titre, annees):
    if not titre:
        return None
    meilleur, note_max = None, 0
    for langue in ('fr-FR', 'en-US'):
        d = lire('https://api.themoviedb.org/3/search/movie?api_key=%s&language=%s&region=FR&query=%s'
                 % (cle, langue, urllib.parse.quote(titre))) or {}
        for c in (d.get('results') or [])[:10]:
            noms = {norme(c.get('title')), norme(c.get('original_title'))}
            an = int((c.get('release_date') or '0')[:4] or 0)
            note = 0
            if norme(titre) in noms:
                note += 2
            if annees and an and min(abs(an - a) for a in annees) <= 1:
                note += 2
            elif not annees:
                note += 1
            note += min(1, (c.get('vote_count') or 0) / 200)
            if note > note_max:
                meilleur, note_max = c, note
        if note_max >= 4:
            break
    return meilleur if note_max >= 3 else None


def main():
    REPO = os.environ['REPO']
    BRANCHE = os.environ.get('BRANCHE', 'main')
    JETON = os.environ.get('GH_TOKEN', '')
    SIMULATION = os.environ.get('SIMULATION') == '1'   # essai : écrit le fichier sur place, rien sur GitHub

    def github(chemin, donnees=None, methode=None):
        entetes = {'Accept': 'application/vnd.github+json', 'User-Agent': 'films-cinemas-lyon', 'Authorization': 'Bearer ' + JETON}
        corps = json.dumps(donnees).encode() if donnees is not None else None
        if corps:
            entetes['Content-Type'] = 'application/json'
        return lire('https://api.github.com' + chemin, entetes, corps, methode)

    def brut(fichier):
        url = 'https://raw.githubusercontent.com/%s/%s/%s?t=%d' % (REPO, BRANCHE, fichier, time.time())
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return r.read().decode('utf-8')
        except urllib.error.HTTPError:
            return None

    try:  # date de Paris, heure d'été comprise
        from zoneinfo import ZoneInfo
        aujourdhui = datetime.now(ZoneInfo('Europe/Paris')).date()
    except Exception:
        aujourdhui = datetime.now(timezone(timedelta(hours=1))).date()
    films = lire_programme(lire, aujourdhui)
    print('%d films dans %d salles' % (len(films), len(SALLES)))
    verifier_programme(films)

    # 2. Chaque film chez TMDB : titre et année (une ressortie garde l'année
    #    d'origine parmi ses dates), réutilisé d'une nuit à l'autre
    ancien = {}
    try:
        # Retrouvé il y a moins de 30 jours : repris tel quel (au-delà, relu chez
        # TMDB : ses conditions interdisent de garder ses données plus de 6 mois)
        limite = (aujourdhui - timedelta(days=30)).isoformat()
        ancien = {f['allocine']: f for f in json.loads(brut(FICHIER) or '{}').get('films', [])
                  if f.get('tmdb') and (f.get('tmdb_lu') or '') >= limite}
    except ValueError:
        pass
    cle = re.search(r"const TMDB_KEY = '([^']+)'", brut('app.js')).group(1)

    trouves = 0
    for f in films.values():
        a = ancien.get(f['allocine'])
        if a:
            for k in ('tmdb', 'tmdb_lu', 'poster_path', 'release_date', 'original_title', 'vote_count', 'vote_average', 'popularity', 'genre_ids', 'titre_tmdb'):
                f[k] = a.get(k)
        else:
            c = tmdb_cherche(lire, cle, f['titre_vo'], f['annees']) or tmdb_cherche(lire, cle, f['titre'], f['annees'])
            if c:
                f.update({'tmdb': c['id'], 'tmdb_lu': aujourdhui.isoformat(), 'titre_tmdb': c.get('title'), 'poster_path': c.get('poster_path'),
                          'release_date': c.get('release_date'), 'original_title': c.get('original_title'),
                          'vote_count': c.get('vote_count'), 'vote_average': c.get('vote_average'),
                          'popularity': c.get('popularity'), 'genre_ids': c.get('genre_ids')})
            time.sleep(0.1)
        trouves += 1 if f.get('tmdb') else 0
    print('%d films retrouvés chez TMDB, %d non' % (trouves, len(films) - trouves))

    # 3. Le fichier, déposé sur GitHub
    texte = contenu_fichier(films, aujourdhui, datetime.now(timezone.utc))
    if SIMULATION:
        open(FICHIER, 'w', encoding='utf-8').write(texte)
        print('[simulation] %s écrit sur place (%d Ko)' % (FICHIER, len(texte) // 1024))
        return
    actuel = github('/repos/%s/contents/%s?ref=%s' % (REPO, FICHIER, BRANCHE))
    corps = {'message': 'cinémas lyon : programme du %s' % aujourdhui.strftime('%d/%m'),
             'content': base64.b64encode(texte.encode('utf-8')).decode(), 'branch': BRANCHE}
    if actuel:
        corps['sha'] = actuel['sha']
    github('/repos/%s/contents/%s' % (REPO, FICHIER), corps, 'PUT')
    print('%s déposé (%d Ko)' % (FICHIER, len(texte) // 1024))


if __name__ == '__main__':
    main()
