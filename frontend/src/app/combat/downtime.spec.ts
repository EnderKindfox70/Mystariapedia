import { describe, expect, it } from 'vitest';
import { AttributeKey, CharacterSheet, StatKey, SurvivalKey } from '../character/character.types';
import {
  emptySheet,
  hungerPerSegment,
  knockoutSegments,
  manaEffect,
  manaTier,
  needEffect,
  noSurvivalLoss,
  sheetSurvivalLoss,
  survivalMaxima,
} from '../character/universe-data';
import {
  advanceClock,
  DAY,
  daytimeAt,
  formatClock,
  formatDuration,
  HOUR,
  MINUTE,
  ROUND_SECONDS,
  startingClock,
  startOfDaytime,
} from './clock';
import { Affinities, CombatAbility, Combatant, Encounter, Team } from './combat.types';
import { Rng } from './dice';
import { emptyEncounter, migrateEncounter } from './encounter';
import { carriedAsLoot, pileSize, rollDrops } from './loot';
import {
  applyAction,
  carriedQty,
  clockOf,
  effectiveStat,
  needSteps,
  phaseOf,
  precisionOf,
  terrainFor,
  vigorThreshold,
} from './rules';
import { blocksMovement, blocksSight, DoorState, moveCostOf, newDoor } from './terrain';
import { applyReport, diffAgainstSheet, summarize } from './sheet-report';
import {
  absoluteSeconds,
  activityByKey,
  advanceSurvival,
  drain,
  halfKnockout,
  NIGHT_SECONDS,
  EMPTY_WATERSKIN,
  freshSurvival,
  FORAGE_SECONDS,
  FORAGE_TOTAL,
  forageOutcome,
  HUNT_SECONDS,
  SNARE_CHECK_SECONDS,
  SNARE_SET_SECONDS,
  SNARE_TOTAL,
  SNARE_WAIT_SECONDS,
  snareOutcome,
  HUNT_TOTAL,
  huntBonus,
  huntOutcome,
  migrateSurvival,
  nourishmentOf,
  pointsLeft,
  profileOf,
  restore,
  restRecovery,
  SEGMENT_SECONDS,
  SurvivalState,
  survivalToLoss,
  WATERSKIN,
} from './survival';

/* ── Fabriques de test ─────────────────────────────────────────────────────── */

const STATS = (over: Partial<Record<StatKey, number>> = {}): Record<StatKey, number> => ({
  hp: 40,
  mana: 20,
  endurance: 20,
  speed: 10,
  atk_phy: 20,
  atk_mag: 20,
  def_phy: 10,
  def_mag: 10,
  ...over,
});

const ATTRS = (): Record<AttributeKey, number> => ({
  force: 10,
  dexterite: 10,
  constitution: 10,
  intelligence: 10,
  sagesse: 10,
  charisme: 10,
});

const NO_AFFINITY = (): Affinities => ({
  immunities: [],
  resistances: [],
  weaknesses: [],
  absorptions: [],
});

function mkUnit(over: Partial<Combatant> & { id: string; name: string; team: Team }): Combatant {
  const base = over.base ?? STATS();
  return {
    origin: { kind: 'custom' },
    footprint: 1,
    pos: { x: 0, y: 0 },
    attributes: ATTRS(),
    proficiency: 2,
    hp: base.hp,
    mana: base.mana,
    endurance: base.endurance,
    moved: 0,
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    statuses: [],
    effects: [],
    abilities: [],
    inventory: [],
    affinities: NO_AFFINITY(),
    initiative: 0,
    down: false,
    ...over,
    base,
  };
}

/** Une table hors combat : un vivant qui tient ses jauges, un corps à fouiller. */
function camp(over: Partial<Combatant> = {}, corpse: Partial<Combatant> = {}): Encounter {
  const enc = emptyEncounter('Camp');
  enc.seed = 42;
  enc.phase = 'exploration';
  enc.combatants = [
    mkUnit({
      id: 'pc',
      name: 'Kael',
      team: 'allies',
      survival: freshSurvival(),
      purse: 10,
      ...over,
    }),
    mkUnit({
      id: 'wolf',
      name: 'Loup',
      team: 'ennemis',
      pos: { x: 1, y: 0 },
      down: true,
      hp: 0,
      ...corpse,
    }),
  ];
  return enc;
}

/* ── L'horloge ─────────────────────────────────────────────────────────────── */

describe('horloge', () => {
  it('démarre au premier jour, à huit heures', () => {
    expect(formatClock(startingClock())).toBe('Jour 1 — 8h00');
  });

  it('compte des journées de vingt-six heures', () => {
    expect(DAY).toBe(26 * HOUR);
    expect(formatClock({ day: 2, seconds: 25 * HOUR + 30 * MINUTE })).toBe('Jour 2 — 25h30');
  });

  it('enjambe minuit en changeant de jour', () => {
    const soir = { day: 3, seconds: 25 * HOUR };
    expect(advanceClock(soir, 2 * HOUR)).toEqual({ day: 4, seconds: HOUR });
    // 23 h n'est pas encore minuit : il reste trois heures au jour.
    expect(advanceClock({ day: 3, seconds: 23 * HOUR }, 2 * HOUR)).toEqual({ day: 3, seconds: 25 * HOUR });
  });

  it('enjambe plusieurs jours d’un coup', () => {
    expect(advanceClock({ day: 1, seconds: 0 }, 3 * DAY + HOUR)).toEqual({ day: 4, seconds: HOUR });
  });

  it('ne recule jamais avant le premier jour', () => {
    expect(advanceClock({ day: 1, seconds: HOUR }, -5 * DAY).day).toBe(1);
  });

  it('déduit le moment de la journée de l’heure', () => {
    expect(daytimeAt({ day: 1, seconds: 3 * HOUR })).toBe('nuit');
    expect(daytimeAt({ day: 1, seconds: 6 * HOUR })).toBe('aube');
    expect(daytimeAt({ day: 1, seconds: 9 * HOUR })).toBe('matinee');
    expect(daytimeAt({ day: 1, seconds: 12 * HOUR })).toBe('midi');
    expect(daytimeAt({ day: 1, seconds: 16 * HOUR })).toBe('apres-midi');
    expect(daytimeAt({ day: 1, seconds: 19 * HOUR })).toBe('soiree');
    expect(daytimeAt({ day: 1, seconds: 22 * HOUR })).toBe('nuit');
    // Les deux heures de plus vont à la nuit.
    expect(daytimeAt({ day: 1, seconds: 25 * HOUR })).toBe('nuit');
  });

  it('allonge la nuit à dix heures, sans toucher aux phases éveillées', () => {
    expect(NIGHT_SECONDS).toBe(10 * HOUR);
    expect(SEGMENT_SECONDS).toBe(6.5 * HOUR);
  });

  it('couvre la journée entière, sans trou ni chevauchement', () => {
    for (let h = 0; h < 26; h++) {
      expect(daytimeAt({ day: 1, seconds: h * HOUR })).toBeTruthy();
    }
  });

  it('règle la nuit sur son entrée du soir, pas sur minuit', () => {
    expect(startOfDaytime('nuit')).toBe(21 * HOUR);
  });

  it('écrit les durées en toutes lettres', () => {
    expect(formatDuration(30)).toBe('30 s');
    expect(formatDuration(10 * MINUTE)).toBe('10 min');
    expect(formatDuration(2 * HOUR)).toBe('2 h');
    expect(formatDuration(90 * MINUTE)).toBe('1 h 30');
  });
});

/* ── Les jauges ────────────────────────────────────────────────────────────── */

/** Profil d'un personnage aux attributs de référence (tout à 10). */
const P = profileOf(ATTRS());
const pts = (key: SurvivalKey, state: SurvivalState | undefined): number => pointsLeft(key, state, P);
/** Une heure du premier jour. */
const at = (hours: number) => ({ day: 1, seconds: hours * HOUR });
/** Un état entamé : points manquants par jauge. */
const worn = (loss: Partial<Record<SurvivalKey, number>>, extra: Partial<SurvivalState> = {}): SurvivalState => ({
  loss: { hunger: 0, thirst: 0, rest: 0, ...loss },
  ...extra,
});
const withAttrs = (over: Partial<Record<AttributeKey, number>>) => ({ ...ATTRS(), ...over });

describe('jauges de survie', () => {
  it('taille les réservoirs sur la Constitution', () => {
    expect(survivalMaxima(ATTRS())).toEqual({ hunger: 48, thirst: 16, rest: 15 });
    // CON 14 (+2) : Faim 48 + 12, Soif 16 + 4, Repos inchangé.
    expect(survivalMaxima(withAttrs({ constitution: 14 }))).toEqual({ hunger: 60, thirst: 20, rest: 15 });
    expect(survivalMaxima(withAttrs({ constitution: 6 }))).toEqual({ hunger: 36, thirst: 12, rest: 15 });
  });

  it('ne fait payer la Force qu’à la faim, et seulement au-delà de +2', () => {
    expect(hungerPerSegment(withAttrs({ force: 14 }))).toBe(1);
    expect(hungerPerSegment(withAttrs({ force: 16 }))).toBe(2);
    expect(hungerPerSegment(withAttrs({ force: 18 }))).toBe(2);
    expect(hungerPerSegment(withAttrs({ force: 20 }))).toBe(3);
  });

  it('use faim et soif d’un point par segment de journée', () => {
    const route = activityByKey('route')!;
    let state = drain(freshSurvival(), P, at(8), SEGMENT_SECONDS, route);
    expect(pts('hunger', state)).toBe(47);
    expect(pts('thirst', state)).toBe(15);

    state = drain(freshSurvival(), P, at(8), DAY, route);
    expect(pts('hunger', state)).toBe(44);
    expect(pts('thirst', state)).toBe(12);
  });

  it('ne raye un point qu’une fois le segment écoulé', () => {
    const state = drain(freshSurvival(), P, at(8), SEGMENT_SECONDS / 2, activityByKey('route')!);
    expect(state.loss.thirst).toBeCloseTo(0.5);
    expect(pts('thirst', state)).toBe(16);
  });

  it('use plus vite la faim d’un colosse', () => {
    const fort = profileOf(withAttrs({ force: 16 }));
    const state = drain(freshSurvival(), fort, at(8), SEGMENT_SECONDS, activityByKey('route')!);
    expect(pointsLeft('hunger', state, fort)).toBe(46);
    expect(pointsLeft('thirst', state, fort)).toBe(15);
  });

  it('ne perd rien à découper le temps en tranches', () => {
    const route = activityByKey('route')!;
    const gros = drain(freshSurvival(), P, at(8), 2 * HOUR, route);

    let petit = freshSurvival();
    for (let i = 0; i < 12; i++) {
      petit = drain(petit, P, { day: 1, seconds: 8 * HOUR + i * 10 * MINUTE }, 10 * MINUTE, route);
    }
    for (const key of ['hunger', 'thirst', 'rest'] as SurvivalKey[]) {
      expect(petit.loss[key]).toBeCloseTo(gros.loss[key], 9);
    }
  });

  it('ne s’enfonce pas sous zéro, et ne déborde pas au-dessus du plein', () => {
    const affame = drain(freshSurvival(), P, at(8), 30 * DAY, activityByKey('route')!);
    expect(affame.loss.hunger).toBe(48);
    expect(pts('hunger', restore(affame, 'hunger', 8))).toBe(8);
    expect(restore(freshSurvival(), 'hunger', 99).loss.hunger).toBe(0);
    expect(pts('thirst', restore(worn({ thirst: 12 }), 'thirst'))).toBe(16);
  });

  it('use la soif trois fois plus vite au combat qu’en marchant', () => {
    const route = drain(freshSurvival(), P, at(8), HOUR, activityByKey('route')!);
    const combat = drain(freshSurvival(), P, at(8), HOUR, activityByKey('combat')!);
    expect(combat.loss.thirst).toBeCloseTo(route.loss.thirst * 3);
  });
});

