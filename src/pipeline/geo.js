import { compileKeywords, countKeywords } from './text.js';
import { articleMentions, articlePlaces } from './places.js';

export const REGIONS = ['quebec', 'canada', 'us', 'europe', 'asia', 'africa', 'oceania'];

export const HOME_REGION = {
  QC: 'quebec', CA: 'canada', US: 'us',
  FR: 'europe', GB: 'europe', BE: 'europe', CH: 'europe', DE: 'europe', UA: 'europe', RU: 'europe', EU: 'europe',
  QA: 'asia', HK: 'asia', IN: 'asia', JP: 'asia', SG: 'asia', KR: 'asia', IL: 'asia', PK: 'asia', CN: 'asia', LB: 'asia',
  ZA: 'africa', NG: 'africa', KE: 'africa',
  AU: 'oceania', NZ: 'oceania', NC: 'oceania',
};

// Région de chaque pays (codes ISO). Amérique latine, Caraïbes et Antarctique
// n'ont pas de section : leurs histoires restent dans « À la une » et les thèmes.
const COUNTRIES = {
  europe: `AD AL AM AT AX AZ BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GE GG GI GL GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM TR UA VA XK`,
  asia: `AE AF BD BH BN BT CN HK ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TW UZ VN YE`,
  africa: `AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW`,
  oceania: `AS AU CC CK CX FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV VU WF WS`,
};
const COUNTRY_REGION = { CA: 'canada', US: 'us' };
for (const [region, codes] of Object.entries(COUNTRIES)) for (const cc of codes.split(' ')) COUNTRY_REGION[cc] = region;

// Section d'un lieu : le Québec (province CA.10) a la sienne, à part du reste du Canada.
export function regionOf(country, admin) {
  if (admin === 'CA.10') return 'quebec';
  return COUNTRY_REGION[country] || null;
}

// Lieu hors de toute section (Brésil, Mexique) : il compte quand même, pour ne pas
// laisser un mot-clé secondaire décider seul de la section.
const ELSEWHERE = 'elsewhere';

