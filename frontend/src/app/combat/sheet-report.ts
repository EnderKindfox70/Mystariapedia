import {
  CharacterSheet,
  InventoryItem,
  PoolKey,
  SurvivalKey,
} from '../character/character.types';
import {
  POOL_GAUGES,
  SURVIVAL_GAUGES,
  clampPoolLoss,
  poolCurrent,
  poolStage,
} from '../character/universe-data';
import { Combatant } from './combat.types';
import { stageOf, survivalToNotches } from './survival';

/* ──────────────────────────────────────────────────────────────────────────
   REPORTER LA SÉANCE SUR LES FICHES

   Pendant de « Rafraîchir les fiches », qui remonte la fiche vers la table.
   Ici, c'est la table qui redescend vers la fiche : ce que la séance a changé
   et que la fiche a vocation à garder d'une fois sur l'autre.

   **Rien ne part sans un clic.** Une séance qui tourne mal, un combat rejoué,
   un essai — rien de tout cela ne doit saccager les fiches dans le dos du MJ.
   C'est aussi pourquoi ce module ne fait qu'CALCULER l'écart : l'écriture est
   un geste séparé, et l'aperçu se lit avant.

   Quatre choses redescendent :
   - **les jauges de survie**, qui suivent le voyage par nature ;
   - **les réserves** — points de vie, endurance, mana — telles que la séance
     les a laissées ;
   - **le sac**, munitions dépensées et dépouilles ramassées comprises ;
   - **la bourse**, sous la forme de l'écart au tirage du background.

   Les réserves demandent une précaution que les jauges n'ont pas : leur
   MAXIMUM se recalcule (race, classe, niveau, équipement) et la fiche n'en
   garde donc que le CREUX (cf. `poolLoss`). Le maximum de référence est celui
   du pion (`base`), figé quand il a été posé sur la table : c'est le même que
   celui de la fiche au même instant, et c'est contre lui que la séance a
   effectivement joué.
─────────────────────────────────────────────────────────────────────────── */

/** Un cran de jauge qui a bougé pendant la séance. */
export interface GaugeChange {
  key: SurvivalKey;
  label: string;
  from: number;
  to: number;
  /** Verdict d'arrivée (« Le ventre creux »), pour l'aperçu. */
  stage: string;
}

/** Une réserve qui a bougé pendant la séance. */
export interface PoolChange {
  key: PoolKey;
  label: string;
  /** Nom court, pour le résumé d'une ligne. */
  short: string;
  from: number;
  to: number;
  /** Maximum de référence, celui contre lequel la séance s'est jouée. */
  max: number;
  /** Verdict d'arrivée (« Blessé »), pour l'aperçu. */
  stage: string;
}

/** Une ligne de sac qui a bougé (positive = ramassée, négative = dépensée). */
export interface ItemChange {
  name: string;
  delta: number;
  /** Quantité finale, celle qui sera écrite. */
  to: number;
}

/** Ce qu'une séance a changé pour un personnage, avant écriture. */
export interface SheetReport {
  unitId: string;
  sheetId: string;
  name: string;
  gauges: GaugeChange[];
  pools: PoolChange[];
  items: ItemChange[];
  /** Écart de bourse en pièces d'or (peut être négatif). */
  gold: number;
  /** Y a-t-il seulement quelque chose à écrire ? */
  changed: boolean;
}

/**
 * Compare un combattant à la fiche dont il est issu.
 *
 * Ne touche à rien : rend l'écart, à afficher puis à confirmer.
 */
export function diffAgainstSheet(unit: Combatant, sheet: CharacterSheet, sheetId: string): SheetReport {
  const gauges: GaugeChange[] = [];
  const after = survivalToNotches(unit.survival);
  // Un pion qui ne tient pas de jauges n'a rien à en dire : sans état, la
  // conversion rendrait « tout au plein » et le report REMPLIRAIT la fiche.
  for (const gauge of unit.survival ? SURVIVAL_GAUGES : []) {
    // Une fiche d'avant les jauges part d'une réserve pleine, comme partout
    // ailleurs : sans ce repli, la première séance annoncerait un écart faux.
    const from = sheet.survival?.[gauge.key] ?? gauge.segments;
    const to = after[gauge.key];
    if (from === to) continue;
    gauges.push({
      key: gauge.key,
      label: gauge.label,
      from,
      to,
      stage: stageOf(gauge.key, unit.survival),
    });
  }

  const pools: PoolChange[] = [];
  const loss = poolLossOf(unit);
  for (const gauge of POOL_GAUGES) {
    const max = maxOf(unit, gauge.key);
    // Une fiche d'avant le champ est à plein, comme une fiche neuve : sans ce
    // repli, la première séance annoncerait la perte d'une réserve intacte.
    const from = poolCurrent(max, sheet.poolLoss?.[gauge.key]);
    const to = max - loss[gauge.key];
    if (from === to) continue;
    pools.push({
      key: gauge.key,
      label: gauge.label,
      short: gauge.short,
      from,
      to,
      max,
      stage: poolStage(gauge, to, max),
    });
  }

  const before = new Map((sheet.inventory ?? []).map((l) => [l.name, Math.max(0, Math.round(l.qty ?? 0))]));
  const now = new Map(unit.inventory.map((l) => [l.name, Math.max(0, Math.round(l.qty))]));

  const items: ItemChange[] = [];
  for (const name of new Set([...before.keys(), ...now.keys()])) {
    const from = before.get(name) ?? 0;
    const to = now.get(name) ?? 0;
    if (from !== to) items.push({ name, delta: to - from, to });
  }
  items.sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name));

  // La fiche ne stocke pas un montant mais l'écart au tirage du background.
  // Le nouvel écart vaut `bourse − tirage` ; ce qu'on annonce au MJ, c'est la
  // différence entre cet écart et celui déjà écrit sur la fiche.
  const gold =
    unit.purseBase === undefined ? 0 : nextGoldDelta(unit) - Math.round(sheet.goldDelta ?? 0);

  return {
    unitId: unit.id,
    sheetId,
    name: unit.name,
    gauges,
    pools,
    items,
    gold,
    changed: gauges.length > 0 || pools.length > 0 || items.length > 0 || gold !== 0,
  };
}

