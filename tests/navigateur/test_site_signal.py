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
# Une étiquette posée sur la première affiche (avec ou sans « canal+ » au-dessus),
# « à lyon » faite par le site (etiquetteLyon), remise droite pour la mesure.
# Pour chaque morceau de texte (le « à » a sa propre taille) : haut et bas de
# son encre, accent compris, mesurés dans la police depuis sa ligne de base
# (le bas d'un repère vide posé juste après). Rend l'air au-dessus et en
# dessous de l'encre dans le cadre, et le haut de l'encre de chaque morceau.
ETIQUETTE = '''async ([lyon, avecCanal]) => {
  await document.fonts.ready;
  const canal = () => { const c = document.createElement('div'); c.className = 'canal-badge'; c.textContent = 'canal+'; return c; };
  const p = document.querySelector('#grid .card .poster');
  p.querySelectorAll('.rating-badge, .canal-badge, .lyon-badge').forEach(x => x.remove());
  if (avecCanal) p.appendChild(canal());
  const b = lyon ? etiquetteLyon() : canal();
  p.appendChild(b);
  b.style.transform = 'none';
  const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), textes = [];
  while (w.nextNode()) if (w.currentNode.data.trim()) textes.push(w.currentNode);
  const ctx = document.createElement('canvas').getContext('2d');
  const morceaux = textes.map(t => {
    const m = document.createElement('span'); m.style.cssText = 'display:inline-block;width:0;height:0'; t.after(m);
    const cs = getComputedStyle(t.parentElement), k = parseFloat(cs.fontSize) / 1000;
    ctx.font = '1000px ' + cs.fontFamily;
    const e = ctx.measureText(t.data.trim());
    return { m, haut: e.actualBoundingBoxAscent * k, bas: e.actualBoundingBoxDescent * k }; })
    .map(({ m, haut, bas }) => { const ligne = m.getBoundingClientRect().bottom; return { haut: ligne - haut, bas: ligne + bas }; });
  const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
  return { dessus: Math.min(...morceaux.map(x => x.haut)) - (r.top + parseFloat(cs.borderTopWidth)),
           dessous: r.bottom - parseFloat(cs.borderBottomWidth) - Math.max(...morceaux.map(x => x.bas)),
           hauts: morceaux.map(x => x.haut), hauteur: r.height }; }'''
# Tout ce qui a un bord en pointillé dans la page (même caché)
POINTILLES = '''[...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e);
  return ['Top', 'Right', 'Bottom', 'Left'].some(c => /dashed|dotted/.test(s['border' + c + 'Style']) && parseFloat(s['border' + c + 'Width']) > 0); })
  .map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : ''))'''
# Fiche d'un film à voir au long synopsis, avec six salles de Lyon simulées
FICHE_AVEC_SALLES = '''async () => {
  const f = state.films.find(f => f.user?.statut === 'a_voir' && (f.synopsis || '').length > 300 && (f.cast || []).length);
  lyon = { films: [], salles: ['Lumière Terreaux', 'Comœdia', 'UGC Part-Dieu', 'UGC Astoria', 'Pathé Bellecour', 'Pathé Vaise']
    .map((nom, i) => ({ code: 'S' + i, nom, url: 'https://example.org/' + i })) };
  lyonParFilm = new Map([[f.id, { salles: Object.fromEntries(lyon.salles.map(s => [s.code, [['2099-01-01T20:00', 'VF']]])) }]]);
  openModal(f);
  for (let i = 0; i < 50 && !document.querySelector('#modal-body .watch-salle'); i++) await new Promise(ok => setTimeout(ok, 100));
  return f.id; }'''
