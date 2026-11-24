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

    def test_P1_note_moyenne_realisatrices_et_realisateurs(self):
        self.ouvrir()
        self.page.click('.nav-btn[data-page="stats"]')
        self.attendre(lambda: self.js('!!document.querySelector("#gender-balance .gender-notes")'))
        valeurs = self.js('[...document.querySelectorAll("#gender-balance .gender-notes .bar-row")].map(r => [r.querySelector(".bar-label").textContent, r.querySelector(".bar-value").textContent])')
        attendu = self.js('''(() => { const n = notesSelonGenreReal(state.films.filter(f => f.user?.statut === "vu"));
            return [["réalisatrices", n.femmes.note.toFixed(1).replace(".", ",")], ["réalisateurs", n.hommes.note.toFixed(1).replace(".", ",")]]; })()''')
        self.assertEqual(valeurs, attendu)
        legende = self.js('document.querySelector("#gender-balance .gender-notes .gender-balance-legend").textContent')
        self.assertIn('films notés', legende)
        # Le texte suit les notes affichées : « même note » seulement si elles sont égales
        if valeurs[0][1] == valeurs[1][1]:
            self.assertIn('même note moyenne', legende)
        else:
            self.assertNotIn('même note moyenne', legende)

    def test_P2_repartition_des_notes_realisatrices_et_realisateurs(self):
        self.ouvrir()
        self.page.click('.nav-btn[data-page="stats"]')
        self.attendre(lambda: self.js('!!document.querySelector("#gender-balance .gender-repartition")'))
        self.assertEqual(self.js('[...document.querySelectorAll(".gender-repartition .note-paire-label")].map(e => e.textContent)'),
                         ['1★', '2★', '3★', '4★', '5★', '❤'])
        # Nombres affichés : la part de chaque note dans les films notés de chaque côté
        affiches = self.js('[...document.querySelectorAll(".gender-repartition .note-barres")].map(b => [...b.querySelectorAll("span")].map(s => s.textContent))')
        attendu = self.js('''(() => { const n = notesSelonGenreReal(state.films.filter(f => f.user?.statut === "vu"));
            const p = (x, i) => { const v = Math.round(x.repartition[i] / x.n * 100); return v === 0 && x.repartition[i] ? "<1" : String(v); };
            return n.femmes.repartition.map((_, i) => [p(n.femmes, i), p(n.hommes, i)]); })()''')
        self.assertEqual(affiches, attendu)
        # Chaque côté fait environ 100 %
        for cote in (0, 1):
            total = sum(int(x[cote].replace('<1', '0')) for x in affiches)
            self.assertTrue(97 <= total <= 103, total)
        # La plus haute barre prend toute la hauteur
        self.assertEqual(self.js('Math.max(...[...document.querySelectorAll(".note-barre")].map(b => parseFloat(b.style.height)))'), 100)
        self.assertIn('réalisatrices : ', self.js('document.querySelector(".gender-repartition .note-cible").getAttribute("aria-label")'))

    def bilan(self, donnees=None):
        if donnees is not None:
            corps = json.dumps(donnees, ensure_ascii=False)
            self.ctx.route('**/films.json*', lambda route, req: route.fulfill(body=corps, content_type='application/json'))
        self.ouvrir()
        self.page.click('.nav-btn[data-page="stats"]')
        self.attendre(lambda: self.js('!!document.querySelector("#year-review .year-review-top")'))
        return self.js('''[...document.querySelectorAll("#year-review .modal-section-label")].map(l => [l.textContent,
            [...l.nextElementSibling.querySelectorAll(".year-best-title")].map(e => e.textContent)])''')

    def test_Y1_flop_5_du_bilan(self):
        # Année 2099 (la plus récente, ouverte d'office) : 7 films notés
        donnees = json.loads((SITE / 'films.json').read_text(encoding='utf-8'))
        vus = [f for f in donnees['films'] if (f.get('user') or {}).get('statut') == 'vu'][:7]
        for i, (f, note, tmdb) in enumerate(zip(vus, [1, 2, 3, 4, 5, 6, 3], [5, 6, 8, 7, 7, 9, 4])):
            f['title'] = 'F%d' % i
            f['tmdb_rating'] = tmdb
            f['user'].update({'date_vue': '2099-0%d' % (i + 1), 'rating': note, 'favorite': note == 6})
        sections = self.bilan(donnees)
        self.assertEqual(sections, [['top 5 de 2099', ['F5', 'F4', 'F3', 'F2', 'F6']], ['flop 2 de 2099', ['F0', 'F1']]])

    def test_Y1_flop_5_jamais_dans_le_top(self):
        sections = dict(self.bilan())
        flop = [k for k in sections if k.startswith('flop')]
        self.assertEqual(len(flop), 1, list(sections))
        self.assertTrue(flop[0].startswith('flop 5 de '), flop)
        top = sections[[k for k in sections if k.startswith('top')][0]]
        self.assertFalse(set(top) & set(sections[flop[0]]))

    def test_Y1_pas_de_flop_sous_6_films_notes(self):
        donnees = json.loads((SITE / 'films.json').read_text(encoding='utf-8'))
        vus = [f for f in donnees['films'] if (f.get('user') or {}).get('statut') == 'vu'][:5]
        for i, f in enumerate(vus):
            f['user'].update({'date_vue': '2099-01', 'rating': 3, 'favorite': False})
        sections = self.bilan(donnees)
        self.assertEqual([k for k, _ in sections], ['top 5 de 2099'])

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
