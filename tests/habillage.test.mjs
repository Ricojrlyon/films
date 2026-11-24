// Style « signal » sur tout le site : contenu du bandeau de chaque page et
// des rubans du haut (donneesBandeau, textesRubans), sans navigateur
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerApp } from './charger.mjs';

const vu = (id, date_vue, extra = {}) => ({ id, title: 'Film ' + id, runtime: 120, user: { statut: 'vu', date_vue, rating: 4, ...extra } });
const avoir = id => ({ id, title: 'À voir ' + id, user: { statut: 'a_voir' } });
const FILMS = [
  avoir('movie-1'), avoir('movie-2'), avoir('movie-3'),
  vu('movie-10', '2026-11', { favorite: true }), vu('movie-11', '2026'), vu('movie-12', '2025-12'),
  vu('movie-13', 'before-2022'), vu('movie-14', '2026-03', { favorite: true }),
];
const ctxDe = extra => ({
  categorie: 'lyon', salles: 10, tri: 'selon tes goûts', recherche: '', cartes: 40, dejaLa: 17, baseReco: 29,
  maintenant: new Date(2026, 10, 24), aLyon: id => id === 'movie-1' || id === 'movie-2', canal: new Set(['movie-3']), ...extra,
});

test('H1 : bandeau de « à voir »', () => {
  const { ctx } = chargerApp();
  const b = ctx.donneesBandeau('a_voir', FILMS, ctxDe());
  assert.equal(b.ch, '02');
  assert.equal(b.gros, '3');
  assert.equal(b.n, '2');
  assert.equal(b.l, 'à lyon');
  assert.equal(b.e2, '1');
  assert.ok(b.anneau.startsWith('★ 2 de tes à voir passent à lyon ★ 1 sur canal+ '), b.anneau);
  assert.equal(b.couleur, 'var(--cyan)');
});

test('H1 : bandeau de « vus » (coups de cœur, films de l\'année)', () => {
  const { ctx } = chargerApp();
  const b = ctx.donneesBandeau('vu', FILMS, ctxDe());
  assert.equal(b.ch, '03');
  assert.equal(b.gros, '5');
  assert.equal(b.n, '2');
  assert.equal(b.e1, 'en 2026');
  assert.equal(b.e2, '3');          // 2026-11, 2026, 2026-03
  assert.ok(b.anneau.includes('10 heures'), b.anneau);
});

test('H1 : bandeau de Découvrir, d\'Explorer et de la Reco', () => {
  const { ctx } = chargerApp();
  const d = ctx.donneesBandeau('discover', FILMS, ctxDe());
  assert.deepEqual([d.ch, d.gros, d.mot, d.sous, d.n, d.e2], ['04', 'à lyon', true, 'découvrir · 10 salles · 7 prochains jours', '40', '17']);
  assert.equal(ctx.donneesBandeau('discover', FILMS, ctxDe({ categorie: 'trending' })).sous, 'découvrir · cette semaine');
  const vide = ctx.donneesBandeau('explorer', FILMS, ctxDe());
  assert.deepEqual([vide.gros, vide.n, vide.l], ['explorer', '?', 'cherche']);
  const e = ctx.donneesBandeau('explorer', FILMS, ctxDe({ recherche: 'Varda', cartes: 12 }));
  assert.deepEqual([e.ch, e.gros, e.n, e.l], ['05', '« Varda »', '12', 'résultats']);
  const r = ctx.donneesBandeau('reco', FILMS, ctxDe({ cartes: 24 }));
  assert.deepEqual([r.ch, r.gros, r.n, r.sous, r.e1, r.e2], ['06', '24', '29', 'pour toi · novembre 2026', 'nov.', '2026']);
});

test('H1 : pas de bandeau sur une filmographie', () => {
  const { ctx } = chargerApp();
  assert.equal(ctx.donneesBandeau('person', FILMS, ctxDe()), null);
});

test('H2 : « 1 de tes à voir passe », « aucun »', () => {
  const { ctx } = chargerApp();
  assert.ok(ctx.donneesBandeau('a_voir', FILMS, ctxDe({ aLyon: id => id === 'movie-1' })).anneau.startsWith('★ 1 de tes à voir passe à lyon'));
  assert.ok(ctx.donneesBandeau('a_voir', FILMS, ctxDe({ aLyon: () => false })).anneau.startsWith('★ aucun de tes à voir à lyon'));
});

test('H3 : rubans du haut (chiffres, puis derniers vus du plus récent au plus ancien)', () => {
  const { ctx } = chargerApp();
  const [chiffres, derniers] = ctx.textesRubans(FILMS, id => id === 'movie-1', new Set(['movie-3']));
  assert.ok(chiffres.startsWith('5 films vus ✦ 10 heures ✦ 3 à voir ✦ 2 coups de cœur ✦ 1 de tes à voir passe à lyon ✦ 1 sur canal+ ✦ '), chiffres);
  // « avant 2022 » n'a pas de date : écarté ; un film daté au mois (2026-03)
  // passe avant celui daté de l'année seule (2026, mois inconnu)
  assert.ok(derniers.startsWith('derniers vus ▸ Film movie-10 ✦ Film movie-14 ✦ Film movie-11 ✦ Film movie-12 ✦ derniers vus'), derniers);
});
