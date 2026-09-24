import catalog from '../../../public/resources/json/undead.json';
import damageCatalog from '../../../public/resources/json/damage_type.json';
import {
  BestiaryAffinityGroup,
  ChaRange,
  DecayStage,
  DecayStageKey,
  GhostArchetype,
  GhostArchetypeKey,
  GhostDangerKey,
  GhostDangerTier,
  GhostReach,
  UndeadArchetype,
  UndeadArchetypeKey,
} from '../wiki.types';
import { damageLabel } from './damage-labels';
import { Rng } from './dice';

/* ──────────────────────────────────────────────────────────────────────────
   CE QUE LA MORT RAMÈNE

   Deux familles qui ne se recouvrent pas :

   - les MORTS-VIVANTS de la Nécromancie. Le corps est matière réelle : il
     n'a pas besoin de mana pour exister, seulement pour agir (modèle golem).
     Son archétype ne se choisit pas, il se LIT sur le stade de décomposition
     — et il change tout seul quand l'horloge du cadavre franchit un seuil.
   - les FANTÔMES de la Médiumnité. La forme est entièrement magique : elle
     coûte de la mana rien que pour rester là (modèle esquisse). Son archétype
     ne se choisit pas non plus : il découle du profil animique de l'âme.

   L'espèce ne décide d'aucun des deux archétypes. Chez le nécromancien, elle
   ne pèse qu'en cas de désaccord entre l'âme et le corps (`speciesMismatch`).
─────────────────────────────────────────────────────────────────────────── */

export const DECAY_STAGES = catalog.decayStages as DecayStage[];
export const UNDEAD = catalog.undead as UndeadArchetype[];
export const GHOSTS = catalog.ghosts as GhostArchetype[];
export const DANGER_TIERS = catalog.dangerTiers as GhostDangerTier[];
export const DECAY_RULES = catalog.decayRules;
export const GHOST_COMMON = catalog.ghostCommon as {
  affinities: BestiaryAffinityGroup[];
  veilTurns: { base: number; perCha: number; min: number };
};

export const UNDEAD_BY_KEY = new Map<UndeadArchetypeKey, UndeadArchetype>(UNDEAD.map((u) => [u.key, u]));
export const GHOST_BY_KEY = new Map<GhostArchetypeKey, GhostArchetype>(GHOSTS.map((g) => [g.key, g]));
export const DANGER_BY_KEY = new Map<GhostDangerKey, GhostDangerTier>(DANGER_TIERS.map((t) => [t.key, t]));

/** Part de la moyenne du dé gagnée par niveau, pour les PV et l'attaque. */
export const HP_GROWTH = 0.7;
export const ATK_GROWTH = 0.6;
/** La vitesse grandit comme l'attaque : un corps ou une forme qui s'aguerrit. */
export const SPEED_GROWTH = 0.6;

/** Moyenne d'un dé à `faces` faces. */
export const dieAverage = (faces: number): number => (faces + 1) / 2;

/** Une portée qui grandit avec le Charisme. */
export const chaRange = (r: ChaRange, chaMod: number): number => r.base + chaMod * r.perCha;

/* ── Les stats, dérivées du niveau du nécromancien ─────────────────────────── */

export interface UndeadStats {
  hp: number;
  atk: number;
  def: number;
  speed: number;
}

/** Ce qui écarte un mort-vivant de son profil nominal. */
export interface UndeadConditions {
  /** Âme d'une autre espèce que le corps. */
  speciesMismatch?: boolean;
  /** Corps fourni au mauvais stade : mort-vivant instable. */
  stageMismatch?: boolean;
  /** Stade figé par Embaumement rituel. */
  embalmed?: boolean;
  /**
   * Perte de stats de l'embaumement, en % — celle que le sort a réglée.
   * Absente : celle du socle. Jamais sous le plancher.
   */
  embalmingLoss?: number;
}

/** Facteur de stats d'un corps embaumé, plancher de perte compris. */
export function embalmingFactor(loss?: number): number {
  const { defaultStatLoss, minStatLoss } = DECAY_RULES.embalming;
  return 1 - Math.max(minStatLoss, loss ?? defaultStatLoss) / 100;
}

/**
 * Les stats d'un archétype au niveau du nécromancien — déterministes, aucun
 * dé lancé : c'est la MOYENNE du dé qui fait la croissance.
 *
 *   PV       = base + niveau × moyenne(dé PV) × 0,7
 *   Attaque  = base + niveau × moyenne(dé ATK) × 0,6
 *   Défense  = base + niveau × facteur
 *   Vitesse  = base + niveau × moyenne(dé VIT) × 0,6
 *
 * L'embaumement retire aux trois premières la perte réglée sur le sort (10 % au moins) ; le désaccord d'espèce ôte un
 * quart de la vitesse, arrondi en dessous. Les malus qui ne sont pas des
 * stats (crans de précision, attaques signature) vivent dans `undeadPenalties`.
 */
