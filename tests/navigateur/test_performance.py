# Performance visible dans le navigateur (TMDB simulé, banc.py)
import unittest
from banc import Banc

# Avant app.js : somme des décalages de mise en page (CLS), quelle qu'en soit la cause
OBSERVATEUR = '''
window.__cls = 0;
new PerformanceObserver(l => { for (const e of l.getEntries()) window.__cls += e.value; })
  .observe({ type: 'layout-shift', buffered: true });
'''


class Performance(Banc):
    def test_P3_images_de_la_fiche_a_la_taille_affichee(self):
        self.ouvrir()
        self.page.click('.tab[data-view="vu"]')
        self.page.wait_for_timeout(300)
        self.page.locator('#grid .card').first.click()
        self.attendre(lambda: self.js('!!document.querySelector(".modal-poster")'))
        fond = self.js('document.getElementById("modal-bg").style.backgroundImage')
        affiche = self.js('document.querySelector(".modal-poster").style.backgroundImage')
        self.assertNotIn('/w1280/', fond)
        self.assertNotIn('/w500/', affiche)
        self.assertIn('/w342/', affiche)  # celle des cartes, déjà dans le cache du navigateur

    def test_P7_un_seul_ecouteur_sur_le_graphique_par_mois(self):
        self.ouvrir()
        self.page.click('.nav-btn[data-page="stats"]')
        self.page.wait_for_timeout(1000)
        poses = self.js('''(() => {
          const svg = document.getElementById("months-chart"); let n = 0;
          const vrai = svg.addEventListener.bind(svg);
          svg.addEventListener = (t, f, o) => { if (t === "mouseleave") n++; vrai(t, f, o); };
          for (let i = 0; i < 5; i++) renderMonthsChart(); // 5 changements de largeur
          return n; })()''')
        self.assertEqual(poses, 0, '%d écouteurs ajoutés en 5 dessins' % poses)


class PerformanceTelephone(Banc):
    largeur = 375

    def test_P5_la_page_ne_saute_pas_au_chargement(self):
        self.ctx.add_init_script(OBSERVATEUR)
        self.ctx.add_init_script('window.__regles.push({ motif: "films.json", ms: 1000 })')
        self.page.goto(self.base + '/index.html')
        self.attendre(lambda: self.js('state.films.length > 0'))
        self.page.wait_for_timeout(1500)
        cls = self.js('window.__cls')
        self.assertLess(cls, 0.1, 'CLS %.3f (au-delà de 0,1 : « à améliorer »)' % cls)


if __name__ == '__main__':
    unittest.main()
