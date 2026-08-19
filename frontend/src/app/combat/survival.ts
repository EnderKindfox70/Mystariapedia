import { StatKey, SurvivalKey } from '../character/character.types';
import {
  clampSurvival,
  SURVIVAL_GAUGES,
  SurvivalGauge,
  survivalStage,
} from '../character/universe-data';
import { HOUR } from './clock';

/* ──────────────────────────────────────────────────────────────────────────
   FAIM, SOIF, SOMMEIL

   La fiche tenait déjà ces trois jauges, mais personne ne les cochait : rien
   ne les faisait descendre, et rien ne se passait quand elles étaient vides.
   Ce module leur donne les deux moitiés qui manquaient — **le temps les use**,
   et **le vide se paie**.

   Une jauge n'est PAS stockée en crans ici, mais en **secondes écoulées depuis
   le dernier plein**. Les crans en sont déduits. C'est ce qui permet d'avancer
   le temps par tranches de dix minutes sans jamais perdre un reste dans un
   arrondi : deux heures d'affilée coûtent exactement ce que coûtent douze fois
   dix minutes.
─────────────────────────────────────────────────────────────────────────── */

/** Secondes écoulées depuis le dernier plein, par jauge. */
export type SurvivalState = Record<SurvivalKey, number>;

/** La jauge portant cette clé (les trois sont toujours définies). */
export const gaugeOf = (key: SurvivalKey): SurvivalGauge =>
  SURVIVAL_GAUGES.find((g) => g.key === key)!;

/**
 * Temps d'activité ordinaire qu'il faut pour perdre UN cran.
 *
 * Lu à l'envers, ces nombres disent la laisse de chaque besoin : deux jours
 * sans manger, vingt heures debout, seize heures sans boire. La soif est la
 * plus courte parce qu'elle est celle qui tue le plus vite, et le voyage se
 * règle sur elle — c'est elle qui décide où l'on campe.
 */
export const NOTCH_SECONDS: Record<SurvivalKey, number> = {
  hunger: 8 * HOUR, // 6 crans → 48 h
  rest: 4 * HOUR, //   5 crans → 20 h
  thirst: 4 * HOUR, // 4 crans → 16 h
};

/**
 * Ce que le groupe est en train de faire, et ce que ça coûte.
 *
 * Un facteur multiplie l'usure ordinaire ; **un facteur négatif comble** la
 * jauge au lieu de la vider. C'est ce qui fait que dormir est une action comme
 * une autre pour le moteur : on avance le temps, et le sommeil remonte quand
 * les deux autres descendent doucement.
 */
export interface Activity {
  key: string;
  label: string;
  description: string;
  /** Facteur d'usure par jauge (négatif = récupération). */
  factors: Record<SurvivalKey, number>;
}

export const ACTIVITIES: Activity[] = [
  {
    key: 'route',
    label: 'Marche',
    description: "Le pas du voyage : on avance, on porte son sac, on ne s'épuise pas.",
    factors: { hunger: 1, thirst: 1, rest: 1 },
  },
  {
    key: 'effort',
    label: 'Effort soutenu',
    description: 'Course, escalade, portage, fuite. La gorge sèche avant les jambes.',
    factors: { hunger: 1.5, thirst: 2, rest: 1.5 },
  },
  {
    key: 'repos',
    label: 'Repos au camp',
    description: "Assis près du feu sans dormir. On souffle, on ne récupère qu'à moitié.",
    factors: { hunger: 0.5, thirst: 0.5, rest: -0.5 },
  },
  {
    key: 'veille',
    label: 'Veille',
    description: "Le tour de garde : éveillé pendant que les autres dorment, donc rien n'y remonte.",
    factors: { hunger: 0.5, thirst: 0.5, rest: 1 },
  },
  {
    key: 'sommeil',
    label: 'Sommeil',
    description: 'Une nuit pleine remet la jauge de sommeil à neuf ; la faim et la soif, elles, courent toujours.',
    // 2,5× la vitesse d'usure : huit heures de sommeil comblent les vingt
    // heures d'éveil qui les précèdent. C'est ce qui rend une nuit complète
    // suffisante — et une nuit écourtée insuffisante.
    factors: { hunger: 0.4, thirst: 0.4, rest: -2.5 },
  },
  {
    key: 'combat',
    label: 'Combat',
    description: "Appliqué tout seul, six secondes par round : un combat ne creuse pas l'estomac, mais il assèche.",
    factors: { hunger: 2, thirst: 3, rest: 2 },
  },
];

export const activityByKey = (key: string): Activity | undefined =>
  ACTIVITIES.find((a) => a.key === key);