export function undeadStats(
  archetype: UndeadArchetypeKey,
  level: number,
  conditions: UndeadConditions = {},
): UndeadStats {
  const a = UNDEAD_BY_KEY.get(archetype);
  if (!a) throw new Error(`Archétype de mort-vivant inconnu : ${archetype}`);
  const preservation = conditions.embalmed ? embalmingFactor(conditions.embalmingLoss) : 1;
  const { hp, atk, def, speed } = summonStats(a, level, preservation);
  // Le désaccord d'espèce ôte un quart de la vitesse atteinte, arrondi en dessous.
  const vitesse = conditions.speciesMismatch
    ? Math.floor(speed * DECAY_RULES.speciesMismatch.speedFactor)
    : speed;
  return { hp, atk: atk ?? 0, def, speed: vitesse };
}

/** Ce qu'il faut à une invocation pour tirer ses stats du niveau de son maître. */
export interface SummonStatProfile {
  hpDie: number;
  hpBase: number;
  atkDie: number | null;
  atkBase: number;
  defBase: number;
  defPerLevel: number;
  speedBase: number;
  speedDie: number;
}

/**
 * La formule commune aux invocations de la Mort, morts-vivants et fantômes :
 * base + niveau × moyenne du dé × facteur, sans dé lancé, arrondie à l'entier
 * le plus proche — une barre de vie ne se compte pas en dixièmes. L'arrondi
 * vient en dernier, préservation comprise, pour ne pas cumuler deux arrondis. `factor` s'applique
 * aux trois (préservation d'un corps embaumé). Pas de dé d'attaque : pas
 * d'attaque du tout (`null`).
 */
export function summonStats(
  profile: SummonStatProfile,
  level: number,
  factor = 1,
): { hp: number; atk: number | null; def: number; speed: number } {
  return {
    hp: Math.round((profile.hpBase + level * dieAverage(profile.hpDie) * HP_GROWTH) * factor),
    atk:
      profile.atkDie === null
        ? null
        : Math.round((profile.atkBase + level * dieAverage(profile.atkDie) * ATK_GROWTH) * factor),
    def: Math.round((profile.defBase + level * profile.defPerLevel) * factor),
    // La préservation fige la chair, pas l'allure : la vitesse n'en souffre pas.
    speed: Math.round(profile.speedBase + level * dieAverage(profile.speedDie) * SPEED_GROWTH),
  };
}

export interface GhostStats {
  hp: number;
  /** Attaque MAGIQUE ; `null` pour un fantôme qui ne se bat jamais. */
  atk: number | null;
  /** Défense MAGIQUE : le physique, lui, traverse la forme (immunité du socle). */
  def: number;
  speed: number;
}

/** La barre de vie et le combat d'un fantôme, au niveau du médium qui l'invoque. */
export function ghostStats(key: GhostArchetypeKey, level: number): GhostStats {
  const g = GHOST_BY_KEY.get(key);
  if (!g) throw new Error(`Archétype de fantôme inconnu : ${key}`);
  return summonStats(g.stats, level);
}

export interface UndeadPenalties {
  /** Crans de précision (négatif = seuil qui monte). */
  precisionSteps: number;
  /** Facteur des attaques signature de l'espèce d'origine (morsure, griffure…). */
  signatureAttackFactor: number;
  /** Facteur global des effets du mort-vivant. */
  effectFactor: number;
  /** Vitesse à laquelle l'horloge de décomposition avance. */
  decayRate: number;
}

/** Les malus hors stats, cumulés : un corps peut être à la fois de la mauvaise espèce et du mauvais stade. */
export function undeadPenalties(conditions: UndeadConditions = {}): UndeadPenalties {
  const { speciesMismatch: espece, stageMismatch: stade } = DECAY_RULES;
  return {
    precisionSteps:
      (conditions.speciesMismatch ? espece.precisionSteps : 0) + (conditions.stageMismatch ? stade.precisionSteps : 0),
    signatureAttackFactor: conditions.speciesMismatch ? espece.signatureAttackFactor : 1,
    effectFactor: conditions.stageMismatch ? stade.effectFactor : 1,
    decayRate: conditions.stageMismatch ? stade.decayRate : 1,
  };
}

/* ── L'horloge de décomposition ─────────────────────────────────────────── */

/**
 * Le stade d'un cadavre de cet âge. Le climat départage les deux fins
 * possibles : des os secs à l'air libre, une momie sous climat sec.
 */
export function decayStageAt(ageDays: number, dryClimate = false): DecayStage {
  const possibles = DECAY_STAGES.filter((s) => !s.terminal || !!s.requiresDryClimate === dryClimate);
  let stade = possibles[0];
  for (const s of possibles) if (ageDays >= s.fromDay) stade = s;
  return stade;
}

