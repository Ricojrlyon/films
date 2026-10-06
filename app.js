// *films — code de l'application (chargé à la fin d'index.html)
'use strict';

// ============================================================
// STATE
// ============================================================
// « à voir » s'ouvre dans l'ordre d'ajout (le plus récent d'abord — chaque
// ajout se fait en tête du tableau, son ordre EST l'ordre d'ajout).
// « vus » reste sur la date de visionnage : les ~500 films de la migration
// initiale ont tous été ajoutés d'un coup, leur ordre d'ajout ne veut rien dire.
const TAB_SORT_DEFAULTS = {
  vu: 'date_vue_desc',
  a_voir: 'added_desc',
};

const state = {
  films: [],
  filtered: [],
  view: 'a_voir',           // 'a_voir' | 'vu' | 'discover' | 'reco'
  filters: {
    status: 'a_voir',       // shadows view for filtering logic
    search: '',
    genre: '',
    lieu: '',
    decade: '',
    yearvu: '',
    mois: '',
    country: '',
    dirCountry: '',
    ratings: new Set(),
  },
  sort: TAB_SORT_DEFAULTS.a_voir,
  page: 1,
  pageSize: 60,
  // Discover view
  discoverCategory: 'now_playing',
  discoverFilters: { genre: '', country: '', decade: '', sort: 'popularity.desc', hideCollection: false },
  discoverCache: {},       // { 'catégorie|genre|pays': [items] } — session cache
  discoverSearchTimer: null,
  lastTmdbItems: null,      // dernière liste TMDB affichée (re-rendu du masquage sans refetch)
  // Reco view
  recoPool: null,           // full ranked candidates
  recoDisplayed: null,      // current month's selection
};

// ============================================================
// LOAD DATA
// ============================================================
// ── Notation : 6 crans ordinaux — 1 à 5 étoiles, puis le coup de cœur ───────
// Les deux sont exclusifs : un film porte soit des étoiles, soit un ❤.
// Le ❤ est le cran au-dessus de 5★, stocké en `rating: 6` + `favorite: true`.
const RATING_MAX = 5;   // nombre d'étoiles de l'échelle
const RATING_FAV = 6;   // cran « coup de cœur »
// Normalise à la lecture, de façon idempotente : tolère les films.json écrits
// par une version antérieure et fait respecter l'exclusivité des deux crans.
function normalizeRatings(films) {
  for (const f of films || []) {
    const u = f && f.user;
    if (!u) continue;
    if (u.favorite || u.rating === RATING_FAV) { u.rating = RATING_FAV; u.favorite = true; }
    else { u.favorite = false; }
    if (u.rating > RATING_FAV) u.rating = RATING_FAV;
  }
  return films;
}
// Équivalent /10 affiché en regard de la moyenne TMDB. Les étoiles montent
// jusqu'à 9,5 : le 10/10 est réservé au coup de cœur. Toute la conversion
// passe par ici — changer d'échelle = changer ce tableau.
const RATING_OUT_OF_10 = [2, 4, 6, 8, 9.5, 10];
function ratingOutOf10(rating) { return RATING_OUT_OF_10[rating - 1]; }
function formatOutOf10(rating) {
  const v = ratingOutOf10(rating);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

async function loadFilms() {
  try {
    // Cache-buster : le CDN de GitHub Pages sert films.json avec ~10 min de cache
    const r = await fetch('./films.json?t=' + Date.now());
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    state.films = normalizeRatings(data.films || []);
    initFilters();
    // Reflect initial sort in the sort select
    document.getElementById('sort').value = state.sort;
    applyFilters();
    refreshStats();
  } catch (e) {
    document.getElementById('grid').innerHTML =
      `<div style="grid-column: 1/-1;" class="empty">
        <div class="empty-title">impossible de charger films.json</div>
        <div>${escapeHtml(e.message)}</div>
      </div>`;
  }
}

// ============================================================
// INIT FILTERS (populate dropdowns from data)
// ============================================================
function initFilters() {
  // Genres: union of all genres
  const genres = new Set();
  state.films.forEach(f => (f.genres || []).forEach(g => genres.add(g)));
  fillSelect('filter-genre', [...genres].sort());

  // Lieux
  const lieux = new Set();
  state.films.forEach(f => { if (f.user?.lieu) lieux.add(f.user.lieu); });
  fillSelect('filter-lieu', [...lieux].sort());

  // Decades
  const decades = new Set();
  state.films.forEach(f => {
    if (f.year) decades.add(Math.floor(f.year / 10) * 10);
  });
  fillSelect('filter-decade',
    [...decades].sort((a, b) => b - a).map(d => ({ value: d, label: d + 's' })));

  // Année vue (from date_vue: "YYYY", "YYYY-MM", "before-YYYY")
  const yearsVu = new Set();
  state.films.forEach(f => {
    const dv = f.user?.date_vue;
    if (!dv) return;
    if (dv.startsWith('before-')) yearsVu.add('before-' + dv.slice(7));
    else if (dv.length >= 4) yearsVu.add(dv.slice(0, 4));
  });
  // Sort years vu: regular years descending, then "before-..."
  const sorted = [...yearsVu].sort((a, b) => {
    const aIsBefore = a.startsWith('before-');
    const bIsBefore = b.startsWith('before-');
    if (aIsBefore && !bIsBefore) return 1;
    if (!aIsBefore && bIsBefore) return -1;
    if (aIsBefore && bIsBefore) return a.localeCompare(b);
    return b.localeCompare(a);
  });
  fillSelect('filter-yearvu',
    sorted.map(y => y.startsWith('before-')
      ? { value: y, label: 'avant ' + y.slice(7) }
      : { value: y, label: y }));

  // Pays de production (en français, une entrée par pays même en co-production)
  const paysFilm = new Set();
  state.films.forEach(f => {
    if (!f.country) return;
    f.country.split(' · ').forEach(c => { const n = countryFr(c.trim()); if (n) paysFilm.add(n); });
  });
  fillSelect('filter-country', [...paysFilm].sort((a, b) => a.localeCompare(b, 'fr')));

  // Pays de naissance des réalisateurs (données enrichies)
  const paysReal = new Set();
  state.films.forEach(f => dirCountriesOf(f).forEach(c => paysReal.add(c)));
  fillSelect('filter-realpays', [...paysReal].sort((a, b) => a.localeCompare(b, 'fr')));

  // fillSelect remet le DOM sur le placeholder : réappliquer les filtres actifs,
  // sinon les selects affichent « tous » alors que la liste reste filtrée
  const selMap = { 'filter-genre': 'genre', 'filter-lieu': 'lieu', 'filter-decade': 'decade', 'filter-yearvu': 'yearvu', 'filter-country': 'country', 'filter-realpays': 'dirCountry' };
  Object.entries(selMap).forEach(([id, key]) => {
    if (!state.filters[key]) return;
    const sel = document.getElementById(id);
    sel.value = String(state.filters[key]);
    // Option disparue (ex. dernier film du genre supprimé) → désactiver le filtre
    if (sel.value !== String(state.filters[key])) state.filters[key] = '';
  });

  // Counts on status tabs
  document.getElementById('count-vu').textContent = state.films.filter(f => f.user?.statut === 'vu').length;
  document.getElementById('count-a_voir').textContent = state.films.filter(f => f.user?.statut === 'a_voir').length;
}

function fillSelect(id, items) {
  const sel = document.getElementById(id);
  if (!sel) return;
  // Keep first option (the "all" placeholder)
  const placeholder = sel.firstElementChild ? sel.firstElementChild.cloneNode(true) : null;
  sel.innerHTML = '';
  if (placeholder) sel.appendChild(placeholder);
  for (const it of items) {
    const opt = document.createElement('option');
    if (typeof it === 'object') { opt.value = it.value; opt.textContent = it.label; }
    else { opt.value = it; opt.textContent = it; }
    sel.appendChild(opt);
  }
}

// ============================================================
// FILTERING + SORTING
// ============================================================
function applyFilters(opts) {
  opts = opts || {};
  const f = state.filters;
  let list = state.films.slice();

  // Status
  if (f.status === 'vu') list = list.filter(x => x.user?.statut === 'vu');
  else if (f.status === 'a_voir') list = list.filter(x => x.user?.statut === 'a_voir');

  // Search
  if (f.search) {
    const q = normSearch(f.search);
    list = list.filter(x => {
      const fields = [x.title, x.original_title, x.director, (x.cast || []).join(' '), (x.source?.csv_title || ''), titleCache.get(x.id) || ''];
      return fields.some(s => s && normSearch(s).includes(q));
    });
  }

  if (f.genre) list = list.filter(x => (x.genres || []).includes(f.genre));
  if (f.lieu) list = list.filter(x => x.user?.lieu === f.lieu);
  if (f.decade) {
    const d = parseInt(f.decade, 10);
    list = list.filter(x => x.year && x.year >= d && x.year < d + 10);
  }
  if (f.yearvu) {
    list = list.filter(x => {
      const dv = x.user?.date_vue;
      if (!dv) return false;
      if (f.yearvu.startsWith('before-')) return dv === 'before-' + f.yearvu.slice(7);
      return dv.startsWith(f.yearvu);
    });
  }
  if (f.mois) {
    // Le mois n'existe que pour les dates "YYYY-MM" (les "YYYY" et "before-"
    // n'ont pas de mois connu). Se combine avec « année vue » en ET.
    list = list.filter(x => {
      const dv = x.user?.date_vue;
      return dv && /^\d{4}-\d{2}$/.test(dv) && dv.slice(5, 7) === f.mois;
    });
  }
  if (f.country) {
    // Une co-production compte pour chacun de ses pays (noms en français)
    list = list.filter(x => x.country &&
      x.country.split(' · ').map(c => countryFr(c.trim())).includes(f.country));
  }
  if (f.dirCountry) {
    list = list.filter(x => dirCountriesOf(x).includes(f.dirCountry));
  }
  if (f.ratings.size > 0) {
    list = list.filter(x => x.user?.rating && f.ratings.has(x.user.rating));
  }

  // Sort
  sortList(list, state.sort);

  state.filtered = list;
  if (!opts.preservePage) state.page = 1;
  viewTransition(renderGrid);
  updateFilterBadge();
}

// Fondu global au changement de filtre/vue via l'API View Transitions.
// Garde-fou : dans un onglet caché, startViewTransition n'appelle jamais son
// callback → l'affichage se figerait ; on rend alors directement. Idem si
// l'API manque ou si l'utilisateur réduit les animations. Pas de
// view-transition-name par carte (coût prohibitif au-delà de quelques dizaines).
let firstRenderDone = false;
let vtActive = false; // évite les transitions qui se chevauchent (overlay figé)
function viewTransition(run) {
  const animate = firstRenderDone
    && !vtActive
    && typeof document.startViewTransition === 'function'
    && document.visibilityState === 'visible'
    && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  firstRenderDone = true;
  if (!animate) { run(); return; }
  vtActive = true;
  try {
    const t = document.startViewTransition(() => run());
    t.finished.finally(() => { vtActive = false; });
  } catch (_) { vtActive = false; run(); }
}

function normSearch(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function sortList(list, sortKey) {
  // For date_vue, we want a sortable string. "before-2022" < "2022" < "2022-01" < ...
  // Treat "before-YYYY" as "YYYY-00" effectively (older than any month of that year).
  const dvKey = x => {
    const dv = x.user?.date_vue || '';
    if (!dv) return '0000';
    if (dv.startsWith('before-')) return dv.slice(7) + '-00';
    if (dv.length === 4) return dv + '-06';   // year only → mid-year
    return dv;
  };

  switch (sortKey) {
    case 'added_desc': {
      // L'ordre du tableau films.json est l'ordre d'ajout (insertion en tête) :
      // index croissant = ajouté le plus récemment d'abord
      const order = new Map(state.films.map((f, i) => [f.id, i]));
      list.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
      break;
    }
    case 'date_vue_desc':
      list.sort((a, b) => dvKey(b).localeCompare(dvKey(a))); break;
    case 'date_vue_asc':
      list.sort((a, b) => dvKey(a).localeCompare(dvKey(b))); break;
    case 'rating_desc':
      list.sort((a, b) => (b.user?.rating || 0) - (a.user?.rating || 0) || dvKey(b).localeCompare(dvKey(a))); break;
    case 'title_asc':
      list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'fr')); break;
    case 'year_desc':
      list.sort((a, b) => {
        const ya = a.year || 0, yb = b.year || 0;
        if (ya === yb) return (a.title || '').localeCompare(b.title || '', 'fr');
        return yb - ya;
      }); break;
    case 'year_asc':
      list.sort((a, b) => {
        const ya = a.year || 9999, yb = b.year || 9999;  // nulls last
        if (ya === yb) return (a.title || '').localeCompare(b.title || '', 'fr');
        return ya - yb;
      }); break;
  }
}

function updateFilterBadge() {
  const f = state.filters;
  let active = ['genre', 'lieu', 'decade', 'yearvu', 'mois', 'country', 'dirCountry'].filter(k => f[k]).length;
  if (f.ratings.size > 0) active++;
  const badge = document.getElementById('filter-badge');
  if (active > 0) {
    badge.style.display = '';
    badge.textContent = active;
  } else {
    badge.style.display = 'none';
  }
}

// ============================================================
// RENDER GRID
// ============================================================
function renderGrid(opts) {
  opts = opts || {};
  const grid = document.getElementById('grid');
  // Rendu plein : libérer les observations d'affiches des cartes remplacées
  // (les éléments hors DOM jamais intersectés resteraient enregistrés)
  if (!opts.append && posterObserver) posterObserver.disconnect();
  const empty = document.getElementById('empty');
  const loadMoreWrap = document.getElementById('load-more-wrap');
  const total = state.filtered.length;
  document.getElementById('result-count').textContent = total;

  if (total === 0) {
    grid.innerHTML = '';
    empty.style.display = '';
    loadMoreWrap.style.display = 'none';
    return;
  }
  empty.style.display = 'none';

  const visible = state.filtered.slice(0, state.page * state.pageSize);
  // « Charger plus » (append) : n'ajouter que la nouvelle tranche —
  // reconstruire les centaines de cartes déjà affichées devient
  // quadratique au fil des pages
  const start = opts.append ? Math.min(grid.children.length, visible.length) : 0;
  if (!opts.append) grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const f of visible.slice(start)) frag.appendChild(buildCard(f));
  grid.appendChild(frag);
  fillCardMeta();

  if (visible.length < total) {
    loadMoreWrap.style.display = '';
    document.getElementById('load-more').textContent =
      `charger plus (${total - visible.length} restants)`;
  } else {
    loadMoreWrap.style.display = 'none';
  }
}

// Lazy-load des affiches : l'URL attend dans data-poster jusqu'à l'approche
// du viewport — sinon les 60 cartes d'une page chargent toutes leurs images
// d'un coup. rootMargin large pour précharger juste avant l'arrivée.
const posterObserver = ('IntersectionObserver' in window)
  ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        showPoster(e.target, e.target.dataset.poster);
        delete e.target.dataset.poster;
        posterObserver.unobserve(e.target);
      }
    }, { rootMargin: '400px' })
  : null;

function setLazyPoster(el, url) {
  if (posterObserver) {
    el.dataset.poster = url;
    posterObserver.observe(el);
  } else {
    showPoster(el, url);
  }
}

// Affiche injoignable (image retirée de TMDB, réseau coupé) : la carte
// retombe sur son titre, comme une carte sans affiche. L'image témoin
// réutilise le téléchargement du fond, sans le doubler.
function showPoster(el, url) {
  el.style.backgroundImage = `url(${url})`;
  const probe = new Image();
  probe.onerror = () => {
    el.style.backgroundImage = '';
    el.classList.add('empty');
    el.prepend(el.closest('.card')?.querySelector('.card-title')?.textContent || '');
  };
  probe.src = url;
}

function buildCard(f) {
  const card = document.createElement('div');
  card.className = 'card' + (f.user?.statut === 'a_voir' ? ' to-watch' : '');
  card.tabIndex = 0;
  card.addEventListener('click', () => openModal(f));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(f); }
  });

  const poster = document.createElement('div');
  poster.className = 'poster' + (f.poster ? '' : ' empty');
  if (f.poster) setLazyPoster(poster, tmdbResize(f.poster, 'w342'));
  else poster.textContent = displayTitle(f.id, f.title);
  card.appendChild(poster);

  // rating badge
  if (f.user?.rating) {
    const badge = document.createElement('div');
    badge.className = 'rating-badge' + (f.user.favorite ? ' favorite' : '');
    badge.innerHTML = f.user.favorite
      ? '❤'
      : `<span class="star">★</span>${f.user.rating}`;
    poster.appendChild(badge);
  }

  // À voir badge
  if (f.user?.statut === 'a_voir') {
    const a = document.createElement('div');
    a.className = 'a-voir-badge';
    a.textContent = 'à voir';
    poster.appendChild(a);
  }

  // « au ciné » : actuellement en salles en France
  if (nowPlayingSet.has(f.id)) {
    const c = document.createElement('div');
    c.className = 'cine-badge';
    c.textContent = 'au ciné';
    poster.appendChild(c);
  }

  // meta (title + year)
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `
    <p class="card-title">${escapeHtml(displayTitle(f.id, f.title) || 'sans titre')}</p>
    <div class="card-meta-line">
      <span class="card-year">${f.year || '?'}${f.type === 'tv' ? ' · série' : ''}</span>
      <span class="card-director"></span>
    </div>`;
  card.appendChild(meta);
  // réalisateur : nom latinisé (résolu à la demande si l'un d'eux ne l'est pas)
  card.dataset.filmId = f.id;
  if (f.tmdb_id) card.dataset.tmdbId = f.tmdb_id;
  card.dataset.mediaType = f.type || 'movie';
  const pd = provisionalDirector(f.id);
  if (pd) meta.querySelector('.card-director').textContent = pd;

  return card;
}

// ============================================================
// VIEW MANAGEMENT (à voir / vus / discover / reco)
// ============================================================
function setView(view) {
  state.view = view;
  // Update tab active states
  document.querySelectorAll('#status-tabs .tab').forEach(x => x.classList.remove('active'));
  const activeTab = document.querySelector(`#status-tabs .tab[data-view="${view}"]`);
  if (activeTab) activeTab.classList.add('active');

  const isCollection = (view === 'a_voir' || view === 'vu');
  const isDiscover = view === 'discover';
  const isReco = view === 'reco';

  // Show/hide UI per view
  document.getElementById('collection-controls').style.display = isCollection ? '' : 'none';
  document.getElementById('filter-panel').classList.remove('open');
  // Resynchroniser le bouton du tiroir (label + aria) sur l'état fermé
  const ftBtn = document.getElementById('filter-toggle');
  if (ftBtn) {
    ftBtn.setAttribute('aria-expanded', 'false');
    const ftLabel = document.getElementById('filter-toggle-label');
    if (ftLabel) ftLabel.textContent = '+ filtres';
  }
  document.getElementById('discover-header').style.display = isDiscover ? '' : 'none';
  document.getElementById('reco-header').style.display = isReco ? '' : 'none';

  // Trigger view-specific render
  if (isCollection) {
    state.filters.status = view;
    state.sort = TAB_SORT_DEFAULTS[view] || 'date_vue_desc';
    document.getElementById('sort').value = state.sort;
    applyFilters();
  } else if (isDiscover) {
    initDiscoverFilterOptions();
    fetchAndRenderDiscover(state.discoverCategory);
  } else if (isReco) {
    fetchAndRenderReco();
  }
}

// ============================================================
// DISCOVER VIEW
// ============================================================
// Filtres effectifs pour une catégorie : la décennie ne s'applique que sur
// « tendances » (les deux autres catégories imposent leur fenêtre de dates)
function discoverEffectiveFilters(category) {
  const f = state.discoverFilters;
  return {
    genre: f.genre || '',
    country: f.country || '',
    decade: category === 'trending' ? (f.decade || '') : '',
    sort: f.sort || 'popularity.desc',
  };
}

// Clé de cache/course : la même catégorie avec d'autres filtres est un
// autre jeu de résultats
function discoverCacheKey(category) {
  const f = discoverEffectiveFilters(category);
  return [category, f.genre, f.country, f.decade, f.sort].join('|');
}

// Options des filtres découvrir, remplies au premier passage dans la vue
let discoverCountriesLoaded = false;
let discoverGenresLoaded = false;
async function initDiscoverFilterOptions() {
  if (!discoverCountriesLoaded) {
    discoverCountriesLoaded = true;
    // Pays : la table ISO déjà utilisée pour les fiches, en français, triée par nom
    const csel = document.getElementById('discover-country');
    Object.entries(ISO_TO_COUNTRY)
      .map(([code, name]) => [code, countryFr(name)])
      .sort((a, b) => a[1].localeCompare(b[1], 'fr'))
      .forEach(([code, name]) => {
        const o = document.createElement('option');
        o.value = code;
        o.textContent = name.toLowerCase();
        csel.appendChild(o);
      });
    // Décennies (pertinentes sur « tendances » uniquement)
    const dsel = document.getElementById('discover-decade');
    for (let d = 2020; d >= 1950; d -= 10) {
      const o = document.createElement('option');
      o.value = String(d);
      o.textContent = 'années ' + d;
      dsel.appendChild(o);
    }
  }
  if (!discoverGenresLoaded) {
    try {
      const r = await fetch(`${TMDB_BASE}/genre/movie/list?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR`);
      if (!r.ok) return;
      const genres = (await r.json()).genres || [];
      const gsel = document.getElementById('discover-genre');
      genres.forEach(g => {
        const o = document.createElement('option');
        o.value = g.id;
        o.textContent = g.name.toLowerCase();
        gsel.appendChild(o);
      });
      discoverGenresLoaded = true;
    } catch { /* réseau — retenté au prochain passage dans la vue */ }
  }
}

async function fetchAndRenderDiscover(category) {
  state.discoverCategory = category;
  // Update active pill
  document.querySelectorAll('#discover-categories .explorer-cat').forEach(p => p.classList.toggle('active', p.dataset.cat === category));
  // La décennie n'a de sens que sur « tendances »
  const decadeSel = document.getElementById('discover-decade');
  if (decadeSel) decadeSel.disabled = category !== 'trending';
  // Marquage visuel des filtres actifs
  ['discover-genre', 'discover-country', 'discover-decade'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.classList.toggle('active', !!sel.value && !sel.disabled);
  });
  const sortSel = document.getElementById('discover-sort');
  if (sortSel) sortSel.classList.toggle('active', sortSel.value !== 'popularity.desc');

  const grid = document.getElementById('grid');
  const countEl = document.getElementById('result-count');
  const resultsHeader = document.getElementById('results-header');
  resultsHeader.style.display = '';

  // Session cache
  const cacheKey = discoverCacheKey(category);
  if (state.discoverCache[cacheKey]) {
    renderTmdbGrid(state.discoverCache[cacheKey]);
    return;
  }

  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--ink-mute); font-style: italic;">chargement tmdb…</div>';
  countEl.textContent = '…';
  try {
    const results = await tmdbBrowse(category, discoverEffectiveFilters(category));
    state.discoverCache[cacheKey] = results;
    // La vue, la catégorie OU les filtres ont pu changer pendant le fetch —
    // ne pas écraser la grille (réponses croisées)
    if (state.view !== 'discover' || cacheKey !== discoverCacheKey(state.discoverCategory)) return;
    renderTmdbGrid(results);
  } catch (e) {
    if (state.view !== 'discover' || cacheKey !== discoverCacheKey(state.discoverCategory)) return;
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--red);">erreur tmdb : ${escapeHtml(e.message)}</div>`;
    countEl.textContent = '0';
  }
}

