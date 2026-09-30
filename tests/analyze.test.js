import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blindspot, biasBucket } from '../src/pipeline/analyze.js';
import { tagArticle, clusterRegions } from '../src/pipeline/geo.js';
import { scoreTone } from '../src/pipeline/tone.js';
import { reuseCached, summarize } from '../src/pipeline/summarize.js';

const b = (o) => ({ left: 0, cleft: 0, center: 0, cright: 0, right: 0, state: 0, unrated: 0, ...o });

test('angles morts', () => {
  assert.equal(blindspot(b({ left: 2, cleft: 2, center: 3 })), 'right');
  assert.equal(blindspot(b({ right: 3, cright: 1 })), 'left');
  assert.equal(blindspot(b({ left: 6, cright: 1 })), 'right', '1 sur 7 = moins de 15 %');
  assert.equal(blindspot(b({ left: 3, right: 2 })), null);
  assert.equal(blindspot(b({ center: 8 })), null);
});

test("médias d'État hors de l'axe gauche-droite", () => {
  assert.equal(biasBucket({ bias: null, own: { type: 'state' } }), 'state');
  assert.equal(biasBucket({ bias: -1, own: { type: 'public' } }), 'cleft');
});

test('géo-étiquetage : le Canada dans le monde', () => {
  const scores = tagArticle({ title: "Trump impose des droits de douane sur l'acier canadien", description: 'Ottawa promet de riposter.' }, { country: 'QC' });
  assert.ok(scores.canada > 0 && scores.us > 0);
  assert.deepEqual(clusterRegions([scores, { canada: 2 }]).primary, 'canada');
});

test('un média local sans lieu nommé parle de chez lui', () => {
  assert.deepEqual(tagArticle({ title: "Le prix de l'essence grimpe", description: '' }, { country: 'QC' }), { quebec: 1 });
});

test("« Jordan Bardella » n'est pas la Jordanie", () => {
  const s = tagArticle({ title: 'Jordan Bardella en tête des sondages', description: 'Le RN domine en France', feedRegion: 'world' }, { country: 'FR' });
  assert.deepEqual(Object.keys(s), ['europe']);
});

test('ton des titres', () => {
  assert.equal(scoreTone('Le gouvernement dépose son budget').level, 0);
  assert.equal(scoreTone('Trump SLAMS Carney in explosive tirade!').level, 2);
  assert.equal(scoreTone('La crise du logement s’aggrave').level, 0);
});

test('résumés : réutilisation du cache et appel unique par histoire', async () => {
  const sourcesById = { a: { name: 'A', bias: 0, country: 'QC', own: { type: 'public' } } };
  const story = { id: 's1', title: 'T', score: 1, sourceCount: 4, articles: [{ url: 'u1', source: 'a', title: 'x', excerpt: '' }, { url: 'u2', source: 'a', title: 'y', excerpt: '' }] };
  const payload = { titre: 'T', resume: 'R', points: [], angles: { gauche: '', centre: '', droite: '' }, divergences: '', quebec: '' };
  let calls = 0;
  const client = { beta: { messages: { create: async (req) => {
    calls++;
    assert.equal(req.output_config.format.type, 'json_schema');
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(payload) }] };
  } } } };
  const cache = {};
  await summarize([story], sourcesById, cache, { client, log: () => {} });
  assert.equal(calls, 1);
  assert.equal(story.summary.resume, 'R');

  const again = { ...story, id: 'autre-id', summary: null };
  await summarize([again], sourcesById, cache, { client, log: () => {} });
  assert.equal(calls, 1, 'même couverture : pas de nouvel appel');
  assert.equal(again.summary.resume, 'R');
});

test('résumés : une couverture qui a beaucoup grandi est marquée à régénérer', () => {
  const cache = { k: { urls: ['u1', 'u2', 'u3'], sourceCount: 3, summary: { resume: 'R' } } };
  const story = { articles: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((url) => ({ url })), sourceCount: 6 };
  reuseCached([story], cache);
  assert.equal(story._summaryStale, true);
});
