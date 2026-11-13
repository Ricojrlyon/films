// Accessibilité et compatibilité vérifiables dans style.css et index.html
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lire = (env, nom) => fs.readFileSync(process.env[env] || new URL('../' + nom, import.meta.url), 'utf8');
const css = lire('FILMS_STYLE_CSS', 'style.css');
const html = lire('FILMS_INDEX_HTML', 'index.html');
// Déclarations qui s'appliquent à un sélecteur : toutes les règles dont la liste
// de sélecteurs le contient (une règle commune à plusieurs pastilles compte aussi)
const regle = sel => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .filter(([, selecteurs]) => selecteurs.split(',').map(x => x.trim()).includes(sel))
  .map(([, , corps]) => corps).join('\n');
const couleur = nom => css.match(new RegExp('--' + nom + ':\\s*(#[0-9a-f]{6})', 'i'))[1];
const rvb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

function contraste(a, b) {
  const lum = c => {
    const [r, g, bl] = c.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
// Voile rgba(r, g, b, a) posé sur une affiche (fond)
const voile = (r, a, fond) => r.map((v, i) => v * a + fond[i] * (1 - a));
const BLANC = [255, 255, 255], NOIR = [0, 0, 0];

test('X3 : pastilles lisibles sur une affiche claire comme sombre', () => {
  for (const sel of ['.card .rating-badge', '.card.to-watch .a-voir-badge', '.card .cine-badge', '.card .canal-badge', '.card .lyon-badge']) {
    const r = regle(sel);
    const [, a] = r.match(/background:\s*rgba\(22, 31, 37, ([\d.]+)\)/) || [];
    const texte = (r.match(/\bcolor:\s*var\(--([\w-]+)\)/) || [])[1];
    assert.ok(a && texte, sel + ' : voile ou couleur introuvable');
    for (const fond of [BLANC, NOIR]) {
      const c = contraste(rvb(couleur(texte)), voile([22, 31, 37], +a, fond));
      assert.ok(c >= 4.5, `${sel} sur affiche ${fond === BLANC ? 'claire' : 'sombre'} : ${c.toFixed(2)}:1`);
    }
  }
});

test('X4 : texte foncé sur l\'orange du coup de cœur et le rouge de « supprimer »', () => {
  for (const sel of ['.card .rating-badge.favorite', '.rating-chip.fav.active', '.edit-delete:hover']) {
    assert.match(regle(sel), /color:\s*var\(--bg\)/, sel + ' : texte blanc sur fond vif (2,8 à 3,1:1)');
  }
});

test('X8 : pas de content-visibility sur les sections des stats', () => {
  assert.doesNotMatch(regle('.chart-section'), /^\s*content-visibility\s*:/m);
});

test('X10 : le champ de recherche peut rétrécir (bouton « + filtres » entier à 320 px)', () => {
  assert.match(regle('.search-wrap'), /min-width:\s*0/);
});

test('X12 : cibles tactiles du pied de page et de la heatmap', () => {
  assert.match(regle('.footer a'), /padding:\s*6px/);
  assert.match(regle('.footer-btn'), /padding:\s*6px/);
  assert.match(css, /\.heatmap-cell \{ font-size: 9px; aspect-ratio: 1\.3 \/ 1;/);
});

test('C1 : pas de viewport-fit=cover sans marges de sécurité', () => {
  assert.ok(!/viewport-fit=cover/.test(html) || /safe-area-inset/.test(css));
});

test('X9 : toast et nombre de résultats annoncés', () => {
  assert.match(html, /id="toast" role="status" aria-live="polite"/);
  assert.match(html, /class="results-count" aria-live="polite"/);
});

test('X6 et X11 : fenêtres déclarées, étiquettes reliées aux champs', () => {
  assert.match(html, /id="admin-setup-backdrop">\s*<article[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="rematch-backdrop">\s*<article[^>]*role="dialog"[^>]*aria-labelledby="rematch-title"/);
  for (const id of ['admin-setup-pat', 'admin-setup-code', 'admin-setup-code-confirm', 'admin-unlock-code', 'rematch-input']) {
    assert.match(html, new RegExp('<label for="' + id + '"'), id + ' sans étiquette reliée');
  }
});
