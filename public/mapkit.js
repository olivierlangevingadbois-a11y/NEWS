// Briques communes au globe et aux mini-cartes : style maison, détails
// OpenFreeMap, imagerie satellite, arcs de couverture. Chargé à la demande
// avec MapLibre (≈ 1 Mo), jamais sur la page d'accueil.
import * as maplibregl from './vendor/maplibre/maplibre-gl.mjs';
import { HUB } from './lib.js';

export { maplibregl };

const TILES = 'https://tiles.openfreemap.org';

// Imagerie satellite, de la plus détaillée à la plus robuste. On garde la
// première qui répond; aucune ne demande de clé.
const SATELLITE = [
  {
    // Sentinel-2 cloudless 2016 : licence CC BY 4.0 (les millésimes suivants sont non commerciaux).
    tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
    maxzoom: 14,
    attribution: '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> par EOX IT Services GmbH (données Copernicus Sentinel 2016 et 2017 modifiées)',
  },
  {
    // NASA Blue Marble (GIBS) : domaine public, moins précis.
    tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'],
    maxzoom: 8,
    attribution: 'NASA Blue Marble (<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">GIBS</a>)',
  },
];

export const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function ensureCss() {
  if (document.getElementById('maplibre-css')) return;
  document.head.append(Object.assign(document.createElement('link'), { id: 'maplibre-css', rel: 'stylesheet', href: 'vendor/maplibre/maplibre-gl.css' }));
}

export function palette({ sat = null } = {}) {
  const c = isDark()
    ? { ocean: '#0e181b', land: '#2b2b26', border: '#4d4b43', road: '#3e3d37', label: '#c3c2b7', halo: '#0e181b', sky: '#121211', horizon: '#1c2a2f', dot: cssVar('--accent') || '#3fb8ac', ring: '#f4f3ef',
      bias: { left: '#8f84ee', cleft: '#7a72c9', center: '#9a988f', cright: '#b08a3e', right: '#c98500', state: '#a3a198' } }
    : { ocean: '#cddde3', land: '#ebe8df', border: '#a9a499', road: '#d8d2c4', label: '#54524d', halo: '#ebe8df', sky: '#f7f6f3', horizon: '#e3ecef', dot: cssVar('--accent') || '#0e7c74', ring: '#151513',
      bias: { left: '#5b4bc4', cleft: '#8a7fdc', center: '#7d7a72', cright: '#c9952e', right: '#b87800', state: '#57554f' } };
  // Sur l'imagerie : traits et textes clairs, cernés de sombre, pour rester lisibles.
  if (sat) Object.assign(c, { border: 'rgba(255,255,255,0.55)', label: '#ffffff', halo: 'rgba(0,0,0,0.75)', ring: '#ffffff', dot: '#ffcf4a', land: '#1d1d1b' });
  return c;
}

// Style maison : le fond Natural Earth est intégré au site et s'affiche toujours.
// Avec sat, l'imagerie se pose sur les terres, sous les frontières.
export function buildStyle({ sat = null, projection = 'globe' } = {}) {
  const c = palette({ sat });
  const sources = { world: { type: 'geojson', data: 'geo/world.json', attribution: 'Natural Earth · GeoNames' } };
  const layers = [
    { id: 'ocean', type: 'background', paint: { 'background-color': c.ocean } },
    { id: 'land', type: 'fill', source: 'world', filter: ['==', ['get', 'kind'], 'land'], paint: { 'fill-color': c.land } },
  ];
  if (sat) {
    sources.sat = { type: 'raster', tiles: sat.tiles, tileSize: 256, maxzoom: sat.maxzoom, attribution: sat.attribution };
    layers.push({ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 150 } });
  }
  layers.push({ id: 'borders', type: 'line', source: 'world', filter: ['==', ['get', 'kind'], 'border'], maxzoom: 5, paint: { 'line-color': c.border, 'line-width': 0.7 } });
  return {
    version: 8,
    projection: { type: projection },
    sky: { 'sky-color': c.sky, 'horizon-color': c.horizon, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
    glyphs: `${TILES}/fonts/{fontstack}/{range}.pbf`,
    sources,
    layers,
  };
}

