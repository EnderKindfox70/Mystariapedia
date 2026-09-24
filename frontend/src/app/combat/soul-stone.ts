import catalog from '../../../public/resources/json/undead.json';
import { DeathSeverity, GhostArchetypeKey, GhostDangerKey, RitualDegreeKey } from '../wiki.types';
import { Rng } from './dice';
import { HIT_TARGET_BASE, outcomeOf, PRECISION_PER_MOD, PRECISION_PER_STEP, THRESHOLD_MAX, THRESHOLD_MIN } from './rules';
import { GHOST_BY_KEY } from './undead';

/* ──────────────────────────────────────────────────────────────────────────
   LA PIERRE D'ÂME

   Ressource partagée entre Nécromancie et Médiumnité. La pierre est NEUTRE :
   c'est l'âme capturée dedans qui porte l'information — son espèce et son
   profil animique, fixés par ce qu'elle était et par sa façon de mourir,
   jamais choisis par le praticien.

   Deux jets distincts, parce que soumettre n'est pas comprendre :

   1. CAPTURE (CHA) — le praticien impose sa volonté à l'âme. Un échec la
      laisse se dissiper, et la pierre est perdue. Un résultat partiel la
      capture quand même, mais elle doit se stabiliser des jours avant la
      première invocation.
   2. LECTURE (INT), seulement si la capture a réussi — identifier ce qu'on
      tient. Un échec laisse le profil inconnu jusqu'à la première invocation.

   Les deux peuvent diverger : un praticien charismatique mais peu perspicace
   capture bien et ignore ce qu'il a capturé.

   Les deux jets suivent le barème des sauvegardes, sens inversé : c'est ici le
   praticien qui lance et qui veut un résultat haut.

     résistance = mod × 4 − sévérité de la mort
     seuil      = 8 − (résistance / 5, arrondi) − maîtrise      borné 3 à 18
─────────────────────────────────────────────────────────────────────────── */

export const DEATH_SEVERITIES = catalog.deathSeverities as DeathSeverity[];
export const SOUL_STONE_RULES = catalog.soulStone;

/** Degrés de réussite d'un jet de rituel, du pire au meilleur. */
export type RitualDegree = RitualDegreeKey;

export const RITUAL_DEGREE_LABELS: Record<RitualDegree, string> = {
  'echec-total': 'échec total',
  echec: 'échec',
  partiel: 'partiel',
  reussite: 'réussite',
  critique: 'critique',
};

/** Les faces du d20 qui donnent chaque degré, relativement au seuil. */
export const RITUAL_DEGREE_BANDS: Record<RitualDegree, string> = {
  'echec-total': '1 naturel, toujours',
  echec: 'moins que seuil − 5',
  partiel: 'de seuil − 5 à seuil − 1',
  reussite: 'seuil ou plus',
  critique: '20 naturel, toujours',
};

/** Seuil du d20 pour un jet de rituel contre la résistance d'une âme. */
export function ritualThreshold(attributeMod: number, severity: number, mastery: number): number {
  // Le barème compte la résistance en points de précision (4 par point de
  // modificateur) et la convertit en crans une seule fois, comme le toucher.
  const resistance = attributeMod * PRECISION_PER_MOD - severity;
  const seuil = HIT_TARGET_BASE - Math.round(resistance / PRECISION_PER_STEP) - mastery;
  return Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, seuil));
}

/** Le degré d'un jet : la même table que le toucher, relue en réussites. */
export function ritualDegree(roll: number, threshold: number): RitualDegree {
  if (roll === 1) return 'echec-total';
  const outcome = outcomeOf(roll, threshold);
  return outcome === 'critical' ? 'critique' : outcome === 'hit' ? 'reussite' : outcome === 'graze' ? 'partiel' : 'echec';
}

export interface RitualRoll {
  roll: number;
  threshold: number;
  degree: RitualDegree;
}

function rollRitual(rng: Rng, attributeMod: number, severity: number, mastery: number): RitualRoll {
  const threshold = ritualThreshold(attributeMod, severity, mastery);
  const roll = rng.d20();
  return { roll, threshold, degree: ritualDegree(roll, threshold) };
}

/* ── L'âme et sa pierre ───────────────────────────────────────────────────── */

/** L'âme telle qu'elle est, que le praticien le sache ou non. */
export interface CapturedSoul {
  /** Espèce de son vivant — ce qui compte pour la Nécromancie. */
  species: string;
  /** Profil animique — l'archétype qu'elle prendra en Médiumnité. */
  profile: GhostArchetypeKey;
  /** Résistance de l'âme à sa propre mort (cf. `DEATH_SEVERITIES`). */
  severity: number;
}

/** Ce que le praticien sait de l'âme qu'il porte. */
export type SoulKnowledge = 'inconnu' | 'vague' | 'complet';

