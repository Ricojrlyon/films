# Tests du robot du matin (canal_plus.py), sans réseau :
#   python3 -m unittest discover -s .github/scripts -p "test_*.py"
import json, re, unittest
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import unquote
import canal_plus as robot


def faux_tmdb(pages_par_genre, panne_page=None):
    # Catalogue simulé : « 381|685|350 » rend plus de titres que « 381 » seul
    def lire(url):
        genre = 'movie' if '/discover/movie' in url else 'tv'
        page = int(re.search(r'page=(\d+)', url).group(1))
        if page == panne_page:
            raise RuntimeError('injoignable')
        fournisseurs = unquote(re.search(r'with_watch_providers=([^&]+)', url).group(1))
        base = 1000 if fournisseurs == '381' else 5000
        return {'total_pages': pages_par_genre, 'results': [{'id': base + page * 10 + i} for i in range(3)]}
    return lire


class Catalogue(unittest.TestCase):
    def test_toutes_les_pages_films_et_series(self):
        ids, complet = robot.lire_catalogue(faux_tmdb(3), 'cle', robot.CANAL_PLUS)
        self.assertTrue(complet)
        self.assertEqual(len(ids), 2 * 3 * 3)
        self.assertIn('movie-1010', ids)
        self.assertIn('tv-1010', ids)

    def test_page_manquante_liste_incomplete(self):
        ids, complet = robot.lire_catalogue(faux_tmdb(3, panne_page=2), 'cle', robot.ABONNEMENT_CANAL)
        self.assertFalse(complet)

    def test_abonnement_complet_demande_les_trois_fournisseurs(self):
        vus = []
        lire = faux_tmdb(1)
        robot.lire_catalogue(lambda u: (vus.append(u), lire(u))[1], 'cle', robot.ABONNEMENT_CANAL)
        self.assertTrue(all('with_watch_providers=381%7C685%7C350' in u for u in vus), vus[:1])


class Fichier(unittest.TestCase):
    def test_contenu_lu_par_le_site(self):
        # Les champs que lit ensureCanalFR (app.js) : fournisseurs, complet, genere, ids
        d = json.loads(robot.contenu_fichier({'tv-2', 'movie-1'}, datetime(2026, 11, 13, 6, 0, tzinfo=timezone.utc)))
        self.assertEqual(d['fournisseurs'], '381|685|350')
        self.assertIs(d['complet'], True)
        self.assertEqual(d['genere'], '2026-11-13T06:00:00Z')
        self.assertEqual(d['ids'], ['movie-1', 'tv-2'])

    def test_meme_abonnement_que_le_site(self):
        app = open(__file__.replace('test_canal_plus.py', '../../app.js').replace('\\', '/'), encoding='utf-8').read()
        self.assertIn("const ABONNEMENT_CANAL = '%s'" % robot.ABONNEMENT_CANAL, app)


if __name__ == '__main__':
    unittest.main()
