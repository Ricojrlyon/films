# Écrans du site dans un vrai navigateur, TMDB simulé (voir banc.py) :
#   python -m unittest discover -s tests/navigateur
# FILMS_APP_JS=<chemin> fait servir une autre copie d'app.js (voir banc.py).
import json, unittest
from banc import Banc


class Ecrans(Banc):
    def test_B5_pas_de_faux_aucun_film_au_demarrage(self):
        # films.json lent : les pastilles (Canal+, Lyon, au ciné) arrivent avant
        self.ctx.add_init_script('window.__regles.push({ motif: "films.json", ms: 1500 })')
        self.page.goto(self.base + '/index.html')
        vu = False
        for _ in range(20):
            self.page.wait_for_timeout(100)
            vu = vu or self.js('getComputedStyle(document.getElementById("empty")).display !== "none"')
        self.assertFalse(vu, '« aucun film ne correspond » affiché pendant le chargement')
        self.attendre(lambda: self.js('state.films.length > 0'))

    def test_B5_erreur_de_chargement_reste_visible(self):
        self.ctx.add_init_script('window.__regles.push({ motif: "films.json", statut: 500 })')
        self.page.goto(self.base + '/index.html')
        self.page.wait_for_timeout(2500)  # Lyon, Canal+, au ciné sont arrivés depuis
        self.assertIn('impossible de charger films.json', self.js('document.getElementById("grid").innerText'))

    # Depuis le 2026-11-13, la case de Découvrir cherche dans la catégorie
    # affichée, et la recherche dans tout TMDB est dans l'onglet « explorer »
    def test_B1_categorie_lente_ne_remplace_pas_la_recherche(self):
        self.ouvrir()
        self.decouvrir()
        self.regle('now_playing', ms=2500)
        self.page.click('.explorer-cat[data-cat="now_playing"]')
        self.page.fill('#discover-search', 'affiche 3')
        self.page.wait_for_timeout(3500)
        self.assertEqual(self.page.input_value('#discover-search'), 'affiche 3')
        self.assertEqual(self.titres(), ['À l’affiche 3'])

    def test_B1_recherche_lente_ne_remplace_pas_la_categorie(self):
        self.ouvrir()
        self.decouvrir()
        self.page.click('.explorer-cat[data-cat="canal"]')
        self.regle('search/multi', ms=2500)
        self.page.fill('#discover-search', 'amelie')
        self.page.wait_for_timeout(500)
        self.page.click('.explorer-cat[data-cat="trending"]')
        self.page.wait_for_timeout(3500)
        self.assertTrue(self.titres() and self.titres()[0].startswith('Tendance'), self.titres()[:3])

    def test_B1_recherche_lente_d_explorer_ne_remplace_pas_decouvrir(self):
        self.ouvrir()
        self.explorer()
        self.regle('search/multi', ms=2500)
        self.page.fill('#explorer-search', 'amelie')
        self.page.wait_for_timeout(500)
        self.decouvrir()
        self.page.click('.explorer-cat[data-cat="trending"]')
        self.page.wait_for_timeout(3500)
        self.assertTrue(self.titres() and self.titres()[0].startswith('Tendance'), self.titres()[:3])

    def test_B2_recherche_rendue_au_retour(self):
        self.ouvrir()
        self.explorer()
        self.page.fill('#explorer-search', 'dune')
        self.attendre(lambda: (self.titres() or [''])[0].startswith('dune'))
        self.page.click('.tab[data-view="a_voir"]')
        self.page.wait_for_timeout(300)
        self.explorer()
        self.page.wait_for_timeout(1500)
        self.assertTrue(self.titres() and self.titres()[0].startswith('dune'), self.titres()[:3])

    def test_B3_fiche_lente_ne_remplace_pas_la_suivante(self):
        self.ouvrir()
        self.explorer()
        self.page.fill('#explorer-search', 'dune')
        self.attendre(lambda: len(self.titres()) >= 2)
        self.regle('/movie/5001?', ms=2500)
        self.page.locator('#grid .card').nth(0).click()
        self.page.wait_for_timeout(300)
        self.page.keyboard.press('Escape')
        self.page.wait_for_timeout(300)
        self.page.locator('#grid .card').nth(1).click()
        self.page.wait_for_timeout(3500)
        self.assertEqual(self.js('openModalCtx.id'), 'movie-5002')
        self.assertEqual(self.js('document.getElementById("modal-title")?.textContent'), 'Film 5002')

    def test_B4_saisie_gardee_malgre_une_reponse_tardive(self):
        self.ouvrir()
        self.js('admin.active = true; document.body.classList.add("admin-mode")')  # mode édition simulé, aucun token
        self.explorer()
        self.page.fill('#explorer-search', 'dune')
        self.attendre(lambda: len(self.titres()) >= 1)
        self.page.locator('#grid .card').nth(0).click()
        self.attendre(lambda: self.js('!!document.querySelector("[data-action=show_vu_form]")'))
        self.page.click('[data-action="show_vu_form"]')
        self.page.click('#tmdb-add-rating-chips .rating-chip[data-rating="5"]')
        # Une réponse TMDB tardive (titre latinisé, noms…) redessine la fiche
        self.js('reRenderModalIfShowing({ id: openModalCtx.id, type: "movie", title: "Titre tardif", genres: [], cast: [], user: null })')
        self.page.wait_for_timeout(300)
        self.assertTrue(self.js('getComputedStyle(document.getElementById("tmdb-add-form-section")).display !== "none"'),
                        'formulaire « déjà vu » refermé')
        self.assertTrue(self.js('!!document.querySelector("#tmdb-add-rating-chips .rating-chip.active[data-rating=\'5\']")'),
                        'note saisie perdue')

    def test_B7_double_clic_ouvre_la_fiche(self):
        self.ouvrir()
        self.page.locator('#grid .card').nth(0).dblclick()  # carte de gauche, hors du cadre de la fiche
        self.page.wait_for_timeout(600)
        self.assertTrue(self.js('document.getElementById("modal-backdrop").classList.contains("open")'))

    def test_B9_une_seule_lecture_par_liste(self):
        self.ouvrir()
        self.decouvrir()
        self.page.wait_for_timeout(1500)
        avant = len([u for u in self.requetes_tmdb if 'now_playing' in u and 'page=1' in u])
        self.regle('now_playing', ms=2000)
        for _ in range(3):  # trois clics sur la même catégorie pendant son chargement
            self.page.click('.explorer-cat[data-cat="now_playing"]')
            self.page.wait_for_timeout(150)
        self.page.wait_for_timeout(3000)
        apres = len([u for u in self.requetes_tmdb if 'now_playing' in u and 'page=1' in u])
        self.assertEqual(apres - avant, 1, 'la même liste a été lue plusieurs fois')

    def test_B10_enregistrement_lent_ne_ferme_pas_une_autre_fiche(self):
        self.ouvrir()
        # Mode édition simulé ; l'envoi vers GitHub est remplacé par 2 s d'attente
        self.js('admin.active = true; document.body.classList.add("admin-mode");'
                'saveFilmsToGithub = () => new Promise(ok => setTimeout(ok, 2000))')
        cartes = self.page.locator('#grid .card')
        cartes.nth(0).click()
        self.attendre(lambda: self.js('!!document.querySelector(".edit-form .edit-save")'))
        self.page.click('.edit-form .edit-save')
        self.page.keyboard.press('Escape')
        self.page.wait_for_timeout(300)
        cartes.nth(1).click()
        autre = self.js('openModalCtx.id')
        self.page.wait_for_timeout(2500)
        self.assertTrue(self.js('document.getElementById("modal-backdrop").classList.contains("open")'), 'l\'autre fiche a été fermée')
        self.assertEqual(self.js('openModalCtx.id'), autre)


