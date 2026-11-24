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

// « ton année en films » : chiffres d'une année de visionnage
const vu = (o) => ({ user: { statut: 'vu', rating: o.note || null, favorite: o.note === 6, date_vue: o.date },
  title: o.titre, year: o.annee, runtime: o.duree || 0, genres: o.genres || [], country: o.pays || '',
  director: o.real || '', director_genders: o.genres_real || [], cast: o.cast || [], cast_genders: o.cast_genders || [],
  director_countries: o.nes || [], tmdb_rating: o.tmdb || 0, poster: o.affiche || null, id: 'movie-' + o.titre });

test('A1 : ton année en films, les chiffres de l\'année', () => {
  const { ctx } = chargerApp();
  const vus = [
    vu({ titre: 'Ancien', date: '2025-03', annee: 1990, pays: 'France', real: 'R1', genres_real: [2], nes: ['France'] }),
    vu({ titre: 'A', date: '2026-01', annee: 2026, note: 6, duree: 120, genres: ['Drame'], pays: 'France · Japan', real: 'Elle', genres_real: [1], cast: ['X'], cast_genders: [1], nes: ['Japan'], affiche: 'a.jpg' }),
    vu({ titre: 'B', date: '2026-01', annee: 1978, note: 2, duree: 90, genres: ['Drame', 'Comédie'], pays: 'France', real: 'R1', genres_real: [2], cast: ['X'], cast_genders: [2], nes: ['France'] }),
    vu({ titre: 'C', date: '2026-02', annee: 2021, note: 4, duree: 100, genres: ['Comédie'], pays: 'Nepal', real: 'Lui', genres_real: [2], nes: [''] }),
    vu({ titre: 'D', date: '2026', annee: 2026, note: 3, duree: 0, genres: ['Drame'] }),
  ];
  const d = ctx.donneesAnnee(vus, '2026', new Date(2026, 1, 28));
  assert.equal(d.films, 4);
  assert.equal(d.minutes, 310);
  assert.equal(d.heures, 5);
  assert.equal(d.tousLes, 15);            // 58 jours (au 28 février) / 4 films
  assert.equal(d.nouveautes, 2);
  assert.equal(d.rattrapages, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(d.decennies)), [[1970, 1], [2020, 1]]);
  assert.equal(d.plusAncien.title, 'B');
  assert.deepEqual([...d.mois.slice(0, 3)], [2, 1, 0]);
  assert.equal(d.moisTop, 0);
  assert.equal(d.filmDuMois.title, 'A');
  assert.deepEqual([...d.top.map(f => f.title)], ['A', 'C', 'D', 'B']);
  assert.equal(d.coeurs, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(d.genres)), [['Drame', 3], ['Comédie', 2]]);
  assert.equal(d.femmes, 25);
  assert.equal(d.premierRoleFeminin, 25);
  assert.equal(d.realisatricesDecouvertes, 1);
  assert.equal(d.production.n, 3);
  assert.deepEqual([...d.production.nouveaux], ['Japon', 'Népal']);
  assert.equal(d.naissance.n, 2);
  assert.deepEqual([...d.affichesMonde.map(x => x.film.title)], ['A']);
  assert.deepEqual({ ...d.acteur }, { nom: 'X', films: 2 });
});

test('A1 : une année passée compte ses 365 jours', () => {
  const { ctx } = chargerApp();
  const d = ctx.donneesAnnee([vu({ titre: 'A', date: '2025-05', annee: 2025 })], '2025', new Date(2026, 10, 24));
  assert.equal(d.enCours, false);
  assert.equal(d.tousLes, 365);
});
