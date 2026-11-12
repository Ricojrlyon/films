// Démarrage, lecture de films.json, TMDB en panne, recherche de la collection
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerApp } from './charger.mjs';

test('D4 : stockage du navigateur interdit, le démarrage continue', () => {
  const { ctx, app } = chargerApp();
  // Cookies tous bloqués : le simple accès au stockage lève une erreur
  ctx.localStorage = { getItem() { throw new Error('The operation is insecure.'); } };
  assert.doesNotThrow(() => ctx.loadAdminCreds());
  assert.equal(app.admin.encryptedPAT, null);
});

test('D5 : une entrée abîmée de films.json ne vide pas le site', async () => {
  const { ctx, app } = chargerApp();
  const films = [
    null,
    { id: 'movie-1', type: 'movie', title: 'A', genres: 'Drame', user: { statut: 'vu', rating: 3, date_vue: 2023 } },
    { id: 'movie-2', type: 'movie', title: 'B', genres: ['Comédie'], user: { statut: 'a_voir' } },
  ];
  ctx.fetch = async () => ({ ok: true, json: async () => ({ films }) });
  // Page factice, dont on lit seulement la grille (où s'écrirait le message d'erreur)
  const grille = { innerHTML: '' };
  const page = ctx.document;
  ctx.document = new Proxy(page, { get: (t, k) => (k === 'getElementById' ? id => (id === 'grid' ? grille : page.getElementById(id)) : page[k]) });
  for (const f of ['applyFilters', 'refreshStats']) ctx[f] = () => {};
  await ctx.loadFilms();
  const erreur = grille.innerHTML.includes('impossible de charger') ? grille.innerHTML.replace(/\s+/g, ' ') : null;
  assert.equal(erreur, null, 'le chargement a échoué sur une entrée abîmée');
  assert.equal(app.state.films.map(f => f.id).join(','), 'movie-1,movie-2');
  assert.equal(app.state.films[0].user.date_vue, '2023');
  assert.equal(JSON.stringify(app.state.films[0].genres), '["Drame"]');
});

test('B5 : avant l\'arrivée de films.json, la collection n\'est pas redessinée', () => {
  const { ctx, app } = chargerApp();
  let dessins = 0;
  ctx.renderGrid = () => { dessins++; };
  app.state.films = [];
  app.state.view = 'a_voir';
  ctx.repeindreVueCourante(); // une pastille (Lyon, Canal+, au ciné) arrive avant films.json
  assert.equal(dessins, 0, '« aucun film ne correspond » affiché, ou message d\'erreur effacé');
  app.state.films = [{ id: 'movie-1', user: { statut: 'a_voir' } }];
  ctx.repeindreVueCourante();
  assert.equal(dessins, 1);
});

test('B6 : TMDB en erreur HTTP, une erreur et non une liste vide', async () => {
  const { ctx } = chargerApp();
  ctx.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(ctx.tmdbBrowse('trending', {}, 40), /tmdb ne répond pas \(503\)/);
});

test('B8 : la recherche ignore apostrophes typographiques, œ, espaces insécables et espace finale', () => {
  const { ctx } = chargerApp();
  const trouve = (cherche, titre) => ctx.normSearch(titre).includes(ctx.normSearch(cherche));
  assert.ok(trouve('kubrick ', 'Stanley Kubrick'), 'espace finale du clavier de téléphone');
  assert.ok(trouve("l'affaire marie", 'L’Affaire Marie-Claire'), 'apostrophe droite contre typographique');
  assert.ok(trouve('l’affaire bojarski', "L'Affaire Bojarski"), 'apostrophe typographique contre droite');
  assert.ok(trouve('au poste !', 'Au poste !'), 'espace insécable');
  assert.ok(trouve('coeur', 'Si tu voyais son cœur'), 'ligature œ');
  assert.ok(trouve('amelie', 'AMÉLIE'), 'accents et majuscules (déjà bon)');
});
