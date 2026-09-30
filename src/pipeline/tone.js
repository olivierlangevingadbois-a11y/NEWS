import { normalize } from './text.js';

// Évaluation du ton *par article* (et non par média) : un titre factuel publié
// par un média partisan n'hérite pas de l'étiquette de son média.
const LOADED = `
choc choquant choquante scandale scandaleux scandaleuse honte honteux honteuse fiasco debacle catastrophe catastrophique chaos chaotique
explosif explosive fracassant fracassante humiliant humiliante humiliation ridicule ridiculise pulverise demolit massacre carnage terrifiant
terrifiante incroyable hallucinant hallucinante sidérant sidérante delirant delirante degoutant indigne insulte folie fou folle cauchemar
enfer brutal brutale devaste devastateur devastatrice panique apocalypse effondrement desastre desastreux furieux furieuse
tacle etrille fustige cingle derape derapage coup_de_gueule tolle sans_precedent jamais_vu
shocking shock scandal scandalous shame shameful disgrace disgraceful fiasco debacle catastrophe catastrophic chaos chaotic explosive bombshell
stunning slams slammed blasts blasted rips destroys destroyed obliterates humiliating humiliation ridiculous meltdown outrage outraged furious
fury rage nightmare terrifying unbelievable insane crazy disaster disastrous devastating brutal panic apocalypse collapse slaughter carnage
woke radical extremist thug thugs regime lunatic unhinged tyranny tyrant sham hoax witch_hunt rigged betrayal traitor slam epic
`;

// Les expressions multi-mots sont écrites avec des _ (normalize les change en espaces).
const LOADED_TERMS = [...new Set(LOADED.split(/\s+/).filter(Boolean).map(normalize))];

export function scoreTone(title) {
  const t = String(title || '');
  const hay = ` ${normalize(t)} `;
  const hits = LOADED_TERMS.filter((w) => hay.includes(` ${w} `));
  let score = hits.length;
  if (/!/.test(t)) score += 1;
  if (/\b\p{Lu}{4,}\b/u.test(t) && !/\b(NATO|OTAN|FIFA|NASA|OPEC|OPEP|UNESCO|COVID|CNESST|SAAQ|RAMQ|CUSMA|ACEUM|USMCA)\b/.test(t)) score += 1;
  if (/\?\s*$/.test(t)) score += 0.5;
  const level = score >= 2 ? 2 : score >= 1 ? 1 : 0;
  return { level, hits: hits.slice(0, 4) };
}
