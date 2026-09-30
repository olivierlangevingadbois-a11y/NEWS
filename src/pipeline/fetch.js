import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ['item', 'entry', 'link', 'media:content', 'media:thumbnail', 'enclosure', 'category'].includes(name),
});

const UA = 'Mozilla/5.0 (compatible; PrismeNews/1.0; +https://github.com/olivierlangevingadbois-a11y/NEWS)';

function text(v) {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text'] ?? v['@href'] ?? '');
  return '';
}

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' };

export function cleanHtml(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITY[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function firstImage(item, rawDescription) {
  const media = [...(item['media:content'] || []), ...(item['media:thumbnail'] || []), ...(item.enclosure || [])];
  for (const m of media) {
    const url = m['@url'];
    const type = m['@type'] || m['@medium'] || '';
    if (url && (!type || /image/.test(type))) return url;
  }
  if (item['media:group']) {
    const g = item['media:group'];
    const c = [].concat(g['media:content'] || [], g['media:thumbnail'] || []);
    if (c[0]?.['@url']) return c[0]['@url'];
  }
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(rawDescription || '');
  return m ? m[1] : null;
}

function itemLink(item) {
  const links = item.link || [];
  for (const l of links) {
    if (typeof l === 'string') return l.trim();
    if (l['@href'] && (!l['@rel'] || l['@rel'] === 'alternate')) return l['@href'];
  }
  const guid = text(item.guid);
  return /^https?:/.test(guid) ? guid : '';
}

// Une date illisible ne doit pas faire échouer tout le flux : l'article sera daté à sa première lecture.
function toIso(date) {
  const d = date ? new Date(date) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

export function parseFeed(xml) {
  const doc = parser.parse(xml);
  const channel = doc.rss?.channel || doc['rdf:RDF']?.channel || doc.feed || {};
  const items = doc.rss?.channel?.item || doc['rdf:RDF']?.item || doc.feed?.entry || channel.item || [];
  return items.map((item) => {
    const rawDesc = text(item['content:encoded']) || text(item.description) || text(item.summary) || text(item.content);
    const date = text(item.pubDate) || text(item['dc:date']) || text(item.published) || text(item.updated);
    return {
      title: cleanHtml(text(item.title)),
      url: itemLink(item),
      description: cleanHtml(text(item.description) || text(item.summary) || rawDesc).slice(0, 600),
      published: toIso(date),
      image: firstImage(item, rawDesc),
    };
  }).filter((a) => a.title && a.url);
}

// Retire les paramètres de pistage pour que la même URL ne soit comptée qu'une fois.
export function canonicalUrl(url) {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|cmp|ito|xtor|at_)/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchText(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Récupère tous les flux avec une concurrence bornée. Un flux en échec n'arrête
// jamais la construction : il est consigné dans le rapport de santé.
export async function fetchAll(sources, { concurrency = 12, timeoutMs = 15000, loadFixture } = {}) {
  const jobs = sources.flatMap((source) => source.feeds.map((feed) => ({ source, feed })));
  const health = [];
  const articles = [];
  let next = 0;

  async function worker() {
    while (next < jobs.length) {
      const { source, feed } = jobs[next++];
      const started = Date.now();
      try {
        const xml = loadFixture ? await loadFixture(source, feed) : await fetchText(feed.url, timeoutMs);
        if (xml == null) continue;
        const items = parseFeed(xml);
        for (const item of items) articles.push({ ...item, sourceId: source.id, feedRegion: feed.region || null, feedTopic: feed.topic || null });
        health.push({ sourceId: source.id, url: feed.url, ok: true, items: items.length, ms: Date.now() - started });
      } catch (err) {
        health.push({ sourceId: source.id, url: feed.url, ok: false, error: String(err.message || err).slice(0, 160), ms: Date.now() - started });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return { articles, health };
}
