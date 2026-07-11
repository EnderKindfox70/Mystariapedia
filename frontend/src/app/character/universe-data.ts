import {
  CharacterSheet,
  AttributeKey,
  StatKey,
  StatKV,
  RaceDef,
  ClassDef,
  BackgroundDef,
  TraitDef,
} from './character.types';
import fireDomain from '../../../public/resources/json/domains/fire.json';
import waterDomain from '../../../public/resources/json/domains/water.json';
import earthDomain from '../../../public/resources/json/domains/earth.json';
import airDomain from '../../../public/resources/json/domains/air.json';
import electricityDomain from '../../../public/resources/json/domains/electricity.json';
import plantDomain from '../../../public/resources/json/domains/plant.json';
import lightDomain from '../../../public/resources/json/domains/light.json';
import darknessDomain from '../../../public/resources/json/domains/darkness.json';
import lifeDomain from '../../../public/resources/json/domains/life.json';
import deathDomain from '../../../public/resources/json/domains/death.json';
import timeDomain from '../../../public/resources/json/domains/time.json';
import spaceDomain from '../../../public/resources/json/domains/space.json';
import combinationsCatalog from '../../../public/resources/json/domains/combinations.json';

/** Les 12 domaines de magie de Mystaria — servent d'« écoles » sur la fiche.
 *  sigils & slugs repris de views/magics/magics.html. */
export interface MagicDomain {
  key: string;
  name: string;
  sigil: string;
}

export const MAGIC_DOMAINS: MagicDomain[] = [
  { key: 'fire', name: 'Feu', sigil: '♨' },
  { key: 'water', name: 'Eau', sigil: '≋' },
  { key: 'earth', name: 'Terre', sigil: '△' },
  { key: 'air', name: 'Air', sigil: '☲' },
  { key: 'electricity', name: 'Foudre', sigil: 'ϟ' },
  { key: 'plant', name: 'Plantes', sigil: '✥' },
  { key: 'light', name: 'Lumière', sigil: '☼' },
  { key: 'darkness', name: 'Ténèbres', sigil: '◉' },
  { key: 'life', name: 'Vie', sigil: '♧' },
  { key: 'death', name: 'Mort', sigil: '☠' },
  { key: 'time', name: 'Temps', sigil: '⌛' },
  { key: 'space', name: 'Espace', sigil: '✧' },
];

const DOMAIN_BY_KEY = new Map(MAGIC_DOMAINS.map((d) => [d.key, d]));
export const domainName = (key: string): string => DOMAIN_BY_KEY.get(key)?.name ?? key;
export const domainSigil = (key: string): string => DOMAIN_BY_KEY.get(key)?.sigil ?? '◇';

/** Un sort de base, tel que stocké dans les sous-domaines des fichiers domains/*.json. */
interface RawSpell {
  key: string;
  name: string;
  description: string;
  mana: number;
  /** Niveau requis pour débloquer le sort. */
  level: number;
  subdomains: string[];
  /** Clés des sorts prérequis (map de déblocage). */
  requires?: string[];
  /** Arbre d'amélioration : racine, paliers (nœuds) et libellés de branches. */
  progression?: SpellTree;
}

/** Un nœud (palier) de l'arbre d'amélioration d'un sort. */
export interface SpellTreeNode {
  id: string;
  tier: number;
  name: string;
  /** Branche du nœud (`trunk` = tronc commun). */
  branch?: string;
  /** Ids des nœuds enfants (plusieurs = point de scission → choix de branche). */
  next?: string[];
}
/** Libellé d'une branche de l'arbre. */
export interface SpellBranchMeta {
  id: string;
  label: string;
}
/** Arbre d'amélioration d'un sort : racine + nœuds + branches. */
export interface SpellTree {
  root: string;
  nodes: SpellTreeNode[];
  branches?: SpellBranchMeta[];
}
interface RawDomain {
  /** Sorts de base du domaine (cf. tableau `spells` des fichiers domains/*.json). */
  spells?: RawSpell[];
}
interface RawCombination {
  components?: string[];
  spells?: RawSpell[];
}

/** Un sort de base d'un domaine : clé, nom, description, mana et sous-domaines d'appartenance. */
export interface DomainSpell extends RawSpell {
  /** Clé du domaine pour un sort simple ; absent pour une combinaison. */
  domain?: string;
  /** Clés des domaines requis pour une combinaison ; absent pour un sort simple. */
  components?: string[];
}

