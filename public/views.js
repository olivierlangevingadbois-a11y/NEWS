import {
  REGION_LABEL, REGION_ORDER, TOPIC_LABEL, TOPIC_ORDER, SUBTOPIC_LABEL, TOPIC_SUBTOPICS, BIAS, BIAS_BY_KEY, COUNTRY, OWNERSHIP, FACT, FACT_SCORE, PAYWALL,
  bucketOf, sideOf, esc, safeUrl, fold, plural, timeAgo, store, biasBar, biasSummary, biasLegend, sideCounts,
} from './lib.js';

// ---------- Filtres selon les préférences ----------

export function visibleArticles(story, ctx) {
  const { prefs, sourcesById } = ctx;
  return story.articles.filter((a) => {
    if (prefs.hidePaywall && sourcesById[a.source]?.paywall === 'hard') return false;
    if (prefs.lang === 'fr-only' && a.lang !== 'fr') return false;
    return true;
  });
}

export function visibleStories(stories, ctx) {
  return stories.filter((s) => visibleArticles(s, ctx).length > 0);
}

// Titre affiché : le titre principal, ou le premier titre visible s'il est masqué par les filtres.
function displayTitle(story, ctx) {
  const arts = visibleArticles(story, ctx);
  if (arts.some((a) => a.title === story.title)) return story.title;
  const fr = arts.find((a) => a.lang === 'fr');
  return (fr || arts[0] || story).title;
}

// ---------- Composants ----------

function flags(story) {
  const out = [];
  if (story.blindspot) out.push(`<span class="flag blind" title="Histoire presque ignorée par les médias de ${story.blindspot === 'right' ? 'droite' : 'gauche'}">Angle mort : ${story.blindspot === 'right' ? 'droite' : 'gauche'}</span>`);
  if (story.solitude) out.push(`<span class="flag solitude" title="Au Canada, seuls les médias ${story.solitude === 'en' ? 'anglophones' : 'francophones'} en parlent">Couverte seulement en ${story.solitude === 'en' ? 'anglais' : 'français'}</span>`);
  if (story.foreign >= 2) out.push(`<span class="flag" title="Médias étrangers qui couvrent cette histoire canadienne">Vu d'ailleurs : ${story.foreign}</span>`);
  if (story.summary?.ai) out.push('<span class="flag ai">Résumé IA</span>');
  return out.join('');
}

function kicker(story) {
  const place = REGION_LABEL[story.region];
  const sub = (story.subtopics || [])[0];
  const theme = sub ? SUBTOPIC_LABEL[sub] : TOPIC_LABEL[(story.topics || [])[0]];
  const parts = [];
  if (place || !theme) parts.push(`<span class="region">${esc(place || 'Monde')}</span>`);
  if (theme) parts.push(`<span class="topic">${esc(theme)}</span>`);
  return `<div class="kicker">${parts.join('')}<span>${esc(timeAgo(story.updated))}</span></div>`;
}

export function storyCard(story, ctx, { hero = false, headingLevel = 3 } = {}) {
  const h = `h${hero ? 2 : headingLevel}`;
  const img = story.image ? `<img class="thumb" src="${esc(safeUrl(story.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  const langs = [story.langs.fr ? `FR ${story.langs.fr}` : '', story.langs.en ? `EN ${story.langs.en}` : ''].filter(Boolean).join(' · ');
  const body = `
    ${kicker(story)}
    <${h}><a href="#/histoire/${esc(story.id)}">${esc(displayTitle(story, ctx))}</a></${h}>
    ${hero && story.lead ? `<p class="lead">${esc(story.lead)}</p>` : ''}
    ${biasBar(story.bias)}
    <div class="meta"><strong>${plural(story.sourceCount, 'source', 'sources')}</strong><span>${esc(biasSummary(story.bias))}</span><span>${esc(langs)}</span>${flags(story)}</div>`;
  return hero
    ? `<article class="story hero">${img}<div class="body">${body}</div></article>`
    : `<article class="story"><div>${body}</div>${img}</article>`;
}

function miniList(stories, ctx, empty = 'Rien pour le moment.') {
  if (!stories.length) return `<p class="sub">${esc(empty)}</p>`;
  return `<ul class="mini">${stories.map((s) => `<li><a href="#/histoire/${esc(s.id)}">${esc(displayTitle(s, ctx))}</a>
    <div class="meta">${biasBar(s.bias)}</div><div class="meta"><span>${plural(s.sourceCount, 'source', 'sources')}</span><span>${esc(biasSummary(s.bias))}</span></div></li>`).join('')}</ul>`;
}

function briefsList(stories, ctx) {
  if (!stories.length) return '';
  return `<h2 class="section-title" style="margin-top:28px">Brèves · une seule source pour l'instant</h2>
    <ul class="briefs">${stories.map((s) => {
      const a = s.articles[0];
      const src = ctx.sourcesById[a.source];
      return `<li><a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener" data-read="${esc(a.source)}" data-story="${esc(s.id)}">${esc(a.title)}</a>
        <div class="src">${esc(src?.name || a.source)} · ${esc(timeAgo(a.published))}</div></li>`;
    }).join('')}</ul>`;
}

function demoNotice(ctx) {
  return ctx.meta?.demo ? `<div class="notice"><strong>Mode démonstration.</strong> Ces articles sont fictifs et servent à illustrer l'interface. Le site publié par GitHub Actions affiche les vraies nouvelles, actualisées toutes les 20 minutes.</div>` : '';
}