describe('fatigue : une dette de sommeil', () => {
  it('ne coûte rien sur une journée normale', () => {
    const state = drain(freshSurvival(), P, at(5), 16 * HOUR, activityByKey('route')!);
    expect(pts('rest', state)).toBe(15);
  });

  it('ouvre la dette quand on veille la nuit : −3 pour la nuit sautée', () => {
    const state = drain(freshSurvival(), P, at(21), NIGHT_SECONDS, activityByKey('veille')!);
    expect(pts('rest', state)).toBe(12);
  });

  it('creuse ensuite −3 par phase éveillée, jusqu’à l’endormissement forcé', () => {
    const { state, events } = advanceSurvival(freshSurvival(), P, at(21), 24 * HOUR, activityByKey('veille')!);
    // Nuit −3, aube −3, matinée −3, midi −3, après-midi −3 : zéro à 18 h.
    const chute = events.find((e) => e.kind === 'knockout')!;
    expect(chute.cause).toBe('rest');
    expect(chute.sleep).toBe(true);
    expect(chute.at).toBe(DAY + 18 * HOUR);
    // 2 segments − mod. CON (0) : douze heures de sommeil forcé…
    expect(chute.segments).toBe(2);
    // … qui remboursent la dette pendant qu'on dort.
    expect(pts('rest', state)).toBeGreaterThan(0);
  });

  it('rembourse au prorata d’une nuit écourtée', () => {
    const sommeil = activityByKey('sommeil')!;
    // 3 points restants, une demi-nuit (5 h) : la moitié de la jauge revient.
    const state = drain(worn({ rest: 12 }), P, at(21), NIGHT_SECONDS / 2, sommeil);
    expect(state.loss.rest).toBeCloseTo(4.5);
    expect(pts('rest', state)).toBe(11);
  });

  it('remet la jauge à neuf après une nuit complète', () => {
    const state = drain(worn({ rest: 15 }), P, at(21), NIGHT_SECONDS, activityByKey('sommeil')!);
    expect(pts('rest', state)).toBe(15);
  });

  it('garde la dette ouverte tant qu’on n’a pas dormi', () => {
    // Trois heures de matinée (phase de 4 h) avec une dette déjà ouverte.
    const state = drain(worn({ rest: 3 }), P, at(7), 3 * HOUR, activityByKey('route')!);
    expect(state.loss.rest).toBeCloseTo(3 + 3 * (3 / 4));
    expect(pts('rest', state)).toBe(10);
  });
});

describe('perdre connaissance', () => {
  it('s’évanouit quand la soif TOMBE à zéro, puis se réveille à vide', () => {
    const route = activityByKey('route')!;
    const chute = 8 * HOUR + SEGMENT_SECONDS;
    const { state, events } = advanceSurvival(worn({ thirst: 15 }), P, at(8), SEGMENT_SECONDS, route);
    expect(events).toEqual([
      { kind: 'knockout', cause: 'thirst', at: chute, sleep: false, segments: 3 },
    ]);
    expect(state.out).toEqual({ cause: 'thirst', until: chute + 3 * SEGMENT_SECONDS, sleep: false });

    const reveil = advanceSurvival(state, P, { day: 1, seconds: chute }, 3 * SEGMENT_SECONDS, route);
    expect(reveil.events.map((e) => e.kind)).toEqual(['wake']);
    expect(reveil.state.out).toBeUndefined();
    // Toujours à sec : se réveiller ne désaltère pas, mais ne relance pas non plus.
    expect(pts('thirst', reveil.state)).toBe(0);
  });

  it('raccourcit la perte de connaissance avec la Constitution, jamais sous un segment', () => {
    expect(knockoutSegments(3, 0)).toBe(3);
    expect(knockoutSegments(3, 2)).toBe(1);
    expect(knockoutSegments(3, 5)).toBe(1);
    expect(knockoutSegments(2, -1)).toBe(3);
  });

  it('pose le statut au moteur et le lève au réveil', () => {
    // La Vigueur se jette : on cherche une graine où Kael ne tient pas. Les
    // graines sont fixes, donc le test ne vacille pas.
    let trouve = false;
    for (let seed = 1; seed <= 40 && !trouve; seed++) {
      let enc = camp({ survival: worn({ thirst: 15 }) });
      enc.seed = seed;
      enc = applyAction(enc, { type: 'passTime', seconds: SEGMENT_SECONDS + HOUR, activity: 'route' });
      let kael = enc.combatants[0];
      if (!kael.statuses.some((s) => s.key === 'evanouissement')) continue;
      trouve = true;
      expect(enc.log.some((l) => l.text.includes('déshydraté'))).toBe(true);
      expect(enc.log.some((l) => l.details?.some((d) => d.startsWith('Vigueur :')))).toBe(true);

      enc = applyAction(enc, { type: 'passTime', seconds: 3 * SEGMENT_SECONDS, activity: 'route' });
      kael = enc.combatants[0];
      expect(kael.statuses.some((s) => s.key === 'evanouissement')).toBe(false);
      expect(kael.survival!.out).toBeUndefined();
    }
    expect(trouve).toBe(true);
  });
});

describe('sauvegarde de Vigueur', () => {
  const route = activityByKey('route')!;

  it('calcule le seuil comme un jet de toucher inversé', () => {
    const moyen = mkUnit({ id: 'a', name: 'A', team: 'allies' });
    // CON 10 : résistance 0 × 4 − 12 = −12 → −2 crans → seuil 10.
    expect(vigorThreshold(moyen, 'thirst')).toBe(10);
    // Faim, sévérité 8 : −8 → −2 crans (−1,6 arrondi) → seuil 10.
    expect(vigorThreshold(moyen, 'hunger')).toBe(10);
    // CON 18 (+4) et maîtrise 4 : 16 − 12 = 4 → +1 cran, 2 crans de maîtrise → seuil 5.
    const robuste = mkUnit({ id: 'b', name: 'B', team: 'allies', proficiency: 4, attributes: withAttrs({ constitution: 18 }) });
    expect(vigorThreshold(robuste, 'thirst')).toBe(5);
  });

  it('garde conscient un segment de plus sur une réussite, puis fait rejouer', () => {
    const jets: number[] = [];
    const { state, events } = advanceSurvival(
      worn({ thirst: 15 }),
      P,
      at(8),
      2 * SEGMENT_SECONDS + HOUR,
      route,
      (_cause, t) => {
        jets.push(t);
        return 'tient';
      },
    );
    expect(events).toEqual([]);
    expect(state.out).toBeUndefined();
    // Un jet à la chute, un autre un segment plus tard, et ainsi de suite.
    expect(jets).toEqual([8 * HOUR + SEGMENT_SECONDS, 8 * HOUR + 2 * SEGMENT_SECONDS]);
    expect(pts('thirst', state)).toBe(0);
  });

  it('abrège la perte de connaissance sur une résistance partielle', () => {
    const { events } = advanceSurvival(worn({ thirst: 15 }), P, at(8), SEGMENT_SECONDS, route, () => 'demi');
    expect(events[0]).toMatchObject({ kind: 'knockout', segments: halfKnockout(3) });
    expect(halfKnockout(3)).toBe(2);
    expect(halfKnockout(1)).toBe(1);
  });

  it('laisse un segment de répit au réveil avant de rejouer', () => {
    const jets: number[] = [];
    const chute = 8 * HOUR + SEGMENT_SECONDS;
    const reveil = chute + 3 * SEGMENT_SECONDS;
    advanceSurvival(worn({ thirst: 15 }), P, at(8), 5 * SEGMENT_SECONDS, route, (_c, t) => {
      jets.push(t);
      return jets.length === 1 ? 'tombe' : 'tient';
    });
    expect(jets).toEqual([chute, reveil + SEGMENT_SECONDS]);
  });
});

describe('le lien avec la mana', () => {
  it('lit le Manque sur la Réserve : 50 / 25 / 10 % puis vide', () => {
    expect(manaTier(20, 20)).toBe('plein');
    expect(manaTier(10, 20)).toBe('leger');
    expect(manaTier(5, 20)).toBe('modere');
    expect(manaTier(2, 20)).toBe('severe');
    expect(manaTier(0, 20)).toBe('critique');
    // Pas de Réserve, pas de Manque.
    expect(manaTier(0, 0)).toBeUndefined();
  });

  it('double l’usure de la faim et de la soif le jour d’un Manque sévère', () => {
    const route = activityByKey('route')!;
    const state = drain(worn({}, { strainDay: 1 }), P, at(8), SEGMENT_SECONDS, route);
    expect(pts('hunger', state)).toBe(46);
    expect(pts('thirst', state)).toBe(14);

    // Le lendemain, le rythme redevient normal.
    const lendemain = drain(worn({}, { strainDay: 1 }), P, { day: 2, seconds: 8 * HOUR }, SEGMENT_SECONDS, route);
    expect(pts('thirst', lendemain)).toBe(15);
  });

  it('coûte l’incantation d’abord, puis le bras, puis la connaissance', () => {
    expect(manaEffect('modere', 0)).toMatchObject({ castingSteps: 1, physicalSteps: 0 });
    expect(manaEffect('severe', 0)).toMatchObject({ castingSteps: 2, physicalSteps: 1, strain: true });
    expect(manaEffect('critique', 1).knockout).toEqual({ segments: 2, sleep: false });
  });
});