const DOMAIN_FILES = {
  fire: fireDomain,
  water: waterDomain,
  earth: earthDomain,
  air: airDomain,
  electricity: electricityDomain,
  plant: plantDomain,
  light: lightDomain,
  darkness: darknessDomain,
  life: lifeDomain,
  death: deathDomain,
  time: timeDomain,
  space: spaceDomain,
} as unknown as Record<string, RawDomain>;

const COMBINATION_SPELLS: DomainSpell[] = (combinationsCatalog as RawCombination[]).flatMap((c) =>
  (c.spells ?? []).map((s) => ({ ...s, components: c.components ?? [] })),
);

/** Tous les sorts d'un domaine donné (clé de MAGIC_DOMAINS). */
export const domainSpells = (domainKey: string): DomainSpell[] => {
  const d = DOMAIN_FILES[domainKey];
  if (!d) return [];
  return (d.spells ?? []).map((s) => ({ ...s, domain: domainKey }));
};

/**
 * Sorts disponibles pour un ensemble de domaines sélectionnés : les sorts de base
 * de chaque domaine choisi, plus les sorts de combinaison dont tous les domaines
 * composants sont présents dans la sélection.
 */
export const availableSpellsFor = (selectedDomains: string[]): DomainSpell[] => {
  const selected = new Set(selectedDomains);
  const simple = selectedDomains.flatMap((key) => domainSpells(key));
  const combos = COMBINATION_SPELLS.filter((c) => (c.components ?? []).every((d) => selected.has(d)));
  return [...simple, ...combos];
};

/** Retrouve un sort de base par sa clé (tous domaines + combinaisons confondus). */
export const findDomainSpell = (key: string): DomainSpell | undefined => {
  for (const domainKey of Object.keys(DOMAIN_FILES)) {
    const found = domainSpells(domainKey).find((s) => s.key === key);
    if (found) return found;
  }
  return COMBINATION_SPELLS.find((s) => s.key === key);
};

/** Nombre de paliers (rang max) d'un sort, d'après son arbre d'amélioration (≥ 1). */
export const spellMaxTier = (key: string): number => {
  const tiers = (findDomainSpell(key)?.progression?.nodes ?? []).map((n) => n.tier ?? 1);
  return tiers.length ? Math.max(1, ...tiers) : 1;
};

/** Arbre d'amélioration d'un sort (racine + nœuds + branches), ou `undefined`. */
export const spellTree = (key: string): SpellTree | undefined => {
  const p = findDomainSpell(key)?.progression;
  return p && Array.isArray(p.nodes) && p.nodes.length ? p : undefined;
};

/** Les six attributs. */
export const ATTRIBUTES: { key: AttributeKey; label: string }[] = [
  { key: 'force', label: 'Force' },
  { key: 'dexterite', label: 'Déxterité' },
  { key: 'constitution', label: 'Constitution' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'sagesse', label: 'Sagesse' },
  { key: 'charisme', label: 'Charisme' },
];

/** Catalogue des compétences (clés alignées sur les datasets), chacune liée à
 *  un attribut. Le bonus = mod. attribut + valeurs accordées + maîtrise. */
export const SKILLS: { key: string; label: string; attribute: AttributeKey }[] = [
  { key: 'athletism', label: 'Athlétisme', attribute: 'force' },
  { key: 'acrobatics', label: 'Acrobaties', attribute: 'dexterite' },
  { key: 'stealth', label: 'Discrétion', attribute: 'dexterite' },
  { key: 'sleight-of-hand', label: 'Escamotage', attribute: 'dexterite' },
  { key: 'arcana', label: 'Arcane', attribute: 'intelligence' },
  { key: 'history', label: 'Histoire', attribute: 'intelligence' },
  { key: 'investigation', label: 'Investigation', attribute: 'intelligence' },
  { key: 'nature', label: 'Nature', attribute: 'intelligence' },
  { key: 'religion', label: 'Religion', attribute: 'intelligence' },
  { key: 'crafting', label: 'Artisanat', attribute: 'intelligence' },
  { key: 'animal-handling', label: 'Dressage', attribute: 'sagesse' },
  { key: 'insight', label: 'Perspicacité', attribute: 'sagesse' },
  { key: 'medicine', label: 'Médecine', attribute: 'sagesse' },
  { key: 'perception', label: 'Perception', attribute: 'sagesse' },
  { key: 'survival', label: 'Survie', attribute: 'sagesse' },
  { key: 'deception', label: 'Tromperie', attribute: 'charisme' },
  { key: 'intimidation', label: 'Intimidation', attribute: 'charisme' },
  { key: 'performance', label: 'Représentation', attribute: 'charisme' },
  { key: 'persuasion', label: 'Persuasion', attribute: 'charisme' },
];

