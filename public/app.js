import { REGION_LABEL, REGION_ORDER, TOPIC_LABEL, TOPIC_ORDER, store, esc, timeAgo } from './lib.js';
import { renderHome, renderRegion, renderTopic, renderStory, renderBlindspots, renderSources, renderProfile, renderSearch, recordRead } from './views.js';

const POLL_MS = 2 * 60 * 1000;
const main = document.getElementById('main');

const ctx = {
  stories: [],
  sources: [],
  sourcesById: {},
  meta: null,
  prefs: { lang: 'fr-first', hidePaywall: false, theme: 'auto', ...store.get('prefs', {}) },
  ui: {},
  pending: null,
};

async function getJson(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`);
  return res.json();
}

async function loadAll() {
  const [meta, stories, sources] = await Promise.all([getJson('data/meta.json'), getJson('data/stories.json'), getJson('data/sources.json')]);
  return { meta, stories: stories.stories, sources: sources.sources };
}

function apply(data) {
  ctx.meta = data.meta;
  ctx.stories = data.stories;
  ctx.sources = data.sources;
  ctx.sourcesById = Object.fromEntries(data.sources.map((s) => [s.id, s]));
}

// ---------- Navigation ----------

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { name: parts[0] || 'home', arg: parts[1] };
}

function renderTabs() {
  const { name, arg } = route();
  const current = name === 'region' || name === 'theme' ? `${name}/${arg}` : name;
  const link = (href, label) => `<a href="#/${href}" ${current === href || (href === '' && current === 'home') ? 'aria-current="page"' : ''}>${esc(label)}</a>`;
  document.getElementById('tabs').innerHTML = [
    link('', 'À la une'),
    ...REGION_ORDER.map((r) => link(`region/${r}`, r === 'asia' ? 'Asie et M.-O.' : REGION_LABEL[r])),
    '<span class="sep" aria-hidden="true"></span>',
    ...TOPIC_ORDER.map((t) => link(`theme/${t}`, t === 'ai' ? 'IA' : TOPIC_LABEL[t])),
    '<span class="sep" aria-hidden="true"></span>',
    link('angles-morts', 'Angles morts'),
    link('globe', 'Globe'),
  ].join('');
  // Sur mobile, l'onglet actif peut être hors de vue : on le centre dans la barre.
  const tabs = document.getElementById('tabs');
  const active = tabs.querySelector('[aria-current="page"]');
  if (active) tabs.scrollLeft = active.offsetLeft - (tabs.clientWidth - active.clientWidth) / 2;
  for (const [id, page] of [['sources-link', 'sources'], ['profile-link', 'profil']]) {
    const el = document.getElementById(id);
    if (current === page) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  }
}

// ---------- Globe (chargé à la demande) ----------

let globe = null;

function setHeaderHeight() {
  document.documentElement.style.setProperty('--header-h', `${document.querySelector('.topbar').offsetHeight}px`);
}
window.addEventListener('resize', setHeaderHeight);

async function renderGlobe(storyId) {
  document.body.classList.add('globe-mode');
  document.title = 'Globe — Prisme';
  setHeaderHeight();
  if (!globe) {
    main.innerHTML = '<div class="globe-loading">Chargement du globe…</div>';
    try {
      globe = await import('./globe.js');
    } catch (err) {
      main.innerHTML = `<div class="empty">Impossible de charger le globe (${esc(err.message)}).</div>`;
      return;
    }
    if (route().name !== 'globe') return;
  }
  if (globe.globeMounted() && main.querySelector('#globe-map')) globe.updateGlobe(ctx, storyId);
  else globe.mountGlobe(main, ctx, storyId);
}

function render({ keepScroll = false } = {}) {
  const { name, arg } = route();
  renderTabs();
  if (!ctx.meta) return;
  if (name === 'globe') {
    renderGlobe(arg);
    return;
  }
  if (globe?.globeMounted()) globe.destroyGlobe();
  document.body.classList.remove('globe-mode');
  const views = {
    home: () => renderHome(ctx),
    region: () => (REGION_LABEL[arg] ? renderRegion(ctx, arg) : renderHome(ctx)),
    theme: () => (TOPIC_LABEL[arg] ? renderTopic(ctx, arg) : renderHome(ctx)),
    histoire: () => renderStory(ctx, arg),
    'angles-morts': () => renderBlindspots(ctx),
    sources: () => renderSources(ctx),
    profil: () => renderProfile(ctx),
    recherche: () => renderSearch(ctx, arg || ''),
  };
  const y = window.scrollY;
  main.innerHTML = (views[name] || views.home)();
  document.title = name === 'histoire'
    ? `${ctx.stories.find((s) => s.id === arg)?.title || 'Histoire'} — Prisme`
    : "Prisme — l'actualité sous tous ses angles";
  if (keepScroll) window.scrollTo(0, y);
}

window.addEventListener('hashchange', () => {
  ctx.ui.storyLang = 'all';
  ctx.ui.expanded = {};
  ctx.ui.subtopic = null;
  render();
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
});

// ---------- Interactions (délégation) ----------

main.addEventListener('click', (e) => {
  const read = e.target.closest('[data-read]');
  if (read) recordRead(read.dataset.read, read.dataset.story);

  const back = e.target.closest('[data-back]');
  if (back && history.length > 1) {
    e.preventDefault();
    history.back();
  }

  const langBtn = e.target.closest('[data-story-lang]');
  if (langBtn) {
    ctx.ui.storyLang = langBtn.dataset.storyLang;
    render({ keepScroll: true });
  }

  const subtopic = e.target.closest('[data-subtopic]');
  if (subtopic) {
    ctx.ui.subtopic = subtopic.dataset.subtopic || null;
    render({ keepScroll: true });
  }

  const more = e.target.closest('[data-expand]');
  if (more) {
    ctx.ui.expanded = { ...ctx.ui.expanded, [more.dataset.expand]: true };
    render({ keepScroll: true });
  }

  const sort = e.target.closest('th[data-sort]');
  if (sort) {
    ctx.ui.sourceFilter = { ...(ctx.ui.sourceFilter || { q: '', country: '' }), sort: sort.dataset.sort };
    render({ keepScroll: true });
  }

  if (e.target.id === 'clear-history' && confirm('Effacer votre historique de lecture sur cet appareil ?')) {
    store.remove('reads');
    render();
  }
});

// Le clic du milieu ouvre aussi l'article : on le compte.
main.addEventListener('auxclick', (e) => {
  const read = e.target.closest('[data-read]');
  if (read && e.button === 1) recordRead(read.dataset.read, read.dataset.story);
});

main.addEventListener('input', (e) => {
  if (e.target.id === 'source-q' || e.target.id === 'source-country') {
    const f = ctx.ui.sourceFilter || { q: '', country: '', sort: 'name' };
    ctx.ui.sourceFilter = { ...f, [e.target.id === 'source-q' ? 'q' : 'country']: e.target.value };
    const focused = e.target.id;
    const pos = e.target.selectionStart;
    render({ keepScroll: true });
    const el = document.getElementById(focused);
    el?.focus();
    if (focused === 'source-q' && el) el.setSelectionRange(pos, pos);
  }
});

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = document.getElementById('search').value.trim();
  if (q) location.hash = `#/recherche/${encodeURIComponent(q)}`;
});

