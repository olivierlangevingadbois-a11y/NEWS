# Prisme — l'actualité sous tous ses angles

Prisme est un agrégateur de nouvelles centré sur le Québec, inspiré de Ground News. Il regroupe automatiquement les articles de **135 médias** (192 flux RSS), en français d'abord et en anglais aussi, et montre pour chaque histoire **qui la couvre et comment**.

Régions : **Québec · Canada (ici et dans le monde) · États-Unis · Europe · Asie et Moyen-Orient · Afrique · Océanie**.

Thèmes : **Sciences** (découvertes, inventions, espace, santé) · **Intelligence artificielle** · **Environnement** (climat, biodiversité, catastrophes naturelles). Une histoire peut appartenir à une région et à un thème à la fois.

Le site s'actualise tout seul : une tâche GitHub Actions relit les flux **toutes les 20 minutes** et republie le site sur GitHub Pages. Les pages ouvertes vérifient les nouveautés toutes les 2 minutes et proposent de les afficher, sans vous faire perdre votre place.

## Ce que Prisme fait mieux que Ground News

| Critique de Ground News | Ce que fait Prisme |
|---|---|
| Interface chargée | Cartes épurées : un titre, une barre d'orientation, le nombre de sources. Les détails sont dans la page de l'histoire. |
| Cote d'orientation appliquée à tout le média | Le **ton est évalué pour chaque titre** (« Titre chargé », « Titre sensationnaliste », avec les mots relevés). Un titre factuel d'un média partisan n'est pas pénalisé. |
| Tout réduit à gauche contre droite | Chaque histoire montre aussi la **langue**, le **pays d'origine**, le **type de propriétaire** (public, coopérative, OBNL, milliardaire, fonds, grand groupe). Les **médias d'État** (TASS, Global Times) forment une colonne à part au lieu d'être placés à gauche ou à droite. Les cotes sont **relatives au pays** : le centre français n'est pas le centre américain. |
| Angles morts limités à 6 par jour | **Angles morts illimités et gratuits**, et un angle mort propre au Canada : les **deux solitudes**, soit les histoires couvertes seulement par la presse anglophone ou seulement par la francophone. |
| Fiabilité et propriétaires réservés aux abonnés | Tout est visible, pour tous : fiabilité, propriétaire, type d'accès, état de chaque flux. |
| Murs payants | Chaque article affiche « Abonnement » ou « Accès limité ». Une préférence masque les sites à abonnement obligatoire. Les liens vont directement à la source, sans navigateur intégré. |
| Tableau de bord personnel payant | **Mon régime médiatique** est gratuit et privé : calculé dans votre navigateur (orientation, langue, provenance, propriétaires), avec des suggestions pour élargir vos horizons. Aucun compte ni pistage. |
| Résumés réservés aux abonnés | Résumés IA optionnels : un résumé neutre, les faits clés, le **cadrage de chaque camp**, ce qui diverge et, au besoin, la pertinence pour le Québec. Toujours identifiés comme générés par IA. |
| — | **Le Canada vu d'ailleurs** : les histoires canadiennes reprises par la presse étrangère. |
| — | **Sciences, IA, environnement** : presse spécialisée (Québec Science, Agence Science-Presse, Nature, New Scientist, NASA, The Narwhal, Carbon Brief…) croisée avec la presse généraliste, filtres Espace, Santé et Catastrophes naturelles, et un encadré « Ici » pour l'angle québécois et canadien. |

## Mettre le site en ligne (5 minutes)

1. **Activer GitHub Pages** : *Settings → Pages → Build and deployment → Source : GitHub Actions*.
2. **Lancer la première actualisation** : *Actions → Actualiser Prisme → Run workflow*. Le site apparaît ensuite à `https://olivierlangevingadbois-a11y.github.io/NEWS/`.
3. *(Facultatif)* **Résumés IA** : ajoutez un secret `ANTHROPIC_API_KEY` dans *Settings → Secrets and variables → Actions*. Sans clé, Prisme affiche un extrait de l'article le plus représentatif.

> Les tâches planifiées de GitHub ne tournent que sur la **branche par défaut** du dépôt. Si ce code arrive par une autre branche, fusionnez-la dans la branche par défaut, ou faites-en la branche par défaut. GitHub suspend aussi les tâches planifiées d'un dépôt public après 60 jours sans activité : un simple commit ou un lancement manuel les réactive.

### Variables facultatives (*Settings → Secrets and variables → Actions → Variables*)

