import { SpellNodeStats, StatusCategory } from '../wiki.types';
import { enchantTargetOf } from './abilities';
import { CRIT_FACTOR, statusByKey } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   L'ÉCONOMIE DES SORTS

   Ce module répond à une seule question : **ce palier vaut-il son prix ?**

   Il ne s'agit pas de rendre tous les sorts équivalents — certains DOIVENT
   rester plus forts. Il s'agit d'avoir une règle écrite, appliquée à tous, qui
   dise ce qu'un effet coûte normalement. Un sort peut s'en écarter, mais alors
   c'est un choix assumé, pas un oubli : soit il porte un contre-coup, soit
   l'écart est déclaré.

   La loi est vérifiée en continu par `spell-economy.spec.ts` : un palier qui
   sort des bornes fait échouer les tests. C'est ce qui rend l'équilibrage
   permanent plutôt que ponctuel.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Lanceur de référence servant à normaliser le scaling.
 *
 * Un sort ne vaut rien dans l'absolu : ses dégâts dépendent de qui le lance.
 * On les évalue tous contre le même personnage — un aventurier de niveau 10 —
 * pour que la comparaison ait un sens. Les valeurs viennent de la projection
 * réelle des courbes de `classes.json` (attaque ≈ 80, attributs 14–16).
 */
export const REFERENCE_CASTER: Record<string, number> = {
  atk_mag: 80,
  atk_phy: 80,
  def_mag: 10,
  def_phy: 10,
  hp: 84,
  mana: 80,
  endurance: 60,
  speed: 20,
  force: 14,
  dexterite: 14,
  constitution: 14,
  intelligence: 16,
  sagesse: 14,
  charisme: 12,
};

/** PV d'un pair au niveau de référence — sert aux dégâts proportionnels. */
const REFERENCE_HP = 84;

/**
 * Prime accordée aux dégâts en pourcentage des PV.
 *
 * Ils ignorent l'armure ET grandissent avec la cible : 25 % des PV d'un pair
 * font 21 points, mais 75 sur une créature massive. Les évaluer sur un pair
 * seul reviendrait à ne jamais voir ce pour quoi on les emporte — abattre ce
 * qui est plus gros que soi.
 */
const PERCENT_DAMAGE_PREMIUM = 3;

/* ── Poids des effets ──────────────────────────────────────────────────────
   Combien « vaut » un effet qui n'est pas des dégâts. Exprimés dans la même
   unité que les dégâts, pour que tout se compare.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Un point de soin vaut un point de dégât. C'est délibéré : rendre 20 PV à un
 * allié pèse autant sur le combat qu'en retirer 20 à un ennemi, et sans ça les
 * sorts de soin paraissent toujours « mauvais » à l'audit.
 */
const HEAL_WEIGHT = 1;

/**
 * Valeur d'un statut appliqué à coup sûr, par catégorie. Priver quelqu'un de
 * son tour vaut bien plus qu'une écorchure : le contrôle est la ressource la
 * plus chère d'un combat au tour par tour.
 */
const STATUS_WEIGHT: Record<StatusCategory, number> = {
  control: 45,
  mental: 35,
  debuff: 20,
  dot: 18,
  buff: 20,
};

/** Valeur d'un statut inconnu du catalogue — prudente plutôt que nulle. */
const UNKNOWN_STATUS_WEIGHT = 20;

/**
 * Au-delà de ce nombre de tours, une durée ne vaut plus rien de plus : le
 * combat sera fini avant. Sans ce plafond, un buff de 10 tours paraîtrait deux
 * fois plus précieux qu'un de 5, ce qu'aucune table ne vit jamais.
 */
const DURATION_CAP = 5;

/** Un point de stat modifié, par tour de durée. */
const STAT_POINT_WEIGHT = 0.75;

/** Un point de pourcentage d'esquive accordé, par tour. */
const EVADE_POINT_WEIGHT = 0.5;

/**
 * Ce que vaut une téléportation, avant sa distance. Se soustraire d'un coup à
 * une mêlée n'inflige rien mais change tout : c'est la mobilité la plus chère
 * d'un combat sur grille, et jouée en réaction elle annule purement l'attaque.
 */
const TELEPORT_BASE = 25;

/**
 * Ce qu'un échange de place vaut EN PLUS d'une téléportation.
 *
 * Il déplace deux corps au lieu d'un, et le second n'a pas son mot à dire :
 * arracher un allié d'une mêlée ou y jeter un ennemi à sa place vaut mieux que
 * de s'y rendre soi-même. Le prix reste modeste — l'échange ne blesse pas et
 * demande une marque préalable, donc un tour et un sort de plus.
 */
