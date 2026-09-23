import catalog from '../../../public/resources/json/plants.json';
import {
  DomainSpellEntry,
  PlantFamily,
  PlantFamilyKey,
  PlantSpecies,
  SpellPlantVariant,
} from '../wiki.types';
import { STUDY_TIERS, studySlots } from './materials';
import { BuilderStats, clone, describeStats, readMeasure, round, writeMeasure } from './spell-customization';

/* ──────────────────────────────────────────────────────────────────────────
   LES ESPÈCES DES PLANTES

   Le domaine n'a pas un sort par plante : il a un sort par GESTE — distiller,
   enraciner, disperser, greffer, se revêtir — et c'est l'ESPÈCE employée qui
   décide de ce que ce geste produit. La même ronce accroche au sol sous
   Ronces étreignantes, déchire en riposte sous Armure d'écorce et nimbe une
   lame sous Lame épineuse : l'espèce ne porte donc aucun chiffre en propre,
   seulement une identité. Ce qu'elle FAIT se lit sur le sort, dans
   `compatiblePlants` (cf. `SpellPlantVariant`).

   Trois façons de lancer, et une seule fait pleinement honneur à la plante :

   1. ESPÈCE ÉTUDIÉE — on sait de quoi on parle. La variante s'applique
      pleinement, au prix normal.
   2. ESPÈCE CONNUE — reconnue et déjà maniée, jamais étudiée. Toute sa
      spécificité s'applique quand même : on sait ce qu'elle fait. Ce qu'on
      n'a pas, c'est la main — et le mana paie l'approximation.
   3. SANS ESPÈCE — la besace ne contient rien que ce geste sache employer. Le
      sort marche quand même, sur le CONCEPT de la plante : effet de base
      amoindri, aucune spécificité, et le même surcoût de mana.

   Les deux premiers se CHOISISSENT ; le troisième est ce qui reste. Une espèce
   qu'on ne sait pas reconnaître ne figure nulle part : on ne décide pas
   d'employer ce qu'on ne sait pas nommer (cf. `availableVariants`).

   C'est le pendant botanique des matériaux de la Terre (cf. `materials.ts`),
   et les deux puisent dans le MÊME pool de cinq études.
─────────────────────────────────────────────────────────────────────────── */

export const PLANT_FAMILIES = catalog.families as PlantFamily[];
export const PLANTS = catalog.plants as PlantSpecies[];

export const PLANT_BY_KEY = new Map<string, PlantSpecies>(PLANTS.map((p) => [p.key, p]));

/** Les espèces d'une famille, dans l'ordre du catalogue. */
export const plantsOfFamily = (family: PlantFamilyKey): PlantSpecies[] =>
  PLANTS.filter((p) => p.family === family);

/**
 * L'espèce telle qu'elle s'écrit sur une fiche : « Belladone (Atropa
 * belladonna) ». Le nom binominal n'est pas une coquetterie — c'est lui qui
 * distingue la ciguë de la carotte sauvage.
 *
 * Rend une chaîne vide pour une clé inconnue du catalogue : mieux vaut une
 * ligne absente qu'une ligne creuse.
 */
export function plantLabel(key: string | undefined): string {
  const def = key ? PLANT_BY_KEY.get(key) : undefined;
  return def ? `${def.name} (${def.latin})` : '';
}

/** Les espèces qui poussent d'elles-mêmes dans cette région. */
export const plantsOfRegion = (region: string): PlantSpecies[] =>
  PLANTS.filter((p) => p.native.includes(region));

/* ── Ce que l'espèce fait d'un sort ────────────────────────────────────────── */

/** Les espèces que ce sort sait employer, dans l'ordre de sa fiche. */
export const variantsOf = (spell: Pick<DomainSpellEntry, 'compatiblePlants'>): SpellPlantVariant[] =>
  spell.compatiblePlants ?? [];

/**
 * Ce que cette espèce fait de ce sort — ou `undefined` si le sort ne sait pas
 * l'employer.
 *
 * `slot` départage les sorts à branches : Symbiose végétale liste la même
 * ronce sous « Ronces » et rien ailleurs, Armure d'écorce liste la même ronce
 * sous « epines-sanglantes ». Sans `slot`, on prend la première variante de
 * l'espèce — ce qui est le bon défaut pour les sorts d'une seule voie.
 */