let discoverSearchSeq = 0;
async function handleDiscoverSearch(query) {
  // Jeton de séquence : une réponse lente ne doit pas écraser celle d'une frappe plus récente
  const seq = ++discoverSearchSeq;
  // Switch from category browse to search
  const grid = document.getElementById('grid');
  const countEl = document.getElementById('result-count');
  if (!query || query.length < 2) {
    // Re-load category
    fetchAndRenderDiscover(state.discoverCategory);
    return;
  }
  // Clear active pill while searching
  document.querySelectorAll('#discover-categories .explorer-cat').forEach(p => p.classList.remove('active'));
  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--ink-mute); font-style: italic;">recherche…</div>';
  countEl.textContent = '…';
  try {
    const results = await tmdbSearch(query);
    // L'utilisateur a pu changer de vue ou relancer une recherche pendant le fetch
    if (seq !== discoverSearchSeq || state.view !== 'discover') return;
    renderTmdbGrid(results.slice(0, 40));
  } catch (e) {
    if (seq !== discoverSearchSeq || state.view !== 'discover') return;
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--red);">erreur tmdb : ${escapeHtml(e.message)}</div>`;
    countEl.textContent = '0';
  }
}

function renderTmdbGrid(items) {
  const grid = document.getElementById('grid');
  if (posterObserver) posterObserver.disconnect();
  const countEl = document.getElementById('result-count');
  const emptyEl = document.getElementById('empty');
  const loadMoreWrap = document.getElementById('load-more-wrap');
  if (loadMoreWrap) loadMoreWrap.style.display = 'none';

  // Liste brute mémorisée : « masquer ma collec » re-rend sans refetch
  state.lastTmdbItems = items || [];
  let shown = state.lastTmdbItems;
  if (state.discoverFilters.hideCollection) {
    const inCollec = new Set(state.films.map(f => f.id));
    shown = shown.filter(it => !inCollec.has((it.media_type || 'movie') + '-' + it.id));
  }

  grid.innerHTML = '';
  if (shown.length === 0) {
    countEl.textContent = '0';
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';
  countEl.textContent = shown.length;
  for (const item of shown) {
    grid.appendChild(buildTmdbCard(item));
  }
  fillCardMeta();
}

// ---- Réalisateur des cartes (nom latinisé, à droite de l'année) ----
// Les listes TMDB ne renvoient pas le réalisateur, et certains noms (stockés
// ou TMDB) sont en écriture non latine. On résout à la demande via les crédits
// + latinisation (fetchLatinNameById), et on met en cache le nom d'affichage.
const directorCache = new Map(); // id -> nom d'affichage latinisé ('' = aucun)
try {
  const c = JSON.parse(localStorage.getItem('films_card_directors') || 'null');
  if (c) for (const k in c) directorCache.set(k, c[k]);
} catch {}
function persistDirectors() {
  try { localStorage.setItem('films_card_directors', JSON.stringify(Object.fromEntries(directorCache))); } catch {}
}
// Déjà résolu (nom latin prêt) ? Pré-remplit le cache pour les noms de la
// collection déjà latins → aucun fetch dans ce cas.
function directorResolved(id) {
  if (directorCache.has(id)) return true;
  const local = state.films.find(f => f.id === id);
  if (local && local.director && !hasNonLatin(local.director)) { directorCache.set(id, local.director); return true; }
  return false;
}
// À afficher tout de suite : résolu, ou brut (éventuellement non latin) en attendant.
function provisionalDirector(id) {
  if (directorCache.has(id)) return directorCache.get(id);
  const local = state.films.find(f => f.id === id);
  return (local && local.director) || '';
}
async function resolveDirector(id, tmdbId, mediaType) {
  if (directorResolved(id)) return directorCache.get(id);
  if (!tmdbId) return provisionalDirector(id);
  let dir = '';
  try {
    let people = [];
    if (mediaType === 'tv') {
      const r = await fetch(`${TMDB_BASE}/tv/${tmdbId}?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR`);
      if (r.ok) people = (await r.json()).created_by || [];
    } else {
      const r = await fetch(`${TMDB_BASE}/movie/${tmdbId}/credits?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR`);
      if (r.ok) people = ((await r.json()).crew || []).filter(c => c.job === 'Director');
    }
    const seen = new Set(), names = [];
    for (const p of people) {
      let nm = bestPersonName(p);
      if (hasNonLatin(nm) && p.id) nm = (await fetchLatinNameById(p.id)) || nm;
      if (nm && !seen.has(nm)) { seen.add(nm); names.push(nm); }
    }
    dir = names.join(', ');
  } catch {}
  if (dir) directorCache.set(id, dir);
  return dir || provisionalDirector(id);
}
// Remplir/latiniser les réalisateurs des cartes affichées (concurrence bornée).
// ---- Titre latin des cartes/fiches ----
// Un titre en écriture non latine (chinois, japonais…) est remplacé par le
// titre anglais fourni par TMDB (ex. 年会不能停 ! -> Johnny Keep Walking!),
// mis en cache pour ne pas refaire la requête.
const titleCache = new Map();
try {
  const c = JSON.parse(localStorage.getItem('films_card_titles') || 'null');
  if (c) for (const k in c) titleCache.set(k, c[k]);
} catch {}
function persistTitles() {
  try { localStorage.setItem('films_card_titles', JSON.stringify(Object.fromEntries(titleCache))); } catch {}
}
function displayTitle(id, raw) {
  if (titleCache.has(id)) return titleCache.get(id);
  return raw || '';
}
async function resolveTitle(id, tmdbId, mediaType, raw) {
  if (titleCache.has(id)) return titleCache.get(id);
  if (!tmdbId || !hasNonLatin(raw || '')) return raw || '';
  let t = '';
  try {
    const path = mediaType === 'tv' ? 'tv' : 'movie';
    const r = await fetch(`${TMDB_BASE}/${path}/${tmdbId}?api_key=${encodeURIComponent(admin.tmdbKey)}&language=en-US`);
    if (r.ok) {
      const d = await r.json();
      const cand = d.title || d.name || '';
      if (cand && !hasNonLatin(cand)) t = cand;
    }
    // Filet : certains films n'ont pas de titre en-US mais un titre alternatif latin
    if (!t) {
      const ar = await fetch(`${TMDB_BASE}/${path}/${tmdbId}/alternative_titles?api_key=${encodeURIComponent(admin.tmdbKey)}`);
      if (ar.ok) {
        const ad = await ar.json();
        const list = ad.titles || ad.results || [];
        const pick = list.find(x => /^(US|GB)$/.test(x.iso_3166_1 || '') && x.title && !hasNonLatin(x.title))
                  || list.find(x => x.title && !hasNonLatin(x.title));
        if (pick) t = pick.title;
      }
    }
  } catch {}
  if (t) { titleCache.set(id, t); persistTitles(); }
  return t || raw || '';
}

async function fillCardMeta() {
  const needsTitle = c => {
    const el = c.querySelector('.card-title');
    return el && hasNonLatin(el.textContent || '');
  };
  const needsDir = c => c.querySelector('.card-director') && !directorResolved(c.dataset.filmId);
  const cards = [...document.querySelectorAll('#grid .card')].filter(c =>
    c.dataset.tmdbId && (needsDir(c) || needsTitle(c)));
  if (!cards.length) return;
  let idx = 0, changed = false;
  async function worker() {
    while (idx < cards.length) {
      const c = cards[idx++];
      if (needsTitle(c)) {
        const el = c.querySelector('.card-title');
        const t = await resolveTitle(c.dataset.filmId, c.dataset.tmdbId, c.dataset.mediaType, el.textContent);
        if (t) el.textContent = t;
      }
      if (needsDir(c)) {
        const dir = await resolveDirector(c.dataset.filmId, c.dataset.tmdbId, c.dataset.mediaType);
        const span = c.querySelector('.card-director');
        if (span) span.textContent = dir;
        changed = true;
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, () => worker()));
  if (changed) persistDirectors();
}

function buildTmdbCard(item) {
  const card = document.createElement('div');
  card.className = 'card tmdb-card';
  card.tabIndex = 0;
  const id = (item.media_type || 'movie') + '-' + item.id;
  const inCollection = state.films.some(f => f.id === id);
  if (inCollection) card.classList.add('in-collection');

  const posterUrl = item.poster_path ? tmdbImgUrl(item.poster_path, 'w342') : null;
  const year = (item.release_date || item.first_air_date || '').slice(0, 4) || '';
  const title = item.title || item.name || '';

  const poster = document.createElement('div');
  poster.className = 'poster' + (posterUrl ? '' : ' empty');
  if (posterUrl) setLazyPoster(poster, posterUrl);
  else poster.textContent = displayTitle(id, title);
  card.appendChild(poster);

  // "in collection" badge (only on tmdb-card variant)
  if (inCollection) {
    const tag = document.createElement('div');
    tag.className = 'tmdb-in-collec';
    tag.textContent = 'dans ma collec';
    card.appendChild(tag);
  }

  // « au ciné » : actuellement en salles en France
  if (nowPlayingSet.has(id)) {
    const c = document.createElement('div');
    c.className = 'cine-badge';
    c.textContent = 'au ciné';
    poster.appendChild(c);
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `
    <p class="card-title">${escapeHtml(displayTitle(id, title))}</p>
    <div class="card-meta-line">
      <span class="card-year">${year}${item.media_type === 'tv' ? ' · série' : ''}</span>
      <span class="card-director"></span>
    </div>`;
  card.appendChild(meta);
  // réalisateur : rempli tout de suite si connu (collection/cache), sinon lazy
  card.dataset.filmId = id;
  card.dataset.tmdbId = item.id;
  card.dataset.mediaType = item.media_type || 'movie';
  const kd = provisionalDirector(id);
  if (kd) meta.querySelector('.card-director').textContent = kd;

  card.addEventListener('click', () => openTmdbItem(item));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTmdbItem(item); }
  });
  return card;
}

// Open a TMDB item: route to local modal if in collection, else load + show as tmdb-only
async function openTmdbItem(item) {
  const id = (item.media_type || 'movie') + '-' + item.id;
  const existing = state.films.find(f => f.id === id);
  if (existing) {
    openModal(existing);
    return;
  }
  // Open modal with loading state
  const body = document.getElementById('modal-body');
  const bg = document.getElementById('modal-bg');
  bg.style.backgroundImage = '';
  body.innerHTML = '<div style="padding: 60px 20px; text-align: center; color: var(--ink-mute); font-style: italic;">chargement des détails…</div>';
  showModalBackdrop();
  document.body.style.overflow = 'hidden';
  try {
    const detail = await tmdbDetails(item.id, item.media_type || 'movie');
    // L'utilisateur a pu fermer le modal pendant le chargement — ne pas le rouvrir
    if (!document.getElementById('modal-backdrop').classList.contains('open')) return;
    const film = buildFilmFromTmdb(detail, item.media_type || 'movie');
    openModal(film, { tmdbOnly: true });
  } catch (e) {
    if (!document.getElementById('modal-backdrop').classList.contains('open')) return;
    body.innerHTML = `<div class="error-inline" style="margin: 20px;">erreur : ${escapeHtml(e.message)}</div>`;
  }
}

// ============================================================
// RECO VIEW
// ============================================================
function currentMonthKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function pickRecoSources() {
  const vus = state.films.filter(f => f.user?.statut === 'vu' && f.user?.rating && f.tmdb_id);

  const now = new Date();
  function ageInMonths(dv) {
    if (!dv || dv.startsWith('before-')) return Infinity;
    let date;
    if (/^\d{4}-\d{2}$/.test(dv)) date = new Date(dv + '-01');
    else if (/^\d{4}$/.test(dv)) date = new Date(dv + '-06-01');
    else return Infinity;
    return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
  }

  // Try 4+ stars in last 6 months
  let sources = vus.filter(f => f.user.rating >= 4 && ageInMonths(f.user.date_vue) <= 6);
  if (sources.length >= 5) return capRecoSources(sources, '4+ étoiles vus dans les 6 derniers mois');

  // Expand to 3+ stars in last 6 months
  sources = vus.filter(f => f.user.rating >= 3 && ageInMonths(f.user.date_vue) <= 6);
  if (sources.length >= 5) return capRecoSources(sources, '3+ étoiles vus dans les 6 derniers mois');

  // Expand to 4+ in last 12 months
  sources = vus.filter(f => f.user.rating >= 4 && ageInMonths(f.user.date_vue) <= 12);
  if (sources.length >= 5) return capRecoSources(sources, '4+ étoiles vus dans les 12 derniers mois');

  // Fallback: all 4+ stars ever
  sources = vus.filter(f => f.user.rating >= 4);
  return capRecoSources(sources, '4+ étoiles (toutes périodes)');
}

// Borne le coût du calcul (cf. RECO.maxSources) : on garde les mieux notés,
// puis les plus récemment vus
function capRecoSources(sources, criteria) {
  const recency = f => { const dv = f.user.date_vue || ''; return dv.startsWith('before-') ? '' : dv; };
  const kept = [...sources]
    .sort((a, b) => b.user.rating - a.user.rating || recency(b).localeCompare(recency(a)))
    .slice(0, RECO.maxSources);
  return { sources: kept, criteria: kept.length < sources.length ? `${criteria}, les ${kept.length} mieux notés` : criteria };
}

// Principe :
// 1) Voisinage — pour chaque film aimé, les films qui lui ressemblent
//    vraiment. Candidats : ses recos et ses « similaires » TMDB. Un candidat
//    n'est retenu que sur preuve de proximité : un thème en commun, le même
//    réal ou des acteurs communs, ou une reco TMDB d'un film assez vu pour
//    qu'elle soit fiable. Le genre seul ne suffit pas (« Drame » ressemble à tout).
// 2) Critères — sur le film PROPOSÉ, jamais sur le film aimé : parmi ses
//    voisins, on favorise ceux réalisés par une femme et on freine les
//    productions américaines. Ils décident quels voisins on garde et pèsent
//    sur le tirage, sans jamais toucher à la proximité elle-même.
// 3) Grille — tirage pondéré par le score, fixé pour le mois, avec une part
//    cible de films de réalisatrices (quand il y en a assez parmi les voisins)
//    et un plafond par film aimé pour qu'elle reste mélangée.
// Modifier un réglage invalide de lui-même le pool en cache (RECO_SIG).
const RECO = {
  maxSources: 30,             // « toutes périodes » peut dépasser 250 films
  minVotes: 20,               // candidats trop confidentiels pour être jugés
  trustRecosFromVotes: 100,   // en dessous, les recos TMDB d'un film sont du bruit
  minProximity: 0.20,
  neighborsPerSource: 8,
  perSourceInGrid: 2,
  proximity: { keywords: 0.50, genres: 0.20, tmdbReco: 0.15, people: 0.15 },
  femaleDirectorBoost: 1.6,   // choix des voisins et poids au tirage
  femaleDirectorShare: 0.5,   // part cible de la grille
  countryMult: { US: 0.6 },   // au prorata des pays de production
  // Mots-clés TMDB qui ne décrivent pas le style : « woman director »
  // réintroduirait en douce un critère sur le film aimé ; scènes post-générique.
  metaKeywords: [187056, 179431, 179430],
};
const RECO_SIG = (() => {
  const str = JSON.stringify(RECO);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
})();

// Fetch TMDB tolérant : null en cas d'échec, nouvel essai sur 429 — le calcul
// fait des centaines d'appels, un 429 avalé en silence tronquerait le pool.
async function tmdbJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let r;
    try { r = await fetch(url); } catch { return null; }
    if (r.status === 429) { await new Promise(res => setTimeout(res, 1000 * (attempt + 1))); continue; }
    if (!r.ok) return null;
    try { return await r.json(); } catch { return null; }
  }
  return null;
}

async function mapWithConcurrency(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

async function tmdbRecoList(type, tmdbId, kind) {
  const d = await tmdbJson(`${TMDB_BASE}/${type}/${tmdbId}/${kind}?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR&page=1`);
  return (d?.results || []).map(it => ({ ...it, media_type: it.media_type || type }));
}

// Profil d'un film pour la reco (mots-clés, genres, réal, casting, pays,
// votes), gardé 60 jours : d'un mois à l'autre, et surtout après une nouvelle
// note, la plupart des candidats sont déjà connus.
const RECO_PROFILES_KEY = 'films_reco_profiles_v1';
const RECO_PROFILE_TTL = 60 * 24 * 3600 * 1000;
function loadRecoProfiles() {
  const m = new Map();
  try {
    const raw = JSON.parse(localStorage.getItem(RECO_PROFILES_KEY) || 'null');
    const now = Date.now();
    if (raw) for (const k in raw) if (now - raw[k].t < RECO_PROFILE_TTL) m.set(k, raw[k]);
  } catch {}
  return m;
}
function saveRecoProfiles(m) {
  try { localStorage.setItem(RECO_PROFILES_KEY, JSON.stringify(Object.fromEntries(m))); }
  catch { try { localStorage.removeItem(RECO_PROFILES_KEY); } catch {} } // quota : on sacrifie ce cache-là
}
async function recoProfile(cache, type, tmdbId) {
  const key = type + '-' + tmdbId;
  if (cache.has(key)) return cache.get(key);
  const d = await tmdbJson(`${TMDB_BASE}/${type}/${tmdbId}?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR&append_to_response=credits,keywords`);
  if (!d) return null;
  const dirs = type === 'tv' ? (d.created_by || []) : (d.credits?.crew || []).filter(c => c.job === 'Director');
  let countries = (d.production_countries || []).map(c => c.iso_3166_1);
  if (!countries.length && Array.isArray(d.origin_country)) countries = d.origin_country;
  const prof = {
    k: (d.keywords?.keywords || d.keywords?.results || []).map(x => x.id),
    g: (d.genres || []).map(x => x.id),
    d: dirs.map(x => x.id),
    c: (d.credits?.cast || []).slice(0, 10).map(x => x.id),
    f: dirs.some(x => x.gender === 1) ? 1 : 0,
    p: countries,
    v: d.vote_count || 0,
    t: Date.now(),
  };
  cache.set(key, prof);
  return prof;
}

// Multiplicateur des critères, calculé sur le film proposé
function recoCriteria(prof) {
  const female = prof.f ? RECO.femaleDirectorBoost : 1;
  const cs = prof.p || [];
  const country = cs.length ? cs.reduce((a, c) => a + (RECO.countryMult[c] ?? 1), 0) / cs.length : 1;
  return female * country;
}

async function buildRecoPool(sources, onProgress) {
  const cache = loadRecoProfiles();
  const inCollection = new Set(state.films.map(f => f.id));
  const typeOf = t => t === 'tv' ? 'tv' : 'movie';
  const keyOf = it => typeOf(it.media_type) + '-' + it.id;

  // 1a. Chaque film aimé : son profil, ses recos et ses « similaires » TMDB
  const perSource = (await mapWithConcurrency(sources, 6, async s => {
    const type = typeOf(s.type);
    const [prof, recos, similar] = await Promise.all([
      recoProfile(cache, type, s.tmdb_id),
      tmdbRecoList(type, s.tmdb_id, 'recommendations'),
      tmdbRecoList(type, s.tmdb_id, 'similar'),
    ]);
    return prof ? { s, prof, recos, similar } : null;
  })).filter(Boolean);
  // Aucun profil récupéré pour aucun film aimé : TMDB ne répond pas (réseau, panne,
  // clé refusée). Le dire, plutôt qu'une grille vide « rien à recommander » — et
  // ne rien mettre en cache
  if (sources.length && !perSource.length) throw new Error('tmdb ne répond pas, réessaie plus tard');

  // 1b. Candidats : hors collection, assez de votes pour être jugés
  const candidates = new Map();
  for (const ps of perSource) for (const it of [...ps.recos, ...ps.similar]) {
    const k = keyOf(it);
    if (inCollection.has(k) || candidates.has(k) || (it.vote_count || 0) < RECO.minVotes) continue;
    candidates.set(k, it);
  }

  // 1c. Profil de chaque candidat (le gros du coût, amorti par le cache)
  let done = 0;
  await mapWithConcurrency([...candidates.values()], 8, async it => {
    await recoProfile(cache, typeOf(it.media_type), it.id);
    if (onProgress) onProgress(++done, candidates.size);
  });
  saveRecoProfiles(cache);

  // Rareté des mots-clés et des genres parmi les candidats : partager
  // « mecha » en dit plus long que partager « based on novel or book »
  const meta = new Set(RECO.metaKeywords);
  const styleKw = prof => new Set(prof.k.filter(x => !meta.has(x)));
  const dfK = new Map(), dfG = new Map();
  for (const k of candidates.keys()) {
    const p = cache.get(k); if (!p) continue;
    for (const x of new Set(p.k)) dfK.set(x, (dfK.get(x) || 0) + 1);
    for (const x of new Set(p.g)) dfG.set(x, (dfG.get(x) || 0) + 1);
  }
  const N = Math.max(1, candidates.size);
  const idfK = x => Math.log(1 + N / (dfK.get(x) || 1));
  const idfG = x => Math.log(1 + N / (dfG.get(x) || 1));
  function keywordSim(a, b) {   // cosinus pondéré par la rareté
    if (!a.size || !b.size) return 0;
    let dot = 0, na = 0, nb = 0;
    for (const x of a) { const w = idfK(x) ** 2; na += w; if (b.has(x)) dot += w; }
    for (const x of b) nb += idfK(x) ** 2;
    return dot / Math.sqrt(na * nb);
  }
  function genreSim(a, b) {     // Jaccard pondéré par la rareté
    const A = new Set(a), B = new Set(b);
    if (!A.size || !B.size) return 0;
    let inter = 0, union = 0;
    for (const x of new Set([...A, ...B])) { const w = idfG(x); union += w; if (A.has(x) && B.has(x)) inter += w; }
    return inter / union;
  }
  function peopleSim(a, b) {    // même réal = 1, sinon acteurs en commun
    if (a.d.some(x => b.d.includes(x))) return 1;
    return Math.min(1, a.c.filter(x => b.c.includes(x)).length / 3);
  }

  // 1d. Voisinage de chaque film aimé, puis 2. critères sur le film proposé
  const W = RECO.proximity;
  const pool = new Map(); // clé -> { it, prof, sim, src, best }
  for (const ps of perSource) {
    const sKw = styleKw(ps.prof);
    const recoIds = new Set(ps.recos.map(keyOf));
    const trustRecos = ps.prof.v >= RECO.trustRecosFromVotes;
    const weight = ratingOutOf10(ps.s.user.rating) / 10;
    const near = new Map();
    for (const it of [...ps.recos, ...ps.similar]) {
      const k = keyOf(it);
      if (near.has(k) || !candidates.has(k)) continue;
      const c = cache.get(k); if (!c) continue;
      const kw = keywordSim(sKw, styleKw(c)), people = peopleSim(ps.prof, c), inRecos = recoIds.has(k);
      if (!(kw > 0 || people > 0 || (inRecos && trustRecos))) continue; // pas de preuve de proximité
      const p = W.keywords * kw + W.genres * genreSim(ps.prof.g, c.g) + W.tmdbReco * (inRecos ? 1 : 0) + W.people * people;
      if (p >= RECO.minProximity) near.set(k, { it, c, p });
    }
    // Les critères départagent les voisins : ils décident lesquels on garde
    const kept = [...near.entries()]
      .sort((a, b) => b[1].p * recoCriteria(b[1].c) - a[1].p * recoCriteria(a[1].c))
      .slice(0, RECO.neighborsPerSource);
    for (const [k, { it, c, p }] of kept) {
      const e = pool.get(k) || { it, prof: c, sim: 0, src: null, best: 0 };
      e.sim += weight * p;   // proche de plusieurs films aimés → il monte
      if (weight * p > e.best) { e.best = weight * p; e.src = ps.s.id; }
      pool.set(k, e);
    }
  }

  // Score final = similarité × critères. Items allégés : le pool est mis en cache.
  return [...pool.values()]
    .map(e => ({
      id: e.it.id, media_type: e.it.media_type,
      title: e.it.title, name: e.it.name,
      original_title: e.it.original_title, original_name: e.it.original_name,
      poster_path: e.it.poster_path, release_date: e.it.release_date, first_air_date: e.it.first_air_date,
      original_language: e.it.original_language, vote_average: e.it.vote_average, vote_count: e.it.vote_count,
      reco_w: e.sim * recoCriteria(e.prof),
      reco_src: e.src,
      reco_female: e.prof.f === 1,
    }))
    .sort((a, b) => b.reco_w - a.reco_w);
}

function seededRandom(seed) {
  // Mulberry32-ish PRNG
  let s = seed * 2654435761 | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tirage du mois, pondéré par le score (Efraimidis–Spirakis : clé u^(1/w)).
// La part cible de réalisatrices est servie en premier, dans l'ordre du tirage,
// puis le reste ; au plus RECO.perSourceInGrid films par film aimé.
function monthlyRecoSubset(pool, count) {
  if (pool.length === 0) return [];
  const d = new Date();
  const random = seededRandom(d.getFullYear() * 12 + d.getMonth());
  const drawn = pool
    .map(it => ({ it, key: Math.pow(random(), 1 / Math.max(it.reco_w || 1, 1e-6)) }))
    .sort((a, b) => b.key - a.key)
    .map(x => x.it);
  const picked = new Set(), perSource = new Map();
  const take = (accept, until) => {
    for (const it of drawn) {
      if (picked.size >= until) break;
      if (picked.has(it) || !accept(it)) continue;
      const n = perSource.get(it.reco_src) || 0;
      if (it.reco_src && n >= RECO.perSourceInGrid) continue;
      perSource.set(it.reco_src, n + 1);
      picked.add(it);
    }
  };
  take(it => it.reco_female, Math.round(count * RECO.femaleDirectorShare));
  take(() => true, count);
  // Peu de films aimés : le plafond laisserait des trous, on complète
  for (const it of drawn) { if (picked.size >= count) break; picked.add(it); }
  // Ordre d'affichage mélangé, fixé pour le mois : celles qui complètent la
  // part cible sont puisées plus loin dans le tirage, et se regrouperaient
  // sinon en fin de grille
  const out = drawn.filter(it => picked.has(it));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Un seul calcul à la fois : revenir sur l'onglet pendant qu'il tourne ne doit
// pas en lancer un second
let recoBuildInFlight = null;

async function fetchAndRenderReco(forceRefresh = false) {
  const grid = document.getElementById('grid');
  const countEl = document.getElementById('result-count');
  const ctxEl = document.getElementById('reco-context');
  const refreshBtn = document.getElementById('reco-refresh');
  document.getElementById('results-header').style.display = '';

  const { sources, criteria } = pickRecoSources();
  if (sources.length === 0) {
    ctxEl.innerHTML = "pas encore assez de films notés pour recommander. <strong>note quelques films d'abord</strong>.";
    grid.innerHTML = '';
    countEl.textContent = '0';
    return;
  }

  const monthName = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][new Date().getMonth()];
  ctxEl.innerHTML = `<strong>${monthName} ${new Date().getFullYear()}</strong> · basé sur <strong>${sources.length} films</strong> (${criteria})`;

  const cacheKey = 'films_reco_pool_' + currentMonthKey() + '_' + state.films.filter(f => f.user?.rating).length
    + '_' + RECO_SIG;

  let pool = state.recoPool;
  // Try localStorage cache
  if (!pool && !forceRefresh) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        pool = JSON.parse(cached);
        // Hydrater la session : sinon chaque visite de l'onglet re-parse le JSON
        state.recoPool = pool;
      }
    } catch {}
  }

  if (!pool || forceRefresh || pool.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--ink-mute); font-style: italic;">analyse de tes goûts… (' + sources.length + ' films à croiser)<br><span id="reco-progress"></span></div>';
    countEl.textContent = '…';
    refreshBtn.disabled = true;
    try {
      if (!recoBuildInFlight) {
        recoBuildInFlight = buildRecoPool(sources, (done, total) => {
          const el = document.getElementById('reco-progress');
          if (el) el.textContent = done + ' / ' + total + ' films examinés';
        }).finally(() => { recoBuildInFlight = null; });
      }
      pool = await recoBuildInFlight;
      state.recoPool = pool;
      // Save to localStorage
      try { localStorage.setItem(cacheKey, JSON.stringify(pool)); } catch {}
      // Clear older month caches (cleanup) — collecter d'abord : removeItem
      // pendant l'itération par index décale les clés restantes et en saute
      const stale = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('films_reco_pool_') && k !== cacheKey) stale.push(k);
      }
      stale.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      refreshBtn.disabled = false;
      if (state.view !== 'reco') return;
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--red);">erreur : ${escapeHtml(e.message)}</div>`;
      countEl.textContent = '0';
      return;
    }
    refreshBtn.disabled = false;
  }

  // L'utilisateur a pu changer de vue pendant le fetch — ne pas écraser sa grille
  if (state.view !== 'reco') return;

  if (pool.length === 0) {
    ctxEl.innerHTML += '<br><span style="color: var(--ink-mute); font-size: 12px;">tmdb n\'a rien à recommander à partir de ces films pour le moment.</span>';
    grid.innerHTML = '';
    countEl.textContent = '0';
    return;
  }

  const recos = monthlyRecoSubset(pool, 24);
  state.recoDisplayed = recos;
  renderTmdbGrid(recos);
}

