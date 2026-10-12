import { canonicalUrl } from './fetch.js';

// Fusionne les articles récupérés avec l'état précédent : les flux ne gardent que
// leurs derniers items, l'état garde les 72 dernières heures.
export function mergeArticles(stateArticles, fetched, { now, windowHours, sourcesById }) {
  const cutoff = now - windowHours * 3.6e6;
  const byUrl = new Map();
  for (const a of stateArticles) if (Date.parse(a.published) >= cutoff && sourcesById[a.sourceId]) byUrl.set(a.url, a);
  let redated = 0;
  for (const raw of fetched) {
    const url = canonicalUrl(raw.url);
    const prev = byUrl.get(url);
    let published = Date.parse(raw.published);
    if (!Number.isFinite(published)) published = prev ? Date.parse(prev.published) : now;
    published = Math.min(published, now);
    // Un média qui modifie un article change souvent sa date dans le flux : on garde
    // la première, sinon un article de lundi redevient « frais » mercredi.
    if (prev && Date.parse(prev.published) < published) {
      if (published - Date.parse(prev.published) > 3.6e6) redated++;
      published = Date.parse(prev.published);
    }
    if (published < cutoff) continue;
    byUrl.set(url, { ...raw, url, published: new Date(published).toISOString() });
  }
  // Même titre, même source (republication sous une autre URL) : on garde un seul exemplaire.
  const seenTitles = new Set();
  const articles = [...byUrl.values()]
    .sort((a, b) => Date.parse(a.published) - Date.parse(b.published))
    .filter((a) => {
      const key = `${a.sourceId}|${a.title.toLowerCase()}`;
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });
  return { articles, redated };
}
