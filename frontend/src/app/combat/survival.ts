import { AttributeKey, CharacterSheet, SurvivalKey } from '../character/character.types';
import {
  clampSurvival,
  hungerPerSegment,
  LEGACY_SURVIVAL_SEGMENTS,
  MANA_NEED,
  manaEffect,
  manaTier,
  needEffect,
  NeedEffect,
  noSurvivalLoss,
  REST_PER_PHASE,
  SEGMENTS_PER_DAY,
  sheetSurvivalLoss,
  SURVIVAL_GAUGES,
  survivalGauge,
  survivalMaxima,
  survivalPoints,
  survivalStage,
  survivalTier,
  SurvivalTier,
} from '../character/universe-data';
import { DAY, DAYTIME_SCHEDULE, EncounterClock, HOUR } from './clock';

/* ──────────────────────────────────────────────────────────────────────────
   FAIM, SOIF, FATIGUE — et leur lien avec la mana

   Cf. `mystaria_gameplay_survie.md`, sections 2 et 18. Trois jauges
   corporelles, séparées de la Réserve de mana mais qui COMMUNIQUENT avec elle :

   - la **taille** de chaque réservoir dépend de la Constitution (Faim
     48 + CON×6, Soif 16 + CON×2, Repos 15 pour tous) ;
   - Faim et Soif perdent **1 point par segment** (quatre segments par jour),
     la Faim un peu plus pour les très costauds (FOR) ;
   - la Fatigue est une **dette** : une journée normale ne coûte rien, seules
     les phases passées éveillées après une nuit sautée ou écourtée coûtent
     3 points chacune, et le sommeil rembourse au prorata du temps dormi ;
   - la **réciprocité** : un Manque de mana sévère fait s'user Faim et Soif
     deux fois plus vite le reste de la journée, et la Soif gêne l'incantation.

   L'état est stocké en **points manquants**, flottants : l'usure court en
   continu, par tranches aussi fines qu'on veut, sans jamais perdre un reste
   dans un arrondi. Les points annoncés en sont déduits (cf. `survivalPoints`).
─────────────────────────────────────────────────────────────────────────── */

/** Durée d'un segment de journée : l'unité d'usure de la Faim et de la Soif. */
export const SEGMENT_SECONDS = DAY / SEGMENTS_PER_DAY;

/** Ce qui peut faire perdre connaissance : une jauge vide, ou la Réserve vidée. */
export type NeedKey = SurvivalKey | 'mana';

/** Faim, soif, fatigue d'un combattant tiré d'une fiche. */
export interface SurvivalState {
  /** Points manquants par jauge (0 = plein). */
  loss: Record<SurvivalKey, number>;
  /**
   * Jour de campagne pendant lequel un Manque de mana sévère double l'usure
   * de la Faim et de la Soif.
   */
  strainDay?: number;
  /**
   * Jauges à zéro qu'une sauvegarde de Vigueur réussie tient encore : jusqu'à
   * quel instant (secondes absolues) on reste conscient avant de devoir
   * rejouer. Un segment par réussite.
   */
  holds?: Partial<Record<SurvivalKey, number>>;
  /** Perte de connaissance en cours : pourquoi, et quand on se réveille. */
  out?: {
    cause: NeedKey;
    /** Instant du réveil, en secondes depuis le début de la campagne. */
    until: number;
    /** Endormissement (Fatigue) : le sommeil forcé rembourse la dette. */
    sleep: boolean;
  };
}

/** Ce que les attributs d'un personnage font à ses jauges. */
export interface SurvivalProfile {
  max: Record<SurvivalKey, number>;
  /** Points de Faim perdus par segment (1, plus pour les FOR élevées). */
  hungerRate: number;
  /** Modificateur de Constitution : sévérité des paliers et durée des pertes de connaissance. */
  con: number;
}

export const profileOf = (attributes: Record<AttributeKey, number>): SurvivalProfile => ({
  max: survivalMaxima(attributes),
  hungerRate: hungerPerSegment(attributes),
  con: Math.floor((attributes.constitution - 10) / 2),
});

