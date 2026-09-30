import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagTopics, clusterTopics } from '../src/pipeline/topics.js';
import { scoreTone } from '../src/pipeline/tone.js';

const tag = (title, description = '', feedTopic = null) => tagTopics({ title, description, feedTopic });

test('sciences, espace, IA et catastrophes en français et en anglais', () => {
  assert.deepEqual(tag("Le télescope James-Webb détecte de la vapeur d'eau sur une exoplanète"), ['science', 'space']);
  assert.deepEqual(tag("Québec encadre l'utilisation de l'IA générative dans les écoles"), ['ai']);
  assert.deepEqual(tag('OpenAI unveils new model as AI race heats up'), ['ai']);
  assert.deepEqual(tag('Séisme de magnitude 7,1 au Japon : alerte au tsunami'), ['environment', 'disaster']);
  assert.deepEqual(tag('Les glaciers des Rocheuses fondent à un rythme record'), ['environment']);
});

test('les faux amis ne déclenchent pas de thème', () => {
  assert.deepEqual(tag('Découverte macabre à Laval : un corps retrouvé dans un parc'), [], 'crime, pas science');
  assert.deepEqual(tag('Claude Legault en entrevue', 'Le comédien parle de son nouveau film.'), [], 'prénom, pas IA');
  assert.deepEqual(tag('Mars : les ventes au détail en hausse', 'Statistique Canada rapporte une hausse en mars.'), [], 'mois, pas planète');
  assert.deepEqual(tag('Le prix Nobel de la paix décerné à une militante'), [], 'paix, pas science');
});

test("un flux spécialisé garantit son thème, et un sous-thème son parent", () => {
  assert.deepEqual(tag('New catalyst turns CO2 into fuel', '', 'science').includes('science'), true);
  assert.deepEqual(tag('Launch window opens for lunar lander', '', 'space'), ['science', 'space']);
});

test("une histoire prend un thème si au moins le tiers de ses articles le portent", () => {
  assert.deepEqual(clusterTopics([['environment', 'disaster'], ['environment', 'disaster'], []]), { topics: ['environment'], subtopics: ['disaster'] });
  assert.deepEqual(clusterTopics([['environment', 'disaster'], ['environment'], ['environment']]), { topics: ['environment'], subtopics: [] });
  assert.deepEqual(clusterTopics([['ai'], [], [], [], []]), { topics: [], subtopics: [] });
});

test('dans une catastrophe naturelle, « dévastateur » décrit les faits', () => {
  assert.equal(scoreTone('Un ouragan dévastateur frappe la Floride').level, 1);
  assert.equal(scoreTone('Un ouragan dévastateur frappe la Floride', { disaster: true }).level, 0);
  assert.equal(scoreTone('Scandale : un ouragan dévastateur et une gestion honteuse', { disaster: true }).level, 2);
});
