// Vue Globe : chaque histoire est un point; la choisir nous y amène par un
// zoom arrière, un survol et un zoom avant. Chargée à la demande (MapLibre ≈ 1 Mo).
import * as maplibregl from './vendor/maplibre/maplibre-gl.mjs';
import {
  REGION_LABEL, REGION_ORDER, TOPIC_LABEL, TOPIC_ORDER, SUBTOPIC_LABEL, COUNTRY, HUB, BIAS_BY_KEY, esc, timeAgo, plural, biasBar, biasSummary,
} from './lib.js';
import { visibleStories } from './views.js';

const TILES = 'https://tiles.openfreemap.org';
const DWELL_MS = 8000;
const INITIAL = { center: [-40, 38], zoom: 1.4 };

let G = null; // état du globe monté

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const narrow = () => matchMedia('(max-width: 700px)').matches;

function palette() {
  return isDark()
    ? { ocean: '#0e181b', land: '#2b2b26', border: '#4d4b43', road: '#3e3d37', label: '#c3c2b7', halo: '#0e181b', sky: '#121211', horizon: '#1c2a2f', dot: cssVar('--accent') || '#3fb8ac', ring: '#f4f3ef',
      bias: { left: '#8f84ee', cleft: '#7a72c9', center: '#9a988f', cright: '#b08a3e', right: '#c98500', state: '#a3a198' } }
    : { ocean: '#cddde3', land: '#ebe8df', border: '#a9a499', road: '#d8d2c4', label: '#54524d', halo: '#ebe8df', sky: '#f7f6f3', horizon: '#e3ecef', dot: cssVar('--accent') || '#0e7c74', ring: '#151513',
      bias: { left: '#5b4bc4', cleft: '#8a7fdc', center: '#7d7a72', cright: '#c9952e', right: '#b87800', state: '#57554f' } };
}

// Style maison : le fond Natural Earth est intégré au site et s'affiche toujours.
function buildStyle() {
  const c = palette();
  return {
    version: 8,
    projection: { type: 'globe' },
    sky: { 'sky-color': c.sky, 'horizon-color': c.horizon, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
    glyphs: `${TILES}/fonts/{fontstack}/{range}.pbf`,
    sources: { world: { type: 'geojson', data: 'geo/world.json', attribution: 'Natural Earth · GeoNames' } },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': c.ocean } },
      { id: 'land', type: 'fill', source: 'world', filter: ['==', ['get', 'kind'], 'land'], paint: { 'fill-color': c.land } },
      { id: 'borders', type: 'line', source: 'world', filter: ['==', ['get', 'kind'], 'border'], maxzoom: 5, paint: { 'line-color': c.border, 'line-width': 0.7 } },
    ],
  };
}

// Détails OpenFreeMap (côtes précises, routes, noms de lieux) : ajoutés seulement
// si le service répond, pour qu'une panne ne bloque jamais le globe.
function detailLayers() {
  const c = palette();
  const name = ['coalesce', ['get', 'name:fr'], ['get', 'name']];
  return [
    { id: 'water-detail', type: 'fill', source: 'omt', 'source-layer': 'water', minzoom: 3, paint: { 'fill-color': c.ocean, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0, 4, 1] } },
    { id: 'borders-detail', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 4.5, filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': c.border, 'line-width': 1 } },
    { id: 'states-detail', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 4, filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': c.border, 'line-width': 0.6, 'line-dasharray': [2, 2] } },
    { id: 'roads', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 6, filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]], paint: { 'line-color': c.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 2] } },
    { id: 'country-labels', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 6, filter: ['==', ['get', 'class'], 'country'], layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-transform': 'uppercase', 'text-letter-spacing': 0.08 }, paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.2 } },
    { id: 'city-labels', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 5, filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]], layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 10, 14] }, paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.2 } },
  ];
}