// ============================================================
// DETAIL MODAL
// ============================================================
// Contexte du modal ouvert — permet à un re-render (enrichissement paresseux)
// de préserver le mode : sans ça, un film TMDB hors collection basculerait
// en formulaire d'édition, dont les boutons agissent par id sur state.films
// (introuvable → ne font rien)
let openModalCtx = { id: null, tmdbOnly: false };

function openModal(f, opts) {
  opts = opts || {};
  const tmdbOnly = opts.tmdbOnly === true;
  openModalCtx = { id: f.id, tmdbOnly };
  const bg = document.getElementById('modal-bg');
  const body = document.getElementById('modal-body');
  // Reset filter from any previous open
  bg.style.filter = '';

  if (f.backdrop) {
    bg.style.backgroundImage = `url(${f.backdrop})`;
  } else if (f.poster) {
    bg.style.backgroundImage = `url(${f.poster})`;
    bg.style.filter = 'blur(20px) brightness(0.6)';
  } else {
    bg.style.background = 'var(--bg-elev)';
  }

  // Note perso : les crans étant exclusifs, un coup de cœur affiche le ❤ seul.
  // Sinon les étoiles, suivies du ❤ en creux pour qu'on voie que le cran
  // existe même quand il n'est pas donné.
  // Convertie en /10 (2/4/6/8/9,5/10) pour se comparer à la moyenne TMDB.
  const rating = f.user?.rating;
  const fav = !!f.user?.favorite;
  const userRatingHtml = (rating && !tmdbOnly) ? (() => {
    const visual = fav
      ? '<span class="rating-heart on">❤</span>'
      : '★'.repeat(rating)
        + `<span class="star-empty">${'★'.repeat(RATING_MAX - rating)}</span>`
        + '<span class="rating-heart">❤</span>';
    return `
      <div class="rating-cell">
        <div class="rating-cell-label">ta note</div>
        <div class="rating-cell-stars-big">${visual}</div>
        <div class="rating-cell-footnote">${formatOutOf10(rating)}<span class="denominator"> / 10</span>${fav ? '<span class="denominator"> · coup de cœur</span>' : ''}</div>
      </div>`;
  })() : '';

  const tmdbRatingHtml = f.tmdb_rating ? `
    <div class="rating-cell tmdb">
      <div class="rating-cell-label">tmdb</div>
      <div class="rating-cell-value-medium">${f.tmdb_rating.toFixed(1)}<span class="denominator"> / 10</span></div>
      <div class="rating-cell-footnote" style="color: var(--ink-mute)">moyenne tmdb</div>
    </div>` : '';

  const ratingsHtml = (userRatingHtml || tmdbRatingHtml)
    ? `<div class="ratings-row">${userRatingHtml}${tmdbRatingHtml}</div>` : '';

  // Viewing card — only for collection films
  let viewingHtml = '';
  if (!tmdbOnly) {
    const u = f.user || {};
    const statusLabel = u.statut === 'a_voir' ? 'à voir' : 'vu';
    let viewingText = '';
    if (u.statut === 'vu') {
      viewingText = `Vu en <strong>${escapeHtml(u.date_vue_label || '?')}</strong>`;
      if (u.lieu) viewingText += ` au <strong>${escapeHtml(u.lieu)}</strong>`;
    } else {
      viewingText = 'à voir';
      if (u.lieu) viewingText += ` · <strong>${escapeHtml(u.lieu)}</strong>`;
    }
    viewingHtml = `
      <div class="viewing-card">
        <div class="viewing-card-text">${viewingText}</div>
        <div class="viewing-card-status ${u.statut}">${statusLabel}</div>
      </div>`;
  }

  // Meta line
  const metaParts = [];
  if (f.year) metaParts.push(f.year);
  if (f.country) metaParts.push([...new Set(f.country.split(' · ').map(s => countryFr(s.trim())).filter(Boolean))].join(' · '));
  if (f.runtime) metaParts.push(f.runtime + ' min');
  if (f.type === 'tv') metaParts.push('série');

  // Genres
  const genres = (f.genres || []);
  const genresHtml = genres.length ? `<div class="genres">${genres.map(g => `<span class="genre-pill">${escapeHtml(g)}</span>`).join('')}</div>` : '';

  // Cast
  const cast = (f.cast || []);
  const castHtml = cast.length ? `
    <div class="modal-section-label">casting</div>
    <div class="cast-list">${cast.map(c => `<div class="cast-item">${nameLink(c)}</div>`).join('')}</div>` : '';

  // External links
  const links = [];
  const trailerUrl = safeUrl(f.trailer);
  if (trailerUrl) links.push(`<a class="ext-link trailer-link" href="${trailerUrl}" target="_blank" rel="noopener">▶ bande-annonce ↗</a>`);
  if (f.tmdb_id) links.push(`<a class="ext-link" href="https://www.themoviedb.org/${f.type === 'tv' ? 'tv' : 'movie'}/${encodeURIComponent(f.tmdb_id)}" target="_blank" rel="noopener">tmdb ↗</a>`);
  if (f.title) links.push(`<a class="ext-link" href="https://www.allocine.fr/rechercher/?q=${encodeURIComponent(f.title)}" target="_blank" rel="noopener">allociné ↗</a>`);

  // Synopsis
  const synopsisHtml = f.synopsis ? `
    <div class="modal-section-label">synopsis</div>
    <p class="synopsis">${escapeHtml(f.synopsis)}</p>` : '';

  // TMDB-only mode: add action buttons (or expanded form) instead of edit form
  let actionsHtml = '';
  if (tmdbOnly) {
    if (admin.active) {
      actionsHtml = `
        <div class="tmdb-actions" id="tmdb-actions">
          <button class="tmdb-action" data-action="show_vu_form">+ ajouter comme déjà vu</button>
          <button class="tmdb-action ghost" data-action="add_avoir">+ ajouter à voir</button>
        </div>
        <div class="tmdb-add-form-section" id="tmdb-add-form-section" style="display: none;">
          <div class="edit-section-title">ajouter aux vus</div>
          <div class="edit-form">
            <div class="field">
              <label>note</label>
              <div class="rating-chips" id="tmdb-add-rating-chips">
                <button class="rating-chip" data-rating="1">1★</button>
                <button class="rating-chip" data-rating="2">2★</button>
                <button class="rating-chip" data-rating="3">3★</button>
                <button class="rating-chip" data-rating="4">4★</button>
                <button class="rating-chip" data-rating="5">5★</button>
                <span class="rating-chip-sep" aria-hidden="true"></span>
                <button class="rating-chip fav" data-rating="6" title="coup de cœur — le cran au-dessus de 5★">❤</button>
              </div>
            </div>
            <div class="field">
              <label>lieu</label>
              <select id="tmdb-add-lieu">
                <option value="">—</option>
                <option value="Cinéma">Cinéma</option>
                <option value="Stremio">Stremio</option>
                <option value="Disque dur">Disque dur</option>
                <option value="Autre">Autre</option>
              </select>
            </div>
            <div class="field">
              <label>date vue</label>
              <div style="display: flex; gap: 8px;">
                <input type="number" id="tmdb-add-year" min="1900" max="2099" placeholder="année (ex. 2019)" style="flex:1;">
                <select id="tmdb-add-month" style="flex:1;">
                  <option value="">—</option>
                  <option value="01">janvier</option><option value="02">février</option>
                  <option value="03">mars</option><option value="04">avril</option>
                  <option value="05">mai</option><option value="06">juin</option>
                  <option value="07">juillet</option><option value="08">août</option>
                  <option value="09">septembre</option><option value="10">octobre</option>
                  <option value="11">novembre</option><option value="12">décembre</option>
                </select>
              </div>
              <label class="date-before-toggle"><input type="checkbox" id="tmdb-add-before"> vu avant 2022 (date précise inconnue)</label>
            </div>
            <div class="edit-form-actions">
              <button class="edit-save" id="tmdb-add-save">enregistrer</button>
              <button class="ghost" id="tmdb-add-cancel" style="padding: 10px 16px; border-radius: var(--radius); font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; cursor: pointer; border: 1px solid var(--rule-strong); background: transparent; color: var(--ink-soft);">annuler</button>
            </div>
          </div>
        </div>`;
    } else {
      actionsHtml = `<div style="margin-top: 24px; padding: 16px; background: var(--bg-elev); border-radius: var(--radius); text-align: center; font-size: 13px; color: var(--ink-mute); font-style: italic;">active le mode édition (🔒) pour ajouter ce film à ta collection.</div>`;
    }
  }

  // Edit form (admin mode only, NOT tmdbOnly)
  const editFormHtml = (admin.active && !tmdbOnly) ? renderEditForm(f) : '';

  body.innerHTML = `
    <div class="modal-head">
      <div class="modal-poster ${f.poster ? '' : 'empty'}" ${f.poster ? `style="background-image:url(${safeUrl(f.poster)})"` : ''}>${f.poster ? '' : "pas d'affiche"}</div>
      <div class="modal-head-meta">
        <h2 class="modal-title" id="modal-title">${escapeHtml(displayTitle(f.id, f.title) || 'sans titre')}</h2>
        ${f.director ? `<div class="modal-director">par ${f.director.split(',').map(n => nameLink(n.trim())).filter(Boolean).join(', ')}</div>` : ''}
        <div class="modal-meta-line">${metaParts.map(escapeHtml).join(' · ')}</div>
      </div>
    </div>
    ${ratingsHtml}
    ${viewingHtml}
    ${genresHtml}
    ${synopsisHtml}
    ${castHtml}
    ${links.length ? `<div class="ext-links">${links.join('')}</div>` : ''}
    ${actionsHtml}
    ${editFormHtml}
  `;

  // Wire tmdb-only action buttons
  if (tmdbOnly && admin.active) {
    document.querySelectorAll('.tmdb-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'add_avoir') {
          addTmdbFilmToCollection(f, 'a_voir', null);
        } else if (action === 'show_vu_form') {
          // Toggle form visibility
          document.getElementById('tmdb-actions').style.display = 'none';
          document.getElementById('tmdb-add-form-section').style.display = '';
          // Default: current year, no month
          document.getElementById('tmdb-add-year').value = String(new Date().getFullYear());
        }
      });
    });

    // Étoiles et ❤ : sélection unique — c'est l'un ou l'autre, jamais les deux
    // (recliquer sur la puce active = plus de note)
    document.querySelectorAll('#tmdb-add-rating-chips .rating-chip').forEach(c => {
      c.addEventListener('click', () => {
        const wasActive = c.classList.contains('active');
        document.querySelectorAll('#tmdb-add-rating-chips .rating-chip').forEach(x => x.classList.remove('active'));
        if (!wasActive) c.classList.add('active');
      });
    });

    // Case « vu avant 2022 »
    wireBeforeToggle(
      document.getElementById('tmdb-add-before'),
      document.getElementById('tmdb-add-year'),
      document.getElementById('tmdb-add-month')
    );

    // Save: collect form values and add
    document.getElementById('tmdb-add-save').addEventListener('click', () => {
      const ratingBtn = document.querySelector('#tmdb-add-rating-chips .rating-chip.active');
      const rating = ratingBtn ? parseInt(ratingBtn.dataset.rating, 10) : null;
      const favorite = rating === RATING_FAV;
      const lieu = document.getElementById('tmdb-add-lieu').value || null;
      const beforeChk = document.getElementById('tmdb-add-before');
      const y = document.getElementById('tmdb-add-year').value.trim();
      const m = document.getElementById('tmdb-add-month').value;
      let dateVue = null, dateLabel = null;
      if (beforeChk && beforeChk.checked) {
        dateVue = 'before-2022';
        dateLabel = 'avant 2022';
      } else if (y) {
        const currentYear = new Date().getFullYear();
        if (!/^\d{4}$/.test(y) || parseInt(y, 10) < 1900 || parseInt(y, 10) > currentYear) {
          showToast('année invalide (4 chiffres, entre 1900 et ' + currentYear + ')', 'error');
          return;
        }
        dateVue = m ? (y + '-' + m) : y;
        dateLabel = formatDateLabel(dateVue);
      }
      const userData = {
        statut: 'vu',
        rating: rating,
        favorite,
        lieu: lieu,
        date_vue: dateVue,
        date_vue_label: dateLabel,
        csv_genres: [],
      };
      addTmdbFilmToCollection(f, 'vu', userData);
    });

    document.getElementById('tmdb-add-cancel').addEventListener('click', () => {
      document.getElementById('tmdb-actions').style.display = '';
      document.getElementById('tmdb-add-form-section').style.display = 'none';
    });
  }

  // If admin, wire up the edit form
  if (admin.active && !tmdbOnly) wireEditForm(f);

  showModalBackdrop();
  document.body.style.overflow = 'hidden';

  // Lazy-fetch country if missing (existing films from initial migration didn't have it)
  if (!f.country && f.tmdb_id && f.type) {
    enrichFilmCountry(f);
  }
  // Lazy-fetch trailer if not yet attempted
  if (f.trailer === undefined && f.tmdb_id && f.type) {
    enrichFilmTrailer(f);
  }
  // Lazy : noms non latins (réal / casting) ET complétion de la liste des
  // réalisateurs pour les films ajoutés avant la capture des co-réalisations
  // (director_genders absent). Couvre aussi les fiches découvrir/reco.
  if (f.tmdb_id && (
        hasNonLatin(f.director || '') ||
        (f.cast || []).some(c => hasNonLatin(c)) ||
        (f.type === 'movie' && !f.director_genders)
      )) {
    enrichFilmNames(f);
  }
  // Lazy : titre en écriture non latine -> titre anglais de TMDB, puis re-rendu
  if (f.tmdb_id && hasNonLatin(f.title || '') && !titleCache.has(f.id)) {
    resolveTitle(f.id, f.tmdb_id, f.type, f.title).then(t => {
      if (t && t !== f.title) reRenderModalIfShowing(f);
    });
  }
}

async function addTmdbFilmToCollection(film, statut, userData) {
  if (!admin.active) {
    showToast('mode admin requis', 'error');
    return;
  }
  // Duplicate protection
  const existing = state.films.find(f => f.id === film.id);
  if (existing) {
    showToast('ce film est déjà dans ta collection', 'error');
    closeModal();
    // Open the local fiche so user can edit it
    setTimeout(() => openModal(existing), 100);
    return;
  }
  // Build user data — use provided or defaults
  film.user = userData || {
    statut: statut,
    rating: null,
    favorite: false,
    lieu: null,
    date_vue: null,
    date_vue_label: null,
    csv_genres: [],
  };
  // Disable buttons during save
  document.querySelectorAll('.tmdb-action, #tmdb-add-save, #tmdb-add-cancel').forEach(b => b.disabled = true);
  try {
    state.films.unshift(film);
    sessionChanges.added.add(film.id);
    await saveFilmsToGithub('add: ' + film.title + ' (' + statut + ')');
    initFilters();
    refreshStats();
    // If currently in discover/reco view, refresh
    if (state.view === 'discover') {
      fetchAndRenderDiscover(state.discoverCategory);
    } else if (state.view === 'reco' && state.recoDisplayed) {
      // Réassigner (pas juste filtrer à la volée) : sinon le film ajouté
      // réapparaît au prochain re-render de la liste
      state.recoDisplayed = state.recoDisplayed.filter(it => {
        const id = (it.media_type || 'movie') + '-' + it.id;
        return id !== film.id;
      });
      renderTmdbGrid(state.recoDisplayed);
    }
    closeModal();
    showToast('✓ ajouté : ' + film.title, 'success');
  } catch (e) {
    // Rollback
    const idx = state.films.findIndex(f => f.id === film.id);
    if (idx >= 0) state.films.splice(idx, 1);
    sessionChanges.added.delete(film.id);
    showToast('erreur : ' + e.message, 'error');
    document.querySelectorAll('.tmdb-action, #tmdb-add-save, #tmdb-add-cancel').forEach(b => b.disabled = false);
  }
}

// Ouverture de la fiche : si elle n'était pas déjà affichée (un re-rendu ne
// compte pas), on mémorise l'élément d'où l'on vient — la carte — et la
// sélection clavier entre dans la fiche, sur le bouton fermer.
let modalReturnFocus = null;
function showModalBackdrop() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop.classList.contains('open')) return;
  backdrop.classList.add('open');
  modalReturnFocus = document.activeElement;
  document.getElementById('modal-close').focus({ preventScroll: true });
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
  document.body.style.overflow = '';
  // reset backdrop filter
  document.getElementById('modal-bg').style.filter = '';
  // La sélection clavier revient à l'élément d'où l'on venait (s'il existe encore)
  const back = modalReturnFocus;
  modalReturnFocus = null;
  if (back && document.contains(back)) back.focus({ preventScroll: true });
}

// ============================================================
// STATS PAGE RENDER
// ============================================================
// Stats différées : 11 graphiques recalculés au boot et après chaque save
// alors que la page stats est souvent cachée. On ne rend que si elle est
// visible ; sinon on marque « à refaire » et le rendu part au prochain
// showPage('stats').
let statsDirty = true;
function refreshStats() {
  if (document.getElementById('stats-page').classList.contains('active')) {
    renderStats();
    statsDirty = false;
  } else {
    statsDirty = true;
  }
}

