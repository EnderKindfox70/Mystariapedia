/* ──────────────────────────────────────────────────────────────────────────
   PERSONNALISATION DE SORTS PAR BUDGET.

   Remplace, sort après sort, l'ancien arbre à branches : un sort garde un socle
   de niveau 1 fixe, progresse par SA propre XP (pas par le niveau du
   personnage), et chaque niveau de sort accorde des points à dépenser sur des
   paramètres ajustables. Source des règles :
   `mystaria_mecanique_personnalisation_sorts.md`.

   Moteur pur, sans Angular : la fiche officielle (`spells-entries`) et le banc
   d'essai (`views/tests/spell-builder`) l'importent tel quel. Le FORMAT des
   données (ce qu'une fiche déclare) vit dans `wiki.types.ts` ; ici, les RÈGLES.

   Découpage, fidèle au document (« spellProgression : propre à CE sort pour CE
   personnage, pas une donnée de référence ») :
   - la fiche de sort déclare ce qui est permis — socle, paramètres, plafonds,
     listes d'éligibilité ;
   - le personnage porte l'XP de chaque sort et son build.
─────────────────────────────────────────────────────────────────────────── */

import { AttributeKey, StatKey } from '../character/character.types';
import { ATTRIBUTES, MAGIC_DOMAINS, STATS } from '../character/universe-data';
import { DAMAGE_LABELS } from './damage-labels';
import { REFERENCE_CASTER } from './spell-economy';
import {
  Cap,
  CapKind,
  DomainSpellEntry,
  GovernedField,
  LadderStep,
  ParamDef,
  ParamGrowth,
  ParamKindKey,
  ScalingSwapRule,
  SpellCustomization,
  SpellNodeStats,
  SpellOwnEffect,
  SpellScaling,
  SpellScalingAffects,
  SpellScalingSource,
  SpellNode,
  SpellTarget,
  SpellUsage,
  SwapOptions,
} from '../wiki.types';

export type { Cap, CapAnchor, CapKind, GovernedField, ParamDef, ParamKindKey, ScalingSwapRule, SpellCustomization, SpellOwnEffect } from '../wiki.types';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ParamKind {
  label: string;
  cost: number;
  step: number;
  /** Sens dans lequel on « améliore » : la mana s'améliore en baissant. */
  better: 'up' | 'down';
  capKind: CapKind;
  unit?: 'm' | 'tour' | '%' | 'case' | 'mL' | 'g' | 'part';
  /** Progression multiplicative (cf. `ParamGrowth`) ; absente = additive. */
  growth?: ParamGrowth;
  /** Coût non chiffré par le document : hypothèse, signalée à l'écran. */
  assumption?: boolean;
  /** Ce que vaut la valeur 0 (un rayon nul, c'est une cible unique). */
  zeroLabel?: string;
}

export interface Limits {
  min?: number;
  max?: number;
}

/** Stats d'un nœud, plus ce que la personnalisation ajoute (entretien, pantins, cibles). */
export interface BuilderStats extends SpellNodeStats {
  upkeep?: number;
  maxPuppets?: number;
  maxTargets?: number;
}

/** Ce que le moteur lit d'un sort personnalisable — fiche officielle ou copie de test. */
export interface CustomizableSpell {
  key: string;
  name: string;
  domain: string;
  /** Domaines d'une combinaison (tous exigés du personnage). */
  components?: string[];
  level: number;
  requires?: string[];
  damageType?: string;
  baseStats: SpellNodeStats;
  baseExtras?: Partial<BuilderStats>;
  customization: SpellCustomization;
  swapOptions?: SwapOptions | null;
  crossDomain?: { eligible: string[] } | null;
  domainGoverned?: { field: GovernedField; mechanic: string; reason: string }[];
  lockedFields?: { field: string; reason: string }[];
}

export interface Build {
  /** Crans par paramètre de Famille 1 : > 0 améliore, < 0 mord. */
  params: Record<string, number>;
  statusUnlock: { status: string; steps: number } | null;
  /** Repoussement débloqué, et ses cases au-delà de la première. */
  knockback: { steps: number } | null;
  targetUnlocks: SpellTarget[];
  /** Source → crans de ratio au-delà du ratio de déblocage. */
  scalingUnlocks: Record<string, number>;
  continuous: boolean;
  upkeepSteps: number;
  extraTargets: number;
  extraEffects: string[];
  /** Identifiants des effets propres au sort qui ont été débloqués. */
  ownEffects: string[];
  swaps: {
    /**
     * Ratios dont la source change, un par entrée de scaling, désignée par son
     * chemin : `scaling.0` (dégâts/soin), `effects.1.scaling.0` (un effet),
     * `retaliate.scaling.0` (une riposte), `durationScaling.0` (la durée).
     */
    scalings: { path: string; to: SpellScalingSource }[];
    areaShape: string | null;
    defaultTarget: boolean;
    statusType: { index: number; to: string } | null;
    /** Type de dégâts substitué en entier (pas de répartition). */
    damageType: string | null;
  };
  crossDomain: string | null;
  mix: { type: string; tenths: number } | null;
}

export interface SpellState {
  xp: number;
  build: Build | null;
  lastReassignedAt: string | null;
}

/** Ce que le moteur lit d'un personnage. */
export interface CustomizingPlayer {
  id: string;
  name: string;
  class: string;
  level: number;
  domains: string[];
  attributes: Record<AttributeKey, number>;
  stats: Record<StatKey, number>;
  knownSpells: string[];
  spellState: Record<string, SpellState>;
}

export interface Rules {
  xpRatios: { combat: number; training: number };
  xpCurve: 'linear' | 'triangular';
  xpBase: number;
  pointsPerSpellLevel: number;
  /** Niveau de sort maximum, le même pour tous les sorts. */
  maxSpellLevel: number;
  learnCost: number;
  paramKinds: Record<ParamKindKey, ParamKind>;
  costs: {
    statusUnlock: number;
    knockbackUnlock: number;
    targetUnlock: number;
    scalingUnlock: number;
    continuousMode: number;
    extraTarget: number;
    extraEffect: number;
    scalingSwap: number;
    areaShapeSwap: number;
    defaultTargetSwap: number;
    statusTypeSwap: number;
    damageTypeSwap: number;
    crossDomainUnlock: number;
    mixPerTenth: number;
  };
  family3Cap: number;
  unlockedStatusBaseChance: number;
  unlockedScalingRatio: number;
  /** Cases de repoussement qu'apporte le seul déblocage. */
  unlockedKnockbackCells: number;
}

export interface CatalogEntry {
  name: string;
  level: number;
  domains: string[];
}

export interface ClassInfo {
  key: string;
  name: string;
  inspirationPerLevel?: number;
}

export interface BuilderContext {
  rules: Rules;
  classes: ClassInfo[];
  /** Tous les sorts du wiki, par clé : prérequis et domaines investis. */
  catalog: Record<string, CatalogEntry>;
}

// ── Référentiels ────────────────────────────────────────────────────────────

/** Type de dégâts par défaut d'un domaine (cf. docs/composer-un-sort.md §8.2). */
const DOMAIN_DAMAGE_TYPE: Record<string, string> = {
  fire: 'fire', water: 'water', earth: 'earth', air: 'wind', electricity: 'lightning',
  plant: 'plant', light: 'light', darkness: 'dark', life: 'life', death: 'death',
  time: 'time', space: 'space',
};

export const DOMAINS = MAGIC_DOMAINS.map((d) => ({
  key: d.key,
  name: d.name,
  sigil: d.sigil,
  damageType: DOMAIN_DAMAGE_TYPE[d.key],
}));
export const DOMAIN_BY_KEY: Record<string, (typeof DOMAINS)[number]> = Object.fromEntries(
  DOMAINS.map((d) => [d.key, d]),
);
export const MAX_DOMAINS = 3;

/** Nombre de cibles simultanées qu'un sort ne dépasse jamais : son plafond propre, sous le plafond absolu. */
export const extraTargetsCeiling = (def: { max?: number }, rules: Rules = DEFAULT_RULES): number =>
  Math.min(def.max ?? rules.family3Cap, rules.family3Cap);
export const domainLabel = (key: string): string => DOMAIN_BY_KEY[key]?.name ?? key;

/**
 * Oppositions directes déjà établies ailleurs dans le système (4ter). Seule
 * Feu ↔ Eau est explicitement posée par le document.
 */
export const OPPOSED_DOMAINS: [string, string][] = [['fire', 'water']];

export const damageTypeLabel = (t: string | undefined): string => (t ? DAMAGE_LABELS[t] ?? t : '');

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries([
  ...ATTRIBUTES.map((a) => [a.key, a.label]),
  ...STATS.map((s) => [s.key, s.label]),
]);
export const sourceLabel = (k: string): string => SOURCE_LABELS[k] ?? k;

export const TARGET_LABELS: Record<SpellTarget, string> = {
  enemy: 'Ennemis', ally: 'Alliés', self: 'Soi-même', everyone: 'Tout le monde',
};

/** Formes de zone échangeables (Famille 4 : cercle ↔ cône ↔ ligne). */
export const AREA_SHAPES = ['Rayon', 'Cône', 'Ligne', 'Rectangle', 'Anneau'];

/**
 * Change la forme d'un libellé de zone en gardant sa mesure.
 * - Vers un rectangle : une BANDE d'une case de profondeur, aussi large que la
 *   zone d'origine (un rayon de 3 m couvre 7,5 m de large → « Rectangle 7,5 × 1,5 m ») ;
 *   un curseur de profondeur (`measure: 2`) peut ensuite l'épaissir.
 * - Depuis un rectangle : on ne garde que la largeur (« Rectangle 6 × 3 m » → « Cône 6 m »).
 */
export function swapAreaShape(area: string, from: string, to: string): string {
  if (to === 'Rectangle' && from !== 'Rectangle') {
    const n = readNum(area);
    if (Number.isNaN(n)) return area.replace(from, to);
    const width = from === 'Rayon' || from === 'Anneau' ? 2 * n + 1.5 : n;
    return `Rectangle ${fmt(width)} × 1,5 m`;
  }
  const next = area.replace(from, to);
  return to === 'Rectangle' ? next : next.replace(/\s*×\s*\d+(?:[.,]\d+)?/, '');
}

export const ANCHOR_LABELS: Record<string, string> = {
  tier3: 'tier 3 réel', treeMin: "min. de l'arbre", treeMax: "max. de l'arbre", assumption: 'hypothèse',
};

// ── Règles ──────────────────────────────────────────────────────────────────

/**
 * Toutes les constantes du document, en un seul endroit. Les entrées
 * `assumption` ne sont PAS chiffrées par le document.
 */
