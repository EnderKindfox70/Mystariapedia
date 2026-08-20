import damageCatalog from '../../../public/resources/json/damage_type.json';
import daytimeCatalog from '../../../public/resources/json/daytime.json';
import statusCatalog from '../../../public/resources/json/status_effects.json';
import weatherCatalog from '../../../public/resources/json/weathers.json';
import { AttributeKey, StatKey, SurvivalKey } from '../character/character.types';
import { abilityModifier, STATS, SURVIVAL_GAUGES } from '../character/universe-data';
import { Daytime, SpellRetaliate, SpellScalingSource, StatusEffect, Weather } from '../wiki.types';
import {
  cellsWithinReach,
  dropOnGround,
  groundAt,
  landingCell,
  reachableGround,
  takeFromGround,
} from './ground';
import { weaponAbility } from './abilities';
import {
  ageWalls,
  damageWall,
  raiseWall,
  removeWall,
  wallAt,
  wallTerrain,
  WALL_PERMANENT,
} from './walls';
import {
  EarthShaping,
  FORCED_MATERIAL_MANA,
  MATERIAL_BY_KEY,
  resolveShaping,
} from './materials';
import { bearsMetal, metalCarriedBy, metalWithinGrasp, pickMetal } from './metal';
import {
  advanceClock,
  daytimeAt,
  EncounterClock,
  formatClock,
  formatDuration,
  ROUND_SECONDS,
  startingClock,
  startOfDaytime,
} from './clock';
import {
  AbilityDamage,
  AbilityScaling,
  AbilityStatus,
  ActiveEffect,
  ActiveStatus,
  CarriedItem,
  Combatant,
  CombatAbility,
  CombatAction,
  CombatEnchant,
  Encounter,
  EncounterPhase,
  GridPos,
  LogEntry,
  LogKind,
  MetalItem,
  PendingReaction,
  ReactionTrigger,
  Team,
} from './combat.types';
import { damageLabel, WEAPON_DAMAGE_TYPE } from './damage-labels';
import {
  blocksMovement,
  blocksSight,
  DoorState,
  effectiveTerrain,
  newDoor,
  terrainKind,
  TerrainMap,
} from './terrain';
import { Rng } from './dice';
import { add as addLoot, carriedAsLoot, LootItem, pour, rollDrops, take } from './loot';
import {
  activityByKey,
  COMBAT_ACTIVITY,
  DEFAULT_ACTIVITY,
  drain,
  elapsedForNotches,
  EMPTY_WATERSKIN,
  gaugeOf,
  huntBonus,
  huntOutcome,
  nourishmentOf,
  notchesLeft,
  restore as restoreGauge,
  stageOf,
  survivalMods,
  WATERSKIN,
} from './survival';
import {
  CELL_METERS,
  cellKey,
  cellsInShape,
  inBounds,
  hasLineOfSight,
  hasPathThrough,
  movementMeters,
  occupiedCells,
  pathTo,
  reachableCells,
  samePos,
  unitDistanceMeters,
  unitToCellMeters,
} from './grid';

/* ──────────────────────────────────────────────────────────────────────────
   MOTEUR DE RÈGLES

   Seule porte d'entrée des mutations : `applyAction`. La vue n'écrit jamais
   dans une rencontre — elle envoie une action et reçoit l'état suivant. Toute
   modification passe donc forcément par le journal, et rien ne peut bouger sans
   qu'on puisse dire pourquoi.

   Le moteur est pur : mêmes entrées (rencontre + action) → même sortie. Il ne
   connaît ni Angular, ni le réseau, ni l'horloge.
─────────────────────────────────────────────────────────────────────────── */

/* ── Constantes de règle ───────────────────────────────────────────────────
   Regroupées ici pour que l'équilibrage soit un réglage, pas une chasse au
   trésor dans le code.
─────────────────────────────────────────────────────────────────────────── */

/* ── Le jet de toucher ─────────────────────────────────────────────────────
   DEUX AXES, ÉTANCHES. La **précision** décide si le coup porte ; la
   **défense** décide ce qu'il coûte. Ni l'une ni l'autre n'entre dans le
   calcul de la seconde — sans quoi une armure lourde rendrait à la fois
   introuvable et inentamable, et l'écart entre deux niveaux se compterait
   deux fois.

   UN d20 À SEUIL MOBILE. Le dé se lance dans la main, ses vingt cases se
   lisent d'un coup d'œil, et le 1 comme le 20 sont des repères que personne
   n'a besoin qu'on lui explique. Ce qui bouge, c'est le SEUIL à atteindre, pas
   le dé : sans quoi la précision — l'attribut de l'arme, la maîtrise, l'esquive
   de la cible — ne servirait plus à rien, et un niveau 15 à la rapière
   toucherait comme un niveau 1 à la hache.

   LA PRÉCISION S'ACCUMULE FIN, S'ARRONDIT UNE FOIS. Les termes qui la
   composent n'ont pas le même ordre de grandeur : la maîtrise pèse des
   dizaines de points, l'esquive naturelle un à quatre. On les additionne sur
   une échelle fine, PUIS on convertit en crans de dé. Arrondir chaque terme
   séparément aurait effacé les petits.

   DES DEGRÉS, PAS UN OUI/NON. Avec une seule action par tour, un raté sec est
   un tour de jeu volé au joueur — et sur des combats de trois tours, il décide
   la partie. La bande d'effleurement fait qu'un mauvais jet coûte des dégâts
   plutôt que le tour entier : on ne repart bredouille que sur un vrai échec.

   Les jets de SAUVEGARDE partagent le même dé : ils relèvent des statuts, pas
   du toucher, mais il n'y a désormais qu'un dé dans tout le jeu.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Seuil qu'atteint un combattant sans qualité ni défaut particulier.
 *
 * À 8, un quidam rate de 1 à 3, effleure de 4 à 7, touche de 8 à 19 et critique
 * sur 20 — soit 0,73 de dégâts espérés. Tout le reste du système n'est que ce
 * barème-là, décalé.
 *
 * Le socle est délibérément SÉVÈRE : sans entraînement ni arme qui lui convient,
 * on ne touche pas si aisément. Un combattant seulement compétent (précision
 * +10) retombe sur 6+, et c'est déjà un professionnel.
 */
export const HIT_TARGET_BASE = 8;

/**
 * Points de précision valant un cran de dé.
 *
 * C'est le taux de change entre l'échelle fine où la précision s'accumule et
 * les vingt cases du dé. Cinq points = un cran = cinq points de pourcentage.
 */
export const PRECISION_PER_STEP = 5;

/** Points de précision par point de modificateur d'attribut. */
export const PRECISION_PER_MOD = 4;

/**
 * Maîtrise de référence : celle d'un débutant. C'est le niveau à partir duquel
 * on compte les crans gagnés.
 */
export const BASE_PROFICIENCY = 2;

/**
 * Points de précision par point de maîtrise, pour les jets qui ne sont PAS le
 * toucher — la réaction, notamment, où la maîtrise dit l'entraînement général
 * et non la familiarité avec une arme.
 */
export const PRECISION_PER_PROFICIENCY = 2;

/**
 * Bornes du seuil. Rien n'est jamais acquis ni perdu d'avance : le meilleur
 * bretteur rate toujours sur un 1, et la cible la plus insaisissable finit par
 * être atteinte. C'est ce qui garde une table vivante.
 *
 * Le plancher à 3 — plutôt que 2 — laisse au virtuose une marge d'échec qui ne
 * se réduit pas à la seule face fatidique : même parfaitement armé, il lui
 * reste un cran où le coup passe mal. Rien ne descend à « je ne peux plus
 * rater ».
 */
export const THRESHOLD_MIN = 3;
export const THRESHOLD_MAX = 18;

/**
 * Largeur de la bande d'effleurement, en crans, juste sous le seuil.
 *
 * C'est la pièce qui rend le jet jouable, et elle SUIT le socle. Durcir l'un
 * sans l'autre ferait tripler les tours secs — or ce qu'on veut d'un barème
 * sévère, c'est que les coups portent mal, pas qu'ils volent le tour d'un
 * joueur qui n'en a qu'un. Au seuil de référence, un mauvais jet écorne donc
 * deux fois et demie plus souvent qu'il ne rate franchement.
 */
export const GRAZE_STEPS = 5;

/** Ce que rapporte un effleurement. */
export const GRAZE_FACTOR = 0.25;

/**
 * Les deux faces qui ne se discutent pas.
 *
 * Un 1 rate quel que soit le talent, un 20 place le coup parfait quelle que
 * soit la difficulté. C'est ce qui empêche un affrontement d'être joué
 * d'avance, et ce qui fait les histoires qu'on raconte après la partie.
 */
export const NATURAL_MISS = 1;
export const NATURAL_CRIT = 20;

/** Ce que rapporte un critique. */
export const CRIT_FACTOR = 1.5;

/** Ce qu'un coup peut donner. */
export type HitOutcome = 'critical' | 'hit' | 'graze' | 'miss';

/** Facteur appliqué aux dégâts pour chaque degré. */
export const HIT_FACTORS: Record<HitOutcome, number> = {
  critical: CRIT_FACTOR,
  hit: 1,
  graze: GRAZE_FACTOR,
  miss: 0,
};

const HIT_LABELS: Record<HitOutcome, string> = {
  critical: 'coup critique',
  hit: 'touche',
  graze: 'effleure',
  miss: 'manque',
};

/**
 * Part de l'attaque portée dans les dégâts d'une arme.
 *
 * L'attaque de base vaut donc : `25 % de l'attaque physique + arme`, et pour une
 * arme à projectile, `+ les dégâts du projectile`. Les armes du wiki sont
 * chiffrées bas (3–7 pour un bâton) parce qu'elles décrivent l'outil, pas le
 * bras : sans ce ratio, un guerrier de niveau 10 frapperait comme un enfant.
 */
export const WEAPON_ATTACK_RATIO = 0.25;

/** Multiplicateurs appliqués selon l'affinité de la cible au type de dégâts. */
export const AFFINITY_FACTORS = { resistance: 0.5, weakness: 1.5 } as const;

/**
 * Échelle d'absorption de l'armure : `réduction = déf / (déf + cette valeur)`.
 *
 * La défense retire un POURCENTAGE, pas un nombre de points fixe. Une
 * soustraction plate ne peut pas marcher ici : les dégâts vont de 5 (un poing)
 * à 80 (une frappe de niveau 20), donc une armure de 5 annulait entièrement les
 * petits coups sans rien peser sur les gros. Le pourcentage traite les deux de
 * la même façon, et n'atteint jamais 100 % — une armure protège, elle ne rend
 * pas invulnérable.
 *
 * Repères : déf 5 → 17 %, déf 10 → 29 %, déf 20 → 44 %, déf 40 → 62 %.
 */
export const DEFENSE_SOAK_SCALE = 25;

/**
 * Ce que coûte un tir gêné : autant de points de précision en moins.
 *
 * Une arme d'hast servie à bout portant ne fait pas des dégâts de moitié — elle
 * part mal. Tant qu'il n'y avait pas de jet, il fallait bien rendre la gêne par
 * une perte de puissance ; maintenant qu'il y en a un, elle se dit dans la
 * langue qui lui convient : cinq crans de dé, soit un seuil qui passe de 6+ à
 * 11+. L'effet reste comparable — à peu près moitié moins de dégâts espérés —
 * mais il se raconte, et un tireur adroit le compense en partie.
 */
export const DISADVANTAGE_PRECISION = 25;

/** Le tir est-il gêné par la proximité de sa cible ? */
export function isDisadvantaged(
  actor: Combatant,
  ability: CombatAbility,
  target: Combatant,
): boolean {
  const zone = ability.disadvantageMeters ?? 0;
  return zone > 0 && unitDistanceMeters(actor, target) <= zone + 1e-6;
}

/**
 * Endurance rendue au début de chaque tour, avant modificateur de Constitution.
 *
 * Délibérément SOUS le coût d'une attaque (1 à 5) : on ne récupère pas en
 * frappant. Tant que la récupération passive couvrait la dépense, la jauge
 * montait pendant qu'on se battait et l'endurance n'était qu'une décoration —
 * 2 784 combats mesurés sans un seul tour perdu faute de souffle.
 *
 * Reprendre haleine se fait maintenant par un geste : la garde (cf.
 * `GUARD_ENDURANCE_GAIN`).
 */
export const ENDURANCE_RECOVERY_BASE = 1;

/** Plancher de la récupération : on souffle toujours au moins autant par tour. */
export const ENDURANCE_RECOVERY_FLOOR = 1;

/* ── Catalogues ────────────────────────────────────────────────────────────── */

const STATUS_BY_KEY = new Map<string, StatusEffect>(
  (statusCatalog.status_effects as unknown as StatusEffect[]).map((s) => [s.key, s]),
);

const WEATHER_BY_KEY = new Map<string, Weather>(
  (weatherCatalog.weathers as unknown as Weather[]).map((w) => [w.key, w]),
);

const DAYTIME_BY_KEY = new Map<string, Daytime>(
  (daytimeCatalog.daytimes as unknown as Daytime[]).map((d) => [d.key, d]),
);

/** Catégorie générale d'un type de dégâts, indexée par clé spécifique. */
const GENERAL_BY_TYPE = new Map<string, 'physical' | 'magical' | 'true'>(
  damageCatalog.specific_damage_types.map((t) => {
    const general = damageCatalog.general_damage_types.find(
      (g) => g.id === t.general_damage_type_id,
    );
    const kind =
      general?.name === 'Physical' ? 'physical' : general?.name === 'True' ? 'true' : 'magical';
    return [t.name, kind] as const;
  }),
);

/**
 * Alias de types de dégâts. `status_effects.json` nomme ses dégâts en français
 * (« feu », « physique ») là où `damage_type.json` fait foi en anglais. On
 * réconcilie ici plutôt que de laisser une brûlure ignorer la résistance au feu
 * d'une créature. Un type absent du catalogue (« poison ») reste tel quel :
 * aucune affinité ne le mentionne, il passe donc sans modificateur — ce qui est
 * le comportement correct tant qu'il n'est pas ajouté au catalogue.
 */
const TYPE_ALIASES: Record<string, string> = {
  feu: 'fire',
  glace: 'ice',
  foudre: 'lightning',
  physique: 'bludgeoning',
  tenebres: 'dark',
  'ténèbres': 'dark',
  lumiere: 'light',
  'lumière': 'light',
  mort: 'death',
  vie: 'life',
};

export const normalizeDamageType = (type: string | undefined): string => {
  const raw = (type ?? '').trim().toLowerCase();
  return TYPE_ALIASES[raw] ?? raw;
};

/**
 * Catégorie générale d'un type de dégâts.
 *
 * `damage_type.json` déclare une catégorie « True » (dégâts absolus, qu'aucune
 * défense ne réduit) mais n'y rattache aucun type spécifique : on reconnaît donc
 * la catégorie directement, ce qui donne un type utilisable aux sources qui n'en
 * ont pas d'autre (ajustement manuel du MJ, effet par tour non typé).
 * Tout type inconnu retombe sur « magique ».
 */
export const generalOf = (type: string | undefined): 'physical' | 'magical' | 'true' => {
  const key = normalizeDamageType(type);
  if (key === 'true' || key === 'absolu') return 'true';
  return GENERAL_BY_TYPE.get(key) ?? 'magical';
};

export const statusByKey = (key: string): StatusEffect | undefined => STATUS_BY_KEY.get(key);
export const weatherByKey = (key: string): Weather | undefined => WEATHER_BY_KEY.get(key);

/* ── Stats effectives ──────────────────────────────────────────────────────
   Un combattant a des stats de base figées, que les statuts et les effets
   temporaires décalent. Tout le moteur lit les stats par ces fonctions : aucun
   calcul ne doit consulter `base` directement, sans quoi un buff s'appliquerait
   à un endroit et pas à l'autre.
─────────────────────────────────────────────────────────────────────────── */

/** Somme des modificateurs actifs (statuts + effets + survie) portant sur une clé. */
function modifiersFor(unit: Combatant, key: SpellScalingSource): number {
  let total = 0;
  for (const effect of unit.effects) {
    for (const mod of effect.mods) if (mod.stat === key) total += mod.value;
  }
  // La faim, la soif et le manque de sommeil pèsent exactement comme un statut.
  // Les brancher ICI plutôt qu'au cas par cas est ce qui garantit qu'un
  // personnage assoiffé encaisse mal PARTOUT — au jet de toucher, au calcul de
  // la défense, au budget de déplacement — sans qu'on ait à y penser.
  for (const mod of survivalMods(unit.survival)) if (mod.stat === key) total += mod.value;
  for (const status of unit.statuses) {
    const def = STATUS_BY_KEY.get(status.key);
    for (const mod of def?.statEffects ?? []) {
      if (mod.stat !== key) continue;
      // Le catalogue des statuts porte des valeurs DÉJÀ signées, contrairement
      // aux effets de sorts dont le sens vient de la cible. On ne peut pas s'en
      // remettre à la catégorie : la Rage est un buff (+5 atk_phy) qui coûte
      // quand même de la défense (−3 def_phy).
      total += (mod.value ?? 0) * Math.max(1, status.stacks);
    }
  }
  return total;
}

/** Valeur courante d'une stat de combat (base + modificateurs), plancher à 0. */
export function effectiveStat(unit: Combatant, key: StatKey): number {
  const value = unit.base[key] + modifiersFor(unit, key);
  // À bout de souffle on se traîne — et comme la Vitesse porte le déplacement,
  // l'initiative ET l'esquive naturelle, la sanction se paie sur les trois à la
  // fois. C'est voulu : un combattant épuisé devient une proie.
  const winded = key === 'speed' && unit.winded ? WINDED_SPEED_SHARE : 1;
  return Math.max(0, Math.round(value * winded));
}

/** Score courant d'un attribut (base + modificateurs), plancher à 1. */
export function effectiveAttribute(unit: Combatant, key: AttributeKey): number {
  return Math.max(1, Math.round(unit.attributes[key] + modifiersFor(unit, key)));
}

const ATTRIBUTE_KEYS: AttributeKey[] = [
  'force',
  'dexterite',
  'constitution',
  'intelligence',
  'sagesse',
  'charisme',
];

/** Valeur d'une source de scaling, qu'elle désigne une stat ou un attribut. */
export function sourceValue(unit: Combatant, source: SpellScalingSource): number {
  return ATTRIBUTE_KEYS.includes(source as AttributeKey)
    ? effectiveAttribute(unit, source as AttributeKey)
    : effectiveStat(unit, source as StatKey);
}

/** Total d'un jeu de contributions de scaling. */
export function resolveScaling(
  unit: Combatant,
  scalings: AbilityScaling[] | undefined,
  falloff = 1,
): number {
  return (scalings ?? []).reduce((sum, s) => sum + s.ratio * sourceValue(unit, s.source) * falloff, 0);
}

/**
 * Ce que le porteur ajoute à une composante de dégâts : son scaling, plus le
 * modificateur d'attribut que la composante réclame.
 *
 * Un seul endroit pour les deux, parce qu'il y a deux lecteurs — le bouton qui
 * annonce la fourchette et le coup qui la porte — et qu'ils ne doivent jamais
 * dire deux choses différentes.
 */
export function componentBonus(
  unit: Combatant,
  component: AbilityDamage,
  falloff = 1,
): number {
  const scale = resolveScaling(unit, component.scaling, falloff);
  // Le modificateur ne s'érode PAS avec le niveau : ce n'est pas une part
  // empruntée à un sort qu'on a dépassé, c'est la main qui tient l'arme.
  const mod = component.attributeModifier
    ? abilityModifier(effectiveAttribute(unit, component.attributeModifier))
    : 0;
  return scale + mod;
}

/**
 * Niveaux d'écart pour que le scaling d'un sort tombe à la moitié.
 *
 * Dix : un sort appris au niveau 5 rend encore la moitié de son scaling à un
 * lanceur de niveau 15, et le tiers à un niveau 25.
 */
export const SCALING_HALF_LIFE = 10;

/**
 * Ce qu'il reste du scaling d'un sort entre les mains d'un lanceur qui l'a
 * dépassé.
 *
 * **Un sort de bas niveau ne doit pas rester redoutable pour toujours.** Sans
 * cette érosion, le premier nœud d'un sort appris au niveau 5 infligeait 34
 * dégâts à qui venait de l'apprendre et 86 à une archimage de niveau 15 — le
 * même sort, deux fois et demie plus fort, sans avoir été amélioré. C'est ce
 * qui permettait de tuer un guerrier de niveau 20 en deux coups avec un sort
 * d'apprenti.
 *
 * Les DÉS du sort, eux, ne s'érodent pas : c'est sa puissance propre, celle que
 * la fiche annonce. Seule décroît la part qu'il emprunte à son lanceur.
 *
 * La montée en puissance passe donc par les paliers du sort — les améliorer —
 * plutôt que par le simple fait de vieillir.
 */
export function scalingFalloff(unit: Combatant, ability: CombatAbility): number {
  const spellLevel = ability.spellLevel;
  if (!spellLevel || !unit.level) return 1;
  const ecart = Math.max(0, unit.level - spellLevel);
  return 1 / (1 + ecart / SCALING_HALF_LIFE);
}

/** Portée de déplacement du tour, en mètres (vitesse courante, buffs compris). */
export function movementBudget(unit: Combatant): number {
  return movementMeters(effectiveStat(unit, 'speed'));
}

/** Réduction des soins reçus (0–1), la plus sévère parmi les statuts actifs. */
function healReduction(unit: Combatant): number {
  let worst = 0;
  for (const status of unit.statuses) {
    const def = STATUS_BY_KEY.get(status.key);
    if (def?.healReduction) worst = Math.max(worst, def.healReduction);
  }
  return Math.min(1, worst);
}

/* ── Le prix du mouvement ──────────────────────────────────────────────────
   Courir essouffle. C'est ce qui manquait pour que la réserve compte dans un
   combat court : les actions se choisissent, le déplacement se subit — presque
   tout le monde bouge, presque tous les tours.

   Le coût se calcule sur le CUMUL du tour, jamais sur chaque pas : fractionner
   son déplacement en trois petits bonds ne doit pas revenir moins cher que de
   le faire d'un trait.
─────────────────────────────────────────────────────────────────────────── */

/** Premiers mètres gratuits chaque tour : un pas ne coûte pas son souffle. */
export const MOVE_FREE_METERS = CELL_METERS;

/** Mètres parcourus, au-delà du pas gratuit, pour un point d'endurance. */
export const MOVE_METERS_PER_ENDURANCE = 3;

/** Souffle qu'a coûté un déplacement cumulé de `meters` sur le tour. */
export const movementToll = (meters: number): number =>
  Math.ceil(Math.max(0, meters - MOVE_FREE_METERS) / MOVE_METERS_PER_ENDURANCE);

/**
 * Ce qu'un combattant peut encore parcourir ce tour, **souffle compris**.
 *
 * La vue s'en sert pour dessiner les cases atteignables : proposer un
 * déplacement qu'on ne peut pas payer et le refuser ensuite serait une fausse
 * promesse. Le pas gratuit reste toujours accessible — à bout de souffle, on
 * avance encore, mais d'un pas.
 */
export function affordableMovement(unit: Combatant): number {
  const budget = Math.max(0, movementBudget(unit) - unit.moved);
  const gratuit = Math.max(0, MOVE_FREE_METERS - unit.moved);
  return Math.min(budget, gratuit + unit.endurance * MOVE_METERS_PER_ENDURANCE);
}

/* ── Essoufflement ─────────────────────────────────────────────────────────
   Toucher le fond ne se paie pas seulement en actions refusées : on continue
   de se battre, mais mal. Et l'on ne s'en relève pas au premier point regagné
   — il faut avoir vraiment repris haleine, sans quoi on oscillerait autour de
   zéro en retrouvant sa pleine forme un tour sur deux.
─────────────────────────────────────────────────────────────────────────── */

/** Part de la réserve à retrouver pour cesser d'être à bout de souffle. */
export const WINDED_RECOVERY_SHARE = 0.5;

/** Points de précision perdus tant qu'on est à bout de souffle (2 crans). */
export const WINDED_PRECISION_PENALTY = 10;

/** Ce qu'il reste de vitesse à bout de souffle : on se traîne. */
export const WINDED_SPEED_SHARE = 0.5;

/**
 * Met à jour l'état de souffle après une dépense ou une récupération.
 *
 * Un seul endroit décide, pour que l'entrée et la sortie ne puissent pas
 * diverger : on tombe à zéro, on se relève à la moitié.
 */
function updateWinded(enc: Encounter, unit: Combatant): void {
  const max = effectiveStat(unit, 'endurance');
  if (!unit.winded && unit.endurance <= 0) {
    unit.winded = true;
    push(enc, 'status', `${unit.name} est à bout de souffle.`, {
      targetId: unit.id,
      details: [`précision −${WINDED_PRECISION_PENALTY / PRECISION_PER_STEP} crans, vitesse réduite de moitié`],
    });
    return;
  }
  if (unit.winded && unit.endurance >= Math.ceil(max * WINDED_RECOVERY_SHARE)) {
    unit.winded = false;
    push(enc, 'status', `${unit.name} a repris son souffle.`, { targetId: unit.id });
  }
}

/* ── Précision ─────────────────────────────────────────────────────────────── */

/**
 * Une capacité vise-t-elle, ou balaye-t-elle ?
 *
 * **C'est la forme qui décide, pas la nature.** Un trait d'ombre peut manquer ;
 * un souffle qui remplit un cône ne le peut pas — il n'a rien à ajuster, il
 * occupe l'espace. Ce qui s'oppose à une zone, ce sont les jets de sauvegarde,
 * qui existent déjà et font ce travail.
 *
 * La règle vaut pour tout le monde du même coup : arme, poing, crocs, sort. Une
 * seule ligne à lire pour savoir si l'on jette les dés.
 */
export const aims = (ability: CombatAbility): boolean =>
  !ability.autoHit && ability.shape.kind === 'single';

/**
 * Précision d'un combattant avec cette capacité-là.
 *
 * L'attribut n'est pas choisi ici : chaque capacité porte le sien
 * (`attackAttribute`), renseigné à la source. Une arme hérite de celui de sa
 * catégorie — la hache de bataille vise à la Force, la rapière à la Dextérité,
 * le bâton à la Sagesse —, une compétence physique vise à la Force, un sort à
 * l'Intelligence. C'est ce qui fait qu'un bretteur et un cogneur ne sont pas
 * bons avec les mêmes outils, sans qu'aucune règle ne le dise en dur.
 *
 * `atk_phy` et `atk_mag` n'entrent volontairement PAS ici : elles pilotent déjà
 * les dégâts. Les faire piloter aussi le toucher ferait de l'attaque la stat qui
 * décide de tout, et l'écart entre deux niveaux se compterait deux fois.
 *
 * LA MAÎTRISE NE COMPTE QUE SUR CE QU'ON SAIT MANIER. C'est la seule chose qui
 * croît avec le niveau, et elle est conditionnelle : ramasser l'arc d'un mort
 * ne donne pas vingt ans d'entraînement à l'arc. Un guerrier de niveau 20 vise
 * donc à l'épée comme un vétéran, et à l'arc comme un débutant.
 */
