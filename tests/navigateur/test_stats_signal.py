# Page stats en style « signal » (2026-11-24) : vert acide, rayures, sections
# numérotées, sur le fond du site. Depuis le même jour, tout le site a ce
# style (haut de page, collection, fiches : voir aussi test_site_signal.py).
import unittest
from banc import Banc

FOND = 'rgb(22, 31, 37)'      # #161f25, le fond du site
ACIDE = 'rgb(200, 255, 58)'   # #c8ff3a
CREME = 'rgb(231, 223, 190)'  # #e7dfbe


class StatsSignal(Banc):
    def stats(self):
        self.ouvrir()
        self.page.click('.nav-btn[data-page="stats"]')
        self.attendre(lambda: self.js('document.getElementById("stats-page").classList.contains("active")'))
        self.page.wait_for_timeout(300)

    def style(self, sel, prop):
        return self.js('getComputedStyle(document.querySelector(%r)).%s' % (sel, prop))

    def haut_signal(self):
        self.assertEqual(self.style('.wordmark', 'color'), ACIDE)
        self.assertEqual(self.style('.wordmark', 'backgroundColor'), 'rgba(0, 0, 0, 0)')
        self.assertEqual(self.style('.nav-btn.active', 'backgroundColor'), ACIDE)

    def test_haut_de_page_en_style_signal_partout(self):
        # Avant le 2026-11-24 au soir : sur la page stats seulement
        self.ouvrir()
        self.assertFalse(self.js('document.body.classList.contains("vue-stats")'))
        self.haut_signal()
        self.page.click('.nav-btn[data-page="stats"]')
        self.page.wait_for_timeout(300)
        self.assertTrue(self.js('document.body.classList.contains("vue-stats")'))
        self.haut_signal()
        # Les rubans du haut de la collection laissent la place à ceux des stats
        self.assertEqual(self.style('.rubans-haut', 'display'), 'none')
        # Retour à la collection par le bouton (le site recule d'une étape),
        # puis « suivant » (les stats) et « précédent » (la collection)
        self.page.click('.nav-btn[data-page="collection"]')
        self.page.wait_for_timeout(400)
        self.assertFalse(self.js('document.body.classList.contains("vue-stats")'))
        self.haut_signal()
        self.assertNotEqual(self.style('.rubans-haut', 'display'), 'none')
        self.page.go_forward()
        self.attendre(lambda: self.js('document.body.classList.contains("vue-stats")'))
        self.assertTrue(self.js('document.body.classList.contains("vue-stats")'))
        self.page.go_back()
        self.attendre(lambda: not self.js('document.body.classList.contains("vue-stats")'))
        self.page.wait_for_timeout(300)
        self.haut_signal()

    def test_fond_du_site_garde_et_accent_vert(self):
        self.stats()
        self.assertEqual(self.style('body', 'backgroundColor'), FOND)
        self.assertEqual(self.js('getComputedStyle(document.getElementById("stats-page")).getPropertyValue("--warm").trim()'), '#c8ff3a')
        self.assertIn('repeating-linear-gradient', self.style('#genre-chart .bar-fill', 'backgroundImage'))
        # Une stat cliquée mène à la collection, au même vert acide
        self.page.locator('#genre-chart .bar-row').first.click()
        self.attendre(lambda: self.js('state.view === "vu" && !document.body.classList.contains("vue-stats")'))
        self.page.wait_for_timeout(500)  # fin de la transition de l'onglet
        self.assertEqual(self.js('getComputedStyle(document.querySelector(".tab.active")).backgroundColor'), ACIDE)

    def test_une_fiche_ouverte_depuis_les_stats_en_style_signal(self):
        self.stats()
        self.page.locator('#year-best .year-best-film').first.click()
        self.attendre(lambda: self.js('document.getElementById("modal-backdrop").classList.contains("open")'))
        self.assertEqual(self.js('getComputedStyle(document.getElementById("modal-content")).getPropertyValue("--warm").trim()'), '#c8ff3a')
        if self.largeur > 760:  # sur téléphone, la fiche prend tout l'écran, sans cadre
            self.assertEqual(self.style('#modal-content', 'borderTopColor'), ACIDE)

    def test_bandeau_et_cartes(self):
        self.stats()
        vus = self.js('state.films.filter(f => f.user?.statut === "vu").length')
        self.assertEqual(self.js('document.getElementById("stats-hero-nombre").textContent'), str(vus))
        self.assertIn('%d films vus' % vus, self.js('document.getElementById("stats-ticker").textContent'))
        self.assertEqual(self.js('document.querySelector(".stats-rubans").getAttribute("aria-hidden")'), 'true')
        self.assertIn(',', self.js('document.querySelectorAll("#stats-numbers .stat-card-value")[2].textContent'), 'note moyenne à la française')
        self.assertEqual(self.js('document.querySelectorAll(".stats-page.active .chart-section").length'), 13)

    def test_heatmap_lisible(self):
        self.stats()
        pires = self.js('''(() => {
          const lum = s => { const [r, g, b] = s.match(/\\d+/g).slice(0, 3).map(v => +v / 255)
              .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
          return [...document.querySelectorAll('#heatmap .heatmap-cell-clickable')].map(c => {
            const s = getComputedStyle(c), a = lum(s.color), b = lum(s.backgroundColor);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          }).sort((x, y) => x - y).slice(0, 3); })()''')
        self.assertTrue(pires, 'aucune case')
        self.assertGreaterEqual(pires[0], 4.5, pires)


    # ---- version « au maximum » (2026-11-24)
    def test_bandeau_glitch_autocollant_et_record(self):
        self.stats()
        vus = self.js('state.films.filter(f => f.user?.statut === "vu").length')
        self.assertEqual(self.js('document.getElementById("stats-hero-nombre").dataset.t'), str(vus))
        self.assertEqual(self.js('document.getElementById("stats-auto-n").textContent'), str(vus))
        self.assertIn('%d films vus' % vus, self.js('document.getElementById("stats-auto-cercle").textContent'))
        record = self.js('''(() => { const c = new Map(); state.films.filter(f => f.user?.statut === "vu" && /^\d{4}/.test(f.user.date_vue || ""))
            .forEach(f => c.set(f.user.date_vue.slice(0, 4), (c.get(f.user.date_vue.slice(0, 4)) || 0) + 1));
            return [...c].sort((a, b) => b[1] - a[1])[0][0]; })()''')
        self.assertEqual(self.js('document.getElementById("stats-etoile-an").textContent'), record)
        self.assertTrue(self.js('document.getElementById("stats-ticker-2").textContent.includes("films en")'))

    def test_polaroids_petits_et_flop_sans_censure(self):
        self.stats()
        largeurs = self.js('[...document.querySelectorAll("#year-review .year-review-top .year-best-film")].map(e => e.getBoundingClientRect().width)')
        self.assertTrue(largeurs and max(largeurs) <= 150, largeurs)
        self.assertEqual(self.js('document.querySelectorAll("#year-review .censure").length'), 0)
        self.assertEqual(self.js('getComputedStyle(document.querySelector(".year-review-flop .year-best-poster"), "::after").content'), '"flop"')
        self.assertEqual(self.style('.year-review-flop .year-best-poster', 'filter'), 'none', 'flop en couleurs normales')

    def test_pellicule_de_tous_les_coups_de_coeur(self):
        self.stats()
        attendu = self.js('''(() => { const g = new Map();
            for (const f of state.films) { if (f.user?.statut !== "vu" || !f.user.rating) continue;
              const dv = f.user.date_vue || ""; const y = dv.startsWith("before-") ? "avant " + dv.slice(7) : /^\d{4}/.test(dv) ? dv.slice(0, 4) : null;
              if (!y) continue; if (!g.has(y)) g.set(y, { c: 0 }); if (f.user.favorite) g.get(y).c++; }
            return [...g.values()].reduce((s, x) => s + Math.max(x.c, 1), 0); })()''')
        self.assertEqual(self.js('document.querySelectorAll("#year-best .year-best-film").length'), attendu)
        annees = self.js('[...document.querySelectorAll("#year-best .pellicule-an")].map(e => e.textContent)')
        self.assertEqual(annees[0], self.js('String(new Date().getFullYear())'))
        self.assertTrue(annees[-1].startswith('avant'), annees)
        self.assertEqual(self.js('document.getElementById("year-best").closest(".chart-section").querySelector(".chart-title").textContent'), 'tes coups de cœur')

    def test_parite_anneaux_et_duel(self):
        self.stats()
        p = self.js('[...document.querySelectorAll(".parite-anneaux .anneau-arc")].map(c => parseFloat(c.style.getPropertyValue("--p")))')
        attendu = self.js('''(() => { const vus = state.films.filter(f => f.user?.statut === "vu");
            const f = vus.filter(x => genreReal(x) === "f").length, h = vus.filter(x => genreReal(x) === "h").length, u = vus.filter(x => x.director && genreReal(x) === "").length;
            return Math.round(f / (f + h + u) * 1000) / 10; })()''')
        self.assertEqual(len(p), 2)
        self.assertAlmostEqual(p[0], attendu, places=1)
        self.assertEqual(self.js('document.querySelectorAll(".gender-notes .duel-vs").length'), 1)
        self.assertNotEqual(self.style('.gender-notes .bar-row.note-f', 'backgroundColor'), self.style('.gender-notes .bar-row.note-h', 'backgroundColor'))


class StatsSignalTelephone(StatsSignal):
    largeur = 375

    def test_rien_qui_redessine_en_continu_sur_telephone(self):
        # Seules restent des animations que le téléphone déplace sans redessiner
        # (transform, opacity), et le glitch du grand nombre du haut
        self.stats()
        lourdes = self.js('''document.getAnimations().filter(a => a.playState === 'running' && a.effect.getTiming().iterations === Infinity).map(a => {
            const props = new Set(); for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k))
              if (!['offset', 'easing', 'composite', 'computedOffset', 'transform', 'opacity'].includes(p)) props.add(p);
            return props.size || a.animationName === 'stats-holo' ? a.animationName : null; }).filter(Boolean)''')
        self.assertEqual(lourdes, ['stats-glitch'], lourdes)
        self.assertEqual(self.js('getComputedStyle(document.body, "::before").display'), 'none', 'grain')


if __name__ == '__main__':
    unittest.main()
