# Recherche et affichage demandés le 2026-11-13 (TMDB simulé, banc.py) :
# - la case de Découvrir cherche dans la catégorie affichée seulement ;
# - l'onglet « explorer » (entre « découvrir » et « reco ») cherche dans tout TMDB ;
# - 5 films par ligne au plus, pas de « + » devant « découvrir » ;
# - la fiche donne le mois et l'année de sortie.
import json, unittest
from banc import Banc

# Programme de Lyon simulé : deux films, séances en 2099 (toujours à venir)
PROGRAMME = {
    'genere': '2099-01-01T00:00:00Z', 'du': '2099-01-01', 'jours': 7,
    'salles': [{'code': 'P0017', 'nom': 'Lumière Terreaux', 'url': 'https://www.allocine.fr/'}],
    'films': [
        {'titre': 'Dune deux', 'tmdb': 7001, 'titre_tmdb': 'Dune deux', 'original_title': 'Dune: Part Two',
         'salles': {'P0017': [['2099-01-02T20:00', 'VO']]}, 'release_date': '2024-02-28', 'genre_ids': [878]},
        {'titre': 'Un autre film', 'tmdb': 7002, 'titre_tmdb': 'Un autre film', 'original_title': 'Un autre film',
         'salles': {'P0017': [['2099-01-02T18:00', 'VF']]}, 'release_date': '2025-05-01', 'genre_ids': [18]},
    ],
}


class Recherche(Banc):
    def setUp(self):
        super().setUp()
        corps = json.dumps(PROGRAMME, ensure_ascii=False)
        self.ctx.route('**/cinemas_lyon.json*', lambda route, req: route.fulfill(body=corps, content_type='application/json'))

    def recherches_tmdb(self):
        return [u for u in self.requetes_tmdb if '/search/' in u]

    def test_decouvrir_a_lyon_ne_montre_que_les_films_a_lyon(self):
        self.ouvrir()
        self.decouvrir()
        self.attendre(lambda: self.titres() == ['Dune deux', 'Un autre film'] or self.titres() == ['Un autre film', 'Dune deux'])
        self.assertEqual(self.page.get_attribute('#discover-search', 'placeholder'), 'cherche dans « à lyon »…')
        self.page.fill('#discover-search', 'dune')
        self.attendre(lambda: self.titres() == ['Dune deux'])
        self.assertEqual(self.titres(), ['Dune deux'], 'résultats hors du programme de Lyon')
        self.assertEqual(self.recherches_tmdb(), [], 'recherche dans tout TMDB')
        # Titre d'origine aussi, et la pastille « à lyon » reste active
        self.page.fill('#discover-search', 'part two')
        self.attendre(lambda: self.titres() == ['Dune deux'])
        self.assertEqual(self.titres(), ['Dune deux'])
        self.assertTrue(self.js('document.querySelector(".explorer-cat[data-cat=lyon]").classList.contains("active")'))

    def test_decouvrir_au_cinema_cherche_dans_sa_liste(self):
        self.ouvrir()
        self.decouvrir()
        self.page.click('.explorer-cat[data-cat="now_playing"]')
        self.attendre(lambda: len(self.titres()) > 5)
        self.assertEqual(self.page.get_attribute('#discover-search', 'placeholder'), 'cherche dans « au cinéma »…')
        self.page.fill('#discover-search', 'affiche 7')
        self.attendre(lambda: self.titres() == ['À l’affiche 7'])
        self.assertEqual(self.titres(), ['À l’affiche 7'])
        self.assertEqual(self.recherches_tmdb(), [])

    def test_decouvrir_canal_ne_garde_que_l_abonnement(self):
        self.ouvrir()
        self.page.evaluate('async () => { await canalPret; canalSet = new Set(["movie-5002", "movie-5004"]); }')
        self.decouvrir()
        self.page.click('.explorer-cat[data-cat="canal"]')
        self.page.wait_for_timeout(500)
        self.page.fill('#discover-search', 'dune')
        self.attendre(lambda: self.titres() == ['dune 2', 'dune 4'])
        self.assertEqual(self.titres(), ['dune 2', 'dune 4'], 'résultats hors de l\'abonnement')

    def test_explorer_entre_decouvrir_et_reco_cherche_partout(self):
        self.ouvrir()
        onglets = self.js('[...document.querySelectorAll("#status-tabs .tab")].map(t => t.dataset.view)')
        self.assertEqual(onglets, ['a_voir', 'vu', 'discover', 'explorer', 'reco'])
        self.explorer()
        self.assertEqual(self.js('document.activeElement.id'), 'explorer-search', 'case prête à taper')
        self.assertTrue(self.js('!!document.querySelector("#grid .explorer-invite")'))
        self.page.fill('#explorer-search', 'dune')
        self.attendre(lambda: len(self.titres()) == 10)
        self.assertEqual(self.titres()[:2], ['dune 1', 'dune 2'])
        self.assertTrue(self.recherches_tmdb())
        # « précédent » depuis un autre onglet ramène la recherche
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        self.page.go_back()
        self.attendre(lambda: self.js('state.view') == 'explorer' and len(self.titres()) == 10)
        self.assertEqual(self.titres()[0], 'dune 1')

    def test_pas_de_plus_devant_decouvrir(self):
        self.ouvrir()
        avant = self.js('getComputedStyle(document.querySelector(".tab-discover"), "::before").content')
        self.assertIn(avant, ('none', 'normal', ''))
        self.assertEqual(self.js('document.querySelector(".tab-discover").textContent.trim()'), 'découvrir')

    def test_onglet_actif_lisible_sous_la_souris(self):
        self.ouvrir()
        for vue in ('discover', 'explorer', 'reco'):
            self.page.click('.tab[data-view="%s"]' % vue)
            self.page.hover('.tab[data-view="%s"]' % vue)
            self.page.wait_for_timeout(250)  # fin de la transition
            texte, fond = self.js('(() => { const s = getComputedStyle(document.querySelector(".tab[data-view=%s]")); return [s.color, s.backgroundColor]; })()' % vue)
            self.assertNotEqual(texte, fond, 'onglet « %s » : texte invisible sous la souris' % vue)

    def test_fiche_mois_et_annee_de_sortie(self):
        self.ouvrir()
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        self.page.locator('#grid .card').first.click()
        self.attendre(lambda: self.js('!!document.querySelector("#modal-body .modal-meta-line")'))
        f = self.js('(() => { const f = state.films.find(x => x.id === openModalCtx.id); return [f.release_date, String(f.year)]; })()')
        ligne = self.js('document.querySelector("#modal-body .modal-meta-line").textContent')
        self.assertTrue(f[0], 'film sans date de sortie')
        attendu = f[0][5:7] + '/' + f[0][:4]
        self.assertTrue(ligne.startswith(attendu), '%r ne commence pas par %r' % (ligne, attendu))


class GrandEcran(Banc):
    largeur = 1600

    def test_cinq_films_par_ligne_au_plus(self):
        self.ouvrir()
        colonnes = self.js('getComputedStyle(document.getElementById("grid")).gridTemplateColumns.split(" ").length')
        self.assertEqual(colonnes, 5)


if __name__ == '__main__':
    unittest.main()
