// Normalisation bilingue (FR/EN) : permet de rapprocher « guerre commerciale »
// et « trade war », ou « Chine » et « China », sans service de traduction.

const STOPWORDS = new Set(`
a au aux avec ce ces cet cette dans de des du elle elles en et eux il ils je la le les leur leurs lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous
y a été etre être est sont sera seront etait était ete avait avoir ont fait faire font plus moins tres très tout tous toute toutes selon apres après avant depuis contre entre sans sous chez vers pendant encore deja déjà aussi alors ainsi comme dont donc car si peu bien quand comment pourquoi quoi
cela ceci celui celle ceux celles autre autres meme même lors leurs quelque quelques plusieurs chaque aucun aucune deux trois quatre cinq six sept huit neuf dix premier premiere première dernier derniere dernière nouveau nouvelle nouveaux nouvelles grand grande grands grandes petit petite
jour jours semaine semaines mois annee année ans an hier aujourd aujourdhui demain lundi mardi mercredi jeudi vendredi samedi dimanche
selon dit dire affirme annonce annoncé indique veut peut pourrait doit devrait fois faut
the a an and or but if of to in on at by for with from as is are was were be been being has have had do does did will would can could should may might must shall this that these those it its he she they them his her their we our you your i me my not no yes
than then there here what which who whom whose when where why how all any both each few more most other some such only own same so too very just over under again further once about above below up down out off into through during before after
says said say new news live update updates latest reported video watch photos amid after year years day days week weeks month months today yesterday tomorrow monday tuesday wednesday thursday friday saturday sunday
first last one two three four five six seven eight nine ten per via vs get gets got make makes made take takes took could want wants
against among while without within still back now also even much many like near amid across around
`.split(/\s+/).filter(Boolean).map(stripAccents));

// Expressions multi-mots (déjà normalisées) remplacées par un jeton canonique.
const PHRASES = [
  ['etats unis', 'usa'], ['united states', 'usa'], ['u s', 'usa'], ['maison blanche', 'whitehouse'], ['white house', 'whitehouse'],
  ['royaume uni', 'uk'], ['united kingdom', 'uk'], ['grande bretagne', 'uk'], ['great britain', 'uk'],
  ['premier ministre', 'primeminister'], ['premiere ministre', 'primeminister'], ['prime minister', 'primeminister'],
  ['droits de douane', 'tariff'], ['droit de douane', 'tariff'], ['guerre commerciale', 'tradewar'], ['trade war', 'tradewar'],
  ['cessez le feu', 'ceasefire'], ['cease fire', 'ceasefire'], ['feux de foret', 'wildfire'], ['feu de foret', 'wildfire'], ['incendies de foret', 'wildfire'], ['incendie de foret', 'wildfire'], ['forest fire', 'wildfire'], ['forest fires', 'wildfire'],
  ['tremblement de terre', 'earthquake'], ['banque centrale', 'centralbank'], ['central bank', 'centralbank'], ['banque du canada', 'bankofcanada'], ['bank of canada', 'bankofcanada'], ['reserve federale', 'fed'], ['federal reserve', 'fed'],
  ['taux directeur', 'interestrate'], ['taux d interet', 'interestrate'], ['interest rate', 'interestrate'], ['interest rates', 'interestrate'],
  ['assemblee nationale', 'nationalassembly'], ['national assembly', 'nationalassembly'], ['chambre des communes', 'commons'], ['house of commons', 'commons'],
  ['nations unies', 'un'], ['united nations', 'un'], ['union europeenne', 'eu'], ['european union', 'eu'], ['cour supreme', 'supremecourt'], ['supreme court', 'supremecourt'],
  ['projet de loi', 'bill'], ['bois d oeuvre', 'lumber'], ['softwood lumber', 'lumber'], ['produits laitiers', 'dairy'], ['gestion de l offre', 'supplymanagement'], ['supply management', 'supplymanagement'],
  ['bande de gaza', 'gaza'], ['gaza strip', 'gaza'], ['cisjordanie', 'westbank'], ['west bank', 'westbank'], ['coree du nord', 'northkorea'], ['north korea', 'northkorea'], ['coree du sud', 'southkorea'], ['south korea', 'southkorea'],
  ['afrique du sud', 'southafrica'], ['south africa', 'southafrica'], ['nouvelle zelande', 'newzealand'], ['new zealand', 'newzealand'], ['arabie saoudite', 'saudi'], ['saudi arabia', 'saudi'],
  ['cote d ivoire', 'ivorycoast'], ['ivory coast', 'ivorycoast'], ['burkina faso', 'burkina'], ['nouvelle caledonie', 'newcaledonia'], ['new caledonia', 'newcaledonia'],
  ['hydro quebec', 'hydroquebec'], ['parti quebecois', 'pq'], ['quebec solidaire', 'qs'], ['bloc quebecois', 'bloc'], ['coalition avenir quebec', 'caq'],
  ['intelligence artificielle', 'ai'], ['artificial intelligence', 'ai'], ['changements climatiques', 'climate'], ['changement climatique', 'climate'], ['climate change', 'climate'],
  ['cout de la vie', 'costofliving'], ['cost of living', 'costofliving'], ['medias sociaux', 'socialmedia'], ['reseaux sociaux', 'socialmedia'], ['social media', 'socialmedia'], ['taux de chomage', 'unemployment'], ['unemployment rate', 'unemployment'], ['pays bas', 'netherlands'], ['viet nam', 'vietnam'], ['mises a pied', 'layoff'], ['premieres nations', 'indigenous'], ['first nations', 'indigenous'], ['new york', 'newyork'], ['los angeles', 'losangeles'],
];