export function precisionOf(unit: Combatant, ability: CombatAbility): number {
  const attribute = ability.attackAttribute ?? 'dexterite';
  const mod = abilityModifier(effectiveAttribute(unit, attribute));
  const essouffle = unit.winded ? WINDED_PRECISION_PENALTY : 0;
  return mod * PRECISION_PER_MOD - essouffle;
}

/**
 * Crans de dé gagnés par la maîtrise — **comptés directement, sans conversion**.
 *
 * C'est ce qui distingue la maîtrise de tout le reste, et c'est délibéré. Passée
 * par l'échelle fine, elle ne valait que 0,4 cran par point : monter de la
 * maîtrise 2 à la maîtrise 4 ne déplaçait pas le seuil d'un iota, et vingt
 * niveaux de carrière ne gagnaient qu'un cran et demi. Une progression qu'on ne
 * voit pas n'existe pas.
 *
 * **Un palier de maîtrise = un cran de dé**, soit cinq points de pourcentage.
 * Un vétéran de niveau 20 touche donc quatre crans mieux qu'un débutant — avec
 * l'arme de sa classe, et elle seule.
 */
export function masterySteps(unit: Combatant, ability: CombatAbility): number {
  if (!ability.proficient) return 0;
  return Math.max(0, unit.proficiency - BASE_PROFICIENCY);
}

/**
 * Le porteur sait-il manier cette arme ?
 *
 * Deux sources, et elles comptent pareil : la liste de la classe, et celles que
 * la fiche a ajoutées à la main (`extra`). Un entraînement gagné en partie vaut
 * celui reçu à la formation — sinon la table n'aurait aucun moyen de le faire
 * exister autrement qu'en changeant de classe.
 */
export const isProficientWith = (
  klass: { weaponProficiencies?: string[] } | undefined,
  weaponCategory: string | undefined,
  extra?: string[],
): boolean =>
  !!weaponCategory &&
  (!!klass?.weaponProficiencies?.includes(weaponCategory) || !!extra?.includes(weaponCategory));

/**
 * Le score à atteindre sur le d20 pour toucher.
 *
 * Tous les termes s'additionnent d'abord sur l'échelle fine de la précision —
 * où l'esquive naturelle vaut ses 1 à 4 points et la maîtrise ses dizaines —
 * et la conversion en crans de dé n'a lieu qu'une fois, à la fin. Arrondir
 * chacun séparément aurait effacé les petits contributeurs.
 *
 * Exportée parce que la vue l'affiche AVANT que le joueur ne s'engage : décider
 * d'une action sans savoir ce qu'elle risque n'est pas un choix, c'est un pari.
 */
export function hitThreshold(actor: Combatant, ability: CombatAbility, target: Combatant): number {
  return hitBreakdown(actor, ability, target).threshold;
}

/** Le détail d'un seuil : d'où il part, ce qui l'a bougé, où il arrive. */
export interface Breakdown {
  threshold: number;
  /** Écart au socle, en crans. Positif = le seuil a baissé. */
  steps: number;
  /** Ce qui a fait bouger le seuil, nommé, pour le journal. */
  causes: string[];
}

/**
 * Compose un seuil à partir des points de précision accumulés.
 *
 * Le pas de conversion est ici et nulle part ailleurs : le jet de toucher et le
 * jet de réflexe passent tous deux par cette fonction, donc ils ne peuvent pas
 * diverger sur ce que vaut un cran.
 */
function toThreshold(points: number, causes: string[], bonusSteps = 0): Breakdown {
  const steps = Math.round(points / PRECISION_PER_STEP) + bonusSteps;
  const threshold = Math.max(THRESHOLD_MIN, Math.min(THRESHOLD_MAX, HIT_TARGET_BASE - steps));
  // On rend l'écart RÉEL, pas l'écart théorique : aux bornes, le seuil ne bouge
  // plus, et le journal mentirait en annonçant des crans qui n'ont rien fait.
  return { threshold, steps: HIT_TARGET_BASE - threshold, causes };
}

/** Le seuil de toucher et sa composition. */
export function hitBreakdown(
  actor: Combatant,
  ability: CombatAbility,
  target: Combatant,
): Breakdown {
  const gene = isDisadvantaged(actor, ability, target) ? DISADVANTAGE_PRECISION : 0;
  const evade = naturalEvade(target);

  const socle = announcedBreakdown(actor, ability);
  const causes = [...socle.causes];
  if (evade) causes.push('esquive');
  if (gene) causes.push('tir gêné');
  // La maîtrise s'ajoute en CRANS, après conversion du reste : c'est la seule
  // contribution qui ne passe pas par l'échelle fine (cf. `masterySteps`).
  return toThreshold(
    socle.points - evade - gene,
    causes,
    masterySteps(actor, ability),
  );
}

/**
 * Le seuil ANNONCÉ, avant d'avoir désigné une cible.
 *
 * C'est ce que le bouton d'action affiche : tout ce qui ne dépend que du
 * lanceur et de sa capacité — sa précision, sa maîtrise, et ce que le sort
 * exige de lui-même. L'esquive naturelle de la cible et la gêne d'un tir à
 * bout portant n'y sont pas, faute de savoir encore qui l'on vise.
 *
 * Il vit ici, et non dans la vue, pour une raison éprouvée : la vue en avait
 * recopié la formule, et cette copie ignorait `precisionPenalty`. Elle annonçait
 * donc un sort exigeant au prix d'un sort ordinaire, à cinq crans de dé près.
 */
export function announcedBreakdown(
  actor: Combatant,
  ability: CombatAbility,
): Breakdown & { points: number } {
  const precision = precisionOf(actor, ability);
  const maitrise = masterySteps(actor, ability);
  // Ce que la capacité exige d'elle-même : nouer des fils sur quelqu'un qui se
  // débat n'est pas donner un coup d'épée, et le seuil doit le dire.
  const exigence = Math.max(0, ability.precisionPenalty ?? 0);

  const causes: string[] = [];
  if (maitrise) causes.push('maîtrise');
  if (precision) causes.push('précision');
  if (exigence) causes.push('sort exigeant');

  const points = precision - exigence;
  return { ...toThreshold(points, causes, maitrise), points };
}

/**
 * Explique un seuil en une poignée de mots.
 *
 * C'est la ligne qui lève LA question que le barème pose forcément à qui vient
 * du d20 classique : « mon modificateur est-il ajouté au dé ? ». Non — il
 * déplace le seuil. Le dire à chaque jet coûte quelques caractères et évite de
 * l'expliquer à chaque partie.
 */
export function explainThreshold(b: Breakdown): string {
  if (!b.steps) return `socle ${HIT_TARGET_BASE}`;
  const sens = b.steps > 0 ? '−' : '+';
  const detail = b.causes.length ? ` : ${b.causes.join(', ')}` : '';
  return `socle ${HIT_TARGET_BASE} ${sens} ${Math.abs(b.steps)}${detail}`;
}

/** Le degré atteint par un score de dé face à un seuil. */
export function outcomeOf(roll: number, threshold: number): HitOutcome {
  // Les deux faces qui ne se discutent pas passent en premier : elles priment
  // sur le seuil, si haut ou si bas soit-il.
  if (roll === NATURAL_MISS) return 'miss';
  if (roll === NATURAL_CRIT) return 'critical';
  if (roll >= threshold) return 'hit';
  return roll >= threshold - GRAZE_STEPS ? 'graze' : 'miss';
}

/**
 * Le degré de réussite d'un jet, et le détail à porter au journal.
 *
 * Le dé est rendu tel qu'il est tombé, et la ligne le dit : **rien ne s'y
 * ajoute**. C'est l'inverse du d20 classique, et sans cette précision un joueur
 * qui en vient croit avoir manqué un modificateur.
 */
export function resolveHitRoll(
  threshold: number,
  rng: Rng,
  breakdown?: Breakdown,
): { outcome: HitOutcome; roll: number; detail: string } {
  const roll = rng.d20();
  const outcome = outcomeOf(roll, threshold);
  const pourquoi = breakdown ? ` — ${explainThreshold(breakdown)}` : '';
  return {
    outcome,
    roll,
    detail: `dé ${roll} brut (rien ne s’y ajoute) contre seuil ${threshold}+${pourquoi} → ${HIT_LABELS[outcome]}`,
  };
}

/**
 * Multiplicateur de dégâts ESPÉRÉ pour un seuil donné, degrés compris.
 *
 * C'est ce qu'il faut pour comparer honnêtement deux actions : une frappe
 * énorme mais hasardeuse peut valoir moins qu'un coup sûr et modeste. La vue
 * s'en sert pour annoncer des dégâts moyens crédibles, le banc d'essai pour
 * choisir, et l'équilibrage pour raisonner sur des cadences réelles.
 *
 * On énumère les vingt faces plutôt que de recomposer les bandes par le calcul :
 * il n'y en a que vingt, et c'est `outcomeOf` qui fait foi. Une bande recalculée
 * à la main finirait tôt ou tard par mentir sur les bords.
 *
 * Au seuil de référence (6+) : ≈ 0,83.
 */
export function expectedHitFactor(threshold: number): number {
  let total = 0;
  for (let roll = 1; roll <= 20; roll++) total += HIT_FACTORS[outcomeOf(roll, threshold)];
  return total / 20;
}

/** Un statut du catalogue empêche-t-il quelque chose ? */
function blockedBy(unit: Combatant, flag: keyof StatusEffect): StatusEffect | undefined {
  for (const status of unit.statuses) {
    const def = STATUS_BY_KEY.get(status.key);
    if (def && def[flag] === true) return def;
  }
  return undefined;
}

/**
 * Esquive naturelle : **1 % par tranche de 10 de Vitesse**. Un combattant vif
 * évite parfois un coup sans rien faire de particulier — c'est modeste par
 * construction, l'esquive fiable reste l'affaire des buffs.
 */
export function naturalEvade(unit: Combatant): number {
  return swiftness(unit);
}

/**
 * Vivacité d'un combattant, ramenée sur l'échelle fine de la précision.
 *
 * Une seule définition pour deux usages opposés : elle rend plus dur à toucher
 * (esquive naturelle) et plus dur à contrer (elle s'oppose au jet de réflexe de
 * qui veut parer. Un adversaire fulgurant est difficile des deux côtés, et il
 * serait absurde que les deux règles ne s'accordent pas sur ce qu'est « vif ».
 */
const swiftness = (unit: Combatant): number => Math.floor(effectiveStat(unit, 'speed') / 10);

/**
 * Score à atteindre au d20 pour réagir **à temps** à `threat`.
 *
 * Même grammaire que le jet de toucher — mêmes coefficients, même conversion en
 * crans, mêmes bornes, mêmes 1 et 20 souverains : il n'y a qu'un barème à
 * retenir dans tout le jeu.
 *
 * C'est la **Dextérité** qui décide, pas la Vitesse. Non par goût, mais parce
 * que la Vitesse fait déjà trois métiers (déplacement, initiative, esquive) et
 * que la Dextérité n'en avait presque aucun. Ce qui s'y oppose, en revanche,
 * c'est bien la vivacité de l'assaillant : parer un fulgurant est plus dur.
 */
export function reflexThreshold(unit: Combatant, threat: Combatant): number {
  return reflexBreakdown(unit, threat).threshold;
}

/** Le seuil de réflexe et sa composition. */
export function reflexBreakdown(unit: Combatant, threat: Combatant): Breakdown {
  const reflexes =
    abilityModifier(effectiveAttribute(unit, 'dexterite')) * PRECISION_PER_MOD +
    unit.proficiency * PRECISION_PER_PROFICIENCY;
  const vivacite = swiftness(threat);

  const causes: string[] = [];
  if (reflexes) causes.push('réflexes');
  if (vivacite) causes.push('vivacité adverse');
  return toThreshold(reflexes - vivacite, causes);
}

/**
 * Le combattant voit-il le coup venir ? Un 1 est toujours trop tard, un 20
 * toujours à temps.
 */
export function resolveReflexRoll(
  threshold: number,
  rng: Rng,
): { success: boolean; roll: number } {
  const roll = rng.d20();
  if (roll === NATURAL_MISS) return { success: false, roll };
  if (roll === NATURAL_CRIT) return { success: true, roll };
  return { success: roll >= threshold, roll };
}

/**
 * Chance d'annuler complètement une attaque (0–100), accordée par un buff.
 *
 * C'est un EFFACEMENT, pas une gêne : Disparition ne rend pas difficile à
 * viser, elle fait qu'il n'y a plus rien à viser. Elle se teste donc avant le
 * jet de toucher, et l'emporte sur lui.
 *
 * L'esquive naturelle, elle, n'est plus ici : elle est devenue le terme qui
 * s'oppose à la précision (cf. `hitThreshold`), ce qui est sa vraie nature — être
 * vif rend plus dur à atteindre, ça n'efface pas. Les deux ne se cumulent
 * toujours pas au sein des buffs : on retient le meilleur.
 */
export function evadeChance(unit: Combatant): number {
  const fromEffects = unit.effects.reduce((best, e) => Math.max(best, e.evadeChance ?? 0), 0);
  return Math.min(100, fromEffects);
}

/**
 * Composantes de dégâts ajoutées par les enchantements actifs à une capacité.
 *
 * Un enchantement ne nimbe qu'une chose : les poings (`unarmed`) ou l'arme en
 * main. Des poings d'ombre ne rendent donc pas une épée plus tranchante, et une
 * lame ardente n'enflamme pas un coup de poing — ni l'un ni l'autre ne touche
 * un sort.
 */
export function enchantsOn(unit: Combatant, ability: CombatAbility): AbilityDamage[] {
  return activeEnchants(unit, ability)
    .map((e) => e.damage)
    .filter((d): d is AbilityDamage => !!d);
}

/**
 * Enchantements qui portent sur CETTE capacité : ceux qui nimbent ce qu'elle
 * frappe avec. Un sort n'en profite jamais.
 */
function activeEnchants(unit: Combatant, ability: CombatAbility): CombatEnchant[] {
  if (ability.kind !== 'weapon' && ability.kind !== 'class' && ability.kind !== 'natural') return [];
  const slot: CombatEnchant['target'] = ability.unarmed ? 'unarmed' : 'weapon';
  return unit.effects
    .map((e) => e.enchant)
    .filter((e): e is CombatEnchant => e?.target === slot);
}

/**
 * Statuts que les revêtements actifs ajoutent au coup — c'est par là qu'un
 * venin agit : il ne change pas les dégâts, il tente de passer à chaque touche.
 */
export function enchantStatusesOn(unit: Combatant, ability: CombatAbility): AbilityStatus[] {
  return activeEnchants(unit, ability).flatMap((e) => e.inflicts ?? []);
}

/**
 * Pose un effet sans jamais l'empiler sur lui-même.
 *
 * Relancer un buff sur une cible qui le porte déjà ne l'additionne pas : il
 * REPART pour sa durée pleine, avec les valeurs de la nouvelle incantation.
 * Sans quoi la parade la plus terne devient imprenable à force d'être répétée
 * — trois Durcissements de suite vaudraient +30 de défense —, et le contre-coup
 * qui devait en être le prix se trouve dilué dans le lot.
 *
 * L'identité d'un effet, c'est la capacité qui l'a posé ET qui le porte : le
 * même sort tenu sur deux alliés reste deux effets, et deux sorts différents
 * qui haussent la même stat se cumulent normalement.
 */
function addEffect(unit: Combatant, effect: ActiveEffect): void {
  const existing = unit.effects.findIndex((e) => e.id === effect.id);
  if (existing >= 0) unit.effects[existing] = effect;
  else unit.effects.push(effect);
}

/**
 * Un revêtement chasse le précédent : on ne nimbe pas ses poings deux fois.
 *
 * Seul l'ENCHANTEMENT est remplacé, pas l'effet qui le portait : une Transe de
 * combat qui donnait aussi de la vitesse garde sa vitesse, elle perd seulement
 * le nimbe de ses poings. Un effet qui n'avait plus que ça à offrir disparaît,
 * pour ne pas laisser une pastille vide sur la fiche.
 *
 * Le remplacement est ciblé : enchanter ses poings ne désenchante pas son arme.
 */
function replaceEnchant(
  enc: Encounter,
  unit: Combatant,
  slot: CombatEnchant['target'],
  replacement: string,
): void {
  const remaining: ActiveEffect[] = [];
  for (const effect of unit.effects) {
    if (effect.enchant?.target !== slot) {
      remaining.push(effect);
      continue;
    }
    push(
      enc,
      'status',
      `« ${replacement} » remplace « ${effect.name} » sur ${slot === 'unarmed' ? 'les poings' : "l'arme"} de ${unit.name}.`,
      { targetId: unit.id },
    );
    const stripped: ActiveEffect = { ...effect, enchant: undefined };
    const stillUseful =
      stripped.mods.length > 0 ||
      !!stripped.evadeChance ||
      !!stripped.retaliate ||
      !!stripped.cleanses?.length;
    if (stillUseful) remaining.push(stripped);
  }
  unit.effects = remaining;
}

/**
 * Toutes les composantes de dégâts d'une capacité : les siennes, plus ce que
 * les enchantements ajoutent **à chaque coup**. Un enchaînement de trois coups
 * en profite trois fois, comme le dit la description des sorts de revêtement.
 *
 * Source unique : la résolution ET l'affichage passent par ici, donc le bouton
 * ne peut pas annoncer autre chose que ce qui sera infligé.
 */
export function resolvedComponents(unit: Combatant, ability: CombatAbility): AbilityDamage[] {
  const extra = enchantsOn(unit, ability);
  if (!extra.length) return ability.damages;
  // Un revêtement sans nature propre (Renforcement) frappe du type de ce qu'il
  // nimbe : la même défense l'arrête, et il n'ajoute pas un élément à un coup
  // qui n'en avait pas. Faute d'arme identifiable — des poings nus —, il reste
  // contondant, ce qu'est un coup porté à main nue.
  const wornType = ability.damages[0]?.type ?? 'bludgeoning';
  const nimbes = extra.map((d) =>
    d.type === WEAPON_DAMAGE_TYPE ? { ...d, type: wornType } : d,
  );
  return ability.damages.flatMap((component) => [component, ...nimbes]);
}

/* ── Utilitaires d'état ────────────────────────────────────────────────────── */

export const findUnit = (enc: Encounter, id: string): Combatant | undefined =>
  enc.combatants.find((c) => c.id === id);

/** Le combattant dont c'est le tour, ou `undefined` hors combat. */
export function currentUnit(enc: Encounter): Combatant | undefined {
  if (!enc.started) return undefined;
  return findUnit(enc, enc.order[enc.turnIndex] ?? '');
}

/** Combattants encore debout, camp par camp. */
export const standing = (enc: Encounter): Combatant[] => enc.combatants.filter((c) => !c.down);

/**
 * Camps encore en lice. Le combat s'arrête quand il n'en reste qu'un — les
 * neutres ne comptent pas comme opposition.
 */
export function activeTeams(enc: Encounter): string[] {
  return [...new Set(standing(enc).map((c) => c.team))].filter((t) => t !== 'neutres');
}

export const isOver = (enc: Encounter): boolean => enc.started && activeTeams(enc).length <= 1;

function push(enc: Encounter, kind: LogKind, text: string, extra: Partial<LogEntry> = {}): void {
  const entry: LogEntry = {
    id: enc.nextLogId++,
    round: enc.round,
    kind,
    text,
    ...extra,
  };
  enc.log.push(entry);
}

/** Le générateur de la rencontre, positionné sur le nombre de jets déjà tirés. */
const rngOf = (enc: Encounter): Rng => new Rng(enc.seed, enc.rollCount);

/** Rend au journal le compteur de jets consommés (rejouabilité). */
const commit = (enc: Encounter, rng: Rng): void => {
  enc.rollCount = rng.count;
};

/* ── Le contrôle d'autrui ──────────────────────────────────────────────────
   Certains statuts ne se contentent pas d'entraver : ils DIRIGENT. Un pantin
   n'est pas paralysé — il agit, mais pour un autre, et contre les siens. Trois
   conséquences que le moteur doit tenir : il change de camp aux yeux du
   ciblage, c'est le camp de son maître qui joue son tour, et tenir ses fils
   occupe les mains de ce maître.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Mains d'un lanceur. Deux, et c'est ce nombre qui plafonne tout le reste : un
 * statut qui coûte une main par porteur en autorise donc deux, sans qu'aucune
 * fiche n'ait à écrire « deux au maximum ».
 */
export const CASTER_HANDS = 2;

/** Les statuts qu'un combattant TIENT sur d'autres, avec leur définition. */
export function sustainedBy(
  enc: Encounter,
  caster: Combatant,
): { bearer: Combatant; status: ActiveStatus; def: StatusEffect }[] {
  const out: { bearer: Combatant; status: ActiveStatus; def: StatusEffect }[] = [];
  for (const bearer of enc.combatants) {
    for (const status of bearer.statuses) {
      if (status.sourceId !== caster.id) continue;
      const def = STATUS_BY_KEY.get(status.key);
      if (def?.sustain) out.push({ bearer, status, def });
    }
  }
  return out;
}

/** Mains que ses propres sortilèges immobilisent — 0, 1 ou 2. */
export function handsBound(enc: Encounter, caster: Combatant): number {
  return sustainedBy(enc, caster).reduce((n, s) => n + (s.def.sustain?.bindsHands ?? 0), 0);
}

/** Qui dirige ce combattant, s'il est aux mains de quelqu'un. */
export function controllerOf(enc: Encounter, unit: Combatant): Combatant | undefined {
  for (const status of unit.statuses) {
    if (!STATUS_BY_KEY.get(status.key)?.sustain?.commands) continue;
    const master = status.sourceId ? findUnit(enc, status.sourceId) : undefined;
    if (master && !master.down) return master;
  }
  return undefined;
}

/**
 * Le camp pour lequel ce combattant se bat **en ce moment**.
 *
 * Distinct de `team`, qui reste son appartenance réelle : un pantin ne rejoint
 * pas l'ennemi, il lui est prêté. La victoire continue donc de se compter sur
 * `team` — sans quoi contrôler le dernier adversaire finirait le combat — mais
 * le ciblage et la main se lisent ici.
 */
export function allegianceOf(enc: Encounter, unit: Combatant): Team {
  return controllerOf(enc, unit)?.team ?? unit.team;
}

/* ── Cibles valides ────────────────────────────────────────────────────────── */

/** Une capacité peut-elle légitimement affecter cette unité ? */
export function isValidTarget(
  enc: Encounter,
  ability: CombatAbility,
  actor: Combatant,
  target: Combatant,
): boolean {
  const targets = ability.targets.length ? ability.targets : ['enemy' as const];
  if (targets.includes('everyone')) return true;
  if (target.id === actor.id) return targets.includes('self');

  // On compare les ALLÉGEANCES, pas les camps : un pantin frappe ceux qu'il
  // protégeait la veille, et ses anciens compagnons peuvent le viser.
  //
  // Avec une exception, et elle est asymétrique à dessein : **un pantin n'est le
  // compagnon de personne**. Il se bat pour son maître, mais ce maître peut le
  // frapper — on coupe les fils en abattant ce qui pend au bout. Sans cela, un
  // combat où ne restent que le marionnettiste et sa marionnette ne pouvait plus
  // finir : plus personne n'avait le droit de la viser.
  //
  // L'inverse reste vrai : le pantin, lui, ne peut pas prendre les alliés de son
  // maître pour cibles. C'est ce qui distingue « asservi » de « devenu fou ».
  const ally =
    allegianceOf(enc, target) === allegianceOf(enc, actor) && !controllerOf(enc, target);
  return ally ? targets.includes('ally') : targets.includes('enemy');
}

/** Les combattants couverts par une capacité lancée depuis `actor` vers `at`. */
export function unitsInEffect(
  enc: Encounter,
  actor: Combatant,
  ability: CombatAbility,
  at: GridPos,
  explicitIds?: string[],
): Combatant[] {
  if (ability.shape.kind === 'self') return [actor];

  // Une détonation de marques ne balaie aucune surface : ses cibles sont déjà
  // désignées, et la distance n'y fait rien — la laisse de la marque l'a déjà
  // bornée quand elle a été posée.
  if (ability.shape.kind === 'marked') {
    const mark = ability.marksTargets;
    if (!mark) return [];
    return enc.combatants.filter(
      (u) => !u.down && bearsMarkOf(u, mark, actor) && isValidTarget(enc, ability, actor, u),
    );
  }

  if (ability.shape.kind === 'targets') {
    const ids = (explicitIds ?? []).slice(0, ability.shape.count);
    return ids
      .map((id) => findUnit(enc, id))
      .filter((u): u is Combatant => !!u && !u.down && isValidTarget(enc, ability, actor, u));
  }

  const cells = new Set(
    cellsInShape(ability.shape, actor.pos, at, enc.grid).map((c) => `${c.x},${c.y}`),
  );
  return enc.combatants.filter((u) => {
    if (u.down) return false;
    // Le coup était déjà parti vers cette case : qui s'y est fait pousser le
    // prend, allégeance ou pas. C'est ce qui donne son mordant au Change-place
    // joué en parade — sinon il ne servirait qu'à fuir.
    //
    // JAMAIS le lanceur lui-même, en revanche. Le passe-droit lève la question
    // du CAMP, pas celle de savoir qui frappe : un assaillant permuté avec sa
    // proie atterrissait sur la case qu'il visait et s'y frappait tout seul.
    // Se viser reste gouverné par `targets`, comme pour tout le monde.
    const pousse = u.id !== actor.id && !!enc.inTheWay?.includes(u.id);
    if (!isValidTarget(enc, ability, actor, u) && !pousse) return false;
    return occupiedCells(u).some((c) => cells.has(`${c.x},${c.y}`));
  });
}

/* ── Dégâts et soins ───────────────────────────────────────────────────────── */

/** Résultat de l'application d'un montant de dégâts à une cible. */
interface DamageOutcome {
  applied: number;
  /** Détail lisible : « 14 feu ×1,5 (faiblesse) = 21 ». */
  detail: string;
  /** L'affinité a transformé les dégâts en soin. */
  absorbed: boolean;
}

/** Applique l'affinité de la cible à un montant brut d'un type donné. */
function applyAffinity(target: Combatant, amount: number, type: string): DamageOutcome {
  const key = normalizeDamageType(type);
  const aff = target.affinities;
  const has = (list: string[]) => list.map(normalizeDamageType).includes(key);

  // `detail` ne porte QUE le motif, pas le calcul : c'est `dealDamage` qui
  // compose la ligne finale, et deux façons de dire la même chose dans un
  // journal en rendent la lecture impossible.
  if (has(aff.immunities)) return { applied: 0, detail: 'immunité', absorbed: false };
  if (has(aff.absorptions)) return { applied: amount, detail: 'absorption', absorbed: true };
  if (has(aff.resistances)) {
    return {
      applied: Math.round(amount * AFFINITY_FACTORS.resistance),
      detail: 'résistance ×0,5',
      absorbed: false,
    };
  }
  if (has(aff.weaknesses)) {
    return {
      applied: Math.round(amount * AFFINITY_FACTORS.weakness),
      detail: 'faiblesse ×1,5',
      absorbed: false,
    };
  }
  return { applied: Math.round(amount), detail: '', absorbed: false };
}