/* ── Ce que le manque coûte ────────────────────────────────────────────────── */

const WEAPON = { kind: 'weapon', attackAttribute: 'force' } as CombatAbility;
const SPELL = { kind: 'spell', attackAttribute: 'intelligence' } as CombatAbility;

describe('malus de survie', () => {
  const pj = (survival: SurvivalState, over: Partial<Combatant> = {}) =>
    mkUnit({ id: 'a', name: 'A', team: 'allies', survival, ...over });

  it('ne coûte rien tant que les jauges tiennent', () => {
    const repu = pj(freshSurvival());
    expect(needSteps(repu, WEAPON)).toBe(0);
    expect(needSteps(repu, SPELL)).toBe(0);
    expect(effectiveStat(repu, 'endurance')).toBe(20);
  });

  it('fait payer la faim à la précision physique, pas aux sorts', () => {
    const affame = pj(worn({ hunger: 30 })); // 18/48 : modéré
    expect(needSteps(affame, WEAPON)).toBe(1);
    expect(needSteps(affame, SPELL)).toBe(0);
    expect(precisionOf(affame, WEAPON)).toBe(precisionOf(pj(freshSurvival()), WEAPON) - 5);
  });

  it('fait payer la soif à l’incantation, pas au bras', () => {
    const assoiffe = pj(worn({ thirst: 13 })); // 3/16 : sévère
    expect(needSteps(assoiffe, SPELL)).toBe(2);
    expect(needSteps(assoiffe, WEAPON)).toBe(0);
    expect(effectiveStat(assoiffe, 'endurance')).toBe(15);
  });

  it('épuise d’abord le corps, la magie ensuite', () => {
    const epuise = pj(worn({ rest: 12 })); // 3/15 : sévère
    expect(needSteps(epuise, WEAPON)).toBe(2);
    expect(needSteps(epuise, SPELL)).toBe(1);
    // Endurance max −30 % à CON 10.
    expect(effectiveStat(epuise, 'endurance')).toBe(14);
  });

  it('adoucit la fatigue d’un corps robuste, sans jamais l’effacer', () => {
    const robuste = pj(worn({ rest: 12 }), { attributes: withAttrs({ constitution: 18 }) });
    // CON +4 : −2 crans ramenés à −1 ; Endurance −30 % + 8 % → −22 %.
    expect(needSteps(robuste, WEAPON)).toBe(1);
    expect(effectiveStat(robuste, 'endurance')).toBe(16);
    expect(needEffect('rest', 'severe', 10).enduranceShare).toBe(0.15);
  });

  it('cumule les besoins entre eux', () => {
    const tout = pj(worn({ hunger: 40, thirst: 13 }));
    // Endurance max −25 % (faim) −25 % (soif).
    expect(effectiveStat(tout, 'endurance')).toBe(10);
  });

  it('fait peser le Manque de mana sur les jets', () => {
    const vide = pj(freshSurvival(), { mana: 1 }); // 1/20 : sévère
    expect(needSteps(vide, SPELL)).toBe(2);
    expect(needSteps(vide, WEAPON)).toBe(1);
  });

  it('ne touche pas une créature, qui ne tient aucune jauge', () => {
    const bete = mkUnit({ id: 'w', name: 'Loup', team: 'ennemis', mana: 0 });
    expect(needSteps(bete, SPELL)).toBe(0);
    expect(effectiveStat(bete, 'endurance')).toBe(20);
  });
});

/* ── Relire les anciennes jauges ───────────────────────────────────────────── */

describe('anciennes jauges à crans', () => {
  it('convertit une fiche à crans en gardant la proportion', () => {
    const loss = sheetSurvivalLoss({ survival: { hunger: 3, thirst: 4, rest: 0 } }, ATTRS());
    expect(loss).toEqual({ hunger: 24, thirst: 0, rest: 15 });
  });

  it('préfère le creux au format ancien quand les deux existent', () => {
    const loss = sheetSurvivalLoss(
      { survival: { hunger: 0, thirst: 0, rest: 0 }, survivalLoss: { hunger: 2, thirst: 1, rest: 0 } },
      ATTRS(),
    );
    expect(loss).toEqual({ hunger: 2, thirst: 1, rest: 0 });
  });

  it('relit une partie sauvegardée en secondes écoulées', () => {
    // Ancienne soif : 4 crans de 4 h ; 8 h écoulées = moitié de la jauge.
    const state = migrateSurvival({ hunger: 0, thirst: 8 * HOUR, rest: 0 }, ATTRS());
    expect(state!.loss).toEqual({ hunger: 0, thirst: 8, rest: 0 });
    // Une partie déjà au nouveau format passe telle quelle.
    expect(migrateSurvival(worn({ hunger: 3 }), ATTRS())).toEqual(worn({ hunger: 3 }));
  });

  it('écrit sur la fiche la partie entière du creux, qui conserve les points annoncés', () => {
    const state = worn({ hunger: 1.5, thirst: 0.2 });
    expect(survivalToLoss(state, P)).toEqual({ hunger: 1, thirst: 0, rest: 0 });
    expect(pts('hunger', state)).toBe(47);
  });
});

/* ── Le temps qui passe à table ────────────────────────────────────────────── */

describe('passer le temps', () => {
  it('avance l’horloge et l’annonce au journal', () => {
    const after = applyAction(camp(), { type: 'passTime', seconds: 2 * HOUR, activity: 'route' });
    expect(formatClock(clockOf(after))).toBe('Jour 1 — 10h00');
    expect(after.log.some((l) => l.kind === 'time')).toBe(true);
  });

  it('réaccorde le moment de la journée sur l’heure', () => {
    const after = applyAction(camp(), { type: 'passTime', seconds: 14 * HOUR, activity: 'route' });
    expect(after.daytime).toBe('nuit');
  });

  it('respecte le verrou du MJ : un souterrain reste noir à midi', () => {
    let enc = camp();
    enc = applyAction(enc, { type: 'setDaytime', daytime: 'nuit' });
    enc = applyAction(enc, { type: 'lockDaytime', locked: true });
    enc = applyAction(enc, { type: 'passTime', seconds: 15 * HOUR, activity: 'route' });
    expect(enc.daytime).toBe('nuit');
  });

  it('reprend le fil de l’horloge dès que le verrou saute', () => {
    let enc = camp();
    enc = applyAction(enc, { type: 'lockDaytime', locked: true });
    enc = applyAction(enc, { type: 'setClock', day: 1, seconds: 12 * HOUR });
    enc = applyAction(enc, { type: 'lockDaytime', locked: false });
    expect(enc.daytime).toBe('midi');
  });

  it('use les jauges du groupe, et le journal annonce le palier franchi', () => {
    const after = applyAction(camp(), { type: 'passTime', seconds: 5 * SEGMENT_SECONDS, activity: 'route' });
    const kael = after.combatants.find((c) => c.id === 'pc')!;
    // Cinq segments : 16 − 5 = 11, sous les 75 % (« la gorge sèche »).
    expect(pts('thirst', kael.survival)).toBe(11);
    expect(after.log.some((l) => l.kind === 'survival' && l.text.includes('La gorge sèche'))).toBe(true);
  });

  it('fige les jauges d’un blessé à terre : il ne se punit pas deux fois', () => {
    const enc = camp({ down: true, hp: 0 });
    const after = applyAction(enc, { type: 'passTime', seconds: 12 * HOUR, activity: 'route' });
    expect(after.combatants.find((c) => c.id === 'pc')!.survival).toEqual(freshSurvival());
  });

  it('laisse les créatures en dehors du décompte', () => {
    const after = applyAction(camp(), { type: 'passTime', seconds: 12 * HOUR, activity: 'route' });
    expect(after.combatants.find((c) => c.id === 'wolf')!.survival).toBeUndefined();
  });
});

