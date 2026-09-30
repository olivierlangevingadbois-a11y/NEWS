import { createHash } from 'node:crypto';
import { clusterRegions } from './geo.js';
import { clusterTopics } from './topics.js';

export const FACT_SCORE = { 'very-high': 5, high: 4, mostly: 3, mixed: 2, low: 1 };
const BUCKETS = ['left', 'cleft', 'center', 'cright', 'right'];

export function biasBucket(source) {
  if (source.bias == null) return source.own?.type === 'state' ? 'state' : 'unrated';
  if (source.bias <= -2) return 'left';
  if (source.bias === -1) return 'cleft';
  if (source.bias === 0) return 'center';
  if (source.bias === 1) return 'cright';
  return 'right';
}

const shortHash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);

function excerpt(s, n = 240) {
  if (!s || s.length <= n) return s || '';
  const cut = s.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 30))}…`;
}

// Angle mort : une histoire largement couverte d'un côté du spectre et
// presque ignorée de l'autre. Le centre ne compte pas dans le ratio.
export function blindspot(bias) {
  const L = bias.left + bias.cleft;
  const R = bias.right + bias.cright;
  if (L >= 3 && (R === 0 || (L + R >= 6 && R / (L + R) <= 0.15))) return 'right';
  if (R >= 3 && (L === 0 || (L + R >= 6 && L / (L + R) <= 0.15))) return 'left';
  return null;
}

export function buildStory(cluster, articles, sourcesById, regionScores, now) {
  const items = cluster.members.map((i, k) => ({ a: articles[i], centrality: cluster.centrality[k], geo: regionScores[i] }));
  const bySource = new Map();
  for (const it of items) {
    const prev = bySource.get(it.a.sourceId);
    if (!prev || it.centrality > prev.centrality) bySource.set(it.a.sourceId, it);
  }
  const unique = [...bySource.values()];
  const sources = unique.map((it) => sourcesById[it.a.sourceId]);

  const bias = Object.fromEntries([...BUCKETS, 'state', 'unrated'].map((b) => [b, 0]));
  const langs = { fr: 0, en: 0 };
  const origins = {};
  const ownership = {};
  const paywall = { free: 0, metered: 0, hard: 0 };
  let factSum = 0;
  for (const s of sources) {
    bias[biasBucket(s)]++;
    origins[s.country] = (origins[s.country] || 0) + 1;
    ownership[s.own.type] = (ownership[s.own.type] || 0) + 1;
    paywall[s.paywall]++;
    factSum += FACT_SCORE[s.fact] || 3;
  }
  for (const it of unique) langs[it.a.lang] = (langs[it.a.lang] || 0) + 1;

  const { primary, regions, weights } = clusterRegions(items.map((it) => it.geo));
  const { topics, subtopics } = clusterTopics(items.map((it) => it.a.topics));

  // Deux solitudes : couverture canadienne entièrement dans une seule langue.
  const canadian = unique.filter((it) => ['QC', 'CA'].includes(sourcesById[it.a.sourceId].country));
  const caFr = canadian.filter((it) => it.a.lang === 'fr').length;
  const caEn = canadian.length - caFr;
  const domestic = regions.some((r) => r === 'quebec' || r === 'canada');
  const solitude = domestic && canadian.length >= 3 && (caFr === 0 || caEn === 0) ? (caFr === 0 ? 'en' : 'fr') : null;
  const foreign = domestic ? sources.filter((s) => !['QC', 'CA'].includes(s.country)).length : 0;

  // Titre représentatif : central, en français si possible, fiable et au ton neutre.
  const rank = (it) => {
    const s = sourcesById[it.a.sourceId];
    return it.centrality + (it.a.lang === 'fr' ? 0.35 : 0) + ((FACT_SCORE[s.fact] || 3) >= 4 ? 0.1 : 0)
      + (s.bias === 0 ? 0.08 : 0) - 0.25 * it.a.tone.level;
  };
  const lead = [...unique].sort((x, y) => rank(y) - rank(x))[0].a;
  const withImage = [lead, ...unique.map((it) => it.a)].find((a) => a.image);

  const times = items.map((it) => Date.parse(it.a.published));
  const first = Math.min(...times);
  const updated = Math.max(...times);
  const earliest = items.find((it) => Date.parse(it.a.published) === first).a;

  // Ton des titres par camp : révèle le cadrage, pas seulement la couverture.
  const toneBySide = {};
  for (const side of ['left', 'center', 'right']) {
    const group = unique.filter((it) => {
      const b = biasBucket(sourcesById[it.a.sourceId]);
      return side === 'left' ? b === 'left' || b === 'cleft' : side === 'right' ? b === 'right' || b === 'cright' : b === 'center';
    });
    if (group.length) toneBySide[side] = Math.round((100 * group.filter((it) => it.a.tone.level > 0).length) / group.length);
  }

  const hoursOld = (now - updated) / 3.6e6;
  const regionBoost = primary === 'quebec' ? 1.3 : primary === 'canada' ? 1.12 : 1;
  const score = (Math.log2(1 + unique.length) * 10 + Math.min(items.length, 30) * 0.3) * Math.pow(0.5, hoursOld / 16) * regionBoost;

  const firstUrl = [...items].sort((x, y) => Date.parse(x.a.published) - Date.parse(y.a.published) || x.a.url.localeCompare(y.a.url))[0].a.url;

  return {
    id: shortHash(firstUrl),
    title: lead.title,
    lang: lead.lang,
    lead: excerpt(lead.description, 320),
    leadSource: lead.sourceId,
    image: withImage?.image || null,
    firstSeen: new Date(first).toISOString(),
    updated: new Date(updated).toISOString(),
    firstBy: earliest.sourceId,
    region: primary,
    regions,
    regionWeights: weights,
    topics,
    subtopics,
    keywords: cluster.keywords,
    sourceCount: unique.length,
    articleCount: items.length,
    bias,
    blindspot: blindspot(bias),
    solitude,
    foreign,
    langs,
    origins,
    ownership,
    paywall,
    factuality: +(factSum / sources.length).toFixed(2),
    toneBySide,
    score: +score.toFixed(3),
    summary: null,
    articles: unique
      .sort((x, y) => Date.parse(x.a.published) - Date.parse(y.a.published))
      .map(({ a }) => ({ title: a.title, url: a.url, source: a.sourceId, lang: a.lang, published: a.published, excerpt: excerpt(a.description), tone: a.tone.level, loaded: a.tone.hits })),
  };
}
