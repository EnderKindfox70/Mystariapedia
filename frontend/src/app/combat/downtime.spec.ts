import { describe, expect, it } from 'vitest';
import { AttributeKey, CharacterSheet, StatKey } from '../character/character.types';
import { emptySheet, SURVIVAL_GAUGES } from '../character/universe-data';
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
import { Affinities, Combatant, Encounter, Team } from './combat.types';
import { Rng } from './dice';
import { emptyEncounter, migrateEncounter } from './encounter';
import { carriedAsLoot, pileSize, rollDrops } from './loot';
import { applyAction, carriedQty, clockOf, effectiveStat, phaseOf, terrainFor } from './rules';
import { blocksMovement, blocksSight, DoorState, moveCostOf, newDoor } from './terrain';
import { applyReport, diffAgainstSheet, summarize } from './sheet-report';
import {
  activityByKey,
  drain,
  elapsedForNotches,
  EMPTY_WATERSKIN,
  freshSurvival,
  gaugeOf,
  HUNT_TOTAL,
  huntBonus,
  huntOutcome,
  NOTCH_SECONDS,
  notchesLeft,
  nourishmentOf,
  restore,
  survivalFromNotches,
  survivalMods,
  survivalToNotches,
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

  it('enjambe minuit en changeant de jour', () => {
    const soir = { day: 3, seconds: 23 * HOUR };
    expect(advanceClock(soir, 2 * HOUR)).toEqual({ day: 4, seconds: HOUR });
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
  });

  it('couvre la journée entière, sans trou ni chevauchement', () => {
    for (let h = 0; h < 24; h++) {
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

describe('jauges de survie', () => {
  it('part pleine et se vide au rythme annoncé', () => {
    const route = activityByKey('route')!;
    let state = freshSurvival();
    expect(notchesLeft('thirst', state)).toBe(4);

    state = drain(state, 4 * HOUR, route);
    expect(notchesLeft('thirst', state)).toBe(3);

    state = drain(state, 12 * HOUR, route);
    expect(notchesLeft('thirst', state)).toBe(0);
  });

  it('ne perd rien à découper le temps en tranches', () => {
    const route = activityByKey('route')!;
    const gros = drain(freshSurvival(), 2 * HOUR, route);

    let petit = freshSurvival();
    for (let i = 0; i < 12; i++) petit = drain(petit, 10 * MINUTE, route);

    expect(petit).toEqual(gros);
  });

  it('ne s’enfonce pas sous zéro : trois jours de jeûne se rattrapent en un repas', () => {
    const route = activityByKey('route')!;
    const affame = drain(freshSurvival(), 10 * DAY, route);
    const plafond = 6 * NOTCH_SECONDS['hunger'];
    expect(affame.hunger).toBe(plafond);
    expect(notchesLeft('hunger', restore(affame, 'hunger', 6))).toBe(6);
  });

  it('ne déborde pas au-dessus du plein', () => {
    const repu = restore(freshSurvival(), 'hunger', 99);
    expect(repu.hunger).toBe(0);
  });

  it('rend une nuit de huit heures suffisante pour effacer une journée debout', () => {
    const veille = activityByKey('veille')!;
    const sommeil = activityByKey('sommeil')!;
    let state = drain(freshSurvival(), 20 * HOUR, veille);
    expect(notchesLeft('rest', state)).toBe(0);

    state = drain(state, 8 * HOUR, sommeil);
    expect(notchesLeft('rest', state)).toBe(5);
  });

  it('use la soif trois fois plus vite au combat qu’en marchant', () => {
    const route = drain(freshSurvival(), HOUR, activityByKey('route')!);
    const combat = drain(freshSurvival(), HOUR, activityByKey('combat')!);
    expect(combat.thirst).toBe(route.thirst * 3);
  });

  it('fait l’aller-retour avec les crans stockés sur la fiche', () => {
    const crans = { hunger: 4, thirst: 2, rest: 5 };
    expect(survivalToNotches(survivalFromNotches(crans))).toEqual(crans);
  });

  it('repart d’une jauge pleine pour une fiche qui n’en portait pas', () => {
    expect(survivalToNotches(survivalFromNotches(undefined))).toEqual({
      hunger: 6,
      thirst: 4,
      rest: 5,
    });
  });

  it('convertit les crans en temps écoulé de façon cohérente', () => {
    for (const gauge of SURVIVAL_GAUGES) {
      for (let n = 0; n <= gauge.segments; n++) {
        const state = { ...freshSurvival(), [gauge.key]: elapsedForNotches(gauge.key, n) };
        expect(notchesLeft(gauge.key, state)).toBe(n);
      }
    }
  });
});

/* ── Ce que le vide coûte ──────────────────────────────────────────────────── */

describe('malus de survie', () => {
  it('ne coûte rien tant que les jauges tiennent', () => {
    expect(survivalMods(freshSurvival())).toEqual([]);
  });

  it('pèse sur les stats effectives dès qu’une jauge se vide', () => {
    const repu = mkUnit({ id: 'a', name: 'A', team: 'allies', survival: freshSurvival() });
    const assoiffe = mkUnit({
      id: 'b',
      name: 'B',
      team: 'allies',
      survival: survivalFromNotches({ hunger: 6, thirst: 0, rest: 5 }),
    });

    expect(effectiveStat(repu, 'def_phy')).toBe(10);
    expect(effectiveStat(assoiffe, 'def_phy')).toBe(7);
    expect(effectiveStat(assoiffe, 'speed')).toBe(8);
  });

  it('cumule les trois besoins', () => {
    const epuise = mkUnit({
      id: 'c',
      name: 'C',
      team: 'allies',
      survival: survivalFromNotches({ hunger: 0, thirst: 0, rest: 0 }),
    });
    // Endurance : −3 (faim) −4 (soif) −2 (sommeil).
    expect(effectiveStat(epuise, 'endurance')).toBe(20 - 9);
  });

  it('ne touche pas une créature, qui ne tient aucune jauge', () => {
    const bete = mkUnit({ id: 'w', name: 'Loup', team: 'ennemis' });
    expect(effectiveStat(bete, 'def_phy')).toBe(10);
  });

  it('ne descend jamais une stat sous zéro', () => {
    const frele = mkUnit({
      id: 'd',
      name: 'D',
      team: 'allies',
      base: STATS({ speed: 1, def_phy: 1 }),
      survival: survivalFromNotches({ hunger: 0, thirst: 0, rest: 0 }),
    });
    expect(effectiveStat(frele, 'speed')).toBe(0);
    expect(effectiveStat(frele, 'def_phy')).toBe(0);
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

  it('use les jauges du groupe, et le journal le dit', () => {
    const after = applyAction(camp(), { type: 'passTime', seconds: 8 * HOUR, activity: 'route' });
    const kael = after.combatants.find((c) => c.id === 'pc')!;
    expect(notchesLeft('thirst', kael.survival)).toBe(2);
    expect(after.log.some((l) => l.kind === 'survival')).toBe(true);
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
    enc = applyAction(enc, { type: 'passTime', seconds: 12 * HOUR, activity: 'route' });
    enc = applyAction(enc, { type: 'restore', gauge: 'thirst', notches: 4, source: 'la rivière' });
    expect(notchesLeft('thirst', enc.combatants[0].survival)).toBe(4);
  });

  it('consomme une ration du sac et la retire', () => {
    let enc = camp({ inventory: [{ name: 'Rations de voyage', qty: 2, kind: 'other' }] });
    enc = applyAction(enc, { type: 'passTime', seconds: 24 * HOUR, activity: 'route' });
    enc = applyAction(enc, { type: 'eat', actorId: 'pc', item: 'Rations de voyage' });

    const kael = enc.combatants[0];
    expect(notchesLeft('hunger', kael.survival)).toBe(6);
    expect(kael.inventory.find((i) => i.name === 'Rations de voyage')!.qty).toBe(1);
  });

  it('vide l’outre plutôt que de la faire disparaître du sac', () => {
    let enc = camp({ inventory: [{ name: 'Outre en peau', qty: 1, kind: 'other' }] });
    enc = applyAction(enc, { type: 'passTime', seconds: 12 * HOUR, activity: 'route' });
    enc = applyAction(enc, { type: 'eat', actorId: 'pc', item: 'Outre en peau' });

    const kael = enc.combatants[0];
    expect(notchesLeft('thirst', kael.survival)).toBe(4);
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
    // Une ration de voyage vaut UNE journée, comme l'écrit sa fiche ; la petite
    // en est le tiers, la grande vaut les deux jours de la jauge entière.
    expect(nourishmentOf({ name: 'Petite ration' })!.notches).toBe(1);
    expect(nourishmentOf({ name: 'Rations de voyage' })!.notches).toBe(3);
    expect(nourishmentOf({ name: 'Grande ration' })!.notches).toBe(6);
    expect(gaugeOf('hunger').segments).toBe(6);
  });

  it('ne comble qu’un cran avec une petite ration', () => {
    let enc = camp({ inventory: [{ name: 'Petite ration', qty: 1, kind: 'other' }] });
    enc = applyAction(enc, { type: 'passTime', seconds: 24 * HOUR, activity: 'route' });
    expect(notchesLeft('hunger', enc.combatants[0].survival)).toBe(3);

    enc = applyAction(enc, { type: 'eat', actorId: 'pc', item: 'Petite ration' });
    expect(notchesLeft('hunger', enc.combatants[0].survival)).toBe(4);
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
    expect(notchesLeft('hunger', kael.survival)).toBe(6);
    expect(kael.inventory.find((i) => i.name === 'Grande ration')).toBeUndefined();
    expect(kael.inventory.find((i) => i.name === 'Petite ration')!.qty).toBe(1);
  });

  it('le ravitaillement rapporte des vivres, pas de la satiété', () => {
    let enc = camp();
    enc = applyAction(enc, { type: 'passTime', seconds: 24 * HOUR, activity: 'route' });
    const avant = notchesLeft('hunger', enc.combatants[0].survival);

    enc = applyAction(enc, {
      type: 'provision',
      item: 'Grande ration',
      qty: 1,
      actorId: 'pc',
      source: 'achat à l’étape',
    });

    const kael = enc.combatants[0];
    // La jauge n'a pas bougé : c'est le SAC qui s'est rempli. Il reste à manger.
    expect(notchesLeft('hunger', kael.survival)).toBe(avant);
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
    let enc = camp({ inventory: [{ name: 'Rations de voyage', qty: 3, kind: 'other' }] });
    enc = applyAction(enc, { type: 'passTime', seconds: 24 * HOUR, activity: 'route' });
    enc = applyAction(enc, { type: 'meal', gauge: 'hunger', team: 'allies' });

    const kael = enc.combatants[0];
    expect(notchesLeft('hunger', kael.survival)).toBe(6);
    expect(kael.inventory.find((i) => i.name === 'Rations de voyage')!.qty).toBe(2);
  });

  it('nomme au journal ceux qui n’ont rien à manger', () => {
    let enc = camp({ inventory: [] });
    enc = applyAction(enc, { type: 'passTime', seconds: 24 * HOUR, activity: 'route' });
    enc = applyAction(enc, { type: 'meal', gauge: 'hunger', team: 'allies' });

    expect(notchesLeft('hunger', enc.combatants[0].survival)).toBe(3);
    expect(enc.log.some((l) => l.text.includes('Rien à manger pour Kael'))).toBe(true);
  });

  it('ne nourrit pas les adversaires avec le repas du groupe', () => {
    // Un adversaire qui tient ses jauges : un humanoïde monté depuis une fiche.
    let enc = camp({}, { down: false, hp: 40, survival: freshSurvival() });
    enc = applyAction(enc, { type: 'passTime', seconds: 12 * HOUR, activity: 'route' });
    enc = applyAction(enc, {
      type: 'restore',
      gauge: 'thirst',
      notches: 4,
      team: 'allies',
      source: 'la source',
    });

    expect(notchesLeft('thirst', enc.combatants[0].survival)).toBe(4);
    expect(notchesLeft('thirst', enc.combatants[1].survival)).toBe(1);
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
      notches: 1,
    });
    expect(notchesLeft('rest', after.combatants[0].survival)).toBe(1);
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
    survival: { hunger: 6, thirst: 4, rest: 5 },
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

  it('annonce les crans de jauge perdus', () => {
    const use = pion({ survival: survivalFromNotches({ hunger: 6, thirst: 1, rest: 5 }) });
    const report = diffAgainstSheet(use, sheet(), 's1');
    expect(report.changed).toBe(true);
    expect(report.gauges).toEqual([
      { key: 'thirst', label: 'Soif', from: 4, to: 1, stage: 'Assoiffé' },
    ]);
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
      survival: survivalFromNotches({ hunger: 3, thirst: 4, rest: 5 }),
      inventory: [
        { name: 'Flèche', qty: 14, kind: 'ammunition' },
        { name: 'Croc de loup', qty: 3, kind: 'other' },
      ],
      purse: 48,
    });
    const report = diffAgainstSheet(use, base, 's1');
    const next = applyReport(base, report, use, (name) => (name === 'Croc de loup' ? 0.1 : 0));

    expect(next.survival).toEqual({ hunger: 3, thirst: 4, rest: 5 });
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
    const ancienne = sheet({ survival: undefined });
    expect(diffAgainstSheet(pion(), ancienne, 's1').gauges).toEqual([]);
  });

  it('résume la ligne en une phrase lisible', () => {
    const use = pion({ survival: survivalFromNotches({ hunger: 6, thirst: 2, rest: 5 }), purse: 40 });
    expect(summarize(diffAgainstSheet(use, sheet(), 's1'))).toBe('soif 4 → 2 · +10 po');
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