// ---------- Accueil ----------

export function renderHome(ctx) {
  const all = visibleStories(ctx.stories, ctx);
  const multi = all.filter((s) => s.sourceCount >= 2);
  if (!multi.length) return `${demoNotice(ctx)}<div class="empty">Aucune histoire pour le moment. Les flux sont peut-être en cours de récupération.</div>`;
  const [top, ...rest] = multi;
  const blind = multi.filter((s) => s.blindspot).slice(0, 4);
  const solitudes = multi.filter((s) => s.solitude).slice(0, 3);
  const abroad = multi.filter((s) => s.foreign >= 2).sort((a, b) => b.foreign - a.foreign).slice(0, 3);

  // Les blocs régionaux complètent la une sans répéter ce qui y figure déjà.
  const shown = new Set([top, ...rest.slice(0, 9)].map((s) => s.id));
  const byRegion = REGION_ORDER.map((r) => {
    const list = multi.filter((s) => s.region === r && !shown.has(s.id)).slice(0, 3);
    if (!list.length) return '';
    return `<section class="block"><div class="compare-head"><h2>${esc(REGION_LABEL[r])}</h2><a href="#/region/${r}">Tout voir →</a></div>
      <div class="stories">${list.map((s) => storyCard(s, ctx)).join('')}</div></section>`;
  }).join('');

  // Thèmes : les découvertes n'ont souvent qu'une source, on complète avec des brèves.
  const byTopic = TOPIC_ORDER.map((t) => {
    const pool = all.filter((s) => (s.topics || []).includes(t) && !shown.has(s.id));
    const list = [...pool.filter((s) => s.sourceCount >= 2), ...pool.filter((s) => s.sourceCount === 1)].slice(0, 3);
    if (!list.length) return '';
    return `<section class="block"><div class="compare-head"><h2>${esc(TOPIC_LABEL[t])}</h2><a href="#/theme/${t}">Tout voir →</a></div>
      <div class="stories">${list.map((s) => storyCard(s, ctx)).join('')}</div></section>`;
  }).join('');

  return `${demoNotice(ctx)}
  <div class="layout">
    <div>
      <h1 class="section-title">À la une</h1>
      <div class="stories">${storyCard(top, ctx, { hero: true })}${rest.slice(0, 9).map((s) => storyCard(s, ctx)).join('')}</div>
      <div style="margin-top:36px">${byRegion}${byTopic}</div>
    </div>
    <aside class="side">
      <div class="panel"><div class="stats">
        <div><b>${multi.length}</b><span>histoires</span></div>
        <div><b>${ctx.meta?.articleCount ?? '–'}</b><span>articles</span></div>
        <div><b>${ctx.meta ? `${ctx.meta.feeds.ok}/${ctx.meta.feeds.total}` : '–'}</b><span>flux actifs</span></div>
      </div></div>
      <div class="panel"><h2>Angles morts</h2><p class="sub">Couvertes par un seul côté du spectre.</p>${miniList(blind, ctx)}<p class="sub" style="margin:12px 0 0"><a href="#/angles-morts">Tous les angles morts →</a></p></div>
      <div class="panel"><h2>Deux solitudes</h2><p class="sub">Au Canada, couvertes dans une seule langue.</p>${miniList(solitudes, ctx)}</div>
      <div class="panel"><h2>Le Canada vu d'ailleurs</h2><p class="sub">Histoires canadiennes reprises par la presse étrangère.</p>${miniList(abroad, ctx)}</div>
    </aside>
  </div>`;
}

// ---------- Région ----------