/** Un cadavre relevé, tel que l'horloge le fait vivre. */
export interface ReanimatedBody {
  /** Âge du cadavre, en jours depuis la mort. */
  ageDays: number;
  dryClimate?: boolean;
  /** Stade figé par Embaumement rituel : l'horloge ne compte plus. */
  embalmedAt?: DecayStageKey;
  speciesMismatch?: boolean;
  stageMismatch?: boolean;
}

/** L'archétype que ce corps présente aujourd'hui. */
export function bodyArchetype(body: ReanimatedBody): UndeadArchetype {
  const stade = body.embalmedAt
    ? DECAY_STAGES.find((s) => s.key === body.embalmedAt)!
    : decayStageAt(body.ageDays, body.dryClimate);
  return UNDEAD_BY_KEY.get(stade.archetype)!;
}

/**
 * Fait passer `days` jours sur un corps relevé. Un corps embaumé n'avance
 * plus ; un corps instable (mauvais stade) se dégrade plus vite.
 *
 * Rend le nouveau corps et, s'il y a lieu, l'archétype qu'il vient de quitter —
 * pour que le journal puisse dire « la Goule se boursoufle en Bouffi ».
 */
export function advanceDecay(
  body: ReanimatedBody,
  days: number,
): { body: ReanimatedBody; from?: UndeadArchetypeKey; to?: UndeadArchetypeKey } {
  if (body.embalmedAt || days <= 0) return { body };
  const avant = bodyArchetype(body).key;
  const suivant: ReanimatedBody = { ...body, ageDays: body.ageDays + days * undeadPenalties(body).decayRate };
  const apres = bodyArchetype(suivant).key;
  return apres === avant ? { body: suivant } : { body: suivant, from: avant, to: apres };
}

/** Portée de contrôle du nécromancien : au-delà, le corps s'arrête sur place. */
export const necromancyControlRange = (chaMod: number): number => chaRange(DECAY_RULES.controlRange, chaMod);

/* ── Les fantômes ─────────────────────────────────────────────────────────── */

/** Socle commun et variations propres, fusionnés par nature d'affinité. */
export function ghostAffinities(key: GhostArchetypeKey): BestiaryAffinityGroup[] {
  const propres = GHOST_BY_KEY.get(key)?.affinities ?? [];
  const kinds: BestiaryAffinityGroup['kind'][] = ['immunities', 'resistances', 'weaknesses', 'absorptions'];
  return kinds
    .map((kind) => ({
      kind,
      damageTypeIds: [
        ...new Set(
          [...GHOST_COMMON.affinities, ...propres].filter((g) => g.kind === kind).flatMap((g) => g.damageTypeIds),
        ),
      ],
    }))
    .filter((g) => g.damageTypeIds.length);
}

/** Une portée de fantôme résolue : des mètres, ou l'une des deux qui ne se mesurent pas. */
export function resolveReach(reach: GhostReach, chaMod: number): number | 'regional' | 'unlimited' {
  return typeof reach === 'string' ? reach : chaRange(reach, chaMod);
}

/**
 * Portée de contrôle d'un fantôme. Le Cauchemar change de registre une fois
 * accroché à un hôte : il n'a plus besoin d'être proche de qui le contrôle.
 */
export function ghostControlRange(
  key: GhostArchetypeKey,
  chaMod: number,
  infected = false,
): number | 'regional' | 'unlimited' {
  const range = GHOST_BY_KEY.get(key)!.range;
  return resolveReach(infected && range.infected ? range.infected.control : range.control, chaMod);
}

/**
 * Puissance de l'Onryō selon sa distance au MÉDIUM (sa poursuite de la cible,
 * elle, reste illimitée). −10 % par tranche complète de 10 m au-delà de la
 * portée pleine, plancher à 25 % : la vengeance s'essouffle sans s'éteindre.
 */
export function onryoPowerFactor(distance: number, chaMod: number): number {
  const range = GHOST_BY_KEY.get('onryo')!.range;
  const pleine = chaRange(range.fullPower!, chaMod);
  const { perMeters, loss, floor } = range.falloff!;
  if (distance <= pleine) return 1;
  const tranches = Math.floor((distance - pleine) / perMeters);
  return Math.max(floor, Math.round((1 - tranches * loss) * 100) / 100);
}

/** Coût d'existence passif d'un fantôme, en mana par tour. */
export const ghostUpkeep = (key: GhostArchetypeKey): number =>
  DANGER_BY_KEY.get(GHOST_BY_KEY.get(key)!.danger)!.upkeep;

/* ── Aide depuis le voile ─────────────────────────────────────────────────── */

