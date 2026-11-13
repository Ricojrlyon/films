// Charge app.js dans Node, sans navigateur, pour tester ses fonctions :
// le démarrage (section BOOT) est coupé, la page est remplacée par des
// « bouche-trous ». Le site publié ne dépend pas de ce fichier.
//   const { ctx, app } = chargerApp();
//   ctx : l'espace global du script (ses fonctions, remplaçables : ctx.ghPutFile = …)
//   app : ses variables let/const (app.state, app.sessionChanges…)
// FILMS_APP_JS=<chemin> fait charger une autre copie (ex. l'ancienne version,
// pour vérifier qu'un test échouait bien avant la correction).
import fs from 'node:fs';
import vm from 'node:vm';

const CHEMIN = process.env.FILMS_APP_JS || new URL('../app.js', import.meta.url);

// Objet passe-partout : toute propriété, tout appel rend un autre passe-partout
export const trou = () => new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : trou()),
  set: () => true,
  apply: () => trou(),
  construct: () => trou(),
});

export function chargerApp(chemin = CHEMIN) {
  const src = fs.readFileSync(chemin, 'utf8');
  const coupe = src.indexOf('// BOOT');
  const code = src.slice(0, src.lastIndexOf('\n// ====', coupe));
  const memoire = new Map();
  const ctx = {
    console, setTimeout, clearTimeout, queueMicrotask, URL, Intl, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    document: trou(), navigator: { userAgent: 'node' }, location: { hostname: 'localhost', href: 'http://localhost/' },
    history: trou(), addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: {
      getItem: k => (memoire.has(k) ? memoire.get(k) : null),
      setItem: (k, v) => memoire.set(k, String(v)), removeItem: k => memoire.delete(k),
      key: i => [...memoire.keys()][i] ?? null, get length() { return memoire.size; },
    },
    fetch: async () => { throw new Error('réseau coupé (test)'); },
    confirm: () => true,
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  // Les let/const du haut du fichier ne deviennent pas des propriétés de
  // l'espace global : on les expose à la fin du script, par des accesseurs
  // (une variable réaffectée par le code, comme canalSet, est lue à jour)
  const noms = [...code.matchAll(/^(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  vm.runInContext(code + '\n;globalThis.__app = {' + [...new Set(noms)].map(n => `get ${n}() { return ${n}; }`).join(',') + '};',
    ctx, { filename: 'app.js' });
  return { ctx, app: ctx.__app };
}