// Détails OpenFreeMap (côtes précises, routes, noms de lieux).
function detailLayers({ sat = null } = {}) {
  const c = palette({ sat });
  const name = ['coalesce', ['get', 'name:fr'], ['get', 'name']];
  const text = { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.2 };
  return [
    // Sur l'imagerie, l'eau et les routes la masqueraient : on ne garde que frontières et noms.
    ...(sat ? [] : [{ id: 'water-detail', type: 'fill', source: 'omt', 'source-layer': 'water', minzoom: 3, paint: { 'fill-color': c.ocean, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0, 4, 1] } }]),
    { id: 'borders-detail', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 4.5, filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': c.border, 'line-width': 1 } },
    { id: 'states-detail', type: 'line', source: 'omt', 'source-layer': 'boundary', minzoom: 4, filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': c.border, 'line-width': 0.6, 'line-dasharray': [2, 2] } },
    ...(sat ? [] : [{ id: 'roads', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 6, filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]], paint: { 'line-color': c.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 2] } }]),
    { id: 'country-labels', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 6, filter: ['==', ['get', 'class'], 'country'], layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-transform': 'uppercase', 'text-letter-spacing': 0.08 }, paint: text },
    { id: 'city-labels', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 5, filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]], layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 10, 14] }, paint: text },
  ];
}

// Une seule vérification par visite, partagée par le globe et les mini-cartes.
let detailsProbe = null;
let detailsInfo = null;
export const detailsAvailable = () => Boolean(detailsInfo);

function loadDetails() {
  detailsProbe ??= fetch(`${TILES}/planet`, { signal: AbortSignal.timeout(6000) })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .then((info) => { detailsInfo = info; return info; });
  return detailsProbe;
}

// Ajoutés seulement si le service répond, pour qu'une panne ne bloque jamais la carte.
// before : couche au-dessus de laquelle les noms ne doivent pas passer (les points des histoires).
export async function addDetails(map, { before } = {}) {
  const info = await loadDetails();
  try {
    if (!info || map.getSource('omt')) return;
    // Le style a pu changer pendant l'attente : on lit celui qui est affiché maintenant.
    const sat = Boolean(map.getSource('sat'));
    map.addSource('omt', {
      type: 'vector', tiles: info.tiles, minzoom: info.minzoom ?? 0, maxzoom: info.maxzoom ?? 14,
      attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    });
    const top = before && map.getLayer(before) ? before : undefined;
    for (const layer of detailLayers({ sat })) map.addLayer(layer, layer.id.endsWith('detail') ? 'borders' : top);
  } catch {
    // Carte retirée ou style en cours de remplacement : le prochain style.load s'en chargera.
  }
}

// Fournisseur d'imagerie satellite joignable, ou null. Vérifié une fois par visite.
let satProbe = null;
export function satellite() {
  const tryOne = (sat) => new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ''; resolve(false); }, 7000);
    img.crossOrigin = 'anonymous';
    img.onload = () => { clearTimeout(timer); resolve(true); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.src = sat.tiles[0].replace('{z}', '1').replace('{x}', '1').replace('{y}', '0');
  });
  satProbe ??= (async () => {
    for (const sat of SATELLITE) if (await tryOne(sat)) return sat;
    return null;
  })();
  return satProbe;
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
export function coverageByCountry(s, sourcesById) {
  const groups = new Map();
  for (const a of s.articles) {
    const src = sourcesById[a.source];
    if (!src) continue;
    const g = groups.get(src.country) || { cc: src.country, n: 0, sum: 0, rated: 0 };
    g.n++;
    if (src.bias != null) { g.sum += src.bias; g.rated++; }
    groups.set(src.country, g);
  }
  return [...groups.values()].map((g) => ({ ...g, bucket: bucketForMean(g.rated ? g.sum / g.rated : null) })).sort((a, b) => b.n - a.n);
}

export function arcsData(s, sourcesById, { sat = null } = {}) {
  const features = [];
  if (!s) return { type: 'FeatureCollection', features };
  const c = palette({ sat });
  const dest = [s.place.lon, s.place.lat];
  for (const g of coverageByCountry(s, sourcesById)) {
    const hub = HUB[g.cc];
    if (!hub) continue;
    const color = c.bias[g.bucket];
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: hub }, properties: { kind: 'hub', n: g.n, color } });
    const line = greatCircle(hub, dest);
    if (line) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: { kind: 'arc', n: g.n, color } });
  }
  return { type: 'FeatureCollection', features };
}

export function addArcLayers(map, data, { sat = null } = {}) {
  const c = palette({ sat });
  map.addSource('arcs', { type: 'geojson', data });
  map.addLayer({
    id: 'arcs', type: 'line', source: 'arcs', filter: ['==', ['get', 'kind'], 'arc'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['+', 1, ['*', 0.9, ['get', 'n']]], 'line-opacity': 0.8 },
  });
  map.addLayer({
    id: 'hubs', type: 'circle', source: 'arcs', filter: ['==', ['get', 'kind'], 'hub'],
    paint: { 'circle-radius': ['+', 3, ['get', 'n']], 'circle-color': ['get', 'color'], 'circle-stroke-color': c.land, 'circle-stroke-width': 1.5 },
  });
}
