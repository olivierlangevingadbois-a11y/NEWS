#!/usr/bin/env node
// Génère config/gazetteer.json : pays, provinces/États, villes et régions,
// avec leurs noms français et anglais, pour situer chaque histoire sur le globe.
// Sources : GeoNames (via all-the-cities et cities.json, CC BY 4.0),
// Natural Earth (via world-atlas), i18n-iso-countries. Lancer : npm run gazetteer
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { feature, mesh } from 'topojson-client';
import countries from 'i18n-iso-countries';
import { normalize } from '../src/pipeline/text.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cities = require('all-the-cities');
const admin1Names = require('cities.json/admin1.json');
const world = require('world-atlas/countries-110m.json');
const land = require('world-atlas/land-110m.json');
countries.registerLocale(require('i18n-iso-countries/langs/fr.json'));
countries.registerLocale(require('i18n-iso-countries/langs/en.json'));
const extra = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/places-extra.json'), 'utf8'));

const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const places = [];
const index = new Map();
const add = (place, aliases) => {
  const i = places.push(place) - 1;
  const seen = new Set();
  for (const raw of new Set(aliases.filter(Boolean))) {
    const norm = normalize(raw);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    if (!index.has(norm)) index.set(norm, []);
    // Les sigles courts (US, UK) doivent apparaître tels quels dans le texte.
    index.get(norm).push(norm.length <= 3 ? [i, raw] : i);
  }
  return i;
};

// Zoom qui cadre une emprise (en degrés) sur un écran ordinaire.
function zoomFor(lonSpan, latSpan, lat) {
  const span = Math.max(lonSpan * Math.cos((lat * Math.PI) / 180), latSpan * 1.3, 0.05);
  return round(Math.min(Math.max(Math.log2(360 / span) - 0.6, 1.8), 9), 1);
}

// --- Pays ---------------------------------------------------------------
const capitals = new Map(cities.filter((c) => c.featureCode === 'PPLC').map((c) => [c.country, c]));
const shapes = new Map();
for (const f of feature(world, world.objects.countries).features) {
  const cc = countries.numericToAlpha2(f.id);
  if (!cc) continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  // Plus grand polygone : la France sans la Guyane, les États-Unis sans l'Alaska.
  let best = null;
  for (const poly of polys) {
    const ring = poly[0];
    const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
    const box = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    const area = (box[2] - box[0]) * (box[3] - box[1]);
    if (!best || area > best.area) best = { box, area };
  }
  shapes.set(cc, best.box);
}
const countryIndex = new Map();
for (const cc of Object.keys(countries.getAlpha2Codes())) {
  const box = shapes.get(cc);
  const cap = capitals.get(cc);
  if (!box && !cap) continue;
  const lat = box ? (box[1] + box[3]) / 2 : cap.loc.coordinates[1];
  const lon = box ? (box[0] + box[2]) / 2 : cap.loc.coordinates[0];
  const zoom = box ? zoomFor(box[2] - box[0], box[3] - box[1], lat) : 6;
  const fr = countries.getName(cc, 'fr', { select: 'all' }) || [];
  const en = countries.getName(cc, 'en', { select: 'all' }) || [];
  const i = add({ k: 'country', n: extra.countryAliases[cc]?.[0] || fr[0] || en[0], la: round(lat), lo: round(lon), z: zoom, c: cc }, [...fr, ...en, ...(extra.countryAliases[cc] || [])]);
  countryIndex.set(cc, i);
}

