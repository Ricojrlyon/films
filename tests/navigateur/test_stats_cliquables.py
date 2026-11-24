# Stats cliquables (2026-11-24) : chaque chiffre, barre ou segment ouvre les
# films vus filtrés selon la stat, avec autant de films qu'elle en annonce.
# Filtres « réalisé par » et « premier rôle » de la collection.
import json, unittest
from banc import Banc, SITE


class StatsCliquables(Banc):
    def stats(self):
        self.ouvrir()
        self.page.click('.nav-btn[data-page="stats"]')
        self.attendre(lambda: self.js('!!document.querySelector("#gender-balance .gender-repartition")'))

    def filtres(self):
        return self.js('''(() => { const f = state.filters; const o = {};
            for (const [k, v] of Object.entries(f)) if (k !== 'status' && k !== 'ratings' && v) o[k] = v;
            if (f.ratings.size) o.ratings = [...f.ratings]; return o; })()''')

    def arrivee(self):
        self.attendre(lambda: self.js('state.view === "vu" && !document.getElementById("stats-page").classList.contains("active")'))
        return self.js('state.filtered.length')

    def test_cartes_chiffrees(self):
        self.stats()
        cy = self.js('String(new Date().getFullYear())')
        vus = self.js('state.films.filter(f => f.user?.statut === "vu").length')
        self.page.locator('#stats-numbers .stat-card-main').first.click()
        self.assertEqual(self.arrivee(), vus)
        self.assertEqual(self.filtres(), {})
        self.page.go_back()
        self.attendre(lambda: self.js('document.getElementById("stats-page").classList.contains("active")'))
        # Ligne de l'année en cours de la carte « films vus »
        annee = int(self.page.locator('#stats-numbers .stat-card-year .stat-card-year-value').first.text_content())
        self.page.locator('#stats-numbers button.stat-card-year').first.click()
        self.assertEqual(self.arrivee(), annee)
        self.assertEqual(self.filtres(), {'yearvu': cy})

    def test_coups_de_coeur(self):
        self.stats()
        self.page.locator('#stats-numbers .stat-card.hot .stat-card-main').click()
        n = self.arrivee()
        self.assertEqual(self.filtres(), {'ratings': [6]})
        self.assertEqual(n, self.js('state.films.filter(f => f.user?.statut === "vu" && f.user.rating === 6).length'))

    def test_segments_de_la_parite(self):
        self.stats()
        for cle, sel in (('realGenre', 'female'), ('realGenre', 'male'), ('roleGenre', 'female'), ('roleGenre', 'male')):
            seg = self.page.locator('#gender-balance .gender-balance-row').nth(0 if cle == 'realGenre' else 1).locator('.gender-balance-seg.' + sel)
            annonce = int(seg.text_content())
            seg.click()
            self.assertEqual(self.arrivee(), annonce, '%s %s' % (cle, sel))
            self.assertEqual(self.filtres(), {cle: 'f' if sel == 'female' else 'h'})
            self.page.go_back()
            self.attendre(lambda: self.js('document.getElementById("stats-page").classList.contains("active")'))

    def test_note_moyenne_et_repartition(self):
        self.stats()
        self.page.locator('#gender-balance .gender-notes .bar-row').first.click()
        self.arrivee()
        self.assertEqual(self.filtres(), {'realGenre': 'f'})
        self.page.go_back()
        self.attendre(lambda: self.js('document.getElementById("stats-page").classList.contains("active")'))
        # Barre « réalisateurs » de 3★
        attendu = self.js('notesSelonGenreReal(state.films.filter(f => f.user?.statut === "vu")).hommes.repartition[2]')
        self.page.locator('.gender-repartition .note-paire').nth(2).locator('.note-cible').nth(1).click()
        self.assertEqual(self.arrivee(), attendu)
        self.assertEqual(self.filtres(), {'realGenre': 'h', 'ratings': [3]})
        # « Précédent » puis « suivant » : les filtres reviennent
        self.page.go_back()
        self.attendre(lambda: self.js('document.getElementById("stats-page").classList.contains("active")'))
        self.page.go_forward()
        self.arrivee()
        self.assertEqual(self.filtres(), {'realGenre': 'h', 'ratings': [3]})
        self.assertEqual(self.page.input_value('#filter-realgenre'), 'h')

    def test_bilan_heures_femmes_et_lieux(self):
        self.stats()
        annee = self.js('yearReviewYear')
        cartes = self.page.locator('#year-review .year-review-numbers .stat-card')
        cartes.nth(1).click()  # heures
        self.arrivee()
        self.assertEqual(self.filtres(), {'yearvu': annee})
        self.page.go_back()
        self.attendre(lambda: self.js('document.getElementById("stats-page").classList.contains("active")'))
        cartes.nth(5).click()  # réalisés par une femme
        n = self.arrivee()
        self.assertEqual(self.filtres(), {'yearvu': annee, 'realGenre': 'f'})
        self.assertGreater(n, 0)
        self.page.go_back()
        self.attendre(lambda: self.js('document.getElementById("stats-page").classList.contains("active")'))
        lieu = self.page.locator('#year-review .yr-lien').filter(has_text='cinéma').first
        annonce = int(lieu.text_content().split()[-1])
        lieu.click()
        self.assertEqual(self.arrivee(), annonce)
        self.assertEqual(self.filtres(), {'yearvu': annee, 'lieu': 'Cinéma'})

    def test_tour_du_monde(self):
        # Année 2099 (ouverte d'office). Production : France (déjà vue avant),
        # Bhoutan et Mongolie (jamais vus). Réals : nés en France, au Bhoutan,
        # et un lieu de naissance inconnu.
        donnees = json.loads((SITE / 'films.json').read_text(encoding='utf-8'))
        vus = [f for f in donnees['films'] if (f.get('user') or {}).get('statut') == 'vu' and f.get('director')][:3]
        for f, pays, naissance in zip(vus, ['France', 'France · Bhutan', 'Mongolia'], [['France'], ['Bhutan'], ['']]):
            f['country'] = pays
            f['director'] = 'Réal ' + pays
            f['director_countries'] = naissance
            f['user']['date_vue'] = '2099-05'
        corps = json.dumps(donnees, ensure_ascii=False)
        self.ctx.route('**/films.json*', lambda route, req: route.fulfill(body=corps, content_type='application/json'))
        self.stats()
        fait = self.page.locator('#year-review .yr-fact').filter(has_text='tour du monde')
        self.assertEqual(fait.locator('.yr-fact-value').text_content(), '3 pays de production · réals nés dans 2 pays')
        lignes = fait.locator('.yr-fact-ligne')
        self.assertEqual(lignes.nth(0).locator('.yr-lien').all_text_contents(), ['Bhoutan', 'Mongolie'])
        self.assertEqual(lignes.nth(1).locator('.yr-lien').all_text_contents(), ['Bhoutan'])
        self.assertEqual(lignes.nth(2).text_content(), 'naissance inconnue pour 1 film')
        # Chaque virgule reste collée à son pays (pas de virgule en début de ligne)
        self.assertEqual(lignes.nth(0).locator('.yr-lien-bloc').all_text_contents(), ['Bhoutan,', 'Mongolie'])
        lignes.nth(0).locator('.yr-lien').first.click()
        self.assertEqual(self.arrivee(), 1)
        self.assertEqual(self.filtres(), {'yearvu': '2099', 'country': 'Bhoutan'})
        self.page.go_back()
        self.attendre(lambda: self.js('document.getElementById("stats-page").classList.contains("active")'))
        lignes.nth(1).locator('.yr-lien').first.click()
        self.assertEqual(self.arrivee(), 1)
        self.assertEqual(self.filtres(), {'yearvu': '2099', 'dirCountry': 'Bhoutan'})

    def test_filtres_realise_par_et_premier_role(self):
        self.ouvrir()
        self.page.click('.tab[data-view="vu"]')
        self.page.click('#filter-toggle')
        self.page.select_option('#filter-realgenre', 'f')
        self.page.wait_for_timeout(300)
        self.assertEqual(self.js('state.filtered.length'),
                         self.js('state.films.filter(f => f.user?.statut === "vu" && genreReal(f) === "f").length'))
        self.assertEqual(self.js('document.getElementById("filter-badge").textContent'), '1')
        self.page.select_option('#filter-rolegenre', 'f')
        self.page.wait_for_timeout(300)
        self.assertEqual(self.js('state.filtered.length'),
                         self.js('state.films.filter(f => f.user?.statut === "vu" && genreReal(f) === "f" && genreRole(f) === "f").length'))
        self.assertEqual(self.js('document.getElementById("filter-badge").textContent'), '2')
        self.page.click('#filter-reset')
        self.page.wait_for_timeout(300)
        self.assertEqual(self.js('[state.filters.realGenre, state.filters.roleGenre]'), ['', ''])
        self.assertEqual(self.page.input_value('#filter-realgenre'), '')


if __name__ == '__main__':
    unittest.main()