export const DEFAULT_RULES: Rules = {
  xpRatios: { combat: 0.5, training: 1.0 },
  /**
   * `linear` — seuil CUMULÉ du niveau N = base × N (lecture du document).
   * `triangular` — base × N à gagner POUR CHAQUE niveau, pour comparer.
   */
  xpCurve: 'linear',
  xpBase: 10,
  /** Non chiffré (thread ouvert). Avec le plafond de niveau 5 : 25 points au plus par sort. */
  pointsPerSpellLevel: 5,
  /**
   * Tout sort plafonne au niveau 5 pour l'instant. L'XP continue de
   * s'accumuler au-delà, sans effet : si le plafond monte, elle compte.
   */
  maxSpellLevel: 5,
  /** L'inspiration n'achète plus que la CONNAISSANCE du sort. */
  learnCost: 1,
  paramKinds: {
    damage: { label: 'Dégâts', cost: 1, step: 1, better: 'up', capKind: 'hard' },
    /**
     * Dégâts comptés en pourcentage des PV max de la cible. Un cran ne vaut pas
     * un cran de dégâts plats : il grandit avec ce qu'il frappe et ignore
     * l'armure — il se paie donc plus cher.
     */
    percentDamage: { label: 'Dégâts (% des PV max)', cost: 3, step: 1, better: 'up', capKind: 'hard', unit: '%', assumption: true },
    heal: { label: 'Soin', cost: 1, step: 1, better: 'up', capKind: 'hard' },
    /**
     * Drain : le miroir du contre-coup. Il ne rend rien par lui-même — il
     * vit des dégâts du sort — mais soigner en frappant vaut cher, d'où un
     * coût double du soin pour un cran de 5 %.
     */
    drain: { label: 'Drain', cost: 2, step: 0.05, better: 'up', capKind: 'soft', unit: 'part', assumption: true },
    effect: { label: "Valeur d'effet", cost: 1, step: 1, better: 'up', capKind: 'hard', assumption: true },
    range: { label: 'Portée', cost: 1, step: 1, better: 'up', capKind: 'soft', unit: 'm' },
    duration: { label: 'Durée', cost: 1, step: 1, better: 'up', capKind: 'soft', unit: 'tour' },
    /**
     * Un cran = une case de rayon sur la grille (1 case = 1,5 m) : à 1 m, un
     * cran sur deux ne changeait rien au sol. 3 points = les 2 pts/m du
     * document, ramenés à la case. À 0, la zone devient une cible unique.
     */
    radius: { label: "Rayon d'aire", cost: 3, step: 1.5, better: 'up', capKind: 'soft', unit: 'm', zeroLabel: 'Cible unique' },
    mana: { label: 'Mana (lancement)', cost: 2, step: 1, better: 'down', capKind: 'soft' },
    upkeep: { label: 'Mana (entretien/tour)', cost: 2, step: 1, better: 'down', capKind: 'soft' },
    ratio: { label: 'Ratio de scaling', cost: 1, step: 0.1, better: 'up', capKind: 'soft' },
    precision: { label: 'Pénalité de précision', cost: 1, step: 5, better: 'down', capKind: 'soft' },
    /**
     * Ce que le sort coûte à celui qui le lance (la main que l'énergie ronge).
     * S'améliore en BAISSANT, comme la mana : un contrecoup nul est le mieux
     * qu'on puisse en tirer, et il se paie cran par cran.
     */
    recoil: { label: 'Contrecoup subi', cost: 2, step: 1, better: 'down', capKind: 'soft', assumption: true },
    dc: { label: 'DC de résistance', cost: 1, step: 1, better: 'up', capKind: 'soft' },
    /**
     * Le DC qu'on impose au BÉNÉFICIAIRE (le corps du patient qui doit tenir le
     * soin) : l'inverse d'un DC de résistance, il s'améliore en BAISSANT.
     */
    risk: { label: "Risque d'échec (DC)", cost: 2, step: 1, better: 'down', capKind: 'soft', assumption: true },
    /** Un cran de volume (en mL). Se déclare presque toujours avec une progression `growth`. */
    volume: { label: 'Volume', cost: 1, step: 1, better: 'up', capKind: 'soft', unit: 'mL', assumption: true },
    /** Un cran de poids (en grammes) : ce que le sort peut mouvoir. Va de pair avec une progression `growth`. */
    weight: { label: 'Puissance', cost: 1, step: 1, better: 'up', capKind: 'soft', unit: 'g', assumption: true },
    /** Un échelon de plus sur une échelle qualitative (ce que le sort SAIT faire, pas combien). */
    grade: { label: 'Échelon', cost: 2, step: 1, better: 'up', capKind: 'hard', assumption: true },
    /** Une case de repoussement de plus, au-delà de celle que donne le déblocage. */
    knockback: { label: 'Repoussement', cost: 3, step: 1, better: 'up', capKind: 'soft', unit: 'case', assumption: true },
    chance: { label: "Chance d'infliger", cost: 1, step: 5, better: 'up', capKind: 'soft', unit: '%', assumption: true },
  },
  costs: {
    statusUnlock: 3,
    /** Effet inédit : cher à l'entrée, pour qu'il faille économiser ou sacrifier. */
    knockbackUnlock: 6,
    targetUnlock: 3,
    scalingUnlock: 3,
    continuousMode: 5,
    extraTarget: 4,
    extraEffect: 4,
    scalingSwap: 2,
    areaShapeSwap: 2,
    defaultTargetSwap: 4,
    statusTypeSwap: 3,
    damageTypeSwap: 3,
    crossDomainUnlock: 4,
    mixPerTenth: 1,
  },
  family3Cap: 3,
  unlockedStatusBaseChance: 10,
  unlockedScalingRatio: 0.2,
  unlockedKnockbackCells: 1,
};

// ── Utilitaires ─────────────────────────────────────────────────────────────

export const round = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;
export const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** Somme des k² pour k = 1..n : le prix de n crans en zone dégradée. */
export const sumSquares = (n: number): number => (n * (n + 1) * (2 * n + 1)) / 6;

type Loose = Record<string, unknown>;

export function getAt(obj: object, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Loose)[k]), obj);
}

export function setAt(obj: object, path: string, value: unknown): void {
  const keys = path.split('.');
  let o = obj as Loose;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] as Loose;
  o[keys[keys.length - 1]] = value;
}

const NUM_RE = /-?\d+(?:[.,]\d+)?/;
const ZERO_RANGE_RE = /^(contact|personnel)$/i;

/** Lit un nombre dans une valeur de fiche : `12`, `"8 m"`, `"Rayon 3 m"`, `"Contact"` (= 0). */
export function readNum(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return NaN;
  if (ZERO_RANGE_RE.test(raw.trim())) return 0;
  const m = raw.match(NUM_RE);
  return m ? Number(m[0].replace(',', '.')) : NaN;
}

/** Réécrit un nombre en gardant la forme de la valeur (`"8 m"` → `"9 m"`, `"Contact"` → `"1 m"`). */
export function writeNum(raw: unknown, n: number): number | string {
  const v = round(n, 3);
  if (typeof raw !== 'string') return v;
  // Texte de fiche : décimale à la française (« Rayon 4,5 m »), que la grille relit.
  const text = String(v).replace('.', ',');
  if (NUM_RE.test(raw)) return raw.replace(NUM_RE, text);
  return v === 0 ? raw : `${text} m`;
}

const NUM_RE_ALL = /-?\d+(?:[.,]\d+)?/g;

/** La n-ième mesure d'une valeur de fiche (1 = la première, comme `readNum`). */
export function readMeasure(raw: unknown, n = 1): number {
  if (n <= 1) return readNum(raw);
  if (typeof raw !== 'string') return NaN;
  const found = raw.match(NUM_RE_ALL)?.[n - 1];
  return found == null ? NaN : Number(found.replace(',', '.'));
}

/** Réécrit la n-ième mesure d'une valeur de fiche en gardant le reste du libellé. */
export function writeMeasure(raw: unknown, v: number, n = 1): number | string {
  if (n <= 1 || typeof raw !== 'string') return writeNum(raw, v);
  const text = String(round(v, 3)).replace('.', ',');
  let seen = 0;
  return raw.replace(NUM_RE_ALL, (m) => (++seen === n ? text : m));
}

/** Valeur de départ d'un curseur dans des stats : la mesure qu'il vise, au chemin qu'il vise. */
export const paramBase = (stats: object, p: ParamDef): number => readMeasure(getAt(stats, p.path), p.measure);

export const fmt = (n: number | string | undefined | null): string =>
  typeof n === 'number' ? String(round(n, 3)).replace('.', ',') : String(n ?? '—');

/** Points vus depuis le budget : dépenser retire (−), mordre rend (+). */
export const signedPts = (n: number): string => (n > 0 ? `−${fmt(n)}` : n < 0 ? `+${fmt(-n)}` : '0');

// ── Lecture d'une fiche officielle ──────────────────────────────────────────

/**
 * Une fiche du wiki vue par le moteur. `null` si le sort ne déclare pas de
 * personnalisation, ou pas de socle sur lequel l'asseoir.
 */
export function fromSpellEntry(spell: DomainSpellEntry, domains: string[]): CustomizableSpell | null {
  if (!spell.customization) return null;
  const baseStats = spell.baseStats;
  if (!baseStats) return null;
  return {
    key: spell.key,
    name: spell.name,
    domain: domains[0],
    components: domains.length > 1 ? domains : undefined,
    level: spell.level,
    requires: spell.requires,
    damageType: spell.damageType,
    baseStats,
    baseExtras: spell.baseExtras,
    customization: spell.customization,
    swapOptions: spell.swapOptions,
    crossDomain: spell.crossDomain,
    domainGoverned: spell.domainGoverned,
    lockedFields: spell.lockedFields,
  };
}

/**
 * Le sort construit, sous la forme que lisent la fiche ET le moteur de combat.
 *
 * Un `SpellNode` n'est plus un palier d'arbre : c'est un sort À UN ÉTAT DONNÉ.
 * Le faire fabriquer ici, et nulle part ailleurs, garantit que la fiche montre
 * exactement ce que le simulateur joue — c'était la promesse que l'ancien
 * arbre ne tenait pas, chacun lisant ses propres nœuds.
 */
export function builtNode(
  spell: CustomizableSpell,
  stats: BuilderStats,
  texts?: { description?: string; usage?: SpellUsage },
): SpellNode {
  return {
    id: 'build',
    name: spell.name,
    description: texts?.description,
    usage: texts?.usage,
    stats,
  };
}

// ── Progression propre au sort ──────────────────────────────────────────────

/** XP cumulée nécessaire pour atteindre le niveau de sort `level`. */
export function xpThreshold(level: number, rules: Rules = DEFAULT_RULES): number {
  const b = rules.xpBase;
  return rules.xpCurve === 'triangular' ? (b * level * (level + 1)) / 2 : b * level;
}

export function xpThresholdFormula(rules: Rules = DEFAULT_RULES): string {
  const b = rules.xpBase;
  return rules.xpCurve === 'triangular'
    ? `${b} * (spellLevel + 1) * (spellLevel + 2) / 2`
    : `${b} * (spellLevel + 1)`;
}

export function rawSpellLevel(xp: number, rules: Rules = DEFAULT_RULES): number {
  if (!(rules.xpBase > 0)) return 0;
  let n = 0;
  while (xpThreshold(n + 1, rules) <= xp + 1e-9) n++;
  return n;
}

/** XP gagnée par un lancer, selon le contexte. */
export const xpForCast = (context: 'combat' | 'training', rules: Rules = DEFAULT_RULES): number =>
  rules.xpRatios[context] ?? 0;

export interface SpellProgress {
  xp: number;
  level: number;
  maxLevel: number;
  /** Niveau maximum atteint : l'XP supplémentaire n'a plus d'effet. */
  maxed: boolean;
  prevThreshold: number;
  /** `null` au niveau maximum : plus de seuil à franchir. */
  nextThreshold: number | null;
  pointsEarned: number;
}

/**
 * Tout ce que l'XP d'un sort donne. Le niveau de sort ne dépend QUE de sa
 * propre XP — jamais du niveau du personnage : un sort qu'on spam progresse,
 * un sort jamais lancé stagne, peu importe le niveau général. Il plafonne au
 * niveau de sort maximum, le même pour tous les sorts.
 */
export function spellProgress(xp: number, rules: Rules = DEFAULT_RULES): SpellProgress {
  const maxLevel = rules.maxSpellLevel;
  const level = Math.min(rawSpellLevel(xp, rules), maxLevel);
  const maxed = level >= maxLevel;
  return {
    xp,
    level,
    maxLevel,
    maxed,
    prevThreshold: xpThreshold(level, rules),
    nextThreshold: maxed ? null : xpThreshold(level + 1, rules),
    pointsEarned: level * rules.pointsPerSpellLevel,
  };
}

// ── Personnage : accès et inspiration ───────────────────────────────────────

/** Domaines d'un sort : ses composantes pour une combinaison, sinon son domaine. */
export const spellDomains = (spell: CustomizableSpell): string[] => spell.components ?? [spell.domain];

export const classInspiration = (player: CustomizingPlayer, ctx: BuilderContext): number =>
  ctx.classes.find((c) => c.key === player.class)?.inspirationPerLevel ?? 2;

export function inspirationSummary(player: CustomizingPlayer, ctx: BuilderContext) {
  const total = classInspiration(player, ctx) * player.level;
  const spent = player.knownSpells.length * ctx.rules.learnCost;
  return { total, spent, remaining: total - spent };
}

/**
 * Domaines dans lesquels le personnage a INVESTI de l'inspiration : ceux d'au
 * moins un sort qu'il connaît. Condition du 4ter.
 */