/** Jauges pleines : un personnage qui vient de manger, boire et dormir. */
export const freshSurvival = (): SurvivalState => ({ loss: noSurvivalLoss() });

/** La jauge portant cette clé (les trois sont toujours définies). */
export const gaugeOf = survivalGauge;

/** Points restants d'une jauge, tels qu'on les annonce. */
export const pointsLeft = (
  key: SurvivalKey,
  state: SurvivalState | undefined,
  profile: SurvivalProfile,
): number => survivalPoints(profile.max[key], state?.loss[key]);

/** Palier atteint par une jauge. */
export const tierOf = (
  key: SurvivalKey,
  state: SurvivalState | undefined,
  profile: SurvivalProfile,
): SurvivalTier => survivalTier(key, pointsLeft(key, state, profile), profile.max[key]);

/** Verdict affiché d'une jauge (« Le ventre creux », « Déshydraté »). */
export const stageOf = (
  key: SurvivalKey,
  state: SurvivalState | undefined,
  profile: SurvivalProfile,
): string => survivalStage(key, pointsLeft(key, state, profile), profile.max[key]);

/** Reconstruit l'état d'une fiche (anciennes fiches à crans comprises). */
export const survivalFromSheet = (
  sheet: Pick<CharacterSheet, 'survival' | 'survivalLoss'>,
  attributes: Record<AttributeKey, number>,
): SurvivalState => ({ loss: sheetSurvivalLoss(sheet, attributes) });

/**
 * Creux à écrire sur la fiche. On garde la partie ENTIÈRE : c'est exactement
 * ce qui conserve les points annoncés (`max − ⌊perte⌋ = ⌈max − perte⌉`).
 */
export function survivalToLoss(
  state: SurvivalState | undefined,
  profile: SurvivalProfile,
): Record<SurvivalKey, number> {
  return Object.fromEntries(
    SURVIVAL_GAUGES.map((g) => [
      g.key,
      Math.floor(clampSurvival(profile.max[g.key], state?.loss[g.key]) + 1e-9),
    ]),
  ) as Record<SurvivalKey, number>;
}

/** Temps écoulé avant la refonte : secondes par cran, pour relire une vieille partie. */
const LEGACY_NOTCH_SECONDS: Record<SurvivalKey, number> = {
  hunger: 8 * HOUR,
  rest: 4 * HOUR,
  thirst: 4 * HOUR,
};

/**
 * Remet dans la forme courante l'état d'une partie sauvegardée avant la
 * refonte (secondes écoulées par jauge) : on en garde la proportion restante.
 */
export function migrateSurvival(
  raw: unknown,
  attributes: Record<AttributeKey, number>,
): SurvivalState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  if ('loss' in raw) return raw as SurvivalState;
  const old = raw as Partial<Record<SurvivalKey, number>>;
  const max = survivalMaxima(attributes);
  const state = freshSurvival();
  for (const gauge of SURVIVAL_GAUGES) {
    const segments = LEGACY_SURVIVAL_SEGMENTS[gauge.key];
    const lost = Math.floor(Math.max(0, Number(old[gauge.key]) || 0) / LEGACY_NOTCH_SECONDS[gauge.key]);
    const left = Math.max(0, segments - lost) / segments;
    state.loss[gauge.key] = Math.round(max[gauge.key] * (1 - left));
  }
  return state;
}

/* ── Le temps qui use ──────────────────────────────────────────────────────── */

/**
 * Ce que le groupe est en train de faire, et ce que ça coûte à la Faim et à la
 * Soif (multiplicateur du tick de base, −1/segment). La Fatigue, elle, ne
 * regarde qu'une chose : dort-on ou non.
 */
export interface Activity {
  key: string;
  label: string;
  description: string;
  factors: { hunger: number; thirst: number };
  /** Dormir rembourse la dette de sommeil au lieu de la creuser. */
  sleeps?: boolean;
  /**
   * Souffler sans dormir : l'Endurance revient, les plaies se referment un peu.
   * Le sommeil fait tout cela ET rend la mana (cf. `restRecovery`).
   */
  rests?: boolean;
}

