# Robot du matin, deux tâches :
# 1. Alerte Canal+ : un film « à voir » de films.json entre dans le catalogue
#    Canal+ (abonnement) -> un ticket (issue) dans le dépôt, que GitHub envoie
#    par mail et sur l'application GitHub. Les tickets servent de mémoire : un
#    film n'est signalé qu'une fois par arrivée.
# 2. canal_plus.json : la liste des films et séries de l'abonnement (Canal+
#    et Apple TV ; plus OCS depuis le 2026-11-13), que le site lit pour ses pastilles « canal+ » au lieu
#    d'interroger TMDB depuis chaque appareil (131 pages par jour et par appareil).
# 3. Règle TMDB des 6 mois : quand des données TMDB de films.json ont plus de
#    5 mois, un ticket demande de déverrouiller le mode édition (c'est lui qui
#    les relit) ; il est fermé une fois tout relu.
# Lancé par .github/workflows/canal-plus.yml ; testé par test_canal_plus.py
# (python3 -m unittest, sans réseau).
import base64, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

CANAL_PLUS = '381'             # fournisseur TMDB : Canal+ (abonnement) ; l'alerte
ABONNEMENT_CANAL = '381|350'  # Canal+, Apple TV : la pastille (même valeur qu'app.js ; plus OCS, 685)
FICHIER = 'canal_plus.json'
ETIQUETTE, FINI = 'canal+', 'terminé'
ETIQUETTE_TMDB, MARQUEUR_TMDB = 'tmdb 6 mois', '<!-- tmdb-6-mois -->'
# Mêmes règles qu'app.js (un test vérifie qu'elles sont identiques) : données
# relues au-delà de 5 mois, date de l'import pour une fiche jamais relue
RELECTURE_JOURS = 150
TMDB_IMPORT_DATE = '2026-05-19T00:00:00Z'