export function investedDomains(player: CustomizingPlayer, ctx: BuilderContext): Set<string> {
  const out = new Set<string>();
  for (const key of player.knownSpells) for (const d of ctx.catalog[key]?.domains ?? []) out.add(d);
  return out;
}

export interface AccessCondition {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  requires?: string;
}

export interface Access {
  known: boolean;
  conds: AccessCondition[];
  /** Il peut dépenser l'inspiration maintenant. */
  learnable: boolean;
  /** Il le connaît ET en remplit toujours les conditions. */
  usable: boolean;
}

/**
 * Conditions pour qu'un personnage apprenne, puis personnalise, un sort.
 * Retirer un domaine à la fiche fige les sorts qui en dépendent.
 */
export function checkAccess(spell: CustomizableSpell, player: CustomizingPlayer, ctx: BuilderContext): Access {
  const domains = spellDomains(spell);
  const known = player.knownSpells.includes(spell.key);
  const conds: AccessCondition[] = [];

  const missing = domains.filter((d) => !player.domains.includes(d));
  conds.push({
    id: 'domains',
    label: domains.length > 1
      ? `Domaines ${domains.map(domainLabel).join(' + ')} (combinaison)`
      : `Domaine ${domainLabel(domains[0])}`,
    ok: missing.length === 0,
    detail: missing.length ? `manque : ${missing.map(domainLabel).join(', ')}` : 'ok',
  });
  conds.push({
    id: 'level',
    label: `Niveau de personnage ≥ ${spell.level}`,
    ok: player.level >= spell.level,
    detail: `niveau ${player.level}`,
  });
  for (const req of spell.requires ?? []) {
    const ok = player.knownSpells.includes(req);
    conds.push({
      id: `requires:${req}`,
      requires: req,
      label: `Sort requis : ${ctx.catalog[req]?.name ?? req}`,
      ok,
      detail: ok ? 'connu' : 'inconnu',
    });
  }
  const base = conds.every((c) => c.ok);
  if (!known) {
    const insp = inspirationSummary(player, ctx);
    conds.push({
      id: 'inspiration',
      label: `Inspiration pour apprendre (${ctx.rules.learnCost})`,
      ok: insp.remaining >= ctx.rules.learnCost,
      detail: `${insp.remaining} restante(s) sur ${insp.total}`,
    });
  }
  return { known, conds, learnable: !known && conds.every((c) => c.ok), usable: known && base };
}

// ── Coût d'un paramètre continu (Famille 1) ─────────────────────────────────

export type Zone = 'base' | 'lineaire' | 'degrade' | 'plafond-dur' | 'mordu';

export interface Priced {
  units: number;
  cost: number;
  /** Crans réellement appliqués (moins que `units` au-delà d'un plafond dur). */
  effective: number;
  excess: number;
  lost: number;
  zone: Zone;
  value: number;
  errors: string[];
}

export const capKind = (cap: Cap | null | undefined, kind: ParamKind): CapKind => cap?.kind ?? kind.capKind;

/** Le type d'un paramètre, avec le pas et la progression propres à ce paramètre s'il en déclare. */
export function kindOf(p: ParamDef, rules: Rules = DEFAULT_RULES): ParamKind {
  const kind = rules.paramKinds[p.kind];
  if (!kind || (!p.step && p.growth == null)) return kind;
  return { ...kind, ...(p.step ? { step: p.step } : {}), ...(p.growth != null ? { growth: p.growth } : {}) };
}

const NICE = [1, 2, 5];

/** Rang d'une valeur dans la suite 1-2-5 (0,5 → −1, 1 → 0, 2 → 1, 5 → 2, 10 → 3…), ou NaN. */
export function niceRank(v: number): number {
  if (!(v > 0)) return NaN;
  const e = Math.floor(Math.log10(v) + 1e-9);
  const i = NICE.findIndex((m) => Math.abs(v - m * 10 ** e) < 1e-6 * 10 ** e);
  return i < 0 ? NaN : e * 3 + i;
}

const niceAt = (rank: number): number => {
  const e = Math.floor(rank / 3);
  return round(NICE[rank - e * 3] * 10 ** e, 6);
};

/**
 * Valeur après `u` crans (u signé, déjà orienté dans le sens de l'amélioration).
 * Additive par défaut ; multiplicative si le type déclare une progression.
 */
export function stepValue(kind: ParamKind, base: number, u: number): number {
  const g = kind.growth;
  if (g == null) return round(base + u * kind.step, 3);
  if (g === '1-2-5') {
    const r = niceRank(base);
    return Number.isNaN(r) ? NaN : niceAt(r + u);
  }
  return round(base * g ** u, 3);
}

/**
 * Prix de `units` crans d'un paramètre, depuis sa valeur de base.
 *
 * `units > 0` améliore, `units < 0` MORD sur la valeur acquise et rend des
 * points au même taux. Au-delà du plafond :
 * - `soft` (Option D) — le k-ième cran excédentaire coûte `cost × k²` ;
 * - `hard` (Option A) — l'effet bloque au plafond, les points excédentaires
 *   sont dépensés pour rien (`lost`).
 */
export function priceParam(kind: ParamKind, base: number, units: number, cap?: Cap | null, limits: Limits = {}): Priced {
  const dir = kind.better === 'down' ? -1 : 1;
  const valueAt = (u: number) => stepValue(kind, base, dir * u);
  const out: Priced = { units, cost: 0, effective: units, excess: 0, lost: 0, zone: 'base', value: valueAt(units), errors: [] };

  if (units < 0) {
    out.cost = units * kind.cost;
    out.zone = 'mordu';
  } else if (units > 0) {
    let room = Infinity;
    if (cap && cap.value != null) {
      if (kind.growth == null) room = Math.max(0, Math.floor(((cap.value - base) * dir) / kind.step + 1e-9));
      else {
        // Progression multiplicative : on compte les crans qui tiennent sous le plafond.
        room = 0;
        while (room < 200 && (valueAt(room + 1) - cap.value) * dir <= 1e-9) room++;
      }
    }
    const linear = Math.min(units, room);
    const excess = units - linear;
    const hard = capKind(cap, kind) === 'hard';
    out.excess = excess;
    out.zone = excess ? (hard ? 'plafond-dur' : 'degrade') : 'lineaire';
    if (!excess) {
      out.cost = linear * kind.cost;
    } else if (hard) {
      out.cost = units * kind.cost;
      out.lost = excess * kind.cost;
      out.effective = linear;
      out.value = valueAt(linear);
    } else {
      out.cost = linear * kind.cost + kind.cost * sumSquares(excess);
    }
  }

  if (limits.min != null && out.value < limits.min - 1e-9) out.errors.push(`descend sous le minimum absolu (${fmt(limits.min)})`);
  if (limits.max != null && out.value > limits.max + 1e-9) out.errors.push(`dépasse le maximum absolu (${fmt(limits.max)})`);
  return out;
}

// ── Affichage d'une ligne de paramètre ──────────────────────────────────────

export interface StepView {
  disabled: boolean;
  /** Valeur qu'on atteindrait (vide si le cran est impossible). */
  value: string;
  /** Ce que coûte ou rend ce cran, ou pourquoi il est bloqué. */
  hint: string;
  title: string;
}

/** Une ligne de paramètre continu, prête à dessiner : valeur, zone, prix du cran suivant. */
export interface ParamView {
  label: string;
  /** Sens d'amélioration : `down` pour la mana, qui s'améliore en baissant. */
  better: 'up' | 'down';
  assumption: boolean;
  /** Coût par cran et sens d'amélioration. */
  costText: string;
  /** Nature et valeur du plafond. */
  capText: string;
  hardCap: boolean;
  baseText: string;
  valueText: string;
  zone: { cls: 'ok' | 'warn' | 'ko' | 'info'; text: string } | null;
  down: StepView;
  up: StepView;
  /** Total dépensé (−) ou rendu (+) sur ce paramètre. */
  cost: string;
  changed: boolean;
}

/** Suffixe d'unité d'un type de paramètre (« m », « cases »…), vide s'il n'en a pas. */
const unitSuffix = (kind: ParamKind, v: number): string =>
  kind.unit === 'm' ? ' m' : kind.unit === '%' ? ' %' : kind.unit === 'tour' ? ' t.'
  : kind.unit === 'case' ? (Math.abs(v) > 1 ? ' cases' : ' case') : '';

/**
 * Une valeur de curseur telle qu'on la lit : l'échelon nommé d'une échelle,
 * un volume dans la bonne unité, ou le nombre avec son unité.
 */
export function formatParamValue(kind: ParamKind, v: number, ladder?: LadderStep[]): string {
  if (ladder) return ladder[Math.round(v)]?.label ?? fmt(v);
  if (kind.unit === 'mL') return formatVolume(v);
  if (kind.unit === 'g') return formatWeight(v);
  if (kind.unit === 'part') return `${fmt(round(v * 100, 1))} % des dégâts`;
  if (kind.zeroLabel && v <= 0) return kind.zeroLabel;
  return `${fmt(v)}${unitSuffix(kind, v)}`;
}

/**
 * Remplit un texte vivant (`liveText`) avec les stats du sort construit.
 *
 * `{chemin}` lit la valeur au chemin et la met en forme comme le curseur qui
 * la règle (volume en mL/L/m³, échelon nommé…) ; `{chemin:champ}` lit un champ
 * texte de l'échelon atteint (`description`, `action`…), et `{chemin:comparison}`
 * l'élément de comparaison de la valeur (« un seau »). Un texte (« Contact », « 3 m ») passe
 * tel quel. Un chemin inconnu reste visible entre accolades : la faute se voit.
 */
export function fillTemplate(text: string, spell: CustomizableSpell, stats: BuilderStats, rules: Rules = DEFAULT_RULES): string {
  const params = spell.customization.params ?? [];
  return text.replace(/\{([\w.]+)(?::(\w+))?\}/g, (whole, path: string, sub?: string) => {
    const raw = getAt(stats, path);
    if (raw == null) return whole;
    const p = params.find((q) => q.path === path);
    if (typeof raw === 'number' && p?.ladder) {
      const step = p.ladder[Math.round(raw)] as unknown as Record<string, unknown> | undefined;
      const value = step?.[sub ?? 'label'];
      return typeof value === 'string' ? value : whole;
    }
    if (sub === 'comparison' && typeof raw === 'number' && p) return comparisonFor(p, raw) ?? whole;
    if (sub) return whole;
    if (typeof raw === 'number') {
      const kind = p ? kindOf(p, rules) : undefined;
      return kind ? formatParamValue(kind, raw) : fmt(raw);
    }
    if (Array.isArray(raw)) return raw.join(', ');
    return String(raw);
  });
}

/**
 * L'élément de comparaison d'une valeur (« un seau ») : la première entrée dont
 * le seuil la couvre, sinon le texte général. `undefined` si le curseur n'en
 * déclare pas.
 */
export function comparisonFor(p: ParamDef, value: number): string | undefined {
  return p.comparisons?.find((c) => c.upTo == null || value <= c.upTo + 1e-9)?.text;
}

/** Un volume en millilitres, dans l'unité qui se lit : 250 mL, 2 L, 1,5 m³. */
export function formatVolume(ml: number): string {
  if (!Number.isFinite(ml)) return '—';
  if (ml < 1000) return `${fmt(ml)} mL`;
  if (ml < 1_000_000) return `${fmt(round(ml / 1000, 3))} L`;
  return `${fmt(round(ml / 1_000_000, 3))} m³`;
}

/** Un poids en grammes, dans l'unité qui se lit : 200 g, 2 kg, 1,5 t. */
export function formatWeight(g: number): string {
  if (!Number.isFinite(g)) return '—';
  if (g < 1000) return `${fmt(g)} g`;
  if (g < 1_000_000) return `${fmt(round(g / 1000, 3))} kg`;
  return `${fmt(round(g / 1_000_000, 3))} t`;
}

/**
 * Les mesures d'un sort qui se lisent avec leur unité (volume, poids) : ce que
 * vaut chacune dans ces stats, et à quoi elle ressemble. Pour la fiche.
 */