export const ACTIVITIES: Activity[] = [
  {
    key: 'route',
    label: 'Marche',
    description: "Le pas du voyage : on avance, on porte son sac, on ne s'épuise pas.",
    factors: { hunger: 1, thirst: 1 },
  },
  {
    key: 'effort',
    label: 'Effort soutenu',
    description: 'Course, escalade, portage, fuite. La gorge sèche avant les jambes.',
    factors: { hunger: 1.5, thirst: 2 },
  },
  {
    key: 'repos',
    label: 'Repos au camp',
    description: 'Assis près du feu sans dormir : on souffle, l’Endurance revient, les plaies se referment et la mana remonte un peu, mais la fatigue ne se rattrape qu’en dormant.',
    factors: { hunger: 1, thirst: 1 },
    rests: true,
  },
  {
    key: 'veille',
    label: 'Veille',
    description: 'Le tour de garde : éveillé pendant que les autres dorment. Une nuit passée debout creuse la dette de sommeil.',
    factors: { hunger: 1, thirst: 1 },
  },
  {
    key: 'sommeil',
    label: 'Sommeil',
    description: 'Une nuit pleine (10 h) remet la fatigue et la mana à neuf, une nuit écourtée au prorata ; elle rend aussi l’Endurance et referme les plaies jusqu’à mi-santé. La faim et la soif, elles, courent toujours.',
    factors: { hunger: 1, thirst: 1 },
    sleeps: true,
  },
  {
    key: 'combat',
    label: 'Combat',
    description: "Appliqué tout seul, six secondes par round : un combat ne creuse pas l'estomac, mais il assèche.",
    factors: { hunger: 2, thirst: 3 },
  },
];

export const activityByKey = (key: string): Activity | undefined =>
  ACTIVITIES.find((a) => a.key === key);

/** L'activité par défaut hors combat, et celle appliquée pendant les rounds. */
export const DEFAULT_ACTIVITY = 'route';
export const COMBAT_ACTIVITY = 'combat';

/** Usure d'un corps sans connaissance : il ne fait rien, mais il a toujours faim. */
const OUT_FACTORS = { hunger: 1, thirst: 1 };

/** Instant absolu d'une horloge, en secondes depuis le début de la campagne. */
export const absoluteSeconds = (clock: EncounterClock): number =>
  (clock.day - 1) * DAY + clock.seconds;

/** Durée totale de chaque phase de la journée (la nuit enjambe minuit : 8 h). */
const PHASE_SECONDS: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  DAYTIME_SCHEDULE.forEach((slot, i) => {
    const end = DAYTIME_SCHEDULE[i + 1]?.from ?? DAY;
    out[slot.key] = (out[slot.key] ?? 0) + (end - slot.from);
  });
  return out;
})();

/** Une nuit complète : ce qu'il faut dormir pour rembourser toute la jauge. */
export const NIGHT_SECONDS = PHASE_SECONDS['nuit'];

/** Phase de la journée et fin de sa tranche, pour une heure donnée. */
function phaseAt(timeOfDay: number): { key: string; end: number } {
  let index = 0;
  DAYTIME_SCHEDULE.forEach((slot, i) => {
    if (timeOfDay >= slot.from) index = i;
  });
  return {
    key: DAYTIME_SCHEDULE[index].key,
    end: DAYTIME_SCHEDULE[index + 1]?.from ?? DAY,
  };
}

/** Ce qui arrive en chemin : une perte de connaissance, un réveil. */
/**
 * Ce que donne une sauvegarde de Vigueur face au palier critique (cf. section
 * 13, jets de sauvegarde) : on tombe, on tombe moins longtemps (résistance
 * partielle, effet à moitié), ou l'on tient debout un segment de plus.
 */
export type VigorOutcome = 'tombe' | 'demi' | 'tient';

/**
 * Le jet lui-même, fourni par le moteur : il a le dé de la rencontre et le
 * journal. Absent, personne ne résiste — la chute est automatique.
 */
export type VigorRoll = (cause: NeedKey, at: number) => VigorOutcome;

/** Durée d'une perte de connaissance après une résistance partielle : la moitié, au moins un segment. */
export const halfKnockout = (segments: number): number => Math.max(1, Math.ceil(segments / 2));