// Mots-clés géographiques (écrits naturellement, normalisés au chargement).
const KEYWORDS = {
  quebec: `Québec, Québécois, Québécoise, Québécoises, Quebecer, Quebecers, Montréal, Montrealers, Laval, Longueuil, Gatineau, Sherbrooke, Saguenay, Trois-Rivières, Lévis, Rimouski, Abitibi, Gaspésie,
    Côte-Nord, Laurentides, Lanaudière, Montérégie, Estrie, Outaouais, Beauce, Charlevoix, Bas-Saint-Laurent, Drummondville, Granby, Terrebonne, Repentigny, Brossard, Saint-Jérôme, Chicoutimi,
    CAQ, Coalition avenir Québec, Parti québécois, Québec solidaire, Parti libéral du Québec, PLQ, Parti conservateur du Québec, Assemblée nationale, Legault, St-Pierre Plamondon, Plamondon, Duhaime,
    Hydro-Québec, Sûreté du Québec, SPVM, STM, SAAQ, RAMQ, CNESST, Héma-Québec, Loto-Québec, Desjardins, cégep, cégeps, francisation, loi 96, bill 96, loi 21, bill 21, Martinez Ferrada, Bruno Marchand`,
  canada: `Canada, Canadian, Canadians, Canadien, Canadienne, Canadiens, Canadiennes, Ottawa, Ontario, Toronto, Mississauga, Hamilton, Alberta, Calgary, Edmonton, British Columbia, Colombie-Britannique,
    Vancouver, Manitoba, Winnipeg, Saskatchewan, Regina, Saskatoon, Nova Scotia, Nouvelle-Écosse, Halifax, New Brunswick, Nouveau-Brunswick, Moncton, Fredericton, Newfoundland, Terre-Neuve, Labrador,
    Prince Edward Island, Île-du-Prince-Édouard, Yukon, Nunavut, Northwest Territories, Territoires du Nord-Ouest, Carney, Poilievre, Doug Ford, Danielle Smith, David Eby, Wab Kinew, Mélanie Joly,
    Anita Anand, Blanchet, Bloc québécois, RCMP, GRC, CBSA, ASFC, Parliament Hill, colline du Parlement, House of Commons, Chambre des communes, Bank of Canada, Banque du Canada, Canada Post,
    Postes Canada, Air Canada, Via Rail, Premières Nations, First Nations, Inuit, Métis`,
  us: `United States, États-Unis, Américain, Américains, Américaine, American, Americans, U.S., USA, US, White House, Maison-Blanche, Washington, Trump, Vance, Rubio, Hegseth,
    Capitol, Capitole, Republican, Republicans, Républicain, Républicains, Democrat, Democrats, Démocrate, Démocrates, Pentagon, Pentagone, FBI, CIA, California, Californie, Texas, Florida,
    Floride, New York, Chicago, Los Angeles, Ohio, Michigan, Pennsylvania, Pennsylvanie, Arizona, Nevada, Wisconsin, Minnesota, Virginia, Virginie, North Carolina, Caroline du Nord, Massachusetts,
    Boston, Seattle, Miami, Atlanta, Detroit, Alaska, Hawaii, Louisiana, Louisiane, New Orleans, Wall Street, Federal Reserve, Réserve fédérale, Obama, Biden, Kamala Harris, Newsom, Mamdani, MAGA`,
  europe: `Europe, European, Europeans, Européen, Européenne, Européens, EU, UE, Union européenne, European Union, Brussels, Bruxelles, France, French, Français, Paris, Macron, Lecornu, Le Pen, Bardella,
    Germany, Allemagne, German, Allemand, Berlin, Merz, Britain, British, Britannique, Royaume-Uni, United Kingdom, UK, London, Londres, Starmer, Ukraine, Ukrainian, Ukrainien, Kyiv, Kiev,
    Zelensky, Zelenskyy, Russia, Russie, Russian, Russe, Moscow, Moscou, Kremlin, Putin, Poutine, Spain, Espagne, Madrid, Italy, Italie, Rome, Meloni, Poland, Pologne, Warsaw, Varsovie,
    Netherlands, Pays-Bas, Belgium, Belgique, Switzerland, Suisse, Geneva, Genève, Austria, Autriche, Sweden, Suède, Norway, Norvège, Denmark, Danemark, Finland, Finlande, Ireland, Irlande,
    Scotland, Écosse, England, Angleterre, Portugal, Lisbon, Lisbonne, Greece, Grèce, Athens, Athènes, Hungary, Hongrie, Orban, Orbán, Romania, Roumanie, Serbia, Serbie, Kosovo, Bosnia, Bosnie,
    Croatia, Croatie, Czech, Tchèque, Slovakia, Slovaquie, Estonia, Estonie, Latvia, Lettonie, Lithuania, Lituanie, Moldova, Moldavie, Belarus, Biélorussie, Armenia, Arménie, Azerbaijan,
    Azerbaïdjan, Turkey, Turquie, Türkiye, Erdogan, Istanbul, NATO, OTAN, Vatican, Pope, Pape, Leo XIV, Léon XIV, Greenland, Groenland, Iceland, Islande`,
  asia: `Asia, Asie, Asian, Asiatique, China, Chine, Chinese, Chinois, Beijing, Pékin, Xi Jinping, Shanghai, Japan, Japon, Japanese, Japonais, Tokyo, Takaichi, India, Inde, Indian, Indien, Modi,
    New Delhi, Mumbai, Pakistan, Islamabad, Afghanistan, Taliban, Talibans, Kaboul, Kabul, Bangladesh, Sri Lanka, Nepal, Népal, North Korea, Corée du Nord, South Korea, Corée du Sud, Seoul, Séoul,
    Pyongyang, Kim Jong Un, Taiwan, Taïwan, Taipei, Hong Kong, Philippines, Manila, Manille, Indonesia, Indonésie, Jakarta, Malaysia, Malaisie, Singapore, Singapour, Thailand, Thaïlande,
    Bangkok, Vietnam, Viêtnam, Hanoi, Cambodia, Cambodge, Laos, Myanmar, Birmanie, Mongolia, Mongolie, Kazakhstan, Middle East, Moyen-Orient, Israel, Israël, Israeli, Israélien, Israéliens,
    Gaza, West Bank, Cisjordanie, Jerusalem, Jérusalem, Tel Aviv, Netanyahu, Netanyahou, Hamas, Hezbollah, Lebanon, Liban, Beirut, Beyrouth, Syria, Syrie, Damascus, Damas, Iran, Iranian,
    Iranien, Tehran, Téhéran, Iraq, Irak, Baghdad, Bagdad, Saudi, Saoudite, Riyadh, Riyad, Yemen, Yémen, Houthi, Houthis, Qatar, Doha, Emirates, Émirats, Dubai, Dubaï, Jordanie,
    Kuwait, Koweït, Oman, Palestinian, Palestinians, Palestinien, Palestiniens`,
  africa: `Africa, Afrique, African, Africain, Africaine, Nigeria, Nigéria, Lagos, Abuja, South Africa, Afrique du Sud, Johannesburg, Cape Town, Pretoria, Ramaphosa, Kenya, Nairobi, Ethiopia,
    Éthiopie, Addis Ababa, Addis-Abeba, Sudan, Soudan, Khartoum, Darfur, Darfour, Somalia, Somalie, Mogadishu, Mogadiscio, Egypt, Égypte, Cairo, Le Caire, Morocco, Maroc, Rabat, Casablanca,
    Algeria, Algérie, Algiers, Alger, Tunisia, Tunisie, Tunis, Libya, Libye, Tripoli, Senegal, Sénégal, Dakar, Mali, Bamako, Niger, Niamey, Burkina Faso, Ouagadougou, Ivory Coast,
    Côte d'Ivoire, Abidjan, Cameroon, Cameroun, Yaoundé, Tchad, N'Djamena, Congo, RDC, DRC, Kinshasa, Goma, Rwanda, Kigali, Uganda, Ouganda, Kampala, Tanzania, Tanzanie, Ghana, Accra,
    Zimbabwe, Mozambique, Madagascar, Angola, Zambia, Zambie, Sahel, African Union, Union africaine, Guinea, Guinée, Conakry, Bénin, Benin, Togo, Gabon, Mauritania, Mauritanie, Eritrea,
    Érythrée, M23, Boko Haram`,
  oceania: `Australia, Australie, Australian, Australien, Australienne, Sydney, Melbourne, Canberra, Brisbane, Adelaide, Tasmania, Tasmanie, Albanese, New Zealand, Nouvelle-Zélande, Wellington,
    Auckland, Christchurch, Luxon, Papua New Guinea, Papouasie, Fiji, Fidji, Samoa, Tonga, Vanuatu, Solomon Islands, Îles Salomon, New Caledonia, Nouvelle-Calédonie, Nouméa, Kanak, Kanaks,
    Tahiti, Polynésie, Polynesia, Pacific Islands, Great Barrier Reef, Grande Barrière`,
};