/** L'activité par défaut hors combat, et celle appliquée pendant les rounds. */
export const DEFAULT_ACTIVITY = 'route';
export const COMBAT_ACTIVITY = 'combat';

/** Jauges pleines : un personnage qui vient de manger, boire et dormir. */
export const freshSurvival = (): SurvivalState => ({ hunger: 0, thirst: 0, rest: 0 });

/** Crans restants d'une jauge, déduits du temps écoulé depuis le dernier plein. */
export function notchesLeft(key: SurvivalKey, state: SurvivalState | undefined): number {
  const gauge = gaugeOf(key);
  const elapsed = Math.max(0, state?.[key] ?? 0);
  return clampSurvival(gauge, gauge.segments - Math.floor(elapsed / NOTCH_SECONDS[key]));
}

/** Verdict affiché d'une jauge (« Le ventre creux », « Déshydraté »). */
export const stageOf = (key: SurvivalKey, state: SurvivalState | undefined): string =>
  survivalStage(gaugeOf(key), notchesLeft(key, state));

/** Temps écoulé correspondant à un nombre de crans restants (conversion inverse). */
export const elapsedForNotches = (key: SurvivalKey, notches: number): number =>
  (gaugeOf(key).segments - clampSurvival(gaugeOf(key), notches)) * NOTCH_SECONDS[key];

/** Reconstruit l'état interne à partir des crans stockés sur une fiche. */
export function survivalFromNotches(notches: Partial<Record<SurvivalKey, number>> | undefined): SurvivalState {
  const state = freshSurvival();
  for (const gauge of SURVIVAL_GAUGES) {
    const value = notches?.[gauge.key];
    state[gauge.key] = value === undefined ? 0 : elapsedForNotches(gauge.key, value);
  }
  return state;
}

/** Crans à écrire sur une fiche, à partir de l'état interne. */
export function survivalToNotches(state: SurvivalState | undefined): Record<SurvivalKey, number> {
  return Object.fromEntries(
    SURVIVAL_GAUGES.map((g) => [g.key, notchesLeft(g.key, state)]),
  ) as Record<SurvivalKey, number>;
}

/**
 * Fait courir le temps sur les trois jauges.
 *
 * Rend un NOUVEL état : le moteur clone la rencontre avant chaque action, on ne
 * mute rien en place ici pour que la fonction reste testable seule.
 */
export function drain(state: SurvivalState, seconds: number, activity: Activity): SurvivalState {
  const next: SurvivalState = { ...state };
  for (const gauge of SURVIVAL_GAUGES) {
    const factor = activity.factors[gauge.key] ?? 1;
    // Une jauge pleine ne déborde pas, et une jauge vide ne s'enfonce pas :
    // sans ce plafond, trois jours de jeûne demanderaient trois jours de repas
    // pour être rattrapés.
    const floor = 0;
    const ceiling = gauge.segments * NOTCH_SECONDS[gauge.key];
    next[gauge.key] = Math.min(ceiling, Math.max(floor, next[gauge.key] + seconds * factor));
  }
  return next;
}

/** Comble une jauge de `notches` crans (manger, boire, dormir d'un bloc). */
export function restore(state: SurvivalState, key: SurvivalKey, notches: number): SurvivalState {
  const gained = Math.max(0, notches) * NOTCH_SECONDS[key];
  return { ...state, [key]: Math.max(0, state[key] - gained) };
}

/* ── Ce que le vide coûte ──────────────────────────────────────────────────
   Le suivi ne vaut que s'il pèse. Chaque palier pose des malus de stat, lus
   par `effectiveStat` comme n'importe quel statut : un groupe qui a marché
   trois jours sans camper frappe moins fort et se traîne, sans que le MJ ait
   à s'en souvenir.

   Les paliers sont donnés du plus grave au moins grave ; le PREMIER dont le
   seuil est atteint gagne. Deux paliers par jauge : au-delà, on lit un tableau
   au lieu de jouer.
─────────────────────────────────────────────────────────────────────────── */

export interface SurvivalPenalty {
  /** S'applique quand il reste ce nombre de crans ou moins. */
  atMost: number;
  mods: { stat: StatKey; value: number }[];
}