export function measureLines(spell: CustomizableSpell, stats: object, rules: Rules = DEFAULT_RULES) {
  return (spell.customization.params ?? []).flatMap((p) => {
    const kind = kindOf(p, rules);
    if (!kind || (kind.unit !== 'mL' && kind.unit !== 'g')) return [];
    const v = paramBase(stats, p);
    if (Number.isNaN(v)) return [];
    return [{ id: p.id, label: kind.label, value: formatParamValue(kind, v), comparison: comparisonFor(p, v) ?? '' }];
  });
}

const stepCostText = (n: number) => (n > 0 ? `coût ${fmt(n)}` : n < 0 ? `rend ${fmt(-n)}` : 'gratuit');

export function paramView(a: {
  label: string;
  kind: ParamKind;
  base: number;
  units: number;
  cap: Cap | null | undefined;
  limits: Limits;
  /** Boutons inactifs (hors repos long, mode sans objet…). */
  locked?: boolean;
  /** Échelle qualitative ; à défaut, celle de la définition passée en `limits`. */
  ladder?: LadderStep[];
}): ParamView {
  const { kind, base, units, cap, limits } = a;
  const ladder = a.ladder ?? (limits as { ladder?: LadderStep[] }).ladder;
  const res = priceParam(kind, base, units, cap, limits);
  const up = priceParam(kind, base, units + 1, cap, limits);
  const down = priceParam(kind, base, units - 1, cap, limits);
  const upBlocked = up.errors.length > 0 || up.zone === 'plafond-dur';
  const downBlocked = down.errors.length > 0;
  const unit = (v: number) => unitSuffix(kind, v);
  const show = (v: number) => formatParamValue(kind, v, ladder);
  const growthText = kind.growth == null ? ''
    : kind.growth === '1-2-5' ? ' · suite 1-2-5 (×10 tous les 3 crans)' : ` · ×${fmt(kind.growth)} par cran`;
  const hard = capKind(cap, kind) === 'hard';
  const zones: Record<Zone, ParamView['zone']> = {
    base: null,
    lineaire: { cls: 'ok', text: 'dans le plafond' },
    degrade: { cls: 'warn', text: `zone dégradée · ${res.excess} cran(s) en k²` },
    'plafond-dur': { cls: 'ko', text: 'au-delà du plafond dur' },
    mordu: { cls: 'info', text: 'mordu sous le socle' },
  };
  return {
    label: a.label,
    better: kind.better,
    assumption: !!kind.assumption,
    costText: ladder
      ? `${kind.cost} pt / échelon`
      : kind.growth != null
        ? `${kind.cost} pt / cran${growthText}`
        : `${kind.cost} pt / ${fmt(kind.step)}${unit(kind.step)} · ${kind.better === 'down' ? 'baisser = améliorer' : 'monter = améliorer'}`,
    capText: cap
      ? `${hard ? 'Plafond dur' : 'Plafond dégradé (k²)'} ${ladder || kind.unit === 'mL' || kind.unit === 'g' ? show(cap.value) : `${fmt(cap.value)}${unit(cap.value)}`}${cap.anchor ? ` · ${ANCHOR_LABELS[cap.anchor] ?? cap.anchor}` : ''}`
      : 'Sans plafond (minimum absolu seulement)',
    hardCap: hard,
    baseText: show(base),
    valueText: show(res.value),
    zone: zones[res.zone],
    down: {
      disabled: !!a.locked || downBlocked,
      value: downBlocked ? '' : show(down.value),
      hint: downBlocked ? 'minimum' : stepCostText(down.cost - res.cost),
      title: units > 0 ? 'Retirer un cran' : 'Mordre : sacrifier un cran acquis',
    },
    up: {
      disabled: !!a.locked || upBlocked,
      value: upBlocked ? '' : show(up.value),
      hint: upBlocked ? (up.zone === 'plafond-dur' ? 'plafond dur' : 'maximum') : stepCostText(up.cost - res.cost),
      title: up.zone === 'plafond-dur' ? 'Plafond dur : tout point au-delà serait perdu' : "Améliorer d'un cran",
    },
    cost: signedPts(res.cost),
    changed: units !== 0,
  };
}

// ── Build ───────────────────────────────────────────────────────────────────

export function emptyBuild(): Build {
  return {
    params: {},
    statusUnlock: null,
    knockback: null,
    targetUnlocks: [],
    scalingUnlocks: {},
    continuous: false,
    upkeepSteps: 0,
    extraTargets: 0,
    extraEffects: [],
    ownEffects: [],
    swaps: { scalings: [], areaShape: null, defaultTarget: false, statusType: null, damageType: null },
    crossDomain: null,
    mix: null,
  };
}

export function normalizeBuild(build: Partial<Build> | null | undefined): Build {
  const e = emptyBuild();
  const swaps = { ...e.swaps, ...(build?.swaps ?? {}) } as Build['swaps'] & { scaling?: { index: number; to: SpellScalingSource } | null };
  // Ancien format (un seul swap, sur le scaling principal) : repris tel quel.
  if (swaps.scaling) swaps.scalings = [...(swaps.scalings ?? []), { path: `scaling.${swaps.scaling.index}`, to: swaps.scaling.to }];
  delete swaps.scaling;
  return { ...e, ...(build ?? {}), swaps: { ...swaps, scalings: swaps.scalings ?? [] } };
}

export const governedFields = (spell: CustomizableSpell): Set<GovernedField> =>
  new Set((spell.domainGoverned ?? []).map((g) => g.field));

/**
 * Options réellement ouvertes au budget. Règle structurelle du document : un
 * champ gouverné par une mécanique de domaine dédiée (plante équipée,
 * matériau équipé) n'entre JAMAIS dans le budget, même si la fiche le déclare.
 */
export function spellOptions(spell: CustomizableSpell) {
  const c = spell.customization;
  const g = governedFields(spell);
  return {
    params: c.params ?? [],
    statusUnlock: g.has('statusType') ? null : c.statusUnlock ?? null,
    knockbackUnlock: c.knockbackUnlock ?? null,
    targetUnlock: c.targetUnlock ?? null,
    scalingUnlock: c.scalingUnlock ?? null,
    continuousMode: c.continuousMode ?? null,
    extraTargets: c.extraTargets ?? null,
    extraEffects: c.extraEffects ?? null,
    ownEffects: c.ownEffects ?? null,
    scalingSwap: scalingSwapOption(spell),
    areaShapeSwap: c.areaShapeSwap ?? null,
    defaultTargetSwap: c.defaultTargetSwap ?? null,
    statusTypeSwap: g.has('statusType') ? null : c.statusTypeSwap ?? null,
    damageTypeSwap: g.has('damageType') ? null : c.damageTypeSwap ?? null,
    mix: g.has('damageType') ? null : spell.swapOptions ?? null,
    crossDomain: g.has('damageType') ? null : spell.crossDomain ?? null,
  };
}
export type SpellOptions = ReturnType<typeof spellOptions>;

export const baseStatsOf = (spell: CustomizableSpell): BuilderStats => ({ ...spell.baseStats, ...(spell.baseExtras ?? {}) });

// ── Swap de scaling (Famille 4) ─────────────────────────────────────────────

/**
 * Sources vers lesquelles un ratio peut basculer. La plupart des sorts
 * scalent sur l'Attaque magique : le lanceur doit pouvoir faire porter le sort
 * par autre chose (sa Force, sa Sagesse…) sans que la fiche ait à le déclarer.
 */
export const SCALING_SWAP_SOURCES: SpellScalingSource[] = [
  'atk_mag', 'atk_phy', 'force', 'dexterite', 'constitution', 'intelligence', 'sagesse', 'charisme',
];

/**
 * Rapport de conversion d'un ratio quand sa source change : même rendement
 * chez le lanceur de référence de l'économie des sorts. Un swap « ne rend pas
 * le sort plus fort, juste différent » — garder le ratio tel quel, ce serait
 * diviser par cinq un sort qui passe de l'Attaque magique (≈ 80) à
 * l'Intelligence (≈ 16).
 */
export const ratioFactor = (from: string, to: string): number =>
  (REFERENCE_CASTER[from] ?? 1) / (REFERENCE_CASTER[to] ?? 1);

/** Trois décimales : 0,2 × Force devient 0,035 × Attaque magique, pas 0,04 (+14 %). */
export const convertRatio = (ratio: number, from: string, to: string): number => round(ratio * ratioFactor(from, to), 3);

/**
 * Le swap de scaling est ouvert PAR DÉFAUT à tout sort qui a un scaling. Une
 * fiche peut en restreindre les sources (`scalingSwap.eligible`) ou le fermer
 * en verrouillant `scaling` (Famille 5).
 */
/** Les règles déclarées par la fiche, toujours sous forme de tableau. */
const swapRules = (spell: CustomizableSpell): ScalingSwapRule[] => {
  const declared = spell.customization.scalingSwap;
  return declared ? (Array.isArray(declared) ? declared : [declared]) : [];
};

/**
 * Sources ouvertes à CE ratio : la règle qui le vise nommément, sinon la règle
 * générale de la fiche, sinon la liste centrale. Une fiche peut ainsi n'ouvrir
 * que ce qui a du sens pour elle — un feu intérieur se porte sur le corps, un
 * trait de feu sur l'esprit.
 */
export function scalingSwapSources(spell: CustomizableSpell, path: string): SpellScalingSource[] {
  if ((spell.lockedFields ?? []).some((l) => l.field === 'scaling')) return [];
  const rules = swapRules(spell);
  const rule = rules.find((r) => r.path === path) ?? rules.find((r) => !r.path);
  return rule ? rule.eligible : SCALING_SWAP_SOURCES;
}

function scalingSwapOption(spell: CustomizableSpell): { eligibleFor: (path: string) => SpellScalingSource[] } | null {
  if ((spell.lockedFields ?? []).some((l) => l.field === 'scaling')) return null;
  const entries = scalingEntries(baseStatsOf(spell));
  if (!entries.length || entries.every((e) => !scalingSwapSources(spell, e.path).length)) return null;
  return { eligibleFor: (path: string) => scalingSwapSources(spell, path) };
}

/** Une entrée de scaling du sort, où qu'elle vive. */
export interface ScalingEntryRef {
  /** Chemin de l'entrée (`effects.0.scaling.0`). */
  path: string;
  /** Chemin de la liste qui la contient (`effects.0.scaling`). */
  list: string;
  source: SpellScalingSource;
  ratio: number;
  /** Ce que le ratio fait grandir : « dégâts », « Vitesse », « riposte »… */
  scales: string;
}

/**
 * Tous les ratios d'un sort : scaling principal (dégâts, soin), effets de
 * stats, riposte, durée. Chacun peut changer de source (Famille 4).
 */
export function scalingEntries(stats: BuilderStats): ScalingEntryRef[] {
  const out: ScalingEntryRef[] = [];
  const push = (list: string, entries: SpellScaling[] | undefined, scales: (s: SpellScaling) => string) =>
    (entries ?? []).forEach((s, j) => out.push({ path: `${list}.${j}`, list, source: s.source, ratio: s.ratio, scales: scales(s) }));
  push('scaling', stats.scaling, (s) => (s.affects === 'heal' ? 'soin' : s.affects === 'mana' ? 'mana' : 'dégâts'));
  // Un sort à plusieurs pools (lumière + ombre) porte un ratio par composante :
  // chacun se règle et change de source pour son compte.
  (stats.damages ?? []).forEach((d, i) =>
    push(`damages.${i}.scaling`, d.scaling, () => `dégâts ${damageTypeLabel(d.type)}`),
  );
  (stats.effects ?? []).forEach((e, i) => push(`effects.${i}.scaling`, e.scaling, () => sourceLabel(e.stat)));
  if (stats.retaliate) push('retaliate.scaling', stats.retaliate.scaling, () => 'riposte');
  push('durationScaling', stats.durationScaling, () => 'durée');
  return out;
}

/**
 * Applique les swaps de scaling d'un build à des stats (en place). Rend les
 * lignes à facturer, les erreurs, et le facteur de conversion de chaque ratio
 * touché (par chemin, `effects.0.scaling.0.ratio`) : son réglage change d'unité.
 */