class CanalParDate(Banc):
    # Catalogue « canal+ » simulé de 21 pages, dans l'ordre de TMDB (date de
    # sortie mondiale) ; le film 41 (page 3) est sorti en France le plus
    # récemment, comme un film de festival sorti en salles des mois plus tard.
    def setUp(self):
        super().setUp()
        from datetime import date, timedelta
        from urllib.parse import urlparse, parse_qs

        def film(i):
            d = '2026-11-01' if i == 41 else (date(2026, 10, 1) - timedelta(days=i)).isoformat()
            return {'id': 90000 + i, 'title': 'C%03d %s' % (i, d), 'original_title': 'C%03d' % i, 'release_date': d,
                    'poster_path': None, 'genre_ids': [], 'vote_count': 100, 'vote_average': 7, 'popularity': 50}

        def canal(route, req):
            q = parse_qs(urlparse(req.url).query)
            if 'with_watch_providers' not in q:
                return route.fallback()
            self.pages_canal.append(int(q['page'][0]))
            n = int(q['page'][0])
            corps = {'page': n, 'total_pages': 21, 'total_results': 420,
                     'results': [film((n - 1) * 20 + i + 1) for i in range(20)] if n <= 21 else []}
            route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                          body=json.dumps(corps))
        self.pages_canal = []
        self.ctx.route('https://api.themoviedb.org/3/discover/movie**', canal)

    def test_charger_plus_n_ajoute_rien_au_dessus(self):
        self.ouvrir()
        self.decouvrir()
        self.page.click('.explorer-cat[data-cat="canal"]')
        self.attendre(lambda: len(self.titres()) == 40)
        avant = self.titres()
        self.assertTrue(avant[0].startswith('C041'), 'le film sorti en France le plus récemment, en tête : %s' % avant[:2])
        lues = len(self.pages_canal)
        self.page.click('#discover-more')
        self.attendre(lambda: len(self.titres()) == 80)
        apres = self.titres()
        self.assertEqual(apres[:40], avant, '« charger plus » a changé les films déjà affichés')
        dates = [x.split(' ')[1] for x in apres]
        self.assertEqual(dates, sorted(dates, reverse=True), "pas dans l'ordre des sorties")
        self.assertEqual(len(self.pages_canal), lues, 'TMDB relu pour « charger plus »')


class EcransTelephone(Banc):
    largeur = 375

    def test_ouverture_sans_erreur(self):
        self.ouvrir()
        self.assertGreater(self.page.locator('#grid .card').count(), 0)


if __name__ == '__main__':
    unittest.main()
