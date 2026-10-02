// Mini-carte de la page d'une histoire : le lieu, et les arcs depuis les pays
// des médias qui la couvrent. Fixe (pas de glisser ni de zoom, pour ne pas
// piéger le défilement de la page); un clic ouvre le globe sur l'histoire.
import { maplibregl, ensureCss, isDark, palette, buildStyle, addDetails, satellite, arcsData, addArcLayers } from './mapkit.js';
import { store } from './lib.js';

let M = null; // { key, el, map, ctx, dark, sat }

function addPlaceLayers(map, story, sat) {
  const c = palette({ sat });
  addArcLayers(map, arcsData(story, M.ctx.sourcesById, { sat }), { sat });
  map.addSource('place', { type: 'geojson', data: { type: 'Point', coordinates: [story.place.lon, story.place.lat] } });
  map.addLayer({ id: 'place-halo', type: 'circle', source: 'place', paint: { 'circle-radius': 13, 'circle-color': 'transparent', 'circle-stroke-color': c.ring, 'circle-stroke-width': 2 } });
  map.addLayer({ id: 'place', type: 'circle', source: 'place', paint: { 'circle-radius': 6, 'circle-color': c.dot, 'circle-stroke-color': c.land, 'circle-stroke-width': 1.5 } });
}

function restyle(sat) {
  if (!M) return;
  M.sat = sat;
  M.dark = isDark();
  M.map.setStyle(buildStyle({ sat, projection: 'mercator' }), { diff: false });
}

// Appelée après chaque rendu de la page d'une histoire. Si la même histoire est
// déjà affichée, on réutilise la carte au lieu d'en recréer une.
export function mountMinimap(root, story, ctx) {
  const slot = root.querySelector('[data-minimap]');
  if (!slot || !story?.place) { destroyMinimap(); return; }
  const key = `${story.id}|${story.place.lat},${story.place.lon}`;
  if (M && M.key === key) {
    M.ctx = ctx;
    slot.replaceWith(M.el);
    M.map.resize();
    if (M.dark !== isDark()) restyle(M.sat);
    return;
  }
  destroyMinimap();
  ensureCss();
  const { place } = story;
  let map;
  try {
    map = new maplibregl.Map({
      container: slot.querySelector('.minimap-map'),
      // Carte plane : elle remplit le bandeau, là où un globe laisserait des vides.
      style: buildStyle({ projection: 'mercator' }),
      center: [place.lon, place.lat],
      // Assez large pour voir arriver les arcs et reconnaître la région, même sans tuiles de détail.
      zoom: Math.max(2, Math.min(place.zoom - 3, 4.5)),
      interactive: false,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
  } catch {
    slot.classList.add('no-map'); // sans WebGL : le lien et le nom du lieu restent
    return;
  }
  // Le point au-dessus de l'étiquette, pas dessous.
  map.jumpTo({ center: [place.lon, place.lat], padding: { top: 0, left: 0, right: 0, bottom: slot.querySelector('.minimap-label').offsetHeight + 10 } });
  M = { key, el: slot, map, ctx, dark: isDark(), sat: null };
  // Toute la carte mène au globe, sauf les mentions de données.
  slot.querySelector('.minimap-map').addEventListener('click', (e) => {
    if (!e.target.closest('.maplibregl-ctrl')) location.hash = `#/globe/${story.id}`;
  });
  map.on('error', (e) => console.warn('Mini-carte :', e.error?.message || e));
  // La carte ne bouge jamais : les mentions de données resteraient dépliées sur
  // l'étiquette. On les replie, tant que le lecteur ne les a pas ouvertes lui-même.
  let touched = false;
  slot.addEventListener('click', (e) => { if (e.target.closest('.maplibregl-ctrl-attrib-button')) touched = true; }, true);
  const fold = () => setTimeout(() => {
    const attrib = !touched && slot.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show');
    attrib?.classList.remove('maplibregl-compact-show'); // comme après un glisser sur une carte mobile
  });
  map.on('styledata', fold);
  map.on('sourcedata', fold);
  map.on('style.load', () => {
    if (!M || M.map !== map) return;
    addPlaceLayers(map, story, M.sat);
    addDetails(map, { before: 'arcs' });
  });
  // Même choix d'affichage que sur le globe.
  if (store.get('globeSat', false)) {
    satellite().then((sat) => { if (sat && M?.map === map) restyle(sat); });
  }
}

export function destroyMinimap() {
  if (!M) return;
  M.map.remove();
  M = null;
}