export function variantFor(
  spell: Pick<DomainSpellEntry, 'compatiblePlants'>,
  plant: string,
  slot?: string,
): SpellPlantVariant | undefined {
  const liste = variantsOf(spell).filter((variante) => variante.plant === plant);
  if (slot !== undefined) return liste.find((variante) => variante.slot === slot);
  return liste[0];
}

/** Les espèces que ce sort emploie pour CETTE branche (`slot`). */
export const variantsForSlot = (
  spell: Pick<DomainSpellEntry, 'compatiblePlants'>,
  slot: string | undefined,
): SpellPlantVariant[] => variantsOf(spell).filter((variante) => variante.slot === slot);

/** Ce sort a-t-il quelque chose à faire d'une espèce ? */
export const usesPlants = (spell: Pick<DomainSpellEntry, 'compatiblePlants'>): boolean =>
  variantsOf(spell).length > 0;

/* ── Trois degrés de connaissance ─────────────────────────────────────────── */

/**
 * Ce que le lanceur sait de l'espèce, du plus fort au plus faible.
 *
 * Le même escalier que la Terre, mais il ne monnaie pas la même chose. Chez
 * la Terre, improviser un matériau connu donne une matière à moitié efficace.
 * Ici, la plante ne se fabrique pas : on l'a sous la main ou non. Ce qui
 * manque quand on ne l'a pas étudiée, c'est la MAÎTRISE — savoir doser la
 * sève, reconnaître le bon pied, tirer de l'espèce ce qu'elle a de propre.
 *
 * - `etudiee` : plein effet, prix normal.
 * - `connue`  : on la reconnaît et on sait s'en servir, donc toute sa
 *   spécificité s'applique — mais le geste reste approximatif et le mana
 *   paie la différence.
 * - `inconnue` : aucune espèce utilisable en main. Le sort tourne alors sur le
 *   CONCEPT de la plante : il marche, il coûte autant qu'une espèce connue, et
 *   il n'a plus rien de particulier. On ne CHOISIT jamais ce palier — c'est ce
 *   qui reste quand la besace ne contient rien que le geste sache employer.
 */
export type PlantTier = 'etudiee' | 'connue' | 'inconnue';

export interface PlantTierRule {
  manaFactor: number;
  /** Ce que le palier retranche à ce que le sort produit. */
  effectFactor: number;
  label: string;
  /** Ce que ce palier veut dire, en une phrase, pour l'infobulle. */
  hint: string;
}

export const PLANT_TIERS: Record<PlantTier, PlantTierRule> = {
  etudiee: {
    manaFactor: 1,
    effectFactor: 1,
    label: 'Étudiée',
    hint: 'Étudiée au repos long : plein effet, prix normal.',
  },
  connue: {
    manaFactor: 1.5,
    effectFactor: 1,
    label: 'Connue',
    hint: 'Reconnue et déjà maniée, jamais étudiée : toute sa spécificité s’applique, mais le mana paie l’approximation.',
  },
  inconnue: {
    manaFactor: 1.5,
    effectFactor: 0.7,
    label: 'Sans espèce',
    hint: 'Rien d’utilisable en main : le sort tourne sur le concept — effet amoindri, aucune spécificité, et le surcoût de mana.',
  },
};

/** Ce qu'un personnage sait des espèces (même forme que la Terre). */
export interface PlantTraining {
  studied?: readonly string[];
  known?: readonly string[];
  /** L'espèce qu'il a sous la main aujourd'hui. */
  equipped?: string;
}

/**
 * À quel degré ce lanceur connaît cette espèce.
 *
 * `training` absent, c'est la fiche du WIKI : on y regarde le sort en soi, pas
 * dans les mains de quelqu'un. Toute espèce y est donc lue comme étudiée —
 * sans quoi la fiche montrerait un sort dégradé sans qu'on puisse dire par
 * rapport à quoi.
 */
export const plantTier = (plant: string, training: PlantTraining | null | undefined): PlantTier => {
  if (!training) return 'etudiee';
  if (training.studied?.includes(plant)) return 'etudiee';
  if (training.known?.includes(plant)) return 'connue';
  return 'inconnue';
};

