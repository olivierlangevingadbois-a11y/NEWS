import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { clusterArticles } from '../src/pipeline/cluster.js';

const { articles: fixtures } = JSON.parse(fs.readFileSync(new URL('./fixtures/articles.json', import.meta.url), 'utf8'));
const now = Date.parse('2026-09-30T12:00:00Z');
const articles = fixtures.map((a, i) => ({
  sourceId: a.s, title: a.t, description: a.d, story: a.story, url: `u${i}`,
  published: new Date(now - a.h * 3.6e6).toISOString(),
}));

test('regroupe les histoires en français et en anglais sans les mélanger', () => {
  const clusters = clusterArticles(articles);
  const label = [];
  clusters.forEach((c, k) => c.members.forEach((i) => { label[i] = k; }));
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const same = articles[i].story === articles[j].story;
      const together = label[i] === label[j];
      if (same && together) tp++; else if (together) fp++; else if (same) fn++;
    }
  }
  const precision = tp / (tp + fp), recall = tp / (tp + fn);
  assert.ok(precision >= 0.95, `précision ${precision.toFixed(3)}`);
  assert.ok(recall >= 0.9, `rappel ${recall.toFixed(3)}`);
});

test("chaque histoire bilingue réunit ses articles FR et EN", () => {
  const clusters = clusterArticles(articles);
  for (const story of ['qc-debat', 'acier', 'kyiv', 'soudan', 'ouragan']) {
    const idx = articles.map((a, i) => (a.story === story ? i : -1)).filter((i) => i >= 0);
    const owner = clusters.find((c) => c.members.includes(idx[0]));
    assert.ok(idx.every((i) => owner.members.includes(i)), `${story} est scindée`);
  }
});

test("un vocabulaire commun ne crée pas un méga-regroupement", () => {
  const vocab = fixtures.flatMap((a) => `${a.t} ${a.d}`.split(/\s+/));
  let seed = 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const words = (n) => Array.from({ length: n }, () => vocab[Math.floor(rand() * vocab.length)]).join(' ');
  const noise = Array.from({ length: 1200 }, (_, i) => ({
    sourceId: `s${i % 60}`, title: words(10), description: words(30), url: `n${i}`,
    published: new Date(now - rand() * 72 * 3.6e6).toISOString(),
  }));
  const largest = Math.max(...clusterArticles(noise).map((c) => c.members.length));
  assert.ok(largest < noise.length * 0.1, `plus gros groupe : ${largest}`);
});
