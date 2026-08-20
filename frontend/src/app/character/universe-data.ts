import {
  CharacterSheet,
  AttributeKey,
  CatalogTrait,
  DomainFeatDef,
  TraitAcquisition,
  DomainStanding,
  FeatChoice,
  LanguageDef,
  OriginDef,
  ReligionDef,
  StatKey,
  StatKV,
  RaceDef,
  ClassDef,
  BackgroundDef,
  TraitCategory,
  TraitDef,
  PoolKey,
  SurvivalKey,
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
import renforcementDomain from '../../../public/resources/json/domains/renforcement.json';
import emissionDomain from '../../../public/resources/json/domains/emission.json';
import combinationsCatalog from '../../../public/resources/json/domains/combinations.json';
import traitCatalog from '../../../public/resources/json/trait.json';
import originsCatalog from '../../../public/resources/json/characters/origins.json';
import religionsCatalog from '../../../public/resources/json/characters/religions.json';
import languagesCatalog from '../../../public/resources/json/characters/languages.json';
import weaponCategoryCatalog from '../../../public/resources/json/weapon_category.json';
import armorCategoryCatalog from '../../../public/resources/json/armor_category.json';
import { ArmorCategoryDef, WeaponCategoryDef } from '../wiki.types';

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

/**
 * Magie non polarisée : deux usages de la mana brute, sans dieu ni affinité.
 * Tenus HORS de `MAGIC_DOMAINS` exprès — ils ne se tirent pas, ne se choisissent
 * pas et ne comptent pas dans les trois affinités. Ils s'ouvrent par un vécu
 * (background Soldat/Sage, origine de l'Archipel) ou par un feat.
 */
export const NONPOLAR_MAGICS: MagicDomain[] = [
  { key: 'renforcement', name: 'Renforcement', sigil: '◈' },
  { key: 'emission', name: 'Émission', sigil: '✵' },
];

const DOMAIN_BY_KEY = new Map(
  [...MAGIC_DOMAINS, ...NONPOLAR_MAGICS].map((d) => [d.key, d]),
);
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
  /** Feats domaniaux déclarés par la fiche de domaine (cf. tableau `feats`). */
  feats?: DomainFeatDef[];
  /** Icône du domaine, en taille d'origine (~2 Mo) — cf. `domainIcon`. */
  icon?: string;
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
  // Les deux usages non polarisés : leurs sorts, leurs feats et leur icône se
  // lisent exactement comme ceux d'un domaine. Seul le CHOIX diffère — ils ne
  // sont pas dans `MAGIC_DOMAINS`, donc jamais proposés comme affinité.
  renforcement: renforcementDomain,
  emission: emissionDomain,
} as unknown as Record<string, RawDomain>;

/**
 * Icône d'un domaine, en VIGNETTE. Les fiches `domains/*.json` pointent l'icône
 * pleine taille (1024–1254 px, ~2 Mo) : bien trop lourde pour les pastilles de
 * la fiche de personnage, qui les affiche en 2 rem. On sert donc la dérivée
 * produite par `scripts/generate-domain-thumbnails.mjs`.
 *
 * Le chemin vient du dataset et non d'une convention sur la clé : le dossier du
 * domaine `plant` s'appelle `plants`.
 */
export const domainIcon = (key: string): string | undefined =>
  DOMAIN_FILES[key]?.icon?.replace(/_icon\.png$/, '_icon_sm.png');

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

/* ── Maîtrises (armes & armures) ──────────────────────────────────────────── */

/** Catégories d'armes du jeu, dans l'ordre du dataset. */
export const WEAPON_CATEGORIES = weaponCategoryCatalog.weapon_categories as WeaponCategoryDef[];

/** Catégories d'armures du jeu, dans l'ordre du dataset. */
export const ARMOR_CATEGORIES = armorCategoryCatalog.armor_categories as ArmorCategoryDef[];

/**
 * Catégories d'armure qui s'apprennent — les seules qu'on propose à la saisie.
 * Les vêtements en sont exclus : ils se portent, ils ne se maîtrisent pas.
 */
export const LEARNABLE_ARMOR_CATEGORIES = ARMOR_CATEGORIES.filter((c) => c.requiresProficiency);

const WEAPON_CATEGORY_BY_KEY = new Map(WEAPON_CATEGORIES.map((c) => [c.key as string, c]));
const ARMOR_CATEGORY_BY_KEY = new Map(ARMOR_CATEGORIES.map((c) => [c.key as string, c]));

/** Libellé d'une catégorie d'arme — la clé telle quelle si elle est inconnue
 *  (une maîtrise ajoutée à la main peut être du texte libre). */
export const weaponCategoryName = (key: string): string =>
  WEAPON_CATEGORY_BY_KEY.get(key)?.name ?? key;