describe('manger, boire, dormir', () => {
  it('comble la jauge de tout le groupe quand personne n’est désigné', () => {
    let enc = camp();
    enc = applyAction(enc, { type: 'passTime', seconds: 2 * SEGMENT_SECONDS, activity: 'route' });
    enc = applyAction(enc, { type: 'restore', gauge: 'thirst', source: 'la rivière' });
    expect(pts('thirst', enc.combatants[0].survival)).toBe(16);
  });

  it('mange une journée de rations : le lot s’entame, il ne disparaît pas', () => {
    let enc = camp({ inventory: [{ name: 'Rations de voyage', qty: 2, kind: 'other' }] });
    enc = applyAction(enc, { type: 'passTime', seconds: DAY, activity: 'route' });
    enc = applyAction(enc, { type: 'eat', actorId: 'pc', item: 'Rations de voyage' });

    const kael = enc.combatants[0];
    expect(pts('hunger', kael.survival)).toBe(48);
    // Deux lots de sept jours : un entamé à six, un intact.
    const ligne = kael.inventory.find((i) => i.name === 'Rations de voyage')!;
    expect(ligne.qty).toBe(2);
    expect(ligne.usesLeft).toBe(6);
  });

  it('vide l’outre plutôt que de la faire disparaître du sac', () => {
    let enc = camp({ inventory: [{ name: 'Outre en peau', qty: 1, kind: 'other' }] });
    enc = applyAction(enc, { type: 'passTime', seconds: 2 * SEGMENT_SECONDS, activity: 'route' });
    enc = applyAction(enc, { type: 'eat', actorId: 'pc', item: 'Outre en peau' });

    const kael = enc.combatants[0];
    expect(pts('thirst', kael.survival)).toBe(16);
    expect(kael.inventory.find((i) => i.name === 'Outre en peau')).toBeUndefined();
    expect(kael.inventory.find((i) => i.name === EMPTY_WATERSKIN)!.qty).toBe(1);
  });

  it('remplit les outres vides à la source', () => {
    let enc = camp({ inventory: [{ name: EMPTY_WATERSKIN, qty: 2, kind: 'other' }] });
    enc = applyAction(enc, { type: 'refill', team: 'allies' });

    const kael = enc.combatants[0];
    expect(kael.inventory.find((i) => i.name === EMPTY_WATERSKIN)).toBeUndefined();
    expect(kael.inventory.find((i) => i.name === WATERSKIN)!.qty).toBe(2);
  });

  it('échelonne les trois tailles de ration sur la jauge de faim', () => {
    // Une ration de voyage vaut UNE journée (quatre segments), comme l'écrit sa
    // fiche ; la petite en est la moitié, la grande vaut deux jours.
    expect(nourishmentOf({ name: 'Petite ration' })!.points).toBe(2);
    expect(nourishmentOf({ name: 'Rations de voyage' })!.points).toBe(4);
    expect(nourishmentOf({ name: 'Grande ration' })!.points).toBe(8);
    expect(nourishmentOf({ name: 'Outre en peau' })!.points).toBe(4);
  });

  it('ne comble qu’une demi-journée avec une petite ration', () => {
    let enc = camp({ inventory: [{ name: 'Petite ration', qty: 1, kind: 'other' }] });
    enc = applyAction(enc, { type: 'passTime', seconds: DAY, activity: 'route' });
    expect(pts('hunger', enc.combatants[0].survival)).toBe(44);

    enc = applyAction(enc, { type: 'eat', actorId: 'pc', item: 'Petite ration' });
    expect(pts('hunger', enc.combatants[0].survival)).toBe(46);
  });

  it('entame la plus grosse ration en premier au repas du groupe', () => {
    let enc = camp({
      inventory: [
        { name: 'Petite ration', qty: 1, kind: 'other' },
        { name: 'Grande ration', qty: 1, kind: 'other' },
      ],
    });
    enc = applyAction(enc, { type: 'passTime', seconds: 40 * HOUR, activity: 'route' });
    enc = applyAction(enc, { type: 'meal', gauge: 'hunger', team: 'allies' });

    const kael = enc.combatants[0];
    expect(pts('hunger', kael.survival)).toBe(48);
    expect(kael.inventory.find((i) => i.name === 'Grande ration')).toBeUndefined();
    expect(kael.inventory.find((i) => i.name === 'Petite ration')!.qty).toBe(1);
  });

  it('le ravitaillement rapporte des vivres, pas de la satiété', () => {
    let enc = camp();
    enc = applyAction(enc, { type: 'passTime', seconds: DAY, activity: 'route' });
    const avant = pts('hunger', enc.combatants[0].survival);

    enc = applyAction(enc, {
      type: 'provision',
      item: 'Grande ration',
      qty: 1,
      actorId: 'pc',
      source: 'achat à l’étape',
    });

    const kael = enc.combatants[0];
    // La jauge n'a pas bougé : c'est le SAC qui s'est rempli. Il reste à manger.
    expect(pts('hunger', kael.survival)).toBe(avant);
    expect(kael.inventory.find((i) => i.name === 'Grande ration')!.qty).toBe(1);
    expect(kael.inventory.find((i) => i.name === 'Grande ration')!.slug).toBe('grande-ration');
  });

  it('couvre exactement 100 % avec la table de chasse', () => {
    expect(HUNT_TOTAL).toBe(100);
  });

  it('découpe le d100 aux bornes annoncées', () => {
    // 1-25 bredouille · 26-80 petit gibier · 81-100 gibier médian.
    expect(huntOutcome(1).key).toBe('bredouille');
    expect(huntOutcome(25).key).toBe('bredouille');
    expect(huntOutcome(26).key).toBe('petit');
    expect(huntOutcome(80).key).toBe('petit');
    expect(huntOutcome(81).key).toBe('median');
    expect(huntOutcome(100).key).toBe('median');
  });

  it('ne rapporte rien sur une battue bredouille, et un vivre sinon', () => {
    expect(huntOutcome(10).nourishment).toBeUndefined();
    expect(huntOutcome(50).nourishment!.name).toBe('Petite ration');
    expect(huntOutcome(90).nourishment!.name).toBe('Rations de voyage');
  });

  it('donne la prise à celui qui a lancé la battue, et journalise le jet', () => {
    // On chasse jusqu'à ce que la table rende quelque chose : la graine est
    // fixe, donc la suite de jets l'est aussi et le test ne vacille pas.
    let enc = camp({}, { down: false, hp: 40 });
    let prise: string | undefined;
    for (let i = 0; i < 12 && !prise; i++) {
      enc = applyAction(enc, { type: 'hunt', actorId: 'pc' });
      prise = enc.combatants[0].inventory[0]?.name;
    }

    expect(prise).toBeDefined();
    // Le sac de l'AUTRE n'a rien reçu : la prise revient au chasseur.
    expect(enc.combatants[1].inventory).toEqual([]);
    expect(enc.log.some((l) => l.details?.some((d) => d.startsWith('d100 :')))).toBe(true);
  });

  it('pousse le résultat vers le haut de la table avec le bonus de Nature', () => {
    // Un jet de 24 rentre bredouille ; le même jet avec +4 de Nature ramène
    // quelque chose. C'est tout l'intérêt d'un chasseur qui sait lire une coulée.
    expect(huntOutcome(24).key).toBe('bredouille');
    expect(huntOutcome(24 + 4).key).toBe('petit');
    expect(huntOutcome(78 + 5).key).toBe('median');
  });

  it('plafonne sur la meilleure issue plutôt que de sortir de la table', () => {
    expect(huntOutcome(100 + 12).key).toBe('median');
  });

  it('lit le bonus sur la compétence Nature, et rien pour une créature', () => {
    expect(huntBonus({ nature: 4, survival: 9 })).toBe(4);
    expect(huntBonus(undefined)).toBe(0);
  });

  it('applique le bonus de Nature du chasseur et le montre au journal', () => {
    const doue = camp({ skills: { nature: 40 } });
    // +40 : même le pire jet dépasse la bande « bredouille ».
    const apres = applyAction(doue, { type: 'hunt', actorId: 'pc' });
    expect(apres.combatants[0].inventory.length).toBe(1);
    expect(apres.log.some((l) => l.details?.some((d) => d.includes('(Nature)')))).toBe(true);
  });

  it('rejoue exactement la même chasse pour une même graine', () => {
    const une = applyAction(camp(), { type: 'hunt', actorId: 'pc' });
    const deux = applyAction(camp(), { type: 'hunt', actorId: 'pc' });
    expect(une.combatants[0].inventory).toEqual(deux.combatants[0].inventory);
  });

  it('fait passer le temps de la battue, et le chasseur revient dans tous les cas', () => {
    const avant = camp();
    const apres = applyAction(avant, { type: 'hunt', actorId: 'pc' });
    expect(clockOf(apres)).toEqual(advanceClock(clockOf(avant), HUNT_SECONDS));
    // Le chasseur court, le groupe attend : le journal dit qui faisait quoi.
    expect(apres.log.some((l) => l.text.includes('Kael : effort soutenu'))).toBe(true);
    expect(apres.log.some((l) => l.text.startsWith('Kael revient de la chasse'))).toBe(true);
  });

  it('refuse la battue à qui est sans connaissance', () => {
    const avant = camp({ survival: { ...freshSurvival(), out: { until: 1e12, sleep: false } } });
    const apres = applyAction(avant, { type: 'hunt', actorId: 'pc' });
    expect(clockOf(apres)).toEqual(clockOf(avant));
    expect(apres.combatants[0].inventory).toEqual([]);
  });

  it('respecte la distribution annoncée sur un grand nombre de battues', () => {
    // Le seul garde-fou qui attrape une table mal cumulée : les bornes peuvent
    // être justes une à une et la répartition fausse malgré tout.
    const compte = new Map<string, number>();
    const rng = new Rng(2024);
    for (let i = 0; i < 20000; i++) {
      const key = huntOutcome(rng.d100()).key;
      compte.set(key, (compte.get(key) ?? 0) + 1);
    }
    expect((compte.get('bredouille') ?? 0) / 20000).toBeCloseTo(0.25, 1);
    expect((compte.get('petit') ?? 0) / 20000).toBeCloseTo(0.55, 1);
    expect((compte.get('median') ?? 0) / 20000).toBeCloseTo(0.2, 1);
  });

  it('empile la prise sur une ligne déjà présente', () => {
    let enc = camp({ inventory: [{ name: 'Petite ration', qty: 2, kind: 'other' }] });
    enc = applyAction(enc, { type: 'provision', item: 'Petite ration', qty: 3, actorId: 'pc' });
    expect(enc.combatants[0].inventory.find((i) => i.name === 'Petite ration')!.qty).toBe(5);
  });

  it('le repas du groupe prend sur les vivres de chacun', () => {
    let enc = camp({ inventory: [{ name: 'Rations de voyage', qty: 3, kind: 'other', usesLeft: 1 }] });
    enc = applyAction(enc, { type: 'passTime', seconds: DAY, activity: 'route' });
    enc = applyAction(enc, { type: 'meal', gauge: 'hunger', team: 'allies' });

    const kael = enc.combatants[0];
    expect(pts('hunger', kael.survival)).toBe(48);
    expect(kael.inventory.find((i) => i.name === 'Rations de voyage')!.qty).toBe(2);
  });

  it('nomme au journal ceux qui n’ont rien à manger', () => {
    let enc = camp({ inventory: [] });
    enc = applyAction(enc, { type: 'passTime', seconds: DAY, activity: 'route' });
    enc = applyAction(enc, { type: 'meal', gauge: 'hunger', team: 'allies' });

    expect(pts('hunger', enc.combatants[0].survival)).toBe(44);
    expect(enc.log.some((l) => l.text.includes('Rien à manger pour Kael'))).toBe(true);
  });

  it('ne nourrit pas les adversaires avec le repas du groupe', () => {
    // Un adversaire qui tient ses jauges : un humanoïde monté depuis une fiche.
    let enc = camp({}, { down: false, hp: 40, survival: freshSurvival() });
    enc = applyAction(enc, { type: 'passTime', seconds: 2 * SEGMENT_SECONDS, activity: 'route' });
    enc = applyAction(enc, {
      type: 'restore',
      gauge: 'thirst',
      team: 'allies',
      source: 'la source',
    });

    expect(pts('thirst', enc.combatants[0].survival)).toBe(16);
    expect(pts('thirst', enc.combatants[1].survival)).toBe(14);
  });

  it('reconnaît ce qui nourrit, par slug comme par nom', () => {
    expect(nourishmentOf({ name: 'rations de voyage' })?.gauge).toBe('hunger');
    expect(nourishmentOf({ name: 'Peu importe', slug: 'outre-en-peau' })?.gauge).toBe('thirst');
    expect(nourishmentOf({ name: 'Corde de chanvre' })).toBeUndefined();
  });

  it('laisse le MJ corriger une jauge à la main', () => {
    const after = applyAction(camp(), {
      type: 'setSurvival',
      actorId: 'pc',
      gauge: 'rest',
      points: 4,
    });
    expect(pts('rest', after.combatants[0].survival)).toBe(4);
  });
});