const SKILL_BY_KEY = new Map(SKILLS.map((s) => [s.key, s]));
export const skillLabel = (key: string): string => SKILL_BY_KEY.get(key)?.label ?? key;

/** Une statistique : libellé + chemin SVG (viewBox 0 0 24 24, tracé « stroke »). */
export interface StatDef {
  key: StatKey;
  label: string;
  icon: string;
}

/** Statistiques de combat (calculées plus tard depuis classe + attributs).
 *  Icônes type « lucide » : fill:none, stroke:currentColor. */
export const STATS: StatDef[] = [
  {
    key: 'hp',
    label: 'Points de vie',
    icon: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  },
  {
    key: 'atk_phy',
    label: 'Attaque physique',
    icon: 'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
  },
  {
    key: 'atk_mag',
    label: 'Attaque magique',
    icon: 'M9.94 14.32a1 1 0 0 0-.66-.66l-6.93-2.31a.33.33 0 0 1 0-.62l6.93-2.31a1 1 0 0 0 .66-.66l2.31-6.93a.33.33 0 0 1 .62 0l2.31 6.93a1 1 0 0 0 .66.66l6.93 2.31a.33.33 0 0 1 0 .62l-6.93 2.31a1 1 0 0 0-.66.66l-2.31 6.93a.33.33 0 0 1-.62 0z',
  },
  {
    key: 'endurance',
    label: 'Endurance',
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
  },
  {
    key: 'mana',
    label: 'Mana',
    icon: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
  },
  {
    key: 'speed',
    label: 'Vitesse',
    icon: 'M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0',
  },
  {
    key: 'def_phy',
    label: 'Défense physique',
    icon: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  },
  {
    key: 'def_mag',
    label: 'Défense magique',
    icon: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  },
];

/** Stats affichées en barres sur la fiche (toutes sauf les défenses). */
export const BAR_STATS = STATS.filter((s) => s.key !== 'def_phy' && s.key !== 'def_mag');

/** Les deux défenses, affichées en deux icônes empilées (pas de barre). */
export const DEFENSE_STATS = STATS.filter((s) => s.key === 'def_phy' || s.key === 'def_mag');

/** Petite étoile décorative ajoutée à l'icône de défense magique. */
export const MAGIC_DEFENSE_SPARK = 'M12 8.2l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z';

/** Icône par défaut d'un trait (badge), quand le dataset n'en fournit pas. */
export const DEFAULT_TRAIT_ICON =
  'M12 2l2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 15.27 6.8 18l.99-5.78-4.21-4.1 5.82-.85z';

/** Emplacements d'équipement (paperdoll). 4 à gauche, 5 à droite. */
export const EQUIPMENT_SLOTS: { key: string; label: string; side: 'left' | 'right' }[] = [
  { key: 'head', label: 'Casque', side: 'left' },
  { key: 'chest', label: 'Armure', side: 'left' },
  { key: 'legs', label: 'Jambières', side: 'left' },
  { key: 'feet', label: 'Bottes', side: 'left' },
  { key: 'weapon', label: 'Arme principale', side: 'right' },
  { key: 'offhand', label: 'Arme secondaire', side: 'right' },
  { key: 'amulet', label: 'Talismans, colliers', side: 'right' },
  { key: 'ring', label: 'Bagues, bracelets', side: 'right' },
  { key: 'bag', label: 'Sac à dos', side: 'right' },
];

/** Achat de points (point-buy à la D&D 5e) : tous les attributs partent de 8, on
 *  dépense ATTRIBUTE_POINTS pour monter jusqu'à MAX_ATTRIBUTE (14 et 15 coûtent
 *  plus cher). On peut descendre jusqu'à MIN_ATTRIBUTE pour récupérer des points.
 *  Les bonus de race/sous-race/background s'ajoutent par-dessus le score acheté. */
export const BASE_ATTRIBUTE = 8;
export const MIN_ATTRIBUTE = 3;
export const MAX_ATTRIBUTE = 15;
export const ATTRIBUTE_POINTS = 27;

