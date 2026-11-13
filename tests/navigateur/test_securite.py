# Sécurité : un films.json piégé (copie modifiée, servie à la place du vrai le
# temps du test ; le vrai fichier n'est jamais touché) ne crée aucun élément HTML
import json, unittest
from banc import Banc, SITE


class Securite(Banc):
    def test_S3_valeurs_de_films_json_echappees(self):
        donnees = json.loads((SITE / 'films.json').read_text(encoding='utf-8'))
        vus = [f for f in donnees['films'] if (f.get('user') or {}).get('statut') == 'vu']
        vus[0]['user']['rating'] = '4<i id="inj-note"></i>'          # pastille de note des cartes
        vus[1]['user']['date_vue'] = '<i id=x'                       # graphique « par mois »
        vus[2]['id'] = vus[2]['id'] + '" id="inj-id'                 # formulaire d'édition
        piege = json.dumps(donnees, ensure_ascii=False)
        self.ctx.route('**/films.json*', lambda route, req: route.fulfill(body=piege, content_type='application/json'))
        crees = lambda: self.js('[...document.querySelectorAll("[id^=inj], i#x")].map(e => e.outerHTML.slice(0, 60))')
        self.ouvrir()
        self.js('admin.active = true; document.body.classList.add("admin-mode")')  # mode édition simulé, aucun token
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(500)
        self.assertEqual(crees(), [], 'cartes : éléments créés par une note piégée')
        self.js('openModalFromCard(%s)' % json.dumps(vus[2]['id']))
        self.page.wait_for_timeout(500)
        self.assertEqual(crees(), [], 'formulaire d\'édition : éléments créés par un id piégé')
        self.js('closeModal()')
        self.page.click('.nav-btn[data-page="stats"]')
        self.page.wait_for_timeout(1200)
        self.assertEqual(crees(), [], 'stats : éléments créés par une date piégée')


if __name__ == '__main__':
    unittest.main()