| Variable | Défaut | Rôle |
|---|---|---|
| `PRISME_MODEL` | `claude-opus-5-5` | Modèle utilisé pour les résumés |
| `PRISME_AI_LIMIT` | `8` | Nombre maximal de nouveaux résumés par actualisation |
| `PRISME_AI_MIN_SOURCES` | `4` | Nombre minimal de sources pour qu'une histoire soit résumée |

**Coût des résumés.** Un résumé est généré une seule fois par histoire. Il n'est refait que si la couverture a presque doublé. Comptez environ 2 à 4 cents US par résumé avec le modèle par défaut, soit quelques dollars par jour au plus avec les réglages ci-dessus. Baissez `PRISME_AI_LIMIT` ou montez `PRISME_AI_MIN_SOURCES` pour réduire la facture.

## Développement local

```bash
npm install
npm run demo    # construit dist/ avec des articles fictifs (aucun accès réseau requis)
npm run serve   # http://localhost:8080
npm run build   # construit avec les vrais flux (accès Internet requis)
npm test
```

## Comment ça marche

```
config/sources.json      Catalogue des médias : orientation, fiabilité, propriétaire, accès, flux
src/build.js             Orchestration : récupère → fusionne l'historique → regroupe → analyse → écrit dist/
src/pipeline/fetch.js    Lecture RSS / Atom / RDF, concurrence bornée, rapport de santé des flux
src/pipeline/text.js     Normalisation bilingue FR/EN (lexique commun, noms propres, racinisation)
src/pipeline/cluster.js  TF-IDF + regroupement agglomératif à liaison moyenne (histoires FR + EN réunies)
src/pipeline/geo.js      Attribution des régions (lieux, institutions, personnalités)
src/pipeline/topics.js   Thèmes : sciences (espace, santé), IA, environnement (catastrophes naturelles)
src/pipeline/tone.js     Ton de chaque titre (mots chargés, majuscules, points d'exclamation)
src/pipeline/analyze.js  Couverture par orientation, angles morts, deux solitudes, provenance, propriété
src/pipeline/summarize.js Résumés multiperspectives optionnels (API Claude), avec cache
public/                  Site statique sans cadriciel (HTML, CSS, modules JS)
```

- **Regroupement.** Les titres et descriptions sont convertis en vecteurs TF-IDF. Un lexique bilingue rapproche « droits de douane » et « tariffs », « Chine » et « China ». Deux groupes ne fusionnent que si leur similarité *moyenne* est suffisante, ce qui empêche un sujet large d'absorber des histoires distinctes.
- **Fenêtre.** Les 72 dernières heures. L'historique est conservé entre deux exécutions dans le cache de GitHub Actions.
- **Classement.** Nombre de sources, fraîcheur (demi-vie de 16 h) et un léger avantage pour le Québec et le Canada.

## Ajuster les sources

Tout est dans [`config/sources.json`](config/sources.json). Pour ajouter un média, copiez une entrée existante et fournissez :

- `bias` : de −3 (gauche) à +3 (droite), **relatif au pays du média**, ou `null` pour un média d'État ;
- `fact` : `very-high`, `high`, `mostly`, `mixed` ou `low` ;
- `own` : `type` (`public`, `state`, `nonprofit`, `coop`, `independent`, `family`, `corporate`, `fund`) et `name` ;
- `paywall` : `free`, `metered` ou `hard` ;
- `feeds` : URL des flux, avec une région facultative (`quebec`, `canada`, `us`, `europe`, `asia`, `africa`, `oceania`, `world`) et un thème facultatif (`science`, `space`, `health`, `ai`, `environment`, `disaster`) pour les flux spécialisés ;
- `topics` (facultatif) : les thèmes d'un média spécialisé, affichés dans la page Sources et dans l'encadré « Sources spécialisées ».

Les cotes fournies sont des estimations éditoriales inspirées d'évaluations publiques (AllSides, Ad Fontes Media, Media Bias/Fact Check) et adaptées au contexte de chaque pays. Elles se discutent et se corrigent.

Les médias changent parfois l'adresse de leurs flux. La page **Sources** du site indique, pour chaque média, combien de flux ont répondu à la dernière actualisation, et l'erreur au survol. Les journaux de GitHub Actions affichent aussi le décompte.

## Limites connues

- Le regroupement est statistique : deux histoires voisines peuvent parfois être réunies, ou une même histoire scindée, surtout entre langues.
- L'orientation d'un média est une simplification. Le ton par article et les autres dimensions (langue, provenance, propriété) servent à la nuancer.
- Les résumés IA ne s'appuient que sur les titres et extraits des flux, pas sur le texte complet des articles.