/** Libellé d'une catégorie d'armure, même repli que `weaponCategoryName`. */
export const armorCategoryName = (key: string): string =>
  ARMOR_CATEGORY_BY_KEY.get(key)?.name ?? key;

/** Détail d'une catégorie d'armure, pour l'infobulle (absent si texte libre). */
export const armorCategory = (key: string): ArmorCategoryDef | undefined =>
  ARMOR_CATEGORY_BY_KEY.get(key);

/** Détail d'une catégorie d'arme, pour l'infobulle (absent si texte libre). */
export const weaponCategory = (key: string): WeaponCategoryDef | undefined =>
  WEAPON_CATEGORY_BY_KEY.get(key);

/**
 * Mains que réclame une catégorie d'arme. Une par défaut : une arme inconnue
 * (maîtrise saisie à la main, fiche sans catégorie) ne doit pas confisquer une
 * main qu'on ne lui a jamais donnée.
 */
export const weaponHandling = (key: string | undefined): number =>
  (key ? WEAPON_CATEGORY_BY_KEY.get(key)?.handling : undefined) ?? 1;

/**
 * L'arme prend-elle les DEUX mains ?
 *
 * Une seule définition, parce que trois endroits en dépendent et qu'ils doivent
 * répondre pareil : la fiche (qui interdit d'équiper une main faible), la
 * fabrique de combattants (qui ne lui fabrique pas de capacité) et le moteur
 * (qui la refuse). Une claymore ne laisse pas de main pour un bouclier.
 */
export const isTwoHanded = (key: string | undefined): boolean => weaponHandling(key) === 2;

/**
 * Une maîtrise affichée sur la fiche, avec sa provenance : la classe l'accorde
 * d'office, ou la table l'a ajoutée à la main. La distinction n'est pas
 * décorative — changer de classe redistribue les premières et laisse les
 * secondes en place.
 */
export interface Proficiency {
  key: string;
  label: string;
  source: 'class' | 'manual';
}

/** Fusionne accordé-par-la-classe et ajouté-à-la-main, sans doublon, la classe d'abord. */
function mergeProficiencies(
  fromClass: string[] | undefined,
  extra: string[] | undefined,
  label: (key: string) => string,
): Proficiency[] {
  const out: Proficiency[] = [];
  const seen = new Set<string>();
  for (const key of fromClass ?? []) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: label(key), source: 'class' });
  }
  for (const key of extra ?? []) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: label(key), source: 'manual' });
  }
  return out;
}

/** Armes maîtrisées par le personnage : celles de sa classe, plus les siennes. */
export const weaponProficiencies = (
  klass: ClassDef | undefined,
  sheet: CharacterSheet,
): Proficiency[] =>
  mergeProficiencies(klass?.weaponProficiencies, sheet.extraWeaponProficiencies, weaponCategoryName);

/** Armures maîtrisées par le personnage : celles de sa classe, plus les siennes. */
export const armorProficiencies = (
  klass: ClassDef | undefined,
  sheet: CharacterSheet,
): Proficiency[] =>
  mergeProficiencies(klass?.armorProficiencies, sheet.extraArmorProficiencies, armorCategoryName);

/**
 * Résout une saisie libre en clé de catégorie : « Hache », « hache », « axe »
 * donnent tous `axe`. Rend le texte nettoyé quand rien ne correspond — une
 * table qui invente sa catégorie doit pouvoir l'écrire.
 */
function resolveCategory(input: string, catalog: { key: string; name: string }[]): string {
  const raw = input.trim();
  if (!raw) return '';
  const target = foldCase(raw);
  const hit = catalog.find((c) => foldCase(c.key) === target || foldCase(c.name) === target);
  return hit ? hit.key : raw;
}

/** Minuscules sans accents : « Épée longue » et « epee longue » se valent. */
const foldCase = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Saisie libre → clé de catégorie d'arme (ou texte nettoyé). */
export const resolveWeaponCategory = (input: string): string =>
  resolveCategory(input, WEAPON_CATEGORIES);

/** Saisie libre → clé de catégorie d'armure (ou texte nettoyé). On ne résout
 *  que sur les catégories qui s'apprennent : « maîtriser les vêtements » n'a
 *  pas de sens, et laisser la saisie y tomber en donnerait l'illusion. */
export const resolveArmorCategory = (input: string): string =>
  resolveCategory(input, LEARNABLE_ARMOR_CATEGORIES);

/**
 * Verdict porté sur une pièce portée : le personnage sait-il s'en servir ?
 *
 * - `clothing` : ce n'est pas une armure, la question ne se pose pas ;
 * - `unknown` : la fiche du set n'annonce pas sa catégorie (donnée manquante),
 *   et on préfère se taire plutôt qu'accuser à tort ;
 * - sinon, la catégorie figure ou non parmi les maîtrises du porteur.
 */
export type ArmorMastery = 'mastered' | 'unmastered' | 'clothing' | 'unknown';