// Mots simples (normalisés, sans accents) → jeton canonique commun FR/EN.
const LEXICON = Object.fromEntries(Object.entries({
  war: 'guerre guerres wars', election: 'election elections electoral electorale electoraux elect elected elu elue scrutin vote votes voting',
  tariff: 'tarif tarifs tariffs douane douanes surtaxe surtaxes levy levies', strike: 'greve greves strikes striking grevistes',
  airstrike: 'frappe frappes bombardement bombardements airstrikes bombing bombings', earthquake: 'seisme seismes quake quakes earthquakes',
  hurricane: 'ouragan ouragans hurricanes', flood: 'inondation inondations crue crues floods flooding', wildfire: 'wildfires feux incendies brasier',
  fire: 'incendie blaze fires', murder: 'meurtre meurtres homicide homicides murders', shooting: 'fusillade fusillades shootings tireur gunman',
  attack: 'attaque attaques attentat attentats attacks attacked', deal: 'accord accords entente ententes agreement agreements deals pact pacte',
  summit: 'sommet sommets summits', talks: 'negociation negociations pourparlers negotiations', ceasefire: 'treve truce',
  hostage: 'otage otages hostages', tax: 'impot impots taxe taxes taxation', budget: 'budgets budgetaire budgetary',
  inflation: 'inflationary', unemployment: 'chomage jobless', job: 'emploi emplois jobs', layoff: 'licenciement licenciements layoffs',
  oil: 'petrole petroliere crude', pipeline: 'oleoduc gazoduc pipelines', gas: 'gaz', electricity: 'electricite', energy: 'energie energetique',
  health: 'sante sanitaire', hospital: 'hopital hopitaux hospitals urgences', school: 'ecole ecoles schools scolaire', teacher: 'enseignant enseignants enseignantes teachers profs',
  nurse: 'infirmiere infirmieres infirmier nurses', judge: 'juge juges judges', trial: 'proces trials',
  police: 'policier policiers policiere spvm grc rcmp sq', pope: 'pape', king: 'roi', queen: 'reine', president: 'presidente presidents presidentielle presidential',
  government: 'gouvernement gouvernements governments gouvernemental', minister: 'ministre ministres ministers', mp: 'depute deputes deputee mps',
  senate: 'senat senateurs senators', law: 'loi lois laws', poll: 'sondage sondages polls polling', resign: 'demission demissionne resigns resignation resigned',
  investigation: 'enquete enquetes probe probes investigations', death: 'deces mort morts deaths dead meurt mortel mortelle deadly',
  killed: 'tue tues tuees tuee killing kills', injured: 'blesse blesses blessees wounded injuries', victim: 'victime victimes victims',
  explosion: 'explosions blast', plane: 'avion avions aircraft airplane planes', crash: 'ecrasement collision crashes', ship: 'navire navires bateau ships vessel',
  climate: 'climat climatique climatiques', heat: 'chaleur canicule heatwave', drought: 'secheresse', vaccine: 'vaccin vaccins vaccines vaccination',
  market: 'bourse bourses markets stocks', company: 'entreprise entreprises compagnie companies firm', factory: 'usine usines plant',
  car: 'voiture voitures auto automobile automobiles cars vehicules vehicles', steel: 'acier', aluminum: 'aluminium', dairy: 'laitier laitiers lait',
  farmer: 'agriculteur agriculteurs producteurs farmers', border: 'frontiere frontieres borders', immigration: 'immigrants immigrant migrants migrant immigres asylum asile demandeurs refugies refugees',
  housing: 'logement logements loyer loyers rent', protest: 'manifestation manifestations manifestants protests protesters', union: 'syndicat syndicats unions',
  nato: 'otan', un: 'onu', eu: 'ue', usa: 'americain americaine americains americaines american americans us', canada: 'canadien canadienne canadiens canadiennes canadian canadians ottawa',
  quebec: 'quebecois quebecoise quebecoises quebecer quebecers quebecker quebeckers', montreal: 'montrealais montrealaise montrealers',
  uk: 'britannique britanniques british britain', france: 'francais francaise francaises french', germany: 'allemagne allemand allemande allemands german germans',
  china: 'chine chinois chinoise chinese beijing pekin', russia: 'russie russe russes russian russians moscou moscow kremlin', ukraine: 'ukrainien ukrainienne ukrainiens ukrainian ukrainians kyiv kiev',
  israel: 'israelien israelienne israeliens israeli israelis', palestinian: 'palestinien palestinienne palestiniens palestiniennes palestinians palestine', iran: 'iranien iranienne iraniens iranian iranians',
  japan: 'japon japonais japonaise japanese', india: 'inde indien indienne indiens indian indians', mexico: 'mexique mexicain mexicaine mexicains mexican mexicans',
  spain: 'espagne espagnol espagnole spanish', italy: 'italie italien italienne italian', brazil: 'bresil bresilien brazilian', argentina: 'argentine argentin',
  egypt: 'egypte egyptien egyptian', syria: 'syrie syrien syrienne syrian', lebanon: 'liban libanais lebanese', iraq: 'irak irakien iraqi', turkey: 'turquie turc turque turkish',
  greece: 'grece grec grecque greek', poland: 'pologne polonais polish', netherlands: 'neerlandais dutch', belgium: 'belgique belge belgian',
  switzerland: 'suisse swiss', austria: 'autriche autrichien austrian', sweden: 'suede suedois swedish', norway: 'norvege norvegien norwegian', denmark: 'danemark danois danish',
  finland: 'finlande finlandais finnish', ireland: 'irlande irlandais irish', scotland: 'ecosse ecossais scottish', england: 'angleterre anglais english',
  australia: 'australie australien australienne australian australians', newzealand: 'zelandais', indonesia: 'indonesie indonesien indonesian', thailand: 'thailande thailandais thai',
  vietnam: 'vietnamien vietnamese', myanmar: 'birmanie birman burma burmese', greenland: 'groenland', saudi: 'saoudien saoudienne saoudite',
  ethiopia: 'ethiopie ethiopien ethiopian', sudan: 'soudan soudanais sudanese', somalia: 'somalie somalien somali', morocco: 'maroc marocain moroccan', algeria: 'algerie algerien algerian',
  tunisia: 'tunisie tunisien tunisian', libya: 'libye libyen libyan', senegal: 'senegalais senegalese', cameroon: 'cameroun camerounais cameroonian', chad: 'tchad tchadien chadian',
  haiti: 'haitien haitienne haitian', cuba: 'cubain cuban', venezuela: 'venezuelien venezuelan', colombia: 'colombie colombien colombian', peru: 'perou peruvien peruvian', chile: 'chili chilien chilean',
  afghanistan: 'afghan afghane afghans', pakistan: 'pakistanais pakistani', taiwan: 'taiwanais taiwanese', hungary: 'hongrie hongrois hungarian', romania: 'roumanie roumain romanian',
  serbia: 'serbie serbe serbian', armenia: 'armenie armenien armenian', azerbaijan: 'azerbaidjan azeri', belarus: 'bielorussie bielorusse belarusian', moldova: 'moldavie moldave',
  nigeria: 'nigerian nigerians', kenya: 'kenyan kenyans', congo: 'congolais congolese rdc drc', rwanda: 'rwandais rwandan', mali: 'malien malian', niger: 'nigerien',
  europe: 'europeen europeenne europeens europeennes european europeans', africa: 'afrique africain africaine africains african africans', asia: 'asie asiatique asian',
  debate: 'debat debats debates', leader: 'chef chefs leaders', campaign: 'campagne campagnes campaigns', sovereignty: 'souverainete souverainiste souverainistes sovereigntist',
  economy: 'economie economique economiques economic', study: 'etude etudes studies', rockies: 'rocheuses', florida: 'floride', storm: 'tempete tempetes storms',
  coast: 'cote cotes coasts', gulf: 'golfe', congress: 'congres', future: 'avenir futur', approve: 'approuve approuvee approuves adopte adoptee approves approved',
  melt: 'fonte fondent fond melting melts', ice: 'glace', famine: 'famines', aid: 'aide humanitaire humanitarian', truck: 'camion camions trucks',
  drone: 'drones', missile: 'missiles', capital: 'capitale', ban: 'interdiction interdire interdit bans banned', child: 'enfant enfants children kids jeunes',
  report: 'rapport rapports', cost: 'cout couts costs', billion: 'milliard milliards billions', million: 'millions', court: 'tribunal tribunaux cour courts',
  indigenous: 'autochtone autochtones inuit inuits', trump: 'trumps', carney: 'carneys', gaza: 'gazaouis gazans',
}).flatMap(([canon, words]) => words.split(/\s+/).map((w) => [w, canon])));