function renderStats() {
  const films = state.films;
  const vus = films.filter(f => f.user?.statut === 'vu');

  // Total minutes (only for "vu", with known runtime)
  const totalMin = vus.reduce((s, f) => s + (f.runtime || 0), 0);
  const totalHours = Math.round(totalMin / 60);
  const totalDays = (totalMin / (60 * 24)).toFixed(1);

  // Average rating (excluding null)
  const rated = vus.filter(f => f.user?.rating);
  // Moyenne sur l'échelle /10 : les crans ne sont pas équidistants
  // (2/4/6/8/9,5/10), moyenner les numéros de cran ne voudrait rien dire.
  const avgRating = rated.length ? (rated.reduce((s, f) => s + ratingOutOf10(f.user.rating), 0) / rated.length) : 0;

  // Favorites — vus uniquement, cohérent avec le libellé « % des vus » de la carte
  const favorites = vus.filter(f => f.user?.favorite).length;

  // Films per year, find peak year
  const perYear = new Map();
  for (const f of vus) {
    const dv = f.user?.date_vue;
    if (!dv) continue;
    let y;
    if (dv.startsWith('before-')) y = 'avant ' + dv.slice(7);
    else if (dv.length >= 4) y = dv.slice(0, 4);
    else continue;
    perYear.set(y, (perYear.get(y) || 0) + 1);
  }
  // For "moyenne par an", count only full numeric years (skip "avant", skip current incomplete year)
  const currentYear = new Date().getFullYear();
  const fullYears = [...perYear.entries()]
    .filter(([y]) => /^\d{4}$/.test(y) && parseInt(y, 10) < currentYear);
  const avgPerYear = fullYears.length
    ? Math.round(fullYears.reduce((s, [, c]) => s + c, 0) / fullYears.length)
    : 0;
  // Peak year (numeric year only)
  const numericPerYear = [...perYear.entries()].filter(([y]) => /^\d{4}$/.test(y));
  numericPerYear.sort((a, b) => b[1] - a[1]);
  const peakYear = numericPerYear.length ? numericPerYear[0] : null;

  // Cinema count
  const cinemaCount = vus.filter(f => f.user?.lieu === 'Cinéma').length;

  // Distinct directors
  const directors = new Set();
  for (const f of vus) {
    if (f.director) {
      // Some directors are stored as "A, B" for TV — split
      f.director.split(',').forEach(d => directors.add(d.trim()));
    }
  }

  // ── Current-year stats ─────────────────────────────────────
  const CY = String(new Date().getFullYear()); // e.g. "2026"
  const vusThisYear = vus.filter(f => (f.user?.date_vue || '').startsWith(CY));
  const cyHours = Math.round(vusThisYear.reduce((s, f) => s + (f.runtime || 0), 0) / 60);
  const cyRated = vusThisYear.filter(f => f.user?.rating);
  const cyAvgRating = cyRated.length
    ? (cyRated.reduce((s, f) => s + ratingOutOf10(f.user.rating), 0) / cyRated.length)
    : 0;
  const cyFavorites = vusThisYear.filter(f => f.user?.favorite).length;
  // Même règle que le compteur global : séparer les duos « A, B » (séries)
  const cyDirs = new Set();
  for (const f of vusThisYear) {
    if (f.director) f.director.split(',').forEach(d => cyDirs.add(d.trim()));
  }

  const yearSub = (label, value) => `
    <div class="stat-card-year">
      <span class="stat-card-year-label">${label}</span>
      <span class="stat-card-year-value">${value}</span>
    </div>`;

  // Number cards
  document.getElementById('stats-numbers').innerHTML = `
    <div class="stat-card">
      <div class="stat-card-label">films vus</div>
      <div class="stat-card-value">${vus.length}</div>
      <div class="stat-card-detail">${films.length - vus.length} à voir</div>
      ${yearSub(CY, vusThisYear.length)}
    </div>
    <div class="stat-card accent">
      <div class="stat-card-label">temps cumulé</div>
      <div class="stat-card-value">${totalHours.toLocaleString('fr-FR')}h</div>
      <div class="stat-card-detail">soit ${totalDays} jours</div>
      ${yearSub(CY, cyHours + 'h')}
    </div>
    <div class="stat-card">
      <div class="stat-card-label">note moyenne</div>
      <div class="stat-card-value">${avgRating.toFixed(1)}<span style="font-size:0.5em; color: var(--ink-mute)">/10</span></div>
      <div class="stat-card-detail">sur ${rated.length} films notés</div>
      ${cyRated.length ? yearSub(CY, cyAvgRating.toFixed(1) + '/10') : ''}
    </div>
    <div class="stat-card hot stat-card-clickable" data-stat="favorites" title="voir ces films">
      <div class="stat-card-label">coups de cœur</div>
      <div class="stat-card-value">${favorites}</div>
      <div class="stat-card-detail">${(favorites * 100 / Math.max(1, vus.length)).toFixed(0)}% des vus</div>
      ${yearSub(CY, cyFavorites)}
    </div>
    <div class="stat-card">
      <div class="stat-card-label">films par an</div>
      <div class="stat-card-value">${avgPerYear}</div>
      <div class="stat-card-detail">moyenne (années complètes)</div>
      ${yearSub(CY, vusThisYear.length + ' vus')}
    </div>
    <div class="stat-card">
      <div class="stat-card-label">réalisateurs</div>
      <div class="stat-card-value">${directors.size}</div>
      <div class="stat-card-detail">distincts</div>
      ${yearSub(CY, cyDirs.size + ' distincts')}
    </div>
  `;

  renderMonthsChart();
  renderYearChart();
  renderRatingDist();
  renderGenreRatingChart();
  renderHeatmap();
  renderOriginChart();
  renderDirectorCountryChart();
  renderGenreChart();
  renderDirectorChart();
  renderActorChart();
  renderGenderBalance();
  renderYearBest();
  wireStatsClicks();
}

function renderMonthsChart() {
  // Films per month (only "vu" with full YYYY-MM date)
  const buckets = new Map();
  for (const f of state.films) {
    if (f.user?.statut !== 'vu') continue;
    const dv = f.user.date_vue;
    if (!dv || dv.startsWith('before-') || dv.length !== 7) continue;
    buckets.set(dv, (buckets.get(dv) || 0) + 1);
  }

  if (buckets.size === 0) return;

  // Continuous month series from min to max
  const keys = [...buckets.keys()].sort();
  let cur = keys[0];
  const end = keys[keys.length - 1];
  const months = [];
  while (cur <= end) {
    months.push({ key: cur, count: buckets.get(cur) || 0 });
    const [y, m] = cur.split('-').map(Number);
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    cur = ny + '-' + String(nm).padStart(2, '0');
  }

  const max = Math.max(...months.map(d => d.count), 1);
  const W = 1000, H = 200;
  const padLeft = 4, padRight = 4, padTop = 16, padBottom = 28;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;
  const n = months.length;
  const gap = 2;
  const barW = (innerW - gap * (n - 1)) / n;

  // Build bars and year markers
  let bars = '';
  let yearLines = '';
  let yearLabels = '';
  let lastYear = null;
  months.forEach((d, i) => {
    const x = padLeft + i * (barW + gap);
    const barH = (d.count / max) * innerH;
    const y = padTop + innerH - barH;
    const [yr, mo] = d.key.split('-');
    const isCurrent = d.count === max;
    bars += `<rect class="month-bar" data-key="${d.key}" data-count="${d.count}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(1, barH).toFixed(2)}" fill="${isCurrent ? 'var(--hot)' : 'var(--warm)'}" rx="1"/>`;
    // Year marker on January or at first month
    if (mo === '01' || lastYear === null) {
      yearLines += `<line x1="${(x - gap/2).toFixed(2)}" y1="${padTop}" x2="${(x - gap/2).toFixed(2)}" y2="${padTop + innerH}" stroke="var(--rule-strong)" stroke-width="0.5" stroke-dasharray="2 2"/>`;
      yearLabels += `<text x="${(x + barW/2).toFixed(2)}" y="${H - 8}" font-family="JetBrains Mono, monospace" font-size="11" fill="var(--ink-soft)" text-anchor="start" letter-spacing="0.5">${yr}</text>`;
      lastYear = yr;
    }
  });

  // Horizontal max line + label
  const maxLine = `
    <line x1="${padLeft}" y1="${padTop}" x2="${W - padRight}" y2="${padTop}" stroke="var(--rule)" stroke-width="0.5"/>
    <text x="${padLeft}" y="${padTop - 4}" font-family="JetBrains Mono, monospace" font-size="9" fill="var(--ink-mute)" letter-spacing="0.5">${max}</text>
  `;

  const svg = document.getElementById('months-chart');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `
    ${yearLines}
    ${maxLine}
    ${bars}
    ${yearLabels}
  `;

  // Interactivity: hover/tap → tooltip
  const tooltip = document.getElementById('months-tooltip');
  const rects = svg.querySelectorAll('.month-bar');
  rects.forEach(r => {
    r.style.cursor = 'pointer';
    r.addEventListener('mouseenter', (e) => showMonthTip(r));
    r.addEventListener('touchstart', (e) => showMonthTip(r), { passive: true });
    // Clic → films vus ce mois-là (data-key = "YYYY-MM")
    r.addEventListener('click', () => {
      const [yr, mo] = r.dataset.key.split('-');
      if (parseInt(r.dataset.count, 10) > 0) goToVusWithFilters({ yearvu: yr, mois: mo });
    });
  });
  svg.addEventListener('mouseleave', () => tooltip.style.opacity = '0');

  function showMonthTip(r) {
    const key = r.dataset.key;
    const count = r.dataset.count;
    const [y, m] = key.split('-');
    const names = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    tooltip.innerHTML = `<strong>${count}</strong> film${count > 1 ? 's' : ''} <span>· ${names[parseInt(m, 10) - 1]} ${y}</span>`;
    tooltip.style.opacity = '1';
  }

  // Moyenne films/mois par année : somme des films de l'année ÷ nombre de mois
  // de cette année présents dans la série (gaps à zéro compris, année courante
  // partielle gérée naturellement) → colle exactement aux barres ci-dessus
  const perYearAvg = new Map(); // année → [somme, mois présents]
  for (const d of months) {
    const yr = d.key.slice(0, 4);
    const acc = perYearAvg.get(yr) || [0, 0];
    acc[0] += d.count;
    acc[1] += 1;
    perYearAvg.set(yr, acc);
  }
  const avgChips = [...perYearAvg.entries()].map(([yr, [sum, n]]) =>
    `<span><strong style="color: var(--ink-soft)">${yr}</strong> ${(sum / n).toFixed(1).replace('.', ',')}/mois</span>`
  ).join('');

  // Bottom legend: moyenne mensuelle par année + bornes de la série
  document.getElementById('months-axis').innerHTML = `
    <div style="display:flex; flex-wrap: wrap; justify-content: center; align-items: baseline; gap: 4px 16px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); margin-top: 10px;">
      <span style="color: var(--ink-mute); letter-spacing: 0.08em;">moyenne /mois —</span>
      ${avgChips}
    </div>
    <div style="display:flex; justify-content: space-between; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--ink-mute); margin-top: 8px;">
      <span>${prettyMonth(months[0].key)}</span>
      <span>${prettyMonth(months[months.length - 1].key)}</span>
    </div>`;
}

function renderHeatmap() {
  // Top N most-frequent genres × ratings 1..6
  const genreCounts = new Map();
  for (const f of state.films) {
    for (const g of (f.genres || [])) genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
  }
  const topGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([g]) => g);

  // Matrice : ligne = genre, colonnes = 1★ … 5★ puis ❤
  const matrix = topGenres.map(g => {
    const row = new Array(RATING_FAV).fill(0);
    for (const f of state.films) {
      if (f.user?.statut !== 'vu' || !f.user?.rating) continue;
      if (!(f.genres || []).includes(g)) continue;
      row[f.user.rating - 1]++;
    }
    return { genre: g, row };
  });

  // Find max value across the matrix for color scaling
  let maxCell = 0;
  for (const m of matrix) for (const v of m.row) if (v > maxCell) maxCell = v;

  // Render
  const root = document.getElementById('heatmap');
  // Header
  let html = `<div class="heatmap-row heatmap-header">
    <div class="heatmap-genre-label"></div>
    <div class="heatmap-cell-header">1★</div>
    <div class="heatmap-cell-header">2★</div>
    <div class="heatmap-cell-header">3★</div>
    <div class="heatmap-cell-header">4★</div>
    <div class="heatmap-cell-header">5★</div>
    <div class="heatmap-cell-header">❤</div>
  </div>`;
  for (const m of matrix) {
    html += `<div class="heatmap-row">
      <div class="heatmap-genre-label">${escapeHtml(m.genre)}</div>`;
    for (let i = 0; i < RATING_FAV; i++) {
      const v = m.row[i];
      const intensity = maxCell > 0 ? v / maxCell : 0;
      const isFav = i === RATING_FAV - 1;
      const bg = heatmapColor(intensity, isFav);
      const textCol = intensity > 0.55 ? '#fff' : 'var(--ink-soft)';
      const clickAttrs = v > 0 ? ` heatmap-cell-clickable" data-genre="${escapeHtml(m.genre)}" data-rating="${i + 1}` : '';
      html += `<div class="heatmap-cell${clickAttrs}" style="background:${bg}; color:${textCol}">${v > 0 ? v : '·'}</div>`;
    }
    html += `</div>`;
  }
  root.innerHTML = html;
  // Case cliquable → films vus filtrés par ce genre et cette note
  root.querySelectorAll('.heatmap-cell-clickable').forEach(cell => {
    cell.style.cursor = 'pointer';
    cell.title = 'voir ces films';
    cell.addEventListener('click', () =>
      goToVusWithFilters({ genre: cell.dataset.genre, ratings: [parseInt(cell.dataset.rating, 10)] }));
  });
}