export function armorMastery(
  categoryKey: string | undefined,
  mastered: Proficiency[],
): ArmorMastery {
  if (!categoryKey) return 'unknown';
  const def = ARMOR_CATEGORY_BY_KEY.get(categoryKey);
  if (def && !def.requiresProficiency) return 'clothing';
  return mastered.some((p) => p.key === categoryKey) ? 'mastered' : 'unmastered';
}

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

/* ── Survie : faim & soif ─────────────────────────────────────────────────── */

/**
 * Une jauge de survie.
 *
 * Faim et soif ne se calculent pas comme les statistiques : ce sont des
 * compteurs que la table coche au fil des jours de voyage. D'où l'affichage en
 * CRANS (un cran = un jour de réserve) et non en barre continue — personne
 * n'estime « 43 % de soif », on raye un cran le soir venu.
 */
export interface SurvivalGauge {
  key: SurvivalKey;
  label: string;
  icon: string;
  /** Nombre de crans, soit la réserve maximale en jours. */
  segments: number;
  /** Verdicts du plus vide au plus plein ; le dernier vaut « jauge pleine ». */
  stages: string[];
}

/**
 * Les trois jauges, de la plus longue laisse à la plus courte. On tient bien
 * plus longtemps le ventre vide que les yeux ouverts, et les yeux ouverts plus
 * longtemps que la gorge sèche : c'est ce que disent leurs nombres de crans.
 */
export const SURVIVAL_GAUGES: SurvivalGauge[] = [
  {
    key: 'hunger',
    label: 'Faim',
    // Écuelle fumante.
    icon: 'M3 12h18a9 9 0 0 1-18 0zM9 3v2M12 2v3M15 3v2',
    segments: 6,
    stages: ['Affamé', 'Le ventre creux', 'Sur sa faim', 'Rassasié'],
  },
  {
    key: 'rest',
    label: 'Sommeil',
    // Croissant de lune.
    icon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
    segments: 5,
    stages: ['Épuisé', 'Harassé', 'Fatigué', 'Frais et dispos'],
  },
  {
    key: 'thirst',
    label: 'Soif',
    // Gobelet et son niveau d'eau.
    icon: 'M6 4h12l-1.2 15.1A2 2 0 0 1 14.8 21H9.2a2 2 0 0 1-2-1.9zM6.6 9h10.8',
    segments: 4,
    stages: ['Déshydraté', 'Assoiffé', 'La gorge sèche', 'Désaltéré'],
  },
];

/** Ramène une valeur reçue dans les bornes de la jauge (entier, 0 → segments). */
export const clampSurvival = (gauge: SurvivalGauge, value: unknown): number =>
  Math.max(0, Math.min(gauge.segments, Math.round(Number(value) || 0)));

/** Jauges pleines — état de départ d'une fiche neuve. */
export const fullSurvival = (): Record<SurvivalKey, number> =>
  Object.fromEntries(SURVIVAL_GAUGES.map((g) => [g.key, g.segments])) as Record<
    SurvivalKey,
    number
  >;

/**
 * Verdict correspondant au nombre de crans restants. Les crans intermédiaires
 * se répartissent sur les verdicts situés entre « vide » et « plein », pour que
 * la même liste serve des jauges de longueurs différentes.
 */
export function survivalStage(gauge: SurvivalGauge, value: number): string {
  const filled = clampSurvival(gauge, value);
  if (filled <= 0) return gauge.stages[0];
  if (filled >= gauge.segments) return gauge.stages[gauge.stages.length - 1];
  const inner = gauge.stages.length - 2; // verdicts disponibles entre les deux extrêmes
  const ratio = (filled - 1) / Math.max(1, gauge.segments - 1);
  return gauge.stages[Math.min(inner, 1 + Math.floor(ratio * inner))];
}

/* ── Réserves : points de vie, endurance, mana ────────────────────────────── */

/**
 * Une réserve qui fluctue en jeu.
 *
 * Points de vie, endurance et mana ne sont pas des statistiques comme les
 * autres. Leur MAXIMUM se calcule (race, classe, niveau, équipement) et se
 * relit à chaque affichage ; leur NIVEAU du moment, lui, ne se déduit de rien —
 * une blessure, un souffle coupé, un sort lancé appartiennent à la partie. La
 * fiche les affiche donc en barre partiellement remplie, et n'en garde que le
 * creux (cf. `CharacterSheet.poolLoss`).
 */
export interface PoolGauge {
  key: PoolKey;
  label: string;
  /** Nom court, pour les résumés d'une ligne (« pv », « endurance »…). */
  short: string;
  icon: string;
  /** Verdicts du plus vide au plus plein, comme pour les jauges de survie. */
  stages: string[];
}

const STAT_ICON = (key: StatKey): string => STATS.find((s) => s.key === key)?.icon ?? '';