const SWAP_PREMIUM = 15;

/**
 * Nombre de coups qu'un enchantement d'arme ou de poing accompagne réellement.
 *
 * Ses dégâts ne s'appliquent pas une fois mais à CHAQUE frappe de la durée.
 * Les compter une seule fois — comme un sort ordinaire — sous-évalue
 * grossièrement toute la famille des revêtements.
 */
const ENCHANT_HITS = 4;

/** Purger un statut vaut à peu près ce qu'il coûte à subir. */
const CLEANSE_WEIGHT = 15;

/**
 * Ce que vaut d'invoquer une météo. Elle couvre TOUT le champ de bataille pour
 * plusieurs tours, applique des statuts et incline les domaines : c'est
 * l'effet le plus large qu'un sort puisse avoir.
 */
const WEATHER_WEIGHT = 70;

/**
 * Facteur appliqué à un sort qui frappe **tout le monde, alliés compris**.
 *
 * C'est un contre-coup à part entière, et le plus lourd qui soit : on ne lance
 * pas un Inferno au milieu de son propre groupe. Sans ce facteur, les sorts de
 * terre brûlée paraissent absurdement sous-payés alors qu'ils s'achètent en
 * risque plutôt qu'en mana.
 */
const FRIENDLY_FIRE_FACTOR = 0.65;

/* ── Multiplicateurs de portée et de zone ─────────────────────────────────── */

/** Un champ du wiki mal formé ne doit pas faire tomber l'audit non plus. */
const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Une case vaut 1,5 m : les rayons du wiki sont en mètres. */
const CELL = 1.5;

/**
 * Ce que la zone multiplie. Toucher plusieurs cibles est la façon la plus
 * directe de démultiplier un sort, donc c'est le facteur le plus lourd.
 * On compte les cibles *plausibles*, pas la surface : un rayon de 6 m couvre
 * beaucoup de cases mais rarement plus de 3 ou 4 combattants.
 */
export function areaMultiplier(area: string | undefined): number {
  const raw = asText(area).trim().toLowerCase();
  const nombre = Number(raw.replace(',', '.').match(/\d+(\.\d+)?/)?.[0] ?? 0);

  if (raw.startsWith('rayon')) {
    // Rayon 3 m ≈ 2 cases ≈ 2 cibles ; on plafonne, une mêlée n'est pas infinie.
    return Math.min(3.5, 1 + (nombre / CELL) * 0.45);
  }
  if (raw.startsWith('cône') || raw.startsWith('cone')) {
    return Math.min(3, 1 + (nombre / CELL) * 0.35);
  }
  if (raw.startsWith('ligne')) {
    return Math.min(2.5, 1 + (nombre / CELL) * 0.25);
  }
  if (raw.includes('cible') && nombre > 1) return 1 + (nombre - 1) * 0.6;
  return 1;
}

/**
 * Ce que la portée multiplie. Frapper de loin est un avantage réel — on ne
 * risque pas la riposte — mais secondaire face à la zone. « Personnel » et
 * « Contact » ne valent pas moins : un sort de contact est souvent le plus
 * brutal, il paie déjà son risque en se plaçant.
 */
export function rangeMultiplier(range: string | undefined): number {
  const raw = asText(range).trim().toLowerCase();
  if (raw.startsWith('personnel') || raw.startsWith('soi')) return 1;
  if (raw.startsWith('contact') || raw.startsWith('autour')) return 1;
  const metres = Number(raw.replace(',', '.').match(/\d+(\.\d+)?/)?.[0] ?? 0);
  if (!metres) return 1;
  // 10 m = référence neutre ; 30 m vaut +20 %, plafonné.
  return Math.min(1.35, Math.max(0.9, 1 + (metres - 10) / 100));
}

/* ── Puissance d'un palier ─────────────────────────────────────────────────── */

/** Somme des contributions de scaling d'une liste, contre le lanceur de référence. */
function scaled(list: { source: string; ratio: number; affects?: string }[] | undefined, affects = 'damage'): number {
  return (list ?? [])
    .filter((s) => (s.affects ?? 'damage') === affects)
    .reduce((total, s) => total + s.ratio * (REFERENCE_CASTER[s.source] ?? 0), 0);
}

