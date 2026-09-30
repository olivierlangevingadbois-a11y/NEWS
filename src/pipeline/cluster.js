import { tokenize, properNouns } from './text.js';

// Regroupement d'articles en « histoires » : vecteurs TF-IDF bilingues,
// arêtes entre articles similaires, puis fusion agglomérative à liaison
// moyenne (évite l'effet de chaîne A~B~C~…~Z).

const TITLE_WEIGHT = 2.2;
const DESC_WEIGHT = 1;
const PROPER_BOOST = 1.6;
const MAX_TERMS = 40;

function termFrequencies(article) {
  const tf = new Map();
  const add = (tokens, w) => { for (const t of tokens) tf.set(t, (tf.get(t) || 0) + w); };
  add(tokenize(article.title), TITLE_WEIGHT);
  add(tokenize(article.description), DESC_WEIGHT);
  const proper = properNouns(`${article.title}. ${article.description}`);
  for (const t of proper) if (tf.has(t)) tf.set(t, tf.get(t) * PROPER_BOOST);
  return tf;
}

function normalizeVec(vec) {
  let norm = 0;
  for (const v of vec.values()) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (const [k, v] of vec) vec.set(k, v / norm);
  return vec;
}

function cosine(a, b) {
  if (a.size > b.size) [a, b] = [b, a];
  let dot = 0;
  for (const [k, v] of a) { const w = b.get(k); if (w) dot += v * w; }
  return dot;
}

export function buildVectors(articles) {
  const tfs = articles.map(termFrequencies);
  const df = new Map();
  for (const tf of tfs) for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const n = articles.length;
  return tfs.map((tf) => {
    const vec = new Map();
    // Les termes uniques (df = 1) restent dans le vecteur : ils ne relient rien,
    // mais pèsent dans la norme et évitent qu'un seul mot commun suffise.
    for (const [t, f] of tf) vec.set(t, (1 + Math.log(f)) * Math.log(1 + n / df.get(t)));
    const top = [...vec.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_TERMS);
    return normalizeVec(new Map(top));
  });
}

export function clusterArticles(articles, opts = {}) {
  const edgeThreshold = opts.edgeThreshold ?? 0.2;
  const mergeThreshold = opts.mergeThreshold ?? 0.12;
  const maxGapHours = opts.maxGapHours ?? 60;
  const vectors = buildVectors(articles);
  const times = articles.map((a) => Date.parse(a.published) || 0);

  // Index inversé sur les termes les plus discriminants de chaque article.
  const index = new Map();
  const df = new Map();
  for (const vec of vectors) for (const t of vec.keys()) df.set(t, (df.get(t) || 0) + 1);
  vectors.forEach((vec, i) => {
    const top = [...vec.entries()].filter(([t]) => df.get(t) > 1).sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [t] of top) {
      if (!index.has(t)) index.set(t, []);
      index.get(t).push(i);
    }
  });

  const edges = [];
  const seen = new Set();
  for (const posting of index.values()) {
    if (posting.length > 400) continue; // terme trop générique
    for (let x = 0; x < posting.length; x++) {
      for (let y = x + 1; y < posting.length; y++) {
        const i = posting[x], j = posting[y];
        const key = i < j ? i * 1e6 + j : j * 1e6 + i;
        if (seen.has(key)) continue;
        seen.add(key);
        if (articles[i].sourceId === articles[j].sourceId && articles[i].title === articles[j].title) {
          edges.push([i, j, 1]);
          continue;
        }
        let shared = 0;
        for (const t of vectors[i].keys()) if (vectors[j].has(t)) shared++;
        if (shared < 2) continue;
        let sim = cosine(vectors[i], vectors[j]);
        const gap = Math.abs(times[i] - times[j]) / 3.6e6;
        if (gap > maxGapHours) sim *= 0.75;
        if (sim >= edgeThreshold) edges.push([i, j, sim]);
      }
    }
  }
  edges.sort((a, b) => b[2] - a[2]);

  const parent = articles.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const centroid = new Map(vectors.map((v, i) => [i, new Map(v)]));
  const members = new Map(articles.map((_, i) => [i, [i]]));

  // Liaison moyenne : similarité moyenne entre toutes les paires des deux groupes,
  // calculée via les sommes de vecteurs. Plus stricte que le cosinus des
  // centroïdes, elle empêche un sujet large (« Trump ») d'aspirer tout le reste.
  const averageLink = (a, b) => cosine(centroid.get(a), centroid.get(b)) / (members.get(a).length * members.get(b).length);

  for (const [i, j, sim] of edges) {
    const a = find(i), b = find(j);
    if (a === b) continue;
    const small = members.get(a).length === 1 && members.get(b).length === 1;
    if (!small && averageLink(a, b) < mergeThreshold && sim < 0.6) continue;
    const [keep, drop] = members.get(a).length >= members.get(b).length ? [a, b] : [b, a];
    parent[drop] = keep;
    const ck = centroid.get(keep);
    for (const [t, v] of centroid.get(drop)) ck.set(t, (ck.get(t) || 0) + v);
    members.get(keep).push(...members.get(drop));
    members.delete(drop);
    centroid.delete(drop);
  }

  return [...members.entries()].map(([root, idx]) => {
    const c = centroid.get(root);
    let norm = 0;
    for (const v of c.values()) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    // Centralité : l'article le plus proche du centroïde représente l'histoire.
    const centrality = idx.map((i) => cosine(vectors[i], c) / norm);
    const keywords = [...c.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([t]) => t);
    return { members: idx, centrality, keywords };
  });
}
