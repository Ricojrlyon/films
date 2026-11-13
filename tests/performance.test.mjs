// Performance : appels TMDB, calculs des stats, fondu des longues grilles
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerApp } from './charger.mjs';

const reponse = (corps, statut = 200) => ({ ok: statut < 400, status: statut, json: async () => corps });

test('P1 : stats, textes des films vus normalisés une seule fois', () => {
  const { ctx, app } = chargerApp();
  app.state.films = Array.from({ length: 100 }, (_, i) => ({
    id: 'movie-' + i, title: 'Film ' + i, original_title: 'Film ' + i, director: 'Réal ' + i,
    cast: ['Acteur ' + i], user: { statut: 'vu' },
  }));
  let appels = 0;
  const vraie = ctx.normSearch;
  ctx.normSearch = s => { appels++; return vraie(s); };
  for (let i = 0; i < 50; i++) ctx.countVusMatching('search', 'Réal ' + i); // 50 lignes des tops
  assert.ok(appels <= 100 * 4 + 50, `${appels} normalisations (au lieu d'environ 450)`);
  assert.equal(ctx.countVusMatching('search', 'Réal 99'), 1); // même résultat qu'avant
});

test('P2 : pastilles canal+ lues dans la liste du robot, sans appel TMDB', async () => {
  const { ctx, app } = chargerApp();
  const tmdb = [];
  ctx.fetch = async url => {
    if (url.startsWith('canal_plus.json')) {
      return reponse({ genere: new Date().toISOString(), fournisseurs: '381|350', complet: true, ids: ['movie-1', 'tv-2'] });
    }
    tmdb.push(url);
    return reponse({ total_pages: 1, results: [] });
  };
  await ctx.ensureCanalFR();
  assert.equal(tmdb.length, 0, tmdb.length + ' appels TMDB');
  assert.ok(app.canalSet.has('movie-1') && app.canalSet.has('tv-2'));
});

test('P2 : liste du robot trop vieille (robot arrêté), repli sur TMDB', async () => {
  const { ctx, app } = chargerApp();
  let tmdb = 0;
  ctx.fetch = async url => {
    if (url.startsWith('canal_plus.json')) {
      return reponse({ genere: new Date(Date.now() - 5 * 86400000).toISOString(), fournisseurs: '381|350', complet: true, ids: ['movie-1'] });
    }
    tmdb++;
    return reponse({ total_pages: 1, results: [{ id: 9 }] });
  };
  await ctx.ensureCanalFR();
  assert.ok(tmdb > 0);
  assert.ok(app.canalSet.has('movie-9') && !app.canalSet.has('movie-1'));
});

test('P4 : pas de fondu sur une très longue grille', () => {
  const { ctx } = chargerApp();
  let fondus = 0, cartes = 581;
  ctx.document = { visibilityState: 'visible', startViewTransition: run => { fondus++; run(); return { finished: Promise.resolve() }; },
                   getElementById: () => ({ childElementCount: cartes }) };
  ctx.viewTransition(() => {}); // premier rendu : jamais de fondu
  ctx.viewTransition(() => {});
  assert.equal(fondus, 0, 'fondu sur 581 cartes (1,9 s sur téléphone)');
  cartes = 60;
  ctx.viewTransition(() => {});
  assert.equal(fondus, 1, 'le fondu reste pour une grille courante');
});

test('P6 : dates et réals pas demandés pour des cartes déjà retirées', async () => {
  const { ctx } = chargerApp();
  let demandes = 0;
  ctx.resolveDirector = async () => { demandes++; return 'x'; };
  ctx.resolveReleaseFr = async () => { demandes++; return false; };
  ctx.resolveTitle = async () => { demandes++; return null; };
  const carte = { isConnected: false, dataset: { tmdbId: '1', filmId: 'movie-1', mediaType: 'movie', release: '' },
                  querySelector: () => ({ textContent: 'Titre' }) };
  ctx.document = { querySelectorAll: () => [carte, carte, carte] };
  await ctx.fillCardMeta();
  assert.equal(demandes, 0, demandes + ' demandes pour des cartes plus affichées');
});

test('P8 : série sans créateur, pas redemandée à chaque rendu', async () => {
  const { ctx } = chargerApp();
  let appels = 0;
  ctx.fetch = async () => { appels++; return reponse({ created_by: [] }); };
  await ctx.resolveDirector('tv-75603', 75603, 'tv');
  await ctx.resolveDirector('tv-75603', 75603, 'tv');
  assert.equal(appels, 1);
});

test('P9 : TMDB refuse un instant (429), la liste arrive quand même', async () => {
  const { ctx } = chargerApp();
  let appels = 0;
  ctx.fetch = async () => (++appels === 1 ? reponse({}, 429) : reponse({ total_pages: 1, results: [{ id: 1, title: 'A', vote_count: 500, popularity: 1 }] }));
  const liste = await ctx.tmdbBrowse('trending', {}, 40);
  assert.ok(liste.length > 0);
});
