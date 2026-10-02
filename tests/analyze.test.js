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
  const tag = tagArticle({ title: "Trump impose des droits de douane sur l'acier canadien", description: 'Ottawa promet de riposter.' }, { country: 'QC' });
  assert.ok(tag.scores.canada > 0 && tag.scores.us > 0);
  assert.equal(clusterRegions([tag, { scores: { canada: 2 }, weak: false }]).primary, 'canada');
});

test('un média local sans lieu nommé parle de chez lui', () => {
  assert.deepEqual(tagArticle({ title: "Le prix de l'essence grimpe", description: '' }, { country: 'QC' }), { scores: { quebec: 1 }, weak: true });
});

test("« Jordan Bardella » n'est pas la Jordanie", () => {
  const { scores } = tagArticle({ title: 'Jordan Bardella en tête des sondages', description: 'Le RN domine en France', feedRegion: 'world' }, { country: 'FR' });
  assert.deepEqual(Object.keys(scores), ['europe']);
});

// Cas signalés : la rubrique du flux ou un mot secondaire décidait de la section.
const regionsOf = (articles) => clusterRegions(articles.map(([a, src]) => tagArticle(a, src))).regions;
const abc = { country: 'AU' };

test('la rubrique du flux ne l’emporte pas sur un lieu cité', () => {
  assert.deepEqual(regionsOf([
    [{ title: 'Manchester City to appeal after being found guilty', description: 'The Premier League club says it is innocent.', feedRegion: 'oceania' }, abc],
    [{ title: '« Le club est innocent » : Manchester City fait appel', description: '', feedRegion: 'world' }, { country: 'FR' }],
  ]), ['europe']);
  assert.deepEqual(regionsOf([
    [{ title: 'Le Brésil mise sur le solaire et l’éolien', description: 'Brasilia veut doubler sa production d’énergie renouvelable.', feedRegion: 'africa' }, { country: 'ZA' }],
  ]), []);
});

test('un mot secondaire ne déplace pas une histoire', () => {
  assert.deepEqual(regionsOf([
    [{ title: 'Incendie au lycée Nelson-Mandela de Nantes', description: 'L’établissement porte le nom du héros de la lutte anti-apartheid sud-africaine.', feedRegion: 'world' }, { country: 'FR' }],
    [{ title: 'Nantes : un lycée ravagé par les flammes', description: 'Les élèves seront accueillis ailleurs.', feedRegion: 'world' }, { country: 'FR' }],
  ]), ['europe']);
});

test('les indices faibles ne comptent que si personne ne cite de lieu', () => {
  assert.deepEqual(regionsOf([
    [{ title: 'OpenAI dévoile un nouveau modèle', description: '', feedRegion: 'oceania' }, abc],
    [{ title: 'OpenAI unveils new model at San Francisco event', description: '', feedRegion: 'world' }, { country: 'US' }],
  ]), ['us']);
  assert.deepEqual(regionsOf([[{ title: 'OpenAI dévoile un nouveau modèle', description: '', feedRegion: 'oceania' }, abc]]), ['oceania']);
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
