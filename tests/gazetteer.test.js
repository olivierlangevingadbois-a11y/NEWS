import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const G = JSON.parse(fs.readFileSync(new URL('../config/gazetteer.json', import.meta.url), 'utf8'));
const lookup = (norm) => (G.index[norm] || []).map((e) => G.places[Array.isArray(e) ? e[0] : e]);

test('le répertoire couvre pays, provinces, villes et régions', () => {
  const kinds = new Set(G.places.map((p) => p.k));
  for (const k of ['country', 'admin', 'city', 'region']) assert.ok(kinds.has(k), k);
  assert.ok(G.places.filter((p) => p.k === 'country').length > 200);
  assert.ok(G.places.filter((p) => p.k === 'city').length > 4000);
});

test('noms français et anglais pointent vers le même lieu', () => {
  assert.equal(lookup('londres')[0].n, 'Londres');
  assert.equal(lookup('pekin')[0], lookup('beijing')[0]);
  assert.equal(lookup('colombie britannique')[0], lookup('british columbia')[0]);
  assert.ok(lookup('trois rivieres').some((p) => p.c === 'CA'));
  assert.ok(lookup('st jerome').some((p) => p.n === 'Saint-Jérôme'));
});

test('Québec : la province et la ville existent toutes les deux', () => {
  const kinds = lookup('quebec').map((p) => p.k).sort();
  assert.deepEqual(kinds, ['admin', 'city']);
});

test('les coordonnées sont plausibles', () => {
  const mtl = lookup('montreal')[0];
  assert.ok(Math.abs(mtl.la - 45.5) < 0.3 && Math.abs(mtl.lo + 73.6) < 0.3);
  for (const p of G.places) {
    assert.ok(p.la >= -90 && p.la <= 90 && p.lo >= -180 && p.lo <= 180, p.n);
    assert.ok(p.z >= 1.5 && p.z <= 11, `${p.n} zoom ${p.z}`);
  }
});
