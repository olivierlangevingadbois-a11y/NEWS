export const REGION_LABEL = {
  quebec: 'Québec', canada: 'Canada', us: 'États-Unis', europe: 'Europe', asia: 'Asie et Moyen-Orient', africa: 'Afrique', oceania: 'Océanie',
};
export const REGION_ORDER = ['quebec', 'canada', 'us', 'europe', 'asia', 'africa', 'oceania'];

export const TOPIC_LABEL = { science: 'Sciences', ai: 'Intelligence artificielle', environment: 'Environnement' };
export const TOPIC_ORDER = ['science', 'ai', 'environment'];
export const SUBTOPIC_LABEL = { space: 'Espace', health: 'Santé et médecine', disaster: 'Catastrophes naturelles' };
export const TOPIC_SUBTOPICS = { science: ['space', 'health'], ai: [], environment: ['disaster'] };

export const BIAS = [
  { key: 'left', label: 'Gauche', color: 'var(--bias-left)' },
  { key: 'cleft', label: 'Centre gauche', color: 'var(--bias-cleft)' },
  { key: 'center', label: 'Centre', color: 'var(--bias-center)' },
  { key: 'cright', label: 'Centre droit', color: 'var(--bias-cright)' },
  { key: 'right', label: 'Droite', color: 'var(--bias-right)' },
  { key: 'state', label: "Média d'État", color: 'var(--bias-state)' },
];
export const BIAS_BY_KEY = Object.fromEntries(BIAS.map((b) => [b.key, b]));
BIAS_BY_KEY.unrated = { key: 'unrated', label: 'Non classé', color: 'var(--text-3)' };

export const COUNTRY = {
  QC: 'Québec', CA: 'Canada', US: 'États-Unis', FR: 'France', GB: 'Royaume-Uni', BE: 'Belgique', CH: 'Suisse', DE: 'Allemagne', UA: 'Ukraine',
  RU: 'Russie', EU: 'Europe', QA: 'Qatar', HK: 'Hong Kong', IN: 'Inde', JP: 'Japon', SG: 'Singapour', KR: 'Corée du Sud', IL: 'Israël',
  PK: 'Pakistan', CN: 'Chine', LB: 'Liban', ZA: 'Afrique du Sud', NG: 'Nigeria', KE: 'Kenya', AU: 'Australie', NZ: 'Nouvelle-Zélande', NC: 'Nouvelle-Calédonie',
};
// Ville-siège des médias de chaque pays : point de départ des arcs de couverture du globe.
export const HUB = {
  QC: [-73.57, 45.5], CA: [-79.38, 43.65], US: [-74.0, 40.71], FR: [2.35, 48.86], GB: [-0.13, 51.51], BE: [4.35, 50.85], CH: [6.15, 46.2],
  DE: [13.4, 52.52], UA: [30.52, 50.45], RU: [37.62, 55.76], EU: [4.84, 45.76], QA: [51.53, 25.29], HK: [114.17, 22.32], IN: [77.21, 28.61],
  JP: [139.69, 35.68], SG: [103.82, 1.35], KR: [126.98, 37.57], IL: [35.21, 31.77], PK: [67.0, 24.86], CN: [116.4, 39.9], LB: [35.5, 33.89],
  ZA: [28.05, -26.2], NG: [7.5, 9.06], KE: [36.82, -1.29], AU: [151.21, -33.87], NZ: [174.78, -41.29], NC: [166.44, -22.27],
};
export const OWNERSHIP = {
  public: 'Radiodiffuseur public', state: 'Contrôlé par un État', nonprofit: 'OBNL ou fiducie', coop: 'Coopérative', independent: 'Indépendant',
  family: 'Famille ou milliardaire', corporate: 'Grand groupe', fund: "Fonds d'investissement",
};
export const FACT = { 'very-high': 'Très élevée', high: 'Élevée', mostly: 'Plutôt fiable', mixed: 'Mitigée', low: 'Faible' };
export const FACT_SCORE = { 'very-high': 5, high: 4, mostly: 3, mixed: 2, low: 1 };
export const PAYWALL = { free: 'Gratuit', metered: 'Accès limité', hard: 'Abonnement' };

export function bucketOf(source) {
  if (!source) return 'unrated';
  if (source.bias == null) return source.own?.type === 'state' ? 'state' : 'unrated';
  if (source.bias <= -2) return 'left';
  if (source.bias === -1) return 'cleft';
  if (source.bias === 0) return 'center';
  if (source.bias === 1) return 'cright';
  return 'right';
}
export const sideOf = (bucket) => (bucket === 'left' || bucket === 'cleft' ? 'left' : bucket === 'right' || bucket === 'cright' ? 'right' : bucket);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export function safeUrl(u) {
  try {
    const url = new URL(u, location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '#';
  } catch {
    return '#';
  }
}
export const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

export function timeAgo(iso, now = Date.now()) {
  const min = Math.round((now - Date.parse(iso)) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hier' : `il y a ${d} j`;
}

// Stockage local : peut être indisponible (navigation privée, blocage), jamais bloquant.
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`prisme.${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`prisme.${key}`, JSON.stringify(value)); } catch { /* stockage indisponible */ }
  },
  remove(key) {
    try { localStorage.removeItem(`prisme.${key}`); } catch { /* stockage indisponible */ }
  },
};

export function biasBar(bias, { big = false } = {}) {
  const segs = BIAS.filter((b) => bias[b.key] > 0);
  const total = segs.reduce((n, b) => n + bias[b.key], 0);
  if (!total) return '';
  const label = segs.map((b) => `${b.label} : ${bias[b.key]}`).join(', ');
  return `<div class="biasbar${big ? ' big' : ''}" role="img" aria-label="Couverture par orientation — ${esc(label)}">${segs
    .map((b) => `<span class="${b.key}" style="--c:${b.color};flex:${bias[b.key]}" title="${esc(b.label)} : ${bias[b.key]}"></span>`).join('')}</div>`;
}

export function sideCounts(bias) {
  return { left: bias.left + bias.cleft, center: bias.center, right: bias.cright + bias.right, state: bias.state };
}

export function biasSummary(bias) {
  const c = sideCounts(bias);
  const parts = [`Gauche ${c.left}`, `Centre ${c.center}`, `Droite ${c.right}`];
  if (c.state) parts.push(`État ${c.state}`);
  return parts.join(' · ');
}

export function biasLegend(bias) {
  return `<div class="bias-legend">${BIAS.filter((b) => bias[b.key] > 0 || b.key !== 'state')
    .map((b) => `<span class="item"><span class="swatch" style="--c:${b.color}"></span>${esc(b.label)} <b>${bias[b.key] || 0}</b></span>`).join('')}</div>`;
}
