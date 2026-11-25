# Performance visible dans le navigateur (TMDB simulé, banc.py)
import unittest
from banc import Banc

# Avant app.js : somme des décalages de mise en page (CLS), quelle qu'en soit la cause
OBSERVATEUR = '''
window.__cls = 0;
new PerformanceObserver(l => { for (const e of l.getEntries()) window.__cls += e.value; })
  .observe({ type: 'layout-shift', buffered: true });
'''
# Haut et hauteur des grandes zones du haut de la collection
RANGEMENT = '''(() => { const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)]; };
  return { 'haut de page': r('.masthead'), barre: r('.filter-bar'), bandeau: r('#bandeau-page'), films: r('#grid') }; })()'''


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

    def test_P8_le_rangement_ne_depend_pas_des_polices(self):
        # Sur GitHub (Linux), la page s'affichait d'abord avec les polices de
        # secours : à l'arrivée de celles du site, le menu du haut passait sous
        # le nom et « découvrir » changeait de ligne, tout descendait (CLS
        # 0,165 sur téléphone). Le rangement est maintenant le même sans elles.
        largeurs = (320, 375, 430, 520, 768, 1280)

        def mesurer():
            out = {}
            for l in largeurs:
                self.page.set_viewport_size({'width': l, 'height': 900})
                self.page.goto(self.base + '/index.html')
                self.attendre(lambda: self.js('state.films.length > 0'))
                self.page.evaluate('document.fonts.ready.then(() => 0)')
                self.page.wait_for_timeout(200)
                out[l] = self.js(RANGEMENT)
            return out
        avec = mesurer()
        self.ctx.route('**/fonts/*.woff2', lambda route, req: route.abort())
        sans = mesurer()
        self.assertEqual(self.js('[...document.fonts].filter(f => f.status === "loaded").length'), 0, 'polices encore chargées')
        for l in largeurs:
            self.assertEqual(avec[l], sans[l], '%d px' % l)

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