// --- Provinces et États (Canada, États-Unis, Australie) ------------------
const NO_PLAIN = new Set(['US|New York', 'US|Washington', 'AU|Victoria']);
for (const { code, name } of admin1Names) {
  const [cc, admin] = code.split('.');
  if (!['CA', 'US', 'AU'].includes(cc)) continue;
  const members = cities.filter((c) => c.country === cc && c.adminCode === admin && c.population >= 1000);
  if (!members.length) continue;
  const total = members.reduce((n, c) => n + c.population, 0);
  const lat = members.reduce((n, c) => n + c.loc.coordinates[1] * c.population, 0) / total;
  const lon = members.reduce((n, c) => n + c.loc.coordinates[0] * c.population, 0) / total;
  const pct = (arr, q) => arr.sort((a, b) => a - b)[Math.floor(q * (arr.length - 1))];
  const lats = members.map((c) => c.loc.coordinates[1]), lons = members.map((c) => c.loc.coordinates[0]);
  const zoom = Math.min(zoomFor(pct(lons, 0.95) - pct(lons, 0.05), pct(lats, 0.95) - pct(lats, 0.05), lat), 7);
  const key = `${cc}|${name}`;
  const fr = extra.admin[key] || [];
  add({ k: 'admin', n: fr[0] || name, la: round(lat), lo: round(lon), z: zoom, c: cc, a: code }, NO_PLAIN.has(key) ? fr : [name, ...fr]);
}

// --- Villes ---------------------------------------------------------------
const exonymFor = new Map(Object.entries(extra.exonyms));
const keep = (c) => c.population >= 100000 || c.featureCode === 'PPLC'
  || (c.country === 'CA' && (c.population >= 30000 || (c.adminCode === '10' && c.population >= 5000)))
  || (c.featureCode === 'PPLA' && ['CA', 'US', 'AU'].includes(c.country));
const cityIndex = new Map();
const cityZoom = (pop) => (pop >= 5e6 ? 8.5 : pop >= 1e6 ? 9 : pop >= 2e5 ? 9.8 : 10.5);
const saintVariants = (name) => {
  const out = [name];
  if (/^Saint-/.test(name)) out.push(name.replace(/^Saint-/, 'St-'), name.replace(/^Saint-/, 'St. '));
  if (/^Sainte-/.test(name)) out.push(name.replace(/^Sainte-/, 'Ste-'));
  if (/^Saint /.test(name)) out.push(name.replace(/^Saint /, 'St. '), name.replace(/^Saint /, 'St '));
  return out;
};
const selected = cities.filter(keep);
// Les cibles des exonymes sont ajoutées même sous le seuil de population.
for (const key of [...exonymFor.keys(), ...Object.entries(extra.metonyms).filter(([k]) => !k.startsWith('$')).map(([, v]) => v)]) {
  const [name, cc] = key.split('|');
  if (!selected.some((c) => c.name === name && c.country === cc)) {
    const found = cities.filter((c) => c.name === name && c.country === cc).sort((a, b) => b.population - a.population)[0];
    if (found) selected.push(found);
    else console.warn(`Introuvable dans GeoNames : ${key}`);
  }
}
for (const c of selected.sort((a, b) => b.population - a.population)) {
  const key = `${c.name}|${c.country}`;
  if (cityIndex.has(key)) continue;
  const exo = exonymFor.get(key) || [];
  const i = add({
    k: 'city', n: exo[0] || c.name, la: round(c.loc.coordinates[1]), lo: round(c.loc.coordinates[0]), z: cityZoom(c.population), c: c.country,
    a: `${c.country}.${c.adminCode}`, p: c.population,
  }, [...saintVariants(c.name), c.altName, ...exo]);
  cityIndex.set(key, i);
}

// --- Régions et lieux ajoutés à la main -----------------------------------
const regionIndex = new Map();
for (const r of extra.regions) {
  if (!r.name) continue;
  regionIndex.set(r.name, add({ k: 'region', n: r.name, la: r.lat, lo: r.lon, z: r.zoom, c: r.cc || null, ...(r.admin && { a: r.admin }) }, [r.name, ...r.aliases]));
}