/**
 * Inflige des dégâts d'un type donné. Retourne le détail du calcul pour le
 * journal ; met la cible hors de combat si ses PV tombent à 0.
 */
function dealDamage(
  enc: Encounter,
  target: Combatant,
  amount: number,
  type: string,
  /**
   * L'armure encaisse-t-elle ce coup ? Faux pour ce qui agit de l'intérieur ou
   * hors de sa portée : effets par tour (un poison ne se pare pas), météo,
   * contre-coup, dégâts proportionnels et ajustements manuels du MJ.
   */
  defended = false,
): { applied: number; raw: number; detail: string } {
  if (amount <= 0) return { applied: 0, raw: 0, detail: 'aucun dégât' };
  const raw = Math.round(amount);
  const outcome = applyAffinity(target, amount, type);
  /** Ce qui a modifié le coup entre le brut et le réel. Rien de plus. */
  const notes: string[] = outcome.detail ? [outcome.detail] : [];

  if (outcome.absorbed) {
    const before = target.hp;
    target.hp = Math.min(target.base.hp, target.hp + outcome.applied);
    return { applied: -(target.hp - before), raw, detail: `${raw} absorbés en soin` };
  }

  // L'affinité joue d'abord (c'est la NATURE des dégâts), puis l'armure absorbe
  // sa part. Un pourcentage, donc : le petit coup et la grosse frappe sont
  // traités pareil, et il en passe toujours quelque chose.
  if (defended) {
    const soak = damageReduction(target, type);
    // `applied > 0` : une immunité a déjà tout annulé, l'armure n'a rien à
    // faire par-dessus — et surtout le plancher ne doit pas la ressusciter.
    if (soak > 0 && outcome.applied > 0) {
      const before = outcome.applied;
      // Plancher d'un point : un coup qui porte fait toujours quelque chose.
      // Sans lui, l'arrondi d'une absorption extrême ramènerait à zéro et
      // l'armure redeviendrait l'annulation totale qu'on cherche à éviter.
      outcome.applied = Math.max(1, Math.round(before * (1 - soak)));
      notes.push(`${reductionLabel(type)} −${Math.round(soak * 100)} %`);
    }
  }

  target.hp = Math.max(0, target.hp - outcome.applied);
  if (target.hp === 0 && !target.down) {
    target.down = true;
    push(enc, 'death', `${target.name} tombe hors de combat.`, { targetId: target.id });
  }

  // Brut → réel, et le motif de l'écart. Quand rien n'a modifié le coup, on ne
  // dit pas deux fois le même nombre.
  const detail = notes.length
    ? `${raw} brut → ${outcome.applied} réels (${notes.join(', ')})`
    : `${outcome.applied} dégâts`;
  return { applied: outcome.applied, raw, detail };
}

/** Soigne une cible, anti-soin des statuts appliqué. Retourne le soin réel. */
function heal(enc: Encounter, target: Combatant, amount: number): { applied: number; detail: string } {
  const reduction = healReduction(target);
  const effective = Math.round(amount * (1 - reduction));
  const before = target.hp;
  target.hp = Math.min(target.base.hp, target.hp + Math.max(0, effective));
  const detail = reduction
    ? `${amount} soin −${Math.round(reduction * 100)} % (anti-soin) = ${effective}`
    : `${effective} soin`;
  // Un combattant à terre remis au-dessus de 0 se relève.
  if (target.down && target.hp > 0) {
    target.down = false;
    push(enc, 'heal', `${target.name} se relève.`, { targetId: target.id });
  }
  return { applied: target.hp - before, detail };
}

/* ── Statuts ───────────────────────────────────────────────────────────────── */

/**
 * Pose un statut sur une cible. Un statut cumulable ajoute une charge et
 * rafraîchit la durée ; un statut non cumulable ne fait que rafraîchir. Un
 * statut purgé par un effet actif (`cleanses`) ne peut pas s'installer.
 */
/** Ce qui accompagne la pose d'un statut, au-delà de qui le pose sur qui. */
export interface StatusOptions {
  /** Durée en tours si elle diffère de celle du catalogue. Négative = illimitée. */
  duration?: number;
  /** Laisse : au-delà, le statut se rompt (cf. `enforceTethers`). */
  tetherMeters?: number;
  /** Écart imposé par un champ d'ancrage, quand il diffère du défaut. */
  gapMeters?: number;
}

export function applyStatus(
  enc: Encounter,
  target: Combatant,
  key: string,
  source: Combatant | undefined,
  opts: StatusOptions = {},
): boolean {
  const { duration, tetherMeters, gapMeters } = opts;
  const def = STATUS_BY_KEY.get(key);
  if (!def) return false;

  const warded = target.effects.some((e) => (e.cleanses ?? []).includes(key));
  if (warded) {
    push(enc, 'status', `${target.name} est prémuni contre « ${def.name} ».`, {
      targetId: target.id,
    });
    return false;
  }

  const turns = duration ?? def.defaultDuration;
  const existing = target.statuses.find((s) => s.key === key);
  if (existing) {
    if (def.stackable) existing.stacks += 1;
    // Une durée illimitée (-1) ne se laisse jamais raccourcir par un rappel.
    existing.remaining = existing.remaining < 0 || turns < 0 ? -1 : Math.max(existing.remaining, turns);
    existing.age = 0;
    // Reposer une marque, c'est la renouer à qui la repose : l'ancrage suit.
    existing.sourceId = source?.id ?? existing.sourceId;
    existing.tetherMeters = tetherMeters;
    existing.gapMeters = gapMeters;
    push(
      enc,
      'status',
      `${target.name} : « ${def.name} » ${def.stackable ? `×${existing.stacks}` : 'renouvelé'}.`,
      { targetId: target.id },
    );
    return true;
  }

  const status: ActiveStatus = {
    key,
    remaining: turns,
    stacks: 1,
    sourceId: source?.id,
    tetherMeters,
    gapMeters,
    sourcePower: {
      atk_phy: source ? effectiveStat(source, 'atk_phy') : 0,
      atk_mag: source ? effectiveStat(source, 'atk_mag') : 0,
    },
    age: 0,
  };
  target.statuses.push(status);
  push(enc, 'status', `${target.name} subit « ${def.name} » (${turns < 0 ? '∞' : turns} tours).`, {
    targetId: target.id,
    details: [def.effect],
  });
  return true;
}

/**
 * Retire la marque que `caster` avait posée sur `target`, et elle seule.
 *
 * Distinct de `clearStatus`, qui retire par clé sans regarder qui l'a posée :
 * faire éclater ses propres marques ne doit pas défaire celles d'un autre
 * lanceur, qui n'a rien demandé.
 */
function consumeMark(enc: Encounter, target: Combatant, key: string, caster: Combatant): void {
  const before = target.statuses.length;
  target.statuses = target.statuses.filter((s) => !(s.key === key && s.sourceId === caster.id));
  if (target.statuses.length === before) return;
  const def = STATUS_BY_KEY.get(key);
  push(enc, 'status', `« ${def?.name ?? key} » se consume sur ${target.name}.`, {
    targetId: target.id,
  });
}

/** Retire un statut par sa clé. */
export function clearStatus(enc: Encounter, target: Combatant, key: string): void {
  const before = target.statuses.length;
  target.statuses = target.statuses.filter((s) => s.key !== key);
  if (target.statuses.length !== before) {
    const def = STATUS_BY_KEY.get(key);
    push(enc, 'status', `${target.name} est libéré de « ${def?.name ?? key} ».`, {
      targetId: target.id,
    });
  }
}

/**
 * Rompt les statuts ancrés dont le porteur s'est trop éloigné de qui les a
 * posés.
 *
 * C'est ce qui rend tenable une marque de durée infinie : elle ne s'use pas
 * avec le temps, mais elle tient à quelqu'un. S'en écarter la casse, tomber
 * aussi — un lanceur à terre ne tient plus rien.
 *
 * Appelée après TOUT ce qui déplace quelqu'un (marche, téléportation, échange)
 * et à l'ouverture de chaque tour : une laisse qui ne se vérifierait qu'au tour
 * du lanceur laisserait ses proies s'échapper entre deux.
 */
function enforceTethers(enc: Encounter): void {
  for (const unit of enc.combatants) {
    for (const status of [...unit.statuses]) {
      const def = STATUS_BY_KEY.get(status.key);
      const leash = status.tetherMeters;
      // Un statut TENU tombe avec celui qui le tient, laisse ou pas : des fils
      // n'obéissent plus à une main qui ne se referme plus.
      const soutenu = !!def?.sustain;
      if (leash === undefined && !soutenu) continue;
      const source = status.sourceId ? findUnit(enc, status.sourceId) : undefined;
      const rompu =
        !source ||
        source.down ||
        (leash !== undefined && unitDistanceMeters(unit, source) > leash + 1e-6);
      if (!rompu) continue;
      unit.statuses = unit.statuses.filter((s) => s !== status);
      push(enc, 'status', `« ${def?.name ?? status.key} » se rompt sur ${unit.name}.`, {
        targetId: unit.id,
        details: [
          source && !source.down
            ? `hors de la portée d’ancrage de ${source.name} (${unitDistanceMeters(unit, source).toFixed(1)} m > ${leash} m)`
            : 'son ancre n’est plus là',
        ],
      });
    }
  }
}

/**
 * Le combattant exécute-t-il ce qu'on lui demande ?
 *
 * Deux lectures opposées du même dé, et c'est `onSuccess` qui tranche :
 * — `act`    : la peur qu'on surmonte. Réussir permet d'agir, échouer coûte le
 *              tour ;
 * — `refuse` : les fils qu'on repousse. L'ordre vient d'un AUTRE, donc c'est la
 *              réussite qui l'annule et l'échec qui obéit.
 *
 * Dans les deux cas, un 20 naturel peut rompre le statut définitivement — la
 * porte de sortie que tout contrôle de durée illimitée doit laisser.
 *
 * Rend `false` quand l'ordre ne doit PAS s'exécuter. Le tour est alors déjà
 * consommé : hésiter ne se rejoue pas.
 */
function obeys(enc: Encounter, actor: Combatant, ordre: string, rng: Rng): boolean {
  // Hésiter coûte le TOUR, pas seulement l'action : garder son action bonus
  // après avoir cédé à la peur en ferait un tour à demi joué.
  const perdLeTour = () => {
    actor.actionUsed = true;
    actor.bonusActionUsed = true;
  };

  for (const status of [...actor.statuses]) {
    const def = STATUS_BY_KEY.get(status.key);
    const save = def?.save;
    if (!save || save.trigger !== 'action') continue;
    if (save.onSuccess !== 'act' && save.onSuccess !== 'refuse') continue;

    const roll = rng.d20();
    const mod = abilityModifier(effectiveAttribute(actor, save.attribute));
    const total = roll + mod + actor.proficiency;
    const ok = total >= save.dc;
    const libere = roll === NATURAL_CRIT && save.onCritical === 'clear';
    const contrainte = save.onSuccess === 'refuse';
    const issue = libere
      ? 'se libère !'
      : contrainte
        ? ok
          ? 'refuse d’obéir'
          : 'obéit'
        : ok
          ? 'réussite'
          : 'échec';
    push(
      enc,
      'save',
      `${actor.name} — ${ordre} : jet de ${save.attribute} contre « ${def!.name} » → ${issue}.`,
      {
        actorId: actor.id,
        details: [
          `d20 ${roll} ${signed(mod)} (mod.) ${signed(actor.proficiency)} (maîtrise) = ${total} vs DD ${save.dc}`,
          save.description,
          libere ? '20 naturel : le lien est brisé définitivement' : '',
        ].filter(Boolean),
      },
    );

    if (libere) {
      clearStatus(enc, actor, status.key);
      // Se libérer est tout ce qu'on fait de son tour quand on était mené.
      if (contrainte) {
        perdLeTour();
        return false;
      }
      continue;
    }
    if (contrainte) {
      if (!ok) continue; // Il obéit : l'ordre s'exécute.
      perdLeTour();
      return false;
    }
    if (!ok) {
      perdLeTour();
      return false;
    }
  }
  return true;
}

/**
 * Prélève l'entretien des sorts que `unit` maintient, et lâche ce qu'il ne peut
 * plus payer.
 *
 * Un sort qu'on garde ouvert doit coûter tant qu'il dure : sans cela, rien
 * n'inciterait jamais à le relâcher, et une réserve de mana pleine au premier
 * tour financerait le reste du combat. Le prix est plus doux que l'incantation
 * — on paie pour tenir, pas pour lancer.
 *
 * À sec, le lien se rompt de lui-même : le lanceur ne choisit pas, il ne peut
 * simplement plus suivre.
 */
function payUpkeep(enc: Encounter, unit: Combatant): void {
  const tenus = sustainedBy(enc, unit).filter((t) => (t.def.sustain?.upkeep ?? 0) > 0);
  if (!tenus.length) return;

  const du = tenus.reduce((total, t) => total + (t.def.sustain!.upkeep ?? 0), 0);
  if (unit.mana >= du) {
    unit.mana -= du;
    push(enc, 'info', `${unit.name} entretient ses sorts : −${du} mana (reste ${unit.mana}).`, {
      actorId: unit.id,
      details: tenus.map((t) => `« ${t.def.name} » sur ${t.bearer.name} : ${t.def.sustain!.upkeep}`),
    });
    return;
  }

  push(enc, 'status', `${unit.name} n’a plus de quoi entretenir ses sorts.`, {
    actorId: unit.id,
    details: [`il faudrait ${du} mana, il en reste ${unit.mana}`],
  });
  for (const { bearer, status, def } of tenus) {
    bearer.statuses = bearer.statuses.filter((s) => s !== status);
    push(enc, 'status', `« ${def.name} » se dissipe sur ${bearer.name}, faute de mana.`, {
      targetId: bearer.id,
    });
  }
}

/**
 * Un coup encaissé peut rompre ce que la victime TENAIT.
 *
 * Seule une attaque le déclenche — pas un poison, pas la grêle : on peut tenir
 * ses fils en saignant, pas en prenant une masse dans les côtes. Le DD monte
 * avec la violence du coup, d'un cran par tranche de cinq points de vie : une
 * égratignure ne coûte presque jamais la concentration, un coup critique
 * presque toujours.
 *
 * L'échec rompt TOUT ce que la victime tenait d'un coup : on ne lâche pas un
 * fil sur deux.
 */
const CONCENTRATION_DAMAGE_STEP = 5;

function breakConcentration(
  enc: Encounter,
  victim: Combatant,
  damage: number,
  rng: Rng,
): void {
  const tenus = sustainedBy(enc, victim).filter((s) => s.def.sustain?.concentrationDc !== undefined);
  if (!tenus.length) return;

  const base = Math.max(...tenus.map((s) => s.def.sustain!.concentrationDc!));
  const dc = base + Math.floor(damage / CONCENTRATION_DAMAGE_STEP);
  const roll = rng.d20();
  const mod = abilityModifier(effectiveAttribute(victim, 'sagesse'));
  const total = roll + mod + victim.proficiency;
  const tient = total >= dc;

  push(
    enc,
    'save',
    `${victim.name} — concentration : ${tient ? 'tient bon' : 'rompue'}.`,
    {
      targetId: victim.id,
      details: [
        `d20 ${roll} ${signed(mod)} (Sagesse) ${signed(victim.proficiency)} (maîtrise) = ${total} vs DD ${dc}`,
        `DD ${base} de base + ${Math.floor(damage / CONCENTRATION_DAMAGE_STEP)} (${damage} dégâts encaissés)`,
      ],
    },
  );
  if (tient) return;

  for (const { bearer, status } of tenus) {
    bearer.statuses = bearer.statuses.filter((s) => s !== status);
    const nom = STATUS_BY_KEY.get(status.key)?.name ?? status.key;
    push(enc, 'status', `${bearer.name} est libéré de « ${nom} » : le lien a lâché.`, {
      targetId: bearer.id,
      details: [`${victim.name} a perdu sa concentration`],
    });
  }
}

/**
 * Dégâts (ou soin) par tour d'un statut. Le scaling est calculé sur la
 * puissance FIGÉE du lanceur : le poison d'un mage mort ne faiblit pas, et un
 * buff obtenu après coup ne ravive pas une vieille brûlure.
 */
function tickAmount(status: ActiveStatus, def: StatusEffect, target: Combatant): number {
  const tick = def.tick;
  if (!tick) return 0;
  let amount = tick.damage ?? 0;

  for (const s of tick.scaling ?? []) {
    const power =
      s.source === 'atk_phy'
        ? status.sourcePower.atk_phy
        : s.source === 'atk_mag'
          ? status.sourcePower.atk_mag
          : 0;
    amount += s.ratio * power;
  }

  if (tick.percentMaxHp !== undefined) {
    const ramp = Array.isArray(tick.percentMaxHp) ? tick.percentMaxHp : [tick.percentMaxHp];
    // Rampe : une valeur par tour, la dernière se répète au-delà du tableau.
    const percent = ramp[Math.min(status.age, ramp.length - 1)];
    amount += (percent / 100) * target.base.hp;
  }

  return Math.round(amount * Math.max(1, status.stacks));
}

/**
 * Déroule les statuts au début du tour d'un combattant : dégâts/soins par tour,
 * jets de sauvegarde périodiques, puis décompte des durées.
 */
function runStatusPhase(enc: Encounter, unit: Combatant, rng: Rng): void {
  for (const status of [...unit.statuses]) {
    const def = STATUS_BY_KEY.get(status.key);
    if (!def) continue;

    // 1) Effet par tour.
    if (def.tick?.heal) {
      const done = heal(enc, unit, def.tick.heal * Math.max(1, status.stacks));
      push(enc, 'heal', `${unit.name} récupère ${done.applied} PV (« ${def.name} »).`, {
        targetId: unit.id,
        details: [done.detail],
      });
    }
    const amount = tickAmount(status, def, unit);
    if (amount > 0) {
      const done = dealDamage(enc, unit, amount, def.damageType ?? 'true');
      push(enc, 'damage', `${unit.name} perd ${done.applied} PV (« ${def.name} »).`, {
        targetId: unit.id,
        details: [
          done.detail,
          status.stacks > 1 ? `${status.stacks} charges cumulées` : '',
        ].filter(Boolean),
      });
    }

    // 2) Jet de sauvegarde périodique.
    const save = def.save;
    if (save && save.trigger === 'turn') {
      const interval = Math.max(1, save.interval ?? 1);
      if (status.age > 0 && status.age % interval === 0) {
        const roll = rng.d20();
        const mod = abilityModifier(effectiveAttribute(unit, save.attribute));
        const total = roll + mod + unit.proficiency;
        const success = total >= save.dc;
        push(
          enc,
          'save',
          `${unit.name} — jet de ${save.attribute} contre « ${def.name} » : ${success ? 'réussite' : 'échec'}.`,
          {
            targetId: unit.id,
            details: [`d20 ${roll} ${signed(mod)} (mod.) ${signed(unit.proficiency)} (maîtrise) = ${total} vs DD ${save.dc}`],
          },
        );
        if ((success && save.onSuccess === 'clear') || (roll === NATURAL_CRIT && save.onCritical === 'clear')) {
          clearStatus(enc, unit, status.key);
          continue;
        }
      }
    }

    // 3) Décompte. Une durée négative est illimitée : seul un jet, un soin ou
    //    le MJ y met fin.
    status.age += 1;
    if (status.remaining > 0) {
      status.remaining -= 1;
      if (status.remaining === 0) {
        unit.statuses = unit.statuses.filter((s) => s !== status);
        push(enc, 'status', `« ${def.name} » se dissipe sur ${unit.name}.`, { targetId: unit.id });
      }
    }
  }

  // Effets temporaires (buffs/malus de sorts) : même décompte.
  for (const effect of [...unit.effects]) {
    effect.remaining -= 1;
    if (effect.remaining <= 0) {
      unit.effects = unit.effects.filter((e) => e !== effect);
      push(enc, 'status', `« ${effect.name} » prend fin sur ${unit.name}.`, { targetId: unit.id });
    }
  }
}

const signed = (value: number): string => (value >= 0 ? `+${value}` : `${value}`);

/* ── Météo ─────────────────────────────────────────────────────────────────── */

/** Applique la météo à tous les combattants debout, au début d'un round. */
function runWeather(enc: Encounter, rng: Rng): void {
  const weather = enc.weather ? WEATHER_BY_KEY.get(enc.weather) : undefined;
  if (!weather) return;

  for (const unit of standing(enc)) {
    for (const key of weather.appliesStatus ?? []) applyStatus(enc, unit, key, undefined);

    const rain = weather.randomDamage;
    if (rain && rng.chance(rain.chance)) {
      const amount = rng.int(rain.min, rain.max);
      const done = dealDamage(enc, unit, amount, rain.type);
      push(enc, 'damage', `${weather.name} frappe ${unit.name} : ${done.applied} PV.`, {
        targetId: unit.id,
        details: [done.detail],
      });
    }
  }
}

/* ── Météo et heure du jour ────────────────────────────────────────────────
   Les deux inclinent le monde de la même façon : elles rendent certains
   domaines plus forts ou moins chers. Leurs facteurs se MULTIPLIENT — une
   tempête de nuit penche deux fois dans le même sens.
─────────────────────────────────────────────────────────────────────────── */

/** Produit des facteurs d'une liste de modificateurs, pour les domaines donnés. */
const factorFor = (
  modifiers: { domain: string; factor: number }[] | undefined,
  domains: string[],
): number =>
  (modifiers ?? [])
    .filter((m) => domains.includes(m.domain))
    .reduce((factor, m) => factor * m.factor, 1);

/** Ambiance courante : la météo et le moment de la journée, s'ils sont posés. */
function ambience(enc: Encounter): { weather?: Weather; daytime?: Daytime } {
  return {
    weather: enc.weather ? WEATHER_BY_KEY.get(enc.weather) : undefined,
    daytime: enc.daytime ? DAYTIME_BY_KEY.get(enc.daytime) : undefined,
  };
}

/** Facteur de coût en mana d'un sort, météo et heure du jour cumulées. */
export function ambienceManaFactor(enc: Encounter, domains: string[] | undefined): number {
  if (!domains?.length) return 1;
  const { weather, daytime } = ambience(enc);
  return factorFor(weather?.costModifiers, domains) * factorFor(daytime?.costModifiers, domains);
}

/** Facteur de dégâts d'un sort, météo et heure du jour cumulées. */
export function ambienceDamageFactor(enc: Encounter, domains: string[] | undefined): number {
  if (!domains?.length) return 1;
  const { weather, daytime } = ambience(enc);
  return factorFor(weather?.damageModifiers, domains) * factorFor(daytime?.damageModifiers, domains);
}

/** Coût en mana d'une capacité une fois l'ambiance appliquée. */
export function effectiveManaCost(enc: Encounter, ability: CombatAbility): number {
  return Math.max(0, Math.round(ability.manaCost * ambienceManaFactor(enc, ability.domains)));
}

export const daytimeByKey = (key: string): Daytime | undefined => DAYTIME_BY_KEY.get(key);

/** Tous les moments de la journée, dans l'ordre du catalogue. */
export const allDaytimes = (): Daytime[] => [...DAYTIME_BY_KEY.values()];

/* ── Hors combat : le temps, la survie, les dépouilles ─────────────────────
   Une séance n'est pas faite que de bagarres. Ce bloc porte tout ce qui se
   passe ENTRE elles — et il passe par le même moteur, donc par le même
   journal : une nuit de marche laisse une trace au même titre qu'un coup
   d'épée.
─────────────────────────────────────────────────────────────────────────── */

/** L'horloge de la rencontre, même sur une partie qui n'en portait pas. */
export const clockOf = (enc: Encounter): EncounterClock => enc.clock ?? startingClock();

/** Phase courante, avec le repli des parties d'avant les phases. */
export const phaseOf = (enc: Encounter): EncounterPhase =>
  enc.phase ?? (enc.started ? 'combat' : 'setup');

/**
 * Réaccorde le moment de la journée sur l'horloge — sauf si le MJ l'a figé.
 *
 * Le verrou existe pour les lieux où l'heure du dehors ne décide de rien : un
 * souterrain reste noir à midi. Sans lui, l'horloge écraserait le réglage du MJ
 * à la première tranche de temps écoulée.
 */
function syncDaytime(enc: Encounter): void {
  if (enc.daytimeLocked) return;
  const key = daytimeAt(clockOf(enc));
  if (enc.daytime === key) return;

  enc.daytime = key;
  const moment = daytimeByKey(key);
  push(enc, 'time', moment ? `${moment.name}.` : `Le jour tourne.`, {
    details: moment ? [moment.description] : undefined,
  });
}

/** Combattants dont on tient les jauges : ceux qui viennent d'une fiche. */
const living = (enc: Encounter): Combatant[] => enc.combatants.filter((c) => !!c.survival);

/**
 * Fait passer le temps sur la rencontre entière.
 *
 * `silent` sert aux six secondes d'un round : le journal dirait « 6 s se
 * passent » à chaque tour de table, ce qui noierait le compte rendu. Les crans
 * de jauge perdus, eux, sont TOUJOURS annoncés — c'est précisément ce qu'on ne
 * doit pas rater.
 */
function passTime(
  enc: Encounter,
  seconds: number,
  activityKey: string,
  options: { silent?: boolean; note?: string } = {},
): void {
  const elapsed = Math.max(0, Math.round(seconds));
  const activity = activityByKey(activityKey) ?? activityByKey(DEFAULT_ACTIVITY)!;

  enc.clock = advanceClock(clockOf(enc), elapsed);

  if (!options.silent && elapsed > 0) {
    push(
      enc,
      'time',
      `${formatDuration(elapsed)} — ${activity.label.toLowerCase()}. ${formatClock(clockOf(enc))}.`,
      { details: options.note ? [options.note, activity.description] : [activity.description] },
    );
  }

  for (const unit of living(enc)) {
    // Un corps à terre ne mange pas, ne boit pas et ne se repose pas : ses
    // jauges se figent le temps qu'on le relève. Les faire courir pendant qu'il
    // saigne au sol reviendrait à le punir deux fois.
    if (unit.down) continue;
    applyDrain(enc, unit, elapsed, activity.key);
  }

  syncDaytime(enc);
}

/** Use les jauges d'un combattant et annonce les crans perdus ou regagnés. */
function applyDrain(enc: Encounter, unit: Combatant, seconds: number, activityKey: string): void {
  const activity = activityByKey(activityKey) ?? activityByKey(DEFAULT_ACTIVITY)!;
  const before = unit.survival!;
  const after = drain(before, seconds, activity);
  unit.survival = after;

  for (const gauge of SURVIVAL_GAUGES) {
    const was = notchesLeft(gauge.key, before);
    const now = notchesLeft(gauge.key, after);
    if (was === now) continue;

    const worse = now < was;
    push(
      enc,
      'survival',
      `${unit.name} — ${gauge.label.toLowerCase()} : ${stageOf(gauge.key, after)} (${now}/${gauge.segments}).`,
      {
        actorId: unit.id,
        details: describePenalty(unit, gauge.key, worse),
      },
    );
  }
}