async function addDetails() {
  if (G.details === false) return;
  if (G.details == null) {
    try {
      const res = await fetch(`${TILES}/planet`, { signal: AbortSignal.timeout(6000) });
      G.details = res.ok ? await res.json() : false;
    } catch {
      G.details = false;
    }
  }
  const { map } = G || {};
  if (!map || !G.details || map.getSource('omt')) return;
  map.addSource('omt', {
    type: 'vector', tiles: G.details.tiles, minzoom: G.details.minzoom ?? 0, maxzoom: G.details.maxzoom ?? 14,
    attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  });
  const before = map.getLayer('stories-halo') ? 'stories-halo' : undefined;
  for (const layer of detailLayers()) map.addLayer(layer, layer.id === 'water-detail' || layer.id.endsWith('detail') ? 'borders' : before);
}

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

// ---------- Arcs de couverture : d'où viennent les médias qui couvrent l'histoire ----------

const toVec = ([lon, lat]) => {
  const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
};
const toLonLat = ([x, y, z]) => [(Math.atan2(y, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI];

// Arc de grand cercle, longitudes « déroulées » pour franchir l'antiméridien sans saut.
function greatCircle(from, to, steps = 48) {
  const a = toVec(from), b = toVec(to);
  const omega = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  if (omega < 0.01) return null;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k1 = Math.sin((1 - t) * omega) / Math.sin(omega), k2 = Math.sin(t * omega) / Math.sin(omega);
    const p = toLonLat([k1 * a[0] + k2 * b[0], k1 * a[1] + k2 * b[1], k1 * a[2] + k2 * b[2]]);
    if (pts.length) while (p[0] - pts[pts.length - 1][0] > 180) p[0] -= 360;
    if (pts.length) while (p[0] - pts[pts.length - 1][0] < -180) p[0] += 360;
    pts.push(p);
  }
  return pts;
}

function bucketForMean(mean) {
  if (mean == null) return 'state';
  if (mean <= -1.5) return 'left';
  if (mean <= -0.5) return 'cleft';
  if (mean < 0.5) return 'center';
  if (mean < 1.5) return 'cright';
  return 'right';
}

// Médias regroupés par pays d'origine, avec l'orientation moyenne de ces médias.
function coverageByCountry(s) {
  const groups = new Map();
  for (const a of s.articles) {
    const src = G.ctx.sourcesById[a.source];
    if (!src) continue;
    const g = groups.get(src.country) || { cc: src.country, n: 0, sum: 0, rated: 0 };
    g.n++;
    if (src.bias != null) { g.sum += src.bias; g.rated++; }
    groups.set(src.country, g);
  }
  return [...groups.values()].map((g) => ({ ...g, bucket: bucketForMean(g.rated ? g.sum / g.rated : null) })).sort((a, b) => b.n - a.n);
}

function arcsData(s) {
  const features = [];
  if (!s) return { type: 'FeatureCollection', features };
  const c = palette();
  const dest = [s.place.lon, s.place.lat];
  for (const g of coverageByCountry(s)) {
    const hub = HUB[g.cc];
    if (!hub) continue;
    const color = c.bias[g.bucket];
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: hub }, properties: { kind: 'hub', n: g.n, color } });
    const line = greatCircle(hub, dest);
    if (line) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: { kind: 'arc', n: g.n, color } });
  }
  return { type: 'FeatureCollection', features };
}

