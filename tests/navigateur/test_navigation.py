# Filtres, bouton précédent, écrans d'attente, heatmap (TMDB simulé, banc.py)
import json, unittest
from banc import Banc, SITE


class Navigation(Banc):
    def test_B11_filtres_des_vus_ignores_sur_a_voir(self):
        self.ouvrir()
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        self.page.click('#filter-toggle')  # le panneau des filtres
        annee = self.js('[...document.querySelectorAll("#filter-yearvu option")].map(o => o.value).find(v => /^\\d{4}$/.test(v))')
        self.page.select_option('#filter-yearvu', annee)
        self.page.wait_for_timeout(300)
        self.page.click('.tab[data-view="a_voir"]')
        self.page.wait_for_timeout(400)
        self.assertGreater(self.page.locator('#grid .card').count(), 0, '« à voir » vidé par un filtre des vus')
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        self.assertEqual(self.js('state.filters.yearvu'), annee, 'le filtre doit revenir sur « vus »')

    def test_B12_precedent_puis_suivant_garde_le_filtre(self):
        self.ouvrir()
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        self.page.click('#filter-toggle')
        self.page.select_option('#filter-genre', 'Drame')
        self.page.wait_for_timeout(300)
        self.js('history.back()')
        self.page.wait_for_timeout(600)
        self.js('history.forward()')
        self.page.wait_for_timeout(600)
        self.assertEqual(self.js('[state.view, state.filters.genre]'), ['vu', 'Drame'])

    def test_B13_precedent_juste_apres_un_rechargement(self):
        self.ouvrir()
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        self.page.locator('#grid .card').first.click()
        self.attendre(lambda: self.js('!!document.querySelector("#modal-body .name-link")'))
        film = self.js('openModalCtx.id')
        self.page.click('#modal-body .name-link')  # filmographie : une étape de plus
        self.page.wait_for_timeout(800)
        # Rechargement, films.json lent, et « précédent » aussitôt
        self.ctx.add_init_script('window.__regles.push({ motif: "films.json", ms: 2500 })')
        self.page.reload()
        self.page.wait_for_timeout(300)
        self.js('history.back()')
        self.attendre(lambda: self.js('state.films.length > 0'))
        self.page.wait_for_timeout(1000)
        self.assertEqual(self.js('[openModalCtx.id, openModalCtx.tmdbOnly]'), [film, False],
                         'film de la collection rouvert comme fiche TMDB (sans ta note)')

    def test_B14_pas_de_aucun_film_sous_un_chargement(self):
        self.ouvrir()
        self.page.fill('#search', 'zzzzzz')  # recherche sans résultat dans la collection
        self.page.wait_for_timeout(500)
        self.regle('now_playing', ms=2000)
        self.decouvrir()
        self.page.click('.explorer-cat[data-cat="now_playing"]')
        self.page.wait_for_timeout(500)
        self.assertFalse(self.js('getComputedStyle(document.getElementById("empty")).display !== "none"'),
                         '« aucun film ne correspond » affiché sous « chargement tmdb… »')

    def test_M8_heatmap_genres_des_films_vus(self):
        donnees = json.loads((SITE / 'films.json').read_text(encoding='utf-8'))
        # 300 films « à voir » d'un genre absent des vus : assez pour entrer dans
        # les 10 genres les plus fréquents si les « à voir » étaient comptés
        donnees['films'] += [{'id': 'movie-%d' % (9000000 + i), 'type': 'movie', 'title': 'A voir %d' % i,
                              'genres': ['GenreDesAVoir'], 'user': {'statut': 'a_voir'}} for i in range(300)]
        piege = json.dumps(donnees, ensure_ascii=False)
        self.ctx.route('**/films.json*', lambda route, req: route.fulfill(body=piege, content_type='application/json'))
        self.ouvrir()
        self.page.click('.nav-btn[data-page="stats"]')
        self.page.wait_for_timeout(1200)
        genres = self.js('[...document.querySelectorAll(".heatmap-genre-label")].map(e => e.textContent)')
        self.assertTrue(genres)
        self.assertNotIn('GenreDesAVoir', genres, 'genre des seuls « à voir » dans les stats')


if __name__ == '__main__':
    unittest.main()
