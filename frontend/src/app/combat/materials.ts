import catalog from '../../../public/resources/json/materials.json';
import { MaterialFamily, MaterialFamilyKey, Material, MaterialRegion } from '../wiki.types';

/* ──────────────────────────────────────────────────────────────────────────
   LES MATÉRIAUX DE LA TERRE

   Le domaine n'a pas un sort par pierre : il a un sort par FAMILLE, et sa
   saveur vient de ce qu'on façonne réellement. Trois manières d'y arriver,
   dans l'ordre où le moteur les essaie :

   1. MANIPULATION — la matière est là, sous les pieds. Rien à apprendre, rien
      à créer : on la façonne. Le moins cher, et c'est stable. Mais on ne
      choisit pas : le sol impose ce qu'il a.
   2. EX-NIHILO ÉTUDIÉ — la matière est absente, mais on l'a étudiée. On la
      conjure n'importe où, au prix fort, et elle se décompose sans soutien.
   3. IMPROVISATION — ni là, ni étudiée, mais vue et touchée un jour. Cher,
      fragile, à moitié efficace et difficile à placer. Un filet de secours,
      pas une méthode.

   Le mage soldat économise son mana avec ce qui l'entoure ; l'érudit de la
   Terre a un arsenal pour toute situation. C'est la même magie, payée
   différemment.
─────────────────────────────────────────────────────────────────────────── */

export const MATERIAL_FAMILIES = catalog.families as MaterialFamily[];
export const MATERIALS = catalog.materials as Material[];
export const MATERIAL_REGIONS = catalog.regions as MaterialRegion[];

export const MATERIAL_BY_KEY = new Map<string, Material>(
  MATERIALS.map((m) => [m.key, m]),
);

/**
 * Un aimant a-t-il prise sur cette matière ?
 *
 * Une matière inconnue du catalogue (bois, cuir, plomb) n'est pas magnétique :
 * l'absence de réponse vaut « non », ce qui est le bon défaut — on ne saisit
 * pas ce dont on ignore la nature.
 */
export const isFerromagnetic = (material: string | undefined): boolean =>
  !!material && !!MATERIAL_BY_KEY.get(material)?.ferromagnetic;

/**
 * La composition d'un objet, telle qu'elle s'écrit sur sa fiche.
 *
 * « Acier — dur et tenace à la fois ». Rend une chaîne vide pour ce dont on
 * ignore la matière : mieux vaut une ligne absente qu'une ligne creuse.
 */
export function compositionLabel(material: string | undefined): string {
  const def = material ? MATERIAL_BY_KEY.get(material) : undefined;
  return def ? `${def.name} — ${def.property.toLowerCase()}` : '';
}

/** Les matériaux d'une famille, dans l'ordre du catalogue. */
export const materialsOfFamily = (family: MaterialFamilyKey): Material[] =>
  MATERIALS.filter((m) => m.family === family);

/* ── Ce qu'on a le droit d'étudier ─────────────────────────────────────────── */

/**
 * Niveaux auxquels une place d'étude s'ouvre — les mêmes que les paliers de
 * maîtrise.
 *
 * L'étude n'est pas un point à dépenser : c'est un repos long face à un
 * échantillon, idéalement avec un mentor. Cinq matériaux au maximum sur une
 * carrière complète, ce qui force à choisir un arsenal plutôt qu'à tout prendre.
 */
export const STUDY_TIERS = [1, 5, 9, 13, 17];

/** Combien de matériaux un personnage de ce niveau peut avoir étudiés. */
export const studySlots = (level: number): number =>
  STUDY_TIERS.filter((seuil) => Math.max(1, level) >= seuil).length;

/**
 * Ce qui empêche d'étudier ce matériau, ou `null`.
 *
 * Deux verrous seulement : le nombre de places ouvertes par le niveau, et les
 * composants d'un alliage. Le bronze ne se trouve dans aucun sol — il faut
 * avoir étudié le cuivre ET l'étain avant de pouvoir le conjurer.
 */
