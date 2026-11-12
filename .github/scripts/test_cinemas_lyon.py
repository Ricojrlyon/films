# Tests du robot des cinémas de Lyon, sans réseau :
#   python3 -m unittest discover -s .github/scripts -p "test_*.py"
# Un faux AlloCiné se comporte comme le vrai (vérifié le 2026-11-12) :
# « d-2026-11-14 » donne les séances du 14 ; un simple numéro (« d-2 ») est
# ignoré et donne toujours la page par défaut (aujourd'hui et demain matin).
import re, unittest
from datetime import date, timedelta
import cinemas_lyon as robot

AUJOURDHUI = date(2026, 11, 12)


def faux_allocine(url):
    m = re.search(r'/theater-(\w+)/d-([^/]+)/', url)
    code, jour = m.group(1), m.group(2)
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', jour):
        dates = [AUJOURDHUI.isoformat(), (AUJOURDHUI + timedelta(days=1)).isoformat()]  # page par défaut
    else:
        dates = [jour]
    return {'pagination': {'totalPages': 1}, 'results': [{
        'movie': {'internalId': 1, 'title': 'Film ' + code, 'originalTitle': 'Film', 'releases': [], 'credits': []},
        'showtimes': {'original': [{'startsAt': d + 'T20:00:00', 'diffusionVersion': 'ORIGINAL'} for d in dates]},
    }]}


class Programme(unittest.TestCase):
    def test_adresse_avec_date_complete(self):
        self.assertIn('/theater-P3757/d-2026-11-14/', robot.adresse_seances('P3757', AUJOURDHUI, 2))
        self.assertTrue(robot.adresse_seances('P3757', AUJOURDHUI, 0, 2).endswith('/d-2026-11-12/p-2/'))

    def test_sept_jours_de_seances(self):
        films = robot.lire_programme(faux_allocine, AUJOURDHUI, salles=[('P3757', 'Comœdia')], pause=0)
        jours = {q[:10] for f in films.values() for s in f['salles'].values() for q, v in s}
        self.assertEqual(jours, {(AUJOURDHUI + timedelta(days=j)).isoformat() for j in range(7)})

    def test_programme_vide_refuse(self):
        # AlloCiné qui ne répond plus rien : on ne publie pas un fichier vide
        with self.assertRaises(SystemExit):
            robot.verifier_programme({})
        robot.verifier_programme(robot.lire_programme(faux_allocine, AUJOURDHUI, salles=[('P3757', 'Comœdia')], pause=0))


if __name__ == '__main__':
    unittest.main()