function renderOriginChart() {
  // Films vus uniquement, comptage FRACTIONNAIRE : une co-production « A · B · C »
  // ajoute 1/3 à chaque pays → le total colle au nombre de films vus au lieu de
  // gonfler (avant : chaque pays comptait 1, un film à 3 pays comptait 3 fois).
  const weights = new Map();
  let knownCount = 0;
  const vus = state.films.filter(f => f.user?.statut === 'vu');
  for (const f of vus) {
    if (!f.country) continue;
    // Normaliser au rendu aussi : d'anciennes fiches stockent « United States
    // of America » / « United Kingdom » bruts → fusionnés (États-Unis, Royaume-Uni)
    const parts = [...new Set(f.country.split(' · ').map(s => countryFr(s.trim())).filter(Boolean))];
    if (!parts.length) continue;
    knownCount++;
    const w = 1 / parts.length;
    for (const p of parts) weights.set(p, (weights.get(p) || 0) + w);
  }
  const total = vus.length;
  const missing = total - knownCount;

  // Coverage line
  const coverageEl = document.getElementById('origin-coverage');
  if (coverageEl) {
    coverageEl.textContent = `${knownCount} / ${total} films vus analysés${missing > 0 ? ` · ${missing} sans pays` : ''}`;
  }

  // Show "enrich" button if many films are missing
  const enrichWrap = document.getElementById('origin-enrich-wrap');
  if (enrichWrap) {
    enrichWrap.style.display = missing > 5 ? '' : 'none';
  }

  // Render bars (top 10) — valeur arrondie à l'affichage
  const sorted = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = sorted.length ? sorted[0][1] : 1;
  const root = document.getElementById('origin-chart');
  if (!root) return;
  if (sorted.length === 0) {
    root.innerHTML = '<div style="color: var(--ink-mute); font-style: italic;">aucun pays connu pour le moment. clique "enrichir" pour récupérer ces données via tmdb.</div>';
    return;
  }
  root.innerHTML = sorted.map(([country, w]) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(country)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(w / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${Math.round(w)}</div>
    </div>`).join('');
}

function renderDirectorCountryChart() {
  // Films vus, comptage fractionnaire réparti entre les réalisateurs dont le
  // pays de naissance est connu (données enrichies via TMDB /person).
  const weights = new Map();
  let known = 0;
  const vus = state.films.filter(f => f.user?.statut === 'vu');
  for (const f of vus) {
    const cs = dirCountriesOf(f);
    if (!cs.length) continue;
    known++;
    const w = 1 / cs.length;
    for (const c of cs) weights.set(c, (weights.get(c) || 0) + w);
  }
  const coverageEl = document.getElementById('director-country-coverage');
  if (coverageEl) coverageEl.textContent = `${known} / ${vus.length} films vus analysés`;

  const root = document.getElementById('director-country-chart');
  if (!root) return;
  if (weights.size === 0) {
    root.innerHTML = '<div style="color: var(--ink-mute); font-style: italic;">pas encore de données. clique « ↻ enrichir genres &amp; réalisateurs » (section parité) pour les récupérer via tmdb.</div>';
    return;
  }
  const sorted = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = sorted[0][1];
  root.innerHTML = sorted.map(([country, w]) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(country)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(w / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${Math.round(w)}</div>
    </div>`).join('');
}

// Bulk-enrich countries for all films missing it. Concurrency-limited.
let bulkEnrichRunning = false;
async function bulkEnrichCountries() {
  if (bulkEnrichRunning) return;
  bulkEnrichRunning = true;
  const btn = document.getElementById('origin-enrich-btn');
  const status = document.getElementById('origin-enrich-status');
  btn.disabled = true;
  const todo = state.films.filter(f => !f.country && f.tmdb_id && f.type);
  let done = 0;
  const total = todo.length;

  // Process in concurrent batches of 5
  const concurrency = 5;
  let idx = 0;
  async function worker() {
    while (idx < todo.length) {
      const i = idx++;
      const film = todo[i];
      try {
        const path = film.type === 'tv' ? 'tv' : 'movie';
        const url = `${TMDB_BASE}/${path}/${film.tmdb_id}?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR`;
        const r = await fetch(url);
        if (r.ok) {
          const detail = await r.json();
          const country = extractCountryFromTmdbDetail(detail);
          if (country) film.country = country;
        }
      } catch {}
      done++;
      status.textContent = `${done} / ${total}…`;
      // Re-render every 25 films
      if (done % 25 === 0) renderOriginChart();
    }
  }
  const workers = [];
  for (let k = 0; k < concurrency; k++) workers.push(worker());
  await Promise.all(workers);

  status.textContent = `${done} / ${total} terminé`;
  renderOriginChart();

  // Save to GitHub if admin active
  if (admin.active) {
    try {
      status.textContent += ' · sauvegarde…';
      await saveFilmsToGithub('enrich: countries for ' + done + ' films');
      status.textContent = `✓ ${done} films enrichis et sauvegardés`;
    } catch (e) {
      status.textContent = '⚠ enrichi en mémoire mais pas sauvegardé : ' + e.message;
    }
  } else {
    status.textContent += ' · (active l\'admin pour sauvegarder)';
  }
  btn.disabled = false;
  bulkEnrichRunning = false;
}

function heatmapColor(intensity, isFav) {
  // From bg-elev (low) to warm (mid) to hot (high) for normal cells
  // For ❤ column, use a more red-ish progression
  if (intensity === 0) return 'var(--bg-elev)';
  if (isFav) {
    // hot (red) gradient
    const r = Math.round(28 + (255 - 28) * intensity);
    const g = Math.round(39 + (107 - 39) * intensity);
    const b = Math.round(47 + (74 - 47) * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  }
  // warm gradient: bg-elev #1c272f → warm #d4a574
  const r = Math.round(28 + (212 - 28) * intensity);
  const g = Math.round(39 + (165 - 39) * intensity);
  const b = Math.round(47 + (116 - 47) * intensity);
  return `rgb(${r}, ${g}, ${b})`;
}

function prettyMonth(yyyymm) {
  const [y, m] = yyyymm.split('-');
  const names = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];
  return names[parseInt(m, 10) - 1] + ' ' + y;
}

function renderRatingDist() {
  const counts = new Array(RATING_FAV).fill(0); // 1★ … 5★ puis ❤
  for (const f of state.films) {
    // Vus uniquement : une note conservée sur un film repassé « à voir »
    // ne doit pas compter dans « comment tu notes »
    if (f.user?.statut !== 'vu') continue;
    const r = f.user?.rating;
    if (r >= 1 && r <= RATING_FAV) counts[r - 1]++;
  }
  const max = Math.max(...counts, 1);
  const root = document.getElementById('rating-dist');
  root.innerHTML = '';
  for (let i = 0; i < RATING_FAV; i++) {
    const bar = document.createElement('div');
    bar.className = 'rating-bar' + (i === RATING_FAV - 1 ? ' fav' : '');
    bar.style.height = (counts[i] / max * 100) + '%';
    bar.innerHTML = `<span class="rating-bar-count">${counts[i]}</span>`;
    // Clic → films vus notés ainsi
    if (counts[i] > 0) {
      bar.style.cursor = 'pointer';
      bar.title = 'voir ces films';
      bar.addEventListener('click', () => goToVusWithFilters({ ratings: [i + 1] }));
    }
    root.appendChild(bar);
  }
}


function renderGenreChart() {
  // Films vus uniquement : le compte doit correspondre au clic (qui filtre les vus)
  const counts = new Map();
  for (const f of state.films) {
    if (f.user?.statut !== 'vu') continue;
    for (const g of (f.genres || [])) counts.set(g, (counts.get(g) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = sorted.length ? sorted[0][1] : 1;
  const root = document.getElementById('genre-chart');
  root.innerHTML = sorted.map(([g, c]) => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(g)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(c / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${c}</div>
    </div>`).join('');
}

function renderDirectorChart() {
  const mCounts = new Map(), fCounts = new Map();
  for (const f of state.films) {
    if (!f.director) continue;
    // Compter CHAQUE réalisateur avec son propre genre (co-réalisations).
    // director_genders est parallèle à director.split(', ') ; à défaut (données
    // anciennes non encore complétées), on retombe sur le genre unique.
    const names = f.director.split(',').map(s => s.trim()).filter(Boolean);
    const genders = (f.director_genders && f.director_genders.length) ? f.director_genders : [f.director_gender];
    names.forEach((name, i) => {
      const g = genders[i] != null ? genders[i] : 0;
      if (g === 2) mCounts.set(name, (mCounts.get(name) || 0) + 1);
      else if (g === 1) fCounts.set(name, (fCounts.get(name) || 0) + 1);
    });
  }
  const renderSide = (counts, rootId, minCount = 2) => {
    const sorted = [...counts.entries()].filter(([, c]) => c >= minCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const max = sorted.length ? sorted[0][1] : 1;
    const root = document.getElementById(rootId);
    if (!sorted.length) {
      root.innerHTML = '<div style="color: var(--ink-mute); font-style: italic; font-size: 12px;">pas encore assez de données.</div>';
      return;
    }
    root.innerHTML = sorted.map(([d, c]) => `
      <div class="bar-row">
        <div class="bar-label">${nameLink(d)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(c / max * 100).toFixed(1)}%"></div></div>
        <div class="bar-value">${c}</div>
      </div>`).join('');
  };
  renderSide(mCounts, 'director-chart-m', 2);
  renderSide(fCounts, 'director-chart-f', 1); // lower threshold for female dirs
}

function renderYearChart() {
  // Films per year (year of viewing) — skip legacy "before-2022" bucket
  const counts = new Map();
  for (const f of state.films) {
    if (f.user?.statut !== 'vu') continue;
    const dv = f.user.date_vue;
    if (!dv || dv.startsWith('before-')) continue; // skip legacy bucket
    if (dv.length < 4) continue;
    const y = dv.slice(0, 4);
    counts.set(y, (counts.get(y) || 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(...entries.map(([, c]) => c), 1);
  const root = document.getElementById('year-chart');
  if (!entries.length) {
    root.innerHTML = '<div style="color: var(--ink-mute); font-style: italic;">pas de données.</div>';
    return;
  }
  root.innerHTML = entries.map(([y, c]) => `
    <div class="bar-row bar-row-clickable" data-year="${escapeHtml(y)}" title="voir ces films">
      <div class="bar-label">${escapeHtml(y)}</div>
      <div class="bar-track"><div class="bar-fill hot" style="width:${(c / max * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${c}</div>
    </div>`).join('');
  // Clic sur une année → films vus cette année-là
  root.querySelectorAll('.bar-row-clickable').forEach(row =>
    row.addEventListener('click', () => goToVusWithFilters({ yearvu: row.dataset.year })));
}

function renderGenreRatingChart() {
  // For each genre, compute average rating across rated films
  const buckets = new Map(); // genre → [sum, count]
  for (const f of state.films) {
    if (f.user?.statut !== 'vu' || !f.user?.rating) continue;
    for (const g of (f.genres || [])) {
      const b = buckets.get(g) || [0, 0];
      b[0] += ratingOutOf10(f.user.rating);
      b[1] += 1;
      buckets.set(g, b);
    }
  }
  // Only keep genres with at least 5 rated films, sort by avg desc
  const entries = [...buckets.entries()]
    .filter(([, b]) => b[1] >= 5)
    .map(([g, b]) => [g, b[0] / b[1], b[1]])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const root = document.getElementById('genre-rating-chart');
  if (!entries.length) {
    root.innerHTML = '<div style="color: var(--ink-mute); font-style: italic;">pas assez de données.</div>';
    return;
  }
  // Barres sur l'échelle /10, la même que la carte « note moyenne »
  root.innerHTML = entries.map(([g, avg, n]) => {
    const pct = (avg / 10 * 100).toFixed(1);
    const value = avg.toFixed(1);
    return `<div class="bar-row">
      <div class="bar-label">${escapeHtml(g)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="bar-value">${value}<span style="color: var(--ink-mute); margin-left: 4px;">(${n})</span></div>
    </div>`;
  }).join('');
}

function renderActorChart() {
  const mCounts = new Map(), fCounts = new Map();
  for (const f of state.films) {
    const cast = f.cast || [];
    const genders = f.cast_genders || [];
    cast.forEach((name, i) => {
      const g = genders[i] || 0;
      if (g === 2) mCounts.set(name, (mCounts.get(name) || 0) + 1);
      else if (g === 1) fCounts.set(name, (fCounts.get(name) || 0) + 1);
    });
  }
  const renderSide = (counts, rootId, minCount = 3) => {
    const sorted = [...counts.entries()].filter(([, c]) => c >= minCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const max = sorted.length ? sorted[0][1] : 1;
    const root = document.getElementById(rootId);
    if (!sorted.length) {
      root.innerHTML = '<div style="color: var(--ink-mute); font-style: italic; font-size: 12px;">pas encore assez de données.</div>';
      return;
    }
    root.innerHTML = sorted.map(([a, c]) => `
      <div class="bar-row">
        <div class="bar-label">${nameLink(a)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(c / max * 100).toFixed(1)}%"></div></div>
        <div class="bar-value">${c}</div>
      </div>`).join('');
  };
  renderSide(mCounts, 'actor-chart-m', 3);
  renderSide(fCounts, 'actor-chart-f', 2);
}

function renderGenderBalance() {
  const vus = state.films.filter(f => f.user?.statut === 'vu');
  const root = document.getElementById('gender-balance');
  const enrichWrap = document.getElementById('gender-enrich-wrap');

  const withDirGender = vus.filter(f => f.director_gender && f.director_gender > 0).length;
  const withCastGender = vus.filter(f => (f.cast_genders || []).some(g => g > 0)).length;
  // Reste-t-il des films à enrichir ? Basé sur la présence des champs
  // (director_genders / cast_genders), pas sur la valeur du genre : un genre
  // « inconnu » que TMDB ne fournit pas est déjà traité (director_genders posé),
  // donc le bouton se masque au lieu de rester affiché à vie sur ces trous.
  const needsEnrich = vus.some(f => f.type === 'movie' && f.tmdb_id && (!f.director_genders || !f.director_countries || !f.cast_genders));

  // Show enrich button whenever data is missing, admin mode controls whether the
  // button actually does anything (checked inside enrichGender itself).
  // MUST be before any early return.
  if (enrichWrap) {
    enrichWrap.style.display = needsEnrich ? '' : 'none';
  }

  if (withDirGender === 0 && withCastGender === 0) {
    root.innerHTML = '<div style="color: var(--ink-mute); font-style: italic; font-size: 13px;">active le mode édition (🔒) puis clique "↻ enrichir les données de genre" ci-dessous.</div>';
    return;
  }

  // Director gender
  const dirM = vus.filter(f => f.director_gender === 2).length;
  const dirF = vus.filter(f => f.director_gender === 1).length;
  const dirU = vus.filter(f => f.director && (!f.director_gender || f.director_gender === 0)).length;
  const dirTotal = dirM + dirF + dirU || 1;

  // Lead actor gender (first cast member with known gender)
  const leadM = vus.filter(f => (f.cast_genders || [])[0] === 2).length;
  const leadF = vus.filter(f => (f.cast_genders || [])[0] === 1).length;
  const leadU = vus.filter(f => f.cast && f.cast.length > 0 && (!(f.cast_genders || [])[0] || (f.cast_genders || [])[0] === 0)).length;
  const leadTotal = leadM + leadF + leadU || 1;

  const bar = (label, m, f, u, total) => {
    const pctM = (m / total * 100).toFixed(1);
    const pctF = (f / total * 100).toFixed(1);
    const pctU = (u / total * 100).toFixed(1);
    return `
      <div class="gender-balance-row">
        <div class="gender-balance-label">${label}</div>
        <div class="gender-balance-track">
          <div class="gender-balance-seg male" style="width:${pctM}%">${m > 0 ? m : ''}</div>
          <div class="gender-balance-seg female" style="width:${pctF}%">${f > 0 ? f : ''}</div>
          ${u > 0 ? `<div class="gender-balance-seg unknown" style="width:${pctU}%">${u}</div>` : ''}
        </div>
        <div class="gender-balance-legend">
          <span>hommes ${pctM}%</span><span>femmes ${pctF}%</span>${u > 0 ? `<span>non renseigné ${pctU}%</span>` : ''}
        </div>
      </div>`;
  };

  root.innerHTML =
    bar('réalisateur · réalisatrice', dirM, dirF, dirU, dirTotal) +
    bar('acteur · actrice principal·e', leadM, leadF, leadU, leadTotal);
}

/** Fetch the best available Latin name for a TMDB person by their ID.
 *  Tries en-US first, then no language filter (different results sometimes).
 *  Falls back to `also_known_as` in both cases. */
async function fetchLatinNameById(personId) {
  const attempts = [
    `${TMDB_BASE}/person/${personId}?api_key=${encodeURIComponent(admin.tmdbKey)}&language=en-US`,
    `${TMDB_BASE}/person/${personId}?api_key=${encodeURIComponent(admin.tmdbKey)}`,
  ];
  for (const url of attempts) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const p = await r.json();
      // Check main name first
      if (p.name && !hasNonLatin(p.name)) return p.name;
      // Then scan also_known_as for any Latin entry
      for (const aka of (p.also_known_as || [])) {
        if (aka && !hasNonLatin(aka)) return aka;
      }
    } catch { /* ignore, try next */ }
    await new Promise(res => setTimeout(res, 200));
  }
  return null;
}

/** Pays de naissance normalisé d'une personne TMDB (via place_of_birth). '' si inconnu. */
async function fetchPersonCountry(personId) {
  try {
    const r = await fetch(`${TMDB_BASE}/person/${personId}?api_key=${encodeURIComponent(admin.tmdbKey)}`);
    if (!r.ok) return '';
    const p = await r.json();
    return placeToCountry(p.place_of_birth);
  } catch { return ''; }
}

async function enrichGender() {
  if (!admin.active || !admin.tmdbKey) return;
  const btn = document.getElementById('gender-enrich-btn');
  const status = document.getElementById('gender-enrich-status');

  // Include films that:
  // - are missing gender data, OR
  // - still have non-Latin names (re-run even if gender was already set,
  //   so a failed name fix can be retried after deploying improved logic)
  const toEnrich = state.films.filter(
    f => f.tmdb_id && f.type === 'movie' && (
      !f.director_genders || !f.director_countries || !f.cast_genders ||
      hasNonLatin(f.director || '') ||
      (f.cast || []).some(c => hasNonLatin(c))
    )
  );
  if (!toEnrich.length) { status.textContent = 'rien à enrichir.'; return; }
  btn.disabled = true;
  let done = 0;
  status.textContent = `0 / ${toEnrich.length}…`;

  for (const f of toEnrich) {
    try {
      // 1. Fetch credits (gender + name data)
      const r = await fetch(
        `${TMDB_BASE}/movie/${f.tmdb_id}/credits?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR`
      );
      if (!r.ok) { done++; continue; }
      const data = await r.json();
      const rawCast = (data.cast || []).slice(0, 5);
      f.cast_genders = rawCast.map(c => c.gender || 0);

      // 2. Liste COMPLÈTE des réalisateurs (co-réalisations) + genres + pays de
      //    naissance (via /person), noms latinisés — le tout aligné par index
      const dirs = (data.crew || []).filter(c => c.job === 'Director');
      const dirNames = [], dirGenders = [], dirCountries = [], seenDir = new Set();
      for (const d of dirs) {
        let nm = bestPersonName(d);
        if (hasNonLatin(nm) && d.id) {
          await new Promise(res => setTimeout(res, 300));
          nm = (await fetchLatinNameById(d.id)) || nm;
        }
        if (!nm || seenDir.has(nm)) continue;
        seenDir.add(nm); dirNames.push(nm); dirGenders.push(d.gender || 0);
        let country = '';
        if (d.id) {
          await new Promise(res => setTimeout(res, 300));
          country = await fetchPersonCountry(d.id);
        }
        dirCountries.push(country);
      }
      if (dirNames.length) {
        f.director = dirNames.join(', ');
        f.director_genders = dirGenders;
        f.director_gender = dirGenders[0] || 0;
        f.director_countries = dirCountries;
      }

      // 3. Reconstruire les noms depuis les MÊMES entrées TMDB que les genres.
      // L'ancien code gardait les anciens noms par index face aux genres du
      // casting actuel : si l'ordre TMDB avait changé depuis l'ajout du film,
      // noms et genres se désalignaient durablement dans films.json.
      const newCast = [];
      for (const person of rawCast) {
        let name = bestPersonName(person);
        if (hasNonLatin(name) && person.id) {
          await new Promise(res => setTimeout(res, 300));
          name = (await fetchLatinNameById(person.id)) || name;
        }
        newCast.push(name);
      }
      f.cast = newCast;
    } catch (_) { /* skip */ }

    done++;
    if (done % 5 === 0) status.textContent = `${done} / ${toEnrich.length}…`;
    await new Promise(res => setTimeout(res, 300));
  }

  status.textContent = `${done} films enrichis. Sauvegarde…`;
  try {
    await saveFilmsToGithub('enrichi: données de genre + noms latinisés');
    refreshStats();
    status.textContent = `✓ ${done} films enrichis et sauvegardés.`;
  } catch (e) {
    status.textContent = `enrichissement ok mais erreur sauvegarde : ${e.message}`;
  }
  btn.disabled = false;
}

function renderYearBest() {
  // For each year of viewing, find the highest-rated film
  const byYear = new Map(); // year → [films]
  for (const f of state.films) {
    if (f.user?.statut !== 'vu' || !f.user.rating) continue;
    const dv = f.user.date_vue;
    if (!dv || dv.startsWith('before-')) continue;
    const y = dv.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(f);
  }
  const years = [...byYear.keys()].sort().reverse();
  const root = document.getElementById('year-best');
  if (!years.length) {
    root.innerHTML = '<div style="color: var(--ink-mute); font-style: italic;">pas de données suffisantes.</div>';
    return;
  }
  root.innerHTML = years.map(y => {
    const list = byYear.get(y);
    list.sort((a, b) => b.user.rating - a.user.rating);
    const top = list[0];
    const others = list.filter(f => f.user.rating === top.user.rating).slice(0, 3);
    const filmCells = others.map(f => `
      <div class="year-best-film" data-film-id="${escapeHtml(f.id)}" role="button" tabindex="0">
        <div class="year-best-poster ${f.poster ? '' : 'empty'}" ${f.poster ? `style="background-image:url(${safeUrl(tmdbResize(f.poster, 'w185'))})"` : ''}></div>
        <div class="year-best-title">${escapeHtml(f.title)}</div>
        <div class="year-best-meta">${f.user.favorite ? '❤' : '★'.repeat(f.user.rating)}${f.director ? ' · ' + escapeHtml(f.director) : ''}</div>
      </div>`).join('');
    return `<div class="year-best-row">
      <div class="year-best-year">${y}</div>
      <div class="year-best-films">${filmCells}</div>
    </div>`;
  }).join('');
  // Écouteurs plutôt qu'un onclick inline : un id interpolé dans du JS
  // d'attribut n'est pas neutralisable par escapeHtml
  root.querySelectorAll('.year-best-film').forEach(el => {
    el.addEventListener('click', () => openModalFromCard(el.dataset.filmId));
  });
}

// Helper to open modal from a card click in stats (lookup by id)
function openModalFromCard(filmId) {
  const f = state.films.find(x => x.id === filmId);
  if (f) openModal(f);
}

// Rend cliquables les lignes d'un graphe en barres : le libellé de la ligne
// devient la valeur du filtre. Idempotent (ne recâble pas une ligne déjà faite,
// donc le graphe « par année » garde son propre câblage).
// Combien de films vus le clic renverra-t-il ? (les graphes « pays » utilisent
// un comptage fractionnaire : 197 pour la France ≠ 271 films impliquant la
// France — l'infobulle annonce donc le vrai nombre avant le clic.)
function countVusMatching(filterKey, val) {
  const vus = state.films.filter(f => f.user?.statut === 'vu');
  if (filterKey === 'genre') return vus.filter(f => (f.genres || []).includes(val)).length;
  if (filterKey === 'country') return vus.filter(f => f.country &&
    f.country.split(' · ').map(c => countryFr(c.trim())).includes(val)).length;
  if (filterKey === 'dirCountry') return vus.filter(f => dirCountriesOf(f).includes(val)).length;
  if (filterKey === 'search') {
    const q = normSearch(val);
    return vus.filter(f => [f.title, f.original_title, f.director, (f.cast || []).join(' ')]
      .some(t => t && normSearch(t).includes(q))).length;
  }
  return null;
}

function wireBarRowsClick(rootId, filterKey) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.querySelectorAll('.bar-row').forEach(row => {
    if (row.classList.contains('bar-row-clickable')) return;
    const label = row.querySelector('.bar-label');
    const val = label && (label.textContent || '').trim();
    if (!val) return;
    row.classList.add('bar-row-clickable');
    const n = countVusMatching(filterKey, val);
    row.title = (n != null) ? `voir ces ${n} film${n > 1 ? 's' : ''}` : 'voir ces films';
    row.addEventListener('click', (e) => {
      if (e.target.closest('a')) return; // clic sur le lien du nom -> tmdb
      goToVusWithFilters({ [filterKey]: val });
    });
  });
}

// Toutes les stats « catégorie » deviennent des points d'entrée vers les vus.
function wireStatsClicks() {
  wireBarRowsClick('genre-rating-chart', 'genre');
  wireBarRowsClick('genre-chart', 'genre');
  wireBarRowsClick('origin-chart', 'country');
  wireBarRowsClick('director-country-chart', 'dirCountry');
  // réalisateurs / acteurs : pas de filtre dédié -> on passe par la recherche
  ['director-chart-m', 'director-chart-f', 'actor-chart-m', 'actor-chart-f']
    .forEach(id => wireBarRowsClick(id, 'search'));
  document.querySelectorAll('#stats-numbers .stat-card-clickable').forEach(c => {
    if (c.dataset.wired) return;
    c.dataset.wired = '1';
    c.addEventListener('click', () => {
      if (c.dataset.stat === 'favorites') goToVusWithFilters({ ratings: [RATING_FAV] });
    });
  });
}

// Depuis une stat cliquable → page collection, onglet « vus », filtres appliqués.
// partial : { genre, ratings:[..], yearvu, mois, decade, lieu }
function goToVusWithFilters(partial) {
  partial = partial || {};
  // Repartir de filtres propres, puis appliquer le sous-ensemble demandé
  state.filters = { status: 'vu', search: '', genre: '', lieu: '', decade: '', yearvu: '', mois: '', country: '', dirCountry: '', ratings: new Set() };
  ['genre', 'lieu', 'decade', 'yearvu', 'mois', 'country', 'dirCountry', 'search'].forEach(k => { if (partial[k]) state.filters[k] = partial[k]; });
  if (partial.ratings) partial.ratings.forEach(rt => state.filters.ratings.add(rt));
  state.view = 'vu';
  state.sort = TAB_SORT_DEFAULTS.vu;

  // Basculer sur la collection + onglet vus
  showPage('collection');
  document.querySelectorAll('#status-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'vu'));
  document.getElementById('collection-controls').style.display = '';
  document.getElementById('discover-header').style.display = 'none';
  document.getElementById('reco-header').style.display = 'none';

  // Refléter l'état dans l'UI des filtres + ouvrir le panneau pour montrer ce qui est appliqué
  document.getElementById('search').value = state.filters.search || '';
  document.getElementById('sort').value = state.sort;
  const setSel = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setSel('filter-genre', state.filters.genre);
  setSel('filter-lieu', state.filters.lieu);
  setSel('filter-decade', state.filters.decade);
  setSel('filter-yearvu', state.filters.yearvu);
  setSel('filter-mois', state.filters.mois);
  setSel('filter-country', state.filters.country);
  setSel('filter-realpays', state.filters.dirCountry);
  document.querySelectorAll('#rating-chips .rating-chip').forEach(c =>
    c.classList.toggle('active', state.filters.ratings.has(parseInt(c.dataset.rating, 10))));
  document.getElementById('filter-panel').classList.add('open');
  document.getElementById('filter-toggle').setAttribute('aria-expanded', 'true');
  document.getElementById('filter-toggle-label').textContent = '− filtres';

  applyFilters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// HELPERS
// ============================================================

/** Detect characters from non-Latin scripts that cannot be read by a
 *  Western audience: CJK (Chinese/Japanese/Korean hanzi), Hiragana,
 *  Katakana, Korean Hangul, Thai, Cyrillic, Arabic (+ presentation forms),
 *  Hebrew, Devanagari. Does NOT catch extended Latin
 *  (Vietnamese diacritics, French accents, etc.) — those are fine. */
function hasNonLatin(s) {
  if (!s) return false;
  return /[\u3000-\u9fff\u3040-\u30ff\uac00-\ud7ff\uf900-\ufaff\u0e00-\u0e7f\u0400-\u052f\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff\u0900-\u097f]/u.test(s);
}

/** Prefer the Latin-script variant of a TMDB person name.
 *  TMDB person objects have `name` (often romanized) and `original_name`
 *  (sometimes in local script). If `name` is non-Latin and `original_name`
 *  is not, swap them. */
function bestPersonName(person) {
  const name = person.name || '';
  const orig = person.original_name || '';
  if (hasNonLatin(name) && orig && !hasNonLatin(orig)) return orig;
  return name;
}

/** Return a TMDB search link for a person name, or plain text if non-Latin. */
function nameLink(name) {
  if (!name) return '';
  if (hasNonLatin(name)) return escapeHtml(name); // non-Latin: display as-is, no link
  const url = 'https://www.themoviedb.org/search/person?query=' + encodeURIComponent(name);
  return `<a href="${url}" target="_blank" rel="noopener" class="name-link">${escapeHtml(name)}</a>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/** URL sûre pour interpolation dans un attribut HTML construit par gabarit
 *  (style="background-image:url(…)", href) : https absolu, sans caractère
 *  capable de sortir de l'attribut ou d'un url() CSS. Retourne '' sinon.
 *  escapeHtml ne suffit pas ici : ses entités sont re-décodées par le
 *  parseur HTML avant d'atteindre le contexte CSS/JS. */
const UNSAFE_URL_CHARS = ['"', "'", '<', '>', '(', ')', ' ',
  String.fromCharCode(9), String.fromCharCode(10), String.fromCharCode(13), String.fromCharCode(92)];
function safeUrl(u) {
  const s = String(u || '');
  if (!s.startsWith('https://')) return '';
  return UNSAFE_URL_CHARS.some(c => s.includes(c)) ? '' : s;
}

// ============================================================
// ADMIN MODE
// ============================================================

// Configuration: auto-detect repo from URL (GitHub Pages).
// Sur un domaine custom, la détection par *.github.io ne fonctionne plus :
// renseigner REPO_OVERRIDE, p. ex. { owner: 'moncompte', repo: 'films' }.
const REPO_OVERRIDE = null;
// Branche qui héberge films.json (lectures ET écritures API).
const GH_BRANCH = 'main';
const REPO = REPO_OVERRIDE || (function() {
  const host = window.location.hostname;
  const path = window.location.pathname;
  if (host.endsWith('.github.io')) {
    const owner = host.replace('.github.io', '');
    const segs = path.split('/').filter(Boolean);
    if (segs.length === 0) return { owner, repo: owner + '.github.io' };
    return { owner, repo: segs[0] };
  }
  return null; // local file — admin disabled
})();

// User's TMDB v3 API key — used for explorer search and admin add/rematch/edit.
// Safe to include here: TMDB v3 keys are designed for client-side use,
// are read-only, and rate-limited per IP. To rotate, just replace the value below.
const TMDB_KEY = '0d4800441b51145563ae046ef3b943ac';

const admin = {
  active: false,
  tmdbKey: TMDB_KEY,
  ghToken: null,         // decrypted PAT, in memory only after unlock
  encryptedPAT: null,    // base64 string from localStorage; null = first-time setup
  filmsSHA: null,
  pendingRematchFilmId: null,
};

function loadAdminCreds() {
  admin.encryptedPAT = localStorage.getItem('films_encrypted_pat') || null;
}

function saveEncryptedPAT(b64) {
  localStorage.setItem('films_encrypted_pat', b64);
  admin.encryptedPAT = b64;
}

function clearAdminCreds() {
  localStorage.removeItem('films_encrypted_pat');
  admin.encryptedPAT = null;
  admin.ghToken = null;
}

// --------------- CRYPTO HELPERS ---------------
// Encrypt PAT with user's code via PBKDF2 + AES-GCM. The encrypted blob can
// safely sit in localStorage — without the code, it's unrecoverable.
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptWithCode(plaintext, code) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  // Combine salt + iv + ciphertext, base64 encode
  const combined = new Uint8Array(salt.byteLength + iv.byteLength + ct.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.byteLength);
  combined.set(new Uint8Array(ct), salt.byteLength + iv.byteLength);
  let bin = '';
  for (let i = 0; i < combined.length; i++) bin += String.fromCharCode(combined[i]);
  return btoa(bin);
}

async function decryptWithCode(encryptedB64, code) {
  const bin = atob(encryptedB64);
  const combined = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) combined[i] = bin.charCodeAt(i);
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ct = combined.slice(28);
  const key = await deriveKey(code, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ----------------- TMDB --------------------
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';
function tmdbImgUrl(path, size = 'w342') { return path ? TMDB_IMG + '/' + size + path : null; }

// ---- « au ciné » : films actuellement en salles en France (TMDB now_playing) ----
// Ensemble d'ids « movie-<tmdb_id>» ; alimente le badge vert sur les cartes.
let nowPlayingSet = new Set();
async function fetchNowPlayingIdsFR() {
  const base = `${TMDB_BASE}/movie/now_playing?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR&region=FR`;
  const first = await fetch(base + '&page=1');
  if (!first.ok) throw new Error('now_playing ' + first.status);
  const data = await first.json();
  const ids = (data.results || []).map(m => 'movie-' + m.id);
  const totalPages = Math.min(data.total_pages || 1, 12); // borne : ~240 films, couvre les sorties courantes
  const rest = [];
  for (let p = 2; p <= totalPages; p++) rest.push(p);
  const pages = await Promise.all(rest.map(p =>
    fetch(base + '&page=' + p).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))));
  for (const d of pages) for (const m of (d.results || [])) ids.push('movie-' + m.id);
  return [...new Set(ids)];
}
async function ensureNowPlayingFR() {
  const KEY = 'films_nowplaying_fr';
  try {
    const cached = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (cached && Array.isArray(cached.ids) && (Date.now() - cached.ts) < 24 * 3600 * 1000) {
      nowPlayingSet = new Set(cached.ids);
      return;
    }
  } catch {}
  try {
    const ids = await fetchNowPlayingIdsFR();
    nowPlayingSet = new Set(ids);
    try { localStorage.setItem(KEY, JSON.stringify({ ts: Date.now(), ids })); } catch {}
  } catch { /* réseau/tmdb — pas de badge, sans bloquer l'app */ }
}

/** Réécrit la taille d'une URL d'affiche TMDB déjà stockée
 *  (…/t/p/w500/x.jpg → …/t/p/w342/x.jpg). URL non-TMDB : inchangée.
 *  Les fiches stockent du w500 (bon pour le modal) mais les cartes de
 *  grille (~220 px) et vignettes n'ont pas besoin d'autant. */
function tmdbResize(url, size) {
  if (!url || !url.startsWith(TMDB_IMG + '/')) return url;
  const rest = url.slice(TMDB_IMG.length + 1); // ex. 'w500/x.jpg'
  const slash = rest.indexOf('/');
  return slash === -1 ? url : TMDB_IMG + '/' + size + rest.slice(slash);
}

async function tmdbSearch(query) {
  if (!query) return [];

  // Parse trailing year hint: "Play 2019" → query="Play", year=2019
  let year = null;
  const yearMatch = query.match(/\s+(19\d{2}|20\d{2})\s*$/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    query = query.slice(0, yearMatch.index).trim();
  }

  // Fetch 2 pages of /search/multi for broader coverage
  const fetchPage = async (page) => {
    const url = `${TMDB_BASE}/search/multi?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('TMDB search ' + r.status);
    return (await r.json()).results || [];
  };
  const [p1, p2] = await Promise.all([fetchPage(1), fetchPage(2).catch(() => [])]);
  let all = [...p1, ...p2];

  // Separate by type
  const films = all.filter(it => it.media_type === 'movie' || it.media_type === 'tv');
  const persons = all.filter(it => it.media_type === 'person').slice(0, 2);

  // For each person, fetch their top movies/TV and add (so searching "Marciano" works)
  if (persons.length > 0) {
    const personFilms = await Promise.all(persons.map(async (p) => {
      try {
        const url = `${TMDB_BASE}/person/${p.id}/combined_credits?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR`;
        const r = await fetch(url);
        if (!r.ok) return [];
        const d = await r.json();
        // crew (e.g. directors) prioritized over cast
        const crewRoles = (d.crew || []).filter(c => c.job === 'Director' || c.department === 'Directing');
        const items = [...crewRoles, ...(d.cast || [])];
        return items.map(it => ({
          ...it,
          media_type: it.media_type || 'movie',
          _from_person: p.name,
        }));
      } catch { return []; }
    }));
    // Merge unique
    const existingIds = new Set(films.map(f => f.media_type + '-' + f.id));
    for (const list of personFilms) {
      for (const it of list) {
        const key = (it.media_type || 'movie') + '-' + it.id;
        if (!existingIds.has(key)) {
          films.push(it);
          existingIds.add(key);
        }
      }
    }
  }

  // Year filter
  let result = films;
  if (year) {
    result = result.filter(f => {
      const d = f.release_date || f.first_air_date || '';
      return d.startsWith(String(year));
    });
  }

  // Dedupe
  const seen = new Set();
  const deduped = [];
  for (const f of result) {
    const key = (f.media_type || 'movie') + '-' + f.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }
  return deduped;
}

async function tmdbDetails(id, type) {
  const path = type === 'tv' ? 'tv' : 'movie';
  const url = `${TMDB_BASE}/${path}/${id}?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR&append_to_response=credits,external_ids,videos&include_video_language=fr,en`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('TMDB details ' + r.status);
  return await r.json();
}


// Browse TMDB by category. Returns up to ~40 results (2 pages).
// Avec un filtre (genre / pays), bascule sur /discover/movie : filtrer côté
// client les ~40 items d'une catégorie ne laisserait presque rien, alors que
// /discover cherche dans tout le catalogue. La sémantique des catégories est
// conservée par fenêtre de dates (en salles ≈ 6 dernières semaines,
// prochainement = sorties futures, tendances = populaires tous horizons).
async function tmdbBrowse(category, filters) {
  filters = filters || {};
  const hasFilters = !!(filters.genre || filters.country || filters.decade
    || (filters.sort && filters.sort !== 'popularity.desc'));
  const params = `api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR&region=FR`;
  let baseUrl;
  if (hasFilters) {
    const sort = filters.sort || 'popularity.desc';
    let extra = '&sort_by=' + encodeURIComponent(sort) + '&include_adult=false';
    if (filters.genre) extra += '&with_genres=' + encodeURIComponent(filters.genre);
    if (filters.country) extra += '&with_origin_country=' + encodeURIComponent(filters.country);
    // Plancher de votes : trier par note sans plancher fait remonter des
    // films notés 10/10 par trois votants ; par date, des sorties confidentielles
    let voteFloor = 0;
    if (sort === 'vote_average.desc') voteFloor = category === 'trending' ? 200 : category === 'now_playing' ? 50 : 0;
    else if (sort === 'primary_release_date.desc' && category === 'trending') voteFloor = 20;
    if (voteFloor) extra += '&vote_count.gte=' + voteFloor;
    // Fenêtre de dates
    const today = new Date().toISOString().slice(0, 10);
    let gte = '', lte = '';
    if (category === 'now_playing') {
      gte = new Date(Date.now() - 42 * 86400000).toISOString().slice(0, 10);
      lte = today;
    } else if (category === 'upcoming') {
      gte = today;
    } else {
      if (filters.decade) {
        const dec = parseInt(filters.decade, 10);
        gte = dec + '-01-01';
        lte = (dec + 9) + '-12-31';
      }
      // Tri par date sur « tendances » : exclure les sorties futures
      if (sort === 'primary_release_date.desc' && (!lte || lte > today)) lte = today;
    }
    if (gte) extra += `&primary_release_date.gte=${gte}`;
    if (lte) extra += `&primary_release_date.lte=${lte}`;
    baseUrl = `${TMDB_BASE}/discover/movie?${params}${extra}`;
  } else {
    const endpoints = {
      trending: `${TMDB_BASE}/trending/movie/week?${params}`,   // films seulement
      upcoming: `${TMDB_BASE}/movie/upcoming?${params}`,
      now_playing: `${TMDB_BASE}/movie/now_playing?${params}`,
    };
    baseUrl = endpoints[category] || endpoints.trending;
  }
  // Ordre par défaut (popularité, sans filtre de pays) : on rééquilibre, et il
  // faut aller chercher plus loin dans la liste — TMDB classe les films non
  // américains bien après les 40 premiers. Sinon 2 pages suffisent.
  const rebalance = !filters.country && (filters.sort || 'popularity.desc') === 'popularity.desc';
  const pageCount = rebalance ? DISCOVER_REBALANCE_PAGES : 2;
  const [p1, ...others] = await Promise.all([
    fetch(baseUrl + '&page=1').then(r => r.ok ? r.json() : { results: [] }),
    ...Array.from({ length: pageCount - 1 }, (_, i) =>
      fetch(baseUrl + '&page=' + (i + 2)).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))),
  ]);
  const all = [p1, ...others].flatMap(p => p.results || []);
  // Une liste « all » renverrait aussi des personnes — pas affichables comme films
  // (pas de poster_path, et le clic requêterait /movie/{id_de_personne}).
  // Dédoublonnage : la pagination TMDB glisse d'une page à l'autre.
  const seen = new Set();
  const list = all
    .filter(it => it.media_type !== 'person')
    .map(it => ({
      ...it,
      // Add media_type for movie-only endpoints (TMDB doesn't include it there)
      media_type: it.media_type || 'movie',
    }))
    .filter(it => { const k = it.media_type + '-' + it.id; return !seen.has(k) && seen.add(k); });
  if (rebalance) return capUSShare(list, DISCOVER_COUNT);
  // Re-tri local : TMDB ne garantit pas un ordre strict à la jonction des
  // deux pages, et la date affichée (sortie FR via region=FR) peut différer
  // de la date de tri serveur (sortie originale)
  if (hasFilters) {
    const sort = filters.sort || 'popularity.desc';
    if (sort === 'vote_average.desc') list.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    else if (sort === 'primary_release_date.desc') list.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''));
  }
  return list.slice(0, DISCOVER_COUNT);
}

// Au plus un film américain sur trois dans les onglets de Découvrir. Est
// américain tout film dont les États-Unis sont un pays de production : les
// coproductions comme GB/US ou US/DE/FR sont le plus souvent des films de
// studios américains. L'ordre TMDB est gardé autant que possible : chaque
// place revient au film le mieux classé qui ne fait pas dépasser la part.
// Certains films ne profitent pas des places libérées (DISCOVER_NO_BOOST) :
// ils restent à leur rang TMDB, sans remonter.
// Le pays vient du profil de film de la reco, dont il partage le cache.
const DISCOVER_COUNT = 40;
const DISCOVER_REBALANCE_PAGES = 5;
const DISCOVER_MAX_US_SHARE = 1 / 3;
const DISCOVER_NO_BOOST = ['IN'];   // films indiens (sorties pour la diaspora)
async function capUSShare(list, count) {
  const cache = loadRecoProfiles();
  const typeOf = it => it.media_type === 'tv' ? 'tv' : 'movie';
  await mapWithConcurrency(list, 8, it => recoProfile(cache, typeOf(it), it.id));
  saveRecoProfiles(cache);
  const countries = it => cache.get(typeOf(it) + '-' + it.id)?.p || [];
  const isUS = it => countries(it).includes('US');
  const noBoost = it => countries(it).some(c => DISCOVER_NO_BOOST.includes(c));
  // Films sans coup de pouce : réservés à leur rang TMDB (au-delà de la
  // grille, ils n'y entrent pas) ; les autres places se remplissent sans eux
  const pinned = new Map();
  list.forEach((it, rank) => { if (noBoost(it) && rank < count) pinned.set(rank, it); });
  const queue = list.filter(it => !noBoost(it)), out = [];
  let us = 0;
  while (out.length < count) {
    const held = pinned.get(out.length);
    if (held) { if (isUS(held)) us++; out.push(held); continue; }
    // arrondi au supérieur : la 1re place peut revenir à un film US, pas les 2 suivantes
    const allowed = Math.ceil((out.length + 1) * DISCOVER_MAX_US_SHARE);
    let i = queue.findIndex(it => us + (isUS(it) ? 1 : 0) <= allowed);
    // Il ne reste que des films US : la liste s'arrête là plutôt que de
    // dépasser la part (« tendances », très américain, peut compter moins de 40 films)
    if (i === -1) break;
    const [it] = queue.splice(i, 1);
    if (isUS(it)) us++;
    out.push(it);
  }
  return out;
}

// Build a full film object from TMDB detail data (movie or tv)
// ISO 3166-1 alpha-2 → French country names (for TV "origin_country" which gives codes)
const ISO_TO_COUNTRY = {
  AR: 'Argentine', AT: 'Autriche', AU: 'Australie', BE: 'Belgique', BR: 'Brésil',
  CA: 'Canada', CH: 'Suisse', CN: 'Chine', CO: 'Colombie', CZ: 'Tchéquie',
  DE: 'Allemagne', DK: 'Danemark', EG: 'Égypte', ES: 'Espagne', FI: 'Finlande',
  FR: 'France', GB: 'UK', GE: 'Géorgie', GR: 'Grèce', HK: 'Hong Kong',
  HR: 'Croatie', HU: 'Hongrie', ID: 'Indonésie', IE: 'Irlande', IL: 'Israël',
  IN: 'Inde', IR: 'Iran', IS: 'Islande', IT: 'Italie', JP: 'Japon',
  KR: 'Corée du Sud', LB: 'Liban', LU: 'Luxembourg', MA: 'Maroc', MX: 'Mexique',
  NL: 'Pays-Bas', NO: 'Norvège', NZ: 'Nouvelle-Zélande', PH: 'Philippines', PL: 'Pologne',
  PT: 'Portugal', RO: 'Roumanie', RS: 'Serbie', RU: 'Russie', SA: 'Arabie saoudite',
  SE: 'Suède', SG: 'Singapour', TH: 'Thaïlande', TN: 'Tunisie', TR: 'Turquie',
  TW: 'Taïwan', UA: 'Ukraine', US: 'USA', VN: 'Vietnam', ZA: 'Afrique du Sud',
};

function shortenCountryName(name) {
  if (!name) return name;
  // English variants
  if (name === 'United States of America' || name === 'United States') return 'USA';
  if (name === 'United Kingdom') return 'UK';
  // French variants (when TMDB returns FR localization)
  if (name === "États-Unis d'Amérique" || name === 'États-Unis') return 'USA';
  if (name === 'Royaume-Uni') return 'UK';
  return name;
}

// Pays en français pour tout ce qui s'affiche (fiche, filtres, graphes) :
// films.json garde les noms anglais de TMDB, et les pays de naissance
// normalisés en anglais. Le nom français sert aussi de valeur aux filtres,
// donc deux écritures d'un même pays (« Germany », « Allemagne ») ne font
// qu'une entrée. Les noms identiques en français (Canada, France, Iran…)
// n'y figurent pas ; un pays absent de la table reste en anglais : l'ajouter ici.
const COUNTRY_FR = {
  'Albania': 'Albanie', 'Algeria': 'Algérie', 'Andorra': 'Andorre', 'Argentina': 'Argentine',
  'Armenia': 'Arménie', 'Australia': 'Australie', 'Austria': 'Autriche', 'Azerbaijan': 'Azerbaïdjan',
  'Belarus': 'Biélorussie', 'Belgium': 'Belgique', 'Benin': 'Bénin', 'Bhutan': 'Bhoutan',
  'Bolivia': 'Bolivie', 'Bosnia and Herzegovina': 'Bosnie-Herzégovine', 'Brazil': 'Brésil',
  'British India': 'Inde britannique', 'Bulgaria': 'Bulgarie', 'Cambodia': 'Cambodge',
  'Cameroon': 'Cameroun', 'Chad': 'Tchad', 'Chile': 'Chili', 'China': 'Chine',
  'Colombia': 'Colombie', 'Croatia': 'Croatie', 'Cyprus': 'Chypre', 'Czech Republic': 'Tchéquie',
  'Czechia': 'Tchéquie', 'Czechoslovakia': 'Tchécoslovaquie', 'Denmark': 'Danemark',
  'Dominican Republic': 'République dominicaine', 'East Germany': "Allemagne de l'Est",
  'Ecuador': 'Équateur', 'Egypt': 'Égypte', 'Estonia': 'Estonie', 'Ethiopia': 'Éthiopie',
  'Finland': 'Finlande', 'French Polynesia': 'Polynésie française', 'Georgia': 'Géorgie',
  'Germany': 'Allemagne', 'Greece': 'Grèce', 'Greenland': 'Groenland', 'Haiti': 'Haïti',
  'Hungary': 'Hongrie', 'Iceland': 'Islande', 'India': 'Inde', 'Indonesia': 'Indonésie',
  'Iraq': 'Irak', 'Ireland': 'Irlande', 'Israel': 'Israël', 'Italy': 'Italie',
  'Jamaica': 'Jamaïque', 'Japan': 'Japon', 'Jordan': 'Jordanie', 'Kuwait': 'Koweït',
  'Kyrgyz Republic': 'Kirghizistan', 'Kyrgyzstan': 'Kirghizistan', 'Latvia': 'Lettonie',
  'Lebanon': 'Liban', 'Libya': 'Libye', 'Libyan Arab Jamahiriya': 'Libye', 'Lithuania': 'Lituanie',
  'Macedonia': 'Macédoine du Nord', 'North Macedonia': 'Macédoine du Nord', 'Malaysia': 'Malaisie',
  'Malta': 'Malte', 'Mauritania': 'Mauritanie', 'Mauritius': 'Maurice', 'Mexico': 'Mexique',
  'Moldova': 'Moldavie', 'Mongolia': 'Mongolie', 'Montenegro': 'Monténégro', 'Morocco': 'Maroc',
  'Myanmar': 'Birmanie', 'Namibia': 'Namibie', 'Nepal': 'Népal', 'Netherlands': 'Pays-Bas',
  'New Zealand': 'Nouvelle-Zélande', 'North Korea': 'Corée du Nord',
  'Northern Ireland': 'Irlande du Nord', 'Norway': 'Norvège', 'Palestinian Territory': 'Palestine',
  'Peru': 'Pérou', 'Poland': 'Pologne', 'Puerto Rico': 'Porto Rico', 'Romania': 'Roumanie',
  'Russia': 'Russie', 'Saudi Arabia': 'Arabie saoudite', 'Senegal': 'Sénégal', 'Serbia': 'Serbie',
  'Serbia and Montenegro': 'Serbie-et-Monténégro', 'Singapore': 'Singapour', 'Slovakia': 'Slovaquie',
  'Slovenia': 'Slovénie', 'South Africa': 'Afrique du Sud', 'South Korea': 'Corée du Sud',
  'Soviet Union': 'URSS', 'Spain': 'Espagne', 'Sudan': 'Soudan', 'Sweden': 'Suède',
  'Switzerland': 'Suisse', 'Syria': 'Syrie', 'Syrian Arab Republic': 'Syrie', 'Taiwan': 'Taïwan',
  'Tajikistan': 'Tadjikistan', 'Tanzania': 'Tanzanie', 'Thailand': 'Thaïlande', 'Tunisia': 'Tunisie',
  'Turkey': 'Turquie', 'UK': 'Royaume-Uni', 'USA': 'États-Unis', 'USSR': 'URSS',
  'Uganda': 'Ouganda', 'United Arab Emirates': 'Émirats arabes unis', 'Uzbekistan': 'Ouzbékistan',
  'Yugoslavia': 'Yougoslavie',
};
function countryFr(name) {
  const n = shortenCountryName(name);
  return COUNTRY_FR[n] || n;
}

// TMDB place_of_birth est du texte libre (« Seoul, South Korea », « New York,
// New York, USA »). On prend le dernier segment (le pays), normalisé sur le
// même vocabulaire que les pays de production. '' si non exploitable.
function placeToCountry(place) {
  if (!place) return '';
  const parts = String(place).split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  return normalizeBirthCountry(parts[parts.length - 1]);
}

// Le dernier segment n'est pas toujours un pays propre : autre langue
// (« Francia », « Великобритания »), ville ou région sans pays (« Algiers »,
// « California »), séparateur « - » (« Ivry-sur-Seine - France »), mention
// historique (« West Germany [now Germany] » : on retient le pays actuel).
// Sert à l'enrichissement et à la lecture : les pays déjà enregistrés sont
// ainsi corrigés à l'affichage, sans réécrire films.json.
const BIRTH_COUNTRY_ALIASES = {
  // autres langues
  'francia': 'France', 'frankreich': 'France',
  'italia': 'Italy', 'italie': 'Italy', 'italien': 'Italy',
  'giappone': 'Japan', 'japon': 'Japan', '日本': 'Japan',
  'danmark': 'Denmark', 'danemark': 'Denmark',
  'deutschland': 'Germany', 'allemagne': 'Germany', 'germania': 'Germany',
  'west germany': 'Germany', 'east germany': 'Germany',
  'españa': 'Spain', 'espagne': 'Spain', 'spagna': 'Spain',
  'belgique': 'Belgium', 'belgië': 'Belgium',
  'suisse': 'Switzerland', 'schweiz': 'Switzerland', 'svizzera': 'Switzerland',
  'österreich': 'Austria', 'autriche': 'Austria',
  'nederland': 'Netherlands', 'pays-bas': 'Netherlands',
  'polska': 'Poland', 'pologne': 'Poland',
  'россия': 'Russia', 'russie': 'Russia', 'russian federation': 'Russia',
  'великобритания': 'UK', 'great britain': 'UK', 'royaume-uni': 'UK',
  'états-unis': 'USA', 'u.s.a.': 'USA', 'u.s.': 'USA', 'us': 'USA',
  '中国': 'China', 'chine': 'China', "people's republic of china": 'China',
  '대한민국': 'South Korea', '한국': 'South Korea', 'korea': 'South Korea',
  'republic of korea': 'South Korea', 'corée du sud': 'South Korea',
  'brasil': 'Brazil', 'méxico': 'Mexico', 'mexique': 'Mexico',
  'algérie': 'Algeria', 'maroc': 'Morocco', 'tunisie': 'Tunisia',
  'czechia': 'Czech Republic', 'česko': 'Czech Republic', 'česká republika': 'Czech Republic',
  // villes et régions écrites sans leur pays
  'algiers': 'Algeria', 'alger': 'Algeria', 'french algeria': 'Algeria',
  '青岛': 'China', 'inner mongolia': 'China',
  'lâm đồng': 'Vietnam', 'central vietnam': 'Vietnam',
  // non exploitable
  'eu': '', 'europe': '',
};
// États américains (sans « Georgia » : « Tbilisi, Georgia » désigne le pays)
const US_STATES = new Set(['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia', 'washington d.c.']);
const CA_PROVINCES = new Set(['ontario', 'quebec', 'québec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan', 'nova scotia', 'new brunswick', 'newfoundland', 'newfoundland and labrador', 'prince edward island']);
function normalizeBirthCountry(raw) {
  if (!raw) return '';
  let c = String(raw).trim();
  const now = c.match(/[\[(]\s*now\s+([^\])]+)[\])]/i);
  c = now ? now[1].trim() : c.replace(/\s*[\[(][^\])]*[\])]\s*/g, ' ').trim();
  const dash = c.split(/\s+[-–—]\s+/);
  c = dash[dash.length - 1].trim();
  // Sous-entités souvent écrites sans le pays
  if (c === 'England' || c === 'Scotland' || c === 'Wales' || c === 'Northern Ireland') c = 'UK';
  const key = c.toLowerCase();
  if (key in BIRTH_COUNTRY_ALIASES) return BIRTH_COUNTRY_ALIASES[key];
  if (US_STATES.has(key)) return 'USA';
  if (CA_PROVINCES.has(key)) return 'Canada';
  return shortenCountryName(c);
}

// Pays des réalisateur·rices d'un film tels qu'affichés : un par réalisateur·rice
// (comme à l'enregistrement), normalisés puis en français, les inconnus écartés
function dirCountriesOf(f) {
  return (f.director_countries || []).map(normalizeBirthCountry).filter(Boolean).map(countryFr);
}

function extractCountryFromTmdbDetail(detail) {
  // Get all countries
  let countries = [];
  if (detail.production_countries && detail.production_countries.length > 0) {
    countries = detail.production_countries.map(c => shortenCountryName(c.name));
  } else if (detail.origin_country && detail.origin_country.length > 0) {
    countries = detail.origin_country.map(code => ISO_TO_COUNTRY[code] || code);
  }
  if (countries.length === 0) return null;
  // Move France to the front if present (user is French, more relevant)
  const franceIdx = countries.indexOf('France');
  if (franceIdx > 0) {
    countries.splice(franceIdx, 1);
    countries.unshift('France');
  }
  return countries.join(' · ');
}

function buildFilmFromTmdb(detail, type, csvTitle = null) {
  let director = null;
  let directorGender = 0; // 0=unknown, 1=female, 2=male (TMDB convention)
  let directorGenders = []; // parallèle à director.split(', ') — co-réalisations
  let cast = [];
  let castGenders = [];
  if (detail.credits) {
    // Tous les réalisateurs (films co-réalisés : ex. « Ma Frère »), dédupliqués
    let people;
    if (type === 'movie') {
      people = (detail.credits.crew || []).filter(c => c.job === 'Director');
    } else {
      people = detail.created_by || [];
    }
    const names = [], genders = [], seen = new Set();
    for (const p of people) {
      const nm = bestPersonName(p);
      if (!nm || seen.has(nm)) continue;
      seen.add(nm);
      names.push(nm);
      genders.push(p.gender || 0);
    }
    if (names.length) {
      director = names.join(', ');
      directorGenders = genders;
      directorGender = genders[0] || 0; // singulier conservé (reco, parité)
    }
    const rawCast = (detail.credits.cast || []).slice(0, 5);
    cast = rawCast.map(c => bestPersonName(c));
    castGenders = rawCast.map(c => c.gender || 0);
  }
  const release = detail.release_date || detail.first_air_date || '';
  const year = release ? parseInt(release.slice(0, 4), 10) : null;
  const genres = (detail.genres || []).map(g => g.name);
  // Trailer extraction (if videos are in append_to_response)
  let trailer = undefined;
  if (detail.videos && detail.videos.results) {
    const videos = detail.videos.results.filter(v => v.site === 'YouTube');
    if (videos.length > 0) {
      const score = v => (v.iso_639_1 === 'fr' ? 10 : 0) + (v.type === 'Trailer' ? 5 : 0) + (v.official ? 2 : 0) + (v.type === 'Teaser' ? 3 : 0);
      videos.sort((a, b) => score(b) - score(a));
      trailer = 'https://www.youtube.com/watch?v=' + videos[0].key;
    } else {
      trailer = null;
    }
  }
  return {
    id: type + '-' + detail.id,
    tmdb_id: detail.id,
    type: type,
    title: detail.title || detail.name,
    original_title: detail.original_title || detail.original_name || null,
    year: year,
    release_date: release || null,
    director: director,
    director_gender: directorGender,
    director_genders: directorGenders,
    cast: cast,
    cast_genders: castGenders,
    runtime: type === 'movie' ? (detail.runtime || null) : (Array.isArray(detail.episode_run_time) && detail.episode_run_time[0]) || null,
    genres: genres,
    country: extractCountryFromTmdbDetail(detail),
    poster: detail.poster_path ? tmdbImgUrl(detail.poster_path, 'w500') : null,
    backdrop: detail.backdrop_path ? tmdbImgUrl(detail.backdrop_path, 'w1280') : null,
    synopsis: detail.overview || null,
    tmdb_rating: detail.vote_average || null,
    imdb_id: (detail.external_ids && detail.external_ids.imdb_id) || detail.imdb_id || null,
    original_language: detail.original_language || null,
    trailer: trailer,
    source: csvTitle ? { csv_title: csvTitle } : { added_via: 'admin', added_at: new Date().toISOString() },
  };
}

// Lazy-fetch country for an existing film that doesn't have it stored.
// Cached in memory on the film object; will be persisted next time admin saves.
async function enrichFilmCountry(film) {
  if (film.country || !film.tmdb_id || film._countryFetching) return;
  film._countryFetching = true;
  try {
    const path = film.type === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE}/${path}/${film.tmdb_id}?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR`;
    const r = await fetch(url);
    if (!r.ok) return;
    const detail = await r.json();
    const country = extractCountryFromTmdbDetail(detail);
    if (country) {
      film.country = country;
      reRenderModalIfShowing(film);
    }
  } catch {}
  delete film._countryFetching;
}

// Lazy-fetch trailer URL (first YouTube trailer, prefer French)
async function tmdbGetTrailer(tmdbId, type) {
  const path = type === 'tv' ? 'tv' : 'movie';
  const url = `${TMDB_BASE}/${path}/${tmdbId}/videos?api_key=${encodeURIComponent(admin.tmdbKey)}&include_video_language=fr,en&language=fr-FR`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const videos = (data.results || []).filter(v => v.site === 'YouTube');
    if (videos.length === 0) return null;
    // Priority: FR official trailer > FR any trailer > EN official trailer > EN any trailer > any YouTube video
    const score = v => {
      let s = 0;
      if (v.iso_639_1 === 'fr') s += 10;
      if (v.type === 'Trailer') s += 5;
      if (v.official) s += 2;
      if (v.type === 'Teaser') s += 3;
      return s;
    };
    videos.sort((a, b) => score(b) - score(a));
    return 'https://www.youtube.com/watch?v=' + videos[0].key;
  } catch { return null; }
}

async function enrichFilmTrailer(film) {
  if (film.trailer !== undefined || !film.tmdb_id || film._trailerFetching) return;
  film._trailerFetching = true;
  try {
    const trailer = await tmdbGetTrailer(film.tmdb_id, film.type);
    film.trailer = trailer; // null is a valid "no trailer found" result, so we cache it
    if (trailer) reRenderModalIfShowing(film);
  } catch {}
  delete film._trailerFetching;
}

// Latinise les noms non latins d'une fiche (réal + casting) via les fiches
// personnes TMDB (nom en-US puis alias latins). Même mécanique lazy que le
// pays et la bande-annonce : corrigé en mémoire, re-rendu si la fiche est
// ouverte, persisté au prochain save admin pour les films de la collection.
// bestPersonName ne suffit pas ici : pour le cinéma asiatique, `name` ET
// `original_name` sont souvent tous deux dans l'écriture d'origine.
async function enrichFilmNames(film) {
  // _namesTried : une tentative par session (le drapeau _ n'est pas persisté,
  // donc réessayé à la prochaine visite si un besoin subsiste)
  if (film._namesTried || !film.tmdb_id) return;
  const needsDirLatin = hasNonLatin(film.director || '');
  const needsDirList = film.type === 'movie' && !film.director_genders; // co-réal à compléter
  const castIdx = (film.cast || []).map((c, i) => hasNonLatin(c) ? i : -1).filter(i => i >= 0);
  if (!needsDirLatin && !needsDirList && castIdx.length === 0) return;
  film._namesTried = true;
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  try {
    const path = film.type === 'tv' ? 'tv' : 'movie';
    const r = await fetch(`${TMDB_BASE}/${path}/${film.tmdb_id}/credits?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR`);
    if (!r.ok) return;
    const credits = await r.json();
    const people = [...(credits.cast || []), ...(credits.crew || [])];
    // Les créateurs de séries ne figurent pas dans les credits
    if (film.type === 'tv') {
      try {
        const dr = await fetch(`${TMDB_BASE}/tv/${film.tmdb_id}?api_key=${encodeURIComponent(admin.tmdbKey)}&language=fr-FR`);
        if (dr.ok) people.push(...((await dr.json()).created_by || []));
      } catch {}
    }
    const latinName = async (person) => {
      let nm = bestPersonName(person);
      if (hasNonLatin(nm) && person.id) { await sleep(200); nm = (await fetchLatinNameById(person.id)) || nm; }
      return nm;
    };
    const latinFor = async (name) => {
      const p = people.find(x => x.name === name || x.original_name === name);
      return p ? await latinName(p) : null;
    };
    let changed = false;

    if (film.type === 'movie') {
      // Liste COMPLÈTE des réalisateurs (co-réalisations) + genres parallèles
      const dirs = (credits.crew || []).filter(c => c.job === 'Director');
      const names = [], genders = [], seen = new Set();
      for (const d of dirs) {
        const nm = await latinName(d);
        if (!nm || seen.has(nm)) continue;
        seen.add(nm); names.push(nm); genders.push(d.gender || 0);
      }
      if (names.length) {
        const joined = names.join(', ');
        if (joined !== film.director) { film.director = joined; changed = true; }
        film.director_genders = genders;        // marque « complété » + genres
        film.director_gender = genders[0] || 0;
      }
    } else if (needsDirLatin && film.director) {
      // Séries : latiniser les créateurs déjà stockés, personne par personne
      const parts = film.director.split(',').map(s => s.trim());
      const newParts = [];
      for (const part of parts) {
        if (!hasNonLatin(part)) { newParts.push(part); continue; }
        const latin = await latinFor(part);
        newParts.push(latin && !hasNonLatin(latin) ? latin : part);
        await sleep(200);
      }
      const joined = newParts.join(', ');
      if (joined !== film.director) { film.director = joined; changed = true; }
    }

    for (const i of castIdx) {
      const latin = await latinFor(film.cast[i]);
      if (latin && !hasNonLatin(latin)) { film.cast[i] = latin; changed = true; }
      await sleep(200);
    }
    if (changed) reRenderModalIfShowing(film);
  } catch { /* réseau — réessayé à la prochaine session */ }
}

function reRenderModalIfShowing(film) {
  const modal = document.getElementById('modal-backdrop');
  if (!modal || !modal.classList.contains('open')) return;
  // Toujours la même fiche à l'écran ? (l'utilisateur a pu en ouvrir une autre
  // pendant l'enrichissement asynchrone)
  if (openModalCtx.id !== film.id) return;
  // Ré-ouvrir dans le MÊME mode (préserve tmdbOnly pour un film hors collection)
  openModal(film, { tmdbOnly: openModalCtx.tmdbOnly });
}

// ----------------- GITHUB --------------------
async function ghTestToken() {
  if (!REPO) throw new Error('admin disponible uniquement sur github pages');
  const r = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}`, {
    headers: { 'Authorization': `token ${admin.ghToken}`, 'Accept': 'application/vnd.github+json' }
  });
  if (r.status === 401 || r.status === 403) throw new Error('token github invalide ou sans permission');
  if (r.status === 404) throw new Error('repo ' + REPO.owner + '/' + REPO.repo + ' inaccessible avec ce token');
  if (!r.ok) throw new Error('github injoignable (' + r.status + ')');
}

async function ghGetFile(path) {
  const url = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/contents/${path}?ref=${encodeURIComponent(GH_BRANCH)}`;
  // Lectures toujours fraîches : GitHub autorise le navigateur à garder ces
  // réponses 60 s, et un sha périmé fausserait la sauvegarde qui suit
  const get = accept => fetch(url, {
    cache: 'no-store',
    headers: { 'Authorization': `token ${admin.ghToken}`, 'Accept': accept }
  });
  const r = await get('application/vnd.github+json');
  if (!r.ok) throw new Error('github get ' + r.status);
  const data = await r.json();
  if (data.encoding === 'base64') {
    // content is base64; need UTF-8 decode
    const bytes = atob(data.content.replace(/\n/g, ''));
    // bytes here is a binary string. To get UTF-8 string:
    const decoded = decodeURIComponent(escape(bytes));
    return { content: decoded, sha: data.sha };
  }
  // Au-delà de 1 Mo, GitHub renvoie le sha mais un contenu vide (encoding
  // « none ») : on lit alors le fichier au format brut (jusqu'à 100 Mo), APRÈS
  // le sha. S'il change entre les deux lectures, le contenu est plus récent que
  // le sha : la sauvegarde suivante tombe en conflit (409) et passe par la
  // fusion, rien n'est écrasé.
  const raw = await get('application/vnd.github.raw+json');
  if (!raw.ok) throw new Error('github get ' + raw.status);
  return { content: await raw.text(), sha: data.sha };
}

// Adopte le films.json lu via l'API GitHub (toujours à jour, contrairement au
// CDN de Pages) pour que la session admin parte de l'état réellement persisté.
function adoptFilmsFromApi(content) {
  try {
    const data = JSON.parse(content);
    if (!data || !Array.isArray(data.films)) return;
    state.films = normalizeRatings(data.films);
    initFilters();
    if (state.view === 'a_voir' || state.view === 'vu') applyFilters({ preservePage: true });
    refreshStats();
  } catch { /* contenu vide ou invalide — on garde l'état chargé au boot */ }
}

async function ghPutFile(path, content, sha, message) {
  // Encode UTF-8 to base64
  const b64 = btoa(unescape(encodeURIComponent(content)));
  // branch explicite : sans lui le PUT écrit sur la branche par défaut,
  // qui peut différer de celle que ghGetFile lit (?ref=…)
  const body = { message, content: b64, branch: GH_BRANCH };
  if (sha) body.sha = sha;
  const r = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${admin.ghToken}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error('github put ' + r.status + ': ' + (err.message || ''));
  }
  return await r.json(); // contains content.sha for new version
}

// Suivi des changements de la session — la fusion au conflit 409 s'en sert
// pour distinguer « ajouté/supprimé ici » de « supprimé/ajouté ailleurs »
const sessionChanges = { added: new Set(), edited: new Set(), deleted: new Set() };

// Fusion film par film avec la version distante. Politique :
// · film touché dans cette session (ajouté/édité) → la version locale gagne
// · film non touché ici → la version distante gagne (elle peut porter des
//   modifs plus récentes d'un autre appareil ; sinon elles sont identiques)
// · ajout distant → récupéré ; suppression distante → respectée sauf si
//   le film a été ajouté ou édité ici ; suppression locale → respectée
function mergeRemoteFilms(remoteFilms) {
  const remoteById = new Map(remoteFilms.map(f => [f.id, f]));
  const localById = new Map(state.films.map(f => [f.id, f]));
  const touched = id => sessionChanges.added.has(id) || sessionChanges.edited.has(id);
  const merged = [];
  for (const f of state.films) {
    const remote = remoteById.get(f.id);
    if (remote) {
      merged.push(touched(f.id) ? f : remote);
    } else if (touched(f.id)) {
      merged.push(f); // ajouté/édité ici : conserver malgré l'absence distante
    }
    // sinon : absent à distance et non touché ici → supprimé ailleurs, respecter
  }
  const remoteAdds = [];
  for (const rf of remoteFilms) {
    // Présent à distance seulement, pas supprimé ici → ajouté ailleurs
    // (ou manquant dans notre copie de boot) : récupérer
    if (!localById.has(rf.id) && !sessionChanges.deleted.has(rf.id)) remoteAdds.push(rf);
  }
  // En tête, pas en queue : l'ordre du tableau est l'ordre d'ajout (plus
  // récent d'abord) et ces films sont les ajouts les plus frais
  return [...remoteAdds, ...merged];
}

// Sérialisation compacte : fichier plus léger à télécharger (au-delà de 1 Mo,
// ghGetFile passe par la lecture brute). Les clés préfixées « _ » sont des
// drapeaux transitoires (_countryFetching, _trailerFetching…) : un save qui
// part pendant un fetch lazy ne doit pas les persister dans films.json.
function buildFilmsPayload() {
  return JSON.stringify({
    version: 1,
    generated_at: new Date().toISOString(),
    count: state.films.length,
    films: state.films,
  }, (key, value) => key.startsWith('_') ? undefined : value);
}

// Save current state.films to GitHub.
// Les écritures sont sérialisées : deux saves concurrents (enrichissement de
// masse + édition manuelle) partiraient avec le même SHA → 409 garanti. Le
// save suivant lit state.films au moment où il s'exécute, donc il embarque
// aussi les changements du save qui le précédait dans la file.
let saveFilmsQueue = Promise.resolve();
function saveFilmsToGithub(message) {
  const run = saveFilmsQueue.then(() => doSaveFilmsToGithub(message));
  // Un échec ne doit pas bloquer la file pour les saves suivants
  saveFilmsQueue = run.catch(() => {});
  return run;
}

async function doSaveFilmsToGithub(message) {
  // Always refetch SHA first to avoid stale conflicts (lightweight)
  if (!admin.filmsSHA) {
    const cur = await ghGetFile('films.json');
    admin.filmsSHA = cur.sha;
  }
  try {
    const result = await ghPutFile('films.json', buildFilmsPayload(), admin.filmsSHA, message);
    admin.filmsSHA = result.content.sha;
  } catch (e) {
    // Conflit (409) : le fichier a changé depuis notre lecture (autre appareil).
    // Fusionner film par film au lieu d'écraser, puis réessayer une fois.
    if (e.message.includes('409') || e.message.toLowerCase().includes('does not match')) {
      const cur = await ghGetFile('films.json');
      admin.filmsSHA = cur.sha;
      let merged = false;
      try {
        const remoteData = JSON.parse(cur.content);
        if (remoteData && Array.isArray(remoteData.films)) {
          state.films = mergeRemoteFilms(normalizeRatings(remoteData.films));
          merged = true;
        }
      } catch { /* contenu distant illisible → on pousse l'état local tel quel */ }
      const result = await ghPutFile('films.json', buildFilmsPayload(), admin.filmsSHA, message);
      admin.filmsSHA = result.content.sha;
      if (merged) {
        // L'état peut avoir intégré des modifs distantes : rafraîchir l'affichage
        initFilters();
        if (state.view === 'a_voir' || state.view === 'vu') applyFilters({ preservePage: true });
        refreshStats();
      }
    } else {
      throw e;
    }
  }
}

// ----------------- TOAST --------------------
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.className = 'toast', 3500);
}

// ----------------- ADMIN SETUP --------------------

function showAdminView(name) {
  document.querySelectorAll('.admin-view').forEach(v => v.style.display = 'none');
  document.getElementById('admin-view-' + name).style.display = '';
  // Clear inline messages
  document.querySelectorAll('.admin-err, .admin-ok').forEach(e => { e.textContent = ''; e.style.display = 'none'; });
}

function openAdminSetup() {
  if (!REPO) {
    // No repo detected (running locally or in dev) — show setup but warn
    showAdminView('setup');
    const err = document.querySelector('#admin-view-setup .admin-err');
    err.textContent = 'admin disponible uniquement sur github pages (https://*.github.io/...)';
    err.style.display = '';
    document.getElementById('admin-setup-backdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
    return;
  }

  if (admin.active) {
    showAdminView('manage');
  } else if (admin.encryptedPAT) {
    showAdminView('unlock');
    setTimeout(() => {
      const inp = document.getElementById('admin-unlock-code');
      if (inp) { inp.value = ''; inp.focus(); }
    }, 80);
  } else {
    showAdminView('setup');
    document.getElementById('admin-setup-pat').value = '';
    document.getElementById('admin-setup-code').value = '';
    document.getElementById('admin-setup-code-confirm').value = '';
    setTimeout(() => document.getElementById('admin-setup-pat').focus(), 80);
  }

  document.getElementById('admin-setup-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAdminSetup() {
  document.getElementById('admin-setup-backdrop').classList.remove('open');
  document.body.style.overflow = '';
}

// First-time setup: PAT + new code → encrypt and save
async function setupAdmin() {
  const errBox = document.querySelector('#admin-view-setup .admin-err');
  const okBox = document.querySelector('#admin-view-setup .admin-ok');
  const btn = document.getElementById('admin-setup-btn');
  errBox.style.display = 'none';
  okBox.style.display = 'none';

  const pat = document.getElementById('admin-setup-pat').value.trim();
  const code = document.getElementById('admin-setup-code').value;
  const codeConfirm = document.getElementById('admin-setup-code-confirm').value;

  if (!pat || pat.length < 20) {
    errBox.textContent = 'token github manquant ou trop court';
    errBox.style.display = ''; return;
  }
  if (!code || code.length < 4) {
    errBox.textContent = 'code trop court (4 caractères minimum)';
    errBox.style.display = ''; return;
  }
  if (code !== codeConfirm) {
    errBox.textContent = 'les deux codes ne correspondent pas';
    errBox.style.display = ''; return;
  }

  btn.disabled = true;
  btn.textContent = 'vérification du token…';
  try {
    // First test the PAT works
    admin.ghToken = pat;
    await ghTestToken();
    // Then encrypt and save
    btn.textContent = 'chiffrement…';
    const encrypted = await encryptWithCode(pat, code);
    saveEncryptedPAT(encrypted);
    // Fetch SHA for first save + resynchroniser l'état depuis l'API (le boot
    // a pu charger une version périmée du CDN)
    const cur = await ghGetFile('films.json');
    admin.filmsSHA = cur.sha;
    adoptFilmsFromApi(cur.content);
    // Activate
    admin.active = true;
    document.body.classList.add('admin-mode');
    document.getElementById('nav-admin').classList.add('active');
    document.getElementById('nav-admin').textContent = '🔓';
    okBox.textContent = '✓ admin actif — ton code est mémorisé. tu peux fermer cette fenêtre.';
    okBox.style.display = '';
    setTimeout(closeAdminSetup, 1600);
  } catch (e) {
    errBox.textContent = 'erreur : ' + e.message;
    errBox.style.display = '';
    admin.ghToken = null;
  } finally {
    btn.disabled = false;
    btn.textContent = 'activer';
  }
}

// Subsequent unlock: enter code → decrypt PAT
async function unlockAdmin() {
  const errBox = document.querySelector('#admin-view-unlock .admin-err');
  const okBox = document.querySelector('#admin-view-unlock .admin-ok');
  const btn = document.getElementById('admin-unlock-btn');
  errBox.style.display = 'none';
  okBox.style.display = 'none';

  const code = document.getElementById('admin-unlock-code').value;
  if (!code) {
    errBox.textContent = 'entre ton code';
    errBox.style.display = ''; return;
  }

  btn.disabled = true;
  btn.textContent = 'déchiffrement…';
  try {
    const pat = await decryptWithCode(admin.encryptedPAT, code);
    admin.ghToken = pat;
    btn.textContent = 'vérification du token…';
    await ghTestToken();
    // Fetch SHA + resynchroniser l'état depuis l'API (le boot a pu charger
    // une version périmée du CDN)
    const cur = await ghGetFile('films.json');
    admin.filmsSHA = cur.sha;
    adoptFilmsFromApi(cur.content);
    admin.active = true;
    document.body.classList.add('admin-mode');
    document.getElementById('nav-admin').classList.add('active');
    document.getElementById('nav-admin').textContent = '🔓';
    okBox.textContent = '✓ admin actif';
    okBox.style.display = '';
    setTimeout(closeAdminSetup, 800);
  } catch (e) {
    // Decrypt error or token invalid
    if (e.name === 'OperationError' || (e.message && e.message.toLowerCase().includes('decrypt'))) {
      errBox.textContent = 'code incorrect';
    } else {
      errBox.textContent = 'erreur : ' + e.message;
    }
    errBox.style.display = '';
    admin.ghToken = null;
  } finally {
    btn.disabled = false;
    btn.textContent = 'déverrouiller';
  }
}

// Lock: clear in-memory PAT but keep encrypted blob (so user can re-enter code)
function lockAdmin() {
  admin.active = false;
  admin.ghToken = null;
  admin.filmsSHA = null;
  document.body.classList.remove('admin-mode');
  document.getElementById('nav-admin').classList.remove('active');
  document.getElementById('nav-admin').textContent = '🔒';
  closeAdminSetup();
  showToast('verrouillé');
}

// Full reset: clear encrypted blob too
function disableAdmin() {
  if (!confirm('tout réinitialiser ? il faudra à nouveau saisir ton token github + choisir un nouveau code.')) return;
  clearAdminCreds();
  admin.active = false;
  admin.filmsSHA = null;
  document.body.classList.remove('admin-mode');
  document.getElementById('nav-admin').classList.remove('active');
  document.getElementById('nav-admin').textContent = '🔒';
  closeAdminSetup();
  showToast('admin réinitialisé');
}

// ----------------- DATE HELPERS --------------------
function formatDateLabel(dv) {
  if (!dv) return '';
  if (dv.startsWith('before-')) return 'avant ' + dv.slice(7);
  if (/^\d{4}$/.test(dv)) return dv;
  if (/^\d{4}-\d{2}$/.test(dv)) {
    const [y, m] = dv.split('-');
    const names = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return names[parseInt(m, 10) - 1] + ' ' + y;
  }
  return dv;
}

// ----------------- EDIT FILM (within detail modal) --------------------
function renderEditForm(film) {
  // Returns HTML for the edit form
  const u = film.user || {};
  const isVu = u.statut === 'vu';

  return `
    <div class="edit-section edit-form">
      <div class="edit-section-title">mode édition</div>

      <div class="field">
        <label>statut</label>
        <div class="radio-group" data-field="statut">
          <button class="radio-btn ${u.statut === 'a_voir' ? 'active' : ''}" data-value="a_voir">à voir</button>
          <button class="radio-btn ${u.statut === 'vu' ? 'active' : ''}" data-value="vu">vu</button>
        </div>
      </div>

      <div class="field edit-vu-field" style="display: ${isVu ? '' : 'none'}">
        <label>note</label>
        <div class="rating-chips" data-field="rating">
          ${[1, 2, 3, 4, 5].map(r =>
            `<button class="rating-chip ${u.rating === r ? 'active' : ''}" data-rating="${r}">${r}★</button>`).join('')}
          <span class="rating-chip-sep" aria-hidden="true"></span>
          <button class="rating-chip fav ${u.rating === 6 ? 'active' : ''}" data-rating="6" title="coup de cœur — le cran au-dessus de 5★">❤</button>
        </div>
      </div>

      <div class="field edit-vu-field" style="display: ${isVu ? '' : 'none'}">
        <label>lieu</label>
        <select data-field="lieu">
          <option value="">—</option>
          <option value="Cinéma" ${u.lieu === 'Cinéma' ? 'selected' : ''}>Cinéma</option>
          <option value="Stremio" ${u.lieu === 'Stremio' ? 'selected' : ''}>Stremio</option>
          <option value="Disque dur" ${u.lieu === 'Disque dur' ? 'selected' : ''}>Disque dur</option>
          <option value="Autre" ${u.lieu === 'Autre' ? 'selected' : ''}>Autre</option>
        </select>
      </div>

      <div class="field edit-vu-field" style="display: ${isVu ? '' : 'none'}">
        <label>date vue</label>
        <div style="display: flex; gap: 8px;">
          <input type="number" id="edit-date-year" min="1900" max="2099" placeholder="année (ex. 2019)" style="flex:1;">
          <select data-field="month" id="edit-date-month" style="flex:1;">
            <option value="">—</option>
            <option value="01">janvier</option><option value="02">février</option>
            <option value="03">mars</option><option value="04">avril</option>
            <option value="05">mai</option><option value="06">juin</option>
            <option value="07">juillet</option><option value="08">août</option>
            <option value="09">septembre</option><option value="10">octobre</option>
            <option value="11">novembre</option><option value="12">décembre</option>
          </select>
        </div>
        <label class="date-before-toggle"><input type="checkbox" id="edit-date-before"> vu avant 2022 (date précise inconnue)</label>
      </div>

      <div class="edit-form-error error-inline" style="display: none;"></div>

      <div class="edit-form-actions">
        <button class="edit-save" data-film-id="${film.id}">enregistrer</button>
        <button class="edit-rematch" data-film-id="${film.id}">re-matcher tmdb</button>
        <button class="edit-delete" data-film-id="${film.id}">🗑 supprimer</button>
      </div>
    </div>
  `;
}

// Case « vu avant 2022 » : quand cochée, neutralise année + mois (leur valeur
// est ignorée au save, remplacée par le bucket before-2022)
function wireBeforeToggle(chk, yearEl, monthEl) {
  if (!chk) return;
  const apply = () => {
    const on = chk.checked;
    if (on) { yearEl.value = ''; monthEl.value = ''; }
    yearEl.disabled = on;
    monthEl.disabled = on;
    yearEl.style.opacity = monthEl.style.opacity = on ? '0.4' : '';
  };
  chk.addEventListener('change', apply);
  apply();
}

function wireEditForm(film) {
  // After modal is rendered, set initial year/month based on existing date_vue
  const yearSel = document.getElementById('edit-date-year');
  const monthSel = document.getElementById('edit-date-month');
  const beforeChk = document.getElementById('edit-date-before');
  if (yearSel) {
    const dv = film.user?.date_vue || '';
    if (/^\d{4}-\d{2}$/.test(dv)) {
      yearSel.value = dv.slice(0, 4);
      monthSel.value = dv.slice(5, 7);
    } else if (/^\d{4}$/.test(dv)) {
      yearSel.value = dv;
      monthSel.value = '';
    } else if (dv.startsWith('before-') && beforeChk) {
      beforeChk.checked = true;
    }
    wireBeforeToggle(beforeChk, yearSel, monthSel);
  }

  // Statut radio
  document.querySelectorAll('.edit-form .radio-group[data-field="statut"] .radio-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.edit-form .radio-group[data-field="statut"] .radio-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const newStatut = b.dataset.value;
      document.querySelectorAll('.edit-form .edit-vu-field').forEach(el => el.style.display = newStatut === 'vu' ? '' : 'none');
    });
  });

  // Étoiles et ❤ : sélection unique — c'est l'un ou l'autre, jamais les deux
  // (recliquer sur la puce active = plus de note)
  document.querySelectorAll('.edit-form .rating-chips[data-field="rating"] .rating-chip').forEach(c => {
    c.addEventListener('click', () => {
      const wasActive = c.classList.contains('active');
      document.querySelectorAll('.edit-form .rating-chips[data-field="rating"] .rating-chip').forEach(x => x.classList.remove('active'));
      if (!wasActive) c.classList.add('active');
    });
  });

  // Save button
  document.querySelector('.edit-form .edit-save').addEventListener('click', () => saveEditedFilm(film.id));
  document.querySelector('.edit-form .edit-rematch').addEventListener('click', () => openRematchModal(film));
  document.querySelector('.edit-form .edit-delete').addEventListener('click', () => deleteFilm(film));
}