/**
 * Les trois réserves, dans l'ordre où on les regarde à la table : ce qui tue
 * d'abord, ce qui s'épuise ensuite, ce qui se dépense enfin.
 */
export const POOL_GAUGES: PoolGauge[] = [
  {
    key: 'hp',
    label: 'Points de vie',
    short: 'pv',
    icon: STAT_ICON('hp'),
    stages: ['À terre', 'Au plus mal', 'Blessé', 'Éraflé', 'Indemne'],
  },
  {
    key: 'endurance',
    label: 'Endurance',
    short: 'endurance',
    icon: STAT_ICON('endurance'),
    stages: ['À bout de souffle', 'Essoufflé', 'Le souffle court', 'D’attaque'],
  },
  {
    key: 'mana',
    label: 'Mana',
    short: 'mana',
    icon: STAT_ICON('mana'),
    stages: ['À sec', 'Presque à sec', 'Entamé', 'Plein'],
  },
];

/**
 * Ramène un creux dans les bornes de la réserve : entier, entre 0 (à plein) et
 * le maximum (à zéro). Un maximum qui aurait baissé depuis la dernière séance
 * rogne le creux d'autant, plutôt que de rendre un niveau négatif.
 */
export const clampPoolLoss = (max: number, value: unknown): number =>
  Math.max(0, Math.min(Math.max(0, Math.round(max)), Math.round(Number(value) || 0)));

/** Aucun creux : les trois réserves à plein (fiche neuve, ou pleine forme). */
export const noPoolLoss = (): Record<PoolKey, number> =>
  Object.fromEntries(POOL_GAUGES.map((g) => [g.key, 0])) as Record<PoolKey, number>;

/** Niveau courant d'une réserve, creux stocké déduit du maximum calculé. */
export const poolCurrent = (max: number, loss: unknown): number =>
  Math.max(0, Math.round(max)) - clampPoolLoss(max, loss);

/**
 * Verdict correspondant au niveau courant. Même répartition que
 * `survivalStage` : les verdicts intermédiaires se partagent tout ce qui n'est
 * ni le plein ni le zéro, pour que la liste serve des réserves de toutes
 * tailles.
 */
export function poolStage(gauge: PoolGauge, current: number, max: number): string {
  if (current <= 0 || max <= 0) return gauge.stages[0];
  if (current >= max) return gauge.stages[gauge.stages.length - 1];
  const inner = gauge.stages.length - 2;
  const ratio = (current - 1) / Math.max(1, max - 1);
  return gauge.stages[Math.min(inner, 1 + Math.floor(ratio * inner))];
}

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

/* ── Bourse ───────────────────────────────────────────────────────────────── */

/**
 * Bourse affichée : le tirage de départ du background plus l'écart accumulé en
 * partie. Jamais négative — on ne doit pas de l'or, on n'en a plus.
 */
export const purseTotal = (base: number, delta: number): number =>
  Math.max(0, Math.round(base) + Math.round(delta));

/** Écart à mémoriser pour qu'un tirage `base` affiche le total voulu. */
export const purseDelta = (base: number, total: number): number =>
  Math.max(0, Math.round(Number(total) || 0)) - Math.round(base);

/* ── Expérience et niveaux ────────────────────────────────────────────────── */

/** Niveau maximal atteignable. */
/**
 * Bonus de maîtrise à un niveau donné : `2 + ⌊(niveau − 1) / 4⌋`.
 *
 * C'est la SEULE progression de précision du jeu, et elle est conditionnelle :
 * elle ne s'applique qu'aux armes que le personnage sait manier — celles de sa
 * classe (`ClassDef.weaponProficiencies`) et celles apprises en partie
 * (`CharacterSheet.extraWeaponProficiencies`). Un vétéran est meilleur que le
 * débutant avec l'épée qu'il a passé vingt ans à porter — pas avec l'arc qu'il
 * ramasse.
 *
 * Même forme que celle du bestiaire (`2 + ⌊FP / 4⌋`), pour qu'un héros de
 * niveau 20 vise aussi bien qu'un monstre de son rang.
 */
export const proficiencyForLevel = (level: number): number =>
  2 + Math.floor((Math.max(1, level) - 1) / 4);

export const MAX_LEVEL = 20;
/** Coût en XP du tout premier palier (niveau 1 → 2). */
export const XP_FIRST_STEP = 250;
/**
 * Facteur multiplicatif du coût à chaque palier : monter coûte toujours plus
 * cher que le palier précédent. 1,32 amène le total du niveau 20 aux alentours
 * de 150 000 XP, avec des paliers qui restent atteignables en début de partie.
 */
export const XP_GROWTH = 1.32;

