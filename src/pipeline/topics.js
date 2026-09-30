import { compileKeywords, countKeywords } from './text.js';

// Thèmes transversaux, indépendants des régions : une histoire peut être à la
// fois « Québec » et « Environnement ». Les sous-thèmes précisent un thème.
export const TOPICS = ['science', 'ai', 'environment'];
export const SUBTOPICS = { space: 'science', health: 'science', disaster: 'environment' };

// « ~ » = terme ambigu (compte pour moitié) : il lui faut un autre indice.
const KEYWORDS = {
  science: `scientifique, scientifiques, scientist, scientists, chercheur, chercheurs, chercheuse, chercheuses, researcher, researchers,
    ~découverte, ~découvertes, ~discovery, ~discoveries, ~découvrent, ~discover, ~discovered, ~percée, ~breakthrough, ~invention, ~inventé, ~invented,
    inventeur, inventor, ~prototype, ~brevet, ~patent, physiciens, physicists, ~physique, physics, quantique, quantum, chimie, chemistry, chimistes, chemists,
    molécule, molécules, molecule, molecules, biologie, biology, biologistes, biologists, génétique, genetic, genetics, génome, genome, ADN, DNA, CRISPR,
    fossile, fossiles, fossil, fossils, dinosaure, dinosaures, dinosaur, dinosaurs, paléontologue, paléontologues, paleontologist, paleontologists,
    archéologue, archéologues, archaeologist, archaeologists, archéologique, archéologiques, archaeological, préhistorique, prehistoric,
    nouvelle espèce, nouvelles espèces, new species, neurosciences, neuroscience, ~cerveau, ~brain, ~laboratoire, ~laboratory, CERN, supraconducteur,
    superconductor, fusion nucléaire, nuclear fusion, mathématiciens, mathematicians, étude publiée, study published, ~publiée dans, ~published in,
    revue Nature, journal Nature, revue Science, peer-reviewed, prix Nobel de physique, Nobel Prize in Physics, prix Nobel de chimie, Nobel Prize in Chemistry,
    prix Nobel de médecine, Nobel Prize in Medicine, Nobel de physiologie, ~Nobel, ~innovation, ~scientifiquement, ~scientifically`,
  space: `NASA, ESA, Agence spatiale, space agency, Agence spatiale canadienne, Canadian Space Agency, télescope, telescope, James Webb, James-Webb, Hubble,
    astronaute, astronautes, astronaut, astronauts, astronome, astronomes, astronomer, astronomers, astronomie, astronomy, astrophysique, astrophysics,
    astrophysicien, astrophysicist, exoplanète, exoplanètes, exoplanet, exoplanets, galaxie, galaxies, galaxy, trou noir, trous noirs, black hole, black holes,
    astéroïde, astéroïdes, asteroid, asteroids, comète, comet, météorite, meteorite, fusée, rocket, ~lanceur, station spatiale, space station, Artemis, SpaceX,
    Blue Origin, Starship, mission lunaire, lunar mission, ~Mars, ~Lune, ~Moon, ~orbite, ~orbit, sonde spatiale, space probe, Jupiter, Saturne, Saturn, ~Vénus,
    ~Venus, système solaire, solar system, ~éclipse, ~eclipse, aurores boréales, northern lights, aurora borealis, ~cosmos, big bang, ~spatial, ~spatiale`,
  health: `essai clinique, essais cliniques, clinical trial, clinical trials, thérapie génique, gene therapy, cellules souches, stem cells, Alzheimer, Parkinson,
    microbiome, antibiorésistance, antibiotic resistance, immunothérapie, immunotherapy, ARN messager, mRNA, nouveau traitement, new treatment,
    nouveau médicament, new drug, vaccin expérimental, experimental vaccine, ~cancer, ~maladie rare, ~rare disease`,
  ai: `intelligence artificielle, artificial intelligence, IA, AI, IA générative, generative AI, ChatGPT, OpenAI, Anthropic, ~Gemini, ~Copilot, Mistral AI,
    DeepSeek, ~Nvidia, grand modèle de langage, grands modèles de langage, large language model, large language models, LLM, LLMs, apprentissage automatique,
    machine learning, apprentissage profond, deep learning, réseau de neurones, réseaux de neurones, neural network, neural networks, chatbot, chatbots,
    robot conversationnel, robots conversationnels, agent conversationnel, agents IA, AI agents, deepfake, deepfakes, hypertrucage, hypertrucages, Sam Altman,
    ~Altman, Yoshua Bengio, ~Bengio, Geoffrey Hinton, ~Hinton, Demis Hassabis, Dario Amodei, superintelligence, AGI, ~centre de données, ~centres de données,
    ~data center, ~data centers, ~data centre, ~data centres, xAI, Grok, Midjourney, ~Sora, reconnaissance faciale, facial recognition, ~algorithme,
    ~algorithmes, ~algorithm, ~algorithms, ~robot, ~robots, robotique, robotics, humanoïde, humanoïdes, humanoid, humanoids, voiture autonome,
    voitures autonomes, self-driving, autonomous vehicle, Waymo, ~Mila, ~Cohere`,
  environment: `climat, climatique, climatiques, climate, changements climatiques, changement climatique, climate change, réchauffement climatique,
    global warming, gaz à effet de serre, greenhouse gas, greenhouse gases, ~émissions, ~emissions, ~carbone, ~carbon, CO2, ~méthane, ~methane, GIEC, IPCC,
    COP30, COP31, COP32, biodiversité, biodiversity, espèce menacée, espèces menacées, endangered species, espèces en péril, species at risk, extinction,
    écosystème, écosystèmes, ecosystem, ecosystems, déforestation, deforestation, forêt boréale, boreal forest, ~océan, océans, ~ocean, oceans, récif,
    coral reef, corail, coraux, coral, glacier, glaciers, banquise, sea ice, pergélisol, permafrost, pollution, polluants, pollutants, ~plastique, ~plastic,
    microplastiques, microplastics, pesticides, énergie renouvelable, énergies renouvelables, renewable energy, renewables, énergie solaire, solar power,
    énergie éolienne, wind power, wind farm, parc éolien, ~environnement, ~environment, environmental, environnemental, environnementale, environnementaux,
    écologie, écologique, ecology, ecological, Greenpeace, Équiterre, Environnement Canada, Environment Canada, qualité de l'air, air quality, smog,
    ~caribou, ~baleine, ~baleines, ~whale, ~whales, espèces envahissantes, invasive species, ~faune, ~wildlife`,
  disaster: `séisme, séismes, earthquake, earthquakes, tremblement de terre, tremblements de terre, tsunami, ouragan, ouragans, hurricane, hurricanes, typhon,
    typhoon, cyclone, tornade, tornades, tornado, tornadoes, inondation, inondations, flood, floods, flooding, ~crue, ~crues, feux de forêt, feu de forêt,
    incendie de forêt, incendies de forêt, wildfire, wildfires, forest fire, forest fires, sécheresse, drought, canicule, heatwave, heat wave, vague de chaleur,
    éruption, eruption, volcan, volcano, volcanique, volcanic, glissement de terrain, glissements de terrain, landslide, landslides, coulée de boue, mudslide,
    avalanche, avalanches, tempête tropicale, tropical storm, tempête de verglas, ice storm, ~verglas, blizzard, tempête hivernale, winter storm,
    catastrophe naturelle, catastrophes naturelles, natural disaster, natural disasters, alerte au tsunami, tsunami warning, ~magnitude, ~Richter, SOPFEU`,
};

