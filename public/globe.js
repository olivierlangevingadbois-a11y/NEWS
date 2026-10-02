// Vue Globe : chaque histoire est un point; la choisir nous y amène par un
// zoom arrière, un survol et un zoom avant. Chargée à la demande (MapLibre ≈ 1 Mo).
import {
  maplibregl, ensureCss, isDark, palette, buildStyle, addDetails, detailsAvailable, satellite, coverageByCountry, arcsData, addArcLayers,
} from './mapkit.js';
import {
  REGION_LABEL, REGION_ORDER, TOPIC_LABEL, TOPIC_ORDER, SUBTOPIC_LABEL, COUNTRY, BIAS_BY_KEY, esc, timeAgo, plural, biasBar, biasSummary, placeLabel, store,
} from './lib.js';
import { visibleStories } from './views.js';

const DWELL_MS = 8000;
const INITIAL = { center: [-40, 38], zoom: 1.4 };

let G = null; // état du globe monté

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => matchMedia('(max-width: 700px)').matches;

// Plusieurs histoires au même endroit : on les dispose en spirale pour qu'elles restent cliquables.
function storyFeatures(stories) {
  const seen = new Map();
  return stories.map((s) => {
    const key = `${s.place.lat},${s.place.lon}`;
    const k = seen.get(key) || 0;
    seen.set(key, k + 1);
    const r = k ? 0.18 * Math.sqrt(k) * Math.max(1, 6 - s.place.zoom / 2) : 0;
    const a = k * 2.39996;
    const lat = s.place.lat + r * Math.sin(a);
    const lon = s.place.lon + (r * Math.cos(a)) / Math.max(0.2, Math.cos((s.place.lat * Math.PI) / 180));
    return { type: 'Feature', id: s.id, geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { id: s.id, n: s.sourceCount } };
  });
}

const arcs = (s) => arcsData(s, G.ctx.sourcesById, { sat: G.sat });

function addStoryLayers() {
  const { map } = G;
  const c = palette({ sat: G.sat });
  addArcLayers(map, arcs(G.selected), { sat: G.sat });
  map.addSource('stories', { type: 'geojson', data: { type: 'FeatureCollection', features: storyFeatures(G.list) }, promoteId: 'id' });
  const size = ['sqrt', ['get', 'n']];
  map.addLayer({
    id: 'stories-halo', type: 'circle', source: 'stories',
    filter: ['==', ['get', 'id'], G.selected?.id || ''],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['+', 9, ['*', 1.6, size]], 8, ['+', 14, ['*', 3, size]]], 'circle-color': 'transparent', 'circle-stroke-color': c.ring, 'circle-stroke-width': 2 },
  });
  map.addLayer({
    id: 'stories', type: 'circle', source: 'stories',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['+', 2.5, ['*', 1.2, size]], 8, ['+', 6, ['*', 2.4, size]]],
      'circle-color': c.dot,
      'circle-opacity': 0.85,
      'circle-stroke-color': c.land,
      'circle-stroke-width': 1.2,
    },
  });
}

// ---------- Panneau ----------

const pin = '<svg class="pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="currentColor"/></svg>';

function themeOf(s) {
  const sub = (s.subtopics || [])[0];
  return sub ? SUBTOPIC_LABEL[sub] : TOPIC_LABEL[(s.topics || [])[0]] || REGION_LABEL[s.region] || '';
}

function storyCard(s) {
  const i = G.list.indexOf(s);
  return `<article class="gcard">
    <div class="kicker"><span class="region">${pin}${esc(placeLabel(s.place))}</span>${themeOf(s) ? `<span class="topic">${esc(themeOf(s))}</span>` : ''}<span>${esc(timeAgo(s.updated))}</span></div>
    <h2><a href="#/histoire/${esc(s.id)}">${esc(s.title)}</a></h2>
    ${biasBar(s.bias)}
    <div class="meta"><strong>${plural(s.sourceCount, 'source', 'sources')}</strong><span>${esc(biasSummary(s.bias))}</span></div>
    ${s.lead ? `<p class="lead">${esc(s.lead)}</p>` : ''}
    <div class="gfrom"><h3>D'où vient la couverture</h3><div class="chips">${coverageByCountry(s, G.ctx.sourcesById).map((g) => `<span class="chip" title="${esc(BIAS_BY_KEY[g.bucket].label)} en moyenne"><span class="swatch" style="--c:${palette({ sat: G.sat }).bias[g.bucket]}"></span>${esc(COUNTRY[g.cc] || g.cc)} <b>${g.n}</b></span>`).join('')}</div></div>
    <div class="gcard-foot"><a class="btn" href="#/histoire/${esc(s.id)}">Comparer la couverture →</a><span class="gpos">${i + 1} / ${G.list.length}</span></div>
  </article>`;
}