function addStoryLayers() {
  const { map } = G;
  const c = palette();
  map.addSource('arcs', { type: 'geojson', data: arcsData(G.selected) });
  map.addLayer({
    id: 'arcs', type: 'line', source: 'arcs', filter: ['==', ['get', 'kind'], 'arc'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['+', 1, ['*', 0.9, ['get', 'n']]], 'line-opacity': 0.8 },
  });
  map.addLayer({
    id: 'hubs', type: 'circle', source: 'arcs', filter: ['==', ['get', 'kind'], 'hub'],
    paint: { 'circle-radius': ['+', 3, ['get', 'n']], 'circle-color': ['get', 'color'], 'circle-stroke-color': c.land, 'circle-stroke-width': 1.5 },
  });
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
    <div class="kicker"><span class="region">${pin}${esc(s.place.name)}</span>${themeOf(s) ? `<span class="topic">${esc(themeOf(s))}</span>` : ''}<span>${esc(timeAgo(s.updated))}</span></div>
    <h2><a href="#/histoire/${esc(s.id)}">${esc(s.title)}</a></h2>
    ${biasBar(s.bias)}
    <div class="meta"><strong>${plural(s.sourceCount, 'source', 'sources')}</strong><span>${esc(biasSummary(s.bias))}</span></div>
    ${s.lead ? `<p class="lead">${esc(s.lead)}</p>` : ''}
    <div class="gfrom"><h3>D'où vient la couverture</h3><div class="chips">${coverageByCountry(s).map((g) => `<span class="chip" title="${esc(BIAS_BY_KEY[g.bucket].label)} en moyenne"><span class="swatch" style="--c:${palette().bias[g.bucket]}"></span>${esc(COUNTRY[g.cc] || g.cc)} <b>${g.n}</b></span>`).join('')}</div></div>
    <div class="gcard-foot"><a class="btn" href="#/histoire/${esc(s.id)}">Comparer la couverture →</a><span class="gpos">${i + 1} / ${G.list.length}</span></div>
  </article>`;
}

function intro() {
  const top = G.list.slice(0, 6);
  return `<div class="gintro">
    <h2>Le monde des nouvelles</h2>
    <p>Chaque point est une histoire, plus gros quand plus de médias la couvrent. Choisissez-en un, ou lancez la visite guidée : le globe vous amènera d'une nouvelle à l'autre.</p>
    ${top.length ? `<ul class="glist">${top.map((s) => `<li><button type="button" data-gpick="${esc(s.id)}"><span class="gplace">${esc(s.place.name)}</span>${esc(s.title)}</button></li>`).join('')}</ul>` : ''}
  </div>`;
}

function pickList(ids) {
  const stories = ids.map((id) => G.list.find((s) => s.id === id)).filter(Boolean);
  return `<div class="gintro"><h2>${plural(stories.length, 'histoire', 'histoires')} ici</h2>
    <ul class="glist">${stories.map((s) => `<li><button type="button" data-gpick="${esc(s.id)}"><span class="gplace">${esc(s.place.name)} · ${plural(s.sourceCount, 'source', 'sources')}</span>${esc(s.title)}</button></li>`).join('')}</ul></div>`;
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
  const target = { center: [s.place.lon, s.place.lat], zoom: Math.min(s.place.zoom, G.details ? 9.5 : 5.5), padding: pad };
  if (reducedMotion()) G.map.jumpTo(target);
  else G.map.flyTo({ ...target, curve: 1.7, speed: 0.75, essential: true });
}

function select(s, { flyTo = true } = {}) {
  G.selected = s;
  G.ctx.ui.globeStory = s?.id || null;
  if (G.map.getLayer('stories-halo')) G.map.setFilter('stories-halo', ['==', ['get', 'id'], s?.id || '']);
  G.map.getSource('arcs')?.setData(arcsData(s));
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
  G.map.getSource('arcs')?.setData(arcsData(G.selected));
  renderPanel();
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
  if (!document.getElementById('maplibre-css')) {
    const link = Object.assign(document.createElement('link'), { id: 'maplibre-css', rel: 'stylesheet', href: 'vendor/maplibre/maplibre-gl.css' });
    document.head.append(link);
  }
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

  G = { root, ctx, list: [], hidden: 0, selected: null, playing: false, timer: null, filter: ctx.ui.globeFilter || 'all', dark: isDark() };
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
  map.on('error', (e) => console.warn('Globe :', e.error?.message || e));

  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'globe-tip', maxWidth: '280px' });
  map.on('style.load', () => {
    if (!map.getSource('stories')) addStoryLayers();
    addDetails();
  });
  map.on('mousemove', 'stories', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const s = G.list.find((x) => x.id === e.features[0].properties.id);
    if (s) popup.setLngLat(e.features[0].geometry.coordinates).setHTML(`<b>${esc(s.title)}</b><span>${esc(s.place.name)} · ${plural(s.sourceCount, 'source', 'sources')}</span>`).addTo(map);
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
  renderPanel();
}

// Nouvelles données, préférences ou thème : on met à jour sans perdre la caméra.
export function updateGlobe(ctx, storyId) {
  if (!G?.map) return;
  G.ctx = ctx;
  if (isDark() !== G.dark) {
    G.dark = isDark();
    G.map.setStyle(buildStyle(), { diff: false });
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
