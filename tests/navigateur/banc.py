# Banc des tests dans le navigateur (Playwright pour Python), à côté du site :
# le site publié n'en dépend pas.
# - sert le dossier du site en local ;
# - TMDB est entièrement simulé (aucun appel réel, aucune clé utilisée) :
#   listes, recherches et fiches fabriquées à partir de l'adresse demandée ;
# - toute écriture vers GitHub est bloquée ; les images ne sont pas chargées ;
# - la page peut retarder ou faire échouer une requête (retarder(), panne()),
#   pour provoquer les courses entre réponses.
# Navigateur : Edge installé (par défaut) ; FILMS_NAVIGATEUR=chromium pour le
# Chromium de Playwright (sur GitHub).
import functools, http.server, json, os, re, threading, unittest
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

SITE = Path(__file__).resolve().parents[2]

# Dans la page, avant app.js : fetch enveloppé pour retarder ou faire échouer
# les requêtes dont l'adresse contient un motif (window.__regles)
ENVELOPPE = '''
(() => {
  const vrai = window.fetch.bind(window);
  window.__regles = [];
  window.fetch = async (u, o) => {
    const r = window.__regles.find(x => String(u).includes(x.motif));
    if (r && r.ms) await new Promise(ok => setTimeout(ok, r.ms));
    if (r && r.statut) return new Response('{}', { status: r.statut });
    return vrai(u, o);
  };
})();
'''


def _film(id_, titre):
    return {'id': id_, 'title': titre, 'original_title': titre, 'release_date': '2025-01-01', 'poster_path': None,
            'genre_ids': [], 'vote_count': 100, 'vote_average': 7, 'popularity': 50, 'media_type': 'movie',
            'original_language': 'fr'}


def reponse_tmdb(url):
    u = urlparse(url)
    chemin, q = u.path, parse_qs(u.query)
    liste = lambda debut, nom: {'page': 1, 'total_pages': 1, 'total_results': 20,
                                'results': [_film(debut + i, '%s %d' % (nom, i + 1)) for i in range(20)]}
    if chemin.endswith('/movie/now_playing'):
        return liste(1001, 'À l’affiche')
    if '/trending/' in chemin:
        return liste(2001, 'Tendance')
    if chemin.endswith('/movie/upcoming') or chemin.endswith('/discover/movie'):
        return liste(3001, 'Découverte')
    if chemin.endswith('/search/multi') or chemin.endswith('/search/movie'):
        mot = (q.get('query') or [''])[0]
        return {'page': 1, 'total_pages': 1, 'results': [_film(5001 + i, '%s %d' % (mot, i + 1)) for i in range(10)]}
    m = re.search(r'/(movie|tv)/(\d+)$', chemin)
    if m:
        id_ = int(m.group(2))
        return {**_film(id_, 'Film %d' % id_), 'genres': [], 'runtime': 100, 'overview': '',
                'production_countries': [{'iso_3166_1': 'FR', 'name': 'France'}],
                'credits': {'cast': [], 'crew': []}, 'keywords': {'keywords': []}, 'videos': {'results': []},
                'release_dates': {'results': []}, 'external_ids': {}, 'backdrop_path': None}
    if chemin.endswith('/watch/providers'):
        return {'results': {}}
    if '/genre/' in chemin:
        return {'genres': []}
    return {'page': 1, 'total_pages': 1, 'results': []}


class _Gest(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


class Banc(unittest.TestCase):
    """Une page neuve par test (mémoire du navigateur vide), largeur 1280 px."""
    largeur = 1280

    @classmethod
    def setUpClass(cls):
        cls.srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(_Gest, directory=str(SITE)))
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = 'http://127.0.0.1:%d' % cls.srv.server_address[1]
        cls.pw = sync_playwright().start()
        nav = os.environ.get('FILMS_NAVIGATEUR', 'msedge')
        cls.nav = cls.pw.chromium.launch(headless=True, **({} if nav == 'chromium' else {'channel': nav}))

    @classmethod
    def tearDownClass(cls):
        cls.nav.close()
        cls.pw.stop()
        cls.srv.shutdown()

    def setUp(self):
        self.ctx = self.nav.new_context(viewport={'width': self.largeur, 'height': 900}, locale='fr-FR',
                                        timezone_id='Europe/Paris')
        self.requetes_tmdb = []
        self.ecritures_github = []

        def tmdb(route, req):
            self.requetes_tmdb.append(req.url)
            route.fulfill(status=200, content_type='application/json',
                          headers={'access-control-allow-origin': '*'}, body=json.dumps(reponse_tmdb(req.url)))

        def github(route, req):
            if req.method != 'GET':
                self.ecritures_github.append(req.method + ' ' + req.url)
                return route.abort()
            route.fulfill(status=404, body='{}')
        self.ctx.route('https://api.themoviedb.org/**', tmdb)
        self.ctx.route('https://api.github.com/**', github)
        self.ctx.route('https://image.tmdb.org/**', lambda route, req: route.abort())
        self.ctx.add_init_script(ENVELOPPE)
        # FILMS_APP_JS, FILMS_STYLE_CSS, FILMS_INDEX_HTML=<chemin> : servir une
        # autre copie (l'ancienne version, pour vérifier qu'un test attrapait le défaut)
        for env, motif, type_ in (('FILMS_APP_JS', '**/app.js*', 'application/javascript'),
                                  ('FILMS_STYLE_CSS', '**/style.css*', 'text/css'),
                                  ('FILMS_INDEX_HTML', '**/index.html', 'text/html')):
            if os.environ.get(env):
                self.ctx.route(motif, lambda route, req, c=os.environ[env], t=type_: route.fulfill(path=c, content_type=t))
        self.page = self.ctx.new_page()
        self.erreurs = []
        self.page.on('pageerror', lambda e: self.erreurs.append(str(e)))

    def tearDown(self):
        self.ctx.close()
        self.assertEqual(self.erreurs, [], 'erreurs JavaScript dans la page')
        self.assertEqual(self.ecritures_github, [], 'écriture vers GitHub tentée')

    # ---- outils
    def ouvrir(self):
        """Ouvre le site et attend films.json (ou son message d'erreur)."""
        self.page.goto(self.base + '/index.html')
        self.attendre(lambda: self.js('state.films.length > 0 || /impossible/.test(document.getElementById("grid").innerText)'))

    def regle(self, motif, ms=0, statut=0):
        self.js('window.__regles.push(%s)' % json.dumps({'motif': motif, 'ms': ms, 'statut': statut}))

    def js(self, code):
        return self.page.evaluate(code)

    def attendre(self, condition, delai=15):
        # Pas de page.wait_for_function : la CSP du site interdit eval
        for _ in range(int(delai * 10)):
            if condition():
                return True
            self.page.wait_for_timeout(100)
        return False

    def titres(self):
        return self.js('[...document.querySelectorAll("#grid .card .card-title")].map(e => e.textContent)')

    def decouvrir(self):
        self.page.click('.tab[data-view="discover"]')
        self.attendre(lambda: self.js('state.view === "discover"'))