/**
 * Maximum d'une réserve pour ce pion : ses stats de référence, celles qui ont
 * été figées à l'ajout sur la table (cf. `Combatant.base`). C'est bien contre
 * ce maximum-là que les coups ont été comptés, même si la fiche a changé
 * depuis.
 */
function maxOf(unit: Combatant, key: PoolKey): number {
  return Math.max(0, Math.round(unit.base[key] ?? 0));
}

/**
 * Creux des trois réserves à écrire sur la fiche, à partir de l'état du pion.
 * Pendant de `survivalToNotches` : le moteur compte en points courants, la
 * fiche garde ce qui manque.
 */
function poolLossOf(unit: Combatant): Record<PoolKey, number> {
  return Object.fromEntries(
    POOL_GAUGES.map((g) => {
      const max = maxOf(unit, g.key);
      return [g.key, clampPoolLoss(max, max - Math.round(unit[g.key] ?? 0))];
    }),
  ) as Record<PoolKey, number>;
}

/**
 * Écart de bourse à écrire sur la fiche : ce que le pion porte, moins ce que
 * le tirage du background lui donnait.
 *
 * `purseBase` est posé par la fabrique. Sans lui — un pion monté à la main, ou
 * une rencontre d'avant ce champ — on ne sait pas décomposer la bourse, et
 * mieux vaut ne rien annoncer que d'annoncer un écart faux.
 */
function nextGoldDelta(unit: Combatant): number {
  if (unit.purseBase === undefined) return 0;
  return Math.round(unit.purse ?? 0) - Math.round(unit.purseBase);
}

/**
 * Écrit l'écart sur une copie de la fiche.
 *
 * `weightOf` fournit le poids d'une ligne nouvelle (une dépouille ramassée) :
 * le moteur ne connaît pas le catalogue, c'est l'appelant qui le résout. Une
 * ligne dont on ignore le poids entre à 0 — le MJ le corrigera sur la fiche
 * plutôt que de se voir refuser son butin.
 */
export function applyReport(
  sheet: CharacterSheet,
  report: SheetReport,
  unit: Combatant,
  weightOf: (name: string) => number,
): CharacterSheet {
  const next: CharacterSheet = structuredClone(sheet);

  if (report.gauges.length) {
    next.survival = { ...(next.survival ?? {}), ...survivalToNotches(unit.survival) } as Record<
      SurvivalKey,
      number
    >;
  }

  // Les trois réserves partent ensemble, même si une seule a bougé : elles
  // sont recalculées depuis le pion, et réécrire une valeur identique ne coûte
  // rien — cela remet au passage d'aplomb un creux qu'un maximum modifié
  // entre-temps aurait rendu impossible.
  if (report.pools.length) {
    next.poolLoss = poolLossOf(unit);
  }

  if (report.items.length) {
    const weights = new Map((sheet.inventory ?? []).map((l) => [l.name, l.weight ?? 0]));
    next.inventory = unit.inventory
      .filter((l) => l.qty > 0)
      .map<InventoryItem>((l) => ({
        name: l.name,
        qty: Math.round(l.qty),
        weight: weights.get(l.name) ?? weightOf(l.name),
      }));
  }

  if (report.gold !== 0) {
    // On écrit l'écart RECALCULÉ, pas une addition : garder le lien avec le
    // tirage est ce qui permet de changer de background plus tard sans effacer
    // les gains de la campagne.
    next.goldDelta = nextGoldDelta(unit);
  }

  return next;
}

/** Résumé d'une ligne, en une phrase, pour l'aperçu et le journal. */
export function summarize(report: SheetReport): string {
  const parts: string[] = [];
  // Les réserves d'abord : une blessure prime sur un cran de soif.
  for (const pool of report.pools) {
    parts.push(`${pool.short} ${pool.from} → ${pool.to}`);
  }
  for (const gauge of report.gauges) {
    parts.push(`${gauge.label.toLowerCase()} ${gauge.from} → ${gauge.to}`);
  }
  for (const item of report.items) {
    parts.push(`${item.delta > 0 ? '+' : ''}${item.delta} ${item.name}`);
  }
  if (report.gold) parts.push(`${report.gold > 0 ? '+' : ''}${report.gold} po`);
  return parts.join(' · ') || 'rien à reporter';
}