# Lignes du synopsis sans sa première lettre : haut et bord gauche de chaque ligne
LIGNES_SYNOPSIS = '''(() => { const p = document.querySelector('#modal-body .synopsis'), r = document.createRange();
  r.setStart(p.firstChild, 1); r.setEnd(p.firstChild, p.firstChild.length);
  const lignes = [];
  for (const x of r.getClientRects()) { const l = lignes.find(l => Math.abs(l.haut - x.top) < 3);
    if (l) l.gauche = Math.min(l.gauche, x.left); else lignes.push({ haut: x.top, gauche: x.left }); }
  const b = p.getBoundingClientRect(), s = getComputedStyle(p);
  return { bord: b.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth), lignes: lignes.sort((a, b) => a.haut - b.haut) }; })()'''


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

    def test_etiquettes_canal_et_lyon_centrees(self):
        # « À LYON » : l'accent touchait le haut du cadre, le mot paraissait
        # décentré. Le « à » est plus petit : avec son accent, il monte juste
        # à la hauteur de « LYON », et le mot est au milieu du cadre
        self.ouvrir()
        mesure = lambda lyon, avec=False: self.page.evaluate(ETIQUETTE, [lyon, avec])
        lyon, canal = mesure(True), mesure(False)
        self.assertEqual(len(lyon['hauts']), 2, lyon)
        self.assertLessEqual(abs(lyon['hauts'][0] - lyon['hauts'][1]), 0.5, lyon)
        for m in (lyon, canal):
            self.assertGreaterEqual(m['dessus'], 1, m)
            self.assertLessEqual(abs(m['dessus'] - m['dessous']), 1, m)
        # Les deux étiquettes ont la même hauteur
        self.assertEqual(lyon['hauteur'], canal['hauteur'])
        # Sous « canal+ », « à lyon » gardait aussi le bas de l'ancienne
        # pastille et s'étirait sur l'affiche
        self.assertEqual(mesure(True, True)['hauteur'], lyon['hauteur'])

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

    def test_contours_pleins_partout(self):
        # Plus aucun bord en pointillé : onglets, recherche, filtres, fiche,
        # salles, stats (demandé le 2026-11-25)
        self.ouvrir()
        self.assertEqual(self.js(POINTILLES), [], 'collection')
        self.page.evaluate(FICHE_AVEC_SALLES)
        self.assertTrue(self.js('!!document.querySelector("#modal-body .watch-salle") && !!document.querySelector("#modal-body a.cast-item")'))
        self.assertEqual(self.js(POINTILLES), [], 'fiche')
        self.js('closeModal()')
        self.page.click('.nav-btn[data-page="stats"]')
        self.attendre(lambda: self.js('document.getElementById("stats-page").classList.contains("active")'))
        self.page.wait_for_timeout(300)
        self.assertEqual(self.js(POINTILLES), [], 'stats')

    def test_nombres_dans_le_cadre_des_onglets(self):
        # Les pastilles de « à voir » et « vus » sortaient en haut à droite
        self.ouvrir()
        for vue in ('a_voir', 'vu'):
            dedans = self.js('''(() => { const t = document.querySelector('.tab[data-view="%s"]'), c = t.querySelector('.count');
              const a = t.getBoundingClientRect(), b = c.getBoundingClientRect();
              return b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom; })()''' % vue)
            self.assertTrue(dedans, vue)
        # L'onglet garde sa largeur pendant l'attente (« 0 ») et après (« 581 »)
        largeurs = self.js('''['0', '581'].map(n => { const c = document.getElementById('count-vu'); c.textContent = n;
            return c.parentElement.getBoundingClientRect().width; })''')
        self.assertAlmostEqual(largeurs[0], largeurs[1], delta=0.5)

    def test_texte_d_aide_d_explorer_en_police_simple(self):
        # « tape au moins deux lettres… » était en Bungee évidé, difficile à lire
        self.ouvrir()
        self.explorer()
        self.attendre(lambda: self.js('!!document.querySelector("#grid .explorer-invite")'))
        police = self.js('getComputedStyle(document.querySelector("#grid .explorer-invite")).fontFamily')
        self.assertTrue(police.startswith('"JetBrains Mono"'), police)
        self.assertEqual(self.js('getComputedStyle(document.querySelector("#grid .explorer-invite")).webkitTextStrokeWidth'), '0px')

    def test_petits_tickets_et_premiere_lettre_sur_une_ligne(self):
        self.ouvrir()
        self.page.evaluate(FICHE_AVEC_SALLES)
        # Tickets des salles plus petits (environ 30 px de haut avant)
        hauteurs = self.js('[...document.querySelectorAll("#modal-body .watch-salle")].map(e => e.offsetHeight)')
        self.assertEqual(len(hauteurs), 6)
        self.assertLessEqual(max(hauteurs), 21, hauteurs)
        # La première lettre du synopsis tenait sur deux lignes : la deuxième
        # ligne était décalée vers la droite. Elle commence au bord, et la
        # première ligne n'est pas plus haute que les autres
        s = self.js(LIGNES_SYNOPSIS)
        self.assertGreaterEqual(len(s['lignes']), 3, s)
        self.assertLess(abs(s['lignes'][1]['gauche'] - s['bord']), 1, s)
        ecarts = [b['haut'] - a['haut'] for a, b in zip(s['lignes'], s['lignes'][1:])]
        self.assertLess(abs(ecarts[0] - ecarts[1]), 1, ecarts)


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