export interface SurvivalEvent {
  kind: 'knockout' | 'wake';
  cause: NeedKey;
  /** Instant absolu de l'événement. */
  at: number;
  sleep: boolean;
  /** Durée annoncée d'une perte de connaissance, en segments. */
  segments?: number;
}

/**
 * Fait courir le temps sur les trois jauges.
 *
 * La durée est découpée aux changements de phase (la Fatigue se compte par
 * phase), à minuit (le doublement du Manque vaut « ce jour-là »), au réveil,
 * et au plus par heure — assez fin pour situer une perte de connaissance.
 *
 * Rend un NOUVEL état et les événements rencontrés, sans rien muter : le
 * moteur clone la rencontre avant chaque action, et la fonction reste
 * testable seule.
 */
export function advanceSurvival(
  state: SurvivalState,
  profile: SurvivalProfile,
  from: EncounterClock,
  seconds: number,
  activity: Activity,
  vigor?: VigorRoll,
): { state: SurvivalState; events: SurvivalEvent[] } {
  const next: SurvivalState = {
    ...state,
    loss: { ...state.loss },
    holds: state.holds ? { ...state.holds } : undefined,
    out: state.out ? { ...state.out } : undefined,
  };
  const events: SurvivalEvent[] = [];
  let t = absoluteSeconds(from);
  const end = t + Math.max(0, seconds);

  while (t < end - 1e-9) {
    const timeOfDay = ((t % DAY) + DAY) % DAY;
    const day = Math.floor(t / DAY) + 1;
    const phase = phaseAt(timeOfDay);

    const factors = next.out ? OUT_FACTORS : activity.factors;
    const strain = next.strainDay === day ? 2 : 1;
    const asleep = !!activity.sleeps || !!next.out;
    // Usure par seconde. Sans connaissance, le corps ne veille pas : il
    // rembourse la dette de sommeil comme en dormant. Éveillé, rester debout
    // la nuit ouvre la dette ; une fois ouverte, chaque phase éveillée la
    // creuse de 3 points jusqu'à la prochaine vraie nuit.
    const rates: Record<SurvivalKey, number> = {
      hunger: (profile.hungerRate * factors.hunger * strain) / SEGMENT_SECONDS,
      thirst: (factors.thirst * strain) / SEGMENT_SECONDS,
      rest: asleep
        ? -profile.max.rest / NIGHT_SECONDS
        : phase.key === 'nuit' || next.loss.rest > 1e-9
          ? REST_PER_PHASE / PHASE_SECONDS[phase.key]
          : 0,
    };

    let stop = Math.min(end, t - timeOfDay + phase.end, t + HOUR);
    if (next.out && next.out.until > t) stop = Math.min(stop, next.out.until);
    for (const g of SURVIVAL_GAUGES) {
      // On coupe la tranche à l'instant exact où une jauge touche zéro, et à
      // l'échéance d'une sauvegarde réussie : c'est là que le corps décide.
      const reste = profile.max[g.key] - next.loss[g.key];
      // Arrondi à la seconde SUPÉRIEURE : l'horloge ne compte qu'en secondes
      // entières, et la jauge doit bien être vide à l'arrêt.
      if (rates[g.key] > 0 && reste > 1e-9) stop = Math.min(stop, Math.max(t + 1, Math.ceil(t + reste / rates[g.key] - 1e-6)));
      const hold = next.holds?.[g.key];
      if (hold !== undefined && hold > t + 1e-9) stop = Math.min(stop, hold);
    }
    const dt = stop - t;

    const before = SURVIVAL_GAUGES.map((g) => pointsLeft(g.key, next, profile));
    for (const g of SURVIVAL_GAUGES) next.loss[g.key] += rates[g.key] * dt;
    for (const g of SURVIVAL_GAUGES) {
      next.loss[g.key] = clampSurvival(profile.max[g.key], next.loss[g.key]);
    }

    t = stop;

    if (next.out && t >= next.out.until - 1e-9) {
      events.push({ kind: 'wake', cause: next.out.cause, at: t, sleep: next.out.sleep });
      // On se réveille à vide : un segment de répit avant que le corps ne
      // réclame à nouveau, sans quoi on retomberait à la seconde même.
      if (next.out.cause !== 'mana') {
        next.holds = { ...next.holds, [next.out.cause]: t + SEGMENT_SECONDS };
      }
      next.out = undefined;
    }

    // Une jauge qui TOMBE à zéro fait perdre connaissance — sauf sauvegarde
    // de Vigueur. Tant qu'elle reste à zéro, le corps rejoue sa chance à
    // chaque segment : on peut tenir, pas indéfiniment.
    if (!next.out) {
      SURVIVAL_GAUGES.forEach((g, i) => {
        if (next.out) return;
        if (pointsLeft(g.key, next, profile) > 0) {
          if (next.holds?.[g.key] !== undefined) delete next.holds[g.key];
          return;
        }
        const hold = next.holds?.[g.key];
        const due = before[i] > 0 || hold === undefined || t >= hold - 1e-9;
        if (!due) return;

        const outcome = vigor ? vigor(g.key, t) : 'tombe';
        if (outcome === 'tient') {
          next.holds = { ...next.holds, [g.key]: t + SEGMENT_SECONDS };
          return;
        }
        const knockout = needEffect(g.key, 'critique', profile.con).knockout!;
        const segments = outcome === 'demi' ? halfKnockout(knockout.segments) : knockout.segments;
        if (next.holds) delete next.holds[g.key];
        next.out = { cause: g.key, until: t + segments * SEGMENT_SECONDS, sleep: knockout.sleep };
        events.push({ kind: 'knockout', cause: g.key, at: t, sleep: knockout.sleep, segments });
      });
    }
  }

  return { state: next, events };
}