/* ── Fouiller les corps ────────────────────────────────────────────────────── */

describe('butin', () => {
  const table = [{ name: 'Croc de loup', slug: 'croc-de-loup', chance: 100, min: 2, max: 2 }];

  it('jette la table du bestiaire et pose la pile sur le corps', () => {
    const enc = applyAction(camp({}, { lootTable: table }), { type: 'search', targetId: 'wolf' });
    const wolf = enc.combatants.find((c) => c.id === 'wolf')!;
    expect(wolf.searched).toBe(true);
    expect(wolf.loot).toEqual([
      { name: 'Croc de loup', qty: 2, slug: 'croc-de-loup', collection: undefined },
    ]);
  });

  it('refuse de fouiller quelqu’un encore debout', () => {
    const enc = camp({}, { down: false, hp: 10, lootTable: table });
    const after = applyAction(enc, { type: 'search', targetId: 'wolf' });
    expect(after.combatants.find((c) => c.id === 'wolf')!.searched).toBeFalsy();
  });

  it('ne rejette pas les dés sur un corps déjà fouillé', () => {
    let enc = applyAction(camp({}, { lootTable: table }), { type: 'search', targetId: 'wolf' });
    enc = applyAction(enc, { type: 'takeLoot', targetId: 'wolf', actorId: 'pc' });
    enc = applyAction(enc, { type: 'search', targetId: 'wolf' });
    expect(pileSize(enc.combatants.find((c) => c.id === 'wolf')!.loot)).toBe(0);
  });

  it('verse le sac de la victime dans la pile, avec sa bourse', () => {
    const enc = camp(
      {},
      { inventory: [{ name: 'Flèche', qty: 12, kind: 'ammunition' }], purse: 18 },
    );
    const after = applyAction(enc, { type: 'search', targetId: 'wolf' });
    const wolf = after.combatants.find((c) => c.id === 'wolf')!;
    expect(wolf.loot).toEqual([{ name: 'Flèche', qty: 12, slug: undefined, collection: undefined }]);
    expect(wolf.lootGold).toBe(18);
    expect(wolf.inventory).toEqual([]);
    expect(wolf.purse).toBe(0);
  });

  it('transfère tout d’un coup vers le sac et la bourse du ramasseur', () => {
    let enc = camp({}, { lootTable: table, purse: 5 });
    enc = applyAction(enc, { type: 'search', targetId: 'wolf' });
    enc = applyAction(enc, { type: 'takeLoot', targetId: 'wolf', actorId: 'pc' });

    const kael = enc.combatants.find((c) => c.id === 'pc')!;
    expect(kael.inventory).toEqual([
      { name: 'Croc de loup', qty: 2, slug: 'croc-de-loup', kind: 'other' },
    ]);
    expect(kael.purse).toBe(15);
    expect(enc.combatants.find((c) => c.id === 'wolf')!.loot).toEqual([]);
  });

  it('prend une ligne partielle et laisse le reste', () => {
    let enc = camp({}, { lootTable: table });
    enc = applyAction(enc, { type: 'search', targetId: 'wolf' });
    enc = applyAction(enc, {
      type: 'takeLoot',
      targetId: 'wolf',
      actorId: 'pc',
      item: 'Croc de loup',
      qty: 1,
    });
    expect(enc.combatants.find((c) => c.id === 'pc')!.inventory[0].qty).toBe(1);
    expect(enc.combatants.find((c) => c.id === 'wolf')!.loot![0].qty).toBe(1);
  });

  it('ne perd rien entre la fouille et la prise : ce qui quitte le corps est sur la pile', () => {
    const enc = camp({}, { inventory: [{ name: 'Dague', qty: 1, kind: 'other' }], purse: 7 });
    const after = applyAction(enc, { type: 'search', targetId: 'wolf' });
    const wolf = after.combatants.find((c) => c.id === 'wolf')!;

    // Le sac du mort est vide, mais RIEN n'a disparu : tout est sur la pile,
    // en attente d'un porteur.
    expect(wolf.inventory).toEqual([]);
    expect(pileSize(wolf.loot)).toBe(1);
    expect(wolf.lootGold).toBe(7);
  });

  it('dépose bien le butin dans le sac du porteur, et pas seulement hors du corps', () => {
    let enc = camp({}, { lootTable: table, purse: 7 });
    enc = applyAction(enc, { type: 'search', targetId: 'wolf' });
    enc = applyAction(enc, { type: 'takeLoot', targetId: 'wolf', actorId: 'pc' });

    const kael = enc.combatants.find((c) => c.id === 'pc')!;
    const wolf = enc.combatants.find((c) => c.id === 'wolf')!;
    expect(carriedQty(kael, 'Croc de loup')).toBe(2);
    expect(kael.purse).toBe(17);
    expect(pileSize(wolf.loot)).toBe(0);
    expect(wolf.lootGold).toBe(0);
  });

  it('refuse de prendre sur un corps non fouillé', () => {
    const after = applyAction(camp({}, { lootTable: table }), {
      type: 'takeLoot',
      targetId: 'wolf',
      actorId: 'pc',
    });
    expect(after.combatants.find((c) => c.id === 'pc')!.inventory).toEqual([]);
  });

  it('fusionne les lignes de même nom plutôt que d’empiler les doublons', () => {
    const drops = [
      { name: 'Croc de loup', chance: 100, min: 1, max: 1 },
      { name: 'Croc de loup', chance: 100, min: 3, max: 3 },
    ];
    expect(rollDrops(drops, new Rng(1))).toEqual([
      { name: 'Croc de loup', qty: 4, slug: undefined, collection: undefined },
    ]);
  });

  it('respecte les chances : rien ne tombe à 0 %, tout tombe à 100 %', () => {
    expect(rollDrops([{ name: 'Jamais', chance: 0 }], new Rng(7))).toEqual([]);
    expect(pileSize(rollDrops([{ name: 'Toujours', chance: 100 }], new Rng(7)))).toBe(1);
  });

  it('rejoue le même butin pour une même graine — une partie rechargée ne change pas', () => {
    const drops = [{ name: 'Croc', chance: 50, min: 1, max: 4 }];
    expect(rollDrops(drops, new Rng(1234))).toEqual(rollDrops(drops, new Rng(1234)));
  });

  it('ignore les lignes vides du sac d’un mort', () => {
    expect(carriedAsLoot([{ name: 'Carquois', qty: 0, kind: 'ammunition' }])).toEqual([]);
  });
});

/* ── Les phases ────────────────────────────────────────────────────────────── */

describe('phases', () => {
  it('démarre au montage', () => {
    expect(phaseOf(emptyEncounter())).toBe('setup');
  });

  it('bascule en combat au lancement de l’initiative', () => {
    // Un adversaire debout : sans lui, le combat serait fini avant de commencer.
    const enc = camp({}, { down: false, hp: 40 });
    enc.phase = 'setup';
    expect(phaseOf(applyAction(enc, { type: 'start' }))).toBe('combat');
  });

  it('sort d’elle-même en exploration quand le combat est plié', () => {
    let enc = camp();
    enc.phase = 'setup';
    enc = applyAction(enc, { type: 'start' });
    // Le loup est déjà à terre : le combat est fini dès la première action.
    enc = applyAction(enc, { type: 'endTurn' });
    expect(phaseOf(enc)).toBe('exploration');
  });

  it('déduit une phase pour une rencontre d’avant les phases', () => {
    const vieille = { ...emptyEncounter(), phase: undefined, clock: undefined, started: true };
    expect(phaseOf(migrateEncounter(vieille))).toBe('exploration');
  });

  it('respecte, en le figeant, le moment de la journée d’une partie sans horloge', () => {
    const vieille = {
      ...emptyEncounter(),
      phase: undefined,
      clock: undefined,
      daytime: 'nuit',
    };
    const migree = migrateEncounter(vieille);
    expect(migree.daytime).toBe('nuit');
    expect(migree.daytimeLocked).toBe(true);
  });
});

/* ── Le combat fait aussi tourner l'horloge ───────────────────────────────── */

describe('l’horloge en combat', () => {
  it('avance de six secondes par round', () => {
    let enc = camp({ pos: { x: 0, y: 0 } }, { down: false, hp: 40, pos: { x: 5, y: 5 } });
    enc.phase = 'setup';
    const depart = clockOf(enc).seconds;

    enc = applyAction(enc, { type: 'start' });
    // Deux fins de tour bouclent l'ordre : un round complet.
    enc = applyAction(enc, { type: 'endTurn' });
    enc = applyAction(enc, { type: 'endTurn' });

    expect(clockOf(enc).seconds - depart).toBe(ROUND_SECONDS);
  });
});

/* ── Reporter la séance sur les fiches ─────────────────────────────────────
   Le geste qui sort de la rencontre : il écrit ailleurs, donc il se vérifie
   plus étroitement que le reste.
─────────────────────────────────────────────────────────────────────────── */