export function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalize(s) {
  return stripAccents(String(s || '').toLowerCase())
    .replace(/[’'`´]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(l|d|j|m|n|s|t|c|qu|jusqu|lorsqu|puisqu)\s(?=[a-z])/g, '')
    .trim();
}

function applyPhrases(norm) {
  let s = ` ${norm} `;
  for (const [from, to] of PHRASES) {
    if (s.includes(` ${from} `)) s = s.split(` ${from} `).join(` ${to} `);
  }
  return s.trim();
}

// Racinisation minimale : pluriels et quelques suffixes courants, puis troncature.
function stem(w) {
  if (w.length <= 4) return w;
  let s = w;
  if (s.endsWith('ies') && s.length > 5) s = s.slice(0, -3) + 'y';
  else if (s.endsWith('aux') && s.length > 5) s = s.slice(0, -3) + 'al';
  else if (/[^s]s$/.test(s) || s.endsWith('x')) s = s.slice(0, -1);
  return s.length > 8 ? s.slice(0, 8) : s;
}

const CANONICAL = new Set(PHRASES.map(([, to]) => to));

export function tokenize(text) {
  const words = applyPhrases(normalize(text)).split(' ');
  const out = [];
  for (const w of words) {
    if (!w || /^\d+$/.test(w) && w.length !== 4) continue;
    if (CANONICAL.has(w)) { out.push(w); continue; }
    if (STOPWORDS.has(w)) continue;
    const canon = LEXICON[w];
    if (canon) { out.push(canon); continue; }
    if (w.length < 3) continue;
    out.push(stem(w));
  }
  return out;
}

// Noms propres : mots capitalisés hors début de phrase. Ils portent l'essentiel
// de l'identité d'une nouvelle et sont souvent identiques d'une langue à l'autre.
export function properNouns(text) {
  const set = new Set();
  const sentences = String(text || '').split(/(?<=[.!?:«»"“”])\s+/);
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const raw = words[i].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').replace(/^(?:[LlDdJjMmNnSsTtCc]|[Qq]u)['’]/u, '');
      const acronym = /^\p{Lu}{2,6}$/u.test(raw);
      const titleCase = i > 0 && raw.length > 2 && /^\p{Lu}\p{Ll}/u.test(raw);
      if (acronym || titleCase) for (const t of tokenize(raw)) set.add(t);
    }
  }
  return set;
}

export function detectLanguage(text) {
  const n = ` ${normalize(text)} `;
  const fr = (n.match(/ (le|la|les|des|du|une|est|et|pour|dans|qui|sur|au|aux) /g) || []).length;
  const en = (n.match(/ (the|and|of|to|is|for|in|on|with|that|as|at) /g) || []).length;
  if (fr === en) return null;
  return fr > en ? 'fr' : 'en';
}
