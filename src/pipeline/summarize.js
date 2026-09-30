import Anthropic from '@anthropic-ai/sdk';
import { biasBucket } from './analyze.js';

// Résumés multiperspectives optionnels (activés si ANTHROPIC_API_KEY est défini).
// Mis en cache par histoire : on ne régénère que lorsque la couverture a
// nettement grandi, pour garder la facture basse à chaque actualisation.

const BIAS_LABEL = { left: 'gauche', cleft: 'centre gauche', center: 'centre', cright: 'centre droit', right: 'droite', state: "média d'État", unrated: 'non classé' };

const SCHEMA = {
  type: 'object',
  properties: {
    titre: { type: 'string', description: 'Titre neutre et factuel, en français, 90 caractères max.' },
    resume: { type: 'string', description: 'Résumé neutre de 2 à 3 phrases, en français.' },
    points: { type: 'array', items: { type: 'string' }, description: '3 faits clés rapportés par plusieurs sources.' },
    angles: {
      type: 'object',
      properties: { gauche: { type: 'string' }, centre: { type: 'string' }, droite: { type: 'string' } },
      required: ['gauche', 'centre', 'droite'],
      additionalProperties: false,
    },
    divergences: { type: 'string', description: 'Ce sur quoi les sources divergent ou ce que certaines omettent. Vide si rien de notable.' },
    quebec: { type: 'string', description: "Pourquoi c'est pertinent pour le Québec ou le Canada, seulement si les sources l'indiquent. Sinon vide." },
  },
  required: ['titre', 'resume', 'points', 'angles', 'divergences', 'quebec'],
  additionalProperties: false,
};

const SYSTEM = `Tu es le rédacteur de Prisme, un agrégateur de nouvelles québécois qui montre comment différents médias couvrent une même histoire.
On te donne les titres et extraits de plusieurs médias, avec leur orientation politique estimée.
Écris en français québécois standard, sur un ton neutre et factuel.
N'utilise que l'information fournie : n'ajoute aucun fait extérieur. Si les sources se contredisent, dis-le plutôt que de trancher.
Pour « angles », décris en une phrase comment les médias de ce camp cadrent l'histoire (choix des mots, ce qu'ils mettent de l'avant). Laisse la chaîne vide si aucun média de ce camp ne couvre l'histoire.`;

function overlap(a, b) {
  const sa = new Set(a);
  let n = 0;
  for (const x of b) if (sa.has(x)) n++;
  return n / Math.min(sa.size, b.length || 1);
}

function prompt(story, sourcesById) {
  const lines = story.articles.map((a) => {
    const s = sourcesById[a.source];
    return `- [${s.name} · ${BIAS_LABEL[biasBucket(s)]} · ${s.country}] ${a.title}${a.excerpt ? ` — ${a.excerpt}` : ''}`;
  });
  return `Histoire couverte par ${story.sourceCount} médias :\n${lines.join('\n')}`;
}

export function reuseCached(stories, cache) {
  const entries = Object.entries(cache);
  for (const story of stories) {
    const urls = story.articles.map((a) => a.url);
    let best = null;
    for (const [key, entry] of entries) {
      const o = overlap(entry.urls, urls);
      if (o >= 0.5 && (!best || o > best.o)) best = { key, entry, o };
    }
    if (best) {
      story.summary = best.entry.summary;
      story._summaryStale = story.sourceCount >= best.entry.sourceCount * 1.8 && story.sourceCount - best.entry.sourceCount >= 3;
    }
  }
}

export async function summarize(stories, sourcesById, cache, { limit = 8, minSources = 4, model = 'claude-opus-5-5', log = console.log, client } = {}) {
  reuseCached(stories, cache);
  if (!client && !process.env.ANTHROPIC_API_KEY) return { generated: 0, reason: 'ANTHROPIC_API_KEY absent' };
  client ??= new Anthropic();
  const todo = stories
    .filter((s) => s.sourceCount >= minSources && (!s.summary || s._summaryStale))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  let generated = 0;
  for (const story of todo) {
    try {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: prompt(story, sourcesById) }],
      });
      if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
        log(`  résumé ignoré (${response.stop_reason}) : ${story.title}`);
        continue;
      }
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      const summary = { ...JSON.parse(text), ai: true, at: new Date().toISOString() };
      story.summary = summary;
      cache[story.id] = { urls: story.articles.map((a) => a.url), sourceCount: story.sourceCount, summary };
      generated++;
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        log('  clé API refusée : résumés IA désactivés pour cette exécution');
        break;
      }
      if (err instanceof Anthropic.RateLimitError) {
        log('  limite de débit atteinte : on reprendra au prochain passage');
        break;
      }
      log(`  échec du résumé (${err instanceof Anthropic.APIError ? err.status : err.name}) : ${story.title}`);
    }
  }
  return { generated };
}

export function pruneCache(cache, stories) {
  const live = new Set(stories.filter((s) => s.summary?.ai).map((s) => s.id));
  const cutoff = Date.now() - 4 * 24 * 3.6e6;
  for (const [key, entry] of Object.entries(cache)) {
    if (!live.has(key) && Date.parse(entry.summary?.at || 0) < cutoff) delete cache[key];
  }
}