/** Coût cumulé d'un score acheté. 8 = base (0) ; 14 et 15 coûtent plus cher ;
 *  descendre sous 8 (jusqu'à 3) rend 1 point par cran. */
const ATTRIBUTE_COST: Record<number, number> = {
  3: -5, 4: -4, 5: -3, 6: -2, 7: -1,
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

/** Coût cumulé d'un score (0 hors de la plage achetable). */
export const attributeCost = (score: number): number => ATTRIBUTE_COST[score] ?? 0;

/** Coût marginal pour passer de `score` à `score + 1`. */
export const attributeIncrementCost = (score: number): number =>
  attributeCost(score + 1) - attributeCost(score);

/** Modificateur D&D d'un score d'attribut. */
export const abilityModifier = (score: number): number => Math.floor((score - 10) / 2);

/** Bonus signé formaté pour l'affichage (« +3 », « -1 », « +0 »). */
export const formatBonus = (value: number): string => (value >= 0 ? `+${value}` : `${value}`);

/** Graine aléatoire entière (pour le tirage des stats). */
export const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff);

/** Lance 4d6, retire le dé le plus bas, combine les 3 autres (résultat 3–18). */
export function roll4d6DropLowest(): number {
  const dice = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6));
  dice.sort((a, b) => a - b);
  return dice[1] + dice[2] + dice[3];
}

/** Fiche vierge par défaut. */
export function emptySheet(): CharacterSheet {
  return {
    identity: {
      name: '',
      race: '',
      subrace: '',
      class: '',
      background: '',
      subbackground: '',
      age: '',
      portrait: '',
      portraitOriginal: '',
      portraitZoom: 1,
      portraitPosX: 50,
      portraitPosY: 50,
      fullImage: '',
    },
    level: 1,
    domains: [],
    attributes: {
      force: BASE_ATTRIBUTE,
      dexterite: BASE_ATTRIBUTE,
      constitution: BASE_ATTRIBUTE,
      intelligence: BASE_ATTRIBUTE,
      sagesse: BASE_ATTRIBUTE,
      charisme: BASE_ATTRIBUTE,
    },
    attributeMode: 'pointbuy',
    attributePointBuy: {
      force: BASE_ATTRIBUTE,
      dexterite: BASE_ATTRIBUTE,
      constitution: BASE_ATTRIBUTE,
      intelligence: BASE_ATTRIBUTE,
      sagesse: BASE_ATTRIBUTE,
      charisme: BASE_ATTRIBUTE,
    },
    attributeRolls: [],
    attributeAssign: {
      force: -1,
      dexterite: -1,
      constitution: -1,
      intelligence: -1,
      sagesse: -1,
      charisme: -1,
    },
    statMode: 'random',
    statSeed: randomSeed(),
    proficiencyBonus: 2,
    skills: [],
    spells: { unlocked: [], equipped: [], nodes: {} },
    inventory: [],
    equipment: Object.fromEntries(EQUIPMENT_SLOTS.map((s) => [s.key, ''])),
    notes: '',
  };
}

/* ── Calcul des statistiques ──────────────────────────────────────────────── */

const EMPTY_STATS = (): Record<StatKey, number> =>
  Object.fromEntries(STATS.map((s) => [s.key, 0])) as Record<StatKey, number>;

/** Convertit un tableau `{key,value}` du dataset en somme par clé de stat. */
function sumKV(into: Record<StatKey, number>, kv?: StatKV[]): void {
  for (const { key, value } of kv ?? []) {
    if (key in into) into[key as StatKey] += Number(value) || 0;
  }
}

/** Valeur d'une clé de stat dans un tableau `{key,value}` (0 si absente). */
function kvValue(kv: StatKV[] | undefined, statKey: StatKey): number {
  let total = 0;
  for (const { key, value } of kv ?? []) if (key === statKey) total += Number(value) || 0;
  return total;
}

const ATTR_LABEL = new Map(ATTRIBUTES.map((a) => [a.key, a.label]));

