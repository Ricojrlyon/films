# Parcours de bout en bout, comme un utilisateur (TMDB et GitHub simulés, banc.py) :
# démarrage, fiche et bouton précédent, recherche, enregistrement en mode
# édition avec un conflit venu d'un autre appareil.
import unittest
from banc import Banc


class Parcours(Banc):
    def setUp(self):
        super().setUp()
        self.violations = []
        self.page.on('console', lambda m: 'Content Security Policy' in m.text and self.violations.append(m.text[:120]))

    def test_demarrage_et_tous_les_ecrans(self):
        self.ouvrir()
        self.assertGreater(self.page.locator('#grid .card').count(), 0)
        for onglet in ('vu', 'discover', 'reco', 'a_voir'):
            self.page.click('.tab[data-view="%s"]' % onglet)
            self.page.wait_for_timeout(800)
        self.page.click('.nav-btn[data-page="stats"]')
        self.page.wait_for_timeout(1000)
        self.assertTrue(self.js('document.querySelectorAll("#stats-page .chart-section").length > 10'))
        self.js('openLegal()')
        self.page.keyboard.press('Escape')
        self.assertEqual(self.violations, [], 'blocages par la politique de sécurité')

    def test_fiche_filmographie_et_precedent(self):
        self.ouvrir()
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        self.page.locator('#grid .card').first.click()
        self.attendre(lambda: self.js('!!document.querySelector("#modal-body .name-link")'))
        film = self.js('openModalCtx.id')
        self.page.click('#modal-body .name-link')
        self.attendre(lambda: self.js('state.view === "person"'))
        self.page.go_back()
        self.attendre(lambda: self.js('document.getElementById("modal-backdrop").classList.contains("open")'))
        self.assertEqual(self.js('openModalCtx.id'), film, 'la fiche d\'où l\'on venait')
        self.page.go_back()
        self.page.wait_for_timeout(500)
        self.assertFalse(self.js('document.getElementById("modal-backdrop").classList.contains("open")'))
        self.assertEqual(self.js('state.view'), 'vu')

    def test_recherche_dans_la_collection(self):
        self.ouvrir()
        titre = self.js('state.films.find(f => f.user?.statut === "a_voir").title')
        self.page.fill('#search', titre.upper() + ' ')  # majuscules, espace finale du clavier de téléphone
        self.page.wait_for_timeout(500)
        self.assertIn(titre, self.titres())


class ParcoursEdition(Banc):
    def test_enregistrer_une_note_malgre_un_conflit(self):
        self.ouvrir_en_ligne()
        self.assertTrue(self.deverrouiller(), 'déverrouillage par l\'interface')
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        ids = self.js('[...document.querySelectorAll("#grid .card")].slice(0, 2).map(c => c.dataset.filmId)')
        # Un autre appareil note le 2e film pendant ce temps : la version change
        self.page.evaluate('id => __gh.ailleurs(id, 1)', ids[1])
        # Ici, on change la note du 1er film par la fiche (recliquer sa note actuelle l'enlèverait)
        note = 4 if self.page.evaluate('id => state.films.find(f => f.id === id).user.rating', ids[0]) == 5 else 5
        self.page.locator('#grid .card').first.click()
        self.attendre(lambda: self.js('!!document.querySelector(".edit-form .edit-save")'))
        self.page.click('.edit-form .rating-chip[data-rating="%d"]' % note)
        self.page.click('.edit-form .edit-save')
        self.attendre(lambda: self.js('__gh.journal.includes(200)'))
        self.page.wait_for_timeout(500)
        self.assertEqual(self.js('__gh.journal'), [409, 200], 'conflit puis fusion et nouvel envoi')
        self.assertEqual(self.page.evaluate('id => __gh.film(id).user.rating', ids[0]), note, 'la note faite ici')
        self.assertEqual(self.page.evaluate('id => __gh.film(id).user.rating', ids[1]), 1, 'la note faite ailleurs')
        self.assertFalse(self.js('document.getElementById("modal-backdrop").classList.contains("open")'))

    def noter(self, rang, note):
        # Fiche du film de la grille à ce rang, nouvelle note, « enregistrer »
        avant = len(self.js('__gh.journal'))
        self.page.locator('#grid .card').nth(rang).click()
        self.attendre(lambda: self.js('!!document.querySelector(".edit-form .edit-save")'))
        self.page.click('.edit-form .rating-chip[data-rating="%d"]' % note)
        self.page.click('.edit-form .edit-save')
        self.attendre(lambda: self.js('__gh.journal.includes(200, %d)' % avant))
        self.page.wait_for_timeout(500)

    def test_D1_une_note_faite_ailleurs_n_est_pas_ecrasee_plus_tard(self):
        # Onglet resté ouvert : on note A, un autre appareil renote A, puis on note B ici
        self.ouvrir_en_ligne()
        self.assertTrue(self.deverrouiller())
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        ids = self.js('[...document.querySelectorAll("#grid .card")].slice(0, 2).map(c => c.dataset.filmId)')
        notes = self.js('[...document.querySelectorAll("#grid .card")].slice(0, 2).map(c => state.films.find(f => f.id === c.dataset.filmId).user.rating)')
        self.noter(0, 4 if notes[0] == 5 else 5)
        self.page.evaluate('id => __gh.ailleurs(id, 1)', ids[0])
        self.noter(1, 4 if notes[1] == 5 else 5)
        self.assertEqual(self.page.evaluate('id => __gh.film(id).user.rating', ids[0]), 1,
                         'la note faite sur l\'autre appareil a été écrasée')

    def test_mauvais_code(self):
        self.ouvrir_en_ligne()
        self.page.evaluate('''async () => localStorage.setItem('films_encrypted_pat',
            await encryptWithCode('github_pat_FAUXJETONDETEST', 'bon code'))''')
        self.page.reload()
        self.attendre(lambda: self.js('state.films.length > 0'))
        self.page.click('#nav-admin')
        self.page.wait_for_timeout(300)
        self.page.fill('#admin-unlock-code', 'mauvais')
        self.page.click('#admin-unlock-btn')
        self.attendre(lambda: self.js('/code incorrect/.test(document.querySelector("#admin-view-unlock .admin-err").textContent)'))
        self.assertFalse(self.js('admin.active'))
        self.assertEqual(self.page.input_value('#admin-unlock-code'), 'mauvais', 'un mauvais code reste dans sa case, pour le corriger')


if __name__ == '__main__':
    unittest.main()
