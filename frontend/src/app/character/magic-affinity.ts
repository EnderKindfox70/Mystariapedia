import {
  AFFINITY_CHART,
  AFFINITY_SLICE_COUNT,
  DOMAIN_DISTRIBUTION_CHARTS,
} from '../views/magics/domain-distribution';
import { MAGIC_DOMAINS } from './universe-data';

/**
 * Tirage des affinités magiques d'un personnage, en deux temps :
 *
 * 1. **Combien** de domaines l'éveil accorde (0 à 3), avec les poids du lore —
 *    ceux du camembert « Répartition naturelle des affinités magiques » de la
 *    page Magie : 76 % une seule, 11 % deux, 4 % trois, 9 % aucune.
 * 2. **Lesquels**, tirés sans remise selon la répartition des domaines DU
 *    PEUPLE du personnage (camemberts par population de la même page) : un nain
 *    sort Terre bien plus souvent qu'un elfe, qui penche Plantes et Vie.
 *
 * Les deux tables viennent de `views/magics/domain-distribution.ts` : retoucher
 * le lore là-bas déplace le tirage d'ici, sans rien recopier.
 */

/** Résultat d'un tirage d'affinité, tel que la fiche l'affiche et l'applique. */
export interface MagicAffinityRoll {
  /** Nombre d'affinités tiré (0 à 3). */
  count: number;
  /** Libellé de la tranche tirée (« Affinité unique », « Mana impossible à réguler »…). */
  label: string;
  /** Clés de domaine tirées (cf. MAGIC_DOMAINS), au plus `count`. */
  domains: string[];
}

/** Clé de peuple dans `characters/races.json` → clé de camembert de population. */
const RACE_KEY_TO_CHART: Record<string, string> = {
  humain: 'humans',
  nain: 'dwarves',
  elf: 'elves',
  'beast-human': 'beast-humans',
  'deep-walker': 'deep-walkers',
};

/** Clé de tranche des camemberts → clé de domaine, quand les deux diffèrent. */
const CHART_KEY_TO_DOMAIN: Record<string, string> = {
  lightning: 'electricity',
  plants: 'plant',
};

const DOMAIN_KEYS = new Set(MAGIC_DOMAINS.map((d) => d.key));

/** Une entrée pondérée du tirage (poids en % du camembert d'origine). */
interface WeightedDomain {
  key: string;
  weight: number;
}

/**
 * Tire un index dans une liste pondérée. Renvoie -1 si tous les poids sont nuls
 * (aucun domaine possible), plutôt que d'inventer un tirage.
 */
function pickWeightedIndex(entries: { weight: number }[], rng: () => number): number {
  const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
  if (total <= 0) return -1;
  let threshold = rng() * total;
  for (let i = 0; i < entries.length; i++) {
    threshold -= Math.max(0, entries[i].weight);
    if (threshold < 0) return i;
  }
  return entries.length - 1; // garde-fou contre les arrondis flottants
}

/**
 * Poids des domaines pour un peuple donné. Sans peuple connu (race non
 * renseignée ou absente des camemberts), on additionne toutes les populations :
 * un Mystarien moyen, faute de mieux.
 */
export function domainWeightsFor(raceKey?: string): WeightedDomain[] {
  const chartKey = raceKey ? RACE_KEY_TO_CHART[raceKey] : undefined;
  const charts = chartKey
    ? DOMAIN_DISTRIBUTION_CHARTS.filter((c) => c.key === chartKey)
    : DOMAIN_DISTRIBUTION_CHARTS;

  const weights = new Map<string, number>();
  for (const chart of charts.length ? charts : DOMAIN_DISTRIBUTION_CHARTS) {
    for (const slice of chart.slices) {
      const key = CHART_KEY_TO_DOMAIN[slice.key] ?? slice.key;
      if (!DOMAIN_KEYS.has(key)) continue;
      weights.set(key, (weights.get(key) ?? 0) + slice.value);
    }
  }
  return [...weights.entries()].map(([key, weight]) => ({ key, weight }));
}

/** Tire le NOMBRE d'affinités (0 à 3) selon les poids du lore. */
export function rollAffinityCount(rng: () => number = Math.random): {
  count: number;
  label: string;
} {
  const slices = AFFINITY_CHART.slices;
  const idx = pickWeightedIndex(
    slices.map((s) => ({ weight: s.value })),
    rng,
  );
  const slice = slices[idx >= 0 ? idx : 0];
  return { count: AFFINITY_SLICE_COUNT[slice.key] ?? 0, label: slice.label };
}

/**
 * Tirage complet : le nombre d'affinités, puis les domaines correspondants
 * tirés sans remise selon les affinités du peuple.
 *
 * `rng` est injectable pour rendre un tirage reproductible (tests, graine).
 */
export function rollMagicAffinity(
  raceKey?: string,
  rng: () => number = Math.random,
): MagicAffinityRoll {
  const { count, label } = rollAffinityCount(rng);
  const pool = domainWeightsFor(raceKey);
  const domains: string[] = [];

  for (let i = 0; i < count; i++) {
    const idx = pickWeightedIndex(pool, rng);
    if (idx < 0) break; // plus aucun domaine possible pour ce peuple
    domains.push(pool[idx].key);
    pool.splice(idx, 1); // sans remise : jamais deux fois le même domaine
  }

  return { count, label, domains };
}

/** Chances du tirage, en toutes lettres (« 76 % affinité unique · … »). */
export const AFFINITY_ODDS: string = AFFINITY_CHART.slices
  .map((s) => `${s.value} % ${s.label.toLowerCase()}`)
  .join(' · ');
