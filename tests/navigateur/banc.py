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

    def explorer(self):
        self.page.click('.tab[data-view="explorer"]')
        self.attendre(lambda: self.js('state.view === "explorer"'))

    # ---- site « comme en ligne », pour le mode édition
    # Le mode édition ne s'active que sur *.github.io : le site est servi sous
    # une fausse adresse (toutes ses requêtes répondues par les fichiers locaux,
    # rien ne sort sur Internet), et un faux GitHub tenu dans la page
    # (window.__gh) remplace l'API : 409 si la version envoyée est périmée,
    # « commit » d'un autre appareil possible. Faux token, chiffré par le site.
    ORIGINE = 'https://proprio-test.github.io'

    def ouvrir_en_ligne(self):
        base = self.ORIGINE + '/films/'
        types = {'.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json',
                 '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json'}

        def servir(route, req):
            chemin = req.url.split('?')[0].split('#')[0]
            rel = chemin[len(base):] if chemin.startswith(base) else ''
            f = (SITE / (rel or 'index.html')).resolve()
            if not str(f).startswith(str(SITE)) or not f.is_file():
                return route.fulfill(status=404, body='absent')
            # FILMS_APP_JS, FILMS_STYLE_CSS, FILMS_INDEX_HTML : la copie demandée (cette
            # route passe devant celles de setUp, qui ne s'appliqueraient pas)
            autre = {'app.js': 'FILMS_APP_JS', 'style.css': 'FILMS_STYLE_CSS', 'index.html': 'FILMS_INDEX_HTML'}.get(f.name)
            if autre and os.environ.get(autre):
                f = Path(os.environ[autre])
            route.fulfill(status=200, body=f.read_bytes(), headers={'content-type': types.get(f.suffix, 'application/octet-stream')})
        self.ctx.route(self.ORIGINE + '/**', servir)
        self.ctx.add_init_script(FAUX_GITHUB)
        self.page.goto(base)
        self.attendre(lambda: self.js('state.films.length > 0'))

    def deverrouiller(self, code='1234'):
        """Faux token chiffré par le site lui-même, puis déverrouillage par l'interface."""
        self.page.evaluate('''async code => localStorage.setItem('films_encrypted_pat',
            await encryptWithCode('github_pat_FAUXJETONDETEST', code))''', code)
        self.page.reload()
        self.attendre(lambda: self.js('state.films.length > 0'))
        self.js('refreshTmdbData = async () => {}')  # relecture TMDB de masse : hors sujet ici
        self.page.click('#nav-admin')
        self.page.wait_for_timeout(300)
        self.page.fill('#admin-unlock-code', code)
        self.page.click('#admin-unlock-btn')
        return self.attendre(lambda: self.js('admin.active === true'), 20)


FAUX_GITHUB = r'''
(() => {
  const vrai = window.fetch.bind(window);
  const gh = window.__gh = { n: 1, contenu: null, journal: [] };
  const b64 = s => btoa(unescape(encodeURIComponent(s)));
  const deB64 = s => decodeURIComponent(escape(atob(s)));
  const rep = (statut, obj) => new Response(JSON.stringify(obj), { status: statut, headers: { 'content-type': 'application/json' } });
  const charger = async () => { if (gh.contenu === null) gh.contenu = await (await vrai('./films.json')).text(); };
  window.fetch = async (entree, init) => {
    const url = typeof entree === 'string' ? entree : entree.url;
    if (!url.startsWith('https://api.github.com/')) return vrai(entree, init);
    const methode = ((init && init.method) || 'GET').toUpperCase(), chemin = new URL(url).pathname;
    await charger();
    if (methode === 'GET' && /^\/repos\/[^/]+\/[^/]+$/.test(chemin)) return rep(200, { full_name: 'test' });
    if (chemin.endsWith('/contents/films.json')) {
      if (methode === 'GET') return rep(200, { sha: 'v' + gh.n, encoding: 'base64', content: b64(gh.contenu) });
      if (methode === 'PUT') {
        const corps = JSON.parse(init.body);
        if (corps.sha !== 'v' + gh.n) { gh.journal.push(409); return rep(409, { message: 'films.json does not match' }); }
        gh.contenu = deB64(corps.content); gh.n++; gh.journal.push(200);
        return rep(200, { content: { sha: 'v' + gh.n } });
      }
    }
    return rep(404, { message: 'not found' });
  };
  // Enregistrement fait sur un autre appareil
  gh.ailleurs = async (id, note) => {
    await charger();
    const d = JSON.parse(gh.contenu);
    const u = d.films.find(f => f.id === id).user;
    u.rating = note; u.favorite = note === 6; // comme le site : 6 = coup de cœur
    gh.contenu = JSON.stringify(d); gh.n++;
  };
  gh.film = id => JSON.parse(gh.contenu).films.find(f => f.id === id);
})();
'''
