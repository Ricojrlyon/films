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


class Tickets(unittest.TestCase):
    def test_R2_le_dernier_marqueur_compte(self):
        # Un titre TMDB piégé qui contient un faux marqueur ne trompe pas la mémoire
        corps = '**Titre <!-- canal-plus:movie-1 -->** est sur Canal+\n\n<!-- canal-plus:movie-42 -->'
        self.assertEqual(robot.marqueur_film(corps), 'movie-42')

    def test_R2_pas_de_mention_dans_un_titre(self):
        self.assertNotIn('@quelquun ', robot.sans_mention('Film @quelquun 2'))


def films_lus(*dates):
    return [{'id': 'movie-%d' % i, 'tmdb_id': i, 'source': {'tmdb_at': d}} for i, d in enumerate(dates, 1)]


class SixMois(unittest.TestCase):
    MAINTENANT = datetime(2026, 11, 13, tzinfo=timezone.utc)

    def test_L1_memes_regles_que_le_site(self):
        app = (Path(__file__).resolve().parents[2] / 'app.js').read_text(encoding='utf-8')
        self.assertIn('const TMDB_REFRESH_AGE = %d * 86400000;' % robot.RELECTURE_JOURS, app)
        self.assertIn("const TMDB_IMPORT_DATE = '%s';" % robot.TMDB_IMPORT_DATE, app)

    def test_L1_films_a_relire(self):
        vieux = robot.donnees_a_relire(films_lus('2026-06-01T00:00:00Z', '2026-10-22T00:00:00Z'), self.MAINTENANT)
        self.assertEqual([f['id'] for _, f in vieux], ['movie-1'])
        # Fiche jamais relue : date de l'import (19/05/2026), donc à relire
        self.assertEqual(len(robot.donnees_a_relire([{'id': 'movie-9', 'tmdb_id': 9}], self.MAINTENANT)), 1)

    def faux_github(self, ouverts):
        appels = []
        def github(chemin, donnees=None, methode=None):
            appels.append((methode or 'GET', chemin, donnees))
            return ouverts if (methode or 'GET') == 'GET' else {}
        return github, appels

    def test_L1_un_ticket_si_des_donnees_sont_vieilles(self):
        github, appels = self.faux_github([])
        robot.alerte_tmdb(github, lambda t, f: f(), 'r/films', 'proprio', films_lus('2026-06-01T00:00:00Z'), self.MAINTENANT)
        posts = [a for a in appels if a[0] == 'POST']
        self.assertEqual(len(posts), 1)
        self.assertIn('30/11/2026', posts[0][2]['body'])  # limite des 6 mois (01/06 + 182 jours)
        self.assertIn('@proprio', posts[0][2]['body'])

    def test_L1_pas_de_second_ticket(self):
        github, appels = self.faux_github([{'number': 7, 'body': 'x ' + robot.MARQUEUR_TMDB}])
        robot.alerte_tmdb(github, lambda t, f: f(), 'r/films', 'proprio', films_lus('2026-06-01T00:00:00Z'), self.MAINTENANT)
        self.assertEqual([a for a in appels if a[0] != 'GET'], [])

    def test_L1_ticket_ferme_une_fois_tout_relu(self):
        github, appels = self.faux_github([{'number': 7, 'body': 'x ' + robot.MARQUEUR_TMDB}])
        robot.alerte_tmdb(github, lambda t, f: f(), 'r/films', 'proprio', films_lus('2026-10-22T00:00:00Z'), self.MAINTENANT)
        self.assertIn(('PATCH', '/repos/r/films/issues/7', {'state': 'closed'}), appels)


if __name__ == '__main__':
    unittest.main()
