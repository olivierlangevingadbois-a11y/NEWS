import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articleMentions, locateStory } from '../src/pipeline/places.js';

const where = (title, description = '', lang = 'fr') => locateStory([articleMentions({ title, description, lang })]).place;

test('« à Québec » est la ville, « du Québec » la province', () => {
  assert.equal(where('Incendie majeur à Québec : 200 évacués').kind, 'city');
  assert.equal(where('Le gouvernement du Québec annonce des compressions').kind, 'admin');
  assert.equal(where('Quebec City mayor unveils tramway plan', '', 'en').kind, 'city');
});

test('le contexte lève les ambiguïtés', () => {
  assert.equal(where('London, Ontario police investigate shooting', '', 'en').country, 'CA');
  assert.equal(where('London mayor announces congestion charge', '', 'en').country, 'GB');
  assert.equal(where('Georgia voters head to the polls in Atlanta', '', 'en').name, 'Atlanta');
  assert.equal(where('Georgia election results contested', 'Tbilisi protests continue', 'en').name, 'Tbilisi');
});

test("le sens d'un nom dépend de la langue : Mexico", () => {
  assert.equal(where('Séisme à Mexico : des dizaines de morts').kind, 'city');
  assert.equal(where('Mexico hit by new US tariffs', '', 'en').kind, 'country');
});

test('les faux amis et les personnes ne sont pas des lieux', () => {
  assert.equal(where('Charlotte Cardin lance un nouvel album'), null);
  assert.equal(where('Trump says the deal is good for us', '', 'en'), null);
  assert.equal(where('Nice weather expected this weekend in Toronto', '', 'en').name, 'Toronto');
  assert.equal(where('Lewis Hamilton wins in Montreal', '', 'en').name, 'Montréal');
  assert.equal(where('Débat : St-Pierre Plamondon attaque la CAQ', 'Le chef péquiste était à Montréal.').name, 'Montréal');
});

test('le lieu le plus précis l’emporte sur son pays', () => {
  const place = locateStory([
    articleMentions({ title: 'Tarifs sur l’aluminium : inquiétude au Saguenay', description: 'Les alumineries canadiennes craignent des mises à pied.', lang: 'fr' }),
    articleMentions({ title: 'Canadian aluminum smelters brace for tariffs', description: 'Plants in Saguenay could cut jobs.', lang: 'en' }),
  ]).place;
  assert.equal(place.name, 'Saguenay');
});

test('une histoire sans lieu reste hors du globe', () => {
  assert.equal(where('Nvidia dévoile sa nouvelle puce pour l’intelligence artificielle'), null);
});

test('une ville citée l’emporte sur son pays, même rarement citée', () => {
  const place = locateStory([
    articleMentions({ title: 'Le Japon frappé par un fort séisme', description: 'Les dégâts sont importants à Sendai.', lang: 'fr' }),
    articleMentions({ title: 'Strong earthquake shakes Japan', description: 'Tsunami warning issued for the coast.', lang: 'en' }),
    articleMentions({ title: 'Japon : alerte au tsunami levée', description: 'Les autorités font le bilan.', lang: 'fr' }),
  ]).place;
  assert.equal(place.name, 'Sendai');
  assert.equal(place.anchor, undefined);
});

test('sans ville citée : capitale du pays ou de la province, ville principale de la région', () => {
  const japan = where('Le Japon frappé par un fort séisme');
  assert.equal(japan.name, 'Japon');
  assert.equal(japan.anchor, 'Tokyo');
  assert.ok(Math.abs(japan.lat - 35.69) < 0.1 && Math.abs(japan.lon - 139.69) < 0.1);
  assert.equal(where('Le Canada impose de nouveaux tarifs').anchor, 'Ottawa');
  const quebec = where('Le gouvernement du Québec annonce des compressions');
  assert.equal(quebec.kind, 'admin');
  assert.equal(quebec.anchor, 'Québec');
  assert.equal(where('Feux de forêt en Gaspésie').anchor, 'Gaspé');
});

test('on descend du plus vaste au plus précis : région, pays, ville', () => {
  const iran = where('Tensions au Moyen-Orient', "L'Iran menace de fermer le détroit.");
  assert.equal(iran.name, 'Iran');
  assert.equal(iran.anchor, 'Téhéran');
  assert.equal(where('Feux de forêt au Québec', 'Des évacuations à Sept-Îles, sur la Côte-Nord.').name, 'Sept-Îles');
  // Une mer reste à sa place.
  const sea = where('Collision en mer de Chine méridionale');
  assert.equal(sea.anchor, undefined);
  assert.equal(sea.lat, 12);
});