function applyScalingSwaps(
  stats: BuilderStats,
  swaps: Build['swaps']['scalings'],
  option: { eligibleFor: (path: string) => SpellScalingSource[] } | null,
) {
  const factors: Record<string, number> = {};
  const lines: { path: string; from: SpellScalingSource; to: SpellScalingSource; before: number; after: number; scales: string }[] = [];
  const errors: string[] = [];
  const refs = new Map(scalingEntries(stats).map((r) => [r.path, r]));
  const seen = new Set<string>();
  for (const sw of swaps) {
    const ref = refs.get(sw.path);
    const entry = getAt(stats, sw.path) as SpellScaling | undefined;
    const list = ref ? (getAt(stats, ref.list) as SpellScaling[]) : [];
    if (!option) errors.push('Le scaling de ce sort est verrouillé : pas de swap.');
    else if (!ref || !entry) errors.push(`Swap de scaling : entrée « ${sw.path} » introuvable.`);
    else if (seen.has(sw.path)) errors.push(`Swap de scaling : « ${sw.path} » échangé deux fois.`);
    else if (!option.eligibleFor(sw.path).includes(sw.to)) errors.push(`Swap de scaling : ${sourceLabel(sw.to)} n'est pas une source permise pour ${ref.scales}.`);
    else if (list.some((s) => s.source === sw.to)) errors.push(`Swap de scaling : ${sourceLabel(sw.to)} porte déjà ${ref.scales}.`);
    else {
      seen.add(sw.path);
      const after = convertRatio(entry.ratio, entry.source, sw.to);
      lines.push({ path: sw.path, from: entry.source, to: sw.to, before: entry.ratio, after, scales: ref.scales });
      factors[`${sw.path}.ratio`] = ratioFactor(entry.source, sw.to);
      entry.ratio = after;
      entry.source = sw.to;
    }
  }
  return { factors, lines, errors };
}

/**
 * Le socle tel que les swaps de scaling du build le laissent, et le facteur de
 * chaque ratio converti. L'interface en a besoin pour montrer un réglage de
 * ratio dans l'unité de sa nouvelle source.
 */
export function scalingSwapPreview(spell: CustomizableSpell, build: Build | null | undefined): { stats: BuilderStats; factors: Record<string, number> } {
  const stats = clone(baseStatsOf(spell));
  const { factors } = applyScalingSwaps(stats, normalizeBuild(build).swaps.scalings, scalingSwapOption(spell));
  return { stats, factors };
}

/**
 * Un réglage de ratio dont la source a été échangée se lit dans l'unité de la
 * nouvelle source : son pas et son plafond suivent la même conversion.
 */
export function convertedParam(p: ParamDef, kind: ParamKind, factors: Record<string, number>): { kind: ParamKind; cap: Cap | null | undefined } {
  const f = factors[p.path];
  if (!f) return { kind, cap: p.cap };
  return {
    kind: { ...kind, step: Math.max(0.001, round(kind.step * f, 3)) },
    cap: p.cap ? { ...p.cap, value: round(p.cap.value * f, 3) } : p.cap,
  };
}

/** Champs de stats qu'un verrou peut viser : ceux-là ne comptent que si le sort les porte. */
const LOCKABLE_STAT_FIELDS = new Set([
  'classBonuses', 'inflicts', 'effects', 'scaling', 'pullsMetal', 'throwsMetal', 'requiresHit', 'damageType', 'choices',
]);

/**
 * Les verrous (Famille 5) qui concernent vraiment CE sort. Un verrou sur un
 * champ de stats que le sort ne porte pas (des bonus de classe sur un sort qui
 * n'en a aucun) reste dans la donnée — c'est un principe — mais n'a rien à
 * dire au lecteur. Un verrou narratif (hors stats) compte toujours.
 */
