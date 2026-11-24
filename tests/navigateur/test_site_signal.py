# Tout le site en style « signal » (2026-11-24) : haut de page et couleurs,
# rubans, bandeau de chaque page, quatre zones, infos du film posées sur
# l'affiche, étiquettes à l'intérieur des affiches, fiche en duel.
import json, unittest
from banc import Banc

ACIDE = 'rgb(200, 255, 58)'
# Étiquettes posées sur une affiche, et le contrôle « rien ne dépasse »
HORS_AFFICHE = '''(() => { const hors = []; document.querySelectorAll('#grid .card').forEach(c => {
  const p = c.querySelector('.poster').getBoundingClientRect();
  c.querySelectorAll('.rating-badge, .a-voir-badge, .canal-badge, .lyon-badge, .tmdb-in-collec, .meta').forEach(b => {
    const r = b.getBoundingClientRect();
    if (r.left < p.left - 0.5 || r.right > p.right + 0.5 || r.top < p.top - 0.5 || r.bottom > p.bottom + 0.5) hors.push(b.className); }); });
  return hors; })()'''


class SiteSignal(Banc):
    def bandeau(self):
        return self.js('''(() => { const b = document.getElementById('bandeau-page'), t = id => document.getElementById(id).textContent;
          return { cache: b.hidden || getComputedStyle(b).display === 'none', gros: t('bandeau-gros'), glitch: document.getElementById('bandeau-gros').dataset.t,
            coords: t('bandeau-coords'), sous: t('bandeau-sous'), n: t('bandeau-auto-n'), l: t('bandeau-auto-l'), e1: t('bandeau-e1'), e2: t('bandeau-e2'),
            couleur: b.style.getPropertyValue('--bandeau-couleur') }; })()''')

    def test_couleurs_et_rubans_sur_la_collection(self):
        self.ouvrir()
        self.assertEqual(self.js('getComputedStyle(document.documentElement).getPropertyValue("--warm").trim()'), '#c8ff3a')
        self.assertEqual(self.js('getComputedStyle(document.querySelector(".tab.active")).backgroundColor'), ACIDE)
        self.assertEqual(self.js('getComputedStyle(document.querySelector(".wordmark")).color'), ACIDE)
        vus = self.js('state.films.filter(f => f.user?.statut === "vu").length')
        self.assertIn('%s films vus' % self.js('(%d).toLocaleString("fr-FR")' % vus), self.js('document.getElementById("ruban-chiffres").textContent'))
        dernier = self.js('''(() => { const v = state.films.filter(f => f.user?.statut === "vu" && /^\\d{4}/.test(f.user.date_vue || ""))
            .sort((a, b) => String(b.user.date_vue).localeCompare(String(a.user.date_vue)))[0]; return displayTitle(v.id, v.title); })()''')
        self.assertTrue(self.js('document.getElementById("ruban-derniers").textContent.startsWith("derniers vus ▸ " + %s)' % json.dumps(dernier)))
        self.assertEqual(self.js('document.querySelector(".rubans-haut").getAttribute("aria-hidden")'), 'true')

    def test_bandeau_de_chaque_page(self):
        self.ouvrir()
        b = self.bandeau()
        avoir = self.js('state.films.filter(f => f.user?.statut === "a_voir").length')
        self.assertFalse(b['cache'])
        self.assertEqual((b['gros'], b['glitch']), (str(avoir), str(avoir)))
        self.assertTrue(b['coords'].endswith('ch. 02'), b)
        self.assertEqual(b['couleur'], 'var(--cyan)')
        self.assertEqual(b['l'], 'à lyon')

        self.page.click('.tab[data-view="vu"]')
        self.attendre(lambda: self.bandeau()['coords'].endswith('ch. 03'))
        b = self.bandeau()
        self.assertEqual(b['gros'], self.js('state.films.filter(f => f.user?.statut === "vu").length.toLocaleString("fr-FR")'))
        self.assertEqual(b['e1'], self.js('"en " + new Date().getFullYear()'))
        self.assertEqual(b['e2'], str(self.js('state.films.filter(f => f.user?.statut === "vu" && String(f.user.date_vue || "").startsWith(String(new Date().getFullYear()))).length')))
        self.assertEqual(b['couleur'], 'var(--hot)')

        self.decouvrir()
        self.page.click('.explorer-cat[data-cat="trending"]')
        self.attendre(lambda: self.js('document.querySelectorAll("#grid .card").length') > 0)
        self.page.wait_for_timeout(300)
        b = self.bandeau()
        self.assertEqual((b['gros'], b['l']), ('tendances', 'films'))
        self.assertEqual(b['n'], str(self.js('document.querySelectorAll("#grid .card").length')))
        self.assertTrue(b['coords'].endswith('ch. 04'), b)

        self.explorer()
        self.assertEqual(self.bandeau()['gros'], 'explorer')
        self.page.fill('#explorer-search', 'dune')
        self.attendre(lambda: self.js('document.querySelectorAll("#grid .card").length') > 0)
        self.page.wait_for_timeout(300)
        b = self.bandeau()
        self.assertEqual(b['gros'], '« dune »')
        self.assertEqual(b['n'], str(self.js('document.querySelectorAll("#grid .card").length')))
        self.assertTrue(self.js('document.getElementById("bandeau-gros").classList.contains("bandeau-mot")'))

    def test_pas_de_bandeau_sur_une_filmographie(self):
        self.ouvrir()
        self.page.click('.tab[data-view="vu"]')
        self.attendre(lambda: self.js('state.view === "vu"'))
        self.js('openPerson("Agnès Varda", "real"), 0')
        self.attendre(lambda: self.js('state.view === "person"'))
        self.assertTrue(self.bandeau()['cache'])
        self.page.click('#person-back')
        self.attendre(lambda: self.js('state.view === "vu"'))
        self.assertFalse(self.bandeau()['cache'])

    def test_infos_et_etiquettes_dans_les_affiches(self):
        self.ouvrir()
        self.assertTrue(self.js('document.querySelector("#grid .card .a-voir-badge") !== null'))
        self.assertEqual(self.js(HORS_AFFICHE), [])
        self.page.click('.tab[data-view="vu"]')
        self.attendre(lambda: self.js('state.view === "vu" && document.querySelector("#grid .card .rating-badge.favorite") !== null'))
        self.page.wait_for_timeout(500)
        self.assertEqual(self.js(HORS_AFFICHE), [])
        # Une carte n'est plus que son affiche : les infos sont posées dessus
        self.assertEqual(self.js('getComputedStyle(document.querySelector("#grid .card .meta")).position'), 'absolute')
        # N° des fiches à rebours dans « vus » triés par date, pas ailleurs
        self.assertEqual(self.js('document.getElementById("grid").style.counterReset'), 'fiche %d' % (self.js('state.filtered.length') + 1))
        self.page.click('.tab[data-view="a_voir"]')
        self.attendre(lambda: self.js('state.view === "a_voir"'))
        self.assertEqual(self.js('document.getElementById("grid").style.counterReset'), '')

    def test_fiche_en_duel(self):
        self.ouvrir()
        self.page.click('.tab[data-view="vu"]')
        self.attendre(lambda: self.js('state.view === "vu"'))
        self.js('openModal(state.films.find(f => f.user?.statut === "vu" && f.user.rating && f.tmdb_rating))')
        self.attendre(lambda: self.js('document.getElementById("modal-backdrop").classList.contains("open")'))
        cellules = self.js('[...document.querySelector("#modal-body .ratings-row").children].map(e => e.className)')
        self.assertEqual(cellules, ['rating-cell', 'note-vs', 'rating-cell tmdb'])
        self.assertEqual(self.js('document.getElementById("modal-title").dataset.t'), self.js('document.getElementById("modal-title").textContent'))
        # Sans note TMDB : pas de « vs » tout seul
        self.js('openModal(state.films.find(f => f.user?.statut === "a_voir"))')
        self.page.wait_for_timeout(300)
        self.assertEqual(self.js('document.querySelectorAll("#modal-body .note-vs").length'), 0)


class SiteSignalTelephone(SiteSignal):
    largeur = 375

    def test_rien_qui_redessine_en_continu_sur_la_collection(self):
        # Comme sur la page stats : seules restent des animations que le
        # téléphone déplace sans redessiner, et le glitch du grand nombre
        self.ouvrir()
        self.page.wait_for_timeout(500)
        lourdes = self.js('''document.getAnimations().filter(a => a.playState === 'running' && a.effect.getTiming().iterations === Infinity).map(a => {
            const props = new Set(); for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k))
              if (!['offset', 'easing', 'composite', 'computedOffset', 'transform', 'opacity'].includes(p)) props.add(p);
            return props.size ? a.animationName : null; }).filter(Boolean)''')
        self.assertEqual(lourdes, ['stats-glitch'], lourdes)
        self.assertEqual(self.js('getComputedStyle(document.body, "::before").display'), 'none', 'grain')
        self.assertEqual(self.js('getComputedStyle(document.querySelector("#bandeau-page .stats-liquide")).animationName'), 'none')


if __name__ == '__main__':
    unittest.main()
