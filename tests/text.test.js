import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, properNouns, detectLanguage, normalize } from '../src/pipeline/text.js';

test('normalise accents, élisions et ponctuation', () => {
  assert.equal(normalize("L'Assemblée nationale du Québec"), 'assemblee nationale du quebec');
});

test('un titre français et un titre anglais partagent leurs termes clés', () => {
  const fr = new Set(tokenize("Guerre commerciale : Ottawa riposte aux droits de douane américains sur l'acier"));
  const en = new Set(tokenize('Canada retaliates against US steel tariffs as trade war escalates'));
  for (const t of ['tradewar', 'tariff', 'usa', 'steel', 'canada']) {
    assert.ok(fr.has(t), `FR devrait contenir ${t}`);
    assert.ok(en.has(t), `EN devrait contenir ${t}`);
  }
});

test('les mots vides sont retirés', () => {
  assert.deepEqual(tokenize('the of and le la les des'), []);
});

test('noms propres et sigles, sans le premier mot de la phrase', () => {
  const p = properNouns("Selon le premier ministre Mark Carney, la CAQ doit agir. L'OTAN réagit");
  assert.ok(p.has('carney') && p.has('caq') && p.has('nato'));
  assert.ok(!p.has('selon'));
});

test('détection de langue', () => {
  assert.equal(detectLanguage('Le gouvernement du Québec annonce une hausse des tarifs pour les familles'), 'fr');
  assert.equal(detectLanguage('The government of Canada announced new tariffs on the steel industry'), 'en');
});