/* ── Ce que l'espèce fait du sort, une fois le degré connu ─────────────────── */

/** Ce que le moteur retient d'un lancer végétal : quoi, su ou deviné, à quel prix. */
export interface PlantBinding {
  /** L'espèce employée — `null` quand le lanceur n'a rien d'utilisable en main. */
  species: PlantSpecies | null;
  /** La variante appliquée — `null` sans espèce. */
  variant: SpellPlantVariant | null;
  tier: PlantTier;
  /** La branche visée, quand le sort en a plusieurs. */
  slot?: string;
  /** Multiplicateur de mana, espèce et degré de connaissance confondus. */
  manaFactor: number;
  /** Multiplicateurs par canal ; 1 = rien à changer. */
  damageFactor: number;
  healFactor: number;
  effectFactor: number;
  chanceFactor: number;
  durationFactor: number;
  radiusFactor: number;
  recoilFactor: number;
  /** Statut imposé par l'espèce à la place de celui du socle, s'il y en a un. */
  inflicts?: string;
  /** Statuts ajoutés à celui du sort. Vide sans espèce. */
  adds: { status: string; chance: number }[];
  /** Vitesse retranchée à qui porte l'espèce. */
  speedPenalty: number;
  /** Règle propre que le moteur ne sait pas encore appliquer, s'il y en a une. */
  special?: string;
  /** Phrase lisible pour le journal et l'infobulle. */
  note: string;
}

const num = (valeur: number | undefined): number => (typeof valeur === 'number' ? valeur : 1);

/**
 * Le lancer, espèce comprise : ce que le sort vaut avec CETTE plante, sue à CE
 * degré.
 *
 * Rend `null` si le sort ne sait rien faire de l'espèce — un cactus n'a rien à
 * distiller. C'est un refus franc, pas un lancer dégradé : le surcoût de
 * l'ignorance s'applique à une espèce qu'on connaît mal, jamais à une espèce
 * que le geste n'emploie pas.
 */
export function bindPlant(
  spell: Pick<DomainSpellEntry, 'compatiblePlants'>,
  plant: string,
  tier: PlantTier,
  slot?: string,
): PlantBinding | null {
  const species = PLANT_BY_KEY.get(plant);
  const variant = variantFor(spell, plant, slot);
  if (!species || !variant) return null;
  // Une espèce qu'on ne sait pas reconnaître ne se DÉSIGNE pas : on ne sait
  // pas qu'on la tient. Le lancer retombe alors sur le geste nu.
  if (tier === 'inconnue') return genericPlant();
  const palier = PLANT_TIERS[tier];

  return {
    species,
    variant,
    tier,
    slot: variant.slot,
    manaFactor: num(variant.manaFactor) * palier.manaFactor,
    damageFactor: num(variant.damageFactor),
    healFactor: num(variant.healFactor),
    effectFactor: num(variant.effectFactor),
    chanceFactor: num(variant.chanceFactor),
    durationFactor: num(variant.durationFactor),
    radiusFactor: num(variant.radiusFactor),
    recoilFactor: num(variant.recoilFactor),
    inflicts: variant.inflicts,
    adds: variant.adds ?? [],
    speedPenalty: variant.speedPenalty ?? 0,
    special: variant.special,
    note:
      tier === 'connue'
        ? `${species.name} reconnu sans étude — ${variant.effect} Le mana paie l'approximation.`
        : `${species.name} — ${variant.effect}`,
  };
}

/**
 * Le lancer SANS espèce : le geste seul, payé au prix du tâtonnement.
 *
 * C'est ce qui reste à un mage dont la besace ne contient rien que ce sort
 * sache employer. Le sort marche — le domaine ne se referme pas faute d'avoir
 * ramassé la bonne plante — mais il ne fait que ce que son socle décrit, et il
 * coûte le surcoût de l'approximation.
 */