/**
 * Ce que le SORT apporte à chacun de ses paliers.
 *
 * Certains champs ne sont écrits qu'une fois, sur le sort, et valent pour tous
 * ses paliers — la météo qu'il invoque, notamment. Les évaluer sans ce contexte
 * revenait à croire qu'un Blizzard ne fait rien.
 */
export interface SpellContext {
  /** Clé du sort (reconnaît les revêtements). */
  key?: string;
  /** Météo invoquée, déclarée au niveau du sort. */
  weather?: string;
}

/** Détail de la puissance d'un palier, poste par poste. */
export interface PowerBreakdown {
  damage: number;
  heal: number;
  statuses: number;
  effects: number;
  utility: number;
  /** Ce que le contre-coup retranche. */
  recoil: number;
  /** Multiplicateurs appliqués au total. */
  areaFactor: number;
  rangeFactor: number;
  /** Puissance finale, tous postes et multiplicateurs compris. */
  total: number;
}

/**
 * Puissance d'un palier de sort, dans l'unité « point de dégât ».
 *
 * Tout y est ramené à la même échelle : les dégâts, le soin, le contrôle, les
 * buffs. C'est ce qui permet de comparer un sort de feu à une bénédiction.
 */
export function spellPower(stats: SpellNodeStats, ctx: SpellContext = {}): PowerBreakdown {
  const bonus = scaled(stats.scaling, 'damage');
  // Un revêtement nimbe une arme : ses dégâts accompagnent chaque coup porté
  // pendant sa durée, ils ne frappent pas une fois.
  const hits = enchantTargetOf(ctx.key ?? '') ? ENCHANT_HITS : 1;

  // ── Dégâts, toutes formes confondues.
  let damage = 0;
  if (stats.damages?.length) {
    for (const d of stats.damages) damage += d.max + (d.scaling?.length ? scaled(d.scaling) : bonus);
  } else if (stats.damageMin !== undefined) {
    damage += (stats.damageMax ?? stats.damageMin) + bonus;
  }
  damage *= hits;
  // Un coup dont les dégâts sont acquis comme critiques vaut ce que vaut le
  // critique. Sans cette ligne, une frappe assurée se paierait au prix d'une
  // frappe ordinaire tout en frappant moitié plus fort.
  if (stats.alwaysCritical) damage *= CRIT_FACTOR;
  // Les dégâts proportionnels ignorent la défense : ils valent plein pot.
  const pct = (spec: { min: number; max?: number } | undefined) =>
    spec ? ((spec.max ?? spec.min) / 100) * REFERENCE_HP * PERCENT_DAMAGE_PREMIUM : 0;
  damage += pct(stats.damagePercentMaxHp) + pct(stats.damagePercentCurrentHp);

  // Sort à options : sa puissance est celle du MEILLEUR choix, puisque le
  // lanceur le choisit à l'incantation. Sans ça, un sort dont tous les effets
  // vivent dans ses `choices` paraîtrait vide.
  let meilleurChoix = 0;
  for (const choix of stats.choices ?? []) {
    let valeur = (choix.damageMax ?? choix.damageMin ?? 0) + bonus + (choix.heal ?? 0);
    for (const i of choix.inflicts ?? []) {
      const def = statusByKey(i.status);
      valeur += (i.chance / 100) * (def ? STATUS_WEIGHT[def.category] : UNKNOWN_STATUS_WEIGHT);
    }
    meilleurChoix = Math.max(meilleurChoix, valeur);
  }
  damage += meilleurChoix;

  // ── Soin.
  const heal = stats.heal ? (stats.heal + scaled(stats.scaling, 'heal')) * HEAL_WEIGHT : 0;

  // ── Statuts infligés : leur valeur dépend de ce qu'ils privent.
  let statuses = 0;
  for (const inflict of stats.inflicts ?? []) {
    const def = statusByKey(inflict.status);
    const poids = def ? STATUS_WEIGHT[def.category] : UNKNOWN_STATUS_WEIGHT;
    statuses += (inflict.chance / 100) * poids;
  }

  // ── Modificateurs de stats, proportionnels à leur durée.
  const tours = Math.min(DURATION_CAP, Math.max(1, stats.duration ?? 1));
  let effects = 0;
  for (const e of stats.effects ?? []) {
    const valeur = (e.value ?? 0) + scaled(e.scaling);
    effects += Math.abs(valeur) * tours * STAT_POINT_WEIGHT;
  }

  // ── Le reste : esquive, purge, riposte.
  let utility = 0;
  if (stats.evadeChance) utility += stats.evadeChance * tours * EVADE_POINT_WEIGHT;
  utility += (stats.cleanses?.length ?? 0) * CLEANSE_WEIGHT;
  if (stats.retaliate) {
    const r = stats.retaliate;
    const parCoup = (r.damageMax ?? r.damageMin ?? 0) + scaled(r.scaling);
    // Une riposte se déclenche plusieurs fois : on compte deux coups par tour
    // de durée, ce qui reste prudent face à une mêlée fournie.
    utility += parCoup * tours;
    for (const inflict of r.inflicts ?? []) {
      const def = statusByKey(inflict.status);
      utility += (inflict.chance / 100) * (def ? STATUS_WEIGHT[def.category] : UNKNOWN_STATUS_WEIGHT);
    }
  }

  // ── Contre-coup : ce que le lanceur paie de sa personne vient EN DÉDUCTION.
  //    C'est le levier qui autorise un sort très puissant sans le rendre abusif.
  let recoil = 0;
  if (stats.recoil) {
    recoil += (stats.recoil.damageMax ?? stats.recoil.damageMin ?? 0) + scaled(stats.recoil.scaling);
    for (const e of stats.recoil.effects ?? []) {
      recoil += Math.abs((e.value ?? 0) + scaled(e.scaling)) * tours * STAT_POINT_WEIGHT;
    }
  }

  // La météo est souvent déclarée sur le SORT et non sur le palier : un
  // Blizzard n'écrit `weather` qu'une fois, pour ses trois paliers.
  if (stats.weather ?? ctx.weather) utility += WEATHER_WEIGHT;
  // Se déplacer instantanément : d'autant plus précieux qu'on va loin. Un
  // échange en est une forme, qui emmène quelqu'un d'autre avec elle.
  if (stats.teleport || stats.swap) {
    const saut = Number(asText(stats.teleportRange ?? stats.range).match(/\d+/)?.[0] ?? 0);
    utility += TELEPORT_BASE + saut + (stats.swap ? SWAP_PREMIUM : 0);
  }

  const areaFactor = areaMultiplier(stats.area);
  const rangeFactor = rangeMultiplier(stats.range);
  // Frapper ses propres alliés est un prix, pas un détail.
  const friendly = stats.targets?.includes('everyone') ? FRIENDLY_FIRE_FACTOR : 1;
  const brut =
    (damage + heal + statuses + effects + utility) * areaFactor * rangeFactor * friendly;

  return {
    damage,
    heal,
    statuses,
    effects,
    utility,
    recoil,
    areaFactor,
    rangeFactor,
    total: Math.max(0, brut - recoil),
  };
}