/** Raccourci de `advanceSurvival` quand seuls les points comptent. */
export const drain = (
  state: SurvivalState,
  profile: SurvivalProfile,
  from: EncounterClock,
  seconds: number,
  activity: Activity,
): SurvivalState => advanceSurvival(state, profile, from, seconds, activity).state;

/** Comble une jauge de `points` (tout, si absent) : manger, boire, dormir d'un bloc. */
export function restore(state: SurvivalState, key: SurvivalKey, points?: number): SurvivalState {
  const gained = points === undefined ? Infinity : Math.max(0, points);
  return { ...state, loss: { ...state.loss, [key]: Math.max(0, state.loss[key] - gained) } };
}

/** Corrige une jauge à un nombre de points restants (le MJ). */
export const withPoints = (
  state: SurvivalState,
  key: SurvivalKey,
  points: number,
  profile: SurvivalProfile,
): SurvivalState => ({
  ...state,
  loss: {
    ...state.loss,
    [key]: profile.max[key] - clampSurvival(profile.max[key], Math.round(points)),
  },
});

/* ── Ce que le manque coûte ────────────────────────────────────────────────
   Chaque palier se paie en CRANS de dé et en Endurance maximum (cf.
   `needEffect`). Un seul palier par jauge — le plus sévère atteint — mais les
   jauges se cumulent entre elles : l'affamé qui a veillé perd sur les deux.
─────────────────────────────────────────────────────────────────────────── */

/** Un besoin qui pèse, avec son palier et ce qu'il coûte. */
export interface NeedStatus {
  key: NeedKey;
  label: string;
  tier: SurvivalTier;
  stage: string;
  effect: NeedEffect;
}

/**
 * Ce que chaque besoin coûte en ce moment. `mana` est la Réserve courante et
 * son maximum ; absente (ou maximum nul), le Manque de mana ne compte pas.
 */
export function needStatuses(
  state: SurvivalState | undefined,
  profile: SurvivalProfile,
  mana?: { current: number; max: number },
): NeedStatus[] {
  if (!state) return [];
  const out: NeedStatus[] = SURVIVAL_GAUGES.map((g) => {
    const tier = tierOf(g.key, state, profile);
    return {
      key: g.key,
      label: g.label,
      tier,
      stage: g.stages[tier],
      effect: needEffect(g.key, tier, profile.con),
    };
  });
  const tier = mana ? manaTier(mana.current, mana.max) : undefined;
  if (tier) {
    out.push({
      key: 'mana',
      label: MANA_NEED.label,
      tier,
      stage: MANA_NEED.stages[tier],
      effect: manaEffect(tier, profile.con),
    });
  }
  return out;
}