/** Ce que le nouveau palier coûte, en toutes lettres, quand il coûte quelque chose. */
function describePenalty(unit: Combatant, key: SurvivalKey, worse: boolean): string[] | undefined {
  const mods = survivalMods(unit.survival).filter((m) =>
    (SURVIVAL_PENALTY_STATS[key] ?? []).includes(m.stat),
  );
  if (!worse || !mods.length) return undefined;
  return [mods.map((m) => `${statLabel(m.stat)} ${signed(m.value)}`).join(', ')];
}

/**
 * Stats touchées par chaque jauge, pour n'attribuer au bon besoin que SES
 * malus dans le journal. Sans ce filtre, perdre un cran de faim afficherait
 * aussi la pénalité de soif déjà en cours, et l'on croirait que manger la
 * lèverait.
 */
const SURVIVAL_PENALTY_STATS: Record<SurvivalKey, StatKey[]> = {
  hunger: ['atk_phy', 'atk_mag', 'endurance'],
  thirst: ['def_phy', 'def_mag', 'endurance', 'speed'],
  rest: ['speed', 'atk_phy', 'atk_mag', 'endurance'],
};

/** Nom lisible d'une stat, repris du catalogue de la fiche. */
const statLabel = (key: StatKey): string => STATS.find((s) => s.key === key)?.label ?? key;

/** Comble une jauge et l'annonce. Rend `true` si quelque chose a bougé. */
function fillGauge(
  enc: Encounter,
  unit: Combatant,
  gauge: SurvivalKey,
  notches: number,
  source: string,
): boolean {
  if (!unit.survival) return false;
  const def = gaugeOf(gauge);
  const before = notchesLeft(gauge, unit.survival);
  unit.survival = restoreGauge(unit.survival, gauge, notches);
  const after = notchesLeft(gauge, unit.survival);
  if (after === before) return false;

  push(
    enc,
    'survival',
    `${unit.name} — ${source} : ${def.label.toLowerCase()} ${stageOf(gauge, unit.survival)} (${after}/${def.segments}).`,
    { actorId: unit.id },
  );
  return true;
}

/**
 * Sort une ligne nourrissante du sac et la fait agir.
 *
 * **Le sac se vide pour de vrai.** Une ration mangée disparaît ; une outre bue
 * ne disparaît pas mais devient une outre VIDE, qui se voit dans le sac et se
 * remplit à la prochaine source. Sans ce passage par l'inventaire, boire et
 * manger seraient gratuits, et tenir des jauges n'aurait aucun sens.
 */
function consumeFood(enc: Encounter, unit: Combatant, line: CarriedItem): void {
  const food = nourishmentOf(line);
  if (!food) return;
  if (line.qty <= 0) {
    push(enc, 'info', `${unit.name} n’a plus de ${line.name}.`, { actorId: unit.id });
    return;
  }

  const nom = line.name;
  line.qty -= 1;
  if (line.qty <= 0) unit.inventory.splice(unit.inventory.indexOf(line), 1);

  // Ce que la ligne laisse derrière elle (l'outre vidée), le cas échéant.
  if (food.becomes) {
    const reste = unit.inventory.find((i) => i.name === food.becomes);
    if (reste) reste.qty += 1;
    else unit.inventory.push({ name: food.becomes, qty: 1, kind: 'other' });
  }

  const changed = fillGauge(enc, unit, food.gauge, food.notches, nom);
  if (!changed) {
    push(enc, 'survival', `${unit.name} entame ${nom} sans en avoir besoin.`, { actorId: unit.id });
  }
  if (food.note) push(enc, 'info', `${unit.name} — ${food.note}`, { actorId: unit.id });
}

/* ── Le décor qu'on manipule ───────────────────────────────────────────────
   Une porte n'est pas un mur : elle s'ouvre, se verrouille, se crochète et
   s'enfonce. Les jets passent par le même d20 que le reste du jeu et par le
   même `Rng` — donc une partie rechargée rejoue la même serrure.
─────────────────────────────────────────────────────────────────────────── */

/** Décor tel qu'il est à cet instant, portes résolues, pour ce combattant-là. */
export const terrainFor = (enc: Encounter, mover?: Combatant): TerrainMap => ({
  // Les murs conjurés entrent ICI, dans le seul entonnoir par lequel le décor
  // passe. Déplacement, calcul de chemin et ligne de vue les respectent alors
  // sans qu'aucun de ces trois systèmes n'ait à savoir qu'ils existent.
  ...effectiveTerrain(enc.terrain, enc.features, mover),
  ...wallTerrain(enc),
});

/**
 * Marcher hors combat.
 *
 * **Le hors-combat n'est pas du combat au ralenti, et ce n'est pas non plus le
 * montage.** Il a sa règle propre :
 *
 * - pas de budget en mètres, pas d'endurance dépensée, pas d'attaque
 *   d'opportunité — personne ne se bat, traverser le camp ne se compte pas ;
 * - mais **le décor s'applique intégralement**. Un mur reste un mur, une porte
 *   fermée reste fermée, l'eau profonde arrête qui ne sait pas nager, et l'on
 *   ne marche pas à travers quelqu'un.
 *
 * C'est exactement ce qui manquait : le camp empruntait le placement LIBRE du
 * montage — où l'on pose un pion où l'on veut, parce qu'on dessine la scène —
 * et les personnages traversaient les murs.
 */
function walkTo(enc: Encounter, unit: Combatant, to: GridPos): void {
  if (unit.down) {
    push(enc, 'info', `${unit.name} est à terre — il ne se déplace pas seul.`, { actorId: unit.id });
    return;
  }
  if (samePos(unit.pos, to)) return;

  // Budget infini : ce qui compte n'est pas la distance mais l'EXISTENCE d'un
  // chemin. On réutilise le même calcul qu'en combat, donc les mêmes murs.
  const reach = reachableCells(unit, Infinity, enc.grid, terrainFor(enc, unit), enc.combatants);
  const arrivee = reach.get(cellKey(to));
  if (!arrivee) {
    push(enc, 'info', `${unit.name} ne peut pas atteindre cette case — le chemin est barré.`, {
      actorId: unit.id,
    });
    return;
  }

  unit.pos = { ...to };
  push(enc, 'move', `${unit.name} rejoint (${to.x}, ${to.y}).`, {
    actorId: unit.id,
    details: [`${arrivee.cost.toFixed(1)} m parcourus — hors combat, ils ne coûtent rien`],
  });
}

/** Compétence qui crochète une serrure, et celle qui enfonce un battant. */
export const LOCKPICK_SKILL = 'sleight-of-hand';
export const FORCE_SKILL = 'athletism';

/** Outil exigé pour crocheter : sans lui, on ne fait que gratter le bois. */
export const LOCKPICK_TOOL = 'Outils de crocheteur';

/** Distance à laquelle on peut poser la main sur un élément du décor. */
export const REACH_METERS = CELL_METERS;

/** L'acteur est-il assez près de la case pour la manipuler ? */
function withinReach(actor: Combatant, cell: string): boolean {
  const [x, y] = cell.split(',').map(Number);
  return occupiedCells(actor).some(
    (own) => Math.max(Math.abs(own.x - x), Math.abs(own.y - y)) <= 1,
  );
}

/** État d'une porte sur cette case, créé à la volée si le décor en porte une. */
function doorAt(enc: Encounter, cell: string): DoorState | undefined {
  if (!terrainKind(enc.terrain[cell])?.operable) return undefined;
  const features = (enc.features ??= {});
  return (features[cell] ??= newDoor());
}

/** Joue une action sur une porte, jet compris. */
function resolveDoor(
  enc: Encounter,
  cell: string,
  act: 'open' | 'close' | 'pick' | 'break' | 'lock' | 'unlock',
  actor: Combatant | undefined,
  rng: Rng,
): void {
  const door = doorAt(enc, cell);
  if (!door) {
    push(enc, 'info', 'Il n’y a rien à manipuler sur cette case.');
    return;
  }

  // Le MJ règle l'état sans jet ni distance : c'est lui qui pose la scène.
  if (act === 'lock' || act === 'unlock') {
    if (door.broken) {
      push(enc, 'info', 'Cette porte est enfoncée — plus rien à verrouiller.');
      return;
    }
    door.locked = act === 'lock';
    if (door.locked) door.open = false;
    push(enc, 'info', door.locked ? 'La porte est verrouillée.' : 'La porte est déverrouillée.');
    return;
  }

  if (!actor) {
    push(enc, 'info', 'Personne pour agir sur la porte.');
    return;
  }
  if (!withinReach(actor, cell)) {
    push(enc, 'info', `${actor.name} est trop loin de la porte.`, { actorId: actor.id });
    return;
  }

  switch (act) {
    case 'open':
      if (door.locked) {
        push(enc, 'info', `${actor.name} pousse la porte : elle est verrouillée.`, {
          actorId: actor.id,
        });
        return;
      }
      door.open = true;
      push(enc, 'info', `${actor.name} ouvre la porte.`, { actorId: actor.id });
      return;

    case 'close':
      if (door.broken) {
        push(enc, 'info', 'La porte est enfoncée : elle ne se referme plus.');
        return;
      }
      door.open = false;
      push(enc, 'info', `${actor.name} referme la porte.`, { actorId: actor.id });
      return;

    case 'pick': {
      if (!door.locked) {
        push(enc, 'info', 'Cette porte n’est pas verrouillée.', { actorId: actor.id });
        return;
      }
      // Sans outils, on gratte le bois. L'exiger est ce qui donne sa valeur à
      // une ligne d'inventaire qui ne servait à rien jusqu'ici.
      if (carriedQty(actor, LOCKPICK_TOOL) <= 0) {
        push(enc, 'info', `${actor.name} n’a pas d’${LOCKPICK_TOOL.toLowerCase()}.`, {
          actorId: actor.id,
        });
        return;
      }
      const bonus = Math.round(actor.skills?.[LOCKPICK_SKILL] ?? 0);
      const roll = rng.d20();
      const reussi = roll + bonus >= door.lockDc;
      if (reussi) door.locked = false;
      push(enc, reussi ? 'save' : 'info', reussi
        ? `${actor.name} crochète la serrure.`
        : `${actor.name} peine sur la serrure — elle tient.`, {
        actorId: actor.id,
        details: [`d20 : ${roll} ${signed(bonus)} (Escamotage) = ${roll + bonus} contre ${door.lockDc}`],
      });
      return;
    }

    case 'break': {
      const bonus = Math.round(actor.skills?.[FORCE_SKILL] ?? abilityModifier(effectiveAttribute(actor, 'force')));
      const roll = rng.d20();
      const reussi = roll + bonus >= door.breakDc;
      if (reussi) {
        door.broken = true;
        door.open = true;
        door.locked = false;
      }
      push(enc, reussi ? 'save' : 'info', reussi
        ? `${actor.name} enfonce la porte.`
        : `${actor.name} s’élance : le battant tient bon.`, {
        actorId: actor.id,
        details: [`d20 : ${roll} ${signed(bonus)} (Athlétisme) = ${roll + bonus} contre ${door.breakDc}`],
      });
      return;
    }
  }
}

/**
 * Range une quantité dans un sac, en empilant sur la ligne de même nom. Rend ce
 * qui a réellement été rangé.
 */
function stow(unit: Combatant, item: string, qty: number): number {
  const nombre = Math.max(1, Math.round(qty));
  const line = unit.inventory.find((i) => i.name === item);
  if (line) line.qty += nombre;
  else {
    // Le slug relie la ligne à sa fiche wiki : sans lui, le sac afficherait un
    // nom sans page, et le report sur la fiche perdrait son poids.
    const food = nourishmentOf({ name: item });
    unit.inventory.push({ name: item, qty: nombre, slug: food?.slug, kind: 'other' });
  }
  return nombre;
}

/* ── Fouiller les corps ─────────────────────────────────────────────────── */

/**
 * Jette la table de butin d'une dépouille, une seule fois.
 *
 * Un corps encore debout ne se fouille pas : c'est ce qui empêche de vider les
 * poches d'un adversaire au milieu du combat. Le sac de la victime rejoint la
 * pile en plus de ce que sa table rend — un bandit tombé laisse ses flèches et
 * ses potions, et son espèce n'en dira jamais rien.
 */
function searchBody(enc: Encounter, target: Combatant, actor: Combatant | undefined, rng: Rng): void {
  if (!target.down) {
    push(enc, 'info', `${target.name} tient encore debout : on ne le fouille pas.`, {
      targetId: target.id,
    });
    return;
  }
  if (target.searched) {
    push(enc, 'loot', `${target.name} a déjà été fouillé.`, { targetId: target.id });
    return;
  }

  const pile: LootItem[] = rollDrops(target.lootTable, rng);
  for (const carried of carriedAsLoot(target.inventory)) addLoot(pile, carried);
  target.inventory = [];

  const gold = Math.max(0, Math.round(target.purse ?? 0));
  target.purse = 0;

  target.loot = pile;
  target.lootGold = gold;
  target.searched = true;

  const lines = [
    ...pile.map((l) => `${l.name} ×${l.qty}`),
    ...(gold > 0 ? [`${gold} pièces d'or`] : []),
  ];
  push(
    enc,
    'loot',
    lines.length
      ? `${actor ? `${actor.name} fouille ` : 'On fouille '}${target.name} : ${lines.length} trouvaille${lines.length > 1 ? 's' : ''}.`
      : `${actor ? `${actor.name} fouille ` : 'On fouille '}${target.name} — rien à prendre.`,
    { actorId: actor?.id, targetId: target.id, details: lines.length ? lines : undefined },
  );
}

/** Transfère une ligne (ou tout) d'une dépouille vers le sac d'un vivant. */
function takeFrom(
  enc: Encounter,
  target: Combatant,
  actor: Combatant,
  item: string | undefined,
  qty: number | undefined,
): void {
  if (!target.searched) {
    push(enc, 'info', `${target.name} n’a pas encore été fouillé.`, { targetId: target.id });
    return;
  }

  const pile = (target.loot ??= []);
  const taken: string[] = [];

  if (item === undefined) {
    // Tout rafler : on copie la pile avant de la vider, sinon on itère sur ce
    // qu'on est en train de retirer.
    for (const line of [...pile]) {
      const moved = take(pile, line.name, line.qty);
      if (moved <= 0) continue;
      pour(actor.inventory, { ...line, qty: moved });
      taken.push(`${line.name} ×${moved}`);
    }
    const gold = Math.max(0, Math.round(target.lootGold ?? 0));
    if (gold > 0) {
      actor.purse = Math.max(0, Math.round(actor.purse ?? 0)) + gold;
      target.lootGold = 0;
      taken.push(`${gold} pièces d'or`);
    }
  } else {
    const line = pile.find((l) => l.name === item);
    const moved = take(pile, item, qty ?? line?.qty ?? 0);
    if (moved > 0 && line) {
      pour(actor.inventory, { ...line, qty: moved });
      taken.push(`${line.name} ×${moved}`);
    }
  }

  if (!taken.length) {
    push(enc, 'loot', `Rien à prendre sur ${target.name}.`, { actorId: actor.id, targetId: target.id });
    return;
  }
  push(enc, 'loot', `${actor.name} ramasse ${taken.join(', ')} sur ${target.name}.`, {
    actorId: actor.id,
    targetId: target.id,
  });
}

/* ── Endurance ─────────────────────────────────────────────────────────────── */

/**
 * Endurance récupérée au début de chaque tour : `3 + mod. de Constitution`,
 * jamais moins de 2. Le plancher est ce qui garantit qu'un personnage à la
 * Constitution basse souffle quand même — sans lui, un mage frêle finirait
 * définitivement incapable de porter le moindre coup d'arme.
 */
export function enduranceRecovery(unit: Combatant): number {
  const modifier = abilityModifier(effectiveAttribute(unit, 'constitution'));
  return Math.max(ENDURANCE_RECOVERY_FLOOR, ENDURANCE_RECOVERY_BASE + modifier);
}

/** Applique la récupération d'endurance du tour, plafonnée à la réserve max. */
function recoverEndurance(enc: Encounter, unit: Combatant): void {
  const max = effectiveStat(unit, 'endurance');
  if (unit.endurance >= max) return;

  const gain = enduranceRecovery(unit);
  const before = unit.endurance;
  unit.endurance = Math.min(max, unit.endurance + gain);
  updateWinded(enc, unit);
  const actual = unit.endurance - before;
  if (actual <= 0) return;

  const modifier = abilityModifier(effectiveAttribute(unit, 'constitution'));
  push(enc, 'info', `${unit.name} récupère ${actual} d'endurance (${unit.endurance}/${max}).`, {
    actorId: unit.id,
    details: [
      `${ENDURANCE_RECOVERY_BASE} de base ${signed(modifier)} (mod. Constitution)` +
        (ENDURANCE_RECOVERY_BASE + modifier < ENDURANCE_RECOVERY_FLOOR
          ? ` → plancher ${ENDURANCE_RECOVERY_FLOOR}`
          : ` = ${gain}`),
    ],
  });
}

/* ── Tours ─────────────────────────────────────────────────────────────────── */

/**
 * Ouvre le tour d'un combattant : ressources de tour remises à neuf, puis
 * phase de statuts. Un combattant à terre est sauté.
 */
function beginTurn(enc: Encounter, rng: Rng): void {
  const unit = currentUnit(enc);
  if (!unit) return;

  if (unit.down) {
    push(enc, 'turn', `${unit.name} est hors de combat — tour sauté.`, { actorId: unit.id });
    return;
  }

  unit.moved = 0;
  unit.actionUsed = false;
  unit.bonusActionUsed = false;
  unit.reactionUsed = false;
  push(enc, 'turn', `Tour de ${unit.name} (round ${enc.round}).`, { actorId: unit.id });

  // Qui mène ce tour ne va pas de soi quand ce n'est plus le combattant
  // lui-même : on le dit, sinon le MJ joue un pantin sans savoir qu'il en est un.
  const maitre = controllerOf(enc, unit);
  if (maitre) {
    push(enc, 'info', `${unit.name} est aux mains de ${maitre.name} : c’est lui qui décide.`, {
      actorId: unit.id,
      details: [
        `Chaque ordre appelle un jet de sagesse — une réussite le fait échouer, un 20 naturel rompt les fils.`,
      ],
    });
  }

  recoverEndurance(enc, unit);
  runStatusPhase(enc, unit, rng);
  // Ce qu'on tient se paie à l'ouverture de son tour, avant d'agir : un sort
  // maintenu doit coûter tant qu'il dure.
  payUpkeep(enc, unit);
  // Un ancrage se vérifie aussi à l'ouverture d'un tour : une ancre tombée
  // pendant le round doit lâcher ses marques, même si personne n'a bougé.
  enforceTethers(enc);
  enforceAnchorGap(enc);
}

/**
 * Passe au combattant suivant, en enjambant ceux qui sont à terre. Boucler sur
 * l'ordre incrémente le round et redéclenche la météo.
 */
function advance(enc: Encounter, rng: Rng): void {
  if (!enc.order.length) return;
  const total = enc.order.length;

  for (let step = 0; step < total; step++) {
    enc.turnIndex += 1;
    if (enc.turnIndex >= total) {
      enc.turnIndex = 0;
      enc.round += 1;
      push(enc, 'turn', `— Round ${enc.round} —`);
      // Ce qui a été tiré du néant ne tient pas tout seul.
      for (const tombe of ageWalls(enc)) {
        push(enc, 'info', `${tombe.name} se décompose et s’effondre.`);
      }
      // Six secondes de plus au compteur. Un combat ne déplace pas l'aiguille
      // de beaucoup, mais il assèche : `COMBAT_ACTIVITY` use la soif trois fois
      // plus vite que la marche, et vingt rounds finissent par se voir.
      passTime(enc, ROUND_SECONDS, COMBAT_ACTIVITY, { silent: true });
      runWeather(enc, rng);
    }
    const next = findUnit(enc, enc.order[enc.turnIndex]);
    if (next && !next.down) {
      beginTurn(enc, rng);
      return;
    }
  }
  // Personne ne peut plus jouer : le combat est terminé, on ne boucle pas.
  push(enc, 'info', 'Plus aucun combattant en état d’agir.');
}

/**
 * Lance le combat : établit l'ordre du tour et ouvre le premier.
 *
 * **C'est la Vitesse qui décide de l'ordre**, pas un jet de dés : le plus rapide
 * agit le premier, et une bête véloce garde son avantage d'un round à l'autre
 * plutôt que de le perdre sur un mauvais d20. L'ordre est donc entièrement
 * déterministe — les ex æquo se départagent sur la Dextérité puis sur le nom,
 * jamais au hasard, pour qu'une reprise de partie sauvegardée retrouve
 * exactement la même file.
 */
function start(enc: Encounter, rng: Rng): void {
  // Une séance n'a pas UN combat, elle en a plusieurs. On repart donc aussi
  // depuis le camp : le groupe voyage, rencontre, se bat, repart. Refuser le
  // second combat ferait du hors-combat une fin de partie déguisée — alors
  // qu'il est l'état ordinaire d'une séance.
  const reprise = enc.started && phaseOf(enc) === 'exploration';
  if (enc.started && !reprise) return;
  if (reprise) push(enc, 'info', '— Nouvelle empoignade —');

  for (const unit of enc.combatants) {
    unit.initiative = effectiveStat(unit, 'speed');
    unit.moved = 0;
    unit.actionUsed = false;
    unit.bonusActionUsed = false;
    unit.reactionUsed = false;
  }

  enc.order = [...enc.combatants]
    .sort(
      (a, b) =>
        b.initiative - a.initiative ||
        effectiveAttribute(b, 'dexterite') - effectiveAttribute(a, 'dexterite') ||
        a.name.localeCompare(b.name),
    )
    .map((c) => c.id);

  enc.started = true;
  enc.phase = 'combat';
  enc.round = 1;
  enc.turnIndex = 0;

  push(enc, 'info', 'Le combat commence — ordre du tour établi sur la Vitesse.', {
    details: enc.order.map((id) => {
      const unit = findUnit(enc, id)!;
      return `${unit.name} : vitesse ${unit.initiative}`;
    }),
  });
  runWeather(enc, rng);
  beginTurn(enc, rng);
}

/* ── Déplacement ───────────────────────────────────────────────────────────── */

function resolveMove(enc: Encounter, actorId: string, to: GridPos, rng: Rng): void {
  const unit = findUnit(enc, actorId);
  if (!unit) return;

  // Quitter une allonge se paie : on ouvre la fenêtre AVANT de bouger, sinon
  // l'attaque d'opportunité frapperait quelqu'un déjà parti.
  const asked = enc.suspended?.asked ?? [];
  const window = opportunityWindow(enc, unit, to, asked);
  if (window) {
    suspendFor(enc, window, { type: 'move', actorId, to }, asked);
    return;
  }
  enc.suspended = undefined;

  const blocker = blockedBy(unit, 'preventsMovement');
  if (blocker) {
    push(enc, 'info', `${unit.name} ne peut pas bouger (« ${blocker.name} »).`, {
      actorId: unit.id,
    });
    return;
  }

  const ancre = anchorBlocker(enc, unit, to);
  if (ancre) {
    push(enc, 'info', `L’ancrage retient ${unit.name} : il ne peut pas se rapprocher de ${ancre.name}.`, {
      actorId: unit.id,
      details: [`${unitDistanceMeters(unit, ancre).toFixed(1)} m les séparent, et cet écart ne peut plus décroître`],
    });
    return;
  }

  // Marcher est un ordre comme un autre pour qui n'est plus à soi-même. Le jet
  // ne se tente qu'au PREMIER pas du tour : sans quoi il suffirait de recliquer
  // jusqu'à ce que le pantin cède, et le refus ne coûterait rien.
  if (!unit.moved && !obeys(enc, unit, 'ordre de se déplacer', rng)) {
    unit.moved = movementBudget(unit);
    return;
  }

  const budget = affordableMovement(unit);
  const reach = reachableCells(unit, budget, enc.grid, terrainFor(enc, unit), enc.combatants);
  const destination = reach.get(`${to.x},${to.y}`);
  if (!destination) {
    const souffle = movementBudget(unit) - unit.moved > budget ? ' (souffle insuffisant)' : '';
    push(enc, 'info', `${unit.name} ne peut pas atteindre cette case${souffle}.`, {
      actorId: unit.id,
    });
    return;
  }

  const from = unit.pos;
  // Le trajet effectivement suivi, relevé AVANT le déplacement : c'est lui que
  // la vue fera parcourir au pion. Ne l'écrit que la marche — un saut n'a pas
  // de route, et c'est ainsi que l'on distingue les deux sans les nommer.
  enc.walked = { unitId: unit.id, path: pathTo(reach, to) };
  // Le péage se lit sur le CUMUL : trois petits bonds coûtent ce que coûte le
  // trajet d'un trait, pas moins.
  const toll = movementToll(unit.moved + destination.cost) - movementToll(unit.moved);
  unit.pos = { ...to };
  unit.moved += destination.cost;
  if (toll > 0) {
    unit.endurance = Math.max(0, unit.endurance - toll);
    updateWinded(enc, unit);
  }

  // Le saignement double ses dégâts quand la cible se déplace : c'est écrit sur
  // le statut, le moteur l'honore ici plutôt qu'en phase de tour.
  const bleeding = unit.statuses.find((s) => s.key === 'saignement');
  push(
    enc,
    'move',
    `${unit.name} se déplace de ${destination.cost.toFixed(1)} m.`,
    {
      actorId: unit.id,
      details: [
        `(${from.x}, ${from.y}) → (${to.x}, ${to.y})`,
        toll > 0 ? `−${toll} endurance (reste ${unit.endurance})` : 'dans le pas gratuit',
        `${(budget - destination.cost).toFixed(1)} m restants ce tour`,
      ],
    },
  );

  if (bleeding) {
    const def = STATUS_BY_KEY.get('saignement');
    const extra = tickAmount(bleeding, def!, unit);
    const done = dealDamage(enc, unit, extra, def?.damageType ?? 'physique');
    push(enc, 'damage', `Le mouvement rouvre la plaie : ${done.applied} PV.`, {
      targetId: unit.id,
      details: [done.detail],
    });
  }

  // S'éloigner casse ce qui tenait à distance : c'est ici qu'une marque lâche.
  enforceTethers(enc);
}

/* ── Utilisation d'une capacité ────────────────────────────────────────────── */

/**
 * Part des dégâts qu'une cible absorbe pour un type donné (0 à 1, jamais 1).
 *
 * **La défense ne décide pas si l'attaque touche : elle réduit ce qui passe.**
 * Des dégâts physiques butent sur `def_phy`, des dégâts magiques sur `def_mag`,
 * et des dégâts absolus (`true`) ne butent sur rien.
 */