function intro() {
  const top = G.list.slice(0, 6);
  return `<div class="gintro">
    <h2>Le monde des nouvelles</h2>
    <p>Chaque point est une histoire, plus gros quand plus de médias la couvrent. Choisissez-en un, ou lancez la visite guidée : le globe vous amènera d'une nouvelle à l'autre.</p>
    ${top.length ? `<ul class="glist">${top.map((s) => `<li><button type="button" data-gpick="${esc(s.id)}"><span class="gplace">${esc(placeLabel(s.place))}</span>${esc(s.title)}</button></li>`).join('')}</ul>` : ''}
  </div>`;
}

function pickList(ids) {
  const stories = ids.map((id) => G.list.find((s) => s.id === id)).filter(Boolean);
  return `<div class="gintro"><h2>${plural(stories.length, 'histoire', 'histoires')} ici</h2>
    <ul class="glist">${stories.map((s) => `<li><button type="button" data-gpick="${esc(s.id)}"><span class="gplace">${esc(placeLabel(s.place))} · ${plural(s.sourceCount, 'source', 'sources')}</span>${esc(s.title)}</button></li>`).join('')}</ul></div>`;
}

function renderPanel(html) {
  const body = G.root.querySelector('#globe-body');
  body.innerHTML = html ?? (G.selected ? storyCard(G.selected) : intro());
  body.scrollTop = 0;
  const play = G.root.querySelector('[data-g="play"]');
  play.setAttribute('aria-pressed', String(G.playing));
  play.innerHTML = G.playing ? '<span aria-hidden="true">❚❚</span> Pause' : '<span aria-hidden="true">▶</span> Visite guidée';
  G.root.querySelector('.globe-count').textContent = `${plural(G.list.length, 'histoire située', 'histoires situées')}${G.hidden ? ` · ${G.hidden} sans lieu précis` : ''}`;
}

// ---------- Navigation ----------

function fly(s) {
  const pad = narrow() ? { top: 20, bottom: Math.round(G.root.clientHeight * 0.45), left: 20, right: 20 } : { top: 40, bottom: 40, left: 400, right: 40 };
  // Sans tuiles de détail, un zoom trop rapproché n'afficherait qu'un aplat : on reste plus haut.
  const target = { center: [s.place.lon, s.place.lat], zoom: Math.min(s.place.zoom, detailsAvailable() || G.sat?.maxzoom > 10 ? 9.5 : 5.5), padding: pad };
  if (reducedMotion()) G.map.jumpTo(target);
  else G.map.flyTo({ ...target, curve: 1.7, speed: 0.75, essential: true });
}

function select(s, { flyTo = true } = {}) {
  G.selected = s;
  G.ctx.ui.globeStory = s?.id || null;
  if (G.map.getLayer('stories-halo')) G.map.setFilter('stories-halo', ['==', ['get', 'id'], s?.id || '']);
  G.map.getSource('arcs')?.setData(arcs(s));
  history.replaceState(null, '', s ? `#/globe/${s.id}` : '#/globe');
  renderPanel();
  if (s && flyTo) fly(s);
}

function step(delta) {
  if (!G.list.length) return;
  const i = G.selected ? G.list.indexOf(G.selected) : -1;
  select(G.list[(i + delta + G.list.length) % G.list.length]);
}

function stopTour() {
  G.playing = false;
  clearTimeout(G.timer);
  G.root.querySelector('.globe-progress span').style.cssText = '';
  renderPanel();
}

function scheduleNext() {
  clearTimeout(G.timer);
  if (!G.playing) return;
  const bar = G.root.querySelector('.globe-progress span');
  bar.style.transition = 'none';
  bar.style.width = '0%';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.transition = `width ${DWELL_MS}ms linear`;
    bar.style.width = '100%';
  }));
  G.timer = setTimeout(() => step(1), DWELL_MS);
}

function toggleTour() {
  if (G.playing) { stopTour(); return; }
  G.playing = true;
  if (!G.selected) select(G.list[0]); else scheduleNext();
  renderPanel();
}