/**
 * Somme des coûts : les crans s'additionnent, les parts d'Endurance aussi
 * (plafonnées à 90 % — il reste toujours un souffle).
 */
export function totalNeedEffect(statuses: NeedStatus[]): NeedEffect {
  const total: NeedEffect = { physicalSteps: 0, castingSteps: 0, enduranceShare: 0 };
  for (const { effect } of statuses) {
    total.physicalSteps += effect.physicalSteps;
    total.castingSteps += effect.castingSteps;
    total.enduranceShare += effect.enduranceShare;
    if (effect.strain) total.strain = true;
  }
  total.enduranceShare = Math.min(0.9, total.enduranceShare);
  return total;
}

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
  /** Points rendus à la jauge (4 points = une journée). */
  points: number;
  /**
   * Ce que la ligne devient à l'usage, quand elle ne disparaît pas.
   *
   * Une outre n'est pas mangée : elle se vide. La faire disparaître du sac
   * ferait perdre le récipient à qui boit, et la garder pleine donnerait de
   * l'eau à l'infini. Elle devient donc une **outre vide**, qui se voit dans
   * le sac et se remplit à la prochaine source.
   */
  becomes?: string;
  /**
   * Usages par exemplaire. Un lot de rations de voyage n'est pas UN repas :
   * c'est sept jours emballés un par un. En manger un entame le lot, et le lot
   * ne quitte le sac qu'une fois la septième journée mangée (cf. `charges.ts`).
   */
  uses?: number;
  note?: string;
}

/**
 * Les vivres, dans l'ordre de ce qu'ils rendent.
 *
 * **Le barème suit les fiches du wiki**, pas l'inverse : « une ration par jour »
 * y est écrit noir sur blanc, et une journée vaut quatre segments, donc quatre
 * points de Faim. Une ration de voyage rend donc UNE journée — quatre points —
 * et non la jauge entière.
 *
 * De là découlent les deux autres tailles : la petite ration est la demi-
 * journée qu'on tire d'un collet ou d'un buisson, la grande est les deux jours
 * qu'on tire d'un cuissot. C'est ce qui donne un sens à la chasse — elle rapporte
 * des VIVRES, dont la taille dit si le groupe a bien ou mal chassé, au lieu de
 * remplir la jauge d'un coup de baguette. L'outre, elle, vaut une journée d'eau.
 */
