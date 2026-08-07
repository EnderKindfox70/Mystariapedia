import damageCatalog from '../../../public/resources/json/damage_type.json';
import daytimeCatalog from '../../../public/resources/json/daytime.json';
import statusCatalog from '../../../public/resources/json/status_effects.json';
import weatherCatalog from '../../../public/resources/json/weathers.json';
import { AttributeKey, StatKey } from '../character/character.types';
import { abilityModifier } from '../character/universe-data';
import { Daytime, SpellRetaliate, SpellScalingSource, StatusEffect, Weather } from '../wiki.types';
import {
  AbilityDamage,
  AbilityScaling,
  ActiveEffect,
  ActiveStatus,
  Combatant,
  CombatAbility,
  CombatAction,
  CombatEnchant,
  Encounter,
  GridPos,
  LogEntry,
  LogKind,
  PendingReaction,
  ReactionTrigger,
} from './combat.types';
import { damageLabel } from './damage-labels';
import { Rng } from './dice';
import {
  CELL_METERS,
  cellKey,
  cellsInShape,
  inBounds,
  hasLineOfSight,
  movementMeters,
  occupiedCells,
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

/** Points de précision par point de maîtrise. */
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

/** Somme des modificateurs actifs (statuts + effets) portant sur une clé. */
function modifiersFor(unit: Combatant, key: SpellScalingSource): number {
  let total = 0;
  for (const effect of unit.effects) {
    for (const mod of effect.mods) if (mod.stat === key) total += mod.value;
  }
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
 */
export function precisionOf(unit: Combatant, ability: CombatAbility): number {
  const attribute = ability.attackAttribute ?? 'dexterite';
  const mod = abilityModifier(effectiveAttribute(unit, attribute));
  const essouffle = unit.winded ? WINDED_PRECISION_PENALTY : 0;
  return mod * PRECISION_PER_MOD + unit.proficiency * PRECISION_PER_PROFICIENCY - essouffle;
}

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
function toThreshold(points: number, causes: string[]): Breakdown {
  const steps = Math.round(points / PRECISION_PER_STEP);
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
  const precision = precisionOf(actor, ability);
  const evade = naturalEvade(target);

  const causes: string[] = [];
  if (precision) causes.push('précision');
  if (evade) causes.push('esquive');
  if (gene) causes.push('tir gêné');
  return toThreshold(precision - evade - gene, causes);
}

/**
 * Explique un seuil en une poignée de mots.
 *
 * C'est la ligne qui lève LA question que le barème pose forcément à qui vient
 * du d20 classique : « mon modificateur est-il ajouté au dé ? ». Non — il
 * déplace le seuil. Le dire à chaque jet coûte quelques caractères et évite de
 * l'expliquer à chaque partie.
 */
function explainThreshold(b: Breakdown): string {
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
  if (ability.kind !== 'weapon' && ability.kind !== 'class' && ability.kind !== 'natural') return [];
  const slot: CombatEnchant['target'] = ability.unarmed ? 'unarmed' : 'weapon';
  return unit.effects
    .map((e) => e.enchant)
    .filter((e): e is CombatEnchant => e?.target === slot)
    .map((e) => e.damage);
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
  return ability.damages.flatMap((component) => [component, ...extra]);
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

/* ── Cibles valides ────────────────────────────────────────────────────────── */

/** Une capacité peut-elle légitimement affecter cette unité ? */
export function isValidTarget(
  ability: CombatAbility,
  actor: Combatant,
  target: Combatant,
): boolean {
  const targets = ability.targets.length ? ability.targets : ['enemy' as const];
  if (targets.includes('everyone')) return true;
  if (target.id === actor.id) return targets.includes('self');
  const ally = target.team === actor.team;
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

  if (ability.shape.kind === 'targets') {
    const ids = (explicitIds ?? []).slice(0, ability.shape.count);
    return ids
      .map((id) => findUnit(enc, id))
      .filter((u): u is Combatant => !!u && !u.down && isValidTarget(ability, actor, u));
  }

  const cells = new Set(
    cellsInShape(ability.shape, actor.pos, at, enc.grid).map((c) => `${c.x},${c.y}`),
  );
  return enc.combatants.filter(
    (u) =>
      !u.down &&
      isValidTarget(ability, actor, u) &&
      occupiedCells(u).some((c) => cells.has(`${c.x},${c.y}`)),
  );
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
export function applyStatus(
  enc: Encounter,
  target: Combatant,
  key: string,
  source: Combatant | undefined,
  duration?: number,
): boolean {
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
        if (success && save.onSuccess === 'clear') {
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
  unit.reactionUsed = false;
  push(enc, 'turn', `Tour de ${unit.name} (round ${enc.round}).`, { actorId: unit.id });

  recoverEndurance(enc, unit);
  runStatusPhase(enc, unit, rng);
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
  if (enc.started) return;

  for (const unit of enc.combatants) {
    unit.initiative = effectiveStat(unit, 'speed');
    unit.moved = 0;
    unit.actionUsed = false;
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

  const budget = affordableMovement(unit);
  const reach = reachableCells(unit, budget, enc.grid, enc.terrain, enc.combatants);
  const destination = reach.get(`${to.x},${to.y}`);
  if (!destination) {
    const souffle = movementBudget(unit) - unit.moved > budget ? ' (souffle insuffisant)' : '';
    push(enc, 'info', `${unit.name} ne peut pas atteindre cette case${souffle}.`, {
      actorId: unit.id,
    });
    return;
  }

  const from = unit.pos;
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
function cannotAfford(unit: Combatant, ability: CombatAbility, mana: number): string | null {
  if (unit.down) return `${unit.name} est hors de combat.`;

  const stunned = blockedBy(unit, 'preventsAction');
  if (stunned) return `${unit.name} ne peut pas agir (« ${stunned.name} »).`;
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
export function cannotReact(unit: Combatant, ability: CombatAbility): string | null {
  if (unit.reactionUsed) return 'Réaction déjà utilisée ce round.';
  // Le coût d'ambiance n'est pas connu sans la rencontre ; on prend le prix
  // affiché, quitte à être un rien sévère sur un sort que la nuit remise.
  return cannotAfford(unit, ability, ability.manaCost);
}

/** Ce qui empêche une capacité d'être lancée, ou `null` si tout est en ordre. */
export function cannotUse(
  enc: Encounter,
  unit: Combatant,
  ability: CombatAbility,
  at: GridPos,
): string | null {
  if (unit.actionUsed) return 'Action déjà utilisée ce tour.';
  const unaffordable = cannotAfford(unit, ability, effectiveManaCost(enc, ability));
  if (unaffordable) return unaffordable;
  // Pour une téléportation, `at` est la DESTINATION : c'est la distance de saut
  // qui la borne, pas la portée de ce que le sort fait en arrivant.
  if (ability.teleport) {
    const jump = teleportRangeOf(ability);
    const distance = unitToCellMeters(unit, at);
    if (distance > jump + 1e-6)
      return `Trop loin pour s’y rendre (${distance.toFixed(1)} m > ${jump} m).`;
    if (!hasLineOfSight(unit.pos, at, enc.terrain)) return 'Pas de ligne de vue.';
    return null;
  }

  if (ability.shape.kind !== 'self') {
    const distance = unitToCellMeters(unit, at);
    if (distance > ability.rangeMeters + 1e-6)
      return `Hors de portée (${distance.toFixed(1)} m > ${ability.rangeMeters} m).`;
    if (!hasLineOfSight(unit.pos, at, enc.terrain)) return 'Pas de ligne de vue.';
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
    const scale = resolveScaling(actor, component.scaling, falloff);
    return {
      min: Math.round(component.min + scale),
      max: Math.round(component.max + scale),
      type: component.type,
    };
  });
}

/** Soin effectivement rendu par une capacité, scaling compris. */
export function abilityHealAmount(actor: Combatant, ability: CombatAbility): number {
  if (!ability.heal) return 0;
  return Math.round(ability.heal + resolveScaling(actor, ability.healScaling));
}

/** Mana effectivement rendu par une capacité, scaling compris. */
export function abilityManaAmount(actor: Combatant, ability: CombatAbility): number {
  if (!ability.restoreMana) return 0;
  return Math.round(ability.restoreMana + resolveScaling(actor, ability.restoreManaScaling));
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
function resolveAgainst(
  enc: Encounter,
  actor: Combatant,
  ability: CombatAbility,
  target: Combatant,
  rng: Rng,
): void {
  const details: string[] = [];
  const offensive = ability.damages.length > 0 || ability.percentMaxHp || ability.percentCurrentHp;

  // 1) L'effacement d'abord : un buff d'esquive ne rend pas difficile à viser,
  //    il fait qu'il n'y a plus rien à viser. Il l'emporte donc sur le jet.
  //    La Défense, elle, n'intervient dans aucun des deux : elle ne décide pas
  //    si l'on touche, mais ce que le coup coûte (cf. `damageReduction`). Un
  //    soin ou un buff, lui, porte toujours.
  if (offensive && !ability.autoHit) {
    const dodge = evadeChance(target);
    if (dodge && rng.chance(dodge)) {
      push(enc, 'attack', `${target.name} esquive complètement ${ability.name}.`, {
        actorId: actor.id,
        targetId: target.id,
        details: [`esquive ${dodge} %`],
      });
      return;
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
  if (offensive && aims(ability)) {
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
      return;
    }
    details.push(detail);
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
    const scale = resolveScaling(actor, component.scaling, falloff);
    const done = dealDamage(enc, target, (dice + scale) * ambient * hitFactor, component.type, true);
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
  if (ability.restoreMana) {
    const amount = Math.round(
      ability.restoreMana + resolveScaling(actor, ability.restoreManaScaling),
    );
    const max = effectiveStat(target, 'mana');
    const before = target.mana;
    target.mana = Math.min(max, target.mana + amount);
    details.push(`${target.mana - before} mana rendu (${target.mana}/${max})`);
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

  // 7) Statuts infligés — un par un, chacun avec sa chance.
  for (const inflict of ability.inflicts ?? []) {
    if (!rng.chance(inflict.chance)) {
      push(enc, 'status', `« ${statusByKey(inflict.status)?.name ?? inflict.status} » ne prend pas sur ${target.name}.`, {
        targetId: target.id,
        details: [`chance ${inflict.chance} %`],
      });
      continue;
    }
    applyStatus(enc, target, inflict.status, actor, inflict.duration);
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
      if (rng.chance(inflict.chance)) applyStatus(enc, actor, inflict.status, target, inflict.duration);
    }
  }
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
export function reactionOptions(unit: Combatant, trigger: ReactionTrigger): CombatAbility[] {
  // On filtre sur ce qui est VRAIMENT jouable, pas seulement sur ce que la
  // fiche déclare. Proposer une réaction qu'un refus rejettera ensuite fait
  // perdre sa réaction au joueur en apparence, et le laisse chercher pourquoi.
  // C'est aussi ce qui garantit qu'une fenêtre ne s'ouvre pas pour rien : les
  // deux appelants renoncent quand la liste est vide.
  return unit.abilities.filter((a) => a.reaction?.includes(trigger) && !cannotReact(unit, a));
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

    const options = reactionOptions(watcher, 'leave-reach');
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
    const options = reactionOptions(target, 'incoming-attack');
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
    .filter((c) => !c.down && isValidTarget(strike, actor, c))
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
): void {
  const actor = findUnit(enc, actorId);
  const ability = actor?.abilities.find((a) => a.id === abilityId);
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
    suspendFor(enc, defence.window, { type: 'use', actorId, abilityId, at, targetIds }, [
      ...asked,
      ...defence.rolled,
    ]);
    return;
  }
  enc.suspended = undefined;

  // Un statut qui n'empêche d'agir que sur échec d'un jet : on tente le jet ici.
  for (const status of actor.statuses) {
    const def = STATUS_BY_KEY.get(status.key);
    const save = def?.save;
    if (!save || save.trigger !== 'action' || save.onSuccess !== 'act') continue;
    const roll = rng.d20();
    const mod = abilityModifier(effectiveAttribute(actor, save.attribute));
    const total = roll + mod + actor.proficiency;
    const ok = total >= save.dc;
    push(enc, 'save', `${actor.name} lutte contre « ${def!.name} » : ${ok ? 'réussite' : 'échec'}.`, {
      actorId: actor.id,
      details: [`d20 ${roll} ${signed(mod)} ${signed(actor.proficiency)} = ${total} vs DD ${save.dc}`],
    });
    if (!ok) {
      actor.actionUsed = true;
      return;
    }
  }

  // Le coût réel dépend de l'ambiance : un sort de ténèbres coûte moins la nuit.
  const manaSpent = effectiveManaCost(enc, ability);

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
  actor.actionUsed = true;

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

  if (!targets.length) {
    push(enc, 'info', 'Aucune cible valide dans la zone.', { actorId: actor.id });
  }
  for (const target of targets) resolveAgainst(enc, actor, ability, target, rng);

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
  perform(enc, action, rng);
  commit(enc, rng);

  if (isOver(enc) && enc.started) {
    const winner = activeTeams(enc)[0];
    const already = enc.log.some((l) => l.text.startsWith('Combat terminé'));
    if (!already) {
      push(enc, 'info', `Combat terminé — ${winner ? teamLabel(winner) : 'personne'} l’emporte.`);
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
      resolveUse(enc, action.actorId, action.abilityId, action.at, action.targetIds, rng);
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
      const hadAction = reactor.actionUsed;
      reactor.actionUsed = false;
      resolveUse(enc, reactor.id, action.abilityId, action.at ?? pending.at, undefined, rng);
      reactor.actionUsed = hadAction;

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
      if (target) applyStatus(enc, target, action.status, undefined, action.duration);
      break;
    }

    case 'clearStatus': {
      const target = findUnit(enc, action.targetId);
      if (target) clearStatus(enc, target, action.status);
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
      push(enc, 'info', moment ? `${moment.name}.` : 'Heure indéterminée.', {
        details: moment ? [moment.description] : undefined,
      });
      break;
    }
  }
}

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
  const reach = reachableCells(unit, budget, enc.grid, enc.terrain, enc.combatants);
  const out = new Map<string, number>();
  for (const [key, cell] of reach) if (!samePos(cell.pos, unit.pos)) out.set(key, cell.cost);
  return out;
}