export interface SoulStone {
  soul: CapturedSoul;
  /** Jour de jeu à partir duquel l'âme peut être invoquée. */
  usableFromDay: number;
  /** Stabilité en stock : 0 ordinaire, +1 par critique (capture, lecture). */
  stability: number;
  knowledge: SoulKnowledge;
  /**
   * Âme hostile à SON geôlier : il est responsable de sa mort, ou elle était
   * son ennemie de son vivant. Pèse double en Prison d'âme.
   */
  hostileToKeeper: boolean;
  /** Invocations déjà faites — la relation qui s'installe (Lien facilité). */
  invocations: number;
}

export interface CaptureAttempt {
  soul: CapturedSoul;
  chaMod: number;
  intMod: number;
  mastery: number;
  /** Jour de jeu de la capture. */
  day: number;
  /** Le praticien a tué cette âme, ou elle était son ennemie personnelle. */
  keeperResponsible?: boolean;
}

export interface CaptureResult {
  capture: RitualRoll;
  /** Absent si la capture a échoué : il n'y a rien à lire. */
  reading?: RitualRoll;
  /** `null` : l'âme s'est dissipée et la pierre est perdue. */
  stone: SoulStone | null;
  log: string[];
}

const KNOWLEDGE_BY_DEGREE: Record<RitualDegree, SoulKnowledge> = {
  'echec-total': 'inconnu',
  echec: 'inconnu',
  partiel: 'vague',
  reussite: 'complet',
  critique: 'complet',
};

/**
 * Le rituel de capture complet : jet de CHA pour soumettre, puis, s'il a
 * pris, jet d'INT pour lire.
 */
export function captureSoul(attempt: CaptureAttempt, rng: Rng): CaptureResult {
  const { soul, chaMod, intMod, mastery, day } = attempt;
  const capture = rollRitual(rng, chaMod, soul.severity, mastery);
  const log = [`Capture (CHA) : dé ${capture.roll} contre seuil ${capture.threshold}+ → ${RITUAL_DEGREE_LABELS[capture.degree]}.`];

  if (capture.degree === 'echec-total' || capture.degree === 'echec') {
    log.push("L'âme se dissipe ; la pierre est perdue.");
    return { capture, stone: null, log };
  }

  const reading = rollRitual(rng, intMod, soul.severity, mastery);
  log.push(`Lecture (INT) : dé ${reading.roll} contre seuil ${reading.threshold}+ → ${RITUAL_DEGREE_LABELS[reading.degree]}.`);

  const delai = capture.degree === 'partiel' ? SOUL_STONE_RULES.stabilizationDays : 0;
  if (delai) log.push(`L'âme doit se stabiliser : invocable dans ${delai} jour(s).`);

  const stone: SoulStone = {
    soul,
    usableFromDay: day + delai,
    stability: (capture.degree === 'critique' ? 1 : 0) + (reading.degree === 'critique' ? 1 : 0),
    knowledge: KNOWLEDGE_BY_DEGREE[reading.degree],
    hostileToKeeper: !!attempt.keeperResponsible,
    invocations: 0,
  };
  return { capture, reading, stone, log };
}

/** L'âme peut-elle être invoquée ce jour-là ? */
export const isStoneUsable = (stone: SoulStone, day: number): boolean => day >= stone.usableFromDay;

/**
 * Ce que le praticien voit de l'âme qu'il porte.
 *
 * Une lecture partielle donne la catégorie large — l'espèce, et la
 * dangerosité de ce qu'elle deviendra — sans l'archétype exact.
 */
export function visibleProfile(stone: SoulStone): {
  species?: string;
  danger?: GhostDangerKey;
  profile?: GhostArchetypeKey;
} {
  if (stone.knowledge === 'inconnu') return {};
  const danger = GHOST_BY_KEY.get(stone.soul.profile)?.danger;
  if (stone.knowledge === 'vague') return { species: stone.soul.species, danger };
  return { species: stone.soul.species, danger, profile: stone.soul.profile };
}

/** Une invocation révèle ce que l'âme est devenue, et installe la relation. */
export const markInvoked = (stone: SoulStone): SoulStone => ({
  ...stone,
  knowledge: 'complet',
  invocations: stone.invocations + 1,
});

/* ── Les limites du praticien ─────────────────────────────────────────────── */

/** Corps réanimés et fantômes actifs en même temps : 1 + CHA, au moins 1. */
export function invocationLimit(chaMod: number): number {
  const { base, perCha, min } = SOUL_STONE_RULES.invocationLimit;
  return Math.max(min, base + chaMod * perCha);
}

/* ── Contact spectral ─────────────────────────────────────────────────────── */

/**
 * Sévérité du jet de Sagesse pour contacter une âme : 4, +1 par semaine
 * écoulée depuis la mort, plafonnée à 16 au bout d'environ trois mois.
 */
export const contactSeverity = (weeksSinceDeath: number): number =>
  Math.min(16, 4 + Math.max(0, Math.floor(weeksSinceDeath)));
