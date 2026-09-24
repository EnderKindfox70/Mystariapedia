/* ══════════════════════════════════════════════════════════════════════════
   LES JAUGES DE SURVIE, PRÊTES À AFFICHER

   Le plateau et le camp montrent les mêmes jauges : les calculer à un seul
   endroit évite qu'une vue dise « affamé » quand l'autre dit « le ventre
   creux ». Rien ici ne modifie la rencontre — ce ne sont que des lectures.
   ══════════════════════════════════════════════════════════════════════════ */

import { describeNeedEffect, SURVIVAL_GAUGES, SurvivalGauge, SurvivalTier } from '../character/universe-data';
import { formatDuration } from './clock';
import { CarriedItem, Combatant, Encounter } from './combat.types';
import { clockOf, needStatusesOf } from './rules';
import { absoluteSeconds, nourishmentOf, pointsLeft, profileOf, tierOf } from './survival';

/** Une jauge de survie d'un combattant, prête à afficher. */
export interface SurvivalGaugeRow {
  gauge: SurvivalGauge;
  max: number;
  current: number;
  pct: number;
  tier: SurvivalTier;
  stage: string;
}

/**
 * Les trois jauges d'un combattant. Leur taille dépend de sa Constitution :
 * deux personnages n'ont pas le même réservoir.
 */
export function survivalRows(unit: Combatant): SurvivalGaugeRow[] {
  const profile = profileOf(unit.attributes);
  return SURVIVAL_GAUGES.map((gauge) => {
    const max = profile.max[gauge.key];
    const current = pointsLeft(gauge.key, unit.survival, profile);
    const tier = tierOf(gauge.key, unit.survival, profile);
    return { gauge, max, current, pct: max > 0 ? (current / max) * 100 : 0, tier, stage: gauge.stages[tier] };
  });
}

/**
 * Ce que la faim, la soif, la fatigue et le Manque de mana coûtent à ce
 * combattant, en clair : « Faim (le ventre creux) : précision physique −1 cran ».
 */
export function survivalPenalties(unit: Combatant): string {
  return needStatusesOf(unit)
    .map((need) => ({ need, effets: describeNeedEffect(need.effect) }))
    .filter(({ effets }) => effets.length)
    .map(({ need, effets }) => `${need.label} (${need.stage.toLowerCase()}) : ${effets.join(', ')}`)
    .join(' · ');
}

/** Perte de connaissance en cours, et combien de temps encore. */
export function survivalOut(unit: Combatant, encounter: Encounter): string {
  const out = unit.survival?.out;
  if (!out) return '';
  const reste = out.until - absoluteSeconds(clockOf(encounter));
  const quoi = out.sleep ? 'Endormi de force' : 'Sans connaissance';
  return reste > 0 ? `${quoi} — réveil dans ${formatDuration(reste)}` : quoi;
}

/** Ce qui nourrit ou désaltère, dans le sac de ce combattant. */
export function edibles(unit: Combatant): CarriedItem[] {
  return unit.inventory.filter((i) => i.qty > 0 && !!nourishmentOf(i));
}
