import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterArticles } from '../src/pipeline/cluster.js';
import { buildStory } from '../src/pipeline/analyze.js';
import { articleMentions } from '../src/pipeline/places.js';
import { tagArticle } from '../src/pipeline/geo.js';

// Cas signalé : un cessez-le-feu annoncé trois jours plus tôt restait en tête,
// parce que les nouveaux articles sur l'Ukraine rejoignaient la même histoire.
const now = Date.parse('2026-10-12T22:00:00Z');
const sourcesById = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`s${i}`, {
  id: `s${i}`, country: i % 2 ? 'FR' : 'GB', bias: 0, fact: 'high', own: { type: 'private' }, paywall: 'free',
}]));
const article = (k, hoursAgo, title, description, lang = 'fr') => {
  const a = {
    sourceId: `s${k}`, title, description, lang, url: `https://e.x/${k}/${hoursAgo}/${title.length}`,
    published: new Date(now - hoursAgo * 3.6e6).toISOString(), image: null, feedRegion: 'world',
    tone: { level: 0 }, topics: [],
  };
  a.mentions = articleMentions(a);
  return a;
};
const ceasefire = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => article(k, 56 + k / 2,
  'Guerre en Ukraine : Trump annonce un cessez-le-feu énergétique entre Kyiv et Moscou',
  'Le président américain affirme que la Russie et l’Ukraine cesseront de frapper les infrastructures énergétiques.'));
const followUp = [8, 9, 10].map((k) => article(k, 1 + k / 10,
  'Guerre en Ukraine : la Russie frappe Kyiv malgré le cessez-le-feu énergétique annoncé par Trump',
  'Des missiles russes ont visé des centrales électriques ukrainiennes, selon Kyiv, qui accuse Moscou de violer la trêve.'));
const fresh = [0, 2, 4, 6].map((k) => article(k, 2 + k / 10,
  'Séisme au Panama : d’importants dégâts et des dizaines de blessés',
  'Un puissant tremblement de terre a frappé le Panama, endommageant routes et bâtiments.'));

function stories(articles) {
  const tags = articles.map((a) => tagArticle(a, sourcesById[a.sourceId]));
  return clusterArticles(articles).map((c) => buildStory(c, articles, sourcesById, tags, now)).sort((a, b) => b.score - a.score);
}

const otherEvent = [8, 9, 10].map((k) => article(k, 1 + k / 10,
  'Guerre en Ukraine : Zelensky limoge le chef de l’armée à Kyiv',
  'Le président ukrainien remplace le commandant en chef face à l’offensive russe dans l’est de l’Ukraine.'));
const ids = (list) => new Set(list.map((a) => a.url));

test('un autre événement sur le même sujet, trois jours plus tard, forme sa propre histoire', () => {
  const old = ids(ceasefire), other = ids(otherEvent);
  const withOld = stories([...ceasefire, ...otherEvent]).find((s) => s.articles.some((a) => old.has(a.url)));
  assert.ok(!withOld.articles.some((a) => other.has(a.url)), 'le nouvel événement a rejoint la vieille histoire');
});

test('une nouvelle du jour passe devant une histoire de plusieurs jours', () => {
  const old = ids(ceasefire);
  const ranked = stories([...ceasefire, ...followUp, ...fresh]);
  const at = ranked.findIndex((s) => s.articles.some((a) => old.has(a.url)));
  const quake = ranked.findIndex((s) => s.title.includes('Panama'));
  assert.ok(quake < at, `séisme ${quake + 1}e, cessez-le-feu ${at + 1}e`);
  // Si la suite du jour rejoint l'histoire, c'est elle qui donne le titre.
  if (ranked[at].sourceCount > ceasefire.length) assert.match(ranked[at].title, /malgré/);
});

test('le titre d’une histoire suivie sur deux jours montre son développement récent', () => {
  // Même événement, articles de la veille et du jour : un seul groupe, titre du jour.
  const day1 = [0, 1, 2, 3].map((k) => article(k, 20 + k / 2, 'Panama : un puissant séisme frappe le pays', 'Un séisme de magnitude 7 a secoué le Panama, des routes sont coupées.'));
  const day2 = [4, 5].map((k) => article(k, 1, 'Séisme au Panama : le bilan s’alourdit à 40 morts', 'Les secours du Panama poursuivent leurs recherches après le séisme.'));
  const [story] = stories([...day1, ...day2]);
  assert.equal(story.sourceCount, 6);
  assert.match(story.title, /bilan/);
});