export function relevantLocks(spell: CustomizableSpell): { field: string; reason: string }[] {
  const base = baseStatsOf(spell) as unknown as Record<string, unknown>;
  return (spell.lockedFields ?? []).filter((l) => {
    if (!LOCKABLE_STAT_FIELDS.has(l.field)) return true;
    const v = base[l.field];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
}

export const baseDamageType = (spell: CustomizableSpell): string =>
  spell.baseStats.damageType ?? spell.damageType ?? DOMAIN_BY_KEY[spellDomains(spell)[0]]?.damageType ?? '';

/** Répartition de départ déclarée par la fiche (4bis), sauf si le type est gouverné. */
export function defaultMix(spell: CustomizableSpell): { type: string; tenths: number } | null {
  if (governedFields(spell).has('damageType')) return null;
  return spell.swapOptions?.defaultMix ?? null;
}

/** Répartition réellement appliquée : celle du build, à défaut celle de la fiche. */
export function effectiveMix(spell: CustomizableSpell, build: Build): { type: string; tenths: number } | null {
  return build.mix ?? defaultMix(spell);
}

/**
 * Crans de mixage à payer : l'ÉCART à la répartition de départ, pas la
 * répartition elle-même. Changer de type secondaire défait d'abord le départ.
 */
export function mixSteps(spell: CustomizableSpell, mix: Build['mix']): number {
  if (!mix) return 0;
  const def = defaultMix(spell);
  if (!def) return mix.tenths;
  return mix.type === def.type ? Math.abs(mix.tenths - def.tenths) : mix.tenths + def.tenths;
}

/** Types vers lesquels le curseur de mixage peut réaffecter (4bis ∪ 4ter débloqué). */
export function mixTargets(spell: CustomizableSpell, build: Build): string[] {
  const opts = spellOptions(spell);
  const base = baseDamageType(spell);
  const out = new Set((opts.mix?.damageTypes ?? []).filter((t) => t !== base));
  if (opts.crossDomain && build.crossDomain) {
    const t = DOMAIN_BY_KEY[build.crossDomain]?.damageType;
    if (t && t !== base) out.add(t);
  }
  return [...out];
}

/** Déf. des paramètres générés par un déblocage (chance d'un statut, ratio ajouté, entretien). */
export const unlockParams = {
  statusChance: (opts: SpellOptions) => ({ cap: opts.statusUnlock?.chanceCap ?? null, min: 0, max: 100 }),
  scalingRatio: (opts: SpellOptions) => ({ cap: opts.scalingUnlock?.ratioCap ?? null, min: 0 }),
  knockbackCells: (opts: SpellOptions) => ({ cap: opts.knockbackUnlock?.cellsCap ?? null, min: 1 }),
  upkeep: (opts: SpellOptions) => ({ cap: opts.continuousMode?.upkeepCap ?? null, min: 1 }),
};

export interface LedgerLine {
  family: 1 | 2 | 3 | 4;
  label: string;
  cost: number;
  detail: string;
}

export interface Evaluation {
  stats: BuilderStats;
  ledger: LedgerLine[];
  errors: string[];
  warnings: string[];
  gross: number;
  refunded: number;
  net: number;
  lost: number;
}

/**
 * Évalue un build : applique les familles dans un ordre fixe, tient le grand
 * livre des coûts, et produit les stats finales au format `SpellNodeStats`.
 *
 * Ordre : swaps (F4) → magnitudes (F1) → déblocages (F2) → paliers (F3) →
 * mixage de type (4bis/4ter), qui répartit le pool FINAL de dégâts.
 *
 * `player` absent (fiche du wiki, sans personnage) : la condition
 * d'investissement du 4ter ne peut pas être jugée, elle est rappelée en
 * avertissement au lieu d'invalider le build.
 */
export function evaluate(
  spell: CustomizableSpell,
  rawBuild: Partial<Build> | null | undefined,
  player: CustomizingPlayer | null,
  ctx: BuilderContext,
): Evaluation {
  const rules = ctx.rules;
  const build = normalizeBuild(rawBuild);
  const opts = spellOptions(spell);
  const governed = governedFields(spell);
  const stats = clone(baseStatsOf(spell));
  const ledger: LedgerLine[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let lost = 0;
  /** Ligne du swap de forme, remboursée si la zone finit refermée en cible unique. */
  let shapeLine: LedgerLine | undefined;
  const add = (family: LedgerLine['family'], label: string, cost: number, detail = '') =>
    ledger.push({ family, label, cost, detail });

  // ── Famille 4 — substitutions (coût plat) ──
  const sw = build.swaps;
  // Chaque ratio échangé coûte son forfait ; son réglage change d'unité (`factors`).
  const scalingSwaps = applyScalingSwaps(stats, sw.scalings, opts.scalingSwap);
  const factors = scalingSwaps.factors;
  errors.push(...scalingSwaps.errors);
  /** Swaps posés sur la durée : sans objet si le sort passe en mode continu. */
  const durationSwapLines: LedgerLine[] = [];
  for (const l of scalingSwaps.lines) {
    add(4, `Swap scaling (${l.scales}) ${sourceLabel(l.from)} → ${sourceLabel(l.to)}`, rules.costs.scalingSwap,
      `${fmt(l.before)} × ${sourceLabel(l.from)} → ${fmt(l.after)} × ${sourceLabel(l.to)}, même rendement`);
    if (l.path.startsWith('durationScaling')) durationSwapLines.push(ledger[ledger.length - 1]);
  }
  if (sw.areaShape) {
    const current = AREA_SHAPES.find((s) => (stats.area ?? '').startsWith(s));
    if (!opts.areaShapeSwap || !current) errors.push("Ce sort n'a pas de forme de zone échangeable.");
    else if (!opts.areaShapeSwap.shapes.includes(sw.areaShape)) errors.push(`Forme ${sw.areaShape} non permise.`);
    else if (sw.areaShape !== current) {
      stats.area = swapAreaShape(stats.area!, current, sw.areaShape);
      add(4, `Swap forme de zone ${current} → ${sw.areaShape}`, rules.costs.areaShapeSwap);
      shapeLine = ledger[ledger.length - 1];
    }
  }
  if (sw.defaultTarget) {
    const def = opts.defaultTargetSwap;
    if (!def) errors.push('Ce sort ne déclare pas de swap de cible par défaut.');
    else {
      const [a, b] = def.pair;
      stats.targets = (stats.targets ?? []).map((t) => (t === a ? b : t === b ? a : t));
      add(4, `Swap cible ${TARGET_LABELS[a]} ↔ ${TARGET_LABELS[b]}`, rules.costs.defaultTargetSwap);
    }
  }
  if (sw.statusType) {
    const def = opts.statusTypeSwap;
    const entry = stats.inflicts?.[sw.statusType.index];
    if (!def) {
      errors.push(governed.has('statusType')
        ? 'Le type de statut est gouverné par une mécanique de domaine : hors budget.'
        : 'Ce sort ne déclare pas de swap de type de statut.');
    } else if (!entry) errors.push('Swap de statut : entrée introuvable.');
    else if (!def.eligible.includes(sw.statusType.to)) errors.push(`Swap de statut : ${sw.statusType.to} n'est pas éligible.`);
    else if (stats.inflicts!.some((i) => i.status === sw.statusType!.to)) errors.push(`Swap de statut : ${sw.statusType.to} est déjà infligé.`);
    else {
      add(4, `Swap statut ${entry.status} → ${sw.statusType.to}`, rules.costs.statusTypeSwap);
      entry.status = sw.statusType.to;
    }
  }

  if (sw.damageType) {
    const def = opts.damageTypeSwap;
    const base = baseDamageType(spell);
    if (!def) {
      errors.push(governed.has('damageType')
        ? 'Le type de dégâts est gouverné par une mécanique de domaine : hors budget.'
        : 'Ce sort ne déclare pas de substitution de type de dégâts.');
    } else if (!def.eligible.includes(sw.damageType)) {
      errors.push(`Substitution de type : ${damageTypeLabel(sw.damageType)} n'est pas permis.`);
    } else if (sw.damageType !== base) {
      // Substitution franche : tout le pool change de nature, rien ne se partage.
      stats.damageType = sw.damageType;
      add(4, `Type de dégâts ${damageTypeLabel(base)} → ${damageTypeLabel(sw.damageType)}`, rules.costs.damageTypeSwap,
        'substitution entière, dégâts inchangés');
    }
  }

  // ── Famille 1 — magnitudes continues ──
  for (const p of opts.params) {
    const units = build.params[p.id] ?? 0;
    if (!units) continue;
    if (build.continuous && p.kind === 'duration') {
      warnings.push(`${p.label} : ignorée en mode continu (la durée n'a plus de sens).`);
      continue;
    }
    const raw = getAt(stats, p.path);
    const base = readMeasure(raw, p.measure);
    if (!kindOf(p, rules) || Number.isNaN(base)) {
      errors.push(`${p.label} : chemin « ${p.path} » illisible.`);
      continue;
    }
    // Un ratio dont la source a changé se règle dans l'unité de la nouvelle source.
    const { kind, cap } = convertedParam(p, kindOf(p, rules), factors);
    const res = priceParam(kind, base, units, cap, p);
    for (const e of res.errors) errors.push(`${p.label} : ${e}.`);
    // Un rayon ramené à 0 n'est plus une zone : c'est une cible unique.
    // (seule la première mesure peut refermer la zone : une profondeur nulle n'a pas de sens)
    setAt(stats, p.path, kind.zeroLabel && res.value <= 0 && (p.measure ?? 1) <= 1 ? kind.zeroLabel : writeMeasure(raw, res.value, p.measure));
    const dir = kind.better === 'down' ? -1 : 1;
    for (const s of p.shift ?? []) {
      const v = readNum(getAt(stats, s)) + dir * res.effective * kind.step;
      if (v < 0) errors.push(`${p.label} : ${s} deviendrait négatif.`);
      setAt(stats, s, round(Math.max(0, v)));
    }
    add(1, `${p.label} ${units > 0 ? 'amélioré' : 'mordu'} ×${Math.abs(units)}`, res.cost,
      `${fmt(base)} → ${fmt(res.value)}${res.zone === 'degrade' ? ` · ${res.excess} cran(s) en zone dégradée (k²)` : ''}`);
    if (res.lost) {
      lost += res.lost;
      warnings.push(`${p.label} : plafond dur ${fmt(cap?.value)} — ${res.lost} point(s) PERDU(S).`);
    }
  }

  // Zone refermée en cible unique : la forme n'a plus d'objet. Refermer, c'est
  // passer de « Cône » à « aucune » — le swap payé est rendu.
  if (shapeLine && !AREA_SHAPES.some((s) => (stats.area ?? '').startsWith(s))) {
    shapeLine.cost = 0;
    shapeLine.detail = 'zone refermée en cible unique : forme sans objet, remboursée';
  }

  // ── Famille 2 — déblocages ──
  if (build.statusUnlock) {
    const def = opts.statusUnlock;
    const { status, steps = 0 } = build.statusUnlock;
    if (!def) {
      errors.push(governed.has('statusType')
        ? 'Les statuts de ce sort sont gouvernés par une mécanique de domaine : hors budget.'
        : 'Ce sort ne déclare aucun statut débloquable.');
    } else if (!def.eligible.includes(status)) errors.push(`Statut ${status} non éligible pour ce sort.`);
    else if ((stats.inflicts ?? []).some((i) => i.status === status)) errors.push(`Le sort inflige déjà ${status}.`);
    else {
      const pdef = unlockParams.statusChance(opts);
      const res = priceParam(rules.paramKinds.chance, rules.unlockedStatusBaseChance, steps, pdef.cap, pdef);
      for (const e of res.errors) errors.push(`Chance de ${status} : ${e}.`);
      stats.inflicts = [...(stats.inflicts ?? []), { status, chance: res.value }];
      add(2, `Déblocage statut ${status}`, rules.costs.statusUnlock);
      if (steps) add(1, `Chance de ${status} ${steps > 0 ? 'améliorée' : 'mordue'} ×${Math.abs(steps)}`, res.cost, `${rules.unlockedStatusBaseChance} % → ${res.value} %`);
    }
  }
  if (build.knockback) {
    const def = opts.knockbackUnlock;
    const steps = build.knockback.steps ?? 0;
    if (!def) errors.push('Ce sort ne déclare pas de repoussement débloquable.');
    else if (stats.knockback) errors.push('Le sort repousse déjà.');
    else {
      const pdef = unlockParams.knockbackCells(opts);
      const base = rules.unlockedKnockbackCells;
      const res = priceParam(rules.paramKinds.knockback, base, steps, pdef.cap, pdef);
      for (const e of res.errors) errors.push(`Repoussement : ${e}.`);
      stats.knockback = res.value;
      add(2, 'Déblocage repoussement', rules.costs.knockbackUnlock, `${base} case`);
      if (steps) add(1, `Repoussement ${steps > 0 ? 'allongé' : 'raccourci'} ×${Math.abs(steps)}`, res.cost, `${base} → ${res.value} cases`);
    }
  }
  for (const t of build.targetUnlocks) {
    const def = opts.targetUnlock;
    if (!def || !def.eligible.includes(t)) errors.push(`Cible ${t} non éligible pour ce sort.`);
    else if ((stats.targets ?? []).includes(t)) errors.push(`La cible ${t} est déjà permise.`);
    else {
      stats.targets = [...(stats.targets ?? []), t];
      add(2, `Déblocage cible ${TARGET_LABELS[t]}`, rules.costs.targetUnlock);
    }
  }
  for (const [source, steps] of Object.entries(build.scalingUnlocks)) {
    const def = opts.scalingUnlock;
    const field = def?.field ?? 'scaling';
    const list: SpellScaling[] = stats[field] ?? [];
    if (!def || !def.eligible.includes(source as SpellScalingSource)) errors.push(`Scaling ${source} non éligible pour ce sort.`);
    else if (list.some((s) => s.source === source)) errors.push(`${source} est déjà une source de scaling.`);
    else {
      const pdef = unlockParams.scalingRatio(opts);
      const res = priceParam(rules.paramKinds.ratio, rules.unlockedScalingRatio, steps, pdef.cap, pdef);
      for (const e of res.errors) errors.push(`Ratio ${source} : ${e}.`);
      stats[field] = [...list, { source: source as SpellScalingSource, ratio: res.value, ...(def.affects ? { affects: def.affects } : {}) }];
      add(2, `Déblocage scaling ${sourceLabel(source)} (${field})`, rules.costs.scalingUnlock);
      if (steps) add(1, `Ratio ${sourceLabel(source)} ${steps > 0 ? 'amélioré' : 'mordu'} ×${Math.abs(steps)}`, res.cost, `${rules.unlockedScalingRatio} → ${res.value}`);
    }
  }
  if (build.continuous) {
    const def = opts.continuousMode;
    if (!def) errors.push('Ce sort ne peut pas passer en mode continu.');
    else if (!((spell.baseStats.duration ?? 0) > 0)) errors.push('Le mode continu exige un sort à durée fixe.');
    else {
      const pdef = unlockParams.upkeep(opts);
      const base = spell.baseStats.mana;
      const res = priceParam(rules.paramKinds.upkeep, base, build.upkeepSteps, pdef.cap, pdef);
      for (const e of res.errors) errors.push(`Entretien : ${e}.`);
      stats.duration = -1;
      stats.upkeep = res.value;
      // Plus de durée, donc plus rien à faire durer : le scaling de durée tombe.
      if (stats.durationScaling?.length) {
        delete stats.durationScaling;
        if (opts.scalingUnlock?.field === 'durationScaling' && Object.keys(build.scalingUnlocks).length) {
          warnings.push('Scaling de durée : sans objet en mode continu, les points sont perdus.');
        }
      }
      // Changer la source d'un scaling de durée n'a plus d'objet non plus : rendu.
      for (const line of durationSwapLines) {
        line.cost = 0;
        line.detail = 'sans objet en mode continu : remboursé';
      }
      add(2, 'Déblocage du mode continu', rules.costs.continuousMode, `entretien de base = coût de lancement (${base})`);
      if (build.upkeepSteps) add(1, `Entretien ${build.upkeepSteps > 0 ? 'réduit' : 'mordu'} ×${Math.abs(build.upkeepSteps)}`, res.cost, `${base} → ${res.value} / tour`);
    }
  }

  // ── Famille 3 — paliers à saut structurel (plafond absolu) ──
  if (build.extraTargets) {
    const def = opts.extraTargets;
    if (!def) errors.push('Ce sort ne déclare pas de cibles simultanées.');
    else {
      const total = def.base + build.extraTargets;
      if (build.extraTargets < 0) errors.push('Cibles simultanées : on ne descend pas sous la base.');
      const ceiling = extraTargetsCeiling(def, rules);
      if (total > ceiling) {
        errors.push(ceiling < rules.family3Cap
          ? `Cibles simultanées : ${total} > ${ceiling}, le plafond de ce sort.`
          : `Cibles simultanées : ${total} > plafond absolu ${rules.family3Cap}.`);
      }
      if (def.field) stats[def.field] = total;
      else {
        stats.maxTargets = total;
        if (stats.area === 'Cible unique' && total > 1) stats.area = `${total} cibles`;
      }
      add(3, `+${build.extraTargets} ${def.label ?? 'cible(s) simultanée(s)'}`, build.extraTargets * rules.costs.extraTarget, `${def.base} → ${total}`);
    }
  }
  for (const key of build.extraEffects) {
    const eff = opts.extraEffects?.eligible.find((e) => e.stat === key);
    if (!eff) errors.push(`Effet ${key} non éligible pour ce sort.`);
    else if ((stats.effects ?? []).some((e) => e.stat === key)) errors.push(`L'effet ${key} est déjà actif.`);
    else {
      stats.effects = [...(stats.effects ?? []), clone(eff)];
      add(3, `+1 effet simultané : ${sourceLabel(key)}`, rules.costs.extraEffect);
    }
  }
  if (build.extraEffects.length && (stats.effects ?? []).length > rules.family3Cap) {
    errors.push(`Effets simultanés : ${stats.effects!.length} > plafond absolu ${rules.family3Cap}.`);
  }
  // Effets propres au sort : ce que lui seul sait faire, débloqué un à un.
  for (const id of build.ownEffects) {
    const own = opts.ownEffects?.find((e) => e.id === id);
    if (!own) {
      errors.push(`Effet propre « ${id} » non éligible pour ce sort.`);
      continue;
    }
    const already = (own.grants.inflicts ?? []).filter((i) => (stats.inflicts ?? []).some((x) => x.status === i.status));
    if (already.length) {
      errors.push(`${own.label} : le sort inflige déjà ${already.map((i) => i.status).join(', ')}.`);
      continue;
    }
    if (own.grants.inflicts?.length) stats.inflicts = [...(stats.inflicts ?? []), ...clone(own.grants.inflicts)];
    if (own.grants.cleanses?.length) stats.cleanses = [...new Set([...(stats.cleanses ?? []), ...own.grants.cleanses])];
    if (own.grants.effects?.length) stats.effects = [...(stats.effects ?? []), ...clone(own.grants.effects)];
    if (own.grants.lingers) stats.lingers = own.grants.lingers;
    for (const [field, value] of Object.entries(own.grants.set ?? {})) {
      const current = (stats as unknown as Record<string, unknown>)[field];
      if (current != null) errors.push(`${own.label} : le sort porte déjà « ${field} ».`);
      else (stats as unknown as Record<string, unknown>)[field] = clone(value);
    }
    if (own.grants.choices?.length) {
      const known = new Set((stats.choices ?? []).map((c) => c.name));
      const dup = own.grants.choices.filter((c) => known.has(c.name));
      if (dup.length) errors.push(`${own.label} : le sort propose déjà ${dup.map((c) => c.name).join(', ')}.`);
      stats.choices = [...(stats.choices ?? []), ...clone(own.grants.choices)];
    }
    add(3, `+1 effet propre : ${own.label}`, own.cost ?? rules.costs.extraEffect, own.description ?? '');
  }

  // ── 4ter — ajout cross-domaine (déblocage d'accès au curseur) ──
  if (build.crossDomain) {
    const def = opts.crossDomain;
    if (!def) {
      errors.push(governed.has('damageType')
        ? 'Le type de dégâts est gouverné par une mécanique de domaine : hors budget.'
        : 'Ce sort ne déclare aucun domaine cross-éligible.');
    } else if (!def.eligible.includes(build.crossDomain)) {
      errors.push(`${build.crossDomain} n'est pas déclaré dans crossDomainEligible.`);
    } else {
      const needed = [...spellDomains(spell), build.crossDomain];
      if (player) {
        const invested = investedDomains(player, ctx);
        const notInvested = needed.filter((d) => !invested.has(d));
        if (notInvested.length) errors.push(`4ter : le personnage doit avoir investi dans ${notInvested.map(domainLabel).join(' et ')}.`);
      } else {
        warnings.push(`4ter : exige d'avoir investi dans ${needed.map(domainLabel).join(' et ')}.`);
      }
      add(4, `Déblocage cross-domaine ${domainLabel(build.crossDomain)}`, rules.costs.crossDomainUnlock, 'accès au curseur, aucun dégât ajouté');
    }
  }

  // ── 4bis / 4ter — mixage partiel de type (somme constante) ──
  // La fiche peut partir d'une répartition déjà acquise : le build n'en paie que l'écart.
  const mix = effectiveMix(spell, build);
  if (mix && (mix.tenths || build.mix)) {
    const { type, tenths } = mix;
    const allowed = mixTargets(spell, build);
    const start = defaultMix(spell);
    const steps = mixSteps(spell, build.mix);
    if (tenths < 0 || tenths > 10) errors.push('Mixage : entre 0 % et 100 %.');
    else if (!tenths) {
      if (steps) add(4, `Mixage ramené à 100 % ${damageTypeLabel(baseDamageType(spell))}`, steps * rules.costs.mixPerTenth,
        `départ ${start ? start.tenths * 10 : 0} %`);
    } else if (stats.damageMin == null || stats.damageMax == null) errors.push("Mixage : ce sort n'a pas de pool de dégâts.");
    else if (!allowed.includes(type)) errors.push(`Mixage : ${damageTypeLabel(type)} n'est pas un type compatible.`);
    else {
      const base = baseDamageType(spell);
      const share = tenths / 10;
      const { damageMin: min, damageMax: max } = stats;
      if (share >= 1) {
        stats.damageType = type;
      } else {
        delete stats.damageMin;
        delete stats.damageMax;
        stats.damages = [
          { min: round(min * (1 - share), 1), max: round(max * (1 - share), 1), type: base },
          { min: round(min * share, 1), max: round(max * share, 1), type },
        ];
      }
      if (steps) {
        add(4, `Mixage ${tenths * 10} % → ${damageTypeLabel(type)}`, steps * rules.costs.mixPerTenth,
          start ? `départ ${start.tenths * 10} % ${damageTypeLabel(start.type)}, total inchangé` : 'réaffectation, total inchangé');
      }
    }
  }

  const gross = ledger.filter((l) => l.cost > 0).reduce((s, l) => s + l.cost, 0);
  const refunded = -ledger.filter((l) => l.cost < 0).reduce((s, l) => s + l.cost, 0);
  return { stats, ledger, errors, warnings, gross, refunded, net: gross - refunded, lost };
}

export interface Assessment extends Evaluation {
  progress: SpellProgress;
  remaining: number;
  valid: boolean;
}

function withBudget(ev: Evaluation, progress: SpellProgress): Assessment {
  const remaining = progress.pointsEarned - ev.net;
  const errors = [...ev.errors];
  if (remaining < 0) errors.push(`Budget dépassé de ${-remaining} point(s) (${progress.pointsEarned} gagnés, ${ev.net} nets dépensés).`);
  return { ...ev, progress, remaining, errors, valid: errors.length === 0 };
}

/** Bilan complet d'un sort pour un personnage : progression + build + solde. */
export function assess(spell: CustomizableSpell, player: CustomizingPlayer, ctx: BuilderContext, build?: Partial<Build> | null): Assessment {
  const st = player.spellState[spell.key];
  return withBudget(evaluate(spell, build ?? st?.build, player, ctx), spellProgress(st?.xp ?? 0, ctx.rules));
}

/**
 * Bilan d'un build à un niveau de sort donné, sans personnage : c'est ce que
 * la fiche du wiki montre (« avec un sort de niveau 3, voici ce qu'on peut en
 * faire »).
 */
export function assessAtLevel(spell: CustomizableSpell, build: Partial<Build> | null, spellLevel: number, ctx: BuilderContext): Assessment {
  const level = Math.max(0, Math.min(spellLevel, ctx.rules.maxSpellLevel));
  return withBudget(evaluate(spell, build, null, ctx), spellProgress(xpThreshold(level, ctx.rules), ctx.rules));
}

// ── Lecture humaine des stats ───────────────────────────────────────────────

const scalingText = (list: SpellScaling[] | undefined) =>
  (list ?? []).map((s) => `${fmt(s.ratio)} × ${sourceLabel(s.source)}`).join(' + ');

export interface StatRow {
  key: string;
  label: string;
  value: string;
}

/** Stats → lignes lisibles, indexées par une clé stable pour comparer socle et build. */
export function describeStats(stats: BuilderStats, statusNames: Record<string, string> = {}): StatRow[] {
  const rows: StatRow[] = [];
  const push = (key: string, label: string, value: string) => rows.push({ key, label, value });
  if (stats.damages) {
    push('damage', 'Dégâts', stats.damages.map((d) => `${fmt(d.min)}–${fmt(d.max)} ${damageTypeLabel(d.type)}`).join(' + '));
  } else if (stats.damageMin != null) {
    push('damage', 'Dégâts', `${fmt(stats.damageMin)}–${fmt(stats.damageMax)}${stats.damageType ? ` ${damageTypeLabel(stats.damageType)}` : ''}`);
  }
  if (stats.heal != null) push('heal', 'Soin', fmt(stats.heal));
  if (stats.drain != null) push('drain', 'Drain', `${fmt(round(stats.drain * 100, 1))} % des dégâts portés`);
  push('mana', 'Mana', fmt(stats.mana));
  if (stats.upkeep != null) push('upkeep', 'Entretien', `${fmt(stats.upkeep)} / tour`);
  if (stats.range != null) push('range', 'Portée', stats.range);
  if (stats.area != null) push('area', 'Zone', stats.area);
  if (stats.targets) push('targets', 'Cibles', stats.targets.map((t) => TARGET_LABELS[t] ?? t).join(', '));
  if (stats.maxTargets != null) push('maxTargets', 'Cibles simultanées', fmt(stats.maxTargets));
  if (stats.maxPuppets != null) push('maxPuppets', 'Pantins simultanés', fmt(stats.maxPuppets));
  if (stats.duration != null) push('duration', 'Durée', stats.duration < 0 ? 'Continu (tant que le mana paie)' : `${fmt(stats.duration)} tour(s)`);
  if (stats.durationScaling?.length) push('durationScaling', 'Durée (scaling)', `+ ${scalingText(stats.durationScaling)}`);
  for (const s of stats.scaling ?? []) {
    push(`scaling:${s.source}`, `Scaling ${s.affects === 'heal' ? '(soin)' : '(dégâts)'}`, `${fmt(s.ratio)} × ${sourceLabel(s.source)}`);
  }
  for (const e of stats.effects ?? []) {
    push(`effect:${e.stat}`, `Effet ${sourceLabel(e.stat)}`, `+${fmt(e.value)}${e.scaling?.length ? ` + ${scalingText(e.scaling)}` : ''}`);
  }
  for (const i of stats.inflicts ?? []) {
    push(`inflict:${i.status}`, `Statut ${statusNames[i.status] ?? i.status}`,
      `${fmt(i.chance)} %${(i.duration ?? 0) < 0 ? ' · illimité' : i.duration ? ` · ${i.duration} t.` : ''}`);
  }
  if (stats.requiresHit) push('requiresHit', 'Jet de toucher', 'requis');
  if (stats.precisionPenalty != null) push('precisionPenalty', 'Pénalité de précision', `−${fmt(stats.precisionPenalty)}`);
  if (stats.tetherRange != null) push('tetherRange', 'Laisse (tether)', stats.tetherRange);
  if (stats.pullsMetal) push('pullsMetal', 'Saisit le métal', 'oui');
  if (stats.pullDc != null) push('pullDc', 'DC (Force)', fmt(stats.pullDc));
  if (stats.classBonuses?.length) push('classBonuses', 'Bonus de classe', stats.classBonuses.map((b) => b.class).join(', '));
  return rows;
}

/** Valeur d'une source de scaling pour ce personnage (attribut ou stat de combat). */
export function sourceValue(player: CustomizingPlayer, source: string): number {
  const attrs = player.attributes as Record<string, number>;
  const stats = player.stats as Record<string, number>;
  return attrs[source] ?? stats[source] ?? 0;
}

/** Ce que le sort produit réellement entre les mains de CE personnage. */
export function expectedOutput(stats: BuilderStats, player: CustomizingPlayer): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const sum = (list: SpellScaling[] | undefined) =>
    (list ?? []).reduce((s, x) => s + x.ratio * sourceValue(player, x.source), 0);
  const scaled = (affects: SpellScalingAffects) => sum((stats.scaling ?? []).filter((s) => (s.affects ?? 'damage') === affects));

  const dice = stats.damages
    ? stats.damages.map((d) => ({ type: d.type, avg: (d.min + d.max) / 2 }))
    : stats.damageMin != null
      ? [{ type: stats.damageType, avg: (stats.damageMin + (stats.damageMax ?? stats.damageMin)) / 2 }]
      : [];
  if (dice.length) {
    const diceTotal = dice.reduce((s, d) => s + d.avg, 0);
    const total = diceTotal + scaled('damage');
    const split = dice.length > 1 && diceTotal > 0
      ? ` (${dice.map((d) => `${fmt(round((total * d.avg) / diceTotal, 1))} ${damageTypeLabel(d.type)}`).join(' + ')})`
      : '';
    rows.push({ label: 'Dégâts moyens', value: `${fmt(round(total, 1))}${split}` });
  }
  if (stats.heal != null) rows.push({ label: 'Soin moyen', value: fmt(round(stats.heal + scaled('heal'), 1)) });
  if (stats.drain != null && dice.length) {
    const moyen = dice.reduce((s, d) => s + d.avg, 0) + scaled('damage');
    rows.push({ label: 'Drain moyen', value: `${fmt(round(moyen * stats.drain, 1))} PV` });
  }
  for (const e of stats.effects ?? []) {
    rows.push({ label: `Effet ${sourceLabel(e.stat)}`, value: `+${fmt(round((e.value ?? 0) + sum(e.scaling), 1))}` });
  }
  if ((stats.duration ?? 0) > 0) {
    rows.push({ label: 'Durée', value: `${fmt(Math.floor(stats.duration! + sum(stats.durationScaling)))} tour(s)` });
  }
  const pool = player.stats.mana ?? 0;
  if (stats.upkeep != null && stats.mana > 0) {
    const turns = pool >= stats.mana ? 1 + Math.floor((pool - stats.mana) / stats.upkeep) : 0;
    rows.push({ label: 'Tenue à plein mana', value: `${turns} tour(s)` });
  } else if (stats.mana > 0) {
    rows.push({ label: 'Lancers à plein mana', value: fmt(Math.floor(pool / stats.mana)) });
  }
  return rows;
}

// ── Contrôle des fiches ─────────────────────────────────────────────────────

/**
 * Vérifie qu'une fiche personnalisable respecte les principes du document.
 * `ref` (facultatif) valide les clés de statut et de type de dégâts.
 */
export function lintSpell(
  spell: CustomizableSpell,
  rules: Rules = DEFAULT_RULES,
  ref: { statusKeys?: Set<string>; damageTypes?: Set<string> } = {},
): string[] {
  const issues: string[] = [];
  const c = spell.customization;
  const stats = baseStatsOf(spell);
  const locked = (spell.lockedFields ?? []).map((l) => l.field);
  const governed = governedFields(spell);

  for (const p of c.params ?? []) {
    if (!rules.paramKinds[p.kind]) issues.push(`param ${p.id} : kind « ${p.kind} » inconnu`);
    if (p.growth === '1-2-5' && Number.isNaN(niceRank(paramBase(stats, p)))) {
      issues.push(`param ${p.id} : une suite 1-2-5 part d'une valeur ronde (1, 2, 5, 10, 20…)`);
    }
    if (typeof p.growth === 'number' && !(p.growth > 1)) issues.push(`param ${p.id} : un facteur de progression doit dépasser 1`);
    if (p.comparisons) {
      const seuils = p.comparisons.map((c) => c.upTo);
      const open = seuils.findIndex((u) => u == null);
      if (open >= 0 && open !== seuils.length - 1) issues.push(`param ${p.id} : seule la dernière comparaison peut se passer de seuil (texte général)`);
      const fixed = seuils.filter((u): u is number => u != null);
      if (fixed.some((u, i) => i > 0 && u <= fixed[i - 1])) issues.push(`param ${p.id} : les seuils de comparaison doivent croître`);
    }
    if (p.ladder) {
      const rank = paramBase(stats, p);
      const last = p.ladder.length - 1;
      if (!Number.isInteger(rank) || rank < 0 || rank > last) issues.push(`param ${p.id} : le socle doit être un échelon de l'échelle (0 à ${last})`);
      if (p.max == null || p.max > last) issues.push(`param ${p.id} : « max » doit borner l'échelle (≤ ${last})`);
      if ((p.step ?? rules.paramKinds[p.kind]?.step) !== 1) issues.push(`param ${p.id} : une échelle avance d'un échelon par cran`);
    }
    if (Number.isNaN(paramBase(stats, p))) {
      issues.push(`param ${p.id} : « ${p.path} »${p.measure && p.measure > 1 ? ` (mesure ${p.measure})` : ''} ne pointe pas un nombre du socle`);
    }
    if (locked.some((f) => p.path === f || p.path.startsWith(`${f}.`))) issues.push(`param ${p.id} : touche un champ verrouillé (Famille 5)`);
  }
  // Un champ verrouillé ne doit pas non plus changer par une porte dérobée.
  const touchedBy: Record<string, boolean> = {
    targets: !!(c.targetUnlock || c.defaultTargetSwap),
    inflicts: !!(c.statusUnlock || c.statusTypeSwap || (c.ownEffects ?? []).some((e) => e.grants.inflicts?.length)),
    scaling: !!(c.scalingSwap || (c.scalingUnlock && (c.scalingUnlock.field ?? 'scaling') === 'scaling')),
    area: !!c.areaShapeSwap,
    knockback: !!c.knockbackUnlock,
  };
  for (const f of locked) if (touchedBy[f]) issues.push(`une option modifie « ${f} », pourtant verrouillé (Famille 5)`);
  if (governed.has('statusType') && (c.statusTypeSwap || c.statusUnlock)) {
    issues.push('déclare des options de statut alors que le type de statut est gouverné par le domaine');
  }
  if (governed.has('damageType') && (spell.swapOptions || spell.crossDomain)) {
    issues.push('déclare un mixage de type alors que le type de dégâts est gouverné par le domaine');
  }
  const own = spellDomains(spell);
  for (const d of spell.crossDomain?.eligible ?? []) {
    if (own.includes(d)) issues.push(`crossDomainEligible : ${d} est déjà un domaine natif (relève de swapOptions)`);
    for (const [a, b] of OPPOSED_DOMAINS) {
      if (own.some((o) => (o === a && d === b) || (o === b && d === a))) issues.push(`crossDomainEligible : ${d} est en opposition directe avec le sort`);
    }
    if (!DOMAIN_BY_KEY[d]) issues.push(`crossDomainEligible : domaine ${d} inconnu`);
  }
  for (const r of swapRules(spell)) {
    if (r.path && !scalingEntries(stats).some((e) => e.path === r.path)) issues.push(`scalingSwap : le ratio « ${r.path} » n'existe pas dans le socle`);
    for (const s of r.eligible) if (!SCALING_SWAP_SOURCES.includes(s)) issues.push(`scalingSwap : source « ${s} » inconnue`);
  }
  const ownIds = new Set<string>();
  for (const own of c.ownEffects ?? []) {
    if (ownIds.has(own.id)) issues.push(`ownEffects : deux effets portent l'identifiant « ${own.id} »`);
    ownIds.add(own.id);
    const g = own.grants ?? {};
    for (const field of Object.keys(g.set ?? {})) {
      if ((stats as unknown as Record<string, unknown>)[field] != null) issues.push(`ownEffects : « ${own.id} » pose « ${field} », que le socle porte déjà`);
      if (locked.some((f) => f === field || f.startsWith(`${field}.`))) issues.push(`ownEffects : « ${own.id} » pose « ${field} », pourtant verrouillé (Famille 5)`);
    }
    if (!g.inflicts?.length && !g.cleanses?.length && !g.effects?.length && !g.lingers && !g.choices?.length
      && !Object.keys(g.set ?? {}).length) {
      issues.push(`ownEffects : « ${own.id} » n'ajoute rien aux stats`);
    }
    for (const e of g.effects ?? []) {
      if (locked.includes('effects')) issues.push(`ownEffects : « ${own.id} » écrit dans « effects », pourtant verrouillé (Famille 5)`);
      if (!STATS.some((st) => st.key === e.stat) && !ATTRIBUTES.some((a) => a.key === e.stat)) {
        issues.push(`ownEffects : stat « ${e.stat} » inconnue`);
      }
    }
  }
  if (c.extraTargets && c.extraTargets.base > rules.family3Cap) issues.push('extraTargets.base au-delà du plafond absolu');
  if (c.extraTargets?.field && stats[c.extraTargets.field] !== c.extraTargets.base) {
    issues.push(`extraTargets.base (${c.extraTargets.base}) ≠ ${c.extraTargets.field} du socle (${stats[c.extraTargets.field]})`);
  }
  if (ref.statusKeys) {
    const statuses = [
      ...(c.statusUnlock?.eligible ?? []), ...(c.statusTypeSwap?.eligible ?? []),
      ...(stats.inflicts ?? []).map((i) => i.status),
      ...(c.ownEffects ?? []).flatMap((e) => [
        ...(e.grants.inflicts ?? []).map((i) => i.status),
        ...(e.grants.cleanses ?? []),
        ...(e.grants.choices ?? []).flatMap((ch) => (ch.inflicts ?? []).map((i) => i.status)),
      ]),
      ...(stats.choices ?? []).flatMap((ch) => (ch.inflicts ?? []).map((i) => i.status)),
    ];
    for (const s of statuses) if (!ref.statusKeys.has(s)) issues.push(`statut ${s} absent de status_effects.json`);
  }
  if (ref.damageTypes) {
    for (const t of [...(spell.swapOptions?.damageTypes ?? []), ...(c.damageTypeSwap?.eligible ?? [])]) {
      if (!ref.damageTypes.has(t)) issues.push(`type de dégâts ${t} inconnu`);
    }
  }
  const start = spell.swapOptions?.defaultMix;
  if (start) {
    if (!spell.swapOptions!.damageTypes.includes(start.type)) issues.push(`defaultMix : ${start.type} n'est pas dans la table du sort`);
    if (start.type === baseDamageType(spell)) issues.push('defaultMix : le type de base ne se partage pas avec lui-même');
    if (!Number.isInteger(start.tenths) || start.tenths < 0 || start.tenths > 10) issues.push('defaultMix : entre 0 et 10 dixièmes');
    if (stats.damageMin == null || stats.damageMax == null) issues.push("defaultMix : ce sort n'a pas de pool de dégâts à répartir");
  }
  if (c.damageTypeSwap) {
    if (governed.has('damageType')) issues.push('déclare une substitution de type alors que le type de dégâts est gouverné par le domaine');
    if (locked.includes('damageType')) issues.push('une option modifie « damageType », pourtant verrouillé (Famille 5)');
    if (c.damageTypeSwap.eligible.includes(baseDamageType(spell))) issues.push('damageTypeSwap : le type de base ne se substitue pas à lui-même');
    if (stats.damageMin == null && stats.damageMax == null) issues.push("damageTypeSwap : ce sort n'inflige aucun dégât à requalifier");
  }
  if (!(c.params ?? []).length && !c.statusUnlock && !c.targetUnlock && !c.scalingUnlock && !c.continuousMode
    && !c.extraTargets && !c.extraEffects && !c.ownEffects && !c.knockbackUnlock && !c.scalingSwap && !c.areaShapeSwap && !c.defaultTargetSwap
    && !c.statusTypeSwap && !c.damageTypeSwap && !spell.swapOptions && !spell.crossDomain) {
    issues.push("n'ouvre aucune personnalisation");
  }
  return issues;
}

// ── Export au format du gabarit 4B ──────────────────────────────────────────

export function exportSpell(spell: CustomizableSpell & { description?: string; subdomains?: string[]; power?: string }, player: CustomizingPlayer, ctx: BuilderContext, build?: Partial<Build> | null) {
  const rules = ctx.rules;
  const st = player.spellState[spell.key];
  const b = normalizeBuild(build ?? st?.build);
  const a = assess(spell, player, ctx, b);
  const opts = spellOptions(spell);
  const base = baseStatsOf(spell);

  const allocations: Record<string, object> = {};
  for (const p of opts.params) {
    const kind = kindOf(p, rules);
    const baseValue = paramBase(base, p);
    const res = priceParam(kind, baseValue, b.params[p.id] ?? 0, p.cap, p);
    allocations[p.id] = {
      path: p.path,
      base: baseValue,
      current: res.value,
      family: 1,
      costPerUnit: kind.cost,
      step: kind.step,
      ...(p.cap
        ? capKind(p.cap, kind) === 'hard'
          ? { hardCap: p.cap.value }
          : { softCap: p.cap.value, softCapCurve: 'quadratic' }
        : {}),
    };
  }

  return {
    key: spell.key,
    name: spell.name,
    description: spell.description,
    domain: spell.domain,
    ...(spell.components ? { components: spell.components } : {}),
    subdomains: spell.subdomains,
    level: spell.level,
    tier: spell.power ?? 'standard',
    baseStats: spell.baseStats,
    spellProgression: {
      currentXP: a.progress.xp,
      spellLevel: a.progress.level,
      xpThresholdFormula: xpThresholdFormula(rules),
      xpRatios: { combat: rules.xpRatios.combat, entrainement_repos_long: rules.xpRatios.training },
    },
    customization: {
      pointsEarnedTotal: a.progress.pointsEarned,
      pointsSpentTotal: a.gross,
      pointsRefundedByBiting: a.refunded,
      pointsRemaining: a.remaining,
      lastReassignedAt: st?.lastReassignedAt ?? null,
      allocations,
      statusUnlock: opts.statusUnlock
        ? {
            unlocked: !!b.statusUnlock,
            eligibleStatuses: opts.statusUnlock.eligible,
            type: b.statusUnlock?.status ?? null,
            entryCost: rules.costs.statusUnlock,
            chanceSteps: b.statusUnlock?.steps ?? 0,
          }
        : null,
      targetUnlock: opts.targetUnlock ? { eligible: opts.targetUnlock.eligible, unlocked: b.targetUnlocks, entryCost: rules.costs.targetUnlock } : null,
      scalingUnlock: opts.scalingUnlock ? { eligible: opts.scalingUnlock.eligible, unlocked: b.scalingUnlocks, entryCost: rules.costs.scalingUnlock } : null,
      continuousMode: opts.continuousMode ? { unlocked: b.continuous, unlockCost: rules.costs.continuousMode, upkeepSteps: b.upkeepSteps } : null,
      family3: { extraTargets: b.extraTargets, extraEffects: b.extraEffects, ownEffects: b.ownEffects, absoluteCap: rules.family3Cap },
      swaps: b.swaps,
    },
    lockedFields: spell.lockedFields ?? [],
    domainGoverned: spell.domainGoverned ?? [],
    swapOptions: spell.swapOptions ?? null,
    crossDomainEligible: spell.crossDomain?.eligible ?? [],
    crossDomainAdd: {
      unlocked: !!b.crossDomain,
      domain: b.crossDomain,
      unlockCost: rules.costs.crossDomainUnlock,
      mixRatioIfUnlocked: (effectiveMix(spell, b)?.tenths ?? 0) / 10,
      costPerTenPercent: rules.costs.mixPerTenth,
    },
    requires: spell.requires ?? [],
    classBonuses: spell.baseStats.classBonuses ?? [],
    finalStats: a.stats,
    validation: { valid: a.valid, errors: a.errors, warnings: a.warnings },
  };
}