export const SURVIVAL_PENALTIES: Record<SurvivalKey, SurvivalPenalty[]> = {
  // La faim ronge la force du coup : on frappe encore, mais mollement.
  hunger: [
    {
      atMost: 0,
      mods: [
        { stat: 'atk_phy', value: -3 },
        { stat: 'atk_mag', value: -2 },
        { stat: 'endurance', value: -3 },
      ],
    },
    {
      atMost: 1,
      mods: [
        { stat: 'atk_phy', value: -1 },
        { stat: 'endurance', value: -1 },
      ],
    },
  ],
  // La soif est la plus brutale : elle prend la garde et le souffle ensemble.
  thirst: [
    {
      atMost: 0,
      mods: [
        { stat: 'def_phy', value: -3 },
        { stat: 'def_mag', value: -3 },
        { stat: 'endurance', value: -4 },
        { stat: 'speed', value: -2 },
      ],
    },
    {
      atMost: 1,
      mods: [
        { stat: 'def_phy', value: -1 },
        { stat: 'def_mag', value: -1 },
        { stat: 'endurance', value: -2 },
      ],
    },
  ],
  // Le manque de sommeil prend la vitesse — donc le déplacement, l'initiative
  // ET l'esquive naturelle, puisque la Vitesse porte les trois.
  rest: [
    {
      atMost: 0,
      mods: [
        { stat: 'speed', value: -4 },
        { stat: 'atk_phy', value: -2 },
        { stat: 'atk_mag', value: -2 },
        { stat: 'endurance', value: -2 },
      ],
    },
    {
      atMost: 1,
      mods: [
        { stat: 'speed', value: -2 },
        { stat: 'atk_mag', value: -1 },
      ],
    },
  ],
};

/** Palier actif d'une jauge, ou rien tant qu'elle tient. */
export function penaltyFor(key: SurvivalKey, state: SurvivalState | undefined): SurvivalPenalty | undefined {
  const left = notchesLeft(key, state);
  return SURVIVAL_PENALTIES[key].find((p) => left <= p.atMost);
}

/**
 * Tous les malus de survie d'un état, à plat. C'est le seul point que le moteur
 * consulte : `effectiveStat` les additionne aux statuts et aux effets.
 */
export function survivalMods(state: SurvivalState | undefined): { stat: StatKey; value: number }[] {
  if (!state) return [];
  const out: { stat: StatKey; value: number }[] = [];
  for (const gauge of SURVIVAL_GAUGES) {
    for (const mod of penaltyFor(gauge.key, state)?.mods ?? []) out.push(mod);
  }
  return out;
}

/** Phrase de journal résumant l'état d'une jauge qui vient de perdre un cran. */
export const survivalNote = (key: SurvivalKey, state: SurvivalState): string =>
  `${gaugeOf(key).label} : ${stageOf(key, state)} (${notchesLeft(key, state)}/${gaugeOf(key).segments})`;

/* ── Ce qui remplit les jauges ─────────────────────────────────────────────
   Le sac porte déjà de quoi tenir la route : le wiki a ses rations et son
   outre. Plutôt que de deviner ce qui se mange à partir d'un nom, on tient une
   courte liste — tout le reste passe par les gestes du camp (« Repas »,
   « Boire »), où le MJ tranche.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Nom de la ligne qu'une outre bue laisse dans le sac. Écrit une fois : c'est
 * la clé que « Remplir les outres » va rechercher pour faire le chemin inverse.
 */
export const EMPTY_WATERSKIN = 'Outre vide';

/** Nom de l'outre pleine, celui du catalogue d'équipement. */
export const WATERSKIN = 'Outre en peau';

export interface Nourishment {
  /** Slug de la fiche wiki, quand l'objet vient du catalogue. */
  slug?: string;
  /** Nom tel qu'il apparaît dans le sac. */
  name: string;
  gauge: SurvivalKey;
  /** Crans rendus. */
  notches: number;
  /**
   * Ce que la ligne devient à l'usage, quand elle ne disparaît pas.
   *
   * Une outre n'est pas mangée : elle se vide. La faire disparaître du sac
   * ferait perdre le récipient à qui boit, et la garder pleine donnerait de
   * l'eau à l'infini. Elle devient donc une **outre vide**, qui se voit dans
   * le sac et se remplit à la prochaine source.
   */
  becomes?: string;
  note?: string;
}

/**
 * Les vivres, dans l'ordre de ce qu'ils rendent.
 *
 * **Le barème suit les fiches du wiki**, pas l'inverse : « une ration par jour »
 * y est écrit noir sur blanc, et la jauge de faim vaut deux jours en six crans.
 * Une ration de voyage rend donc UNE journée — trois crans — et non la jauge
 * entière comme au premier jet.
 *
 * De là découlent les deux autres tailles : la petite ration est le tiers de
 * journée qu'on tire d'un collet ou d'un buisson, la grande est les deux jours
 * qu'on tire d'un cuissot. C'est ce qui donne un sens à la chasse — elle rapporte
 * des VIVRES, dont la taille dit si le groupe a bien ou mal chassé, au lieu de
 * remplir la jauge d'un coup de baguette.
 */
