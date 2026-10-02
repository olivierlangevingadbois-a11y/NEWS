import fs from 'node:fs';
import { normalize } from './text.js';

// Situe chaque histoire sur le globe : repère les lieux nommés dans les titres
// et descriptions, lève les ambiguïtés avec le contexte, puis retient le lieu
// le plus précis et le plus cité par l'ensemble des articles.

const G = JSON.parse(fs.readFileSync(new URL('../../config/gazetteer.json', import.meta.url), 'utf8'));
const MAX_WORDS = 6;
const KIND_WEIGHT = { city: 1, region: 0.9, admin: 0.7, country: 0.5 };
const METONYM_WEIGHT = 0.35;
const DEMONYM_WEIGHT = 0.25;
const MIN_SCORE = 0.8;
const PLACE_KEYS = new Set([...Object.keys(G.index), ...Object.keys(G.metonyms)]);
const QUEBEC_CITY = G.index.quebec?.find((e) => G.places[e]?.k === 'city');
const QUEBEC_PROVINCE = G.index.quebec?.find((e) => G.places[e]?.k === 'admin');

const ELISION = /^(?:[ldjmnstc]|qu|jusqu|lorsqu|puisqu)['’]/i;

function words(text) {
  const out = [];
  const tokens = String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’.\-]*/gu) || [];
  tokens.forEach((token, t) => {
    const bare = token.replace(ELISION, '').replace(/[.\-']+$/u, '');
    const capital = /^[\p{Lu}\p{N}]/u.test(bare);
    for (const w of normalize(token).split(' ').filter(Boolean)) out.push({ w, t, token: bare, capital });
  });
  return out;
}

// Repère les mentions de lieux (du nom le plus long au plus court).
export function extractMentions(text) {
  const ws = words(text);
  const mentions = [];
  for (let i = 0; i < ws.length;) {
    let found = null;
    for (let n = Math.min(MAX_WORDS, ws.length - i); n >= 1 && !found; n--) {
      const span = ws.slice(i, i + n);
      const norm = span.map((x) => x.w).join(' ');
      const capital = span.some((x) => x.capital);
      if (PLACE_KEYS.has(norm) && capital) {
        const entries = G.index[norm] || [];
        // Les sigles courts doivent apparaître exactement (US, UK, RDC).
        const cands = entries.flatMap((e) => (Array.isArray(e) ? (span.length === 1 && span[0].token === e[1] ? [e[0]] : []) : [e]));
        const metonym = G.metonyms[norm];
        if (cands.length || metonym != null) {
          const prev = ws[i - 1]?.w;
          const next = ws[i + n]?.w;
          found = { n, mention: { norm, cands, metonym, prev, next } };
        }
      } else if (n === 1 && G.demonyms[norm]) {
        found = { n, mention: { norm, demonym: G.demonyms[norm] } };
      }
    }
    if (found) { mentions.push(found.mention); i += found.n; } else i += 1;
  }
  return mentions;
}

export function articleMentions(article) {
  return { title: extractMentions(article.title), description: extractMentions(article.description), lang: article.lang };
}

const flagOf = (norm, place) => G.flags[`${norm}|${place.c}`] || G.flags[norm] || null;
// À défaut d'autre indice : pays, puis province, puis la ville la plus peuplée.
const rank = (i) => {
  const p = G.places[i];
  return (p.k === 'country' ? 3e9 : p.k === 'admin' ? 2e9 : 0) + (p.p || 0);
};

// Précision d'un lieu : ville, région, province ou État, pays. Les grandes
// régions (Sahel, Moyen-Orient) sont moins précises qu'un pays.
const LEVEL = { city: 4, region: 3, admin: 2, country: 1 };
const level = (p) => (p.k === 'region' && p.z < 5 ? 0 : LEVEL[p.k]);
const km = (a, b) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.la - a.la) * rad) / 2) ** 2 + Math.cos(a.la * rad) * Math.cos(b.la * rad) * Math.sin(((b.lo - a.lo) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
// Le lieu inner est-il dans outer ? Même pays, même province, ou près du centre de la région.
function contains(outer, inner) {
  if (outer.k === 'country') return inner.c === outer.c;
  if (outer.k === 'admin') return inner.a === outer.a;
  if (outer.k !== 'region' || (outer.c && inner.c && inner.c !== outer.c)) return false;
  const at = inner.k !== 'city' && inner.an != null ? G.places[inner.an] : inner;
  return km(outer, at) <= 20000 / 2 ** outer.z;
}

// Choisit le lieu d'une histoire à partir des mentions de tous ses articles.
export function locateStory(articleMentionList) {
  // 1. Contexte : pays et provinces cités sans ambiguïté, et gentilés.
  const context = new Set();
  for (const am of articleMentionList) {
    for (const m of [...am.title, ...am.description]) {
      if (m.demonym) { context.add(m.demonym); continue; }
      // Lecture par défaut (sans contexte) : « Ontario » est la province, pas la ville de Californie.
      // Deux villes homonymes (London) ne disent rien du contexte.
      const cands = m.cands.filter((i) => flagOf(m.norm, G.places[i]) === null).sort((x, y) => rank(y) - rank(x));
      const sameKind = m.cands.length > 1 && m.cands.every((i) => G.places[i].k === G.places[m.cands[0]].k);
      if (cands.length && !sameKind) {
        const p = G.places[cands[0]];
        if (p.c) context.add(p.c);
        if (p.a) context.add(p.a);
      }
    }
  }

  // 2. Résolution de chaque mention, puis pondération.
  const scores = new Map();
  const bump = (i, w) => scores.set(i, (scores.get(i) || 0) + w);
  const resolve = (m, lang) => {
    if (m.norm === 'quebec' && QUEBEC_CITY != null) {
      return m.prev === 'a' || m.next === 'city' || m.prev === 'ville' ? QUEBEC_CITY : QUEBEC_PROVINCE;
    }
    const byLang = G.lang[lang]?.[m.norm];
    if (byLang != null) return byLang;
    const usable = m.cands.filter((i) => {
      const p = G.places[i];
      const flag = flagOf(m.norm, p);
      if (flag === 'never') return false;
      if (flag === 'context') return ['CA', 'US', 'AU'].includes(p.c) && p.a ? context.has(p.a) : context.has(p.c);
      return true;
    });
    if (!usable.length) return null;
    const inContext = usable.filter((i) => context.has(G.places[i].c) || context.has(G.places[i].a));
    const pool = inContext.length ? inContext : usable;
    return pool.sort((a, b) => rank(b) - rank(a))[0];
  };

  for (const am of articleMentionList) {
    for (const [field, factor] of [['title', 2], ['description', 1]]) {
      const seen = new Set();
      for (const m of am[field]) {
        if (m.demonym) {
          const country = G.index[normalize(m.demonym)]?.find((e) => !Array.isArray(e) && G.places[e].k === 'country' && G.places[e].c === m.demonym);
          const i = country ?? G.places.findIndex((p) => p.k === 'country' && p.c === m.demonym);
          if (i >= 0 && !seen.has(`d${i}`)) { seen.add(`d${i}`); bump(i, DEMONYM_WEIGHT * factor); }
          continue;
        }
        let i = m.cands.length ? resolve(m, am.lang) : null;
        let weight = i != null ? KIND_WEIGHT[G.places[i].k] : 0;
        if (i == null && m.metonym != null) { i = m.metonym; weight = METONYM_WEIGHT; }
        if (i == null || seen.has(i)) continue;
        seen.add(i);
        bump(i, weight * factor);
      }
    }
  }
  if (!scores.size) return { place: null, places: [] };

  // 3. Un lieu précis hérite d'une part du score de son pays ou de sa province.
  const countryScore = new Map(), adminScore = new Map();
  for (const [i, s] of scores) {
    const p = G.places[i];
    if (p.k === 'country') countryScore.set(p.c, s);
    if (p.k === 'admin') adminScore.set(p.a, s);
  }
  const total = new Map();
  for (const [i, s] of scores) {
    const p = G.places[i];
    let t = s;
    if (p.k !== 'country' && p.c) t += 0.5 * (countryScore.get(p.c) || 0);
    if (p.k === 'city' && p.a) t += 0.5 * (adminScore.get(p.a) || 0);
    total.set(i, t);
  }
  const ranked = [...total.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] < MIN_SCORE) return { place: null, places: [] };
  // 4. Du lieu retenu, on descend vers le lieu cité le plus précis qu'il contient :
  //    pays → province ou État → région → ville (le mieux noté à chaque niveau).
  let best = ranked[0][0];
  for (;;) {
    const outer = G.places[best];
    const child = ranked.find(([i]) => level(G.places[i]) > level(outer) && contains(outer, G.places[i]));
    if (!child) break;
    best = child[0];
  }

  // 5. Sans ville citée, le point va sur le repère du lieu : capitale du pays ou
  //    de la province, ville principale de la région (voir scripts/build-gazetteer.js).
  const toPlace = (i) => {
    const p = G.places[i];
    const at = p.an != null ? G.places[p.an] : p;
    return { name: p.n, kind: p.k, lat: at.la, lon: at.lo, zoom: p.z, country: p.c || null, ...(at !== p && { anchor: at.n }) };
  };
  const places = [toPlace(best)];
  for (const [i, sc] of ranked) {
    if (places.length >= 3 || sc < MIN_SCORE) break;
    if (!places.some((p) => p.name === G.places[i].n)) places.push(toPlace(i));
  }
  return { place: places[0], places };
}