export function damageReduction(target: Combatant, type: string | undefined): number {
  const general = generalOf(type);
  if (general === 'true') return 0;
  const key: StatKey = general === 'physical' ? 'def_phy' : 'def_mag';
  const defense = effectiveStat(target, key);
  return defense / (defense + DEFENSE_SOAK_SCALE);
}

/** Défense brute opposée à un type de dégâts (pour l'affichage). */
export function defenseAgainst(target: Combatant, type: string | undefined): number {
  const general = generalOf(type);
  if (general === 'true') return 0;
  return effectiveStat(target, general === 'physical' ? 'def_phy' : 'def_mag');
}

/** Libellé de la défense opposée à un type de dégâts, pour le journal. */
function reductionLabel(type: string | undefined): string {
  return generalOf(type) === 'physical' ? 'armure' : 'rés. magique';
}

/**
 * Ce qui empêche une capacité d'être employée, **sans regarder où elle vise**.
 *
 * Séparé du reste parce qu'une réaction partage exactement ces conditions-là et
 * aucune des autres : elle se joue hors de son tour, donc l'action déjà
 * dépensée ne la concerne pas, et sa case n'est pas encore choisie au moment où
 * l'on demande au joueur s'il veut réagir.
 */
/** Identifiant de la capacité fabriquée depuis la main faible de la fiche. */
const OFFHAND_ABILITY_ID = 'weapon:offhand';

/**
 * L'arme de main principale du combattant, **si elle se tient à deux mains**.
 * `undefined` dès qu'il reste une main libre — c'est le cas ordinaire.
 */
const mainHandWeapon = (unit: Combatant): CombatAbility | undefined =>
  unit.abilities.find((a) => a.id === 'weapon:weapon' && a.twoHanded);

function cannotAfford(
  enc: Encounter,
  unit: Combatant,
  ability: CombatAbility,
  mana: number,
): string | null {
  if (unit.down) return `${unit.name} est hors de combat.`;

  const stunned = blockedBy(unit, 'preventsAction');
  if (stunned) return `${unit.name} ne peut pas agir (« ${stunned.name} »).`;

  const occupees = handsBound(enc, unit);
  if (occupees >= CASTER_HANDS) {
    return `${unit.name} a les deux mains prises : il ne peut plus que se déplacer.`;
  }
  // Une seule main libre : la main faible ne sert plus. On reconnaît l'arme
  // secondaire à son emplacement, pas à sa nature — c'est la MAIN qui manque.
  if (occupees > 0 && ability.id === OFFHAND_ABILITY_ID) {
    return `${unit.name} n’a plus sa main faible : elle tient ses fils.`;
  }
  // Deux mains sur le manche, rien pour la main faible. La fiche l'interdit
  // déjà à l'équipement ; on le revérifie ici parce qu'une rencontre se
  // retouche à la main et qu'une claymore ne doit jamais s'accompagner d'une
  // dague — ni sur le papier, ni sur le plateau.
  if (ability.id === OFFHAND_ABILITY_ID) {
    const deuxMains = mainHandWeapon(unit);
    if (deuxMains) {
      return `${unit.name} tient ${deuxMains.name} à deux mains : pas de main faible.`;
    }
  }
  if (ability.kind === 'spell') {
    const silenced = blockedBy(unit, 'preventsCasting');
    if (silenced) return `${unit.name} ne peut pas lancer de sort (« ${silenced.name} »).`;
  }

  // On lit la réserve COURANTE, pas le maximum : le mana se dépense en combat.
  if (unit.mana < mana) return `Mana insuffisant (${unit.mana}/${mana}).`;
  if (unit.endurance < ability.enduranceCost)
    return `Endurance insuffisante (${unit.endurance}/${ability.enduranceCost}).`;

  const consumed = ability.consumes;
  if (consumed) {
    const carried = carriedQty(unit, consumed.item);
    if (carried < consumed.qty) {
      return `Plus de ${consumed.item.toLowerCase()} (${carried}/${consumed.qty}).`;
    }
  }
  return null;
}

/**
 * Ce qui empêche d'employer cette capacité **en réaction**, ou `null`.
 *
 * La réaction a sa propre monnaie : une par round, rechargée au début de son
 * tour. L'action du tour, elle, ne la concerne pas — c'est tout l'intérêt de
 * réagir. Confondre les deux revenait à ne jamais pouvoir riposter à qui se
 * désengage, puisqu'on a presque toujours déjà agi quand vient le tour d'un
 * autre.
 *
 * La position n'est pas testée ici : le joueur n'a pas encore désigné sa case,
 * et une téléportation défensive vise justement ailleurs que l'assaillant.
 * `resolveUse` la validera au moment de l'engagement.
 */
export function cannotReact(
  enc: Encounter,
  unit: Combatant,
  ability: CombatAbility,
): string | null {
  if (unit.reactionUsed) return 'Réaction déjà utilisée ce round.';
  // Le coût d'ambiance n'est pas connu sans la rencontre ; on prend le prix
  // affiché, quitte à être un rien sévère sur un sort que la nuit remise.
  return cannotAfford(enc, unit, ability, ability.manaCost);
}

/**
 * Ce qui manque de MAINS pour poser ce que cette capacité veut tenir.
 *
 * Le plafond ne s'écrit nulle part : il tombe de l'anatomie. Deux mains, un
 * pantin par main, donc deux pantins — et pas trois, quelle que soit la fiche.
 */
function handsNeeded(enc: Encounter, unit: Combatant, ability: CombatAbility): string | null {
  let besoin = 0;
  for (const inflict of ability.inflicts ?? []) {
    besoin += STATUS_BY_KEY.get(inflict.status)?.sustain?.bindsHands ?? 0;
  }
  if (!besoin) return null;
  const libres = CASTER_HANDS - handsBound(enc, unit);
  if (besoin <= libres) return null;
  return libres
    ? `${unit.name} n’a plus qu’une main libre : pas de quoi tenir cela.`
    : `${unit.name} a déjà les deux mains prises.`;
}

/**
 * Le créneau du tour qu'une capacité dépense, et l'état qui dit s'il est libre.
 *
 * Deux créneaux étanches : l'action, et l'action bonus que se réservent l'arme
 * secondaire et les objets. Les rendre interchangeables reviendrait à donner
 * deux actions par tour à qui porte une dague en main gauche.
 */
function slotSpent(unit: Combatant, ability: CombatAbility): string | null {
  if (ability.bonusAction) {
    return unit.bonusActionUsed ? 'Action bonus déjà utilisée ce tour.' : null;
  }
  return unit.actionUsed ? 'Action déjà utilisée ce tour.' : null;
}

/** Ce qui empêche une capacité d'être lancée, ou `null` si tout est en ordre. */
export function cannotUse(
  enc: Encounter,
  unit: Combatant,
  ability: CombatAbility,
  at: GridPos,
): string | null {
  const depense = slotSpent(unit, ability);
  if (depense) return depense;
  const unaffordable = cannotAfford(enc, unit, ability, effectiveManaCost(enc, ability));
  if (unaffordable) return unaffordable;
  // On ne noue pas plus de fils qu'on n'a de mains pour les tenir.
  const trop = handsNeeded(enc, unit, ability);
  if (trop) return trop;

  // Un sort qui façonne de la matière a besoin de matière. Ni sous les pieds,
  // ni étudiée, ni jamais touchée : il n'y a rien à appeler, et le dire vaut
  // mieux que de laisser partir un sort vide.
  if (ability.shapesMaterial) {
    const forme = shapedAbility(enc, unit, ability);
    if (!forme) {
      return 'Aucun matériau disponible : rien sous les pieds, rien d’étudié.';
    }
    // Le coût réel est celui de la MATIÈRE : un granite conjuré loin de tout
    // n'a pas le prix d'un grès façonné sur place.
    const cout = cannotAfford(enc, unit, forme.ability, effectiveManaCost(enc, forme.ability));
    if (cout) return cout;
  }

  // On ne projette pas ce qu'on n'a pas. Le test vit ici plutôt que dans la
  // résolution seule, pour que la vue puisse griser le sort au lieu de laisser
  // le joueur dépenser son action et découvrir son sac vide.
  if (ability.throwsMetal && !metalWithinGrasp(unit, reachableGround(enc, unit)).length) {
    return 'Rien de ferreux à projeter, ni sur soi ni au sol.';
  }

  // Un échange vise un CORPS marqué, pas une case : ni ligne de vue ni case
  // libre à trouver. C'est le lien qui porte, et un lien traverse les murs.
  if (ability.swap) return swapBlocker(enc, unit, ability, at);

  // Pour une téléportation, `at` est la DESTINATION : c'est la distance de saut
  // qui la borne, pas la portée de ce que le sort fait en arrivant.
  if (ability.teleport) {
    const jump = teleportRangeOf(ability);
    const distance = unitToCellMeters(unit, at);
    if (distance > jump + 1e-6)
      return `Trop loin pour s’y rendre (${distance.toFixed(1)} m > ${jump} m).`;
    if (!hasLineOfSight(unit.pos, at, terrainFor(enc))) return 'Pas de ligne de vue.';
    // On n'atterrit pas sur quelqu'un, ni hors du plateau. La vérification était
    // dans `resolveUse` seul : la vue ne pouvait donc pas montrer où l'on peut
    // vraiment se rendre sans refaire le test à la main, et deux copies d'une
    // même règle finissent toujours par diverger.
    if (!fitsAt(enc, unit, at, [unit.id])) return 'Il y a déjà quelqu’un là.';
    return null;
  }

  // Faire éclater ses marques ne vise rien : ni portée, ni ligne de vue. Il
  // faut seulement qu'il reste quelque chose à faire éclater.
  if (ability.shape.kind === 'marked') {
    const nom = ability.marksTargets
      ? (STATUS_BY_KEY.get(ability.marksTargets)?.name ?? ability.marksTargets)
      : 'marque';
    return unitsInEffect(enc, unit, ability, at).length
      ? null
      : `Aucune « ${nom} » de ${unit.name} sur qui agir.`;
  }

  if (ability.shape.kind !== 'self') {
    const distance = unitToCellMeters(unit, at);
    if (distance > ability.rangeMeters + 1e-6)
      return `Hors de portée (${distance.toFixed(1)} m > ${ability.rangeMeters} m).`;
    // Un rayon à tête chercheuse ne vise pas : il suit un lien. Sur une cible
    // marquée, un chemin remplace la ligne de vue — et son absence est le seul
    // abri qui vaille contre lui.
    const suivi = unitAtCell(enc, at);
    if (suivi && ability.homingMark && bearsMarkOf(suivi, ability.homingMark, unit)) {
      return homesOn(enc, unit, ability, suivi)
        ? null
        : `${suivi.name} est hors d’atteinte : aucun chemin ne mène jusqu’à lui.`;
    }
    if (!hasLineOfSight(unit.pos, at, terrainFor(enc))) return 'Pas de ligne de vue.';
  }
  return null;
}

/* ── Dégâts annoncés ───────────────────────────────────────────────────────
   Ce qu'une capacité infligera, calculé exactement comme `resolveAgainst` le
   fera. Une attaque dont toute la puissance vient du scaling (le poing, dont
   les dés valent 0) afficherait sinon « 0–0 » sur son bouton, ce qui ne dit
   rien de ce qu'elle fait.

   La défense de la cible n'entre pas ici : elle dépend de qui l'on vise, et le
   joueur choisit son action avant sa cible.
─────────────────────────────────────────────────────────────────────────── */

/** Fourchette de dégâts d'une composante, avant défense de la cible. */
export interface DamageRange {
  min: number;
  max: number;
  type: string;
}

/**
 * Ce que chaque composante d'une capacité infligera de la part de `actor`,
 * enchantements actifs compris. L'ambiance n'entre pas ici : elle dépend de la
 * rencontre, pas du seul couple attaquant/capacité.
 */
export function abilityDamageRanges(actor: Combatant, ability: CombatAbility): DamageRange[] {
  const falloff = scalingFalloff(actor, ability);
  return resolvedComponents(actor, ability).map((component) => {
    const bonus = componentBonus(actor, component, falloff);
    return {
      min: Math.round(component.min + bonus),
      max: Math.round(component.max + bonus),
      type: component.type,
    };
  });
}

/** Soin effectivement rendu par une capacité, scaling compris. */
export function abilityHealAmount(actor: Combatant, ability: CombatAbility): number {
  if (!ability.heal) return 0;
  return Math.round(ability.heal + resolveScaling(actor, ability.healScaling));
}

/**
 * Mana effectivement rendu par une capacité, scaling et part de réserve compris.
 *
 * Deux origines qui ne se résolvent pas contre le même corps : le `scaling`
 * vient de la PUISSANCE du lanceur (une méditation vaut ce que vaut son
 * intelligence), la part de réserve vient de la CAPACITÉ du buveur (une fiole
 * remplit le réservoir qu'elle trouve). D'où `target`, qui vaut le lanceur
 * lui-même dans le cas ordinaire — on boit sa propre potion.
 */
export function abilityManaAmount(
  actor: Combatant,
  ability: CombatAbility,
  target: Combatant = actor,
): number {
  if (!ability.restoreMana && !ability.restoreManaPercent) return 0;
  const part = ability.restoreManaPercent
    ? (effectiveStat(target, 'mana') * ability.restoreManaPercent) / 100
    : 0;
  return Math.round(
    (ability.restoreMana ?? 0) + resolveScaling(actor, ability.restoreManaScaling) + part,
  );
}

/* ── Sac ───────────────────────────────────────────────────────────────────── */

/** Quantité restante d'un objet dans le sac (0 s'il n'y est pas). */
export function carriedQty(unit: Combatant, item: string): number {
  return unit.inventory.find((i) => i.name === item)?.qty ?? 0;
}

/**
 * Retire des exemplaires du sac. La ligne est laissée à 0 plutôt que supprimée :
 * un carquois vide reste visible sur la fiche, ce qui dit au joueur qu'il en
 * avait — et qu'il faut en reprendre.
 */
function consume(unit: Combatant, item: string, qty: number): number {
  const line = unit.inventory.find((i) => i.name === item);
  if (!line) return 0;
  const taken = Math.min(line.qty, qty);
  line.qty -= taken;
  return line.qty;
}

/** Résout une capacité contre une cible unique. Retourne les lignes de journal. */
/**
 * Résout une capacité contre une cible unique.
 *
 * Rend `true` si le coup a PORTÉ. La plupart des appelants s'en moquent — le
 * journal dit déjà tout — mais un objet projeté doit savoir où tomber : aux
 * pieds de la cible s'il l'atteint, plus loin s'il la manque.
 */
function resolveAgainst(
  enc: Encounter,
  actor: Combatant,
  ability: CombatAbility,
  target: Combatant,
  rng: Rng,
): boolean {
  const details: string[] = [];
  const offensive = ability.damages.length > 0 || ability.percentMaxHp || ability.percentCurrentHp;
  /**
   * Faut-il viser ? Tout ce qui blesse, oui. Le reste seulement s'il
   * s'IMPOSE : un sceau, des fils. Et alors uniquement contre qui n'en veut
   * pas — sur soi ou sur un allié consentant, il n'y a rien à viser.
   */
  const hostile = target.id !== actor.id && allegianceOf(enc, target) !== allegianceOf(enc, actor);
  const mustHit = !!offensive || (!!ability.requiresHit && hostile);

  // 1) L'effacement d'abord : un buff d'esquive ne rend pas difficile à viser,
  //    il fait qu'il n'y a plus rien à viser. Il l'emporte donc sur le jet.
  //    La Défense, elle, n'intervient dans aucun des deux : elle ne décide pas
  //    si l'on touche, mais ce que le coup coûte (cf. `damageReduction`). Un
  //    soin ou un buff, lui, porte toujours.
  if (mustHit && !ability.autoHit) {
    const dodge = evadeChance(target);
    if (dodge && rng.chance(dodge)) {
      push(enc, 'attack', `${target.name} esquive complètement ${ability.name}.`, {
        actorId: actor.id,
        targetId: target.id,
        details: [`esquive ${dodge} %`],
      });
      return false;
    }
  }

  // 2) Le jet de toucher. Seul ce qui VISE le fait : une zone occupe l'espace,
  //    elle n'a rien à ajuster (cf. `aims`). Un coup manqué s'arrête ici —
  //    ni dégâts, ni statuts, ni riposte : il n'a pas eu lieu.
  let hitFactor = 1;
  /** Degré obtenu, ou `null` pour ce qui ne vise pas (les zones). */
  let hitOutcome: HitOutcome | null = null;
  /** Le jet, prêt à figurer sur la ligne d'en-tête. */
  let hitRoll = '';
  // Le rayon qui a trouvé son lien ne se jette pas : il arrive. L'esquive, elle,
  // continue de valoir — elle ne rend pas difficile à viser, elle fait qu'il n'y
  // a plus rien à atteindre, et aucune tête chercheuse ne corrige cela.
  const teleguide = homesOn(enc, actor, ability, target);
  if (teleguide) {
    details.push('rayon guidé par la marque : il ne peut pas manquer');
  }

  if (mustHit && aims(ability) && !teleguide) {
    const breakdown = hitBreakdown(actor, ability, target);
    const { outcome, roll, detail } = resolveHitRoll(breakdown.threshold, rng, breakdown);
    hitFactor = HIT_FACTORS[outcome];
    hitOutcome = outcome;
    hitRoll = `dé ${roll} / ${breakdown.threshold}+`;
    if (outcome === 'miss') {
      push(enc, 'attack', `${actor.name} manque ${target.name} — ${ability.name} : dé ${roll} / ${breakdown.threshold}+.`, {
        actorId: actor.id,
        targetId: target.id,
        details: [detail],
      });
      return false;
    }
    details.push(detail);
    // Frappe assurée : le dé disait seulement SI le coup portait. Puisqu'il
    // porte, il vaut un critique — un effleurement compris, car la mana a été
    // versée dans l'impact, pas dans la précision du geste.
    if (ability.alwaysCritical) {
      hitFactor = HIT_FACTORS.critical;
      hitOutcome = 'critical';
      details.push(`dégâts comptés comme un coup critique (×${CRIT_FACTOR})`);
    }
  }

  // 2) Dégâts, composante par composante (un sort peut mêler deux types).
  //    Chacune est parée par la défense correspondant à SON type : une flèche
  //    enflammée bute sur l'armure pour sa part perforante et sur la résistance
  //    magique pour sa part de feu. L'absorption étant un pourcentage, chaque
  //    coup d'un enchaînement la subit à l'identique — rien à répartir.
  // Les buffs de poing ne profitent QU'aux attaques à mains nues : durcir ses
  // poings ne rend pas une épée plus tranchante.
  // Météo et heure du jour inclinent la puissance d'un sort selon son domaine.
  const ambient = ambienceDamageFactor(enc, ability.domains);
  // Tir à bout portant : la gêne se paie maintenant sur la précision, pas sur
  // la puissance (cf. `DISADVANTAGE_PRECISION`). On le dit quand même ici, pour
  // que le journal explique un jet qui vient de partir bas.
  if (isDisadvantaged(actor, ability, target)) {
    details.push(`tir gêné : cible à moins de ${ability.disadvantageMeters} m`);
  }
  let totalDamage = 0;
  // Le brut et les types voyagent jusqu'à la ligne d'en-tête : c'est là qu'on
  // lit un combat, pas dans les détails qu'il faut déplier.
  let totalRaw = 0;
  const struckTypes = new Set<string>();
  const falloff = scalingFalloff(actor, ability);
  for (const component of resolvedComponents(actor, ability)) {
    const dice = rng.int(component.min, component.max);
    const bonus = componentBonus(actor, component, falloff);
    const done = dealDamage(enc, target, (dice + bonus) * ambient * hitFactor, component.type, true);
    totalDamage += done.applied;
    totalRaw += done.raw;
    struckTypes.add(damageLabel(component.type));
    // Le détail de la fabrication du chiffre brut (dés, scaling, ambiance) ne
    // rend service à personne en pleine partie : ce qu'on veut savoir, c'est ce
    // qui a été porté et ce qui est passé. `dealDamage` dit déjà les deux.
    details.push(`${damageLabel(component.type)} : ${done.detail}`);
  }

  // 3) Dégâts proportionnels : ils ignorent la défense, donc aussi le seuil de
  //    toucher — mais pas les immunités.
  const percent = (
    spec: { min: number; max: number } | undefined,
    pool: number,
    label: string,
  ): void => {
    if (!spec) return;
    const pct = rng.int(spec.min, spec.max);
    const raw = Math.round((pct / 100) * pool);
    const type = ability.damages[0]?.type ?? 'true';
    const done = dealDamage(enc, target, raw, type);
    totalDamage += done.applied;
    totalRaw += done.raw;
    struckTypes.add(damageLabel(type));
    details.push(`${pct} % des PV ${label} (${pool}) : ${done.detail}`);
  };
  percent(ability.percentMaxHp, target.base.hp, 'max');
  percent(ability.percentCurrentHp, target.hp, 'actuels');

  // 4) Mana rendu (potions de mana, méditation), plafonné à la réserve.
  if (ability.restoreMana || ability.restoreManaPercent) {
    const amount = abilityManaAmount(actor, ability, target);
    const max = effectiveStat(target, 'mana');
    const before = target.mana;
    target.mana = Math.min(max, target.mana + amount);
    details.push(
      `${target.mana - before} mana rendu (${target.mana}/${max})` +
        // Le détail dit d'où vient le montant : sans lui, deux buveurs de
        // réserves différentes verraient des chiffres inexpliqués.
        (ability.restoreManaPercent
          ? ` — ${ability.restoreMana ?? 0} + ${ability.restoreManaPercent} % de ${max}`
          : ''),
    );
  }

  // 5) Soin.
  if (ability.heal) {
    const amount = ability.heal + resolveScaling(actor, ability.healScaling);
    const done = heal(enc, target, Math.round(amount));
    details.push(done.detail);
    push(enc, 'heal', `${actor.name} soigne ${target.name} de ${done.applied} PV.`, {
      actorId: actor.id,
      targetId: target.id,
      details,
    });
  } else if (offensive) {
    // Tout ce qu'on veut savoir tient sur cette ligne : qui, comment le coup
    // est passé, ce qui a été porté, ce qui a réellement été encaissé, et de
    // quelle nature. Les détails ne servent qu'à répondre au « pourquoi ».
    const verbe =
      hitOutcome === 'critical'
        ? `porte un coup critique à ${target.name}`
        : hitOutcome === 'graze'
          ? `effleure ${target.name}`
          : `touche ${target.name}`;
    const nature = struckTypes.size ? ` de ${[...struckTypes].join(' + ')}` : '';
    push(
      enc,
      'damage',
      `${actor.name} ${verbe} — ${ability.name}${hitRoll ? ` (${hitRoll})` : ''} : ` +
        `${totalDamage} dégâts [${totalRaw} bruts]${nature}.`,
      { actorId: actor.id, targetId: target.id, details },
    );
  } else if (details.length) {
    // Ni dégâts ni soin, mais quelque chose s'est passé (mana rendu, purge) :
    // le calcul mérite sa ligne quand même.
    push(enc, 'info', `${ability.name} agit sur ${target.name}.`, {
      actorId: actor.id,
      targetId: target.id,
      details,
    });
  }

  // 5 bis) Le coup peut rompre ce que la cible TENAIT sur d'autres : une lame
  //    dans le dos fait lâcher des fils qu'aucune durée n'aurait usés.
  if (totalDamage > 0) breakConcentration(enc, target, totalDamage, rng);

  // 6) Effets non chiffrés : le moteur ne peut pas les résoudre, il les met
  //    sous les yeux du MJ plutôt que de les laisser tomber en silence.
  if (ability.manualEffects?.length) {
    push(enc, 'info', `${ability.name} — à appliquer par le MJ sur ${target.name} :`, {
      actorId: actor.id,
      targetId: target.id,
      details: ability.manualEffects,
    });
  }

  // 7) Effet temporaire posé sur la cible. Il n'y a pas que les modificateurs
  //    de stats : un buff peut n'accorder qu'une esquive, une riposte, une
  //    protection contre un statut ou un renfort de poings — chacun suffit à
  //    justifier l'effet, sans quoi ces buffs-là ne s'appliqueraient jamais.
  const carriesEffect =
    !!ability.mods?.length ||
    !!ability.evadeChance ||
    !!ability.enchant ||
    !!ability.retaliate ||
    !!ability.cleanses?.length;

  if (carriesEffect && ability.duration) {
    const hostile = target.team !== actor.team && target.id !== actor.id;
    const mods = (ability.mods ?? []).map((m) => ({
      stat: m.stat,
      value: Math.round((m.value + resolveScaling(actor, m.scaling)) * (hostile ? -1 : 1)),
    }));
    if (ability.enchant) replaceEnchant(enc, target, ability.enchant.target, ability.name);
    addEffect(target, {
      id: `${ability.id}-${target.id}`,
      name: ability.name,
      remaining: ability.duration,
      sourceId: actor.id,
      mods,
      cleanses: ability.cleanses,
      evadeChance: ability.evadeChance,
      enchant: ability.enchant,
      retaliate: ability.retaliate,
    });
    push(enc, 'status', `${target.name} : ${ability.name} (${ability.duration} tours).`, {
      actorId: actor.id,
      targetId: target.id,
      details: mods.map((m) => `${m.stat} ${signed(m.value)}`),
    });
  }

  // 6) Purge accordée par la capacité.
  for (const key of ability.cleanses ?? []) clearStatus(enc, target, key);

  // 7) Statuts infligés — ceux de la capacité, puis ceux que le revêtement
  //    ajoute à chaque coup (venin sur la lame). Même barème pour les deux.
  for (const inflict of [...(ability.inflicts ?? []), ...enchantStatusesOn(actor, ability)]) {
    if (!rng.chance(inflict.chance)) {
      push(enc, 'status', `« ${statusByKey(inflict.status)?.name ?? inflict.status} » ne prend pas sur ${target.name}.`, {
        targetId: target.id,
        details: [`chance ${inflict.chance} %`],
      });
      continue;
    }
    applyStatus(enc, target, inflict.status, actor, {
      duration: inflict.duration,
      tetherMeters: ability.tetherMeters,
      gapMeters: ability.anchorGapMeters,
    });
  }

  // 8) Riposte : un attaquant au contact d'une cible protégée le paie.
  for (const effect of target.effects) {
    const retaliate = effect.retaliate;
    if (!retaliate) continue;
    if (!offensive) continue;
    if (!triggersRetaliation(retaliate.trigger, actor, ability, target)) continue;

    if (retaliate.damageMin) {
      const amount =
        rng.int(retaliate.damageMin, retaliate.damageMax ?? retaliate.damageMin) +
        resolveScaling(target, retaliate.scaling as AbilityScaling[] | undefined);
      const done = dealDamage(enc, actor, Math.round(amount), retaliate.damageType ?? 'true');
      push(enc, 'damage', `${effect.name} riposte : ${actor.name} subit ${done.applied} PV.`, {
        targetId: actor.id,
        details: [done.detail],
      });
    }
    for (const inflict of retaliate.inflicts ?? []) {
      if (rng.chance(inflict.chance))
        applyStatus(enc, actor, inflict.status, target, { duration: inflict.duration });
    }
  }

  return true;
}

