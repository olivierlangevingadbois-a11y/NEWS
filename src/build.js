#!/usr/bin/env node
// Construit le site statique : récupère les flux, regroupe les articles en
// histoires, calcule la couverture et écrit dist/. Lancé toutes les 20 min
// par GitHub Actions (voir .github/workflows/update.yml).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAll, canonicalUrl } from './pipeline/fetch.js';
import { detectLanguage } from './pipeline/text.js';
import { tagArticle, REGIONS } from './pipeline/geo.js';
import { scoreTone } from './pipeline/tone.js';
import { tagTopics, TOPICS } from './pipeline/topics.js';
import { clusterArticles } from './pipeline/cluster.js';
import { buildStory } from './pipeline/analyze.js';
import { summarize, pruneCache } from './pipeline/summarize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const STATE = path.join(ROOT, 'state');
const WINDOW_HOURS = Number(process.env.PRISME_WINDOW_HOURS || 72);
const DEMO = process.argv.includes('--fixtures');

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
};

function loadDemoArticles(sourcesById) {
  const { articles } = readJson(path.join(ROOT, 'tests/fixtures/articles.json'), { articles: [] });
  const now = Date.now();
  return articles.map((a, i) => ({
    title: a.t,
    description: a.d,
    url: `${sourcesById[a.s].site}?demo=${i}`,
    published: new Date(now - a.h * 3.6e6).toISOString(),
    image: null,
    sourceId: a.s,
    feedRegion: sourcesById[a.s].feeds[0]?.region || null,
    feedTopic: sourcesById[a.s].feeds[0]?.topic || null,
  }));
}

async function main() {
  const started = Date.now();
  const now = Date.now();
  const { sources } = readJson(process.env.PRISME_SOURCES || path.join(ROOT, 'config/sources.json'), { sources: [] });
  const sourcesById = Object.fromEntries(sources.map((s) => [s.id, s]));

  // 1. Récupération
  let fetched, health;
  if (DEMO) {
    fetched = loadDemoArticles(sourcesById);
    health = sources.flatMap((s) => s.feeds.map((f) => ({ sourceId: s.id, url: f.url, ok: true, items: 0, ms: 0 })));
    console.log(`Mode démo : ${fetched.length} articles fictifs`);
  } else {
    ({ articles: fetched, health } = await fetchAll(sources));
    const ok = health.filter((h) => h.ok).length;
    console.log(`Flux : ${ok}/${health.length} OK, ${fetched.length} articles en ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }

  // 2. Fusion avec l'état précédent (les flux ne gardent que les derniers items)
  const state = DEMO ? { articles: [] } : readJson(path.join(STATE, 'articles.json'), { articles: [] });
  const cutoff = now - WINDOW_HOURS * 3.6e6;
  const byUrl = new Map();
  for (const a of state.articles) if (Date.parse(a.published) >= cutoff && sourcesById[a.sourceId]) byUrl.set(a.url, a);
  for (const raw of fetched) {
    const url = canonicalUrl(raw.url);
    const prev = byUrl.get(url);
    let published = Date.parse(raw.published);
    if (!Number.isFinite(published)) published = prev ? Date.parse(prev.published) : now;
    published = Math.min(published, now);
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

  for (const a of articles) {
    const source = sourcesById[a.sourceId];
    const text = `${a.title} ${a.description}`;
    a.lang = (text.split(/\s+/).length >= 8 && detectLanguage(text)) || source.lang;
    a.topics = tagTopics(a);
    a.tone = scoreTone(a.title, { disaster: a.topics.includes('disaster') });
  }

  // 3. Regroupement et analyse
  const regionScores = articles.map((a) => tagArticle(a, sourcesById[a.sourceId]));
  const clusters = clusterArticles(articles);
  let stories = clusters.map((c) => buildStory(c, articles, sourcesById, regionScores, now));
  stories.sort((a, b) => b.score - a.score);

  // Histoires multi-sources + brèves récentes par région et par thème (les
  // découvertes scientifiques n'ont souvent qu'une source).
  const multi = stories.filter((s) => s.sourceCount >= 2);
  const singles = stories.filter((s) => s.sourceCount === 1).sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));
  const briefs = [...new Set([
    ...REGIONS.flatMap((r) => singles.filter((s) => s.region === r).slice(0, 25)),
    ...TOPICS.flatMap((t) => singles.filter((s) => s.topics.includes(t)).slice(0, 40)),
  ])];
  stories = [...multi, ...briefs];

  // 4. Résumés IA (optionnels)
  const summaryCache = DEMO ? {} : readJson(path.join(STATE, 'summaries.json'), {});
  const ai = await summarize(multi, sourcesById, summaryCache, {
    limit: Number(process.env.PRISME_AI_LIMIT || 8),
    minSources: Number(process.env.PRISME_AI_MIN_SOURCES || 4),
    model: process.env.PRISME_MODEL || 'claude-opus-5-5',
  });
  for (const s of stories) delete s._summaryStale;
  pruneCache(summaryCache, multi);

  // 5. Écriture
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });

  const prevHealth = readJson(path.join(STATE, 'health.json'), {});
  const healthByUrl = {};
  for (const h of health) {
    healthByUrl[h.url] = { ...h, lastOk: h.ok ? new Date(now).toISOString() : prevHealth[h.url]?.lastOk || null };
  }
  const publicSources = sources.map(({ feeds, ...s }) => ({
    ...s,
    feeds: feeds.map((f) => ({ url: f.url, ok: healthByUrl[f.url]?.ok ?? null, items: healthByUrl[f.url]?.items ?? 0, error: healthByUrl[f.url]?.error, lastOk: healthByUrl[f.url]?.lastOk })),
    articles: articles.filter((a) => a.sourceId === s.id).length,
  }));

  const meta = {
    generated: new Date(now).toISOString(),
    demo: DEMO,
    windowHours: WINDOW_HOURS,
    articleCount: articles.length,
    storyCount: multi.length,
    sourceCount: sources.length,
    feeds: { ok: health.filter((h) => h.ok).length, total: health.length },
    ai: { enabled: Boolean(process.env.ANTHROPIC_API_KEY), generated: ai.generated, summarized: multi.filter((s) => s.summary?.ai).length },
    buildSeconds: +((Date.now() - started) / 1000).toFixed(1),
  };

  writeJson(path.join(DIST, 'data/stories.json'), { generated: meta.generated, stories });
  writeJson(path.join(DIST, 'data/sources.json'), { generated: meta.generated, sources: publicSources });
  writeJson(path.join(DIST, 'data/meta.json'), meta);

  if (!DEMO) {
    writeJson(path.join(STATE, 'articles.json'), { articles: articles.map(({ tone, lang, topics, ...a }) => a) });
    writeJson(path.join(STATE, 'summaries.json'), summaryCache);
    writeJson(path.join(STATE, 'health.json'), healthByUrl);
  }

  console.log(`${multi.length} histoires multi-sources, ${briefs.length} brèves, ${meta.ai.generated} résumés IA générés, ${meta.buildSeconds} s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