async function saveEditedFilm(filmId) {
  const filmIndex = state.films.findIndex(f => f.id === filmId);
  if (filmIndex === -1) return;
  const film = state.films[filmIndex];
  const errEl = document.querySelector('.edit-form .edit-form-error');
  errEl.style.display = 'none';

  // Read form values
  const statutBtn = document.querySelector('.edit-form .radio-group[data-field="statut"] .radio-btn.active');
  const ratingBtn = document.querySelector('.edit-form .rating-chips[data-field="rating"] .rating-chip.active');
  const lieuSel = document.querySelector('.edit-form select[data-field="lieu"]');
  const yearSel = document.getElementById('edit-date-year');
  const monthSel = document.getElementById('edit-date-month');

  const statut = statutBtn ? statutBtn.dataset.value : 'vu';
  const isVu = statut === 'vu';
  const rating = (isVu && ratingBtn) ? parseInt(ratingBtn.dataset.rating, 10) : null;
  const favorite = rating === RATING_FAV;

  let dateVue = null, dateLabel = null;
  if (isVu) {
    const beforeChk = document.getElementById('edit-date-before');
    if (beforeChk && beforeChk.checked) {
      dateVue = 'before-2022';
      dateLabel = 'avant 2022';
    } else {
      const y = yearSel.value.trim();
      const m = monthSel.value;
      const currentYear = new Date().getFullYear();
      if (y) {
        if (!/^\d{4}$/.test(y) || parseInt(y, 10) < 1900 || parseInt(y, 10) > currentYear) {
          errEl.textContent = 'année invalide (4 chiffres, entre 1900 et ' + currentYear + ')';
          errEl.style.display = '';
          return;
        }
        dateVue = m ? (y + '-' + m) : y;
        dateLabel = formatDateLabel(dateVue);
      }
    }
  }

  // Passage en « à voir » : conserver note/date/lieu (plus affichés mais pas
  // perdus) pour qu'un aller-retour de statut accidentel ne détruise rien
  const newUser = isVu ? {
    ...film.user,
    statut,
    rating,
    favorite,
    lieu: lieuSel.value || null,
    date_vue: dateVue,
    date_vue_label: dateLabel,
  } : {
    ...film.user,
    statut,
  };

  const saveBtn = document.querySelector('.edit-form .edit-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'enregistrement…';
  const prevUser = film.user;
  try {
    state.films[filmIndex].user = newUser;
    // Trace l'édition pour la fusion 409 (on la laisse même si le save échoue :
    // au pire un film survit à une suppression distante, jamais de perte)
    sessionChanges.edited.add(filmId);
    await saveFilmsToGithub('edit: ' + film.title);
    initFilters();
    applyFilters({ preservePage: true });
    refreshStats();
    closeModal();
    showToast('✓ ' + film.title + ' mis à jour', 'success');
  } catch (e) {
    // Rollback : le save a échoué, films.json contient toujours les anciennes valeurs
    state.films[filmIndex].user = prevUser;
    errEl.textContent = 'erreur : ' + e.message;
    errEl.style.display = '';
    saveBtn.disabled = false;
    saveBtn.textContent = 'enregistrer';
  }
}

async function deleteFilm(film) {
  if (!confirm('supprimer "' + film.title + '" de ta collection ?')) return;
  const idx = state.films.findIndex(f => f.id === film.id);
  if (idx === -1) return;

  const removed = state.films[idx];
  try {
    state.films.splice(idx, 1);
    sessionChanges.deleted.add(film.id);
    await saveFilmsToGithub('delete: ' + film.title);
    initFilters();
    applyFilters({ preservePage: true });
    refreshStats();
    closeModal();
    showToast('✓ supprimé : ' + film.title, 'success');
  } catch (e) {
    // Rollback : films.json contient toujours le film, l'état local doit l'y remettre
    state.films.splice(idx, 0, removed);
    sessionChanges.deleted.delete(film.id);
    showToast('erreur : ' + e.message, 'error');
  }
}

// ----------------- REMATCH MODAL --------------------
function openRematchModal(film) {
  admin.pendingRematchFilmId = film.id;
  document.getElementById('rematch-input').value = film.title || '';
  document.getElementById('rematch-status').textContent = '';
  document.getElementById('rematch-results').innerHTML = '';
  document.getElementById('rematch-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    document.getElementById('rematch-input').focus();
    handleRematchSearch(film.title || '');
  }, 100);
}