/**
 * La capacité frappe-t-elle **à même la chair** ? Le poing d'un homme et les
 * crocs d'une bête, oui — ni l'un ni l'autre ne tient d'arme. Une lame, une
 * pique, une flèche, non : elles gardent leur porteur à distance de ce qu'il
 * touche. C'est toute la différence pour qui se protège d'épines.
 */
function strikesBareHanded(ability: CombatAbility): boolean {
  return !!ability.unarmed || ability.kind === 'natural';
}

/** La riposte d'un buff répond-elle à ce coup-ci ? */
function triggersRetaliation(
  trigger: SpellRetaliate['trigger'],
  actor: Combatant,
  ability: CombatAbility,
  target: Combatant,
): boolean {
  if (trigger === 'any') return true;
  // Les deux autres déclencheurs exigent le contact : on ne se blesse pas sur
  // ce qu'on n'a pas approché. Une arme d'allonge frappe donc impunément.
  if (unitDistanceMeters(actor, target) > CELL_METERS) return false;
  return trigger === 'unarmed' ? strikesBareHanded(ability) : true;
}

/* ── Réactions ─────────────────────────────────────────────────────────────
   Le moteur ne réagit jamais à la place du joueur. Quand une action ouvre une
   fenêtre, il la SUSPEND — l'action est rangée dans la rencontre — et attend un
   `react` ou un `skipReaction`. La reprise rejoue l'action suspendue, qui peut
   alors trouver le monde changé : c'est ainsi qu'un Pas dimensionnel esquive
   vraiment, en sortant de la portée avant que le coup ne parte.
─────────────────────────────────────────────────────────────────────────── */

/** Capacités qu'un combattant peut employer en réponse à un déclencheur donné. */
export function reactionOptions(
  enc: Encounter,
  unit: Combatant,
  trigger: ReactionTrigger,
): CombatAbility[] {
  // On filtre sur ce qui est VRAIMENT jouable, pas seulement sur ce que la
  // fiche déclare. Proposer une réaction qu'un refus rejettera ensuite fait
  // perdre sa réaction au joueur en apparence, et le laisse chercher pourquoi.
  // C'est aussi ce qui garantit qu'une fenêtre ne s'ouvre pas pour rien : les
  // deux appelants renoncent quand la liste est vide.
  return unit.abilities.filter((a) => a.reaction?.includes(trigger) && !cannotReact(enc, unit, a));
}

/** Allonge de corps à corps d'un combattant : la plus longue de ses armes de mêlée. */
function meleeReach(unit: Combatant): number {
  return unit.abilities
    .filter((a) => a.damages.length && a.rangeMeters <= CELL_METERS * 2)
    .reduce((best, a) => Math.max(best, a.rangeMeters), 0);
}

/**
 * Fenêtre ouverte par un déplacement : qui voit sa proie lui échapper ?
 *
 * On ne réagit qu'à ce qui SORT de l'allonge — se rapprocher ou tourner autour
 * sans la quitter ne provoque rien. C'est cette règle qui donne enfin un prix
 * au désengagement, et donc du poids au placement.
 */
function opportunityWindow(
  enc: Encounter,
  mover: Combatant,
  to: GridPos,
  asked: string[],
): PendingReaction | undefined {
  const after = { ...mover, pos: to };
  for (const watcher of enc.combatants) {
    if (watcher.id === mover.id || watcher.down || watcher.team === mover.team) continue;
    if (asked.includes(watcher.id)) continue;

    const reach = meleeReach(watcher);
    if (!reach) continue;
    const engaged = unitDistanceMeters(watcher, mover) <= reach + 1e-6;
    const escaping = unitDistanceMeters(watcher, after) > reach + 1e-6;
    if (!engaged || !escaping) continue;

    const options = reactionOptions(enc, watcher, 'leave-reach');
    if (!options.length) continue;

    return {
      actorId: watcher.id,
      trigger: 'leave-reach',
      sourceId: mover.id,
      reason: `${mover.name} quitte l’allonge de ${watcher.name}.`,
      options: options.map((a) => a.id),
      at: { ...mover.pos },
    };
  }
  return undefined;
}

/** Fenêtre ouverte par une attaque : qui est visé et peut s'y soustraire ? */
function defenceWindow(
  enc: Encounter,
  attacker: Combatant,
  targets: Combatant[],
  asked: string[],
  rng: Rng,
): { window?: PendingReaction; rolled: string[] } {
  /** Ceux qui ont déjà jeté leur réflexe pour CETTE action, et l'ont raté. */
  const rolled: string[] = [];

  for (const target of targets) {
    if (target.id === attacker.id || asked.includes(target.id)) continue;
    const options = reactionOptions(enc, target, 'incoming-attack');
    if (!options.length) continue;

    // Voir le coup venir se joue AVANT d'avoir le choix : un combattant pris de
    // court ne se voit pas offrir un menu qu'il n'a pas le temps de lire. Un
    // échec ne coûte que l'occasion — ni réaction dépensée, ni ressource : il
    // n'a rien tenté, il n'a pas eu le temps.
    const reflexe = reflexBreakdown(target, attacker);
    const { success, roll } = resolveReflexRoll(reflexe.threshold, rng);
    const verdict = success ? 'à temps' : 'trop tard';
    push(
      enc,
      'info',
      `Réaction de ${target.name} — dé ${roll} / ${reflexe.threshold}+ → ${verdict}.`,
      {
        actorId: target.id,
        details: [
          `dé ${roll} brut (rien ne s’y ajoute) contre seuil ${reflexe.threshold}+ — ${explainThreshold(reflexe)}`,
        ],
      },
    );
    if (!success) {
      rolled.push(target.id);
      continue;
    }

    return {
      rolled,
      window: {
        actorId: target.id,
        trigger: 'incoming-attack',
        sourceId: attacker.id,
        reason: `${attacker.name} prend ${target.name} pour cible.`,
        options: options.map((a) => a.id),
        at: { ...target.pos },
      },
    };
  }
  return { rolled };
}

/** Suspend une action et ouvre la fenêtre de réaction correspondante. */
function suspendFor(
  enc: Encounter,
  window: PendingReaction,
  action: CombatAction,
  asked: string[],
): void {
  enc.pendingReaction = window;
  enc.suspended = { action, asked: [...asked, window.actorId] };
  push(enc, 'info', `Réaction possible — ${window.reason}`, { actorId: window.actorId });
}

/**
 * Reprend l'action interrompue, une fois la réaction tranchée. Elle peut très
 * bien échouer à la reprise (cible envolée, portée rompue) : c'est précisément
 * l'effet recherché d'une réaction défensive.
 */
function resumeSuspended(enc: Encounter, rng: Rng): void {
  const suspended = enc.suspended;
  enc.pendingReaction = undefined;
  if (!suspended) return;
  perform(enc, suspended.action, rng);
}

/**
 * Distance franchissable par une téléportation. À défaut d'être chiffrée à
 * part, c'est la portée du sort qui sert — vrai pour un Pas dimensionnel, faux
 * dès que le sort agit aussi à l'arrivée.
 */
export const teleportRangeOf = (ability: CombatAbility): number =>
  ability.teleportMeters ?? ability.rangeMeters;

/* ── L'échange de place ────────────────────────────────────────────────────
   Un `swap` n'est pas une téléportation vers une case : c'est une permutation
   entre deux corps. Il vise donc un OCCUPANT, il se moque de la ligne de vue —
   le lien est déjà noué, il n'y a rien à viser — et il réussit ou échoue en
   bloc : si l'un des deux ne tient pas là où l'autre était, personne ne bouge.
─────────────────────────────────────────────────────────────────────────── */

/** Un combattant tient-il à cet emplacement, une fois `ignore` retirés du plateau ? */
function fitsAt(
  enc: Encounter,
  unit: Pick<Combatant, 'footprint'>,
  pos: GridPos,
  ignore: string[],
): boolean {
  const taken = new Set(
    enc.combatants
      .filter((c) => !ignore.includes(c.id))
      .flatMap((c) => occupiedCells(c).map(cellKey)),
  );
  return occupiedCells({ pos, footprint: unit.footprint }).every(
    (cell) => inBounds(cell, enc.grid) && !taken.has(cellKey(cell)),
  );
}

/* ── Le rayon à tête chercheuse ────────────────────────────────────────────
   Un projectile qui CONTOURNE. Il ne demande pas de voir sa cible — il demande
   qu'un chemin y mène. Tant qu'il en reste un, si mince soit-il, il finit par
   arriver ; scellez la pièce et il n'a plus rien à suivre.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Une case est-elle PLEINE pour un projectile qui contourne ?
 *
 * Il faut qu'elle arrête à la fois le pas et le regard. Un gouffre arrête le
 * pas mais se survole, un fourré arrête le regard mais se traverse : ni l'un ni
 * l'autre n'enferme qui que ce soit.
 */
const beamSolid = (enc: Encounter) => {
  const terrain = terrainFor(enc);
  return (cell: string): boolean => blocksMovement(terrain, cell) && blocksSight(terrain, cell);
};

/**
 * Le rayon a-t-il prise sur cette cible ?
 *
 * Deux conditions, et le sort tient tout entier dans leur conjonction : la
 * cible porte la marque que le lanceur a posée de sa main, et il reste un
 * chemin jusqu'à elle. Alors le trait la trouve où qu'elle se cache — sinon il
 * redevient un rayon ordinaire, qu'il faut viser.
 */
export function homesOn(
  enc: Encounter,
  actor: Combatant,
  ability: CombatAbility,
  target: Combatant,
): boolean {
  if (!ability.homingMark) return false;
  if (!bearsMarkOf(target, ability.homingMark, actor)) return false;
  return hasPathThrough(actor.pos, target.pos, enc.grid, beamSolid(enc));
}

/** Le combattant visé par une case, s'il y en a un de debout. */
function unitAtCell(enc: Encounter, at: GridPos): Combatant | undefined {
  const key = cellKey(at);
  return enc.combatants.find((c) => !c.down && occupiedCells(c).some((p) => cellKey(p) === key));
}

/**
 * Part de la puissance d'une matière que porte un ENCHANTEMENT.
 *
 * Nimber ses poings ajoute à chaque coup ; ça ne doit pas valoir une frappe de
 * plein droit, sinon un revêtement surclasserait tout sort offensif du domaine.
 */
export const ENCHANT_SHARE = 0.35;

/**
 * Épaisseur d'un mur, en « couches » de défense.
 *
 * Une paroi encaisse bien plus qu'une armure de la même pierre : elle n'a pas à
 * rester portable.
 */
export const WALL_THICKNESS = 2.5;

/* ── Façonner la matière ───────────────────────────────────────────────────
   Un sort de Terre ne porte pas ses chiffres : il porte une FAMILLE. Ce qu'il
   vaut se décide au lancer, d'après ce que le sol offre et ce que le lanceur a
   étudié. Le même « Mur de pierre » est du granite bon marché aux Dorsales, de
   l'obsidienne tranchante à l'Archipel, et une improvisation coûteuse en mer.
─────────────────────────────────────────────────────────────────────────── */

/**
 * La capacité telle qu'elle part vraiment, matière comprise.
 *
 * Rend la capacité INCHANGÉE quand elle ne façonne rien — l'écrasante majorité
 * des sorts. Rend `null` quand elle façonne mais que rien n'est disponible :
 * ni sous les pieds, ni étudié, ni jamais touché. Il n'y a alors rien à
 * appeler, et le sort doit être refusé plutôt que lancé à vide.
 */
/**
 * Applique une matière à une capacité. **Fonction pure**, exportée exprès.
 *
 * La vue s'en sert pour montrer, matière par matière, ce que le sort DEVIENDRA
 * avant qu'on ne le lance. Passer par la même fonction que la résolution est le
 * seul moyen de garantir que l'aperçu ne mente pas : une seconde formule
 * d'affichage aurait fini par diverger du moteur.
 */