describe('report sur les fiches', () => {
  /** Une fiche neuve, jauges pleines, sac connu, bourse au tirage. */
  const sheet = (over: Partial<CharacterSheet> = {}): CharacterSheet => ({
    ...emptySheet(),
    survivalLoss: noSurvivalLoss(),
    inventory: [{ name: 'Flèche', qty: 20, weight: 0.05 }],
    goldDelta: 0,
    ...over,
  });

  /** Le pion correspondant, tel que la fabrique l'aurait posé. */
  const pion = (over: Partial<Combatant> = {}): Combatant =>
    mkUnit({
      id: 'pc',
      name: 'Kael',
      team: 'allies',
      origin: { kind: 'sheet', sheetId: 's1' },
      survival: freshSurvival(),
      inventory: [{ name: 'Flèche', qty: 20, kind: 'ammunition' }],
      purse: 30,
      purseBase: 30,
      ...over,
    });

  it('n’annonce rien quand rien n’a bougé', () => {
    expect(diffAgainstSheet(pion(), sheet(), 's1').changed).toBe(false);
  });

  it('annonce les points de jauge perdus', () => {
    const use = pion({ survival: worn({ thirst: 13 }) });
    const report = diffAgainstSheet(use, sheet(), 's1');
    expect(report.changed).toBe(true);
    expect(report.gauges).toEqual([
      { key: 'thirst', label: 'Soif', from: 16, to: 3, max: 16, stage: 'Déshydraté' },
    ]);
  });

  it('ne voit aucun écart sur une fiche à crans restée au même niveau', () => {
    const ancienne = sheet({ survivalLoss: undefined, survival: { hunger: 3, thirst: 4, rest: 5 } });
    expect(diffAgainstSheet(pion({ survival: worn({ hunger: 24 }) }), ancienne, 's1').gauges).toEqual([]);
  });

  it('annonce les réserves entamées, maximum du pion à l’appui', () => {
    const use = pion({ hp: 12, endurance: 6 });
    const report = diffAgainstSheet(use, sheet(), 's1');
    expect(report.changed).toBe(true);
    expect(report.pools).toEqual([
      { key: 'hp', label: 'Points de vie', short: 'pv', from: 40, to: 12, max: 40, stage: 'Au plus mal' },
      {
        key: 'endurance',
        label: 'Endurance',
        short: 'endurance',
        from: 20,
        to: 6,
        max: 20,
        stage: 'Essoufflé',
      },
    ]);
  });

  it('part de réserves pleines pour une fiche d’avant le champ', () => {
    expect(diffAgainstSheet(pion(), sheet({ poolLoss: undefined }), 's1').pools).toEqual([]);
  });

  it('écrit le creux des trois réserves, pas leur total', () => {
    const use = pion({ hp: 12, mana: 5 });
    const next = applyReport(sheet(), diffAgainstSheet(use, sheet(), 's1'), use, () => 0);
    expect(next.poolLoss).toEqual({ hp: 28, endurance: 0, mana: 15 });
  });

  it('reprend une séance là où la précédente avait laissé les réserves', () => {
    const blesse = sheet({ poolLoss: { hp: 28, endurance: 0, mana: 0 } });
    // Le pion repart de la fiche (40 − 28 = 12 PV) et encaisse encore 4 points.
    const report = diffAgainstSheet(pion({ hp: 8 }), blesse, 's1');
    expect(report.pools).toEqual([
      { key: 'hp', label: 'Points de vie', short: 'pv', from: 12, to: 8, max: 40, stage: 'Au plus mal' },
    ]);
  });

  it('ne dit rien des réserves quand la séance ne les a pas touchées', () => {
    expect(diffAgainstSheet(pion(), sheet({ poolLoss: { hp: 0, endurance: 0, mana: 0 } }), 's1').pools).toEqual(
      [],
    );
  });

  it('annonce les munitions dépensées et le butin ramassé', () => {
    const use = pion({
      inventory: [
        { name: 'Flèche', qty: 14, kind: 'ammunition' },
        { name: 'Croc de loup', qty: 3, kind: 'other' },
      ],
    });
    const report = diffAgainstSheet(use, sheet(), 's1');
    expect(report.items).toEqual([
      { name: 'Croc de loup', delta: 3, to: 3 },
      { name: 'Flèche', delta: -6, to: 14 },
    ]);
  });

  it('annonce l’or gagné comme un écart au tirage du background', () => {
    const report = diffAgainstSheet(pion({ purse: 48 }), sheet(), 's1');
    expect(report.gold).toBe(18);
  });

  it('ne devine pas la bourse d’un pion monté à la main', () => {
    const report = diffAgainstSheet(pion({ purse: 48, purseBase: undefined }), sheet(), 's1');
    expect(report.gold).toBe(0);
  });

  it('écrit les jauges, le sac et l’écart de bourse sur la fiche', () => {
    const base = sheet();
    const use = pion({
      survival: worn({ hunger: 24.5 }),
      inventory: [
        { name: 'Flèche', qty: 14, kind: 'ammunition' },
        { name: 'Croc de loup', qty: 3, kind: 'other' },
      ],
      purse: 48,
    });
    const report = diffAgainstSheet(use, base, 's1');
    const next = applyReport(base, report, use, (name) => (name === 'Croc de loup' ? 0.1 : 0));

    expect(next.survivalLoss).toEqual({ hunger: 24, thirst: 0, rest: 0 });
    expect(next.survival).toBeUndefined();
    expect(next.inventory).toEqual([
      { name: 'Flèche', qty: 14, weight: 0.05 },
      { name: 'Croc de loup', qty: 3, weight: 0.1 },
    ]);
    expect(next.goldDelta).toBe(18);
  });

  it('ne touche pas à la fiche d’origine', () => {
    const base = sheet();
    const use = pion({ purse: 48 });
    applyReport(base, diffAgainstSheet(use, base, 's1'), use, () => 0);
    expect(base.goldDelta).toBe(0);
  });

  it('cumule deux séances sans perdre les gains de la première', () => {
    let fiche = sheet();
    const premier = pion({ purse: 48 });
    fiche = applyReport(fiche, diffAgainstSheet(premier, fiche, 's1'), premier, () => 0);
    expect(fiche.goldDelta).toBe(18);

    // Deuxième séance : le pion repart de la fiche mise à jour (30 de tirage
    // + 18 d'écart = 48), et rapporte encore 10 pièces.
    const second = pion({ purse: 58, purseBase: 30 });
    const report = diffAgainstSheet(second, fiche, 's1');
    expect(report.gold).toBe(10);
    expect(applyReport(fiche, report, second, () => 0).goldDelta).toBe(28);
  });

  it('part d’une réserve pleine pour une fiche d’avant les jauges', () => {
    const ancienne = sheet({ survivalLoss: undefined });
    expect(diffAgainstSheet(pion(), ancienne, 's1').gauges).toEqual([]);
  });

  it('résume la ligne en une phrase lisible', () => {
    const use = pion({ survival: worn({ thirst: 4 }), purse: 40 });
    expect(summarize(diffAgainstSheet(use, sheet(), 's1'))).toBe('soif 16 → 12 · +10 po');
  });

  it('met les réserves en tête du résumé', () => {
    const use = pion({ hp: 12, mana: 5, purse: 40 });
    expect(summarize(diffAgainstSheet(use, sheet(), 's1'))).toBe(
      'pv 40 → 12 · mana 20 → 5 · +10 po',
    );
  });
});

/* ── Le décor qu'on manipule ───────────────────────────────────────────────
   Portes et eau profonde : le décor cesse d'être une carte figée.
─────────────────────────────────────────────────────────────────────────── */

describe('portes', () => {
  /** Une porte en (1,0), un personnage juste à côté en (0,0). */
  function couloir(over: Partial<Combatant> = {}, door: Partial<DoorState> = {}): Encounter {
    const enc = emptyEncounter('Couloir');
    enc.seed = 7;
    enc.terrain = { '1,0': 'porte' };
    enc.features = { '1,0': { ...newDoor(), ...door } };
    enc.combatants = [
      mkUnit({ id: 'pc', name: 'Kael', team: 'allies', pos: { x: 0, y: 0 }, ...over }),
    ];
    return enc;
  }

  it('barre la route et la vue tant qu’elle est fermée', () => {
    const enc = couloir();
    expect(blocksMovement(terrainFor(enc), '1,0')).toBe(true);
    expect(blocksSight(terrainFor(enc), '1,0')).toBe(true);
  });

  it('libère la case une fois ouverte', () => {
    const enc = applyAction(couloir(), { type: 'door', cell: '1,0', act: 'open', actorId: 'pc' });
    expect(blocksMovement(terrainFor(enc), '1,0')).toBe(false);
    expect(blocksSight(terrainFor(enc), '1,0')).toBe(false);
  });

  it('refuse de s’ouvrir tant qu’elle est verrouillée', () => {
    const enc = applyAction(couloir({}, { locked: true }), {
      type: 'door',
      cell: '1,0',
      act: 'open',
      actorId: 'pc',
    });
    expect(enc.features!['1,0'].open).toBe(false);
    expect(blocksMovement(terrainFor(enc), '1,0')).toBe(true);
  });

  it('exige d’être à portée du battant', () => {
    const enc = applyAction(couloir({ pos: { x: 9, y: 9 } }), {
      type: 'door',
      cell: '1,0',
      act: 'open',
      actorId: 'pc',
    });
    expect(enc.features!['1,0'].open).toBe(false);
    expect(enc.log.some((l) => l.text.includes('trop loin'))).toBe(true);
  });

  it('refuse le crochetage sans outils, même à un expert', () => {
    const enc = applyAction(couloir({ skills: { 'sleight-of-hand': 40 } }, { locked: true }), {
      type: 'door',
      cell: '1,0',
      act: 'pick',
      actorId: 'pc',
    });
    expect(enc.features!['1,0'].locked).toBe(true);
    expect(enc.log.some((l) => l.text.includes('crocheteur'))).toBe(true);
  });

  it('ouvre la serrure avec les outils et un bon jet', () => {
    const enc = applyAction(
      couloir(
        {
          skills: { 'sleight-of-hand': 40 },
          inventory: [{ name: 'Outils de crocheteur', qty: 1, kind: 'other' }],
        },
        { locked: true },
      ),
      { type: 'door', cell: '1,0', act: 'pick', actorId: 'pc' },
    );
    expect(enc.features!['1,0'].locked).toBe(false);
    expect(enc.log.some((l) => l.details?.some((d) => d.includes('Escamotage')))).toBe(true);
  });

  it('enfonce le battant sans outils, à la seule force', () => {
    const enc = applyAction(couloir({ skills: { athletism: 40 } }, { locked: true }), {
      type: 'door',
      cell: '1,0',
      act: 'break',
      actorId: 'pc',
    });
    const porte = enc.features!['1,0'];
    expect(porte.broken).toBe(true);
    expect(porte.open).toBe(true);
    expect(porte.locked).toBe(false);
  });

  it('ne referme pas une porte enfoncée', () => {
    let enc = applyAction(couloir({ skills: { athletism: 40 } }), {
      type: 'door',
      cell: '1,0',
      act: 'break',
      actorId: 'pc',
    });
    enc = applyAction(enc, { type: 'door', cell: '1,0', act: 'close', actorId: 'pc' });
    expect(enc.features!['1,0'].open).toBe(true);
  });

  it('laisse le MJ verrouiller sans jet ni distance', () => {
    const enc = applyAction(couloir({ pos: { x: 9, y: 9 } }), {
      type: 'door',
      cell: '1,0',
      act: 'lock',
    });
    expect(enc.features!['1,0'].locked).toBe(true);
  });

  it('ne fait rien sur une case sans élément manipulable', () => {
    const enc = couloir();
    enc.terrain = {};
    enc.features = {};
    const apres = applyAction(enc, { type: 'door', cell: '1,0', act: 'open', actorId: 'pc' });
    expect(apres.features?.['1,0']).toBeUndefined();
    expect(apres.log.some((l) => l.text.includes('rien à manipuler'))).toBe(true);
  });
});