export const NOURISHMENTS: Nourishment[] = [
  {
    slug: 'petite-ration',
    name: 'Petite ration',
    gauge: 'hunger',
    notches: 1,
  },
  {
    slug: 'rations-de-voyage',
    name: 'Rations de voyage',
    gauge: 'hunger',
    notches: 3,
  },
  {
    slug: 'grande-ration',
    name: 'Grande ration',
    gauge: 'hunger',
    notches: 6,
  },
  {
    slug: 'outre-en-peau',
    name: 'Outre en peau',
    gauge: 'thirst',
    notches: 4,
    becomes: EMPTY_WATERSKIN,
    note: 'L’outre est vide — à remplir à la prochaine source.',
  },
];

/** Ce qu'une ligne du sac nourrit, si elle nourrit quelque chose. */
export function nourishmentOf(item: { name: string; slug?: string }): Nourishment | undefined {
  return NOURISHMENTS.find(
    (n) =>
      (item.slug && n.slug === item.slug) ||
      n.name.toLowerCase() === item.name.trim().toLowerCase(),
  );
}

/** Les vivres solides, pour les listes de ravitaillement (achat, don, butin). */
export const HUNGER_SUPPLIES = NOURISHMENTS.filter((n) => n.gauge === 'hunger');

/* ── La chasse ─────────────────────────────────────────────────────────────
   Chasser, c'est prendre un risque, pas cocher une case. Le jet est ce qui
   rend le ravitaillement incertain — et donc ce qui fait qu'un groupe compte
   ses rations au lieu de partir la besace vide en se disant qu'on trouvera
   bien quelque chose.

   Le tirage passe par le `Rng` de la rencontre : une partie rechargée redonne
   exactement la même chasse, comme n'importe quel autre jet du moteur.
─────────────────────────────────────────────────────────────────────────── */

export interface HuntOutcome {
  key: string;
  label: string;
  /** Part de chances sur 100. La somme de la table fait exactement 100. */
  chance: number;
  /** Ce que la battue rapporte, ou rien du tout. */
  nourishment?: Nourishment;
  /** Phrase de journal décrivant la prise. */
  flavour: string;
}

/**
 * Table de chasse, du plus mauvais au meilleur.
 *
 * Une battue sur quatre ne rend rien : c'est ce qui empêche la chasse de
 * remplacer purement et simplement les rations. Le reste penche largement vers
 * le petit gibier — on ramène un lièvre bien plus souvent qu'un cerf.
 */
export const HUNT_TABLE: HuntOutcome[] = [
  {
    key: 'bredouille',
    label: 'Bredouille',
    chance: 25,
    flavour: 'Des traces, du vent, rien au bout. La battue ne rend rien.',
  },
  {
    key: 'petit',
    label: 'Petit gibier',
    chance: 55,
    nourishment: NOURISHMENTS[0],
    flavour: 'Un lièvre au collet, quelques oiseaux, une poignée de baies.',
  },
  {
    key: 'median',
    label: 'Gibier médian',
    chance: 20,
    nourishment: NOURISHMENTS[1],
    flavour: 'Un chevreuil, un sanglier de l’année : la journée est assurée.',
  },
];

/** Somme des chances de la table — 100, et les tests le vérifient. */
export const HUNT_TOTAL = HUNT_TABLE.reduce((sum, o) => sum + o.chance, 0);

/**
 * Compétence qui décide d'une battue.
 *
 * **Nature**, pas Survie : lire une empreinte, reconnaître une coulée, savoir
 * quel buisson porte des baies comestibles — c'est du savoir sur le vivant. La
 * Survie dit qu'on tient le coup dehors ; la Nature dit qu'on sait où chercher.
 */
export const HUNT_SKILL = 'nature';

/**
 * Résultat d'un jet de chasse.
 *
 * `total` est le d100 **bonus compris** ; les bornes se lisent en cumulant la
 * table dans l'ordre — 1-25 bredouille, 26-80 petit gibier, 81-100 gibier
 * médian. Un bon chasseur pousse donc son résultat vers le haut de la table :
 * son bonus de Nature retire d'autant de chances de rentrer bredouille.
 */
export function huntOutcome(total: number): HuntOutcome {
  let seuil = 0;
  for (const outcome of HUNT_TABLE) {
    seuil += outcome.chance;
    if (total <= seuil) return outcome;
  }
  return HUNT_TABLE[HUNT_TABLE.length - 1];
}

/** Bonus de Nature d'un chasseur, ou 0 pour qui n'en tient pas (une créature). */
export const huntBonus = (skills: Record<string, number> | undefined): number =>
  Math.round(skills?.[HUNT_SKILL] ?? 0);