// ---------- Filtre ----------

function filterOptions() {
  const opt = (v, l) => `<option value="${v}" ${G.filter === v ? 'selected' : ''}>${esc(l)}</option>`;
  return `${opt('all', 'Toutes les histoires')}<optgroup label="Régions">${REGION_ORDER.map((r) => opt(`r:${r}`, REGION_LABEL[r])).join('')}</optgroup>
    <optgroup label="Thèmes">${TOPIC_ORDER.map((t) => opt(`t:${t}`, TOPIC_LABEL[t])).join('')}${opt('s:disaster', SUBTOPIC_LABEL.disaster)}${opt('s:space', SUBTOPIC_LABEL.space)}</optgroup>`;
}

function computeList() {
  const multi = visibleStories(G.ctx.stories, G.ctx).filter((s) => s.sourceCount >= 2);
  const [kind, key] = G.filter.split(':');
  const filtered = multi.filter((s) => kind === 'all'
    || (kind === 'r' && s.regions.includes(key))
    || (kind === 't' && (s.topics || []).includes(key))
    || (kind === 's' && (s.subtopics || []).includes(key)));
  G.list = filtered.filter((s) => s.place);
  G.hidden = filtered.length - G.list.length;
}

function refreshData() {
  computeList();
  if (G.selected) G.selected = G.list.find((s) => s.id === G.selected.id) || null;
  G.map.getSource('stories')?.setData({ type: 'FeatureCollection', features: storyFeatures(G.list) });
  G.map.getSource('arcs')?.setData(arcs(G.selected));
  renderPanel();
}

// ---------- Imagerie satellite ----------

const SAT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l8-4 8 4-8 4zM4 12l8 4 8-4M4 18l8 4 8-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

function satControl() {
  return {
    onAdd() {
      const el = document.createElement('div');
      el.className = 'maplibregl-ctrl maplibregl-ctrl-group globe-sat';
      el.innerHTML = `<button type="button" aria-pressed="false" title="Imagerie satellite">${SAT_ICON}<span>Satellite</span></button>`;
      el.firstChild.addEventListener('click', () => setSatellite(!G.sat));
      return el;
    },
    onRemove() {},
  };
}

function satButton(state) {
  const btn = G?.root.querySelector('.globe-sat button');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(state === 'on'));
  btn.disabled = state === 'loading';
  btn.querySelector('span').textContent = state === 'off-error' ? 'Indisponible' : 'Satellite';
  btn.title = state === 'off-error' ? "L'imagerie satellite ne répond pas pour le moment" : 'Imagerie satellite';
}

async function setSatellite(on) {
  if (!G?.map) return;
  const map = G.map;
  let sat = null;
  if (on) {
    satButton('loading');
    sat = await satellite();
    if (G?.map !== map) return;
    if (!sat) { satButton('off-error'); return; }
  }
  G.sat = sat;
  store.set('globeSat', Boolean(sat));
  satButton(sat ? 'on' : 'off');
  map.setStyle(buildStyle({ sat }), { diff: false });
}

// ---------- Montage ----------

function onKey(e) {
  if (e.target.closest('input, select, textarea, dialog') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') {
    if (G.playing) stopTour();
    return;
  }
  // Sur un bouton ou un lien, l'espace garde son rôle normal (activer l'élément).
  if (e.key === ' ' && e.target.closest('button, a')) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    step(e.key === 'ArrowRight' ? 1 : -1);
    if (G.playing) scheduleNext();
  } else if (e.key === ' ') {
    e.preventDefault();
    toggleTour();
  }
}

