// Enregistrement vers GitHub : fusion au conflit 409 entre deux appareils.
// Le vrai code d'app.js tourne (saveEditedFilm, file d'attente, fusion) ;
// GitHub, le formulaire de la fiche et l'affichage sont simulés.
//   node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerApp, trou } from './charger.mjs';

const copie = x => JSON.parse(JSON.stringify(x));
const film = (n, statut, rating) => ({
  id: 'movie-' + n, type: 'movie', tmdb_id: n, title: 'Film ' + n,
  user: { statut, rating, favorite: false, lieu: statut === 'vu' ? 'Autre' : null,
          date_vue: statut === 'vu' ? '2025-05' : null, date_vue_label: null },
});

// Le site, une collection et un faux GitHub (409 si la version de départ est périmée)
function monter(films) {
  const { ctx, app } = chargerApp();
  for (const f of ['initFilters', 'applyFilters', 'refreshStats', 'closeModal', 'showToast',
                   'closeRematchModal', 'fillDirectorCountries']) ctx[f] = () => {};
  app.state.films = copie(films);
  app.admin.filmsSHA = 'v0';
  let n = 0;
  const gh = { sha: 'v0', films: copie(films), couperApresConflit: false, envois: 0 };
  ctx.ghGetFile = async () => ({ content: JSON.stringify({ version: 1, films: gh.films }), sha: gh.sha });
  ctx.ghPutFile = async (chemin, contenu, sha) => {
    gh.envois++;
    if (gh.coupe) { gh.coupe = false; throw new Error('Failed to fetch'); }
    if (sha !== gh.sha) { gh.coupe = gh.couperApresConflit; throw new Error('github put 409: conflict'); }
    gh.films = JSON.parse(contenu).films;
    gh.sha = 'v' + (++n);
    return { content: { sha: gh.sha } };
  };
  // Modification faite sur un autre appareil : GitHub change de version
  gh.ailleurs = modif => { modif(gh.films); gh.sha = 'v' + (++n); };
  return { ctx, app, gh };
}

// Formulaire de la fiche rempli comme par l'utilisateur, puis « enregistrer »
async function noter(ctx, id, rating) {
  const el = (o = {}) => ({ style: {}, dataset: {}, textContent: '', value: '', disabled: false, checked: false, ...o });
  const champs = {
    '.edit-form .edit-form-error': el(),
    '.edit-form .radio-group[data-field="statut"] .radio-btn.active': el({ dataset: { value: 'vu' } }),
    '.edit-form .rating-chips[data-field="rating"] .rating-chip.active': el({ dataset: { rating: String(rating) } }),
    '.edit-form select[data-field="lieu"]': el({ value: 'Cinéma' }),
    '.edit-form .edit-save': el(),
  };
  const ids = { 'edit-date-year': el({ value: '2026' }), 'edit-date-month': el({ value: '11' }), 'edit-date-before': el() };
  ctx.document = { querySelector: s => champs[s] || trou(), getElementById: i => ids[i] || trou(), querySelectorAll: () => [] };
  await ctx.saveEditedFilm(id);
  return champs['.edit-form .edit-form-error'];
}

const distant = (gh, id) => gh.films.find(f => f.id === id);

test('D1 : une note enregistrée plus tôt ne gagne plus contre une note faite ailleurs', async () => {
  const { ctx, gh } = monter([film(1, 'vu', 2), film(2, 'vu', 3)]);
  await noter(ctx, 'movie-1', 5);                         // onglet A : X à 5, enregistré
  gh.ailleurs(fs => { distant({ films: fs }, 'movie-1').user.rating = 1; }); // téléphone : X à 1
  await noter(ctx, 'movie-2', 4);                         // onglet A, plus tard : Y, conflit, fusion
  assert.equal(distant(gh, 'movie-1').user.rating, 1, 'la note faite ailleurs est écrasée');
  assert.equal(distant(gh, 'movie-2').user.rating, 4);
});

test('D1 : une suppression faite ailleurs n\'est pas annulée', async () => {
  const { ctx, gh } = monter([film(1, 'vu', 2), film(2, 'vu', 3)]);
  await noter(ctx, 'movie-1', 5);
  gh.ailleurs(fs => fs.splice(fs.findIndex(f => f.id === 'movie-1'), 1));
  await noter(ctx, 'movie-2', 4);
  assert.equal(distant(gh, 'movie-1'), undefined, 'le film supprimé ailleurs est revenu');
});

test('D1 : une modification en attente dans la file n\'est pas oubliée', async () => {
  const { ctx, app, gh } = monter([film(1, 'vu', 2), film(2, 'vu', 3)]);
  const a = noter(ctx, 'movie-1', 5), b = noter(ctx, 'movie-2', 4); // deux envois à la suite
  await Promise.all([a, b]);
  assert.equal(distant(gh, 'movie-1').user.rating, 5);
  assert.equal(distant(gh, 'movie-2').user.rating, 4);
  assert.equal(app.sessionChanges.edited.size, 0, 'tout est enregistré : plus aucune marque');
});

test('D2 : après un conflit puis un échec, le retour arrière ne touche pas un autre film', async () => {
  const { ctx, app, gh } = monter([film(1, 'a_voir', null), film(2, 'vu', 3)]);
  gh.ailleurs(fs => fs.unshift(film(9, 'a_voir', null)));  // ajout ailleurs : la liste se décale
  gh.couperApresConflit = true;                            // le second envoi échoue
  const err = await noter(ctx, 'movie-2', 5);
  assert.match(err.textContent, /erreur/);
  const voisin = app.state.films.find(f => f.id === 'movie-1');
  assert.equal(voisin.user.statut, 'a_voir', 'le film voisin a reçu les données d\'un autre');
  assert.equal(app.state.films.find(f => f.id === 'movie-2').user.rating, 3, 'retour à la note d\'avant');
});

test('D3 : re-match vers un film déjà dans la collection refusé', async () => {
  const { ctx, app } = monter([film(1, 'vu', 2), film(2, 'vu', 5)]);
  const statut = { textContent: '' };
  ctx.document = { getElementById: i => (i === 'rematch-status' ? statut : trou()), querySelector: () => trou(), querySelectorAll: () => [] };
  ctx.tmdbDetails = async id => ({ id });
  ctx.buildFilmFromTmdb = (d, type) => ({ id: type + '-' + d.id, type, tmdb_id: d.id, title: 'Film ' + d.id, source: {} });
  ctx.saveFilmsToGithub = async () => {};
  app.admin.pendingRematchFilmId = 'movie-1';
  await ctx.confirmRematch({ id: 2, media_type: 'movie', title: 'Film 2' });
  const ids = app.state.films.map(f => f.id);
  assert.equal(new Set(ids).size, ids.length, 'doublon d\'id créé');
  assert.equal(statut.textContent, 'ce film est déjà dans ta collection');
});