function closeRematchModal() {
  document.getElementById('rematch-backdrop').classList.remove('open');
  admin.pendingRematchFilmId = null;
  document.body.style.overflow = '';
}

let rematchSearchTimer = null;
let rematchSearchSeq = 0;
async function handleRematchSearch(query) {
  // Jeton de séquence : une réponse lente ne doit pas écraser celle d'une frappe plus récente
  const seq = ++rematchSearchSeq;
  const resultsEl = document.getElementById('rematch-results');
  const statusEl = document.getElementById('rematch-status');
  if (!query || query.length < 2) {
    resultsEl.innerHTML = '';
    statusEl.textContent = '';
    return;
  }
  statusEl.textContent = 'recherche…';
  try {
    const results = await tmdbSearch(query);
    if (seq !== rematchSearchSeq) return;
    statusEl.textContent = results.length + ' résultats';
    resultsEl.innerHTML = '';
    for (const r of results.slice(0, 16)) {
      const div = document.createElement('div');
      div.className = 'search-result';
      const year = (r.release_date || r.first_air_date || '').slice(0, 4) || '?';
      div.innerHTML = `
        <div class="search-result-poster" ${r.poster_path ? `style="background-image:url(${safeUrl(tmdbImgUrl(r.poster_path, 'w185'))})"` : ''}></div>
        <div class="search-result-title">${escapeHtml(r.title || r.name)}</div>
        <div class="search-result-year">${year}</div>
        <div class="search-result-type">${r.media_type === 'tv' ? 'série' : 'film'}</div>
      `;
      div.addEventListener('click', () => confirmRematch(r));
      resultsEl.appendChild(div);
    }
  } catch (e) {
    if (seq !== rematchSearchSeq) return;
    statusEl.textContent = 'erreur : ' + e.message;
  }
}