// --- Repères : où placer le point quand on ne connaît que le pays, la province ou la région.
// Pays : la capitale. Province ou État : sa capitale. Région : la ville choisie à la main.
// Une ville déjà citée dans l'histoire passe toujours avant ce repère (voir places.js).
const largestKept = (test) => {
  let best = null;
  places.forEach((p, i) => { if (p.k === 'city' && test(p) && (best == null || p.p > places[best].p)) best = i; });
  return best;
};
const noCapital = [];
for (const [cc, i] of countryIndex) {
  const cap = capitals.get(cc);
  const an = (cap && cityIndex.get(`${cap.name}|${cc}`)) ?? largestKept((p) => p.c === cc);
  if (an != null) places[i].an = an;
  if (!cap) noCapital.push(`${cc}→${an != null ? places[an].n : '—'}`);
}
for (const p of places) {
  if (p.k !== 'admin') continue;
  const [cc, admin] = p.a.split('.');
  const capital = cities.filter((c) => c.country === cc && c.adminCode === admin && c.featureCode === 'PPLA').sort((a, b) => b.population - a.population)[0];
  const an = (capital && cityIndex.get(`${capital.name}|${cc}`)) ?? largestKept((q) => q.a === p.a);
  if (an != null) p.an = an;
}
for (const r of extra.regions) {
  if (!r.anchor) continue;
  const an = cityIndex.get(r.anchor) ?? regionIndex.get(r.anchor);
  if (an == null) console.warn(`Repère introuvable : ${r.anchor}`);
  else places[regionIndex.get(r.name)].an = an;
}
if (noCapital.length) console.log(`Pays sans capitale dans GeoNames (plus grande ville retenue) : ${noCapital.join(', ')}`);

const resolve = (target) => {
  if (target.startsWith('country:')) return countryIndex.get(target.slice(8));
  const i = cityIndex.get(target);
  if (i == null) console.warn(`Cible introuvable : ${target}`);
  return i;
};
const metonyms = Object.fromEntries(Object.entries(extra.metonyms).filter(([k]) => !k.startsWith('$')).map(([raw, target]) => [normalize(raw), resolve(target)]));
const lang = Object.fromEntries(['fr', 'en'].map((l) => [l, Object.fromEntries(Object.entries(extra.lang[l]).map(([raw, t]) => [normalize(raw), resolve(t)]))]));
const demonyms = {};
for (const [cc, words] of Object.entries(extra.demonyms)) if (!cc.startsWith('$')) for (const w of words) demonyms[normalize(w)] = cc;
const flags = {};
for (const [level, list] of Object.entries(extra.ambiguous)) {
  if (level.startsWith('$')) continue;
  for (const entry of list) {
    const [name, cc] = entry.split('|');
    flags[cc ? `${normalize(name)}|${cc}` : normalize(name)] = level;
  }
}

const out = {
  attribution: 'GeoNames (CC BY 4.0), Natural Earth (domaine public), i18n-iso-countries (MIT)',
  places,
  index: Object.fromEntries([...index.entries()].sort(([a], [b]) => a.localeCompare(b))),
  metonyms,
  lang,
  demonyms,
  flags,
};
fs.writeFileSync(path.join(ROOT, 'config/gazetteer.json'), JSON.stringify(out));

// Fond de carte de secours pour le globe : terres et frontières (Natural Earth 1:110 M),
// toujours disponible même si le fournisseur de tuiles détaillées ne répond pas.
const q = (coords) => (typeof coords[0] === 'number' ? coords.map((x) => round(x, 2)) : coords.map(q));
const basemap = {
  type: 'FeatureCollection',
  features: [
    ...feature(land, land.objects.land).features.map((f) => ({ type: 'Feature', properties: { kind: 'land' }, geometry: { ...f.geometry, coordinates: q(f.geometry.coordinates) } })),
    { type: 'Feature', properties: { kind: 'border' }, geometry: (({ type, coordinates }) => ({ type, coordinates: q(coordinates) }))(mesh(world, world.objects.countries, (a, b) => a !== b)) },
  ],
};
fs.mkdirSync(path.join(ROOT, 'public/geo'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public/geo/world.json'), JSON.stringify(basemap));
console.log(`Fond de carte : ${(fs.statSync(path.join(ROOT, 'public/geo/world.json')).size / 1024).toFixed(0)} Ko`);
const kinds = places.reduce((m, p) => ({ ...m, [p.k]: (m[p.k] || 0) + 1 }), {});
console.log(`Répertoire : ${places.length} lieux (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}), ${index.size} noms, ${(fs.statSync(path.join(ROOT, 'config/gazetteer.json')).size / 1024).toFixed(0)} Ko`);
