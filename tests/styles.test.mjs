// Accessibilité de style.css : contraste du texte secondaire, repère du clavier
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// FILMS_STYLE_CSS=<chemin> : tester une autre copie (comme FILMS_APP_JS dans charger.mjs)
const css = fs.readFileSync(process.env.FILMS_STYLE_CSS || new URL('../style.css', import.meta.url), 'utf8');
const couleur = nom => css.match(new RegExp('--' + nom + ':\\s*(#[0-9a-f]{6})', 'i'))[1];

// Contraste WCAG 2.x entre deux couleurs #rrggbb
function contraste(a, b) {
  const lum = h => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('X1 : le texte gris (--ink-mute) atteint 4,5:1 sur les trois fonds', () => {
  for (const fond of ['bg', 'bg-elev', 'bg-elev-2']) {
    const r = contraste(couleur('ink-mute'), couleur(fond));
    assert.ok(r >= 4.5, `--ink-mute sur --${fond} : ${r.toFixed(2)}:1`);
  }
});

test('X2 : les liens ont un repère du clavier visible', () => {
  const regle = css.match(/([^{}]*:focus-visible[^{}]*)\{\s*outline:\s*2px solid var\(--warm\)/);
  assert.ok(regle, 'règle de focus introuvable');
  assert.match(regle[1], /(^|[\s,])a:focus-visible/, 'les liens (a) n\'y sont pas');
  assert.match(regle[1], /\.edit-form input:focus-visible/, 'les champs du formulaire d\'édition n\'y sont pas');
});

test('X5 : section parité, une seule couleur pour les hommes et une pour les femmes', () => {
  // Toute règle .male / .female de la section prend --homme / --femme, jamais une couleur écrite à la main
  const regles = [...css.matchAll(/([^{}]*\.(?:male|female)\b[^{}]*)\{([^}]*)\}/g)];
  assert.ok(regles.length >= 4, 'règles introuvables');
  for (const [, sel, corps] of regles) {
    const fond = (corps.match(/background:\s*([^;]+)/) || [])[1] || '';
    const attendu = /\.female\b/.test(sel) ? 'var(--femme)' : 'var(--homme)';
    assert.equal(fond.trim(), attendu, sel.trim());
  }
  // Texte foncé lisible sur les segments
  for (const nom of ['homme', 'femme']) {
    const r = contraste(couleur(nom), couleur('bg'));
    assert.ok(r >= 4.5, `--bg sur --${nom} : ${r.toFixed(2)}:1`);
  }
});