export function mountGlobe(root, ctx, storyId) {
  destroyGlobe();
  ensureCss();
  root.innerHTML = `<section class="globe-page">
    <div class="globe-map" id="globe-map" role="region" aria-label="Globe des nouvelles. Utilisez les flèches gauche et droite pour passer d'une histoire à l'autre."></div>
    <aside class="globe-panel">
      <div class="globe-head"><select id="globe-filter" aria-label="Filtrer les histoires"></select><span class="globe-count"></span></div>
      <div class="globe-body" id="globe-body" aria-live="polite"></div>
      <div class="globe-controls">
        <button type="button" class="btn" data-g="prev" aria-label="Histoire précédente">‹</button>
        <button type="button" class="btn play" data-g="play" aria-pressed="false"></button>
        <button type="button" class="btn" data-g="next" aria-label="Histoire suivante">›</button>
      </div>
      <div class="globe-progress" aria-hidden="true"><span></span></div>
    </aside>
  </section>`;

  G = { root, ctx, list: [], hidden: 0, selected: null, playing: false, timer: null, filter: ctx.ui.globeFilter || 'all', dark: isDark(), sat: null };
  computeList();
  root.querySelector('#globe-filter').innerHTML = filterOptions();

  let map;
  try {
    map = new maplibregl.Map({
      container: root.querySelector('#globe-map'),
      style: buildStyle(),
      ...INITIAL,
      zoom: narrow() ? 0.9 : INITIAL.zoom,
      attributionControl: { compact: true },
      maxZoom: 12,
      keyboard: false, // les flèches servent à passer d'une histoire à l'autre
    });
  } catch (err) {
    root.querySelector('#globe-map').innerHTML = `<div class="empty" style="margin:24px">Le globe a besoin de WebGL, qui n'est pas disponible dans ce navigateur (${esc(err.message)}).</div>`;
    renderPanel(intro());
    return;
  }
  G.map = map;
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
  map.addControl(satControl(), 'top-right');
  map.on('error', (e) => console.warn('Globe :', e.error?.message || e));

  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'globe-tip', maxWidth: '280px' });
  map.on('style.load', () => {
    if (!map.getSource('stories')) addStoryLayers();
    addDetails(map, { before: 'stories-halo' });
  });
  map.on('mousemove', 'stories', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const s = G.list.find((x) => x.id === e.features[0].properties.id);
    if (s) popup.setLngLat(e.features[0].geometry.coordinates).setHTML(`<b>${esc(s.title)}</b><span>${esc(placeLabel(s.place))} · ${plural(s.sourceCount, 'source', 'sources')}</span>`).addTo(map);
  });
  map.on('mouseleave', 'stories', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
  map.on('click', (e) => {
    const box = [[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]];
    const ids = [...new Set(map.queryRenderedFeatures(box, { layers: ['stories'] }).map((f) => f.properties.id))];
    if (!ids.length) return;
    if (G.playing) stopTour();
    if (ids.length === 1) select(G.list.find((s) => s.id === ids[0]));
    else renderPanel(pickList(ids));
  });
  // Pendant la visite, chaque arrivée lance le compte à rebours vers l'histoire suivante.
  map.on('moveend', () => { if (G.playing) scheduleNext(); });
  map.on('dragstart', () => { if (G.playing) stopTour(); });

  root.querySelector('.globe-panel').addEventListener('click', (e) => {
    const g = e.target.closest('[data-g]')?.dataset.g;
    if (g === 'prev') { step(-1); if (G.playing) scheduleNext(); }
    if (g === 'next') { step(1); if (G.playing) scheduleNext(); }
    if (g === 'play') toggleTour();
    const pick = e.target.closest('[data-gpick]');
    if (pick) { if (G.playing) stopTour(); select(G.list.find((s) => s.id === pick.dataset.gpick)); }
  });
  root.querySelector('#globe-filter').addEventListener('change', (e) => {
    G.filter = e.target.value;
    G.ctx.ui.globeFilter = G.filter;
    if (G.playing) stopTour();
    refreshData();
  });
  document.addEventListener('keydown', onKey);
  G.mql = matchMedia('(prefers-color-scheme: dark)');
  G.onScheme = () => updateGlobe(G.ctx);
  G.mql.addEventListener('change', G.onScheme);

  const initial = G.list.find((s) => s.id === storyId);
  map.once('load', () => {
    if (initial) select(initial);
  });
  if (store.get('globeSat', false)) setSatellite(true);
  renderPanel();
}

// Nouvelles données, préférences ou thème : on met à jour sans perdre la caméra.
export function updateGlobe(ctx, storyId) {
  if (!G?.map) return;
  G.ctx = ctx;
  if (isDark() !== G.dark) {
    G.dark = isDark();
    G.map.setStyle(buildStyle({ sat: G.sat }), { diff: false });
  }
  refreshData();
  if (storyId && storyId !== G.selected?.id) {
    const s = G.list.find((x) => x.id === storyId);
    if (s) select(s);
  }
}

export function destroyGlobe() {
  if (!G) return;
  clearTimeout(G.timer);
  document.removeEventListener('keydown', onKey);
  G.mql?.removeEventListener('change', G.onScheme);
  G.map?.remove();
  G = null;
}

export const globeMounted = () => Boolean(G?.map);