// Termes trop ambigus pour être comptés sans majuscule dans le texte original.
const CASE_SENSITIVE = new Set(['us', 'eu', 'ue', 'uk', 'stm', 'caq', 'plq', 'rdc', 'drc']);

const PATTERNS = Object.fromEntries(REGIONS.map((region) => [region, compileKeywords(KEYWORDS[region])]));
const countMatches = (text, region) => countKeywords(text, PATTERNS[region], CASE_SENSITIVE);

// Indices de région d'un article. scores : lieux et mots-clés cités. weak : vrai
// quand rien n'est cité et que la région vient seulement du flux ou du pays du média.
export function tagArticle(article, source) {
  const scores = {};
  const add = (region, w) => { if (w > 0) scores[region] = (scores[region] || 0) + w; };
  for (const region of REGIONS) add(region, 2 * countMatches(article.title, region) + countMatches(article.description, region));
  // Tous les lieux du répertoire du globe, pas seulement ceux des listes de mots-clés.
  for (const p of articlePlaces(article.mentions || articleMentions(article))) {
    if (p.country) add(regionOf(p.country, p.admin) || ELSEWHERE, 2 * p.weight);
  }
  if (Object.keys(scores).length) return { scores, weak: false };
  // Rien de cité : la rubrique du flux, sinon le pays d'un média local.
  if (article.feedRegion && article.feedRegion !== 'world') return { scores: { [article.feedRegion]: 1 }, weak: true };
  const home = HOME_REGION[source.country];
  if (home && article.feedRegion !== 'world') return { scores: { [home]: 1 }, weak: true };
  return { scores, weak: true };
}

// Régions d'une histoire. Les indices faibles (flux, pays du média) ne comptent
// que si aucun article de l'histoire ne cite de lieu.
export function clusterRegions(articleTags) {
  const strong = articleTags.filter((t) => !t.weak);
  const total = {};
  for (const { scores } of strong.length ? strong : articleTags) {
    const sum = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
    for (const [region, s] of Object.entries(scores)) total[region] = (total[region] || 0) + s / sum;
  }
  const ranked = Object.entries(total).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { primary: null, regions: [] };
  const top = ranked[0][1];
  const regions = ranked.filter(([r, v]) => r !== ELSEWHERE && v >= Math.max(0.3, top * 0.35)).map(([r]) => r);
  return { primary: regions[0] || null, regions, weights: Object.fromEntries(ranked.map(([r, v]) => [r, +v.toFixed(2)])) };
}