export function cannotStudy(
  material: string,
  studied: readonly string[],
  level: number,
): string | null {
  const def = MATERIAL_BY_KEY.get(material);
  if (!def) return 'Matériau inconnu au catalogue.';
  if (studied.includes(material)) return `${def.name} est déjà étudié.`;
  if (studied.length >= studySlots(level)) {
    const prochain = STUDY_TIERS.find((seuil) => seuil > level);
    return prochain
      ? `Plus de place : la prochaine s'ouvre au niveau ${prochain}.`
      : 'Toutes les places d’étude sont prises.';
  }
  const manquants = (def.requires ?? []).filter((r) => !studied.includes(r));
  if (manquants.length) {
    const noms = manquants.map((r) => MATERIAL_BY_KEY.get(r)?.name ?? r).join(' et ');
    return `${def.name} est un alliage : il faut d’abord étudier ${noms}.`;
  }
  return null;
}

/**
 * Nettoie le bloc des matériaux venu d'une fiche sauvegardée.
 *
 * Vit ICI et non dans l'éditeur parce que c'est de la logique de catalogue :
 * on jette ce que le catalogue ne connaît plus (un matériau renommé depuis la
 * dernière sauvegarde), on borne l'étude aux places que le niveau ouvre, et on
 * ne garde un matériau « porté en tête » que s'il est réellement étudié — sans
 * quoi une fiche redescendue de niveau garderait un équipement fantôme.
 *
 * Rend `undefined` pour une fiche qui n'a jamais touché au domaine : il n'y a
 * alors rien à ranger.
 */
export function normalizeTraining(
  raw: unknown,
  level: number,
): { studied: string[]; known: string[]; equipped?: string } | undefined {
  const rec = (raw ?? {}) as { studied?: unknown; known?: unknown; equipped?: unknown };
  const connus = (arr: unknown): string[] =>
    (Array.isArray(arr) ? arr : [])
      .filter((k): k is string => typeof k === 'string' && MATERIAL_BY_KEY.has(k))
      .filter((k, i, all) => all.indexOf(k) === i);

  const studied = connus(rec.studied).slice(0, studySlots(level));
  const known = connus(rec.known).filter((k) => !studied.includes(k));
  const equipped =
    typeof rec.equipped === 'string' && studied.includes(rec.equipped) ? rec.equipped : undefined;

  if (!studied.length && !known.length) return undefined;
  return { studied, known, equipped };
}

/* ── Le palier employé, et ce qu'il coûte ──────────────────────────────────── */

export type EarthTier = 'manipulation' | 'ex-nihilo' | 'improvisation';

/** Ce que le moteur retient d'un façonnage : quoi, comment, à quel prix. */
export interface EarthShaping {
  material: Material;
  tier: EarthTier;
  /** Multiplicateur de mana, matière et palier confondus. */
  manaFactor: number;
  /** Multiplicateur de ce que le sort produit (dégâts, défense). */
  effectFactor: number;
  /** Points de précision retranchés au jet (5 points = un cran). */
  precisionPenalty: number;
  /** La matière tient-elle sans soutien ? Seule la manipulation est stable. */
  stable: boolean;
  /** Phrase lisible pour le journal et l'infobulle. */
  note: string;
}

/**
 * Surcoût de l'improvisation : +50 % de mana, moitié d'effet, deux crans de
 * précision en moins. Tiré de mémoire, sans échantillon ni étude, le geste est
 * approximatif — et le sort n'a aucune raison d'être aussi sûr qu'un autre.
 */
const IMPROVISATION = { manaFactor: 1.5, effectFactor: 0.5, precisionPenalty: 10 };

/** Ce que la manipulation fait gagner : il n'y a rien à créer, juste à façonner. */
const MANIPULATION_MANA_FACTOR = 0.6;

/** Ce que coûte un matériau étudié qu'on force alors que le sol en offre un autre. */
export const FORCED_MATERIAL_MANA = 3;

/**
 * Quel matériau le sort emploie, et selon quel palier.
 *
 * **Le sol l'emporte sur le sac.** En zone native d'un matériau de la bonne
 * famille, c'est lui qui sort — le lanceur façonne ce qu'il a sous les pieds
 * plutôt que d'en conjurer un autre à côté. C'est ce qui rend la géologie d'une
 * scène lisible : on sait ce qu'un mage de Terre y vaudra avant qu'il n'ouvre
 * la bouche. Forcer son matériau équipé reste possible, mais se paie
 * (cf. `FORCED_MATERIAL_MANA`).
 *
 * `forced` sert exactement à ça : il court-circuite le sol.
 */