describe('eau profonde', () => {
  const mare = (): Encounter => {
    const enc = emptyEncounter('Gué');
    enc.terrain = { '1,0': 'eau-profonde', '2,0': 'eau' };
    return enc;
  };

  it('barre la route à qui ne sait pas nager', () => {
    const terrain = terrainFor(mare(), mkUnit({ id: 'a', name: 'A', team: 'allies' }));
    expect(blocksMovement(terrain, '1,0')).toBe(true);
  });

  it('se traverse lentement pour un nageur', () => {
    const nageur = mkUnit({ id: 'b', name: 'B', team: 'allies', canSwim: true });
    const terrain = terrainFor(mare(), nageur);
    expect(blocksMovement(terrain, '1,0')).toBe(false);
    expect(moveCostOf(terrain, '1,0')).toBe(2);
  });

  it('laisse l’eau peu profonde ouverte à tout le monde', () => {
    const terrain = terrainFor(mare(), mkUnit({ id: 'c', name: 'C', team: 'allies' }));
    expect(blocksMovement(terrain, '2,0')).toBe(false);
  });

  it('ne dépend pas du nageur pour la ligne de vue', () => {
    // On voit par-dessus l'eau, qu'on sache nager ou non.
    expect(blocksSight(terrainFor(mare()), '1,0')).toBe(false);
  });

  it('laisse le MJ trancher qui sait nager', () => {
    const enc = emptyEncounter('Gué');
    enc.combatants = [mkUnit({ id: 'a', name: 'A', team: 'allies' })];
    const apres = applyAction(enc, { type: 'setSwim', actorId: 'a', canSwim: true });
    expect(apres.combatants[0].canSwim).toBe(true);
  });
});

/* ── Marcher hors combat ───────────────────────────────────────────────────
   Le camp n'est ni du combat au ralenti, ni le montage : il a sa règle. Pas de
   budget ni de souffle, mais le décor s'applique intégralement.
─────────────────────────────────────────────────────────────────────────── */

describe('marcher hors combat', () => {
  /** Un mur en x=1 qui coupe la carte en deux, un personnage à gauche. */
  function cloison(over: Partial<Combatant> = {}, terrain: Record<string, string> = {}): Encounter {
    const enc = emptyEncounter('Camp');
    enc.phase = 'exploration';
    enc.started = true;
    enc.grid = { width: 6, height: 3 };
    enc.terrain = { '1,0': 'mur', '1,1': 'mur', '1,2': 'mur', ...terrain };
    enc.combatants = [
      mkUnit({ id: 'pc', name: 'Kael', team: 'allies', pos: { x: 0, y: 0 }, ...over }),
    ];
    return enc;
  }

  it('ne traverse pas les murs', () => {
    const enc = applyAction(cloison(), { type: 'walk', actorId: 'pc', to: { x: 3, y: 1 } });
    expect(enc.combatants[0].pos).toEqual({ x: 0, y: 0 });
    expect(enc.log.some((l) => l.text.includes('chemin est barré'))).toBe(true);
  });

  it('se déplace librement là où le chemin existe', () => {
    const enc = applyAction(cloison(), { type: 'walk', actorId: 'pc', to: { x: 0, y: 2 } });
    expect(enc.combatants[0].pos).toEqual({ x: 0, y: 2 });
  });

  it('ne coûte ni souffle ni budget : la traversée est gratuite', () => {
    const enc = applyAction(cloison(), { type: 'walk', actorId: 'pc', to: { x: 0, y: 2 } });
    const kael = enc.combatants[0];
    expect(kael.endurance).toBe(20);
    expect(kael.moved).toBe(0);
  });

  it('passe une porte ouverte, pas une porte fermée', () => {
    const avecPorte = () => cloison({}, { '1,1': 'porte' });

    const ferme = applyAction(avecPorte(), { type: 'walk', actorId: 'pc', to: { x: 2, y: 1 } });
    expect(ferme.combatants[0].pos).toEqual({ x: 0, y: 0 });

    let ouvert = applyAction(avecPorte(), { type: 'walk', actorId: 'pc', to: { x: 0, y: 1 } });
    ouvert = applyAction(ouvert, { type: 'door', cell: '1,1', act: 'open', actorId: 'pc' });
    ouvert = applyAction(ouvert, { type: 'walk', actorId: 'pc', to: { x: 2, y: 1 } });
    expect(ouvert.combatants[0].pos).toEqual({ x: 2, y: 1 });
  });

  it('arrête devant l’eau profonde qui ne sait pas nager', () => {
    const enc = cloison({}, { '1,0': 'eau-profonde', '1,1': 'eau-profonde', '1,2': 'eau-profonde' });
    const pied = applyAction(enc, { type: 'walk', actorId: 'pc', to: { x: 2, y: 0 } });
    expect(pied.combatants[0].pos).toEqual({ x: 0, y: 0 });

    const nageur = applyAction(
      { ...enc, combatants: [{ ...enc.combatants[0], canSwim: true }] },
      { type: 'walk', actorId: 'pc', to: { x: 2, y: 0 } },
    );
    expect(nageur.combatants[0].pos).toEqual({ x: 2, y: 0 });
  });

  it('ne déplace pas un corps à terre', () => {
    const enc = applyAction(cloison({ down: true, hp: 0 }), {
      type: 'walk',
      actorId: 'pc',
      to: { x: 0, y: 2 },
    });
    expect(enc.combatants[0].pos).toEqual({ x: 0, y: 0 });
  });
});

describe('reprendre le combat depuis le camp', () => {
  const table = (): Encounter => {
    const enc = emptyEncounter('Route');
    enc.phase = 'exploration';
    enc.started = true;
    enc.round = 4;
    enc.combatants = [
      mkUnit({ id: 'pc', name: 'Kael', team: 'allies' }),
      mkUnit({ id: 'orc', name: 'Orc', team: 'ennemis', pos: { x: 5, y: 5 } }),
    ];
    return enc;
  };

  it('relance l’initiative pour une nouvelle empoignade', () => {
    const enc = applyAction(table(), { type: 'start' });
    expect(phaseOf(enc)).toBe('combat');
    expect(enc.round).toBe(1);
    expect(enc.order.length).toBe(2);
    expect(enc.log.some((l) => l.text.includes('Nouvelle empoignade'))).toBe(true);
  });

  it('ne relance rien au milieu d’un combat déjà en cours', () => {
    const enc = table();
    enc.phase = 'combat';
    enc.round = 4;
    expect(applyAction(enc, { type: 'start' }).round).toBe(4);
  });
});

describe('La cueillette', () => {
  it('couvre exactement 100 %', () => {
    expect(FORAGE_TOTAL).toBe(100);
  });

  it('découpe le d100 : bredouille, baies, puis les herbes de plus en plus rares', () => {
    expect(forageOutcome(20).key).toBe('bredouille');
    expect(forageOutcome(21).nourishment!.name).toBe('Petite ration');
    expect(forageOutcome(56).resource).toBe('Herbes médicinales');
    expect(forageOutcome(100 + 30).key).toBe('racine');
  });

  it('fait passer le temps et range la trouvaille dans le sac du cueilleur', () => {
    const avant = camp({ skills: { nature: 40 } });
    const apres = applyAction(avant, { type: 'forage', actorId: 'pc' });
    expect(clockOf(apres)).toEqual(advanceClock(clockOf(avant), FORAGE_SECONDS));
    // +40 : le pire jet dépasse la bande « bredouille ».
    expect(apres.combatants[0].inventory.length).toBe(1);
    expect(apres.log.some((l) => l.text.startsWith('Kael revient de la cueillette'))).toBe(true);
  });
});

describe('Les tours de garde', () => {
  it('laisse veiller l’un pendant que l’autre dort', () => {
    // Deux membres du groupe : Kael veille, Mira dort.
    let enc = camp({}, { id: 'mira', name: 'Mira', team: 'allies', down: false, hp: 40, survival: freshSurvival() });
    // Une longue marche d'abord : la fatigue est une dette, il faut qu'il y en ait une.
    enc = applyAction(enc, { type: 'passTime', seconds: DAY, activity: 'route' });
    enc = applyAction(enc, { type: 'passTime', seconds: NIGHT_SECONDS, activity: 'sommeil', individual: { pc: 'veille' } });

    const kael = enc.combatants.find((c) => c.id === 'pc')!;
    const mira = enc.combatants.find((c) => c.id === 'mira')!;
    expect(pts('rest', kael.survival)).toBeLessThan(pts('rest', mira.survival));
    expect(enc.log.some((l) => l.text.includes('Kael : veille'))).toBe(true);
  });
});