def lire(url, entetes=None, donnees=None, methode=None):
    for essai in range(4):
        req = urllib.request.Request(url, data=donnees, headers=entetes or {}, method=methode)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                corps = r.read()
                return json.loads(corps) if corps else None
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(2 * (essai + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 * (essai + 1))
    raise RuntimeError('injoignable : ' + url.split('?')[0])


def lire_catalogue(lire, cle, fournisseurs):
    # Films et séries d'un abonnement en France (« | » : l'un ou l'autre
    # fournisseur), en streaming seulement. Rend (ensemble d'ids, complet ?) :
    # une page manquante rend la liste incomplète.
    catalogue, complet = set(), True
    for genre in ('movie', 'tv'):
        base = ('https://api.themoviedb.org/3/discover/%s?api_key=%s&watch_region=FR'
                '&with_watch_providers=%s&with_watch_monetization_types=flatrate'
                '&sort_by=popularity.desc&include_adult=false' % (genre, cle, urllib.parse.quote(fournisseurs)))
        page, pages = 1, 1
        while page <= min(pages, 200):
            try:
                d = lire(base + '&page=%d' % page)
            except Exception:
                complet = False
                break
            pages = d.get('total_pages') or 1
            catalogue.update('%s-%d' % (genre, it['id']) for it in d.get('results', []))
            page += 1
    return catalogue, complet


def marqueur_film(corps):
    # Le dernier marqueur du ticket (celui que le robot place en fin de corps) :
    # un titre TMDB qui contiendrait lui-même un faux marqueur ne trompe pas la mémoire
    m = re.findall(r'<!-- canal-plus:([a-z]+-\d+) -->', corps or '')
    return m[-1] if m else None


def sans_mention(texte):
    # Un « @nom » dans un titre TMDB ne doit notifier personne sur GitHub
    return (texte or '').replace('@', '@\u200b')


def _date(texte):
    try:
        return datetime.fromisoformat(texte.replace('Z', '+00:00'))
    except (AttributeError, ValueError):
        return None


def lu_chez_tmdb(film):
    # Dernière lecture des données TMDB du film (comme tmdbReadAt d'app.js)
    s = film.get('source') or {}
    dates = [d for d in (_date(s.get(k)) for k in ('tmdb_at', 'rematched_at', 'added_at')) if d]
    return max(dates) if dates else _date(TMDB_IMPORT_DATE)


def donnees_a_relire(films, maintenant):
    # Films dont les données TMDB ont plus de 5 mois, du plus ancien au plus récent
    seuil = maintenant - timedelta(days=RELECTURE_JOURS)
    vieux = [(lu_chez_tmdb(f), f) for f in films if isinstance(f, dict) and f.get('tmdb_id')]
    return [x for x in sorted(vieux, key=lambda x: x[0]) if x[0] < seuil]


def contenu_fichier(catalogue, maintenant=None):
    # canal_plus.json, compact ; « complet » : le site n'utilise qu'une liste complète
    maintenant = maintenant or datetime.now(timezone.utc)
    return json.dumps({'genere': maintenant.strftime('%Y-%m-%dT%H:%M:%SZ'), 'fournisseurs': ABONNEMENT_CANAL,
                       'complet': True, 'ids': sorted(catalogue)}, separators=(',', ':'))


def main():
    REPO = os.environ['REPO']                      # ricojrlyon/films
    OWNER = os.environ.get('OWNER', REPO.split('/')[0])
    BRANCHE = os.environ.get('BRANCHE', 'main')
    JETON = os.environ.get('GH_TOKEN', '')
    SIMULATION = os.environ.get('SIMULATION') == '1'   # essai : rien n'est écrit

    def github(chemin, donnees=None, methode=None):
        entetes = {'Accept': 'application/vnd.github+json', 'User-Agent': 'films-canal-plus'}
        if JETON:
            entetes['Authorization'] = 'Bearer ' + JETON
        corps = json.dumps(donnees).encode() if donnees is not None else None
        if corps:
            entetes['Content-Type'] = 'application/json'
        return lire('https://api.github.com' + chemin, entetes, corps, methode)

    def brut(fichier):
        url = 'https://raw.githubusercontent.com/%s/%s/%s?t=%d' % (REPO, BRANCHE, fichier, time.time())
        with urllib.request.urlopen(url, timeout=30) as r:
            return r.read().decode('utf-8')

    def ecrire(texte, appel):
        print(('[simulation] ' if SIMULATION else '') + texte)
        if not SIMULATION:
            appel()

    # 1. Les films « à voir », et la clé TMDB du site (la même que app.js)
    films = json.loads(brut('films.json'))['films']
    tous = {f['id']: f for f in films}
    a_voir = {f['id']: f for f in films if (f.get('user') or {}).get('statut') == 'a_voir' and f.get('tmdb_id')}
    cle = re.search(r"const TMDB_KEY = '([^']+)'", brut('app.js')).group(1)

    # 2. Le catalogue Canal+ en France, films et séries, abonnement seulement
    catalogue, complet = lire_catalogue(lire, cle, CANAL_PLUS)
    print('catalogue Canal+ : %d titres%s ; à voir : %d films' % (len(catalogue), '' if complet else ' (incomplet)', len(a_voir)))

    # 3. Les tickets déjà ouverts ou fermés (la mémoire)
    tickets, page = [], 1
    while True:
        lot = github('/repos/%s/issues?state=all&labels=%s&per_page=100&page=%d'
                     % (REPO, urllib.parse.quote(ETIQUETTE), page)) or []
        tickets += [t for t in lot if 'pull_request' not in t]
        if len(lot) < 100:
            break
        page += 1
    par_film = {}
    for t in tickets:
        fid = marqueur_film(t.get('body'))
        if fid:
            par_film.setdefault(fid, []).append(t)
    fini = lambda t: any(l['name'] == FINI for l in t.get('labels', []))

    if not SIMULATION:
        for nom, couleur, desc in ((ETIQUETTE, '79a6d2', 'film à voir arrivé sur Canal+'),
                                   (FINI, '5e6973', 'plus sur Canal+ ou plus à voir'),
                                   (ETIQUETTE_TMDB, 'd4a574', 'données TMDB à relire (règle des 6 mois)')):
            try:
                github('/repos/%s/labels' % REPO, {'name': nom, 'color': couleur, 'description': desc}, 'POST')
            except urllib.error.HTTPError as e:
                if e.code != 422:                      # 422 : l'étiquette existe déjà
                    raise

    # 4. Nouvelles arrivées : un ticket par film à voir arrivé sur Canal+
    for fid, f in sorted(a_voir.items(), key=lambda x: x[1].get('title') or ''):
        if fid not in catalogue:
            continue
        if any(not fini(t) for t in par_film.get(fid, [])):
            continue                                   # déjà signalé pour cette arrivée
        titre = sans_mention(f.get('title') or fid)
        infos = sans_mention(' · '.join(str(x) for x in (f.get('year'), f.get('director')) if x))
        genre = 'tv' if f.get('type') == 'tv' else 'movie'
        corps = ('**%s**%s, dans ta liste « à voir », est disponible avec l\'abonnement Canal+ '
                 '(en streaming, sans achat ni location).\n\n'
                 'Offres en France : https://www.themoviedb.org/%s/%s/watch?locale=FR\n\n'
                 '@%s : ferme ce ticket quand tu veux, tu ne seras pas prévenu deux fois. '
                 'S\'il quitte Canal+ puis revient, une nouvelle alerte partira.\n\n'
                 '<!-- canal-plus:%s -->') % (titre, ' (%s)' % infos if infos else '', genre, f['tmdb_id'], OWNER, fid)
        ecrire('alerte : « %s » est sur Canal+' % titre, lambda: github(
            '/repos/%s/issues' % REPO,
            {'title': '« %s » est sur Canal+' % titre, 'body': corps, 'labels': [ETIQUETTE]}, 'POST'))

    # 5. Arrivées terminées (plus sur Canal+, ou plus à voir) : ticket marqué
    #    « terminé » (et fermé), pour qu'un retour sur Canal+ déclenche une alerte
    if complet:
        for fid, liste in par_film.items():
            for t in liste:
                if fini(t):
                    continue
                if fid in a_voir and fid in catalogue:
                    continue
                raison = "n'est plus dans ta liste « à voir »" if fid not in a_voir else "n'est plus sur Canal+"
                titre = (tous.get(fid) or {}).get('title') or t['title']
                def clore(t=t, raison=raison, titre=titre):
                    if t['state'] == 'open':
                        github('/repos/%s/issues/%d/comments' % (REPO, t['number']),
                               {'body': '« %s » %s.' % (titre, raison)}, 'POST')
                    github('/repos/%s/issues/%d' % (REPO, t['number']),
                           {'state': 'closed', 'labels': [ETIQUETTE, FINI]}, 'PATCH')
                ecrire('fin : %s (%s)' % (titre, raison), clore)

    # 6. canal_plus.json pour les pastilles du site (Canal+, Apple TV).
    #    Seulement une liste complète : sinon le site garde celle de la veille
    #    (puis, au-delà de 3 jours, relit TMDB lui-même).
    abonnement, complet = lire_catalogue(lire, cle, ABONNEMENT_CANAL)
    print('abonnement (Canal+, Apple TV) : %d titres%s' % (len(abonnement), '' if complet else ' (incomplet : rien publié)'))
    if complet and abonnement:
        texte = contenu_fichier(abonnement)
        def deposer():
            try:
                actuel = github('/repos/%s/contents/%s?ref=%s' % (REPO, FICHIER, urllib.parse.quote(BRANCHE)))
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                actuel = None                          # premier passage : le fichier n'existe pas encore
            corps = {'message': 'canal+ : catalogue du %s' % datetime.now(timezone.utc).strftime('%d/%m'),
                     'content': base64.b64encode(texte.encode('utf-8')).decode(), 'branch': BRANCHE}
            if actuel:
                corps['sha'] = actuel['sha']
            github('/repos/%s/contents/%s' % (REPO, FICHIER), corps, 'PUT')
        ecrire('%s déposé (%d Ko)' % (FICHIER, len(texte) // 1024), deposer)

    alerte_tmdb(github, ecrire, REPO, OWNER, films)


def alerte_tmdb(github, ecrire, REPO, OWNER, films, maintenant=None):
    # 3. Un seul ticket ouvert à la fois ; fermé dès que tout a été relu
    maintenant = maintenant or datetime.now(timezone.utc)
    vieux = donnees_a_relire(films, maintenant)
    ouverts = [t for t in (github('/repos/%s/issues?state=open&labels=%s&per_page=100'
                                  % (REPO, urllib.parse.quote(ETIQUETTE_TMDB))) or [])
               if MARQUEUR_TMDB in (t.get('body') or '')]
    print('données TMDB de plus de %d jours : %d films' % (RELECTURE_JOURS, len(vieux)))
    if vieux and not ouverts:
        plus_vieux = vieux[0][0]
        limite = (plus_vieux + timedelta(days=182)).strftime('%d/%m/%Y')
        corps = ('%d film%s de ta collection %s des données TMDB lues il y a plus de 5 mois '
                 '(la plus ancienne le %s). Les conditions de TMDB interdisent de les garder plus '
                 'de 6 mois : limite le **%s**.\n\n'
                 'Pour les relire : ouvre le site et déverrouille le mode édition (cadenas) ; la '
                 'relecture part toute seule au bout de 3 secondes. Ce ticket se fermera de lui-même '
                 'au passage suivant du robot.\n\n@%s\n\n%s') % (
                     len(vieux), 's' if len(vieux) > 1 else '', 'ont' if len(vieux) > 1 else 'a',
                     plus_vieux.strftime('%d/%m/%Y'), limite, OWNER, MARQUEUR_TMDB)
        ecrire('alerte : données TMDB à relire (%d films)' % len(vieux), lambda: github(
            '/repos/%s/issues' % REPO,
            {'title': 'Données TMDB à relire : déverrouille le mode édition', 'body': corps,
             'labels': [ETIQUETTE_TMDB]}, 'POST'))
    elif not vieux:
        for t in ouverts:
            def clore(t=t):
                github('/repos/%s/issues/%d/comments' % (REPO, t['number']),
                       {'body': 'Toutes les données TMDB ont moins de 5 mois.'}, 'POST')
                github('/repos/%s/issues/%d' % (REPO, t['number']), {'state': 'closed'}, 'PATCH')
            ecrire('fin : données TMDB relues', clore)


if __name__ == '__main__':
    main()