export function resolveShaping(
  family: MaterialFamilyKey,
  geology: readonly string[] | undefined,
  training: { studied?: readonly string[]; known?: readonly string[]; equipped?: string } | undefined,
  forced?: string,
): EarthShaping | null {
  const studied = training?.studied ?? [];
  const known = training?.known ?? [];

  /** TOUTES les matières de la bonne famille que le sol offre vraiment. */
  const locales = (geology ?? [])
    .map((key) => MATERIAL_BY_KEY.get(key))
    .filter((m): m is Material => !!m && m.family === family);
  /** Celle qui sort par défaut, faute de choix explicite. */
  const local = locales[0];

  const voulu = forced ?? training?.equipped;
  const equipped = voulu ? MATERIAL_BY_KEY.get(voulu) : undefined;
  const bonneFamille = equipped?.family === family ? equipped : undefined;

  /**
   * Ce que le lanceur sait conjurer de cette famille, faute de mieux.
   *
   * Sans ce filet, un érudit qui avait étudié cinq matières mais n'en avait
   * désigné aucune « en tête » ne pouvait RIEN lancer hors d'une zone
   * géologique — le sort était refusé alors même qu'il savait le faire. Ne
   * rien choisir doit valoir « prends ce que je sais », pas « je ne sais rien ».
   */
  const parDefaut = (): Material | undefined => {
    const savoir = [...(training?.studied ?? []), ...(training?.known ?? [])];
    return savoir
      .map((key) => MATERIAL_BY_KEY.get(key))
      .find((m): m is Material => !!m && m.family === family);
  };

  // Le sol d'abord — sauf si l'on force explicitement autre chose.
  const choisi = forced ? bonneFamille : (local ?? bonneFamille ?? parDefaut());
  if (!choisi) return null;

  // Le sol en porte-t-il, DE CELUI-LÀ ? Comparer au seul premier matériau du
  // terrain interdisait de façonner le second : sur un sol de granite et de
  // basalte, choisir le basalte retombait en « rien à appeler ».
  const surPlace = locales.some((m) => m.key === choisi.key);
  if (surPlace) {
    return {
      material: choisi,
      tier: 'manipulation',
      manaFactor: choisi.manaFactor * MANIPULATION_MANA_FACTOR,
      effectFactor: 1,
      precisionPenalty: 0,
      stable: true,
      note: `${choisi.name} façonné sur place — rien à créer, la forme tient.`,
    };
  }

  if (studied.includes(choisi.key)) {
    return {
      material: choisi,
      tier: 'ex-nihilo',
      manaFactor: choisi.manaFactor,
      effectFactor: 1,
      precisionPenalty: 0,
      stable: false,
      note: `${choisi.name} conjuré — étudié, donc net, mais il se décomposera.`,
    };
  }

  if (known.includes(choisi.key)) {
    return {
      material: choisi,
      tier: 'improvisation',
      manaFactor: choisi.manaFactor * IMPROVISATION.manaFactor,
      effectFactor: IMPROVISATION.effectFactor,
      precisionPenalty: IMPROVISATION.precisionPenalty,
      stable: false,
      note: `${choisi.name} tiré de mémoire — approximatif, deux fois plus fugace.`,
    };
  }

  // Ni sous les pieds, ni étudié, ni jamais touché : il n'y a rien à appeler.
  return null;
}

/** Ce qu'un lanceur peut employer ici, pour que la vue puisse l'offrir au choix. */
export function shapingOptions(
  family: MaterialFamilyKey,
  geology: readonly string[] | undefined,
  training: { studied?: readonly string[]; known?: readonly string[]; equipped?: string } | undefined,
): EarthShaping[] {
  const cles = new Set<string>([
    ...(geology ?? []),
    ...(training?.studied ?? []),
    ...(training?.known ?? []),
  ]);
  const out: EarthShaping[] = [];
  for (const cle of cles) {
    if (MATERIAL_BY_KEY.get(cle)?.family !== family) continue;
    const forme = resolveShaping(family, geology, training, cle);
    if (forme) out.push(forme);
  }
  // Le moins cher d'abord : c'est l'ordre dans lequel on choisit à la table.
  return out.sort((a, b) => a.manaFactor - b.manaFactor);
}
