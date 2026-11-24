// Stats : note moyenne selon le genre des réals (section « genre · parité »)
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerApp } from './charger.mjs';

const film = (rating, genres) => ({ user: { statut: 'vu', rating }, director_genders: genres, director_gender: genres[0] });

test('P1 : note moyenne des films de réalisatrices et de réalisateurs', () => {
  const { ctx } = chargerApp();
  const vus = [
    film(5, [1]),        // réalisatrice : 9,5/10
    film(3, [1, 2]),     // co-réalisation avec une femme : côté réalisatrices, 6/10
    film(4, [2]),        // réalisateur : 8/10
    film(2, [2, 2]),     // deux réalisateurs : 4/10
    film(6, [2, 0]),     // un homme et un genre inconnu : écarté
    film(6, [0]),        // genre inconnu : écarté
    film(null, [1]),     // pas noté : écarté
  ];
  const n = ctx.notesSelonGenreReal(vus);
  assert.equal(n.femmes.n, 2);
  assert.equal(n.femmes.note, 7.75);
  assert.equal(n.hommes.n, 2);
  assert.equal(n.hommes.note, 6);
});

test('P1 : sans film d\'un côté, pas de moyenne', () => {
  const { ctx } = chargerApp();
  const n = ctx.notesSelonGenreReal([film(4, [2])]);
  assert.equal(n.femmes.n, 0);
  assert.equal(n.femmes.note, null);
});

test('P2 : répartition des notes de chaque côté (1★ … 5★, ❤)', () => {
  const { ctx } = chargerApp();
  const n = ctx.notesSelonGenreReal([film(5, [1]), film(5, [1, 2]), film(6, [1]), film(1, [2]), film(6, [2]), film(6, [2])]);
  assert.deepEqual([...n.femmes.repartition], [0, 0, 0, 0, 2, 1]);
  assert.deepEqual([...n.hommes.repartition], [1, 0, 0, 0, 0, 2]);
});
