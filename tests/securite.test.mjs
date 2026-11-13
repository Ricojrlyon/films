// Sécurité : adresses insérées dans la page
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerApp } from './charger.mjs';

test('S2 : safeUrl ne laisse pas « &#41; » fermer un url() CSS', () => {
  const { ctx } = chargerApp();
  const piege = 'https://image.tmdb.org/t/p/w500/x.jpg&#41;;position:fixed;inset:0';
  const sortie = ctx.safeUrl(piege);
  // Dans un attribut HTML, « &amp;#41; » redevient le texte « &#41; », jamais « ) »
  assert.ok(!sortie.includes('&#41;') || sortie.includes('&amp;#41;'), sortie);
  assert.equal(ctx.safeUrl('https://www.themoviedb.org/movie/603/watch?locale=FR'), 'https://www.themoviedb.org/movie/603/watch?locale=FR');
  assert.equal(ctx.safeUrl('javascript:alert(1)'), '');
});

// Page factice avec les quatre cases du mode édition remplies
function casesRemplies(ctx) {
  const cases = {};
  for (const id of ['admin-setup-pat', 'admin-setup-code', 'admin-setup-code-confirm', 'admin-unlock-code']) cases[id] = { value: 'secret' };
  const page = ctx.document;
  ctx.document = new Proxy(page, { get: (t, k) => (k === 'getElementById' ? id => cases[id] || page.getElementById(id) : page[k]) });
  for (const f of ['closeAdminSetup', 'showToast', 'adoptFilmsFromApi', 'refreshTmdbData']) ctx[f] = () => {};
  return cases;
}
const vides = cases => Object.values(cases).every(c => c.value === '');

test('S4 : verrouiller efface le token et le code restés dans les cases', () => {
  const { ctx } = chargerApp();
  const cases = casesRemplies(ctx);
  ctx.lockAdmin();
  assert.ok(vides(cases), JSON.stringify(cases));
});

test('S4 : « tout réinitialiser » efface aussi les cases', () => {
  const { ctx } = chargerApp();
  const cases = casesRemplies(ctx);
  ctx.disableAdmin();
  assert.ok(vides(cases), JSON.stringify(cases));
});

test('S4 : le code est effacé dès le déverrouillage réussi', async () => {
  const { ctx } = chargerApp();
  const cases = casesRemplies(ctx);
  ctx.decryptWithCode = async () => 'faux-token';
  ctx.ghTestToken = async () => {};
  ctx.ghGetFile = async () => ({ content: '{"films":[]}', sha: 'v0' });
  await ctx.unlockAdmin();
  assert.equal(cases['admin-unlock-code'].value, '');
});
