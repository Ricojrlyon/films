// Dates et fuseaux : un appareil à New York (voyage, visiteur à l'étranger)
// doit voir les séances et les mois comme à Paris. Messages, notes, envois.
process.env.TZ = 'America/New_York';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerApp } from './charger.mjs';

// Heure de Paris décalée de quelques minutes, au format des séances
const parisDans = minutes => {
  const p = {};
  for (const x of new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(Date.now() + minutes * 60000))) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

test('D6 : séances de Lyon jugées à l\'heure de Paris, pas à celle de l\'appareil', async () => {
  const { ctx } = chargerApp();
  const programme = { salles: [{ code: 'P1', nom: 'Salle' }],
    films: [{ tmdb: 1, salles: { P1: [[parisDans(-30), ''], [parisDans(30), 'VO']] } }] };
  ctx.fetch = async () => ({ ok: true, json: async () => programme });
  await ctx.chargerLyon();
  const seances = ctx.seancesLyon('movie-1').P1 || [];
  assert.equal(seances.length, 1, 'séance passée à Paris encore affichée : ' + JSON.stringify(seances));
});

test('D7 : « aujourd\'hui » est la date de Paris (0 h 30 le 1er novembre)', () => {
  const { ctx, app } = chargerApp();
  const instant = Date.parse('2026-10-31T23:30:00Z'); // 1er novembre, 0 h 30 à Paris
  ctx.Date = class extends Date {
    constructor(...a) { super(...(a.length ? a : [instant])); }
    static now() { return instant; }
  };
  assert.equal(app.aujourdhuiParis(), '2026-11-01');
});

test('D7 : Reco, films vus il y a 6 mois comptés sur un appareil à l\'ouest de Greenwich', () => {
  const { ctx, app } = chargerApp();
  const instant = Date.parse('2026-11-10T12:00:00Z');
  ctx.Date = class extends Date {
    constructor(...a) { super(...(a.length ? a : [instant])); }
    static now() { return instant; }
  };
  app.state.films = Array.from({ length: 5 }, (_, i) => ({ id: 'movie-' + i, tmdb_id: i + 1, type: 'movie',
    user: { statut: 'vu', rating: 4, date_vue: '2026-05' } }));
  assert.match(JSON.stringify(ctx.pickRecoSources()), /4\+ étoiles vus dans les 6 derniers mois/);
});

test('D8 : une note 7 devient 6, donc coup de cœur', () => {
  const { ctx } = chargerApp();
  const films = [{ user: { rating: 7, favorite: false } }];
  ctx.normalizeRatings(films);
  assert.equal(films[0].user.rating, 6);
  assert.equal(films[0].user.favorite, true);
});

test('D9 : messages d\'erreur compréhensibles', () => {
  const { ctx } = chargerApp();
  assert.match(ctx.messageErreur(new Error('Failed to fetch')), /connexion perdue/);
  assert.match(ctx.messageErreur(new Error('github put 401: Bad credentials')), /token refusé/);
  assert.match(ctx.messageErreur(new Error('github put 409: conflict')), /changer sur un autre appareil/);
  assert.equal(ctx.messageErreur(new Error('autre chose')), 'autre chose');
});

test('D10 : un enregistrement en cours est compté (la page demande avant de se fermer)', async () => {
  const { ctx, app } = chargerApp();
  let fin;
  ctx.doSaveFilmsToGithub = () => new Promise(ok => { fin = ok; });
  const envoi = ctx.saveFilmsToGithub('test');
  await new Promise(ok => setTimeout(ok, 10));
  assert.equal(app.envoisEnCours, 1);
  fin();
  await envoi;
  assert.equal(app.envoisEnCours, 0);
});
