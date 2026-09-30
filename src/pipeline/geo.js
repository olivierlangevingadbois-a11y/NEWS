import { compileKeywords, countKeywords } from './text.js';

export const REGIONS = ['quebec', 'canada', 'us', 'europe', 'asia', 'africa', 'oceania'];

export const HOME_REGION = {
  QC: 'quebec', CA: 'canada', US: 'us',
  FR: 'europe', GB: 'europe', BE: 'europe', CH: 'europe', DE: 'europe', UA: 'europe', RU: 'europe', EU: 'europe',
  QA: 'asia', HK: 'asia', IN: 'asia', JP: 'asia', SG: 'asia', KR: 'asia', IL: 'asia', PK: 'asia', CN: 'asia', LB: 'asia',
  ZA: 'africa', NG: 'africa', KE: 'africa',
  AU: 'oceania', NZ: 'oceania', NC: 'oceania',
};

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

export function tagArticle(article, source) {
  const scores = {};
  for (const region of REGIONS) {
    const s = 2 * countMatches(article.title, region) + countMatches(article.description, region);
    if (s > 0) scores[region] = s;
  }
  const hint = article.feedRegion && article.feedRegion !== 'world' ? article.feedRegion : null;
  if (hint) scores[hint] = (scores[hint] || 0) + 1.5;
  const home = HOME_REGION[source.country];
  // Un média local qui ne nomme aucun lieu parle presque toujours de chez lui.
  if (!Object.keys(scores).length && article.feedRegion !== 'world' && home) scores[home] = 1;
  return scores;
}

export function clusterRegions(articleScores) {
  const total = {};
  for (const scores of articleScores) {
    const sum = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
    for (const [region, s] of Object.entries(scores)) total[region] = (total[region] || 0) + s / sum;
  }
  const ranked = Object.entries(total).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { primary: null, regions: [] };
  const top = ranked[0][1];
  const regions = ranked.filter(([, v]) => v >= Math.max(0.3, top * 0.35)).map(([r]) => r);
  return { primary: ranked[0][0], regions, weights: Object.fromEntries(ranked.map(([r, v]) => [r, +v.toFixed(2)])) };
}