async function confirmRematch(result) {
  const filmId = admin.pendingRematchFilmId;
  if (!filmId) return;
  const idx = state.films.findIndex(f => f.id === filmId);
  if (idx === -1) return;
  const oldFilm = state.films[idx];

  if (!confirm('remplacer les métadonnées par "' + (result.title || result.name) + '" ?')) return;

  const statusEl = document.getElementById('rematch-status');
  statusEl.textContent = 'récupération des détails…';
  try {
    const detail = await tmdbDetails(result.id, result.media_type);
    const newFilm = buildFilmFromTmdb(detail, result.media_type, oldFilm.source?.csv_title);
    newFilm.user = oldFilm.user; // keep user data intact
    newFilm.source = { ...oldFilm.source, rematched_at: new Date().toISOString() };
    state.films[idx] = newFilm;
    // Un rematch peut changer l'id (autre fiche TMDB) : pour la fusion 409,
    // c'est une suppression de l'ancien + un ajout du nouveau
    if (newFilm.id !== oldFilm.id) {
      sessionChanges.deleted.add(oldFilm.id);
      sessionChanges.added.add(newFilm.id);
    } else {
      sessionChanges.edited.add(newFilm.id);
    }

    statusEl.textContent = 'enregistrement…';
    await saveFilmsToGithub('rematch: ' + oldFilm.title + ' → ' + newFilm.title);
    initFilters();
    applyFilters({ preservePage: true });
    refreshStats();
    closeRematchModal();
    closeModal();
    showToast('✓ re-matché : ' + newFilm.title, 'success');
  } catch (e) {
    // Rollback : le save a échoué, films.json contient toujours l'ancienne fiche
    state.films[idx] = oldFilm;
    statusEl.textContent = 'erreur : ' + e.message;
  }
}


function wireEvents() {
  // All tabs use setView()
  document.querySelectorAll('#status-tabs .tab[data-view]').forEach(t => {
    t.addEventListener('click', () => setView(t.dataset.view));
  });

  // Discover category pills
  document.querySelectorAll('#discover-categories .explorer-cat').forEach(pill => {
    pill.addEventListener('click', () => {
      const discInput = document.getElementById('discover-search');
      if (discInput) discInput.value = '';
      fetchAndRenderDiscover(pill.dataset.cat);
    });
  });

  // Discover search input
  document.getElementById('discover-search').addEventListener('input', (e) => {
    clearTimeout(state.discoverSearchTimer);
    state.discoverSearchTimer = setTimeout(() => handleDiscoverSearch(e.target.value.trim()), 300);
  });

  // Filtres découvrir (genre / pays) — relancent la catégorie courante ;
  // la recherche libre les ignore (l'API /search ne filtre pas), on la vide
  ['discover-genre', 'discover-country', 'discover-decade', 'discover-sort'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      state.discoverFilters.genre = document.getElementById('discover-genre').value;
      state.discoverFilters.country = document.getElementById('discover-country').value;
      state.discoverFilters.decade = document.getElementById('discover-decade').value;
      state.discoverFilters.sort = document.getElementById('discover-sort').value;
      const discInput = document.getElementById('discover-search');
      if (discInput) discInput.value = '';
      fetchAndRenderDiscover(state.discoverCategory);
    });
  });

  // Masquer les films déjà en collection — filtre côté client au rendu,
  // marche donc aussi sur la recherche libre et la reco
  document.getElementById('discover-hide-collection').addEventListener('click', () => {
    state.discoverFilters.hideCollection = !state.discoverFilters.hideCollection;
    document.getElementById('discover-hide-collection').classList.toggle('active', state.discoverFilters.hideCollection);
    if (state.lastTmdbItems) renderTmdbGrid(state.lastTmdbItems);
  });

  // Reco refresh button
  document.getElementById('reco-refresh').addEventListener('click', () => {
    state.recoPool = null; // force rebuild
    fetchAndRenderReco(true);
  });

  // Stats: bulk enrich countries
  document.getElementById('origin-enrich-btn').addEventListener('click', bulkEnrichCountries);
  // Stats: bulk enrich gender data
  document.getElementById('gender-enrich-btn').addEventListener('click', enrichGender);

  // Search (local collection)
  let searchTimer;
  document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.search = e.target.value;
      applyFilters();
    }, 180);
  });

  // Filter toggle
  document.getElementById('filter-toggle').addEventListener('click', () => {
    const open = document.getElementById('filter-panel').classList.toggle('open');
    const btn = document.getElementById('filter-toggle');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.getElementById('filter-toggle-label').textContent = open ? '− filtres' : '+ filtres';
  });

  // Filter dropdowns (genre, lieu, decade, yearvu)
  const filterIds = {
    'filter-genre': 'genre',
    'filter-lieu': 'lieu',
    'filter-decade': 'decade',
    'filter-yearvu': 'yearvu',
    'filter-mois': 'mois',
    'filter-country': 'country',
    'filter-realpays': 'dirCountry',
  };
  Object.entries(filterIds).forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', (e) => {
      state.filters[key] = e.target.value;
      applyFilters();
    });
  });

  // Rating chips (multi-select)
  document.querySelectorAll('#rating-chips .rating-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const r = parseInt(chip.dataset.rating, 10);
      if (state.filters.ratings.has(r)) {
        state.filters.ratings.delete(r);
        chip.classList.remove('active');
      } else {
        state.filters.ratings.add(r);
        chip.classList.add('active');
      }
      applyFilters();
    });
  });

  // Sort
  document.getElementById('sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    applyFilters();
  });

  // Reset — restore defaults including the per-tab sort
  document.getElementById('filter-reset').addEventListener('click', () => {
    state.filters = { status: 'a_voir', search: '', genre: '', lieu: '', decade: '', yearvu: '', mois: '', country: '', dirCountry: '', ratings: new Set() };
    state.sort = TAB_SORT_DEFAULTS.a_voir;
    document.getElementById('search').value = '';
    Object.keys(filterIds).forEach(id => { document.getElementById(id).value = ''; });
    document.querySelectorAll('#rating-chips .rating-chip').forEach(c => c.classList.remove('active'));
    document.getElementById('sort').value = TAB_SORT_DEFAULTS.a_voir;
    setView('a_voir');
  });

  // Load more
  document.getElementById('load-more').addEventListener('click', () => {
    state.page++;
    renderGrid({ append: true });
  });

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
  // Escape ferme uniquement la couche de modal la plus haute (le rematch
  // s'ouvre au-dessus de la fiche film : ne pas tout fermer d'un coup)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('rematch-backdrop').classList.contains('open')) { closeRematchModal(); return; }
    if (document.getElementById('admin-setup-backdrop').classList.contains('open')) { closeAdminSetup(); return; }
    closeModal();
  });
  // Tab et Maj+Tab bouclent dans la fiche tant qu'elle est la fenêtre du dessus
  // (le re-match ou le mode édition peuvent s'ouvrir par-dessus)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (!document.getElementById('modal-backdrop').classList.contains('open')) return;
    if (document.getElementById('rematch-backdrop').classList.contains('open')
      || document.getElementById('admin-setup-backdrop').classList.contains('open')) return;
    const box = document.getElementById('modal-content');
    const items = [...box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])')]
      .filter(el => el.getClientRects().length);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const inside = box.contains(document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
  });

  // Navigation
  document.getElementById('nav-collection').addEventListener('click', () => showPage('collection'));
  document.getElementById('nav-stats').addEventListener('click', () => showPage('stats'));
  document.getElementById('brand').addEventListener('click', () => showPage('collection'));

  // ========== ADMIN WIRING ==========

  // Admin nav button
  document.getElementById('nav-admin').addEventListener('click', () => openAdminSetup());

  // Admin setup modal
  document.getElementById('admin-setup-close').addEventListener('click', closeAdminSetup);
  document.getElementById('admin-setup-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'admin-setup-backdrop') closeAdminSetup();
  });
  // 3 views: setup / unlock / manage
  document.getElementById('admin-setup-btn').addEventListener('click', setupAdmin);
  document.getElementById('admin-unlock-btn').addEventListener('click', unlockAdmin);
  document.getElementById('admin-lock-btn').addEventListener('click', lockAdmin);
  document.getElementById('admin-disable-btn').addEventListener('click', disableAdmin);
  document.getElementById('admin-reset-link').addEventListener('click', (e) => {
    e.preventDefault();
    disableAdmin();
  });
  document.getElementById('admin-pat-help').addEventListener('click', (e) => {
    e.preventDefault();
    const h = document.getElementById('admin-help');
    h.style.display = h.style.display === 'none' ? '' : 'none';
  });
  // Enter key submits setup/unlock
  document.getElementById('admin-setup-code-confirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') setupAdmin();
  });
  document.getElementById('admin-unlock-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') unlockAdmin();
  });

  // Rematch modal
  document.getElementById('rematch-close').addEventListener('click', closeRematchModal);
  document.getElementById('rematch-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'rematch-backdrop') closeRematchModal();
  });
  document.getElementById('rematch-input').addEventListener('input', (e) => {
    clearTimeout(rematchSearchTimer);
    rematchSearchTimer = setTimeout(() => handleRematchSearch(e.target.value.trim()), 300);
  });
}

function showPage(name) {
  document.getElementById('collection-page').style.display = name === 'collection' ? '' : 'none';
  document.getElementById('stats-page').classList.toggle('active', name === 'stats');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  if (name === 'stats' && statsDirty) {
    renderStats();
    statsDirty = false;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// BOOT
// ============================================================
loadAdminCreds();
wireEvents();
loadFilms();

// Récupérer les films actuellement en salles (France) et repeindre les badges
// « au ciné » sur la vue courante une fois la liste prête (cache 24 h).
ensureNowPlayingFR().then(() => {
  if (!nowPlayingSet.size) return;
  if (state.view === 'a_voir' || state.view === 'vu') renderGrid();
  else if (state.view === 'discover') fetchAndRenderDiscover(state.discoverCategory);
  else if (state.view === 'reco' && state.recoDisplayed) renderTmdbGrid(state.recoDisplayed);
});

// Admin no longer auto-activates: user enters their code each session via the 🔒 button.
// If localStorage has an encrypted PAT, the 🔒 click will show the "unlock with code" view.