const hashStr = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** PRNG déterministe (mulberry32) à partir d'un entier. */
function mulberry32(a: number): number {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Tirage déterministe d'un dé `max` faces pour (graine, niveau, stat). */
function rollStat(seed: number, level: number, statKey: string, max: number): number {
  const r = mulberry32((seed ^ hashStr(statKey) ^ Math.imul(level, 2654435761)) >>> 0);
  return 1 + Math.floor(r * max);
}

/** Attribut dont le modificateur s'ajoute à chaque niveau pour une stat donnée. */
const STAT_ATTRIBUTE: Partial<Record<StatKey, AttributeKey>> = {
  atk_phy: 'force',
  hp: 'constitution',
  endurance: 'constitution',
  speed: 'dexterite',
  mana: 'sagesse',
  atk_mag: 'intelligence',
};

/** Une ligne du détail de calcul d'une stat (pour l'infobulle de vérification). */
export interface StatContribution {
  label: string;
  value: number;
}

const clampLevelValue = (level: number): number =>
  Math.max(1, Math.min(20, Math.round(level) || 1));

/**
 * Détail du calcul d'UNE stat : liste des contributions + total arrondi.
 * Source unique de vérité — `computeStats` s'appuie dessus.
 *   total = genetics(race)
 *         + Σ niveaux [ tirage(1..stat-classe) (ou moyenne) + mod. attribut ]
 *         + Σ effets de traits
 */
export function statContributions(
  sheet: CharacterSheet,
  race: RaceDef | undefined,
  klass: ClassDef | undefined,
  traits: TraitDef[],
  attributes: Record<AttributeKey, number>,
  statKey: StatKey,
): { parts: StatContribution[]; total: number } {
  const parts: StatContribution[] = [];
  let raw = 0;

  // 1) Génétique de la race.
  const gen = kvValue(race?.['genetics-stats'], statKey);
  if (gen) {
    parts.push({ label: 'Génétique (race)', value: gen });
    raw += gen;
  }

  // 2) Montée de niveau de la classe (+ modificateur d'attribut par niveau).
  //    Le gain de chaque niveau est borné à 0 : un mauvais tirage avec un
  //    modificateur négatif ne fait jamais PERDRE de stat (au pire +0).
  const max = kvValue(klass?.stats, statKey);
  const level = clampLevelValue(sheet.level);
  if (max > 0) {
    const attrKey = STAT_ATTRIBUTE[statKey];
    const mod = attrKey ? abilityModifier(attributes[attrKey]) : 0;
    const mean = sheet.statMode === 'mean';
    let rolls = 0; // somme brute des dés/moyennes
    let clamped = 0; // somme réelle avec plancher 0 par niveau
    for (let lvl = 1; lvl <= level; lvl++) {
      const r = mean ? (max + 1) / 2 : rollStat(sheet.statSeed, lvl, statKey, max);
      rolls += r;
      clamped += Math.max(0, r + mod);
    }

    parts.push({ label: `Classe — ${mean ? 'moyenne' : 'dés'} 1–${max} ×${level} niv.`, value: rolls });
    raw += rolls;

    const modTotal = mod * level;
    if (attrKey && mod) {
      parts.push({
        label: `Mod. ${ATTR_LABEL.get(attrKey)} (${mod >= 0 ? '+' : ''}${mod} ×${level} niv.)`,
        value: modTotal,
      });
      raw += modTotal;
    }

    // Correction = ce que le plancher par niveau a empêché de perdre.
    const correction = clamped - (rolls + modTotal);
    raw += correction;
    if (correction !== 0) {
      parts.push({ label: 'Plancher montée (min 0/niv)', value: correction });
    }
  }

  // 3) Effets chiffrés des traits.
  for (const t of traits) {
    const v = kvValue(t.effects, statKey);
    if (v) {
      parts.push({ label: `Trait : ${t.name}`, value: v });
      raw += v;
    }
  }

  // 4) Plancher : une stat à 0 ou négative est ramenée à 1 (sauf les défenses,
  //    qui peuvent légitimement rester à 0).
  let total = Math.round(raw);
  const isDefense = statKey === 'def_phy' || statKey === 'def_mag';
  if (total <= 0 && !isDefense) {
    const bump = 1 - total; // amène le total à exactement 1
    parts.push({ label: 'Plancher (min. 1)', value: bump });
    total = 1;
  }

  return { parts, total };
}

/**
 * Valeur THÉORIQUE maximale d'une stat (tous les dés au maximum à chaque niveau),
 * incluant génétique de la race, montée de classe, modificateur d'attribut et
 * effets de traits. Sert d'échelle de référence pour les barres.
 */
export function theoreticalMaxStat(
  sheet: CharacterSheet,
  race: RaceDef | undefined,
  klass: ClassDef | undefined,
  traits: TraitDef[],
  attributes: Record<AttributeKey, number>,
  statKey: StatKey,
): number {
  let raw = kvValue(race?.['genetics-stats'], statKey);
  const max = kvValue(klass?.stats, statKey);
  const level = clampLevelValue(sheet.level);
  if (max > 0) {
    raw += level * max; // chaque niveau tire le maximum possible
    const attrKey = STAT_ATTRIBUTE[statKey];
    if (attrKey) raw += level * abilityModifier(attributes[attrKey]);
  }
  for (const t of traits) raw += kvValue(t.effects, statKey);
  return Math.round(raw);
}

/** Plus haute valeur théorique parmi un ensemble de stats (échelle des barres). */
export function maxTheoreticalScale(
  sheet: CharacterSheet,
  race: RaceDef | undefined,
  klass: ClassDef | undefined,
  traits: TraitDef[],
  attributes: Record<AttributeKey, number>,
  statKeys: StatKey[],
): number {
  return Math.max(
    1,
    ...statKeys.map((k) => theoreticalMaxStat(sheet, race, klass, traits, attributes, k)),
  );
}

/** Stats finales (toutes les clés), dérivées de `statContributions`. */
export function computeStats(
  sheet: CharacterSheet,
  race: RaceDef | undefined,
  klass: ClassDef | undefined,
  traits: TraitDef[],
  attributes: Record<AttributeKey, number>,
): Record<StatKey, number> {
  const out = EMPTY_STATS();
  for (const s of STATS) {
    out[s.key] = statContributions(sheet, race, klass, traits, attributes, s.key).total;
  }
  return out;
}

/** Traits accordés = race + sous-race + background sélectionnés. */
export function grantedTraits(
  race: RaceDef | undefined,
  subraceName: string,
  background?: BackgroundDef,
): TraitDef[] {
  const sub = race?.subraces.find((s) => s.name === subraceName);
  return [
    ...(race?.traits ?? []),
    ...(sub?.traits ?? []),
    ...(background?.traits ?? []),
  ];
}

/** Or de départ : tirage déterministe (lié à la graine) entre min et max du
 *  background. Relancé en même temps que les stats via « Relancer les dés ». */
export function computeGold(sheet: CharacterSheet, background: BackgroundDef | undefined): number {
  const min = Math.max(0, Math.round(Number(background?.min_money) || 0));
  const max = Math.max(min, Math.round(Number(background?.max_money) || 0));
  if (max <= min) return min;
  const r = mulberry32((sheet.statSeed ^ hashStr('gold')) >>> 0);
  return min + Math.floor(r * (max - min + 1));
}

/** Bonus de compétences accordés par le background (clé de compétence → valeur). */
export function backgroundSkillBonuses(background: BackgroundDef | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const sa of background?.subattributes ?? []) {
    out.set(sa.key, (out.get(sa.key) ?? 0) + (Number(sa.value) || 0));
  }
  return out;
}