export function genericPlant(): PlantBinding {
  const palier = PLANT_TIERS.inconnue;
  return {
    species: null,
    variant: null,
    tier: 'inconnue',
    manaFactor: palier.manaFactor,
    // L'atténuation frappe ce que le sort DONNE, jamais ce qu'il coûte à son
    // lanceur : un contrecoup amoindri serait une récompense à l'ignorance.
    damageFactor: palier.effectFactor,
    healFactor: palier.effectFactor,
    effectFactor: palier.effectFactor,
    chanceFactor: 1,
    durationFactor: 1,
    radiusFactor: 1,
    recoilFactor: 1,
    adds: [],
    speedPenalty: 0,
    note:
      'Aucune espèce utilisable en main : le geste se fait sur le concept de la plante — effet de base amoindri, et le mana paie la devinette.',
  };
}

/**
 * Les espèces que CE lanceur peut réellement employer sur CE sort.
 *
 * `training` absent (fiche du wiki) : tout le catalogue compatible, puisqu'on
 * y essaie le sort en soi. Sinon, uniquement ce qui est étudié ou connu — une
 * espèce qu'on ne sait pas reconnaître n'a rien à faire dans une liste de
 * choix : on ne peut pas décider d'employer ce qu'on ne sait pas nommer.
 */
export function availableVariants(
  spell: Pick<DomainSpellEntry, 'compatiblePlants'>,
  training: PlantTraining | null | undefined,
): SpellPlantVariant[] {
  const toutes = variantsOf(spell);
  if (!training) return toutes;
  return toutes.filter((v) => plantTier(v.plant, training) !== 'inconnue');
}

/* ── L'impact réel, sur les stats du sort construit ────────────────────────── */

/** Arrondi qui ne laisse jamais tomber à zéro ce qui existait. */
const ech = (valeur: number, facteur: number): number =>
  facteur === 1 ? valeur : Math.max(valeur > 0 ? 1 : valeur, Math.round(valeur * facteur));

const pourcent = (valeur: number, facteur: number): number =>
  Math.max(0, Math.min(100, Math.round(valeur * facteur)));

/**
 * Les stats du sort construit, relues à travers l'espèce employée.
 *
 * C'est ici que la variante cesse d'être un texte : la belladone baisse
 * vraiment la chance de prise et monte vraiment les dégâts, le séquoia coûte
 * vraiment plus cher. Rien n'est écrit dans le budget — l'espèce ne s'achète
 * pas en points, elle se ramasse et s'étudie.
 *
 * `binding` absent : les stats reviennent telles quelles, ce qui est le bon
 * défaut pour un sort sans plante ou une espèce non choisie.
 */