const CASE_SENSITIVE = new Set(['ia', 'ai', 'agi', 'llm', 'llms', 'esa', 'nasa', 'cern', 'adn', 'dna', 'mars', 'lune', 'moon', 'venus', 'mila', 'cohere', 'gemini', 'grok']);
const PATTERNS = Object.fromEntries(Object.entries(KEYWORDS).map(([k, v]) => [k, compileKeywords(v)]));
const THRESHOLD = 2;

// Scores bruts par thème et sous-thème pour un article. Un flux spécialisé
// (feedTopic) garantit son thème; les sous-thèmes nourrissent leur thème parent.
export function tagTopics(article) {
  const raw = {};
  for (const key of Object.keys(PATTERNS)) {
    raw[key] = 2 * countKeywords(article.title, PATTERNS[key], CASE_SENSITIVE) + countKeywords(article.description, PATTERNS[key], CASE_SENSITIVE);
  }
  if (article.feedTopic && article.feedTopic in raw) raw[article.feedTopic] += THRESHOLD;
  for (const [sub, parent] of Object.entries(SUBTOPICS)) raw[parent] += raw[sub];
  return Object.keys(raw).filter((k) => raw[k] >= THRESHOLD);
}

// Une histoire reçoit un thème si au moins un tiers de ses articles le portent.
export function clusterTopics(articleTopics) {
  const counts = {};
  for (const list of articleTopics) for (const t of list) counts[t] = (counts[t] || 0) + 1;
  const keep = (k) => (counts[k] || 0) / articleTopics.length >= 0.34;
  const topics = TOPICS.filter(keep);
  const subtopics = Object.keys(SUBTOPICS).filter((s) => keep(s) && topics.includes(SUBTOPICS[s]));
  return { topics, subtopics };
}