describe('Se refaire au camp', () => {
  const sommeil = activityByKey('sommeil')!;
  const repos = activityByKey('repos')!;
  const veille = activityByKey('veille')!;
  const blesse = { hp: 4, maxHp: 40, mana: 0, maxMana: 20, endurance: 0, maxEndurance: 20 };

  it('rend l’Endurance en une heure de calme, au repos comme en dormant', () => {
    expect(restRecovery(repos, HOUR, blesse).endurance).toBe(20);
    expect(restRecovery(repos, HOUR / 2, blesse).endurance).toBe(10);
  });

  it('referme les plaies, mais jamais au-delà de la moitié des PV', () => {
    expect(restRecovery(repos, HOUR, blesse).hp).toBe(6); // 5 % de 40
    expect(restRecovery(sommeil, HOUR, blesse).hp).toBe(8); // 10 % de 40
    expect(restRecovery(sommeil, NIGHT_SECONDS, blesse).hp).toBe(20);
    // Déjà au-dessus de la mi-santé : rien ne bouge, et rien ne baisse.
    expect(restRecovery(sommeil, NIGHT_SECONDS, { ...blesse, hp: 30 }).hp).toBe(30);
  });

  it('rend la mana surtout en dormant, au prorata, et un filet au repos', () => {
    expect(restRecovery(repos, HOUR, blesse).mana).toBe(1); // 5 % de 20
    expect(restRecovery(repos, 10 * HOUR, blesse).mana).toBe(10);
    expect(restRecovery(sommeil, NIGHT_SECONDS / 2, blesse).mana).toBe(10);
    expect(restRecovery(sommeil, NIGHT_SECONDS, blesse).mana).toBe(20);
  });

  it('ne rend rien à qui veille', () => {
    expect(restRecovery(veille, NIGHT_SECONDS, blesse)).toEqual(blesse);
  });

  it('applique la récupération au passage du temps, et la journalise', () => {
    let enc = camp({ hp: 4, mana: 0, endurance: 0 });
    enc = applyAction(enc, { type: 'passTime', seconds: NIGHT_SECONDS, activity: 'sommeil' });
    const kael = enc.combatants[0];
    expect(kael.hp).toBe(Math.floor(kael.base.hp / 2));
    expect(kael.mana).toBe(effectiveStat(kael, 'mana'));
    expect(enc.log.some((l) => l.text.startsWith('Kael récupère'))).toBe(true);
  });
});

describe('S’entraîner à la clairière', () => {
  const sort: CombatAbility = {
    id: 'spell:trait',
    ref: 'light-trait',
    name: 'Trait de lumière',
    kind: 'spell',
    rangeMeters: 12,
    shape: { kind: 'targets', count: 1 },
    targets: ['enemy'],
    manaCost: 6,
    enduranceCost: 0,
    damages: [],
  } as CombatAbility;

  it('fait payer la mana du sort à chaque séance', () => {
    let enc = camp({ abilities: [sort], mana: 10 });
    enc = applyAction(enc, { type: 'trainSpell', actorId: 'pc', ref: 'light-trait', delta: 1 });
    expect(enc.combatants[0].mana).toBe(4);
    expect(enc.combatants[0].spellTraining).toEqual({ 'light-trait': 1 });
  });

  it('refuse la séance sans la mana pour lancer le sort', () => {
    let enc = camp({ abilities: [sort], mana: 5 });
    enc = applyAction(enc, { type: 'trainSpell', actorId: 'pc', ref: 'light-trait', delta: 1 });
    expect(enc.combatants[0].mana).toBe(5);
    expect(enc.combatants[0].spellTraining ?? {}).toEqual({});
  });

  it('rend la mana d’une séance retirée', () => {
    let enc = camp({ abilities: [sort], mana: 10 });
    enc = applyAction(enc, { type: 'trainSpell', actorId: 'pc', ref: 'light-trait', delta: 1 });
    enc = applyAction(enc, { type: 'trainSpell', actorId: 'pc', ref: 'light-trait', delta: -1 });
    expect(enc.combatants[0].mana).toBe(10);
    expect(enc.combatants[0].spellTraining).toEqual({});
  });
});

describe('Les pièges du camp', () => {
  const avecPieges = () =>
    camp({
      inventory: [
        { name: 'Fil de soie et clochette', qty: 1, kind: 'other' },
        { name: 'Chausse-trappes', qty: 2, kind: 'other' },
      ],
    });

  it('pose un piège pris au sac', () => {
    let enc = avecPieges();
    enc = applyAction(enc, { type: 'campTrap', act: 'set', actorId: 'pc', item: 'Fil de soie et clochette' });
    enc = applyAction(enc, { type: 'campTrap', act: 'set', actorId: 'pc', item: 'Chausse-trappes' });
    expect(enc.campTraps?.length).toBe(2);
    expect(carriedQty(enc.combatants[0], 'Fil de soie et clochette')).toBe(0);
  });

  it('se déclenche sur un intrus, puis se réarme', () => {
    let enc = applyAction(avecPieges(), { type: 'campTrap', act: 'set', actorId: 'pc', item: 'Chausse-trappes' });
    const id = enc.campTraps![0].id;
    enc = applyAction(enc, { type: 'campTrap', act: 'spring', trapId: id });
    expect(enc.campTraps![0].sprung).toBe(true);
    expect(enc.log.some((l) => l.text === 'Chausse-trappes se déclenche !')).toBe(true);
    enc = applyAction(enc, { type: 'campTrap', act: 'rearm', trapId: id });
    expect(enc.campTraps![0].sprung).toBe(false);
  });

  it('rend les pièges relevés au sac de qui les a posés', () => {
    let enc = applyAction(avecPieges(), { type: 'campTrap', act: 'set', actorId: 'pc', item: 'Chausse-trappes' });
    enc = applyAction(enc, { type: 'campTrap', act: 'liftAll' });
    expect(enc.campTraps).toBeUndefined();
    expect(carriedQty(enc.combatants[0], 'Chausse-trappes')).toBe(2);
  });
});

describe('Se servir du sac au camp', () => {
  const potion = {
    id: 'item:potion',
    name: 'Potion de soin',
    kind: 'item',
    rangeMeters: 1.5,
    shape: { kind: 'targets', count: 1 },
    targets: ['self', 'ally'],
    manaCost: 0,
    enduranceCost: 0,
    damages: [],
    autoHit: true,
    heal: 7,
    consumes: { item: 'Potion de soin', qty: 1 },
  } as CombatAbility;

  it('soigne un compagnon à l’autre bout du camp : autour du feu, tout est à portée', () => {
    let enc = camp(
      { abilities: [potion], inventory: [{ name: 'Potion de soin', qty: 1, kind: 'consumable' }] },
      { id: 'mira', name: 'Mira', team: 'allies', down: false, hp: 10, pos: { x: 8, y: 0 } },
    );
    enc = applyAction(enc, { type: 'campUse', actorId: 'pc', abilityId: 'item:potion', targetId: 'mira' });
    expect(enc.combatants.find((c) => c.id === 'mira')!.hp).toBe(17);
    expect(carriedQty(enc.combatants[0], 'Potion de soin')).toBe(0);
    // Pas de tour hors combat : les créneaux restent libres.
    expect(enc.combatants[0].actionUsed).toBe(false);
  });

  it('refuse en plein combat', () => {
    const enc = camp({ abilities: [potion], inventory: [{ name: 'Potion de soin', qty: 1, kind: 'consumable' }] });
    enc.phase = 'combat';
    const apres = applyAction(enc, { type: 'campUse', actorId: 'pc', abilityId: 'item:potion' });
    expect(carriedQty(apres.combatants[0], 'Potion de soin')).toBe(1);
  });
});

describe('Le piège à mâchoires en forêt', () => {
  const trappeur = (over: Partial<Combatant> = {}) =>
    camp({ inventory: [{ name: 'Piège à mâchoires', qty: 1, kind: 'other' }], ...over });

  it('couvre exactement 100 %', () => {
    expect(SNARE_TOTAL).toBe(100);
    expect(snareOutcome(40).nourishment).toBeUndefined();
    expect(snareOutcome(41).nourishment!.name).toBe('Petite ration');
  });

  it('se pose en forêt : il quitte le sac et le temps passe', () => {
    const avant = trappeur();
    const apres = applyAction(avant, { type: 'snare', act: 'set', actorId: 'pc' });
    expect(apres.snares?.length).toBe(1);
    expect(carriedQty(apres.combatants[0], 'Piège à mâchoires')).toBe(0);
    expect(clockOf(apres)).toEqual(advanceClock(clockOf(avant), SNARE_SET_SECONDS));
  });

  it('ne rend rien si l’on va voir trop tôt, et reste armé', () => {
    let enc = applyAction(trappeur({ skills: { nature: 80 } }), { type: 'snare', act: 'set', actorId: 'pc' });
    enc = applyAction(enc, { type: 'snare', act: 'check', actorId: 'pc', snareId: enc.snares![0].id });
    expect(enc.snares?.length).toBe(1);
    expect(enc.combatants[0].inventory.filter((i) => i.qty > 0)).toEqual([]);
  });

  it('rend une prise une fois le temps passé, et se réarme sur place', () => {
    let enc = applyAction(trappeur({ skills: { nature: 80 } }), { type: 'snare', act: 'set', actorId: 'pc' });
    enc = applyAction(enc, { type: 'passTime', seconds: SNARE_WAIT_SECONDS, activity: 'repos' });
    const id = enc.snares![0].id;
    enc = applyAction(enc, { type: 'snare', act: 'check', actorId: 'pc', snareId: id });
    // +80 de Nature : le pire jet dépasse la bande « vide ».
    expect(carriedQty(enc.combatants[0], 'Petite ration') + carriedQty(enc.combatants[0], 'Rations de voyage')).toBe(1);
    expect(enc.snares![0].setAt).toBe(absoluteSeconds(clockOf(enc)));
  });

  it('revient au sac quand on le rapporte', () => {
    let enc = applyAction(trappeur(), { type: 'snare', act: 'set', actorId: 'pc' });
    const avant = enc;
    enc = applyAction(enc, { type: 'snare', act: 'lift', actorId: 'pc', snareId: enc.snares![0].id });
    expect(enc.snares).toBeUndefined();
    expect(carriedQty(enc.combatants[0], 'Piège à mâchoires')).toBe(1);
    expect(clockOf(enc)).toEqual(advanceClock(clockOf(avant), SNARE_CHECK_SECONDS));
  });
});