export function applyPlantToStats<T extends BuilderStats>(stats: T, binding: PlantBinding | null): T {
  if (!binding) return stats;
  const out = clone(stats);

  /**
   * Un sort à branches (Symbiose) ne porte pas ses chiffres sur le socle : ils
   * vivent dans le choix. L'espèce n'a alors rien à dire des trois autres
   * branches — le chêne ne rend pas le lierre plus cher.
   */
  const branche = binding.slot ? (out.choices ?? []).find((c) => c.name === binding.slot) : undefined;
  if (branche) {
    if (branche.mana != null) branche.mana = Math.max(1, ech(branche.mana, binding.manaFactor));
    if (branche.heal != null) branche.heal = ech(branche.heal, binding.healFactor);
    for (const e of branche.effects ?? []) {
      if (typeof e.value === 'number') e.value = ech(e.value, binding.effectFactor);
    }
    if (branche.recoil) {
      const r = branche.recoil;
      if (r.damageMin != null) r.damageMin = ech(r.damageMin, binding.recoilFactor);
      if (r.damageMax != null) r.damageMax = ech(r.damageMax, binding.recoilFactor);
    }
    if (typeof branche.duration === 'number' && branche.duration > 0) {
      branche.duration = Math.max(1, ech(branche.duration, binding.durationFactor));
    }
    if (binding.speedPenalty) {
      branche.effects = [...(branche.effects ?? []), { stat: 'speed', value: -binding.speedPenalty }];
    }
    return out;
  }

  out.mana = Math.max(1, ech(out.mana ?? 0, binding.manaFactor));
  if (out.upkeep != null) out.upkeep = Math.max(1, ech(out.upkeep, binding.manaFactor));

  if (out.damageMin != null) out.damageMin = ech(out.damageMin, binding.damageFactor);
  if (out.damageMax != null) out.damageMax = ech(out.damageMax, binding.damageFactor);
  for (const d of out.damages ?? []) {
    d.min = ech(d.min, binding.damageFactor);
    d.max = ech(d.max, binding.damageFactor);
  }
  if (out.heal != null) out.heal = ech(out.heal, binding.healFactor);
  for (const e of out.effects ?? []) {
    if (typeof e.value === 'number') e.value = ech(e.value, binding.effectFactor);
  }
  if (out.recoil) {
    const r = out.recoil;
    if (r.damageMin != null) r.damageMin = ech(r.damageMin, binding.recoilFactor);
    if (r.damageMax != null) r.damageMax = ech(r.damageMax, binding.recoilFactor);
  }

  // Une riposte est le coup de l'espèce elle-même : c'est son épine qui frappe
  // et son poison qui prend, donc elle suit les mêmes facteurs que le sort.
  if (out.retaliate) {
    const r = out.retaliate;
    if (r.damageMin != null) r.damageMin = ech(r.damageMin, binding.damageFactor);
    if (r.damageMax != null) r.damageMax = ech(r.damageMax, binding.damageFactor);
    for (const inf of r.inflicts ?? []) inf.chance = pourcent(inf.chance, binding.chanceFactor);
  }

  // Le statut imposé remplace celui du SOCLE (le premier), jamais un statut
  // débloqué au budget : ce qu'on a payé en points reste acquis.
  if (binding.inflicts && out.inflicts?.length) out.inflicts[0].status = binding.inflicts;
  for (const inf of out.inflicts ?? []) inf.chance = pourcent(inf.chance, binding.chanceFactor);
  if (binding.adds.length) out.inflicts = [...(out.inflicts ?? []), ...clone(binding.adds)];

  // Durée négative = mode continu (actif tant qu'on paie) : rien à allonger.
  if (typeof out.duration === 'number' && out.duration > 0) {
    out.duration = Math.max(1, ech(out.duration, binding.durationFactor));
  }
  if (out.area != null && binding.radiusFactor !== 1) {
    const mesure = readMeasure(out.area);
    if (!Number.isNaN(mesure)) {
      out.area = String(writeMeasure(out.area, round(mesure * binding.radiusFactor, 1)));
    }
  }

  if (binding.speedPenalty) {
    out.effects = [...(out.effects ?? []), { stat: 'speed', value: -binding.speedPenalty }];
  }

  return out;
}

/**
 * Les chiffres d'UNE branche d'un sort à choix, en lignes de fiche.
 *
 * `describeStats` ne descend pas dans les choix — et elle a raison : un sort à
 * quatre symbioses en afficherait quatre jeux. Ici on ne décrit que la branche
 * que l'espèce vise, parce que c'est la seule qu'elle change.
 */
function describeBranch(
  stats: BuilderStats,
  slot: string | undefined,
): { key: string; label: string; value: string }[] {
  const branche = slot ? (stats.choices ?? []).find((c) => c.name === slot) : undefined;
  if (!branche) return [];
  const rows: { key: string; label: string; value: string }[] = [];
  const push = (key: string, label: string, value: string) =>
    rows.push({ key: `choice:${key}`, label: `${branche.name} — ${label}`, value });

  if (branche.mana != null) push('mana', 'Mana', String(branche.mana));
  if (branche.heal != null) push('heal', 'Soin', String(branche.heal));
  if (branche.duration != null) push('duration', 'Durée', `${branche.duration} tour(s)`);
  for (const e of branche.effects ?? []) push(`effect:${e.stat}`, `Effet ${e.stat}`, `+${e.value}`);
  if (branche.recoil) {
    push('recoil', 'Contrecoup', `${branche.recoil.damageMin}–${branche.recoil.damageMax}`);
  }
  return rows;
}

/**
 * Ce que l'espèce change, ligne à ligne : « Mana 4 → 6 ».
 *
 * Seulement les lignes qui BOUGENT, dans les deux sens : une ligne qui
 * DISPARAÎT compte autant qu'une qui apparaît — le narcisse efface le Poison
 * pour poser le Sommeil, et la fiche doit montrer les deux moitiés du troc.
 * C'est ce qui fait la différence entre une promesse écrite sur la fiche et un
 * impact qu'on peut lire.
 */