export function renderRegion(ctx, region) {
  const all = visibleStories(ctx.stories, ctx).filter((s) => s.regions.includes(region));
  const multi = all.filter((s) => s.sourceCount >= 2);
  const briefs = all.filter((s) => s.sourceCount === 1);
  const blind = multi.filter((s) => s.blindspot).slice(0, 5);
  const abroad = region === 'canada' || region === 'quebec' ? multi.filter((s) => s.foreign >= 2).slice(0, 5) : [];
  const intros = {
    quebec: "L'actualité québécoise, de Radio-Canada au Journal de Montréal, en passant par la Gazette.",
    canada: "Le Canada, ici et dans le monde : ce qu'en disent les médias d'ici et d'ailleurs.",
    us: 'Les États-Unis vus par les médias américains de toutes tendances, et par nous.',
    europe: "L'Europe, de Paris à Kyiv, avec la presse européenne francophone et anglophone.",
    asia: "L'Asie et le Moyen-Orient, incluant les médias de la région et les médias d'État, identifiés comme tels.",
    africa: "L'Afrique, avec la presse africaine et la presse francophone internationale.",
    oceania: "L'Océanie, de Canberra à Nouméa.",
  };
  return `${demoNotice(ctx)}
  <div class="page-head"><h1>${esc(REGION_LABEL[region])}</h1><p>${esc(intros[region])}</p></div>
  <div class="layout">
    <div>
      ${multi.length ? `<div class="stories">${multi.map((s, i) => storyCard(s, ctx, { hero: i === 0 && Boolean(s.image), headingLevel: 2 })).join('')}</div>` : '<div class="empty">Aucune histoire multi-sources pour cette région en ce moment.</div>'}
      ${briefsList(briefs, ctx)}
    </div>
    <aside class="side">
      ${abroad.length ? `<div class="panel"><h2>Vu d'ailleurs</h2><p class="sub">Reprises par la presse étrangère.</p>${miniList(abroad, ctx)}</div>` : ''}
      <div class="panel"><h2>Angles morts</h2><p class="sub">Dans cette région.</p>${miniList(blind, ctx)}</div>
    </aside>
  </div>`;
}

// ---------- Thèmes : sciences, IA, environnement ----------

const TOPIC_INTRO = {
  science: 'Découvertes, inventions, espace, santé : la recherche vue par la presse scientifique et généraliste, en français et en anglais.',
  ai: "L'intelligence artificielle : percées, entreprises, encadrement, et ce que ça change ici.",
  environment: 'Climat, biodiversité, énergie et catastrophes naturelles, avec la presse spécialisée et généraliste de toutes tendances.',
};

export function renderTopic(ctx, topic) {
  const subs = TOPIC_SUBTOPICS[topic];
  const sub = subs.includes(ctx.ui.subtopic) ? ctx.ui.subtopic : null;
  const all = visibleStories(ctx.stories, ctx).filter((s) => (s.topics || []).includes(topic) && (!sub || (s.subtopics || []).includes(sub)));
  const multi = all.filter((s) => s.sourceCount >= 2);
  const briefs = all.filter((s) => s.sourceCount === 1).slice(0, 40);
  const local = multi.filter((s) => s.regions.includes('quebec') || s.regions.includes('canada')).slice(0, 5);
  const blind = multi.filter((s) => s.blindspot).slice(0, 5);
  const specialists = ctx.sources.filter((s) => (s.topics || []).includes(topic)).sort((a, b) => b.articles - a.articles);
  const chip = (value, label) => `<button type="button" data-subtopic="${value}" aria-pressed="${(sub || '') === value}">${esc(label)}</button>`;
  const empty = sub ? `Rien en ce moment dans « ${SUBTOPIC_LABEL[sub]} ».` : 'Aucune histoire multi-sources sur ce thème en ce moment.';

  return `${demoNotice(ctx)}
  <div class="page-head"><h1>${esc(TOPIC_LABEL[topic])}</h1><p>${esc(TOPIC_INTRO[topic])}</p></div>
  ${subs.length ? `<div class="seg" role="group" aria-label="Sous-thème" style="margin-bottom:16px">${chip('', 'Tout')}${subs.map((k) => chip(k, SUBTOPIC_LABEL[k])).join('')}</div>` : ''}
  <div class="layout">
    <div>
      ${multi.length ? `<div class="stories">${multi.map((s, i) => storyCard(s, ctx, { hero: i === 0 && Boolean(s.image), headingLevel: 2 })).join('')}</div>` : `<div class="empty">${esc(empty)}</div>`}
      ${briefsList(briefs, ctx)}
    </div>
    <aside class="side">
      <div class="panel"><h2>Ici</h2><p class="sub">Au Québec et au Canada.</p>${miniList(local, ctx)}</div>
      <div class="panel"><h2>Angles morts</h2><p class="sub">Sur ce thème.</p>${miniList(blind, ctx)}</div>
      ${specialists.length ? `<div class="panel"><h2>Sources spécialisées</h2><p class="sub">En plus des sections de la presse généraliste.</p>
        <div class="chips">${specialists.map((s) => `<a class="chip" href="${esc(safeUrl(s.site))}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join('')}</div></div>` : ''}
    </aside>
  </div>`;
}

// ---------- Détail d'une histoire ----------

function sourceLine(a, ctx) {
  const s = ctx.sourcesById[a.source] || { name: a.source };
  const b = BIAS_BY_KEY[bucketOf(s)];
  const info = [`Orientation : ${b.label}`, s.fact && `Fiabilité : ${FACT[s.fact]}`, s.own && `Propriété : ${s.own.name}`, s.country && COUNTRY[s.country]].filter(Boolean).join(' · ');
  const tags = [];
  if (s.paywall === 'hard' || s.paywall === 'metered') tags.push(`<span class="tag pay">${PAYWALL[s.paywall]}</span>`);
  if (s.fact === 'mixed' || s.fact === 'low') tags.push(`<span class="tag">Fiabilité ${FACT[s.fact].toLowerCase()}</span>`);
  if (a.tone > 0) tags.push(`<span class="tag tone" title="${esc(a.loaded?.length ? `Mots relevés : ${a.loaded.join(', ')}` : 'Ponctuation ou majuscules appuyées')}">Titre ${a.tone > 1 ? 'sensationnaliste' : 'chargé'}</span>`);
  return `<div class="src"><span class="dot" style="--c:${b.color}"></span><b title="${esc(info)}">${esc(s.name)}</b><span>${esc(COUNTRY[s.country] || '')} · ${a.lang.toUpperCase()} · ${esc(timeAgo(a.published))}</span>${tags.join('')}</div>`;
}

function articleItem(a, story, ctx) {
  return `<div class="article">${sourceLine(a, ctx)}
    <a class="title" href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener" data-read="${esc(a.source)}" data-story="${esc(story.id)}" lang="${a.lang === 'fr' ? 'fr' : 'en'}">${esc(a.title)}</a>
    ${a.excerpt ? `<p class="excerpt">${esc(a.excerpt)}</p>` : ''}</div>`;
}

function summaryBlock(story, ctx) {
  const s = story.summary;
  if (s?.ai) {
    const angle = (key, label, color) => (s.angles?.[key] ? `<div class="angle" style="--c:${color}"><b>${label}</b>${esc(s.angles[key])}</div>` : '');
    return `<section class="summary" aria-label="Résumé">
      <p>${esc(s.resume)}</p>
      ${s.points?.length ? `<ul>${s.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      <div class="angles">${angle('gauche', 'Cadrage à gauche', 'var(--bias-left)')}${angle('centre', 'Cadrage au centre', 'var(--bias-center)')}${angle('droite', 'Cadrage à droite', 'var(--bias-right)')}</div>
      ${s.divergences ? `<p><strong>Ce qui diverge :</strong> ${esc(s.divergences)}</p>` : ''}
      ${s.quebec ? `<p><strong>Pour le Québec :</strong> ${esc(s.quebec)}</p>` : ''}
      <p class="source-note">Résumé généré par IA à partir des ${story.sourceCount} articles ci-dessous. Il peut contenir des erreurs : consultez les sources.</p>
    </section>`;
  }
  if (!story.lead) return '';
  return `<section class="summary" aria-label="Extrait"><p>${esc(story.lead)}</p><p class="source-note">Extrait de ${esc(ctx.sourcesById[story.leadSource]?.name || '')}</p></section>`;
}

function coverageBlock(story, ctx) {
  const c = sideCounts(story.bias);
  let verdict = 'Couverture équilibrée entre la gauche et la droite.';
  if (story.blindspot === 'right') verdict = `Angle mort de la droite : ${c.left} média(s) de gauche en parlent, ${c.right} de droite.`;
  else if (story.blindspot === 'left') verdict = `Angle mort de la gauche : ${c.right} média(s) de droite en parlent, ${c.left} de gauche.`;
  else if (c.left + c.right === 0) verdict = 'Couverte surtout par des médias du centre.';
  else if (c.left > c.right * 2) verdict = 'Couverture penchant à gauche.';
  else if (c.right > c.left * 2) verdict = 'Couverture penchant à droite.';

  const langTotal = story.langs.fr + story.langs.en || 1;
  const origins = Object.entries(story.origins).sort((a, b) => b[1] - a[1]);
  const owners = Object.entries(story.ownership).sort((a, b) => b[1] - a[1]);
  const factKey = Object.entries(FACT_SCORE).sort((a, b) => Math.abs(a[1] - story.factuality) - Math.abs(b[1] - story.factuality))[0][0];
  const tone = story.toneBySide || {};
  const toneText = !Object.values(tone).some((v) => v > 0) ? '' : ['left', 'center', 'right'].filter((k) => tone[k] != null).map((k) => `${{ left: 'gauche', center: 'centre', right: 'droite' }[k]} ${tone[k]} %`).join(' · ');
  const first = ctx.sourcesById[story.firstBy];

  return `<div class="coverage">
    <div class="panel wide"><h3>Qui couvre cette histoire</h3>${biasBar(story.bias, { big: true })}${biasLegend(story.bias)}<p class="bias-summary">${esc(verdict)}</p></div>
    <div class="panel"><h3>Langue</h3>
      <div class="split"><span style="--c:var(--accent);flex:${story.langs.fr}"></span><span style="--c:var(--text-3);flex:${story.langs.en}"></span></div>
      <div class="kv"><span>Français</span><span>${story.langs.fr} (${Math.round((100 * story.langs.fr) / langTotal)} %)</span></div>
      <div class="kv"><span>Anglais</span><span>${story.langs.en} (${Math.round((100 * story.langs.en) / langTotal)} %)</span></div>
      ${story.solitude ? `<p class="bias-summary">Au Canada, seule la presse ${story.solitude === 'en' ? 'anglophone' : 'francophone'} en parle.</p>` : ''}</div>
    <div class="panel"><h3>Provenance</h3><div class="chips">${origins.map(([k, n]) => `<span class="chip">${esc(COUNTRY[k] || k)} <b>${n}</b></span>`).join('')}</div>
      ${story.foreign >= 1 ? `<p class="bias-summary">${plural(story.foreign, 'média étranger couvre', 'médias étrangers couvrent')} cette histoire canadienne.</p>` : ''}</div>
    <div class="panel"><h3>Propriété</h3>${owners.map(([k, n]) => `<div class="kv"><span>${esc(OWNERSHIP[k] || k)}</span><span>${n}</span></div>`).join('')}</div>
    <div class="panel"><h3>Fiabilité et accès</h3>
      <div class="kv"><span>Fiabilité moyenne</span><span>${esc(FACT[factKey])}</span></div>
      <div class="kv"><span>En accès libre</span><span>${story.paywall.free} sur ${story.sourceCount}</span></div>
      <div class="kv"><span>Premier à en parler</span><span>${esc(first?.name || '')}</span></div>
      ${toneText ? `<p class="bias-summary">Titres chargés ou sensationnalistes : ${esc(toneText)}</p>` : ''}</div>
  </div>`;
}

export function renderStory(ctx, id) {
  const story = ctx.stories.find((s) => s.id === id);
  if (!story) return `<a class="back" href="#/">← À la une</a><div class="empty">Cette histoire n'est plus dans la fenêtre des 72 dernières heures, ou son identifiant a changé.</div>`;
  const arts = visibleArticles(story, ctx);
  const hidden = story.articles.length - arts.length;
  const langFilter = ctx.ui.storyLang || 'all';
  const shown = arts.filter((a) => langFilter === 'all' || a.lang === langFilter);
  const sortLang = (list) => (ctx.prefs.lang === 'all' ? list : [...list].sort((a, b) => (a.lang === 'fr' ? 0 : 1) - (b.lang === 'fr' ? 0 : 1)));

  const groups = [
    { key: 'left', label: 'Gauche', color: 'var(--bias-left)' },
    { key: 'center', label: 'Centre', color: 'var(--bias-center)' },
    { key: 'right', label: 'Droite', color: 'var(--bias-right)' },
    { key: 'state', label: "Médias d'État", color: 'var(--bias-state)' },
    { key: 'unrated', label: 'Non classés', color: 'var(--text-3)' },
  ].map((g) => ({ ...g, items: sortLang(shown.filter((a) => sideOf(bucketOf(ctx.sourcesById[a.source])) === g.key)) }))
    .filter((g) => g.items.length || ['left', 'center', 'right'].includes(g.key));

  const column = (g) => {
    const limit = ctx.ui.expanded?.[g.key] ? Infinity : 6;
    return `<div class="col"><div class="col-head" style="--c:${g.color}">${esc(g.label)} <span>${g.items.length}</span></div>
      ${g.items.length ? g.items.slice(0, limit).map((a) => articleItem(a, story, ctx)).join('') : `<div class="col-empty">Aucun média de ce côté ne couvre cette histoire${langFilter !== 'all' ? ' dans cette langue' : ''}.</div>`}
      ${g.items.length > limit ? `<button class="more-btn" data-expand="${g.key}">Voir ${g.items.length - limit} de plus</button>` : ''}</div>`;
  };

  const seg = (v, label) => `<button type="button" data-story-lang="${v}" aria-pressed="${langFilter === v}">${label}</button>`;
  const img = story.image ? `<img class="hero-img" src="${esc(safeUrl(story.image))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : '';

  return `<article class="detail">
    <a class="back" href="#/" data-back>← Retour</a>
    <div class="kicker">${story.regions.map((r) => `<a class="region" href="#/region/${r}">${esc(REGION_LABEL[r])}</a>`).join('')}${(story.topics || []).map((t) => `<a class="topic" href="#/theme/${t}">${esc(TOPIC_LABEL[t])}</a>`).join('')}<span>Première mention ${esc(timeAgo(story.firstSeen))}</span><span>Mise à jour ${esc(timeAgo(story.updated))}</span></div>
    <h1>${esc(displayTitle(story, ctx))}</h1>
    <div class="meta">${flags(story)}</div>
    ${img}
    ${summaryBlock(story, ctx)}
    ${coverageBlock(story, ctx)}
    <section>
      <div class="compare-head"><h2>Comparer les titres</h2>
        <div class="seg" role="group" aria-label="Langue des articles">${seg('all', 'Toutes')}${seg('fr', 'Français')}${seg('en', 'English')}</div></div>
      ${hidden ? `<p class="sub" style="color:var(--text-3);font-size:.85rem">${plural(hidden, 'article masqué', 'articles masqués')} selon vos préférences (langue ou abonnement).</p>` : ''}
      <div class="columns" style="--cols:${groups.length}">${groups.map(column).join('')}</div>
    </section>
  </article>`;
}

// ---------- Angles morts ----------

export function renderBlindspots(ctx) {
  const multi = visibleStories(ctx.stories, ctx).filter((s) => s.sourceCount >= 2);
  const ignoredByRight = multi.filter((s) => s.blindspot === 'right');
  const ignoredByLeft = multi.filter((s) => s.blindspot === 'left');
  const enOnly = multi.filter((s) => s.solitude === 'en');
  const frOnly = multi.filter((s) => s.solitude === 'fr');
  const list = (arr, msg) => (arr.length ? `<div class="stories">${arr.map((s) => storyCard(s, ctx)).join('')}</div>` : `<div class="empty">${esc(msg)}</div>`);
  return `${demoNotice(ctx)}
  <div class="page-head"><h1>Angles morts</h1><p>Ce que votre camp ne vous montre peut-être pas. Accès illimité, sans abonnement.</p></div>
  <section class="block"><div class="grid-2">
    <div><h2 class="section-title">Ignorées par la droite</h2>${list(ignoredByRight, 'Aucune histoire ignorée par la droite en ce moment.')}</div>
    <div><h2 class="section-title">Ignorées par la gauche</h2>${list(ignoredByLeft, 'Aucune histoire ignorée par la gauche en ce moment.')}</div>
  </div></section>
  <section class="block"><h2>Deux solitudes</h2><p>Histoires canadiennes couvertes par les médias d'une seule langue officielle.</p><div class="grid-2">
    <div><h2 class="section-title">Seulement en anglais</h2>${list(enOnly, 'Rien en ce moment.')}</div>
    <div><h2 class="section-title">Seulement en français</h2>${list(frOnly, 'Rien en ce moment.')}</div>
  </div></section>`;
}

// ---------- Sources et méthodologie ----------

export function renderSources(ctx) {
  const f = ctx.ui.sourceFilter || { q: '', country: '', sort: 'name' };
  let rows = ctx.sources.filter((s) => (!f.q || fold(`${s.name} ${s.own.name}`).includes(fold(f.q))) && (!f.country || s.country === f.country));
  const sorters = {
    name: (a, b) => a.name.localeCompare(b.name, 'fr'),
    bias: (a, b) => (a.bias ?? 9) - (b.bias ?? 9),
    fact: (a, b) => FACT_SCORE[b.fact] - FACT_SCORE[a.fact],
    country: (a, b) => (COUNTRY[a.country] || '').localeCompare(COUNTRY[b.country] || '', 'fr'),
    articles: (a, b) => b.articles - a.articles,
  };
  rows = rows.sort(sorters[f.sort] || sorters.name);
  const countries = [...new Set(ctx.sources.map((s) => s.country))].sort((a, b) => (COUNTRY[a] || a).localeCompare(COUNTRY[b] || b, 'fr'));
  const th = (key, label) => `<th scope="col" data-sort="${key}" aria-sort="${f.sort === key ? 'ascending' : 'none'}">${label}</th>`;

  return `<div class="page-head"><h1>Sources et méthodologie</h1><p>${ctx.sources.length} médias, ${plural(ctx.sources.reduce((n, s) => n + s.feeds.length, 0), 'flux', 'flux')}. Tout est visible gratuitement : orientation, fiabilité, propriétaire, accès.</p></div>
  <details class="method" open><summary>Comment fonctionne Prisme</summary>
    <ul>
      <li><strong>Regroupement.</strong> Toutes les 20 minutes, Prisme lit les flux RSS des médias ci-dessous et regroupe les articles qui parlent du même événement, en français comme en anglais (vocabulaire bilingue et noms propres).</li>
      <li><strong>Orientation.</strong> Chaque média reçoit une orientation de −3 (gauche) à +3 (droite), <em>relative au spectre politique de son pays</em> : le « centre » français n'est pas le « centre » américain. Ce sont des estimations éditoriales inspirées d'évaluations publiques (AllSides, Ad Fontes Media, Media Bias/Fact Check) et adaptées au contexte. Elles sont dans <code>config/sources.json</code> et peuvent être corrigées.</li>
      <li><strong>Médias d'État.</strong> Les médias contrôlés par un gouvernement autoritaire (TASS, Global Times) ne sont pas placés sur l'axe gauche-droite : ils forment une colonne à part, parce qu'ils relaient une ligne officielle.</li>
      <li><strong>Au-delà de la gauche et de la droite.</strong> Chaque histoire montre aussi la langue, le pays d'origine et le type de propriétaire des médias qui la couvrent, pour éviter de tout réduire à un seul axe.</li>
      <li><strong>Thèmes.</strong> Sciences, intelligence artificielle et environnement sont repérés par un vocabulaire bilingue et par les flux des médias spécialisés. Une histoire peut être à la fois « Québec » et « Environnement ». Dans un article sur une catastrophe naturelle, les mots comme « dévastateur » décrivent les faits : ils ne comptent pas dans le ton.</li>
      <li><strong>Ton par article.</strong> Le ton est évalué pour chaque titre, pas pour le média : un titre factuel d'un média partisan n'est pas pénalisé, et un titre sensationnaliste est signalé où qu'il soit publié.</li>
      <li><strong>Angles morts.</strong> Une histoire est un angle mort quand au moins trois médias d'un côté la couvrent et que l'autre côté l'ignore presque (15 % ou moins). Les « deux solitudes » sont les histoires canadiennes couvertes dans une seule langue officielle.</li>
      <li><strong>Résumés.</strong> Si une clé API est configurée, un résumé neutre est généré par IA pour les histoires les plus couvertes, avec le cadrage de chaque camp. Il est toujours identifié comme tel.</li>
      <li><strong>Vie privée.</strong> Aucun compte ni témoin de pistage. Votre profil de lecture est calculé et conservé dans votre navigateur seulement.</li>
    </ul>
  </details>
  <div class="filters">
    <input type="search" id="source-q" placeholder="Filtrer par nom ou propriétaire" value="${esc(f.q)}" aria-label="Filtrer les sources">
    <select id="source-country" aria-label="Pays"><option value="">Tous les pays</option>${countries.map((c) => `<option value="${c}" ${f.country === c ? 'selected' : ''}>${esc(COUNTRY[c] || c)}</option>`).join('')}</select>
  </div>
  <div class="table-wrap"><table>
    <thead><tr>${th('name', 'Média')}${th('country', 'Pays')}${th('bias', 'Orientation')}${th('fact', 'Fiabilité')}<th scope="col">Propriété</th><th scope="col">Accès</th>${th('articles', 'Flux')}</tr></thead>
    <tbody>${rows.map((s) => {
      const b = BIAS_BY_KEY[bucketOf(s)];
      const ok = s.feeds.filter((x) => x.ok).length;
      const errs = s.feeds.filter((x) => x.ok === false).map((x) => x.error).filter(Boolean).join(' ; ');
      return `<tr>
        <td><a href="${esc(safeUrl(s.site))}" target="_blank" rel="noopener"><b>${esc(s.name)}</b></a> <span class="muted">${s.lang.toUpperCase()}</span>${s.topics?.length ? `<div class="muted">Spécialisé : ${esc(s.topics.map((t) => TOPIC_LABEL[t]).join(', '))}</div>` : ''}${s.note ? `<div class="muted">${esc(s.note)}</div>` : ''}</td>
        <td>${esc(COUNTRY[s.country] || s.country)}</td>
        <td><span class="dot" style="--c:${b.color}"></span> ${esc(b.label)}${s.qcAxis ? `<div class="muted">${esc({ federalist: 'Fédéraliste', nationalist: 'Nationaliste', neutral: 'Neutre sur la question nationale' }[s.qcAxis])}</div>` : ''}</td>
        <td>${esc(FACT[s.fact])}</td>
        <td>${esc(s.own.name)}<div class="muted">${esc(OWNERSHIP[s.own.type])}</div></td>
        <td>${esc(PAYWALL[s.paywall])}</td>
        <td class="${ok === s.feeds.length ? 'health-ok' : 'health-bad'}" title="${esc(errs)}">${ok}/${s.feeds.length}<div class="muted">${plural(s.articles, 'article', 'articles')}</div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

// ---------- Mon profil (local) ----------

export function recordRead(sourceId, storyId) {
  const log = store.get('reads', []);
  log.push({ s: sourceId, h: storyId, t: Date.now() });
  store.set('reads', log.slice(-1500));
}

function bars(rows, total) {
  return `<div class="bars">${rows.map(([label, n, color]) => `<div class="bar-row"><span>${esc(label)}</span><div class="track"><div class="fill" style="width:${total ? (100 * n) / total : 0}%;${color ? `--c:${color}` : ''}"></div></div><span>${total ? Math.round((100 * n) / total) : 0} %</span></div>`).join('')}</div>`;
}

export function renderProfile(ctx) {
  const reads = store.get('reads', []).filter((r) => ctx.sourcesById[r.s]);
  const head = `<div class="page-head"><h1>Mon régime médiatique</h1><p>Calculé à partir des articles que vous ouvrez depuis Prisme. Rien ne quitte votre appareil.</p></div>`;
  if (!reads.length) return `${head}<div class="empty">Ouvrez quelques articles depuis Prisme : votre portrait de lecture apparaîtra ici.</div>`;

  const bias = Object.fromEntries(BIAS.map((b) => [b.key, 0]));
  const langs = { fr: 0, en: 0 };
  const origins = {}, owners = {}, bySource = {};
  let paid = 0;
  for (const r of reads) {
    const s = ctx.sourcesById[r.s];
    const k = bucketOf(s);
    if (k in bias) bias[k]++;
    langs[s.lang]++;
    origins[s.country] = (origins[s.country] || 0) + 1;
    owners[s.own.type] = (owners[s.own.type] || 0) + 1;
    bySource[s.id] = (bySource[s.id] || 0) + 1;
    if (s.paywall !== 'free') paid++;
  }
  const n = reads.length;
  const c = sideCounts(bias);
  const suggestions = [];
  const pick = (pred) => ctx.sources.filter(pred).sort((a, b) => FACT_SCORE[b.fact] - FACT_SCORE[a.fact] || b.articles - a.articles).slice(0, 3).map((s) => s.name).join(', ');
  if (n >= 8 && c.right / n < 0.15) suggestions.push(`Vous lisez peu la droite. Des sources fiables de centre droit : ${pick((s) => s.bias === 1 && FACT_SCORE[s.fact] >= 4)}.`);
  if (n >= 8 && c.left / n < 0.15) suggestions.push(`Vous lisez peu la gauche. Des sources fiables de centre gauche : ${pick((s) => s.bias === -1 && FACT_SCORE[s.fact] >= 4)}.`);
  if (n >= 8 && langs.en / n > 0.8) suggestions.push(`Vous lisez surtout en anglais. En français : ${pick((s) => s.lang === 'fr' && s.country === 'QC' && FACT_SCORE[s.fact] >= 4)}.`);
  if (n >= 8 && langs.fr / n > 0.9) suggestions.push(`Vous lisez presque tout en français. Pour l'autre solitude : ${pick((s) => s.lang === 'en' && ['QC', 'CA'].includes(s.country) && FACT_SCORE[s.fact] >= 4)}.`);
  const domestic = (origins.QC || 0) + (origins.CA || 0);
  if (n >= 8 && domestic / n > 0.85) suggestions.push(`Presque tout vient du Canada. Un regard extérieur : ${pick((s) => ['FR', 'GB', 'DE', 'CH', 'BE'].includes(s.country) && FACT_SCORE[s.fact] >= 4 && s.paywall === 'free')}.`);

  const top = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const since = new Date(Math.min(...reads.map((r) => r.t))).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' });

  return `${head}
  <div class="profile-grid">
    <div class="panel" style="grid-column:1/-1"><h2>Orientation de vos lectures</h2><p class="sub">${plural(n, 'article lu', 'articles lus')} depuis le ${esc(since)}</p>${biasBar(bias, { big: true })}${biasLegend(bias)}</div>
    <div class="panel"><h2>Langue</h2>${bars([['Français', langs.fr, 'var(--accent)'], ['Anglais', langs.en, 'var(--text-3)']], n)}</div>
    <div class="panel"><h2>Provenance</h2>${bars(Object.entries(origins).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [COUNTRY[k] || k, v]), n)}</div>
    <div class="panel"><h2>Propriétaires</h2>${bars(Object.entries(owners).sort((a, b) => b[1] - a[1]).map(([k, v]) => [OWNERSHIP[k] || k, v]), n)}</div>
    <div class="panel"><h2>Vos sources</h2>${bars(top.map(([k, v]) => [ctx.sourcesById[k].name, v]), n)}<p class="sub" style="margin-top:10px">${Math.round((100 * paid) / n)} % de vos lectures sur des sites à accès limité ou payant.</p></div>
  </div>
  ${suggestions.length ? `<div class="panel" style="margin-bottom:20px"><h2>Pour élargir vos horizons</h2>${suggestions.map((t) => `<p class="suggest">${esc(t)}</p>`).join('')}</div>` : ''}
  <button class="btn danger" id="clear-history" type="button">Effacer mon historique</button>`;
}

// ---------- Recherche ----------

export function renderSearch(ctx, q) {
  const terms = fold(q).split(/\s+/).filter(Boolean);
  const results = visibleStories(ctx.stories, ctx).filter((s) => {
    const hay = fold(`${s.title} ${s.keywords.join(' ')} ${s.articles.map((a) => a.title).join(' ')}`);
    return terms.every((t) => hay.includes(t));
  });
  return `<div class="page-head"><h1>« ${esc(q)} »</h1><p>${plural(results.length, 'histoire trouvée', 'histoires trouvées')} dans les ${ctx.meta?.windowHours || 72} dernières heures.</p></div>
    ${results.length ? `<div class="stories">${results.map((s) => storyCard(s, ctx, { headingLevel: 2 })).join('')}</div>` : '<div class="empty">Aucun résultat. Essayez un nom propre ou un lieu.</div>'}`;
}