/* ── La loi ────────────────────────────────────────────────────────────────── */

/**
 * Efficacité de référence : combien de puissance un point de mana achète.
 *
 * Calée sur la médiane observée du catalogue, pour que la loi valide l'essentiel
 * des sorts existants et ne signale que ce qui s'en écarte franchement.
 * L'augmenter rend les sorts globalement moins chers ; la baisser allonge les
 * combats en rendant chaque incantation plus lourde.
 */
export const TARGET_EFFICIENCY = 10;

/**
 * Plafond du prix en mana, en part de la réserve d'un lanceur de référence.
 *
 * Un sort qui dépasse ce prix ne peut plus s'acheter en mana : il faut qu'il se
 * paie autrement — en sang (contre-coup), en risque (tir fratricide), ou qu'il
 * soit assumé comme une frappe unique de fin de combat. C'est le point où
 * l'économie passe le relais au contre-coup.
 */
export const MANA_CAP_SHARE = 0.55;

/** Prix maximal exprimable en mana, pour la réserve de référence. */
export const MANA_CAP = Math.round(REFERENCE_CASTER['mana'] * MANA_CAP_SHARE);

/**
 * Largeur de la fourchette tolérée autour du prix théorique.
 *
 * Volontairement généreuse : l'objectif n'est pas d'uniformiser mais d'attraper
 * les accidents. Un sort à 2,5 fois l'efficacité normale est un choix de
 * conception ; à 5 fois, c'est un oubli.
 */
export const TOLERANCE = { min: 0.4, max: 2.5 } as const;

/** Verdict rendu sur un palier. */
export interface EconomyVerdict {
  /** Puissance normalisée du palier. */
  power: number;
  /** Coût réellement demandé. */
  mana: number;
  /** Coût que la loi prévoit. */
  expected: number;
  /** Puissance achetée par point de mana. */
  efficiency: number;
  /** Écart au prix théorique (1 = pile dans la norme). */
  deviation: number;
  /**
   * `protege` : la loi le voudrait moins cher, mais `MAX_DISCOUNT` refuse de
   * brader le prix voulu par l'auteur. Ce n'est pas une faute — c'est le
   * garde-fou qui joue son rôle.
   */
  verdict: 'ok' | 'trop-fort' | 'trop-cher' | 'protege';
  breakdown: PowerBreakdown;
}

