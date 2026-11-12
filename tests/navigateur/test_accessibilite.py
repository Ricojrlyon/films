# Clavier et lecteurs d'écran, dans un vrai navigateur (TMDB simulé, banc.py)
import unittest
from banc import Banc


class Accessibilite(Banc):
    def derriere(self):
        # La sélection est-elle sur la page cachée derrière la fenêtre ? (après
        # le dernier élément d'une fenêtre, Tab peut aller au navigateur lui-même)
        return self.js('!!document.activeElement.closest(".app")')

    def focus(self):
        return self.js('(() => { const a = document.activeElement; return [a.id, a.className, a.getAttribute("role"), (a.closest(".modal-backdrop") || {}).id || ""]; })()')

    def test_X5_stats_au_clavier(self):
        self.ouvrir()
        self.page.click('.nav-btn[data-page="stats"]')
        self.page.wait_for_timeout(1200)
        # Une ligne de graphique (genre) : atteignable, et Entrée mène aux vus filtrés
        ligne = self.page.locator('#genre-chart .bar-row-clickable').first
        self.assertEqual(ligne.get_attribute('tabindex'), '0')
        self.assertEqual(ligne.get_attribute('role'), 'button')
        ligne.focus()
        ligne.press('Enter')
        self.page.wait_for_timeout(500)
        self.assertEqual(self.js('state.view'), 'vu')
        self.assertTrue(self.js('!!state.filters.genre'))

    def test_X5_film_de_l_annee_avec_Entree(self):
        self.ouvrir()
        self.page.click('.nav-btn[data-page="stats"]')
        self.page.wait_for_timeout(1200)
        film = self.page.locator('#year-best .year-best-film').first  # « ton film de l'année », pas le top 5 du bilan
        film.focus()
        film.press('Enter')
        self.page.wait_for_timeout(500)
        self.assertTrue(self.js('document.getElementById("modal-backdrop").classList.contains("open")'))

    def test_X6_Tab_reste_dans_les_mentions(self):
        self.ouvrir()
        self.js('openLegal()')
        self.page.wait_for_timeout(300)
        for _ in range(12):
            self.page.keyboard.press('Tab')
            self.assertFalse(self.derriere(), 'Tab est allé sur la page derrière : %s' % self.focus())

    def test_X6_fenetre_du_mode_edition(self):
        self.ouvrir()
        self.page.focus('#nav-admin')
        self.page.keyboard.press('Enter')
        self.page.wait_for_timeout(400)
        for _ in range(8):
            self.page.keyboard.press('Tab')
            self.assertFalse(self.derriere(), 'Tab est allé sur la page derrière : %s' % self.focus())
        self.page.keyboard.press('Escape')
        self.page.wait_for_timeout(400)
        self.assertEqual(self.focus()[0], 'nav-admin', 'la sélection n\'est pas revenue au cadenas')

    def test_X6_rematch_par_dessus_la_fiche(self):
        self.ouvrir()
        self.js('admin.active = true; document.body.classList.add("admin-mode")')  # mode édition simulé, aucun token
        self.page.locator('#grid .card').first.click()
        self.attendre(lambda: self.js('!!document.querySelector(".edit-rematch")'))
        self.page.focus('.edit-rematch')
        self.page.keyboard.press('Enter')
        self.page.wait_for_timeout(600)
        for _ in range(8):
            self.page.keyboard.press('Tab')
            self.assertFalse(self.derriere(), 'Tab est allé sur la page derrière : %s' % self.focus())
            self.assertNotEqual(self.focus()[3], 'modal-backdrop', 'Tab est allé sur la fiche sous le re-match')
        self.page.keyboard.press('Escape')
        self.page.wait_for_timeout(400)
        self.assertIn('edit-rematch', self.focus()[1], 'la sélection n\'est pas revenue au bouton')
        self.assertEqual(self.js('document.body.style.overflow'), 'hidden', 'la page sous la fiche est redevenue défilable')

    def test_fiche_rend_la_selection_a_sa_carte(self):
        # Comportement d'avant à garder : la page n'est plus inerte à temps pour recevoir la sélection
        self.ouvrir()
        carte = self.page.locator('#grid .card').nth(2)
        carte.focus()
        carte.press('Enter')
        self.page.wait_for_timeout(500)
        self.page.keyboard.press('Escape')
        self.page.wait_for_timeout(300)
        self.assertTrue(self.js('document.activeElement === document.querySelectorAll("#grid .card")[2]'), self.focus())

    def test_X7_cartes_et_bascules(self):
        self.ouvrir()
        self.assertEqual(self.page.locator('#grid .card').first.get_attribute('role'), 'button')
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        self.assertEqual(self.page.get_attribute('.tab[data-view="vu"]', 'aria-pressed'), 'true')
        self.assertEqual(self.page.get_attribute('.tab[data-view="a_voir"]', 'aria-pressed'), 'false')

    def test_X11_etiquettes_du_formulaire(self):
        self.ouvrir()
        self.js('admin.active = true; document.body.classList.add("admin-mode")')
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        self.page.locator('#grid .card').first.click()
        self.attendre(lambda: self.js('!!document.querySelector(".edit-form")'))
        for nom in ('lieu', 'année vue', 'mois vu'):
            self.assertEqual(self.page.locator('#modal-body').get_by_label(nom, exact=True).count(), 1, nom)

    def test_X13_filmographie_au_clavier(self):
        self.ouvrir()
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        self.page.locator('#grid .card').first.click()
        self.attendre(lambda: self.js('!!document.querySelector("#modal-body .name-link")'))
        self.page.focus('#modal-body .name-link')
        self.page.keyboard.press('Enter')
        self.page.wait_for_timeout(600)
        self.assertEqual(self.focus()[0], 'person-back')
        self.page.keyboard.press('Enter')  # « ← retour »
        self.page.wait_for_timeout(600)
        self.assertIn('tab', self.focus()[1], 'sélection perdue au retour : %s' % self.focus())


if __name__ == '__main__':
    unittest.main()