/** La table pondérée par dangerosité : chaque archétype, et son poids. */
export const veilTable = (): { key: GhostArchetypeKey; weight: number }[] =>
  GHOSTS.map((g) => ({ key: g.key, weight: DANGER_BY_KEY.get(g.danger)!.veilWeight }));

/** Qui répond à l'appel, tiré selon la table pondérée. */
export function rollVeilGhost(rng: Rng): GhostArchetype {
  const table = veilTable();
  const total = table.reduce((s, e) => s + e.weight, 0);
  let tirage = rng.next() * total;
  for (const e of table) {
    tirage -= e.weight;
    if (tirage < 0) return GHOST_BY_KEY.get(e.key)!;
  }
  return GHOST_BY_KEY.get(table[table.length - 1].key)!;
}

/** Tours de manifestation d'un fantôme appelé sans pierre : fixes, pas une réserve. */
export const veilTurns = (chaMod: number): number =>
  Math.max(GHOST_COMMON.veilTurns.min, GHOST_COMMON.veilTurns.base + chaMod * GHOST_COMMON.veilTurns.perCha);

/* ── Lecture en clair, pour la fiche ──────────────────────────────────────── */

const DAMAGE_NAME_BY_ID = new Map<number, string>(damageCatalog.specific_damage_types.map((t) => [t.id, t.name]));

const AFFINITY_KIND_LABELS: Record<BestiaryAffinityGroup['kind'], string> = {
  immunities: 'Immunités',
  resistances: 'Résistances',
  weaknesses: 'Faiblesses',
  absorptions: 'Absorptions',
};

/** Des affinités en libellés : « Faiblesses : Vie, Lumière ». */
export function affinityLines(groups: BestiaryAffinityGroup[]): { label: string; types: string[] }[] {
  return groups
    .filter((g) => g.damageTypeIds.length)
    .map((g) => ({
      label: AFFINITY_KIND_LABELS[g.kind],
      types: g.damageTypeIds.map((id) => damageLabel(DAMAGE_NAME_BY_ID.get(id))),
    }));
}

/** L'âge du cadavre qui donne ce stade, en clair : « 2 à 7 jours », « 21 jours et plus ». */
export function stageWindow(stage: DecayStageKey): string {
  const s = DECAY_STAGES.find((x) => x.key === stage)!;
  const suivant = DECAY_STAGES.find((x) => x.fromDay > s.fromDay && !x.terminal === !s.terminal)
    ?? DECAY_STAGES.find((x) => x.fromDay > s.fromDay);
  const jours = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;
  const fenetre = s.terminal || !suivant
    ? `${jours(s.fromDay)} et plus`
    : `${s.fromDay === 0 ? 'moins de ' + jours(suivant.fromDay) : `${s.fromDay} à ${jours(suivant.fromDay)}`}`;
  return s.requiresDryClimate ? `${fenetre}, climat sec` : fenetre;
}

/** Une portée de fantôme en clair : « 40 m + 5 m × CHA », « une ville ou une région ». */
export function reachText(reach: GhostReach): string {
  if (reach === 'regional') return 'une ville ou une région entière';
  if (reach === 'unlimited') return 'illimitée';
  return `${reach.base} m + ${reach.perCha} m × CHA`;
}

/** Toutes les portées d'un fantôme, une ligne chacune. */
export function ghostRangeLines(key: GhostArchetypeKey): { label: string; value: string }[] {
  const r = GHOST_BY_KEY.get(key)!.range;
  const lignes: { label: string; value: string }[] = [];
  if (r.host !== undefined) lignes.push({ label: 'Hôte', value: `${r.host} m — toujours collé à lui` });
  lignes.push({
    label: r.host !== undefined ? 'Médium ↔ hôte' : r.control === 'unlimited' ? 'Poursuite de sa cible' : 'Contrôle',
    value: reachText(r.control),
  });
  if (r.guardZone) lignes.push({ label: 'Zone de garde', value: reachText(r.guardZone) });
  if (r.fullPower) lignes.push({ label: 'Pleine puissance (du médium)', value: reachText(r.fullPower) });
  if (r.falloff) {
    lignes.push({
      label: 'Au-delà',
      value: `−${r.falloff.loss * 100} % par tranche de ${r.falloff.perMeters} m, jamais sous ${r.falloff.floor * 100} %`,
    });
  }
  if (r.infected) {
    lignes.push({ label: 'Une fois accroché', value: `${r.infected.host} m de son hôte ; ${reachText(r.infected.control)} jusqu'au médium` });
  }
  return lignes;
}

/** Chance qu'un archétype réponde à Aide depuis le voile, en %. */
export function veilChance(key: GhostArchetypeKey): number {
  const table = veilTable();
  const total = table.reduce((s, e) => s + e.weight, 0);
  return Math.round(((table.find((e) => e.key === key)?.weight ?? 0) / total) * 1000) / 10;
}