/** Prix brut que la loi calcule, avant plafond. */
export function expectedMana(stats: SpellNodeStats, ctx: SpellContext = {}): number {
  return Math.max(1, Math.round(spellPower(stats, ctx).total / TARGET_EFFICIENCY));
}

/**
 * Prix à retenir pour un palier, plafond compris.
 *
 * Deux garde-fous par rapport au prix brut :
 * - il ne dépasse jamais `MANA_CAP` : un sort imbuvable n'équilibre rien ;
 * - il ne fait jamais BAISSER un prix déjà au-dessus du plafond. Un sort déjà
 *   chiffré à 70 mana est une frappe ultime assumée par son auteur ; la loi
 *   n'a pas à la brader sous prétexte qu'elle ne sait pas la coter.
 */
export function recommendedMana(
  stats: SpellNodeStats,
  current: number,
  ctx: SpellContext = {},
): number {
  const brut = Math.min(expectedMana(stats, ctx), MANA_CAP);
  // Monter un prix trop bas est sans risque : c'est l'abus qu'on corrige.
  if (brut >= current) return Math.max(brut, current > MANA_CAP ? current : brut);
  // Le baisser l'est beaucoup plus. Un sort peut valoir cher pour des raisons
  // que la loi ne voit pas — une portée narrative, un effet pas encore chiffré.
  // On ne descend donc jamais sous la moitié du prix voulu par l'auteur.
  return Math.max(brut, Math.ceil(current * MAX_DISCOUNT));
}

/**
 * Part du prix d'origine sous laquelle la loi ne descend jamais. Elle corrige
 * ce qui est trop bon marché ; elle ne brade pas ce que l'auteur a voulu cher.
 */
export const MAX_DISCOUNT = 0.5;

/**
 * Un palier sans effet de combat chiffré : ni dégâts, ni soin, ni statut, ni
 * buff, ni météo, ni téléportation.
 *
 * **La loi ne les tarife pas.** Ce sont pour l'essentiel des sorts hors combat
 * — une Luciole éclaire, une Purification assainit une eau — et rien dans une
 * grille tactique ne sait ce que ça vaut. Les facturer à zéro serait aussi faux
 * que de leur inventer une puissance. L'audit se contente de les recenser, à
 * charge pour l'auteur de dire lesquels sont volontairement hors combat et
 * lesquels attendent encore leurs chiffres.
 */
export function isHollow(stats: SpellNodeStats, ctx: SpellContext = {}): boolean {
  return spellPower(stats, ctx).total === 0;
}

/**
 * Un palier dont la loi réclame plus que le plafond doit se payer autrement :
 * il lui faut un contre-coup, ou il frappe déjà ses propres alliés.
 */
export function needsRecoil(stats: SpellNodeStats, ctx: SpellContext = {}): boolean {
  if (expectedMana(stats, ctx) <= MANA_CAP) return false;
  return !stats.recoil && !stats.targets?.includes('everyone');
}

/**
 * Confronte un palier à la loi. Un sort gratuit (mana 0) est ignoré : ce sont
 * les capacités innées, elles ne relèvent pas de cette économie.
 */
export function auditNode(stats: SpellNodeStats, ctx: SpellContext = {}): EconomyVerdict {
  const breakdown = spellPower(stats, ctx);
  const mana = Math.max(1, stats.mana ?? 1);
  const expected = Math.max(1, Math.round(breakdown.total / TARGET_EFFICIENCY));
  const deviation = expected / mana;

  return {
    power: Math.round(breakdown.total),
    mana,
    expected,
    efficiency: breakdown.total / mana,
    deviation,
    verdict:
      deviation > TOLERANCE.max
        ? 'trop-fort'
        : deviation >= TOLERANCE.min
          ? 'ok'
          : // Sous la borne basse : faute seulement si le prix pouvait encore
            // descendre. S'il est déjà au plancher, la loi a fait ce qu'elle
            // pouvait et l'auteur garde le dernier mot.
            mana <= Math.ceil(mana * MAX_DISCOUNT) + 1 || expected >= Math.ceil(mana * MAX_DISCOUNT)
            ? 'trop-cher'
            : 'protege',
    breakdown,
  };
}