/** Coût en XP du passage `level` → `level + 1` (0 au niveau maximal). */
export const xpToNextLevel = (level: number): number => {
  if (level >= MAX_LEVEL) return 0;
  const raw = XP_FIRST_STEP * XP_GROWTH ** (Math.max(1, level) - 1);
  return Math.round(raw / 10) * 10; // dizaines : des seuils lisibles à la table
};

/**
 * Seuils cumulés, index = niveau − 1. Table calculée une fois : `levelForXp`
 * est appelé à chaque cycle de détection de changement.
 */
const XP_THRESHOLDS: number[] = (() => {
  const out = [0];
  for (let level = 1; level < MAX_LEVEL; level++) out.push(out[level - 1] + xpToNextLevel(level));
  return out;
})();

/** XP cumulés nécessaires pour ATTEINDRE `level` (0 au niveau 1). */
export const xpForLevel = (level: number): number =>
  XP_THRESHOLDS[Math.min(MAX_LEVEL, Math.max(1, Math.round(level))) - 1];

/** XP total du niveau maximal — plafond de saisie. */
export const XP_MAX = XP_THRESHOLDS[MAX_LEVEL - 1];

/** Niveau atteint avec un total d'XP donné. */
export const levelForXp = (xp: number): number => {
  const total = Math.max(0, Number(xp) || 0);
  let level = 1;
  while (level < MAX_LEVEL && total >= XP_THRESHOLDS[level]) level++;
  return level;
};

/** Avancement dans le niveau courant, prêt à afficher. */
export interface XpProgress {
  level: number;
  /** XP engrangés depuis le début du niveau courant. */
  into: number;
  /** XP que coûte le niveau courant (0 une fois au niveau maximal). */
  needed: number;
  /** XP restants avant le palier suivant. */
  remaining: number;
  /** Avancement 0–100 (100 au niveau maximal). */
  pct: number;
  /** Total d'XP nécessaire pour atteindre le niveau suivant. */
  nextAt: number;
}

