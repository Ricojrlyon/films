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