export function plantImpact(
  stats: BuilderStats,
  binding: PlantBinding | null,
  statusNames: Record<string, string> = {},
): { key: string; label: string; before: string; after: string }[] {
  if (!binding) return [];
  const joue = applyPlantToStats(stats, binding);
  const avant = [...describeStats(stats, statusNames), ...describeBranch(stats, binding.slot)];
  const apres = [...describeStats(joue, statusNames), ...describeBranch(joue, binding.slot)];
  const lues = new Map(avant.map((r) => [r.key, r]));
  const gardees = new Set(apres.map((r) => r.key));

  const lignes = apres
    .filter((r) => lues.get(r.key)?.value !== r.value)
    .map((r) => ({ key: r.key, label: r.label, before: lues.get(r.key)?.value ?? '—', after: r.value }));

  for (const r of avant) {
    if (!gardees.has(r.key)) lignes.push({ key: r.key, label: r.label, before: r.value, after: '—' });
  }
  return lignes;
}

/* ── Ce qu'on a le droit d'étudier ─────────────────────────────────────────── */

export { STUDY_TIERS, studySlots };

/**
 * Ce qui empêche d'étudier cette espèce, ou `null`.
 *
 * `otherStudies` porte les études DÉJÀ faites ailleurs — matériaux de la Terre,
 * traits animaux de la Vie. Le pool de cinq places est unique pour tout le
 * personnage : un mage qui a passé trois repos sur des pierres n'a plus que
 * deux plantes devant lui, et c'est le but.
 */
export function cannotStudyPlant(
  plant: string,
  studied: readonly string[],
  level: number,
  otherStudies = 0,
): string | null {
  const def = PLANT_BY_KEY.get(plant);
  if (!def) return 'Espèce inconnue au catalogue.';
  if (studied.includes(plant)) return `${def.name} est déjà étudié.`;
  if (studied.length + otherStudies >= studySlots(level)) {
    const prochain = STUDY_TIERS.find((seuil) => seuil > level);
    return prochain
      ? `Plus de place : la prochaine s'ouvre au niveau ${prochain}.`
      : 'Toutes les places d’étude sont prises.';
  }
  return null;
}

/**
 * Nettoie le bloc des plantes venu d'une fiche sauvegardée.
 *
 * Même logique que `normalizeTraining` pour la Terre : on jette ce que le
 * catalogue ne connaît plus, on borne l'étude aux places que le niveau ouvre,
 * et on ne garde l'espèce « en main » que si elle est réellement étudiée —
 * sans quoi une fiche redescendue de niveau garderait une plante fantôme.
 *
 * Rend `undefined` pour une fiche qui n'a jamais touché au domaine.
 */
export function normalizePlantTraining(
  raw: unknown,
  level: number,
  otherStudies = 0,
): { studied: string[]; known: string[]; equipped?: string } | undefined {
  const rec = (raw ?? {}) as { studied?: unknown; known?: unknown; equipped?: unknown };
  const connues = (arr: unknown): string[] =>
    (Array.isArray(arr) ? arr : [])
      .filter((k): k is string => typeof k === 'string' && PLANT_BY_KEY.has(k))
      .filter((k, i, all) => all.indexOf(k) === i);

  const studied = connues(rec.studied).slice(0, Math.max(0, studySlots(level) - otherStudies));
  const known = connues(rec.known).filter((k) => !studied.includes(k));
  /**
   * La besace ne contient que ce qu'on sait reconnaître. Ramasser une plante
   * qu'on ne saurait pas nommer ne servirait à rien : on ne pourrait pas
   * décider de s'en servir, et le sort retomberait de toute façon sur son
   * geste nu (cf. `genericPlant`).
   */
  const equipped =
    typeof rec.equipped === 'string' &&
    (studied.includes(rec.equipped) || known.includes(rec.equipped))
      ? rec.equipped
      : undefined;

  if (!studied.length && !known.length) return undefined;
  return { studied, known, equipped };
}