export const xpProgress = (xp: number): XpProgress => {
  const total = Math.max(0, Math.min(XP_MAX, Math.round(Number(xp) || 0)));
  const level = levelForXp(total);
  const floor = xpForLevel(level);
  const needed = xpToNextLevel(level);
  const into = total - floor;
  return {
    level,
    into,
    needed,
    remaining: needed ? needed - into : 0,
    pct: needed ? Math.min(100, (into / needed) * 100) : 100,
    nextAt: floor + needed,
  };
};

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
    xp: 0,
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
    survival: fullSurvival(),
    poolLoss: noPoolLoss(),
    statMode: 'random',
    statSeed: randomSeed(),
    proficiencyBonus: 2,
    skills: [],
    creationTraits: [],
    languages: [],
    feats: [],
    spells: { unlocked: [], equipped: [], nodes: {} },
    extraWeaponProficiencies: [],
    extraArmorProficiencies: [],
    goldDelta: 0,
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

  // 3 bis) Feats domaniaux passifs : même traitement que les traits.
  for (const { feat } of chosenDomainFeats(sheet)) {
    const v = kvValue(feat.statEffects, statKey);
    if (v) {
      parts.push({ label: `Feat : ${feat.name}`, value: v });
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
  for (const { feat } of chosenDomainFeats(sheet)) raw += kvValue(feat.statEffects, statKey);
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

/**
 * Traits accordés d'office par la race, la sous-race, le background, le
 * sous-background et l'origine choisis.
 *
 * Rien n'est lu dans `races.json` ni `backgrounds.json` : ces fichiers ne
 * déclarent plus de trait. C'est le catalogue `trait.json` qui dit, trait par
 * trait, qui l'accorde (`grantedBy`) — un seul endroit à tenir, donc aucun
 * risque de voir deux versions du même trait diverger.
 */
export function grantedTraits(
  race: RaceDef | undefined,
  subraceName: string,
  background?: BackgroundDef,
  origin?: OriginDef,
  subbackgroundName?: string,
): CatalogTrait[] {
  const sub = race?.subraces.find((s) => s.name === subraceName);
  const subBg = background?.subbackgrounds.find((s) => s.name === subbackgroundName);
  const refs = [
    race && `race:${race.key}`,
    sub && `subrace:${sub.key}`,
    background && `background:${background.key}`,
    subBg && `subbackground:${subBg.key}`,
    origin && `origin:${origin.key}`,
  ].filter((ref): ref is string => !!ref);
  return traitsGrantedBy(refs);
}

/* ── Langues ──────────────────────────────────────────────────────────────── */

/** Toutes les langues du monde, dans l'ordre du dataset. */
export const LANGUAGES = languagesCatalog.languages as LanguageDef[];

const LANGUAGE_BY_KEY = new Map(LANGUAGES.map((l) => [l.key, l]));

/** Une langue par sa clé. */
export const languageByKey = (key: string): LanguageDef | undefined => LANGUAGE_BY_KEY.get(key);

/** Nom d'une langue (la clé telle quelle si elle est inconnue). */
export const languageName = (key: string): string => LANGUAGE_BY_KEY.get(key)?.name ?? key;

/**
 * Langues acquises SANS rien dépenser : la langue véhiculaire, plus celle de
 * l'origine. Elles ne sont pas stockées sur la fiche — elles se recalculent,
 * comme les traits accordés.
 */
export const grantedLanguages = (origin: OriginDef | undefined): string[] => [
  ...LANGUAGES.filter((l) => l.common).map((l) => l.key),
  ...(origin?.languages ?? []).filter((k) => LANGUAGE_BY_KEY.has(k)),
];

/** Emplacements de langue ouverts par les traits portés (Linguiste en ouvre trois). */
export const languageSlotsFrom = (traits: CatalogTrait[]): number =>
  traits.reduce((total, t) => total + (t.languageSlots ?? 0), 0);

/** Bonus de compétence accordés par les traits portés (clé de compétence → valeur). */
export function traitSkillBonuses(traits: CatalogTrait[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const trait of traits) {
    for (const { key, value } of trait.skillEffects ?? []) {
      out.set(key, (out.get(key) ?? 0) + (Number(value) || 0));
    }
  }
  return out;
}

/* ── Traits du catalogue & slots de feat (section 16 du gameplay) ─────────── */

/**
 * Paliers auxquels un slot de feat s'ouvre. Le slot se dépense EN CONCURRENCE
 * avec le point d'attribut : c'est un seul et même choix, pas deux gains qui
 * s'additionnent.
 */
export const FEAT_LEVELS = [5, 10, 15, 20];

/**
 * Traits pris à la création, en plus de ceux qu'accordent race, sous-race et
 * background. Le gameplay pose le principe (« choisis à la création, ou via
 * feat ») sans arrêter de nombre : un seul ici, à remonter si la table en veut
 * davantage — tout le reste suit cette constante.
 */
export const CREATION_TRAIT_SLOTS = 1;

/** Paliers de feat déjà ouverts pour un personnage de ce niveau. */
export const featSlotsFor = (level: number): number[] =>
  FEAT_LEVELS.filter((l) => l <= clampLevelValue(level));

/**
 * Une ligne de `trait.json`. Le fichier est la SOURCE UNIQUE des traits du
 * monde : chaque ligne décrit le trait tel qu'une créature le porte (`name`,
 * `description`, référencés par `traitIds` dans le bestiaire) et, quand un
 * personnage peut le prendre, son versant jouable dans `character`.
 */
interface RawTrait {
  id: number;
  name: string;
  description: string;
  character?: {
    key: string;
    label: string;
    category: TraitCategory;
    description: string;
    /** Conditions d'obtention : ce qui dit si le trait peut être pris. */
    acquisition: TraitAcquisition;
    /** Références de ce qui l'accorde d'office (`race:`, `subrace:`, `background:`, `origin:`). */
    grantedBy: string[];
    effects?: StatKV[];
    skillEffects?: StatKV[];
    languageSlots?: number;
  };
}

/**
 * Tous les traits qu'un personnage peut PORTER : les lignes de `trait.json` qui
 * ont un versant `character`, qu'elles se choisissent ou qu'elles s'accordent
 * (une origine en donne, par exemple).
 */
export const CHARACTER_TRAITS: CatalogTrait[] = (traitCatalog.traits as unknown as RawTrait[])
  .filter((t): t is RawTrait & { character: NonNullable<RawTrait['character']> } => !!t.character)
  .map((t) => ({
    id: t.id,
    key: t.character.key,
    name: t.character.label,
    description: t.character.description,
    category: t.character.category,
    acquisition: t.character.acquisition,
    grantedBy: t.character.grantedBy ?? [],
    effects: t.character.effects,
    skillEffects: t.character.skillEffects,
    languageSlots: t.character.languageSlots,
  }));

/**
 * Traits qu'on peut CHOISIR (création ou slot de feat). Le reste ne s'apprend
 * pas : une particularité biologique s'hérite, un sens forgé par une enfance
 * souterraine vient avec l'origine — dans les deux cas, il n'y a rien à prendre.
 */
export const TRAIT_CATALOG: CatalogTrait[] = CHARACTER_TRAITS.filter(
  (t) => t.acquisition.pickable,
);

/** Familles de traits, dans l'ordre d'affichage de la liste de choix. */
export const TRAIT_CATEGORIES: { key: TraitCategory; label: string }[] = [
  { key: 'combat',     label: 'Combat' },
  { key: 'survie',     label: 'Survie' },
  { key: 'perception', label: 'Perception' },
  { key: 'magie',      label: 'Magie' },
  { key: 'social',     label: 'Social' },
];

const TRAIT_BY_KEY = new Map(CHARACTER_TRAITS.map((t) => [t.key, t]));
const TRAIT_BY_ID = new Map(CHARACTER_TRAITS.map((t) => [t.id, t]));

/** Un trait portable par sa clé (accordé ou choisi). */
export const catalogTrait = (key: string): CatalogTrait | undefined => TRAIT_BY_KEY.get(key);

/** Un trait portable par son id dans `trait.json` (ce que référencent les origines). */
export const traitById = (id: number): CatalogTrait | undefined => TRAIT_BY_ID.get(id);

/** Vrai si ce trait peut être PRIS (création, slot de feat) et pas seulement porté. */
export const isPickableTrait = (key: string): boolean =>
  catalogTrait(key)?.acquisition.pickable === true;

/**
 * Prérequis d'attribut non rempli, en toutes lettres — chaîne vide si le trait
 * est à portée. On lit l'attribut FINAL : un point d'attribut dépensé sur un
 * slot de feat compte, comme un bonus de race.
 */
export const traitRequirement = (
  trait: CatalogTrait,
  attributes: Record<AttributeKey, number>,
): string => {
  const need = trait.acquisition.requires;
  if (!need) return '';
  const score = attributes[need.attribute] ?? 0;
  if (score >= need.min) return '';
  return `${ATTR_LABEL.get(need.attribute) ?? need.attribute} ${need.min} requis (${score})`;
};

/**
 * Traits que ces sources accordent d'office. Les références sont lues DANS le
 * catalogue (`grantedBy`) : c'est le seul endroit où le lien existe.
 */
export const traitsGrantedBy = (refs: string[]): CatalogTrait[] => {
  const wanted = new Set(refs);
  return CHARACTER_TRAITS.filter((t) => t.grantedBy.some((ref) => wanted.has(ref)));
};

/* ── Origine géographique & religion (section 22 du gameplay) ─────────────── */

/** Les origines géographiques ouvertes à la création, dans l'ordre du dataset. */
export const ORIGINS = originsCatalog.origins as OriginDef[];

const ORIGIN_BY_KEY = new Map(ORIGINS.map((o) => [o.key, o]));

/** Une origine par sa clé. */
export const originByKey = (key: string | undefined): OriginDef | undefined =>
  key ? ORIGIN_BY_KEY.get(key) : undefined;

/** Traits accordés d'office par une origine, résolus depuis `trait.json`. */
export const originTraits = (origin: OriginDef | undefined): CatalogTrait[] =>
  origin ? traitsGrantedBy([`origin:${origin.key}`]) : [];

/** Les religions rédigées, dans l'ordre du dataset. */
export const RELIGIONS = religionsCatalog.religions as ReligionDef[];

const RELIGION_BY_KEY = new Map(RELIGIONS.map((r) => [r.key, r]));

/** Une religion par sa clé. */
export const religionByKey = (key: string | undefined): ReligionDef | undefined =>
  key ? RELIGION_BY_KEY.get(key) : undefined;

/**
 * Marqueur social : comment les régions lisent quelqu'un qui sert ce domaine.
 * Vaut même sans religion déclarée — c'est le domaine servi qui se voit, pas la
 * carte de membre.
 */
export const DOMAIN_STANDING = religionsCatalog.standing as DomainStanding[];

const STANDING_BY_DOMAIN = new Map(DOMAIN_STANDING.map((s) => [s.domain, s]));

/** Le regard porté sur un domaine, s'il est renseigné. */
export const standingFor = (domain: string): DomainStanding | undefined =>
  STANDING_BY_DOMAIN.get(domain);

/**
 * Branches non polarisées et le trait de background qui les ouvre (section 21 :
 * Soldat donne Renforcement, Sage donne le Voile). Sans ce trait, leurs feats
 * ne sont pas proposés : on ne spécialise pas une branche à laquelle on n'a
 * pas accès.
 */
const NONPOLAR_ACCESS: Record<string, string> = {
  renforcement: 'entrainement-martial',
  emission: 'etudes-magiques',
};

/** Feats déclarés par une fiche de domaine. */
export const domainFeats = (domainKey: string): DomainFeatDef[] =>
  DOMAIN_FILES[domainKey]?.feats ?? [];

/** Un feat domanial par sa clé, avec le domaine dont il vient. */
export const findDomainFeat = (
  key: string,
): { feat: DomainFeatDef; domain: string } | undefined => {
  for (const domain of Object.keys(DOMAIN_FILES)) {
    const feat = domainFeats(domain).find((f) => f.key === key);
    if (feat) return { feat, domain };
  }
  return undefined;
};

/**
 * Branches non polarisées OUVERTES pour ce personnage, et ce qui les ouvre.
 * Elles ne se choisissent pas : elles viennent d'un vécu (trait de background)
 * ou d'une enfance (origine de l'Archipel, pratique instinctive).
 */
export const nonPolarAccess = (
  sheet: CharacterSheet,
  traits: TraitDef[],
): { key: string; via: string }[] => {
  const owned = new Map(traits.map((t) => [t.key, t.name]));
  const origin = originByKey(sheet.identity.origin);
  const fromOrigin = new Set(origin?.nonPolarBranches ?? []);
  const out: { key: string; via: string }[] = [];
  for (const branch of NONPOLAR_MAGICS) {
    const traitName = owned.get(NONPOLAR_ACCESS[branch.key]);
    if (traitName) out.push({ key: branch.key, via: traitName });
    else if (fromOrigin.has(branch.key)) out.push({ key: branch.key, via: `Origine ${origin!.name}` });
  }
  return out;
};

/** Les seules clés des branches ouvertes. */
export const openNonPolarBranches = (sheet: CharacterSheet, traits: TraitDef[]): string[] =>
  nonPolarAccess(sheet, traits).map((b) => b.key);

/**
 * Domaines où le personnage peut prendre un feat : ses domaines d'affinité,
 * plus les branches non polarisées qui lui sont ouvertes.
 */
export const featDomainsFor = (sheet: CharacterSheet, traits: TraitDef[]): string[] => [
  ...sheet.domains.filter((d) => !!DOMAIN_FILES[d]),
  ...openNonPolarBranches(sheet, traits),
];

/** Le choix fait à un palier donné, s'il a été fait. */
export const featChoiceAt = (sheet: CharacterSheet, level: number): FeatChoice | undefined =>
  (sheet.feats ?? []).find((f) => f.level === level);

/**
 * Choix de feat qui COMPTENT aujourd'hui : ceux des paliers que le niveau a
 * réellement ouverts. Un personnage qu'on redescend en niveau suspend ses
 * derniers choix sans les perdre — les remonter les rend tels quels.
 */
export const activeFeatChoices = (sheet: CharacterSheet): FeatChoice[] => {
  const open = new Set(featSlotsFor(sheet.level));
  return (sheet.feats ?? []).filter((f) => open.has(f.level));
};

/** Traits pris par la fiche : ceux de la création, plus ceux achetés sur un slot. */
export function chosenTraits(sheet: CharacterSheet): CatalogTrait[] {
  const keys = [
    ...(sheet.creationTraits ?? []),
    ...activeFeatChoices(sheet)
      .filter((f) => f.pick === 'trait' && f.trait)
      .map((f) => f.trait!),
  ];
  return [...new Set(keys)]
    .map((k) => catalogTrait(k))
    .filter((t): t is CatalogTrait => !!t);
}

/** Feats domaniaux pris sur un slot, résolus depuis les fiches de domaine. */
export function chosenDomainFeats(
  sheet: CharacterSheet,
): { feat: DomainFeatDef; domain: string }[] {
  return activeFeatChoices(sheet)
    .filter((f) => f.pick === 'domain' && f.feat)
    .map((f) => findDomainFeat(f.feat!))
    .filter((x): x is { feat: DomainFeatDef; domain: string } => !!x);
}

/**
 * Effets chiffrés des feats domaniaux pris : un feat `passive` (Peau dure,
 * Muscle renforcé…) pèse sur la fiche exactement comme les effets d'un trait.
 */
export function featStatEffects(sheet: CharacterSheet): StatKV[] {
  return chosenDomainFeats(sheet).flatMap(({ feat }) => feat.statEffects ?? []);
}

/** Somme des valeurs portant une clé donnée (stat ou attribut). */
const sumForKey = (kv: StatKV[], key: string): number =>
  kv.reduce((total, e) => (e.key === key ? total + (Number(e.value) || 0) : total), 0);

/** Points d'attribut gagnés en dépensant un slot de feat sur un attribut. */
export function featAttributeBonuses(sheet: CharacterSheet): Record<AttributeKey, number> {
  const out = Object.fromEntries(ATTRIBUTES.map((a) => [a.key, 0])) as Record<AttributeKey, number>;
  for (const f of activeFeatChoices(sheet)) {
    if (f.pick === 'attribute' && f.attribute && f.attribute in out) out[f.attribute] += 1;
  }
  return out;
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

/**
 * Attributs finaux = base saisie + bonus de race/sous-race + points d'attribut
 * dépensés sur un slot de feat + effets d'attribut des feats domaniaux passifs.
 */
export function computeAttributes(
  sheet: CharacterSheet,
  race: RaceDef | undefined,
  subraceName: string,
): Record<AttributeKey, number> {
  const bonuses = attributeBonuses(race, subraceName);
  const feats = featAttributeBonuses(sheet);
  const featEffects = featStatEffects(sheet);
  const out = {} as Record<AttributeKey, number>;
  for (const a of ATTRIBUTES)
    out[a.key] =
      (sheet.attributes[a.key] ?? 10) +
      bonuses[a.key] +
      feats[a.key] +
      sumForKey(featEffects, a.key);
  return out;
}
