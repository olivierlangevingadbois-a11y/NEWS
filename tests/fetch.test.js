import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, cleanHtml, canonicalUrl, fetchAll } from '../src/pipeline/fetch.js';

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>T</title>
<item><title><![CDATA[Hausse des tarifs d&#8217;Hydro-Québec]]></title><link>https://ex.ca/a?utm_source=rss</link>
<description><![CDATA[<p>La société d'État <b>demande</b> 3&nbsp;%.</p><img src="https://ex.ca/i.jpg">]]></description>
<pubDate>Tue, 29 Sep 2026 14:00:00 GMT</pubDate><media:content url="https://ex.ca/m.jpg" medium="image"/></item>
<item><title>Sans lien</title></item></channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
<entry><title>Atom story</title><link rel="alternate" href="https://ex.com/b"/><updated>2026-09-29T10:00:00Z</updated><summary>Short &amp; sweet</summary></entry></feed>`;

const RDF = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>R</title></channel><item><title>RDF story</title><link>https://ex.de/c</link><dc:date>2026-09-29T08:00:00Z</dc:date></item></rdf:RDF>`;

test('RSS 2.0 : titre, lien, image, date, HTML nettoyé', () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 1, "l'item sans lien est ignoré");
  assert.equal(items[0].title, 'Hausse des tarifs d’Hydro-Québec');
  assert.equal(items[0].description, "La société d'État demande 3 %.");
  assert.equal(items[0].image, 'https://ex.ca/m.jpg');
  assert.equal(items[0].published, '2026-09-29T14:00:00.000Z');
});

test('Atom et RDF', () => {
  assert.equal(parseFeed(ATOM)[0].url, 'https://ex.com/b');
  assert.equal(parseFeed(ATOM)[0].description, 'Short & sweet');
  assert.equal(parseFeed(RDF)[0].url, 'https://ex.de/c');
});

test('cleanHtml retire les scripts', () => {
  assert.equal(cleanHtml('<script>alert(1)</script>Bonjour <i>toi</i>'), 'Bonjour toi');
});

test("canonicalUrl retire le pistage mais garde l'identifiant", () => {
  assert.equal(canonicalUrl('https://ex.ca/a?id=4&utm_source=rss&fbclid=x#top'), 'https://ex.ca/a?id=4');
});

test('un flux en échec est consigné sans interrompre les autres', async () => {
  const sources = [{ id: 'ok', feeds: [{ url: 'ok' }] }, { id: 'ko', feeds: [{ url: 'ko' }] }];
  const { articles, health } = await fetchAll(sources, {
    loadFixture: async (s) => { if (s.id === 'ko') throw new Error('HTTP 404'); return RSS; },
  });
  assert.equal(articles.length, 1);
  assert.equal(health.find((h) => h.sourceId === 'ko').ok, false);
});

test('une date illisible ne fait pas échouer le flux', () => {
  const xml = RSS.replace('Tue, 29 Sep 2026 14:00:00 GMT', 'hier soir');
  assert.equal(parseFeed(xml)[0].published, null);
});