export function applyMaterial(
  ability: CombatAbility,
  shaping: EarthShaping,
  extraMana = 0,
): CombatAbility {
  const { material, effectFactor } = shaping;
  /**
   * Combien de matière ce palier façonne. Le palier ne dit plus les chiffres —
   * la matière les dit — il ne dit que l'ampleur.
   */
  const echelle = (ability.materialScale ?? 1) * effectFactor;
  const taille = (base: number) => Math.max(1, Math.round(base * echelle));

  return {
    ...ability,
    name: `${ability.name} (${material.name})`,
    manaCost: Math.max(0, Math.round(ability.manaCost * shaping.manaFactor)) + extraMana,
    // Les dégâts sont CEUX DE LA MATIÈRE, pas un pourcentage d'un chiffre écrit
    // sur le palier. C'est la spécificité du domaine : changer de pierre change
    // vraiment d'arme, au lieu de moduler le même nombre de quelques points.
    damages: ability.damages.map((d) => ({
      ...d,
      min: taille(material.damage.min),
      max: taille(material.damage.max),
      type: material.damageType,
    })),
    // Ce qu'elle protège, à l'ampleur du palier. Les deux défenses sont
    // DISTINCTES : la dureté arrête les coups, la résonance arrête les sorts —
    // et la plupart des pierres n'ont que la première. Un sort qui accorde de
    // la défense magique n'en accorde donc aucune s'il est taillé dans du grès,
    // au lieu de lui prêter silencieusement la valeur de sa dureté.
    mods: ability.mods
      ?.map((m) => {
        if (m.stat === 'def_phy') return { ...m, value: taille(material.defense) };
        if (m.stat === 'def_mag') {
          return material.magicDefense
            ? { ...m, value: taille(material.magicDefense) }
            : null;
        }
        return { ...m, value: Math.max(1, Math.round(m.value * effectFactor)) };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null),
    // Un revêtement porte ses dégâts dans son enchantement. L'échelle y est
    // volontairement plus basse : un poing nimbé ajoute à chaque coup, il ne
    // remplace pas une frappe.
    enchant: ability.enchant
      ? {
          ...ability.enchant,
          damage: ability.enchant.damage
            ? {
                ...ability.enchant.damage,
                min: Math.max(1, Math.round(material.damage.min * echelle * ENCHANT_SHARE)),
                max: Math.max(2, Math.round(material.damage.max * echelle * ENCHANT_SHARE)),
                type: material.damageType,
              }
            : undefined,
        }
      : undefined,
    // Un mur vaut sa dureté, sur plusieurs épaisseurs.
    raisesWall: ability.raisesWall
      ? { ...ability.raisesWall, hp: taille(material.defense * WALL_THICKNESS) }
      : undefined,
    // Ce qu'une armure coûte en VITESSE vient de la densité de la matière, pas
    // d'un chiffre écrit sur le palier. Le sort dit seulement « ceci alourdit » ;
    // la pierre dit de combien. Une armure d'or protège mal ET écrase son
    // porteur — c'est un mauvais choix assumé, pas un oubli d'équilibrage.
    recoil: ability.recoil?.mods?.some((m) => m.stat === 'speed')
      ? {
          ...ability.recoil,
          mods: ability.recoil.mods.map((m) =>
            m.stat === 'speed'
              ? { ...m, value: Math.max(1, Math.round(material.speedPenalty * echelle)) }
              : m,
          ),
        }
      : ability.recoil,
    cleanses: material.cleanses ?? ability.cleanses,
    precisionPenalty: (ability.precisionPenalty ?? 0) + shaping.precisionPenalty,
  };
}

/**
 * Le surcoût de celui qui impose sa matière au terrain.
 *
 * Choisir une matière que le sol porte aussi n'est PAS un forçage : c'est
 * préférer le basalte au granite quand les deux affleurent, et ça ne doit rien
 * coûter de plus.
 */
export function forcedMaterialSurcharge(
  geology: readonly string[] | undefined,
  family: string | undefined,
  materialKey: string,
  forced: boolean,
): number {
  if (!forced) return 0;
  const sol = geology ?? [];
  if (sol.includes(materialKey)) return 0;
  const autre = sol.some((k) => {
    const local = MATERIAL_BY_KEY.get(k);
    return !!local && local.family === family && local.key !== materialKey;
  });
  return autre ? FORCED_MATERIAL_MANA : 0;
}

function shapedAbility(
  enc: Encounter,
  unit: Combatant,
  ability: CombatAbility,
  forced?: string,
): { ability: CombatAbility; shaping?: EarthShaping } | null {
  if (!ability.shapesMaterial) return { ability };

  const shaping = resolveShaping(ability.shapesMaterial, enc.geology, unit.earthMaterials, forced);
  if (!shaping) return null;

  const surcout = forcedMaterialSurcharge(
    enc.geology,
    ability.shapesMaterial,
    shaping.material.key,
    !!forced,
  );
  return { shaping, ability: applyMaterial(ability, shaping, surcout) };
}

/* ── Prendre et rendre les armes ───────────────────────────────────────────
   Une arme n'est une capacité que TENUE. Au sac, elle n'est qu'une ligne — et
   c'est ce qui permet de la ramasser, de la voler, de la lancer, puis de la
   reprendre en main sans que le moteur ait à connaître le catalogue d'armes.
─────────────────────────────────────────────────────────────────────────── */

/** L'emplacement de la main principale, et celui de la main faible. */
const MAIN_HAND = 'weapon';
const OFF_HAND = 'offhand';

/** Le combattant sait-il manier cette catégorie d'arme ? */
function trainedWith(unit: Combatant, category: string | undefined): boolean {
  return !!category && !!unit.weaponProficiencies?.includes(category);
}

/** L'arme tenue dans un emplacement, s'il y en a une. */
const heldIn = (unit: Combatant, slot: string): CombatAbility | undefined =>
  unit.abilities.find((a) => a.kind === 'weapon' && a.id === `weapon:${slot}`);

/**
 * Remet au fourreau — c'est-à-dire au sac — l'arme tenue dans un emplacement.
 *
 * Rendue en tant qu'ARME et non en bagage : elle doit pouvoir être reprise en
 * main au tour suivant.
 */
function sheathe(unit: Combatant, slot: string): CombatAbility | undefined {
  const held = heldIn(unit, slot);
  if (!held) return undefined;
  unit.abilities.splice(unit.abilities.indexOf(held), 1);
  handOver(
    unit.inventory,
    {
      name: held.name,
      qty: 0,
      slug: held.ref,
      kind: 'other',
      metallic: held.metallic,
      weapon: held.wield,
    },
    1,
  );
  return held;
}

/**
 * Prend une arme du sac en main.
 *
 * La capacité est REBÂTIE pour l'emplacement visé plutôt que recopiée : la main
 * faible frappe sans la part d'attaque physique et se joue en action bonus.
 * Recopier celle de la main droite aurait transporté ces règles avec elle.
 *
 * La maîtrise est rejugée à ce moment-là, contre ce que le nouveau porteur a
 * appris — ramasser l'arc d'un mort ne donne pas vingt ans d'entraînement.
 */
function equipFromBag(
  enc: Encounter,
  unit: Combatant,
  itemName: string,
  slot: string,
): boolean {
  const line = unit.inventory.find((i) => i.name === itemName && i.qty > 0 && i.weapon);
  if (!line?.weapon) {
    push(enc, 'info', `${unit.name} n’a pas « ${itemName} » en état d’être empoigné.`, {
      actorId: unit.id,
    });
    return false;
  }

  const ability = weaponAbility(
    line.weapon.source,
    slot,
    line.weapon.ammo,
    trainedWith(unit, line.weapon.source.weaponCategory),
  );

  // Deux mains sur le manche : la main faible se vide d'office. Le dire ici
  // plutôt que de laisser jouer une claymore escortée d'une dague.
  const libere: string[] = [];
  if (ability.twoHanded) {
    const rangee = sheathe(unit, OFF_HAND);
    if (rangee) libere.push(rangee.name);
  }
  // …et une arme à deux mains déjà tenue empêche d'armer la main faible.
  if (slot === OFF_HAND && heldIn(unit, MAIN_HAND)?.twoHanded) {
    push(enc, 'info', `${unit.name} tient déjà une arme à deux mains.`, { actorId: unit.id });
    return false;
  }

  const remplacee = sheathe(unit, slot);
  if (remplacee) libere.push(remplacee.name);

  line.qty -= 1;
  if (line.qty <= 0) unit.inventory.splice(unit.inventory.indexOf(line), 1);
  unit.abilities.push(ability);

  push(enc, 'info', `${unit.name} prend ${ability.name} en main.`, {
    actorId: unit.id,
    details: [
      libere.length ? `range ${libere.join(', ')}` : '',
      ability.proficient ? 'arme maîtrisée' : 'arme non maîtrisée',
    ].filter(Boolean),
  });
  return true;
}

/** Changer d'arme : un geste bref, qui coûte le créneau des objets. */
function resolveEquip(
  enc: Encounter,
  actorId: string,
  itemName: string,
  slot: string | undefined,
): void {
  const actor = findUnit(enc, actorId);
  if (!actor) return;

  const combat = phaseOf(enc) === 'combat';
  if (combat && actor.bonusActionUsed) {
    push(enc, 'info', `${actor.name} a déjà dépensé son action bonus.`, { actorId: actor.id });
    return;
  }
  if (equipFromBag(enc, actor, itemName, slot ?? MAIN_HAND) && combat) {
    actor.bonusActionUsed = true;
  }
}

/** Range une arme sans en prendre d'autre : la main se libère. */
function resolveUnequip(enc: Encounter, actorId: string, slot: string): void {
  const actor = findUnit(enc, actorId);
  if (!actor) return;

  const combat = phaseOf(enc) === 'combat';
  if (combat && actor.bonusActionUsed) {
    push(enc, 'info', `${actor.name} a déjà dépensé son action bonus.`, { actorId: actor.id });
    return;
  }
  const rangee = sheathe(actor, slot);
  if (!rangee) {
    push(enc, 'info', `${actor.name} n’a rien dans cette main.`, { actorId: actor.id });
    return;
  }
  if (combat) actor.bonusActionUsed = true;
  push(enc, 'info', `${actor.name} range ${rangee.name}.`, { actorId: actor.id });
}

/* ── Le magnétisme ─────────────────────────────────────────────────────────
   Deux sorts, une même prise sur le fer : l'un l'arrache à quelqu'un, l'autre
   le décoche. Aucun des deux ne chiffre quoi que ce soit sur son palier — tout
   vient de ce qui est réellement porté au moment du lancer, et c'est ce qui les
   rend imprévisibles : on ne vole que ce que l'autre a sur lui.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Fait passer un objet d'un sac à l'autre en gardant ce que le catalogue en
 * disait.
 *
 * `pour` (butin) ne retient ni la matière ni la masse : une lame arrachée
 * atterrirait dans le sac du lanceur en bagage inerte, et il ne pourrait plus
 * la projeter au tour suivant. Ce qui est en fer le reste en changeant de main.
 */
function handOver(bag: CarriedItem[], item: CarriedItem, qty: number): void {
  const existing = bag.find((c) => c.name === item.name);
  if (existing) {
    existing.qty += qty;
    // Une ligne homonyme déjà présente peut venir d'une saisie à la main, donc
    // sans matière connue. L'arrivée la renseigne.
    existing.metallic ??= item.metallic;
    existing.weightKg ??= item.weightKg;
    return;
  }
  bag.push({ ...item, qty });
}

/**
 * Arrache un objet ferreux à sa cible.
 *
 * Ce qui dort dans un sac vient sans que personne s'en aperçoive. Ce qui est
 * TENU se dispute : la cible jette sa Force contre `pullDc` et garde son arme
 * si elle réussit. Perdre l'épreuve, c'est être désarmé — la capacité d'arme
 * quitte le combattant, et l'arme rejoint le sac du lanceur.
 */
function resolveMetalPull(
  enc: Encounter,
  actor: Combatant,
  ability: CombatAbility,
  target: Combatant,
  wanted: string | undefined,
  rng: Rng,
): void {
  const prise = pickMetal(metalCarriedBy(target), wanted);
  if (!prise) {
    push(enc, 'info', `${target.name} ne porte rien de ferreux : le champ n’a pas de prise.`, {
      actorId: actor.id,
      targetId: target.id,
    });
    return;
  }

  // Une arme au poing se défend. Rien dans un sac ne se défend tout seul.
  if (prise.source === 'weapon' && ability.pullDc) {
    const roll = rng.d20();
    const mod = abilityModifier(effectiveAttribute(target, 'force'));
    const total = roll + mod + target.proficiency;
    if (total >= ability.pullDc) {
      push(enc, 'save', `${target.name} retient ${prise.name} — jet de Force réussi.`, {
        actorId: actor.id,
        targetId: target.id,
        details: [
          `d20 ${roll} ${signed(mod)} (Force) ${signed(target.proficiency)} (maîtrise) = ${total} vs DD ${ability.pullDc}`,
        ],
      });
      return;
    }
    push(enc, 'save', `${target.name} ne retient pas ${prise.name} — jet de Force manqué.`, {
      actorId: actor.id,
      targetId: target.id,
      details: [
        `d20 ${roll} ${signed(mod)} (Force) ${signed(target.proficiency)} (maîtrise) = ${total} vs DD ${ability.pullDc}`,
      ],
    });
  }

  if (prise.source === 'weapon') {
    const index = target.abilities.findIndex((a) => a.id === prise.abilityId);
    const arme = index >= 0 ? target.abilities[index] : undefined;
    if (!arme) return;
    target.abilities.splice(index, 1);
    handOver(
      actor.inventory,
      {
        name: arme.name,
        qty: 0,
        slug: arme.ref,
        kind: 'other',
        metallic: true,
        // L'arme reste une ARME en changeant de main : sans quoi la voler
        // revenait à la briser, et le lanceur n'héritait que d'un nom.
        weapon: arme.wield,
      },
      1,
    );
    push(enc, 'loot', `${actor.name} arrache ${arme.name} des mains de ${target.name}.`, {
      actorId: actor.id,
      targetId: target.id,
      details: [`${target.name} est désarmé de cette arme`],
    });
    // Main vide : l'arme volée s'y loge d'elle-même. Le champ l'amène jusqu'au
    // poing du lanceur — il serait absurde de lui demander un second geste pour
    // refermer les doigts dessus. Gratuit, c'est le sort qui le fait.
    if (arme.wield && !heldIn(actor, MAIN_HAND)) {
      equipFromBag(enc, actor, arme.name, MAIN_HAND);
    }
    return;
  }

  const ligne = target.inventory.find((i) => i.name === prise.name && i.qty > 0);
  if (!ligne) return;
  ligne.qty -= 1;
  handOver(actor.inventory, ligne, 1);
  push(enc, 'loot', `${actor.name} attire ${prise.name} du sac de ${target.name}.`, {
    actorId: actor.id,
    targetId: target.id,
    details: [`reste ${ligne.qty} à ${target.name}`],
  });
}

/**
 * Attire à soi une pièce de ferraille qui gît sur une case.
 *
 * Rien à disputer ici : le sol ne tient rien. C'est le pendant naturel du vol
 * — un champ qui arrache une épée d'un poing serré n'a aucune raison de laisser
 * la même épée par terre — et c'est ce qui permet de récupérer ce qu'on vient
 * de projeter sans traverser le champ de bataille à pied.
 */
function resolveGroundPull(
  enc: Encounter,
  actor: Combatant,
  ability: CombatAbility,
  at: GridPos,
  wanted: string | undefined,
): void {
  const ferreux = groundAt(enc, at).filter((i) => i.metallic && i.qty > 0);
  const ligne = ferreux.find((i) => i.name === wanted) ?? ferreux[0];
  if (!ligne) {
    push(enc, 'info', `Rien de ferreux à attirer en (${at.x}, ${at.y}).`, { actorId: actor.id });
    return;
  }

  const copie = { ...ligne };
  takeFromGround(enc, at, ligne.name, 1);
  handOver(actor.inventory, copie, 1);
  push(enc, 'loot', `${actor.name} attire ${copie.name} à lui.`, {
    actorId: actor.id,
    details: [`ramassé en (${at.x}, ${at.y}) sans se déplacer`],
  });

  // Même règle que pour une arme volée : une main vide se referme dessus.
  if (copie.weapon && !heldIn(actor, MAIN_HAND)) {
    equipFromBag(enc, actor, copie.name, MAIN_HAND);
  }
}

/**
 * Retire du sac du lanceur l'objet qu'il vient de projeter, et rend ce qu'il
 * inflige en arrivant.
 *
 * L'objet ne revient pas : c'est ce qui empêche le sort d'être une attaque
 * gratuite qu'on répéterait sans fin. Une arme projetée désarme aussi celui qui
 * la lance — on ne garde pas en main ce qu'on vient de décocher.
 */
function spendThrownMetal(
  enc: Encounter,
  actor: Combatant,
  wanted: string | undefined,
): MetalItem | undefined {
  const projectile = pickMetal(metalWithinGrasp(actor, reachableGround(enc, actor)), wanted);
  if (!projectile) return undefined;

  // Ce qui gît à ses pieds part sans qu'il ait à se baisser : c'est la raison
  // d'être d'un champ magnétique, et ce qui rend un champ de bataille jonché de
  // ferraille plus dangereux qu'un pré.
  if (projectile.source === 'ground' && projectile.at) {
    takeFromGround(enc, projectile.at, projectile.name, 1);
    push(enc, 'info', `${actor.name} arrache ${projectile.name} du sol et le décoche.`, {
      actorId: actor.id,
    });
    return projectile;
  }

  if (projectile.source === 'weapon') {
    const index = actor.abilities.findIndex((a) => a.id === projectile.abilityId);
    if (index >= 0) actor.abilities.splice(index, 1);
    push(enc, 'info', `${actor.name} décoche ${projectile.name} : il n’a plus l’arme en main.`, {
      actorId: actor.id,
    });
    return projectile;
  }

  const ligne = actor.inventory.find((i) => i.name === projectile.name && i.qty > 0);
  if (ligne) ligne.qty -= 1;
  return projectile;
}

/**
 * Pose au sol l'objet qui vient d'être projeté, et dit où il est tombé.
 *
 * Touché : à ses pieds. Manqué : au-delà, dans le prolongement du tir — rater
 * coûte donc deux fois, le coup et la marche pour aller le rechercher.
 */
function landProjectile(
  enc: Encounter,
  actor: Combatant,
  projectile: MetalItem,
  aim: GridPos,
  hit: boolean,
  rng: Rng,
): void {
  const cell = landingCell(enc, actor.pos, aim, hit, rng, terrainFor(enc));
  dropOnGround(enc, cell, {
    name: projectile.name,
    qty: 0,
    kind: 'other',
    // Ce qui est en fer le reste en tombant : un champ pourra le reprendre, et
    // qui le ramasse pourra le relancer.
    metallic: true,
    // …et une ARME reste une arme. Sans cela, elle retombait en bagage inerte :
    // on la ramassait, elle figurait bien au sac, mais plus rien ne disait que
    // c'était une épée — donc plus moyen de la dégainer, jamais.
    weapon: projectile.wield,
  });
  push(enc, 'info', `${projectile.name} retombe en (${cell.x}, ${cell.y}).`, {
    actorId: actor.id,
    details: [hit ? 'aux pieds de la cible' : 'le tir a filé au-delà'],
  });
}

/**
 * Ramasse ce qui traîne à portée de main.
 *
 * Se baisser coûte l'**action bonus** en plein combat — le créneau des objets,
 * celui qui n'occupe pas la main principale — et rien du tout hors combat, où
 * personne ne compte les gestes.
 */
function resolvePickUp(
  enc: Encounter,
  actorId: string,
  at: GridPos,
  item: string | undefined,
  qty: number | undefined,
): void {
  const actor = findUnit(enc, actorId);
  if (!actor) return;

  const combat = phaseOf(enc) === 'combat';
  if (combat && actor.bonusActionUsed) {
    push(enc, 'info', `${actor.name} a déjà dépensé son action bonus.`, { actorId: actor.id });
    return;
  }
  if (!cellsWithinReach(actor).some((c) => samePos(c, at))) {
    push(enc, 'info', `${actor.name} est trop loin pour ramasser ça.`, { actorId: actor.id });
    return;
  }

  const pile = groundAt(enc, at);
  if (!pile.length) {
    push(enc, 'info', 'Il n’y a rien à ramasser ici.', { actorId: actor.id });
    return;
  }

  // On copie la pile avant de la vider : sans cela on itère sur ce qu'on retire.
  const voulu = item ? pile.filter((l) => l.name === item) : [...pile];
  const pris: string[] = [];
  for (const line of voulu) {
    const moved = takeFromGround(enc, at, line.name, qty ?? line.qty);
    if (moved <= 0) continue;
    handOver(actor.inventory, line, moved);
    pris.push(`${line.name} ×${moved}`);
  }

  if (!pris.length) {
    push(enc, 'info', 'Il n’y a rien à ramasser ici.', { actorId: actor.id });
    return;
  }
  if (combat) actor.bonusActionUsed = true;
  push(enc, 'loot', `${actor.name} ramasse ${pris.join(', ')}.`, {
    actorId: actor.id,
    details: [`en (${at.x}, ${at.y})`],
  });
}

/* ── Le piège d'ancrage ────────────────────────────────────────────────────
   Un statut qui ne retient personne sur place : ses porteurs vont où ils
   veulent, se rapprochent même les uns des autres — mais ils ne peuvent jamais
   se COLLER. Il reste toujours au moins une case entre deux d'entre eux, et
   c'est ce qui les empêche de se prêter main-forte.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Les statuts qui TENDENT un champ d'écart, lus au catalogue.
 *
 * Il y en avait un seul et son nom était écrit en dur ici, ce qui condamnait
 * tout nouveau champ à ne rien faire : le moteur ne regardait que la clé
 * `ancrage`. C'est le `sustain` du statut qui dit désormais s'il gouverne — par
 * une marque (`governs`) ou par le métal porté (`governsMetal`) — et depuis
 * quoi l'écart se compte (`repelsFromHolder`).
 */
const FIELD_STATUSES = statusCatalog.status_effects.filter(
  (s) => !!(s as StatusEffect).sustain?.governs || !!(s as StatusEffect).sustain?.governsMetal,
) as StatusEffect[];

/** Le champ tendu par ce statut gouverne-t-il `unit` ? */
function fieldGoverns(def: StatusEffect, holder: Combatant, unit: Combatant): boolean {
  const sustain = def.sustain;
  if (!sustain) return false;
  // Le métal ne se marque pas : c'est l'équipement qui désigne, en continu.
  if (sustain.governsMetal) return bearsMetal(unit);
  return !!sustain.governs && bearsMarkOf(unit, sustain.governs, holder);
}

/**
 * L'écart que le piège maintient : une case.
 *
 * Deux porteurs peuvent donc se rapprocher tant qu'ils veulent, jusqu'à se
 * frôler — mais jamais se toucher. C'est exactement ce qu'il faut pour défaire
 * une ligne : on ne se couvre pas mutuellement à deux cases d'écart.
 */
export const ANCHOR_GAP_METERS = CELL_METERS;

/**
 * Les champs d'ancrage sous lesquels `unit` tombe, avec l'écart de chacun.
 *
 * C'est la MARQUE qui commande, pas un statut posé sur les victimes : le champ
 * vit sur son lanceur, et il gouverne quiconque porte sa marque — y compris
 * celui qu'on marquera plus tard. Sans quoi le piège n'aurait tenu que sur la
 * photographie prise à l'incantation, et il aurait suffi de marquer un renfort
 * après coup pour le laisser rejoindre les autres.
 */
function anchorFieldsOn(
  enc: Encounter,
  unit: Combatant,
): { holder: Combatant; gap: number; def: StatusEffect }[] {
  const champs: { holder: Combatant; gap: number; def: StatusEffect }[] = [];
  for (const holder of enc.combatants) {
    if (holder.down) continue;
    for (const def of FIELD_STATUSES) {
      const trap = holder.statuses.find((s) => s.key === def.key && s.sourceId === holder.id);
      if (!trap) continue;
      // Celui qui tend le champ n'est pas tenu par son propre écart quand
      // celui-ci se compte depuis lui : un bouclier ne repousse pas son porteur.
      if (def.sustain?.repelsFromHolder && holder.id === unit.id) continue;
      if (!fieldGoverns(def, holder, unit)) continue;
      champs.push({ holder, gap: trap.gapMeters ?? ANCHOR_GAP_METERS, def });
    }
  }
  return champs;
}

/**
 * De qui `unit` doit se tenir à l'écart, et de combien.
 *
 * Deux géométries, et c'est le statut qui tranche. Un PIÈGE disloque une ligne :
 * il interdit à ses gouvernés de se toucher **entre eux**, et son porteur n'est
 * qu'un point d'où le champ rayonne. Un BOUCLIER ne protège que celui qui le
 * tend : l'écart se compte depuis lui seul, et ses gouvernés restent libres de
 * se serrer les uns contre les autres.
 */
function anchoredWith(enc: Encounter, unit: Combatant): { other: Combatant; gap: number }[] {
  const paires: { other: Combatant; gap: number }[] = [];
  for (const { holder, gap, def } of anchorFieldsOn(enc, unit)) {
    if (def.sustain?.repelsFromHolder) {
      paires.push({ other: holder, gap });
      continue;
    }
    for (const c of enc.combatants) {
      if (c.id === unit.id || c.down) continue;
      if (fieldGoverns(def, holder, c)) paires.push({ other: c, gap });
    }
  }
  return paires;
}

/**
 * Le piège s'oppose-t-il à ce déplacement, et à cause de qui ?
 *
 * Une seule chose est interdite : entrer dans la bulle d'un co-porteur. Tout le
 * reste — s'en rapprocher de loin, tourner autour, fuir — reste libre.
 *
 * La seconde condition traite le cas de ceux que le piège surprend déjà collés :
 * on ne les fige pas sur place, ils peuvent bouger tant qu'ils ne se serrent pas
 * davantage. Sans elle, deux porteurs pris au contact dans un couloir n'auraient
 * plus aucun pas légal, et le sort les paralyserait au lieu de les écarter.
 */
export function anchorBlocker(
  enc: Encounter,
  unit: Combatant,
  to: GridPos,
): Combatant | undefined {
  const apres = { ...unit, pos: to };
  return anchoredWith(enc, unit).find(({ other, gap }) => {
    const ecart = unitDistanceMeters(apres, other);
    if (ecart > gap + 1e-6) return false;
    return ecart < unitDistanceMeters(unit, other) - 1e-6;
  })?.other;
}

/**
 * Jusqu'où le piège peut repousser quelqu'un pour se faire respecter.
 *
 * Trois cases : de quoi sortir d'une mêlée serrée, pas de quoi déménager. Au
 * delà, on considère que la place manque et on le dit plutôt que d'expédier un
 * combattant à l'autre bout du plateau.
 */
const ANCHOR_RETREAT_METERS = CELL_METERS * 3;

/** Où `unit` peut s'écarter au plus court pour respecter le piège, s'il le peut. */
function anchorRetreat(enc: Encounter, unit: Combatant): GridPos | undefined {
  const voisins = anchoredWith(enc, unit);
  if (!voisins.length) return undefined;
  const reach = reachableCells(
    unit,
    ANCHOR_RETREAT_METERS,
    enc.grid,
    terrainFor(enc, unit),
    enc.combatants,
  );

  let best: GridPos | undefined;
  let bestCost = Infinity;
  for (const cell of reach.values()) {
    if (samePos(cell.pos, unit.pos) || cell.cost >= bestCost) continue;
    const debout = { ...unit, pos: cell.pos };
    const encoreColle = voisins.some(
      ({ other, gap }) => unitDistanceMeters(debout, other) <= gap + 1e-6,
    );
    if (encoreColle) continue;
    best = cell.pos;
    bestCost = cell.cost;
  }
  return best;
}

/**
 * Écarte ceux que le piège surprend déjà au contact.
 *
 * Le sort ne se contente pas d'interdire l'avenir : il se fait respecter tout
 * de suite. Ceux qui se touchaient au moment où il tombe reculent d'autant
 * qu'il faut, **et pas un pas de plus** — on cherche la case conforme la moins
 * chère à rejoindre.
 *
 * Ce recul n'est pas un déplacement volontaire : il ne coûte ni endurance ni
 * budget de mouvement, et surtout **il n'ouvre aucune attaque d'opportunité**.
 * On ne punit pas quelqu'un d'avoir été poussé — c'est pourquoi il ne passe pas
 * par `resolveMove`.
 *
 * On procède un par un : écarter le premier suffit souvent à mettre le second
 * en règle, et personne ne recule pour rien.
 */
function enforceAnchorGap(enc: Encounter): void {
  let pousse = false;

  /** Distance au plus proche des lanceurs dont `unit` subit le champ. */
  const auMaitre = (unit: Combatant): number => {
    const champs = anchorFieldsOn(enc, unit);
    return champs.length
      ? Math.min(...champs.map((c) => unitDistanceMeters(unit, c.holder)))
      : Infinity;
  };

  /**
   * L'ordre décide QUI recule, puisque écarter le premier dispense le second.
   *
   * On repousse d'abord celui qui est le plus PRÈS du lanceur. C'est le sens du
   * sort : le champ émane de lui et bouscule ce qui s'en approche, plutôt que
   * d'aller déranger au loin quelqu'un qui n'y est pour rien.
   *
   * Cela ne décide QUE du reculant : une fois désigné, il prend le chemin le
   * plus court pour se dégager, quitte à venir vers le lanceur si c'est de ce
   * côté que la place se trouve.
   *
   * Le classement se fait sur l'état d'AVANT, une fois pour toutes : le tri
   * reste déterministe, donc la rencontre rejouable.
   */
  const ordre = enc.combatants
    .filter((u) => !u.down)
    .map((unit) => ({ unit, distance: auMaitre(unit) }))
    .sort((a, b) => a.distance - b.distance)
    .map((e) => e.unit);

  for (const unit of ordre) {
    // Recalculé à chaque tour de boucle : écarter le précédent a peut-être
    // déjà mis celui-ci en règle, et personne ne recule pour rien.
    const colles = anchoredWith(enc, unit)
      .filter(({ other, gap }) => unitDistanceMeters(unit, other) <= gap + 1e-6)
      .map(({ other }) => other);
    if (!colles.length) continue;

    const place = anchorRetreat(enc, unit);
    if (!place) {
      push(enc, 'info', `${unit.name} ne trouve pas où s’écarter : il reste au contact.`, {
        actorId: unit.id,
        details: [`coincé contre ${colles.map((c) => c.name).join(', ')}`],
      });
      continue;
    }

    const depuis = { ...unit.pos };
    unit.pos = { ...place };
    pousse = true;
    push(enc, 'move', `${unit.name} est repoussé par l’ancrage.`, {
      actorId: unit.id,
      details: [
        `(${depuis.x}, ${depuis.y}) → (${place.x}, ${place.y})`,
        `écarté de ${colles.map((c) => c.name).join(', ')}`,
        'poussé, non volontaire : sans coût ni attaque d’opportunité',
      ],
    });
  }
  // Seulement si quelqu'un a bougé : cette passe tourne après CHAQUE action, et
  // revérifier les laisses sans raison romprait des marques que rien n'a
  // déplacées.
  if (pousse) enforceTethers(enc);
}

/** `unit` porte-t-il la marque que `caster` a posée de sa propre main ? */
const bearsMarkOf = (unit: Combatant, mark: string, caster: Combatant): boolean =>
  unit.statuses.some((s) => s.key === mark && s.sourceId === caster.id);

/**
 * Ce qui manque au LANCEUR pour qu'un échange soit possible, indépendamment de
 * qui il vise.
 *
 * Un échange se fait entre DEUX porteurs de la marque : le lanceur doit donc
 * s'être marqué lui-même. On ne tire pas sur un fil dont on ne tient pas
 * l'autre bout — et le dire séparément évite de faire croire que c'est la cible
 * qui manque.
 */
export function swapAnchorMissing(actor: Combatant, ability: CombatAbility): string | null {
  if (!ability.swap || !ability.swapMark) return null;
  if (bearsMarkOf(actor, ability.swapMark, actor)) return null;
  const nom = STATUS_BY_KEY.get(ability.swapMark)?.name ?? ability.swapMark;
  return `${actor.name} ne porte pas sa propre « ${nom} » : il n’y a rien à permuter de son côté.`;
}

/**
 * Le combattant que `actor` peut permuter en visant `at`, si tout s'y prête.
 *
 * La marque est la première condition, et elle vaut des DEUX CÔTÉS : le lanceur
 * comme sa cible doivent la porter, et c'est lui qui doit les avoir posées — la
 * marque d'un autre n'est pas une poignée qu'on emprunte.
 */
export function swapPartnerAt(
  enc: Encounter,
  actor: Combatant,
  ability: CombatAbility,
  at: GridPos,
): Combatant | undefined {
  if (swapAnchorMissing(actor, ability)) return undefined;
  const key = cellKey(at);
  const partner = enc.combatants.find(
    (c) => c.id !== actor.id && !c.down && occupiedCells(c).some((cell) => cellKey(cell) === key),
  );
  if (!partner) return undefined;
  if (!isValidTarget(enc, ability, actor, partner)) return undefined;
  if (unitDistanceMeters(actor, partner) > ability.rangeMeters + 1e-6) return undefined;
  if (ability.swapMark && !bearsMarkOf(partner, ability.swapMark, actor)) return undefined;
  return partner;
}

/** Ce qui empêche l'échange visé, ou `null` s'il peut se faire. */
function swapBlocker(
  enc: Encounter,
  actor: Combatant,
  ability: CombatAbility,
  at: GridPos,
): string | null {
  // Le défaut du lanceur passe d'abord : dire « personne à permuter ici »
  // quand c'est LUI qui n'est pas marqué envoie chercher au mauvais endroit.
  const ancre = swapAnchorMissing(actor, ability);
  if (ancre) return ancre;

  const partner = swapPartnerAt(enc, actor, ability, at);
  if (!partner) {
    const marque = ability.swapMark ? STATUS_BY_KEY.get(ability.swapMark)?.name : undefined;
    return marque
      ? `Aucun porteur de « ${marque} » à permuter ici (il faut l’avoir marqué soi-même, et l’avoir à portée).`
      : 'Personne à permuter ici.';
  }
  // L'un et l'autre doivent tenir là où l'autre se tenait : deux gabarits
  // différents ne s'échangent pas dans un couloir.
  const both = [actor.id, partner.id];
  if (!fitsAt(enc, actor, partner.pos, both) || !fitsAt(enc, partner, actor.pos, both)) {
    return `${actor.name} et ${partner.name} ne tiennent pas à la place l’un de l’autre.`;
  }
  return null;
}

/** Procède à l'échange et l'écrit au journal. Suppose `swapBlocker` déjà passé. */
function performSwap(
  enc: Encounter,
  actor: Combatant,
  ability: CombatAbility,
  partner: Combatant,
): void {
  const depuis = { ...actor.pos };
  const vers = { ...partner.pos };
  const distance = unitDistanceMeters(actor, partner);
  actor.pos = vers;
  partner.pos = depuis;
  push(enc, 'move', `${actor.name} et ${partner.name} échangent leur place (${ability.name}).`, {
    actorId: actor.id,
    targetId: partner.id,
    details: [
      `${actor.name} (${depuis.x}, ${depuis.y}) → (${vers.x}, ${vers.y})`,
      `${partner.name} (${vers.x}, ${vers.y}) → (${depuis.x}, ${depuis.y})`,
      `${distance.toFixed(1)} m`,
    ],
  });

  // Les deux corps viennent de changer de case en pleine action d'un autre :
  // celui qui atterrit sous le coup le prendra, quel que soit son camp.
  enc.inTheWay = [...new Set([...(enc.inTheWay ?? []), actor.id, partner.id])];
  enforceTethers(enc);
}

/** L'attaque qui sert une frappe gratuite : le poing, ou l'arme en main. */
export function strikeWeaponFor(
  unit: Combatant,
  slot: 'unarmed' | 'weapon',
): CombatAbility | undefined {
  return unit.abilities.find((a) =>
    slot === 'unarmed' ? a.unarmed : a.kind === 'weapon' && !a.unarmed,
  );
}

/**
 * Cibles que la frappe gratuite en attente peut atteindre, de la plus proche à
 * la plus lointaine. La vue s'en sert pour proposer le choix ; le moteur pour
 * le valider.
 */
export function pendingStrikeTargets(enc: Encounter): Combatant[] {
  const pending = enc.pendingStrike;
  const actor = pending ? findUnit(enc, pending.actorId) : undefined;
  const strike = actor && pending ? strikeWeaponFor(actor, pending.slot) : undefined;
  if (!actor || !strike) return [];
  return enc.combatants
    .filter((c) => !c.down && isValidTarget(enc, strike, actor, c))
    .filter((c) => unitDistanceMeters(actor, c) <= strike.rangeMeters + 1e-6)
    .sort((a, b) => unitDistanceMeters(actor, a) - unitDistanceMeters(actor, b));
}

/**
 * Met une frappe gratuite en attente de cible.
 *
 * Elle n'est pas portée d'office : c'est au joueur de désigner qui il frappe,
 * ou de passer. Le moteur ne choisit à sa place que dans le cas où il n'y a
 * rien à choisir — personne à portée, ou rien en main pour frapper.
 */
function offerFreeStrike(
  enc: Encounter,
  actor: Combatant,
  slot: CombatEnchant['target'],
  source: string,
): void {
  if (!strikeWeaponFor(actor, slot)) {
    push(enc, 'info', `${actor.name} n’a rien pour porter la frappe de « ${source} ».`, {
      actorId: actor.id,
    });
    return;
  }

  enc.pendingStrike = { actorId: actor.id, slot, source };
  if (!pendingStrikeTargets(enc).length) {
    enc.pendingStrike = undefined;
    push(enc, 'info', `Frappe gratuite de « ${source} » : personne à portée.`, {
      actorId: actor.id,
    });
    return;
  }

  push(enc, 'info', `${source} — frappe gratuite offerte : désignez une cible ou passez.`, {
    actorId: actor.id,
  });
}

/** Porte la frappe gratuite en attente sur la cible désignée. */
function resolvePendingStrike(enc: Encounter, targetId: string, rng: Rng): void {
  const pending = enc.pendingStrike;
  if (!pending) return;
  const actor = findUnit(enc, pending.actorId);
  const target = pendingStrikeTargets(enc).find((c) => c.id === targetId);
  const strike = actor ? strikeWeaponFor(actor, pending.slot) : undefined;
  if (!actor || !target || !strike) {
    push(enc, 'info', 'Cette cible n’est pas à portée de la frappe gratuite.');
    return;
  }

  enc.pendingStrike = undefined;
  push(enc, 'attack', `${pending.source} — frappe gratuite sur ${target.name}.`, {
    actorId: actor.id,
    targetId: target.id,
    details: [`${strike.name}, sans coût ni action`],
  });
  resolveAgainst(enc, actor, strike, target, rng);
}

function resolveUse(
  enc: Encounter,
  actorId: string,
  abilityId: string,
  at: GridPos,
  targetIds: string[] | undefined,
  rng: Rng,
  item?: string,
): void {
  const actor = findUnit(enc, actorId);
  let ability = actor?.abilities.find((a) => a.id === abilityId);
  if (!actor || !ability) return;

  const refusal = cannotUse(enc, actor, ability, at);
  if (refusal) {
    push(enc, 'info', refusal, { actorId: actor.id });
    return;
  }

  // Une cible peut se dérober avant que le coup ne parte. La fenêtre s'ouvre
  // TOUT DE SUITE : à la reprise, l'action est rejouée depuis le début, donc
  // rien ne doit avoir été prélevé ni tiré aux dés d'ici là.
  const asked = enc.suspended?.asked ?? [];
  const defence = defenceWindow(
    enc,
    actor,
    unitsInEffect(enc, actor, ability, at, targetIds),
    asked,
    rng,
  );
  if (defence.window) {
    // Ceux qui viennent de rater leur réflexe rejoignent la liste des déjà
    // sollicités : sans cela, la reprise de l'action leur redonnerait un jet,
    // et un même coup se verrait paré au deuxième essai.
    suspendFor(enc, defence.window, { type: 'use', actorId, abilityId, at, targetIds, item }, [
      ...asked,
      ...defence.rolled,
    ]);
    return;
  }
  enc.suspended = undefined;

  // Un statut qui se joue au moment d'agir : on tente le jet ici.
  if (!obeys(enc, actor, `« ${ability.name} »`, rng)) return;

  // La matière se choisit AVANT que quoi que ce soit ne soit prélevé : c'est
  // elle qui fixe le prix, les dégâts et la difficulté du geste.
  let shaping: EarthShaping | undefined;
  if (ability.shapesMaterial) {
    const forme = shapedAbility(enc, actor, ability, item);
    if (!forme) {
      push(enc, 'info', `${actor.name} n’a aucun matériau à façonner ici.`, { actorId: actor.id });
      return;
    }
    ability = forme.ability;
    shaping = forme.shaping;
    if (forme.shaping) {
      push(enc, 'info', forme.shaping.note, {
        actorId: actor.id,
        details: [
          forme.shaping.stable ? 'forme stable' : 'se décomposera sans soutien',
          forme.shaping.tier,
        ],
      });
    }
  }

  // Le coût réel dépend de l'ambiance : un sort de ténèbres coûte moins la nuit.
  const manaSpent = effectiveManaCost(enc, ability);

  // Échange de place : les deux corps permutent. Jouée en réaction, c'est ce
  // qui met le lanceur au-devant du coup destiné à un allié — ou qui arrache
  // l'assaillant marqué à son propre élan, et son attaque se perd dans le vide.
  if (ability.swap) {
    const empeche = swapBlocker(enc, actor, ability, at);
    const partner = swapPartnerAt(enc, actor, ability, at);
    if (empeche || !partner) {
      push(enc, 'info', empeche ?? 'Personne à permuter ici.', { actorId: actor.id });
      return;
    }
    performSwap(enc, actor, ability, partner);
  }

  // Téléportation : le lanceur se déplace, sans se soucier du terrain ni de qui
  // se trouve entre les deux. Jouée en réaction, c'est ce qui le sort de
  // l'allonge de son assaillant avant que le coup ne parte.
  if (ability.teleport) {
    const occupied = new Set(
      enc.combatants.filter((c) => c.id !== actor.id).flatMap((c) => occupiedCells(c).map(cellKey)),
    );
    const libre = inBounds(at, enc.grid) && !occupied.has(cellKey(at));
    const distance = unitToCellMeters(actor, at);
    if (!libre || distance > teleportRangeOf(ability) + 1e-6) {
      push(enc, 'info', `${actor.name} ne peut pas se déplacer là.`, { actorId: actor.id });
      return;
    }
    const depuis = { ...actor.pos };
    actor.pos = { ...at };
    push(enc, 'move', `${actor.name} se déplace instantanément (${ability.name}).`, {
      actorId: actor.id,
      details: [`(${depuis.x}, ${depuis.y}) → (${at.x}, ${at.y}) — ${distance.toFixed(1)} m`],
    });
    enforceTethers(enc);
  }

  // Recalculées APRÈS la fenêtre : une cible qui s'est dérobée n'y est plus.
  const targets = unitsInEffect(enc, actor, ability, at, targetIds);

  actor.mana -= manaSpent;
  actor.endurance -= ability.enduranceCost;
  // Reprendre haleine (la garde) : la réserve remonte, plafonnée au maximum.
  if (ability.restoreEndurance) {
    const max = effectiveStat(actor, 'endurance');
    actor.endurance = Math.min(max, actor.endurance + ability.restoreEndurance);
  }
  updateWinded(enc, actor);
  // Chacun son créneau : l'arme secondaire et les objets prennent l'action
  // bonus, tout le reste prend l'action.
  if (ability.bonusAction) actor.bonusActionUsed = true;
  else actor.actionUsed = true;

  // Le sac paie sa part : une flèche décochée, une fiole vidée.
  let stockLine = '';
  if (ability.consumes) {
    const left = consume(actor, ability.consumes.item, ability.consumes.qty);
    stockLine = `−${ability.consumes.qty} ${ability.consumes.item} (reste ${left})`;
  }

  push(
    enc,
    'attack',
    `${actor.name} utilise ${ability.name}${targets.length ? ` sur ${targets.map((t) => t.name).join(', ')}` : ''}.`,
    {
      actorId: actor.id,
      details: [
        manaSpent
          ? `−${manaSpent} mana (reste ${actor.mana})` +
            (manaSpent !== ability.manaCost ? ` — base ${ability.manaCost}, ambiance` : '')
          : '',
        ability.enduranceCost ? `−${ability.enduranceCost} endurance (reste ${actor.endurance})` : '',
        stockLine,
      ].filter(Boolean),
    },
  );

  // Un mur se trouve sur la case visée et personne d'autre : c'est LUI qu'on
  // frappe. Il n'esquive pas, il ne pare pas — il encaisse, et il tombe.
  const mur = targets.length ? undefined : wallAt(enc, at);
  if (mur) {
    for (const composante of ability.damages) {
      const brut =
        rng.int(composante.min, composante.max) + componentBonus(actor, composante);
      const inflige = damageWall(mur, brut, composante.type);
      push(enc, 'damage', `${mur.name} encaisse ${inflige} PV (${mur.hp}/${mur.maxHp}).`, {
        actorId: actor.id,
        details: [damageLabel(composante.type)],
      });
    }
    if (mur.hp <= 0) {
      removeWall(enc, mur.id);
      push(enc, 'info', `${mur.name} s’effondre.`, { actorId: actor.id });
    }
  } else if (!targets.length) {
    push(enc, 'info', 'Aucune cible valide dans la zone.', { actorId: actor.id });
  }

  // Le projectile quitte le sac AVANT de voler : ses dégâts et son type sont
  // ceux de l'objet, versés dans la composante vide que le palier a réservée
  // pour eux. Le `scaling` du nœud — la poussée du lanceur — y est déjà.
  let armed = ability;
  let projectile: MetalItem | undefined;
  if (ability.throwsMetal) {
    projectile = spendThrownMetal(enc, actor, item);
    if (!projectile) {
      push(enc, 'info', `${actor.name} n’a rien de ferreux à projeter.`, { actorId: actor.id });
      return;
    }
    const [composante] = ability.damages;
    armed = {
      ...ability,
      name: `${ability.name} (${projectile.name})`,
      damages: [
        {
          ...composante,
          min: projectile.thrown.min,
          max: projectile.thrown.max,
          type: projectile.thrown.type,
        },
      ],
    };
  }

  /** Le tir a-t-il porté ? C'est ce qui décide d'où l'objet finira par terre. */
  let touche = false;
  for (const target of targets) {
    if (resolveAgainst(enc, actor, armed, target, rng)) touche = true;
    // La prise se joue APRÈS le reste : un sort qui arrache peut aussi blesser,
    // et l'ordre inverse aurait volé l'arme d'un mort.
    if (ability.pullsMetal && !target.down) {
      resolveMetalPull(enc, actor, ability, target, item, rng);
    }
  }

  // Le mur se dresse une fois le prix payé : il est ce que le sort PRODUIT, il
  // ne vise personne. Un mur façonné dans le sol reste debout indéfiniment ;
  // conjuré, il se décomposera (cf. `ageWalls`).
  if (ability.raisesWall) {
    const mur = raiseWall(
      enc,
      actor,
      at,
      ability.raisesWall,
      shaping?.material.key ?? 'granite',
      {
        stable: shaping?.stable ?? true,
        duration: ability.duration ?? 3,
        effectFactor: shaping?.effectFactor ?? 1,
      },
    );
    if (!mur) {
      push(enc, 'info', 'Pas une case libre pour dresser le mur.', { actorId: actor.id });
    } else {
      push(enc, 'info', `${mur.name} se dresse — ${mur.maxHp} PV.`, {
        actorId: actor.id,
        details: [
          `${mur.cells.length} case${mur.cells.length > 1 ? 's' : ''}`,
          mur.remaining === WALL_PERMANENT ? 'permanent' : `${mur.remaining} tours`,
        ],
      });
    }
  }

  // Personne à dépouiller sur la case visée : c'est donc le SOL qu'on aimante.
  // Une seule prise par incantation, quoi qu'il arrive — viser quelqu'un debout
  // sur un tas de ferraille ne doit pas rapporter deux fois.
  if (ability.pullsMetal && !targets.length) {
    resolveGroundPull(enc, actor, ability, at, item);
  }

  // L'objet retombe. Il ne disparaît jamais : sans cela, projeter son épée
  // revenait à la détruire, et le sort n'était qu'une attaque qui coûte une arme.
  if (projectile) landProjectile(enc, actor, projectile, at, touche, rng);

  // La marque se consume dans l'explosion : c'est ce qui empêche d'en faire une
  // source de dégâts qu'on répéterait sans jamais retourner marquer personne.
  if (ability.consumesMark && ability.marksTargets) {
    for (const target of targets) consumeMark(enc, target, ability.marksTargets, actor);
  }

  // Tout champ d'ancrage tendu se fait respecter après CHAQUE action : celle
  // qui vient de le tendre, mais aussi celle qui vient de marquer un renfort.
  // C'est la marque qui commande, donc la conformité se rejoue quand elle
  // change de porteurs.
  enforceAnchorGap(enc);

  // Frappe gratuite accordée par un bonus de classe. Elle est OFFERTE, pas
  // portée : le joueur choisira sa cible. Elle vient après la pose de
  // l'enchantement, donc le coup profitera du revêtement qu'on vient de poser.
  if (ability.freeStrike) offerFreeStrike(enc, actor, ability.freeStrike, ability.name);

  // Contre-coup : ce que le lanceur paie de sa personne.
  const recoil = ability.recoil;
  if (recoil?.min) {
    const amount =
      rng.int(recoil.min, recoil.max ?? recoil.min) + resolveScaling(actor, recoil.scaling);
    const done = dealDamage(enc, actor, Math.round(amount), recoil.type ?? 'true');
    push(enc, 'damage', `Contre-coup : ${actor.name} subit ${done.applied} PV.`, {
      actorId: actor.id,
      details: [done.detail, recoil.note ?? ''].filter(Boolean),
    });
  }
  if (recoil?.mods?.length && ability.duration) {
    addEffect(actor, {
      id: `${ability.id}-recoil-${actor.id}`,
      name: `${ability.name} (contre-coup)`,
      remaining: ability.duration,
      sourceId: actor.id,
      mods: recoil.mods.map((m) => ({ stat: m.stat, value: -Math.round(m.value) })),
    });
  }

  if (ability.weather) {
    enc.weather = ability.weather;
    push(enc, 'info', `La météo change : ${weatherByKey(ability.weather)?.name ?? ability.weather}.`);
  }
}

/* ── Point d'entrée ────────────────────────────────────────────────────────── */

/**
 * Applique une action et renvoie la rencontre suivante. L'état d'entrée n'est
 * jamais modifié : la copie permet aux signaux Angular de détecter le
 * changement, et surtout de garder l'état précédent intact si une action doit
 * être annulée.
 */
export function applyAction(encounter: Encounter, action: CombatAction): Encounter {
  const enc: Encounter = structuredClone(encounter);
  const rng = rngOf(enc);
  // Le trajet appartient à l'action qui le produit : le traîner d'une action à
  // l'autre ferait rejouer une marche déjà faite.
  enc.walked = undefined;
  perform(enc, action, rng);
  // Un corps poussé dans la ligne de mire ne l'est que le temps que le coup
  // parte. Tant qu'une action reste suspendue, il y est encore : c'est le cas
  // où le nouvel occupant demande à son tour à réagir.
  if (!enc.suspended) enc.inTheWay = undefined;
  commit(enc, rng);

  if (isOver(enc) && enc.started) {
    const winner = activeTeams(enc)[0];
    const already = enc.log.some((l) => l.text.startsWith('Combat terminé'));
    if (!already) {
      push(enc, 'info', `Combat terminé — ${winner ? teamLabel(winner) : 'personne'} l’emporte.`);
      // La table sort du combat d'elle-même : ce qui vient ensuite — fouiller,
      // souffler, repartir — est la suite naturelle, pas un autre écran à aller
      // chercher. Le MJ peut toujours revenir en combat à la main.
      enc.phase = 'exploration';
      push(enc, 'info', PHASE_ENTRY.exploration);
    }
  }
  return enc;
}

/**
 * Exécute une action sur une rencontre DÉJÀ clonée.
 *
 * Séparé de `applyAction` parce qu'une réaction doit pouvoir reprendre l'action
 * qu'elle a interrompue : `perform` s'appelle alors lui-même, sans recloner ni
 * réinitialiser le générateur de dés.
 */
function perform(enc: Encounter, action: CombatAction, rng: Rng): void {
  switch (action.type) {
    case 'start':
      start(enc, rng);
      break;

    case 'move':
      resolveMove(enc, action.actorId, action.to, rng);
      break;

    case 'use':
      resolveUse(enc, action.actorId, action.abilityId, action.at, action.targetIds, rng, action.item);
      break;

    case 'pickUp':
      resolvePickUp(enc, action.actorId, action.at, action.item, action.qty);
      break;

    case 'equip':
      resolveEquip(enc, action.actorId, action.item, action.slot);
      break;

    case 'unequip':
      resolveUnequip(enc, action.actorId, action.slot);
      break;

    case 'react': {
      const pending = enc.pendingReaction;
      const reactor = pending ? findUnit(enc, pending.actorId) : undefined;
      const ability = reactor?.abilities.find((a) => a.id === action.abilityId);
      if (!pending || !reactor || !ability || !pending.options.includes(action.abilityId)) {
        push(enc, 'info', 'Cette réaction n’est pas disponible.');
        break;
      }
      // La réaction se dépense : une seule par round, c'est ce qui force à
      // choisir entre se protéger et punir un désengagement.
      reactor.reactionUsed = true;
      push(enc, 'attack', `${reactor.name} réagit : ${ability.name}.`, {
        actorId: reactor.id,
        details: [pending.reason],
      });

      // La réaction est une action à part entière pour le moteur : elle va
      // écrire dans `enc.suspended` comme n'importe quelle autre. On met donc
      // l'action interrompue de côté le temps de la résoudre, sinon la reprise
      // ne trouverait plus rien à reprendre.
      const interrompue = enc.suspended;
      enc.suspended = undefined;

      // Une réaction ne consomme pas l'action du tour, et n'en dépend pas non
      // plus : on l'efface le temps de la résoudre, sinon `cannotUse` la
      // refuserait à quiconque a déjà joué son tour — c'est-à-dire à peu près
      // tout le monde, puisqu'on réagit pendant le tour d'un autre.
      //
      // Les DEUX créneaux, car une dague de main gauche riposte comme une
      // autre : la laisser entamer l'action bonus du tour suivant ferait payer
      // deux fois une seule riposte.
      const hadAction = reactor.actionUsed;
      const hadBonus = reactor.bonusActionUsed;
      reactor.actionUsed = false;
      reactor.bonusActionUsed = false;
      resolveUse(enc, reactor.id, action.abilityId, action.at ?? pending.at, undefined, rng);
      reactor.actionUsed = hadAction;
      reactor.bonusActionUsed = hadBonus;

      enc.suspended = interrompue;
      resumeSuspended(enc, rng);
      break;
    }

    case 'skipReaction': {
      const pending = enc.pendingReaction;
      if (pending) {
        push(enc, 'info', `${findUnit(enc, pending.actorId)?.name} ne réagit pas.`, {
          actorId: pending.actorId,
        });
      }
      resumeSuspended(enc, rng);
      break;
    }

    case 'freeStrike':
      resolvePendingStrike(enc, action.targetId, rng);
      break;

    case 'skipStrike':
      if (enc.pendingStrike) {
        push(enc, 'info', `${enc.pendingStrike.source} — frappe gratuite déclinée.`, {
          actorId: enc.pendingStrike.actorId,
        });
        enc.pendingStrike = undefined;
      }
      break;

    case 'endTurn':
      // Passer la main renonce implicitement à une frappe encore en attente :
      // elle ne doit pas survivre au tour de son bénéficiaire.
      if (enc.pendingStrike) {
        push(enc, 'info', `${enc.pendingStrike.source} — frappe gratuite perdue (fin du tour).`, {
          actorId: enc.pendingStrike.actorId,
        });
        enc.pendingStrike = undefined;
      }
      advance(enc, rng);
      break;

    // ── Interventions manuelles du MJ. Elles passent par le moteur comme le
    //    reste, donc elles apparaissent au journal : une correction à la main
    //    ne doit pas être un trou dans le compte rendu.
    case 'damage': {
      const target = findUnit(enc, action.targetId);
      if (target) {
        const done = dealDamage(enc, target, action.amount, 'true');
        push(enc, 'damage', `${target.name} perd ${done.applied} PV (MJ).`, {
          targetId: target.id,
          details: [action.note ?? 'ajustement manuel'],
        });
      }
      break;
    }

    case 'heal': {
      const target = findUnit(enc, action.targetId);
      if (target) {
        const done = heal(enc, target, action.amount);
        push(enc, 'heal', `${target.name} récupère ${done.applied} PV (MJ).`, {
          targetId: target.id,
          details: [done.detail],
        });
      }
      break;
    }

    case 'applyStatus': {
      const target = findUnit(enc, action.targetId);
      if (target) applyStatus(enc, target, action.status, undefined, { duration: action.duration });
      break;
    }

    case 'clearStatus': {
      const target = findUnit(enc, action.targetId);
      if (target) clearStatus(enc, target, action.status);
      break;
    }

    case 'setGeology': {
      enc.geology = [...action.materials];
      const noms = action.materials
        .map((k) => MATERIAL_BY_KEY.get(k)?.name ?? k)
        .join(', ');
      push(enc, 'info', noms ? `Géologie de la scène : ${noms}.` : 'Aucune géologie exploitable ici.');
      break;
    }

    case 'breakWall': {
      const abattu = removeWall(enc, action.wallId);
      if (abattu) push(enc, 'info', `${abattu.name} est abattu.`);
      break;
    }

    case 'setWeather':
      enc.weather = action.weather || undefined;
      push(
        enc,
        'info',
        action.weather
          ? `Météo : ${weatherByKey(action.weather)?.name ?? action.weather}.`
          : 'Le ciel se dégage.',
      );
      break;

    case 'setDaytime': {
      enc.daytime = action.daytime || undefined;
      const moment = action.daytime ? daytimeByKey(action.daytime) : undefined;
      // Choisir un moment à la main règle aussi l'horloge : sans ça, les deux
      // se contrediraient dès la première tranche de temps écoulée. Le MJ qui
      // veut vraiment les découpler pose le verrou.
      const start = action.daytime ? startOfDaytime(action.daytime) : undefined;
      if (start !== undefined && !enc.daytimeLocked) {
        enc.clock = { ...clockOf(enc), seconds: start };
      }
      push(enc, 'time', moment ? `${moment.name} — ${formatClock(clockOf(enc))}.` : 'Heure indéterminée.', {
        details: moment ? [moment.description] : undefined,
      });
      break;
    }

    case 'lockDaytime':
      enc.daytimeLocked = action.locked;
      push(
        enc,
        'time',
        action.locked
          ? `Moment de la journée figé sur ${daytimeByKey(enc.daytime ?? '')?.name ?? 'le réglage courant'} — l’horloge continue sans lui.`
          : 'Le moment de la journée suit de nouveau l’horloge.',
      );
      if (!action.locked) syncDaytime(enc);
      break;

    /* ── Hors combat ──────────────────────────────────────────────────────
       Les mêmes règles que le reste : tout passe par le moteur, donc tout
       laisse une trace. Une nuit de marche se relit au journal comme un coup
       d'épée.
    ───────────────────────────────────────────────────────────────────── */

    case 'walk': {
      const actor = findUnit(enc, action.actorId);
      if (actor) walkTo(enc, actor, action.to);
      break;
    }

    case 'setSwim': {
      const actor = findUnit(enc, action.actorId);
      if (!actor) break;
      actor.canSwim = action.canSwim;
      push(
        enc,
        'info',
        action.canSwim
          ? `${actor.name} sait nager — l’eau profonde ne l’arrête plus.`
          : `${actor.name} ne sait pas nager.`,
        { actorId: actor.id },
      );
      break;
    }

    case 'door':
      resolveDoor(enc, action.cell, action.act, action.actorId ? findUnit(enc, action.actorId) : undefined, rng);
      break;

    case 'setPhase': {
      const before = phaseOf(enc);
      if (before === action.phase) break;
      enc.phase = action.phase;
      push(enc, 'info', PHASE_ENTRY[action.phase]);
      break;
    }

    case 'passTime':
      passTime(enc, action.seconds, action.activity, { note: action.note });
      break;

    case 'setClock':
      enc.clock = { day: Math.max(1, Math.round(action.day)), seconds: Math.max(0, Math.round(action.seconds)) };
      push(enc, 'time', `L’heure est réglée sur ${formatClock(clockOf(enc))}.`);
      syncDaytime(enc);
      break;

    case 'search': {
      const target = findUnit(enc, action.targetId);
      const actor = action.actorId ? findUnit(enc, action.actorId) : undefined;
      if (target) searchBody(enc, target, actor, rng);
      break;
    }

    case 'takeLoot': {
      const target = findUnit(enc, action.targetId);
      const actor = findUnit(enc, action.actorId);
      if (target && actor) takeFrom(enc, target, actor, action.item, action.qty);
      break;
    }

    case 'restore': {
      const source = action.source ?? 'ravitaillement';
      // Le repas du groupe ne nourrit pas les adversaires assis en face : sans
      // ce filtre, un geste du camp remplissait les jauges de tout le monde,
      // ennemis compris.
      const targets = action.actorId
        ? [findUnit(enc, action.actorId)].filter((u): u is Combatant => !!u)
        : living(enc).filter((u) => !action.team || u.team === action.team);
      let any = false;
      for (const unit of targets) any = fillGauge(enc, unit, action.gauge, action.notches, source) || any;
      if (!any) {
        push(enc, 'survival', `${source} — personne n’en avait besoin.`);
      }
      break;
    }

    case 'eat': {
      const actor = findUnit(enc, action.actorId);
      const line = actor?.inventory.find((i) => i.name === action.item);
      if (!actor || !line || !nourishmentOf(line)) {
        push(enc, 'info', 'Rien de nourrissant sous ce nom dans le sac.');
        break;
      }
      consumeFood(enc, actor, line);
      break;
    }

    case 'meal': {
      const targets = action.actorId
        ? [findUnit(enc, action.actorId)].filter((u): u is Combatant => !!u)
        : living(enc).filter((u) => !action.team || u.team === action.team);

      const affames: string[] = [];
      for (const unit of targets) {
        if (unit.down) continue;
        // Le mieux garni d'abord : on entame la grosse ration avant les restes.
        const line = unit.inventory
          .filter((i) => i.qty > 0 && nourishmentOf(i)?.gauge === action.gauge)
          .sort((a, b) => (nourishmentOf(b)?.notches ?? 0) - (nourishmentOf(a)?.notches ?? 0))[0];

        if (!line) {
          if (notchesLeft(action.gauge, unit.survival) < gaugeOf(action.gauge).segments) {
            affames.push(unit.name);
          }
          continue;
        }
        consumeFood(enc, unit, line);
      }

      if (affames.length) {
        const manque = action.gauge === 'thirst' ? 'à boire' : 'à manger';
        push(enc, 'survival', `Rien ${manque} pour ${affames.join(', ')}.`, {
          details: ['Les vivres manquent dans leur sac.'],
        });
      }
      break;
    }

    case 'provision': {
      const actor = action.actorId ? findUnit(enc, action.actorId) : living(enc)[0];
      if (!actor) {
        push(enc, 'info', 'Personne pour porter le ravitaillement.');
        break;
      }
      const qty = stow(actor, action.item, action.qty ?? 1);
      push(
        enc,
        'survival',
        `${actor.name} emporte ${action.item} ×${qty}${action.source ? ` — ${action.source}` : ''}.`,
        { actorId: actor.id },
      );
      break;
    }

    case 'hunt': {
      const actor = findUnit(enc, action.actorId);
      if (!actor) {
        push(enc, 'info', 'Personne pour mener la battue.');
        break;
      }

      const roll = rng.d100();
      // La Nature pousse le résultat vers le haut de la table : savoir lire une
      // coulée retire d'autant de chances de rentrer bredouille.
      const bonus = huntBonus(actor.skills);
      const outcome = huntOutcome(roll + bonus);
      // La prise revient à CELUI QUI A LANCÉ la chasse : c'est son sac qui la
      // porte. Le partage, ensuite, se fait à la main comme le reste.
      if (outcome.nourishment) stow(actor, outcome.nourishment.name, 1);

      push(
        enc,
        'survival',
        outcome.nourishment
          ? `${actor.name} chasse : ${outcome.label.toLowerCase()} — ${outcome.nourishment.name}.`
          : `${actor.name} chasse et rentre bredouille.`,
        {
          actorId: actor.id,
          details: [
            bonus
              ? `d100 : ${roll} ${signed(bonus)} (Nature) = ${roll + bonus} — ${outcome.label}`
              : `d100 : ${roll} — ${outcome.label} (${outcome.chance} %)`,
            outcome.flavour,
          ],
        },
      );
      break;
    }

    case 'refill': {
      const remplies: string[] = [];
      for (const unit of living(enc)) {
        if (action.team && unit.team !== action.team) continue;
        const vide = unit.inventory.find((i) => i.name === EMPTY_WATERSKIN && i.qty > 0);
        if (!vide) continue;
        const pleine = unit.inventory.find((i) => i.name === WATERSKIN);
        if (pleine) pleine.qty += vide.qty;
        else unit.inventory.push({ name: WATERSKIN, qty: vide.qty, kind: 'other' });
        unit.inventory.splice(unit.inventory.indexOf(vide), 1);
        remplies.push(unit.name);
      }
      push(
        enc,
        'survival',
        remplies.length
          ? `Les outres de ${remplies.join(', ')} sont remplies.`
          : 'Aucune outre vide à remplir.',
      );
      break;
    }

    case 'setSurvival': {
      const actor = findUnit(enc, action.actorId);
      if (!actor?.survival) break;
      const gauge = gaugeOf(action.gauge);
      actor.survival = {
        ...actor.survival,
        [action.gauge]: elapsedForNotches(action.gauge, action.notches),
      };
      push(
        enc,
        'survival',
        `${actor.name} — ${gauge.label.toLowerCase()} : ${stageOf(action.gauge, actor.survival)} (${notchesLeft(action.gauge, actor.survival)}/${gauge.segments}) — MJ.`,
        { actorId: actor.id },
      );
      break;
    }
  }
}

/** Ce que le journal écrit en entrant dans une phase. */
const PHASE_ENTRY: Record<EncounterPhase, string> = {
  setup: 'Retour au montage de la rencontre.',
  combat: 'La table repasse en combat.',
  exploration: 'Hors combat — le temps reprend son cours.',
};

export const teamLabel = (team: string): string =>
  team === 'allies' ? 'le groupe' : team === 'ennemis' ? 'les adversaires' : 'les neutres';

/**
 * Cases atteignables par le combattant actif, pour la surbrillance de la vue.
 *
 * Le budget est celui que le SOUFFLE permet, pas celui des jambes : montrer une
 * case qu'on refusera ensuite serait une fausse promesse. Un combattant à bout
 * voit donc sa portée fondre à un pas, ce qui se lit d'un coup d'œil.
 */
export function movementOverlay(enc: Encounter, unit: Combatant): Map<string, number> {
  const budget = affordableMovement(unit);
  const reach = reachableCells(unit, budget, enc.grid, terrainFor(enc, unit), enc.combatants);
  const out = new Map<string, number>();
  for (const [key, cell] of reach) {
    if (samePos(cell.pos, unit.pos)) continue;
    // Une case que le piège d'ancrage refusera n'a rien à faire en vert : on
    // ne propose pas un pas pour le reprendre au clic.
    if (anchorBlocker(enc, unit, cell.pos)) continue;
    out.set(key, cell.cost);
  }
  return out;
}

/**
 * Le trajet que `unit` emprunterait pour rejoindre `to`, case par case.
 *
 * Même calcul que celui qui autorise le déplacement : ce que la vue dessine est
 * donc exactement ce que le pion parcourra, contournements compris. Vide si la
 * case est hors budget — un saut n'a pas de trajet.
 *
 * `budget` permet de lire le trajet avec une autre réserve que celle du moment,
 * ce dont l'animation a besoin : quand elle s'ouvre, le mouvement est déjà
 * décompté, et la réserve restante ne suffirait plus à retrouver la route.
 */
export function movementPath(
  enc: Encounter,
  unit: Combatant,
  to: GridPos,
  budget = affordableMovement(unit),
): GridPos[] {
  const reach = reachableCells(unit, budget, enc.grid, terrainFor(enc, unit), enc.combatants);
  return pathTo(reach, to);
}