export const NOURISHMENTS: Nourishment[] = [
  {
    slug: 'petite-ration',
    name: 'Petite ration',
    gauge: 'hunger',
    points: 2,
  },
  {
    slug: 'rations-de-voyage',
    name: 'Rations de voyage',
    gauge: 'hunger',
    points: 4,
    uses: 7,
  },
  {
    slug: 'grande-ration',
    name: 'Grande ration',
    gauge: 'hunger',
    points: 8,
  },
  {
    slug: 'outre-en-peau',
    name: 'Outre en peau',
    gauge: 'thirst',
    points: 4,
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
  /**
   * Part d'un exemplaire rapportée, pour les vivres qui se comptent par lot. Un
   * chevreuil nourrit UNE journée : il ne vaut pas le lot de sept jours entier
   * qu'est une « Rations de voyage » achetée à l'étape.
   */
  uses?: number;
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
    uses: 1,
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

/* ── Sortir du camp : la battue et la cueillette ───────────────────────────
   Ni l'une ni l'autre ne sont instantanées : on part, on cherche, on revient.
   Le temps passe donc TOUJOURS, bredouille ou non — et il passe pour tout le
   groupe, qui attend au camp pendant que le chasseur court les bois. Et l'on
   revient dans tous les cas : ni la battue ni la cueillette ne perdent
   personne en forêt.
─────────────────────────────────────────────────────────────────────────── */

/** Une battue prend une demi-journée de marche et d'affût. */
export const HUNT_SECONDS = 3 * HOUR;
/** La cueillette se fait au pas, à portée du camp. */
export const FORAGE_SECONDS = 2 * HOUR;

/** Ce que fait celui qui sort, pour ses jauges : la battue court, la cueillette marche. */
export const HUNT_ACTIVITY = 'effort';
export const FORAGE_ACTIVITY = 'route';
/** Ce que fait le groupe resté au camp pendant ce temps. */
export const WAITING_ACTIVITY = 'repos';

/**
 * Une issue de cueillette. Elle rapporte un vivre, ou une ressource de la flore
 * (une herbe pour l'alchimie), ou rien.
 */
export interface ForageOutcome {
  key: string;
  label: string;
  chance: number;
  nourishment?: Nourishment;
  /** Ressource du wiki (`natural-resources/flora`), rangée au sac sous ce nom. */
  resource?: string;
  flavour: string;
}

/**
 * Table de cueillette, du plus mauvais au meilleur.
 *
 * Moins souvent bredouille que la chasse (on ne court pas après une racine),
 * mais elle nourrit PEU : une petite ration au mieux. Ce qui fait son intérêt,
 * c'est le haut de la table — les herbes, puis les ingrédients de la forêt
 * primaire, que seul un bon connaisseur de la Nature atteint souvent.
 */
export const FORAGE_TABLE: ForageOutcome[] = [
  {
    key: 'bredouille',
    label: 'Bredouille',
    chance: 20,
    flavour: 'Des baies amères, des champignons douteux : rien qui vaille d’être rapporté.',
  },
  {
    key: 'baies',
    label: 'Baies et racines',
    chance: 35,
    nourishment: NOURISHMENTS[0],
    flavour: 'Une poignée de baies, quelques racines comestibles : de quoi tenir une demi-journée.',
  },
  {
    key: 'herbes',
    label: 'Herbes médicinales',
    chance: 25,
    resource: 'Herbes médicinales',
    flavour: 'Une botte d’herbes en lisière, bonne pour les cataplasmes.',
  },
  {
    key: 'ginseng',
    label: 'Racine de ginseng',
    chance: 10,
    resource: 'Racine de ginseng',
    flavour: 'Une racine de ginseng sous les feuilles d’un sous-bois frais.',
  },
  {
    key: 'fruit',
    label: 'Fruit de mana',
    chance: 7,
    resource: 'Fruit de mana',
    flavour: 'Un fruit qui luit faiblement, là où la mana affleure.',
  },
  {
    key: 'racine',
    label: 'Racine d’arbre ancien',
    chance: 3,
    // L'apostrophe droite du wiki : c'est par ce nom que le report retrouve le poids.
    resource: "Racine d'arbre ancien",
    flavour: 'Une racine d’arbre ancien, dégagée au pied d’un géant de la forêt primaire.',
  },
];

/** Somme des chances de la table — 100, comme la chasse. */
export const FORAGE_TOTAL = FORAGE_TABLE.reduce((sum, o) => sum + o.chance, 0);

/** Résultat d'un jet de cueillette, bonus de Nature compris (cf. `huntOutcome`). */
export function forageOutcome(total: number): ForageOutcome {
  let seuil = 0;
  for (const outcome of FORAGE_TABLE) {
    seuil += outcome.chance;
    if (total <= seuil) return outcome;
  }
  return FORAGE_TABLE[FORAGE_TABLE.length - 1];
}

/* ── Se refaire au camp ────────────────────────────────────────────────────
   Le repos et le sommeil rendent ce que le combat a pris — mais pas tout, et
   pas au même rythme :

   - l'**Endurance** revient vite : une heure au calme la remet à plein ;
   - les **PV** se referment lentement, et JAMAIS au-delà de la moitié du
     maximum. Le reste demande des soins, une potion, un sort : dormir panse,
     il ne guérit pas ;
   - la **mana** revient surtout en dormant, au prorata du temps dormi — une
     nuit pleine remplit la Réserve, un quart de garde en rend le quart. Le
     simple repos n'en rend qu'un filet.
─────────────────────────────────────────────────────────────────────────── */

/** Une heure de calme remet l'Endurance à plein. */
export const ENDURANCE_REST_SECONDS = HOUR;
/** Part des PV max refermée par heure : au repos, puis en dormant. */
export const HP_REST_PER_HOUR = 0.05;
export const HP_SLEEP_PER_HOUR = 0.1;
/** Part de la mana max rendue par heure de repos éveillé. */
export const MANA_REST_PER_HOUR = 0.05;
/** Le repos ne referme les plaies que jusqu'à cette part des PV max. */
export const HP_REST_CAP = 0.5;

/** Les réserves d'un corps : où il en est, et jusqu'où elles montent. */
export interface Reserves {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  endurance: number;
  maxEndurance: number;
}

/**
 * Ce qu'une tranche de repos ou de sommeil rend. Rien pour une activité qui
 * ne repose pas (la marche, la veille). Ne diminue jamais une réserve : un
 * personnage déjà au-dessus de la mi-santé garde ses PV tels quels.
 */
export function restRecovery(activity: Activity, seconds: number, r: Reserves): Reserves {
  if (!(activity.rests || activity.sleeps) || seconds <= 0) return r;
  const heures = seconds / HOUR;

  const endurance = Math.min(r.maxEndurance, r.endurance + Math.round((r.maxEndurance * seconds) / ENDURANCE_REST_SECONDS));

  const plafond = Math.floor(r.maxHp * HP_REST_CAP);
  const taux = activity.sleeps ? HP_SLEEP_PER_HOUR : HP_REST_PER_HOUR;
  const hp = r.hp >= plafond ? r.hp : Math.min(plafond, r.hp + Math.round(r.maxHp * taux * heures));

  const manaGain = activity.sleeps
    ? (r.maxMana * seconds) / NIGHT_SECONDS
    : r.maxMana * MANA_REST_PER_HOUR * heures;
  const mana = r.mana >= r.maxMana ? r.mana : Math.min(r.maxMana, r.mana + Math.round(manaGain));

  return { ...r, hp, mana, endurance };
}

/* ── Le piège à mâchoires en forêt ─────────────────────────────────────────
   « On le pose sur une coulée, on le recouvre de feuilles, on ancre la chaîne
   à un tronc — et l'on revient le lendemain voir ce que la nuit a donné. »
   Poser et aller voir sont deux sorties du camp, et toutes deux prennent du
   temps. Trop tôt, il n'y a rien ; à temps, on jette le d100 — la Nature du
   trappeur aide comme à la chasse — et le piège reste armé pour la suite.
─────────────────────────────────────────────────────────────────────────── */

/** L'objet qui se pose en forêt. */
export const SNARE_ITEM = 'Piège à mâchoires';
/** Le poser : trouver une coulée, bander le ressort, ancrer la chaîne. */
export const SNARE_SET_SECONDS = HOUR / 2;
/** Aller voir, et revenir. */
export const SNARE_CHECK_SECONDS = HOUR;
/** Le temps qu'une bête passe par là : avant, il n'y a rien à voir. */
export const SNARE_WAIT_SECONDS = 6 * HOUR;

/** Table du piège, du plus mauvais au meilleur. */
export const SNARE_TABLE: HuntOutcome[] = [
  {
    key: 'vide',
    label: 'Piège vide',
    chance: 40,
    flavour: 'Les feuilles ont bougé, la palette n’a pas été touchée. Rien cette fois.',
  },
  {
    key: 'petit',
    label: 'Petite bête',
    chance: 40,
    nourishment: NOURISHMENTS[0],
    flavour: 'Un lièvre, un renard maigre : de quoi tenir une demi-journée.',
  },
  {
    key: 'median',
    label: 'Belle prise',
    chance: 20,
    nourishment: NOURISHMENTS[1],
    uses: 1,
    flavour: 'Un marcassin pris par la patte : la journée est assurée.',
  },
];

export const SNARE_TOTAL = SNARE_TABLE.reduce((sum, o) => sum + o.chance, 0);

/** Résultat d'un piège relevé à temps, bonus de Nature compris. */
export function snareOutcome(total: number): HuntOutcome {
  let seuil = 0;
  for (const outcome of SNARE_TABLE) {
    seuil += outcome.chance;
    if (total <= seuil) return outcome;
  }
  return SNARE_TABLE[SNARE_TABLE.length - 1];
}
