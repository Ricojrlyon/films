# « Ton année en films » (2026-11-24) : écrans plein écran façon stories,
# ouverts par le bouton du bilan de l'année (TMDB simulé, banc.py).
import unittest
from banc import Banc


class TonAnnee(Banc):
    def ouvrir_annee(self, duree=None):
        self.ouvrir()
        if duree:
            self.js('ANNEE_DUREE = %d' % duree)
        self.page.click('.nav-btn[data-page="stats"]')
        self.attendre(lambda: self.js('!!document.getElementById("annee-ouvrir")'))
        self.page.click('#annee-ouvrir')
        self.attendre(lambda: self.js('document.getElementById("annee-backdrop").classList.contains("open")'))

    def ecran(self):
        return self.js('annee && annee.i')

    def ouverte(self):
        return self.js('document.getElementById("annee-backdrop").classList.contains("open")')

    def test_dix_ecrans_et_les_chiffres_du_bilan(self):
        self.ouvrir_annee()
        self.assertEqual(self.js('annee.ecrans.length'), 10)
        self.assertEqual(self.js('document.querySelectorAll("#annee-barres i").length'), 10)
        # Les chiffres de l'écran « films » sont ceux du bilan de la même année
        films = self.js('annee.d.films')
        self.assertEqual(films, self.js('state.films.filter(f => f.user?.statut === "vu" && (f.user.date_vue || "").startsWith(yearReviewYear)).length'))
        self.page.click('#annee-suiv')
        self.page.wait_for_timeout(1500)  # le nombre a fini de défiler
        self.assertIn('%d films vus en' % films, self.js('document.querySelector(".annee-etiquette").textContent'))
        self.assertIn('%d films vus' % films, self.js('document.getElementById("annee-annonce").textContent'))
        self.assertEqual(self.erreurs, [])

    def test_aucun_blocage_de_securite_sur_les_dix_ecrans(self):
        violations = []
        self.page.on('console', lambda m: 'Content Security Policy' in m.text and violations.append(m.text[:120]))
        self.ouvrir_annee()
        for _ in range(10):
            self.page.click('#annee-suiv')
            self.page.wait_for_timeout(200)
        self.assertEqual(violations, [])
        self.assertEqual(self.erreurs, [])

    def test_navigation_toucher_fleches_echap(self):
        self.ouvrir_annee()
        self.page.click('#annee-suiv')
        self.page.click('#annee-suiv')
        self.assertEqual(self.ecran(), 2)
        self.page.click('#annee-prec')
        self.assertEqual(self.ecran(), 1)
        self.page.keyboard.press('ArrowRight')
        self.page.keyboard.press('ArrowRight')
        self.assertEqual(self.ecran(), 3)
        self.page.keyboard.press('ArrowLeft')
        self.assertEqual(self.ecran(), 2)
        self.page.keyboard.press('Escape')
        self.assertFalse(self.ouverte())
        self.assertEqual(self.js('document.activeElement.id'), 'annee-ouvrir', 'la sélection revient au bouton')
        self.assertEqual(self.js('document.body.style.overflow'), '')

    def test_precedent_ferme_et_suivant_rouvre(self):
        self.ouvrir_annee()
        self.page.go_back()
        self.attendre(lambda: not self.ouverte())
        self.assertFalse(self.ouverte())
        self.assertTrue(self.js('document.getElementById("stats-page").classList.contains("active")'))
        self.page.go_forward()
        self.attendre(self.ouverte)
        self.assertTrue(self.ouverte())

    def test_avance_seule_et_pause(self):
        self.ouvrir_annee(duree=500)
        self.attendre(lambda: self.ecran() >= 2, 5)
        self.assertGreaterEqual(self.ecran(), 2, 'les écrans avancent seuls')
        self.page.keyboard.press(' ')
        fige = self.ecran()
        self.page.wait_for_timeout(1500)
        self.assertEqual(self.ecran(), fige, 'en pause, rien ne bouge')
        self.assertEqual(self.page.get_attribute('#annee-pause', 'aria-label'), 'reprendre')
        # Le dernier écran ne passe pas plus loin, et ses boutons marchent
        self.js('anneePause(false); anneeMontrer(annee.ecrans.length - 1)')
        self.page.wait_for_timeout(1200)
        self.assertEqual(self.ecran(), 9)
        self.page.click('[data-annee-action="revoir"]')
        self.assertEqual(self.ecran(), 0)
        self.js('anneeMontrer(annee.ecrans.length - 1)')
        self.page.click('[data-annee-action="fermer"]')
        self.assertFalse(self.ouverte())

    def test_reduire_les_animations(self):
        self.page.emulate_media(reduced_motion='reduce')
        self.ouvrir_annee(duree=300)
        self.page.click('#annee-suiv')
        self.page.wait_for_timeout(1500)
        self.assertEqual(self.ecran(), 1, 'pas d\'avancée automatique')
        # Tout est en place d'emblée : nombres finaux, rien d'invisible
        self.assertEqual(self.js('document.querySelector(".annee-etiquette .annee-compte").textContent'), str(self.js('annee.d.films')))
        self.assertEqual(self.js('getComputedStyle(document.querySelector(".annee-etiquette")).opacity'), '1')

    def test_glisser_sur_telephone(self):
        self.ouvrir_annee()
        glisse = '''dx => { const c = document.getElementById('annee-cadre');
            const t = (x) => new Touch({ identifier: 1, target: c, clientX: x, clientY: 300 });
            c.dispatchEvent(new TouchEvent('touchstart', { touches: [t(250)], bubbles: true }));
            c.dispatchEvent(new TouchEvent('touchend', { changedTouches: [t(250 + dx)], bubbles: true, cancelable: true })); }'''
        self.page.evaluate(glisse, -120)
        self.assertEqual(self.ecran(), 1)
        self.page.evaluate(glisse, 120)
        self.assertEqual(self.ecran(), 0)


class TonAnneeTelephone(TonAnnee):
    largeur = 375


if __name__ == '__main__':
    unittest.main()