// ---------- Préférences ----------

function applyTheme() {
  if (ctx.prefs.theme === 'light' || ctx.prefs.theme === 'dark') document.documentElement.dataset.theme = ctx.prefs.theme;
  else delete document.documentElement.dataset.theme;
  store.set('theme', ctx.prefs.theme);
}

const dialog = document.getElementById('settings');
document.getElementById('settings-btn').addEventListener('click', () => {
  const form = dialog.querySelector('form');
  form.lang.value = ctx.prefs.lang;
  form.theme.value = ctx.prefs.theme;
  form.hidePaywall.checked = ctx.prefs.hidePaywall;
  dialog.showModal();
});
dialog.addEventListener('change', (e) => {
  const { name, value, checked, type } = e.target;
  ctx.prefs[name] = type === 'checkbox' ? checked : value;
  store.set('prefs', ctx.prefs);
  if (name === 'theme') applyTheme();
  render({ keepScroll: true });
});
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

// ---------- Actualisation automatique ----------

function renderStatus() {
  const el = document.getElementById('status');
  if (!ctx.meta) { el.textContent = ''; return; }
  const age = (Date.now() - Date.parse(ctx.meta.generated)) / 60000;
  const stale = age > 90;
  el.innerHTML = `<span class="dot${stale ? ' stale' : ''}"></span>${stale ? 'Dernière mise à jour' : 'Mis à jour'} ${esc(timeAgo(ctx.meta.generated))}`;
  el.title = `${ctx.meta.feeds.ok}/${ctx.meta.feeds.total} flux récupérés · ${ctx.meta.articleCount} articles`;
}

function showPending() {
  const known = new Set(ctx.stories.map((s) => s.id));
  const fresh = ctx.pending.stories.filter((s) => s.sourceCount >= 2 && !known.has(s.id)).length;
  document.getElementById('refresh-text').textContent = fresh
    ? `${fresh} nouvelle${fresh > 1 ? 's' : ''} histoire${fresh > 1 ? 's' : ''} depuis votre arrivée.`
    : 'La couverture a été mise à jour.';
  document.getElementById('refresh-banner').hidden = false;
}

function applyPending() {
  if (!ctx.pending) return;
  apply(ctx.pending);
  ctx.pending = null;
  document.getElementById('refresh-banner').hidden = true;
  render({ keepScroll: true });
  renderStatus();
}
document.getElementById('refresh-btn').addEventListener('click', () => { applyPending(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

async function poll() {
  try {
    const meta = await getJson('data/meta.json');
    if (ctx.meta && meta.generated !== ctx.meta.generated && meta.generated !== ctx.pending?.meta.generated) {
      ctx.pending = await loadAll();
      // Onglet en arrière-plan : on applique sans déranger; sinon on propose.
      if (document.hidden) applyPending(); else showPending();
    }
  } catch { /* réseau indisponible : on réessaiera */ }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

// ---------- Démarrage ----------

async function start() {
  applyTheme();
  renderTabs();
  main.innerHTML = '<div class="stories"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  try {
    apply(await loadAll());
    render();
  } catch (err) {
    main.innerHTML = `<div class="empty">Impossible de charger les nouvelles (${esc(err.message)}). Réessayez dans un instant.</div>`;
  }
  renderStatus();
  setInterval(renderStatus, 30000);
  setInterval(poll, POLL_MS);
}

start();