/* ── Attributs : bonus de race / sous-race ────────────────────────────────── */

/** Clés d'attributs des datasets (anglais) → clés internes (français). */
const ATTR_KEY_MAP: Record<string, AttributeKey> = {
  strength: 'force',
  dexterity: 'dexterite',
  constitution: 'constitution',
  intelligence: 'intelligence',
  wisdom: 'sagesse',
  charisma: 'charisme',
};

/** Bonus d'attributs cumulés de la race + de la sous-race sélectionnée. */
export function attributeBonuses(
  race: RaceDef | undefined,
  subraceName: string,
): Record<AttributeKey, number> {
  const out = Object.fromEntries(ATTRIBUTES.map((a) => [a.key, 0])) as Record<AttributeKey, number>;
  const apply = (kv?: StatKV[]) => {
    for (const { key, value } of kv ?? []) {
      const a = ATTR_KEY_MAP[key];
      if (a) out[a] += Number(value) || 0;
    }
  };
  apply(race?.attributes);
  apply(race?.subraces.find((s) => s.name === subraceName)?.attributes);
  return out;
}

/** Attributs finaux = base saisie + bonus de race + bonus de sous-race. */
export function computeAttributes(
  sheet: CharacterSheet,
  race: RaceDef | undefined,
  subraceName: string,
): Record<AttributeKey, number> {
  const bonuses = attributeBonuses(race, subraceName);
  const out = {} as Record<AttributeKey, number>;
  for (const a of ATTRIBUTES) out[a.key] = (sheet.attributes[a.key] ?? 10) + bonuses[a.key];
  return out;
}
