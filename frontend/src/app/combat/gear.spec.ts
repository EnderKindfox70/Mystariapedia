import { describe, expect, it } from 'vitest';
import chausseFiche from '../../../public/resources/json/equipment/chausse-trappes.json';
import entravesFiche from '../../../public/resources/json/equipment/entraves-de-fer.json';
import equipmentIndex from '../../../public/resources/json/equipment/index.json';
import filetFiche from '../../../public/resources/json/equipment/filet-leste.json';
import huileFiche from '../../../public/resources/json/equipment/fiole-d-huile.json';
import machoiresFiche from '../../../public/resources/json/equipment/piege-a-machoires.json';
import selsFiche from '../../../public/resources/json/equipment/sels-odorants.json';
import torcheFiche from '../../../public/resources/json/equipment/torche.json';
import { AttributeKey, CharacterSheet, StatKey } from '../character/character.types';
import { careAbility, CareSource, gearAbility, GearUseSource } from './abilities';
import { absorbUses, remainingUses, spendUse, usesLabel } from './charges';
import { Affinities, CarriedItem, CombatAbility, Combatant, Encounter, Team } from './combat.types';
import { emptyEncounter } from './encounter';
import { groundAt } from './ground';
import { applyAction, findUnit } from './rules';
import { applyReport, diffAgainstSheet } from './sheet-report';
import { freshSurvival, HUNT_TABLE, SEGMENT_SECONDS } from './survival';

/* ──────────────────────────────────────────────────────────────────────────
   LES OBJETS DU SAC

   Deux choses à tenir :
   - un objet à plusieurs usages s'ENTAME au lieu de disparaître (un lot de
     rations de voyage vaut sept jours, un flacon de sels trois doses) ;
   - ce que la fiche wiki d'un objet écrit en français se joue : la torche
     frappe et brûle, le filet immobilise et retombe, les chausse-trappes et
     les mâchoires attendent qu'on marche dessus.
─────────────────────────────────────────────────────────────────────────── */

const gear = (fiche: { name: string; use?: unknown }, slug: string): GearUseSource => ({
  name: fiche.name,
  slug,
  ...(fiche.use as object),
});

const TORCHE = gear(torcheFiche, 'torche');
const FILET = gear(filetFiche, 'filet-leste');
const HUILE = gear(huileFiche, 'fiole-d-huile');
const CHAUSSE = gear(chausseFiche, 'chausse-trappes');
const MACHOIRES = gear(machoiresFiche, 'piege-a-machoires');
const ENTRAVES = gear(entravesFiche, 'entraves-de-fer');
const SELS: CareSource = { name: selsFiche.name, slug: 'sels-odorants', ...(selsFiche.care as object) };

const RATIONS = 'Rations de voyage';

const STATS = (): Record<StatKey, number> => ({
  hp: 40, mana: 10, endurance: 20, speed: 10,
  atk_phy: 15, atk_mag: 10, def_phy: 10, def_mag: 10,
});
const ATTRS = (): Record<AttributeKey, number> => ({
  force: 10, dexterite: 10, constitution: 10, intelligence: 10, sagesse: 10, charisme: 10,
});
const NO_AFFINITY = (): Affinities => ({
  immunities: [], resistances: [], weaknesses: [], absorptions: [],
});

function mkUnit(id: string, team: Team, over: Partial<Combatant> = {}): Combatant {
  const base = STATS();
  return {
    origin: { kind: 'custom' },
    footprint: 1,
    pos: { x: 0, y: 0 },
    attributes: ATTRS(),
    proficiency: 2,
    id,
    name: id,
    team,
    base,
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
  } as unknown as Combatant;
}

/** Une rencontre lancée, le tour donné à `turnOf`. */
function fight(units: Combatant[], turnOf: string, seed = 7): Encounter {
  let enc = emptyEncounter('Test');
  enc.seed = seed;
  enc.combatants = units;
  enc = applyAction(enc, { type: 'start' });
  enc.order = [turnOf];
  enc.turnIndex = 0;
  return enc;
}

/** Une halte hors combat : on prépare, on mange, on pose des pièges. */
function halt(units: Combatant[]): Encounter {
  const enc = emptyEncounter('Camp');
  enc.seed = 42;
  enc.phase = 'exploration';
  enc.combatants = units;
  return enc;
}

const hasStatus = (unit: Combatant | undefined, key: string): boolean =>
  !!unit?.statuses.some((s) => s.key === key);

/* ── Les usages ────────────────────────────────────────────────────────────── */

describe('objets à plusieurs usages', () => {
  const lot = (qty: number, usesLeft?: number): CarriedItem => ({
    name: RATIONS,
    qty,
    kind: 'other',
    ...(usesLeft !== undefined ? { usesLeft } : {}),
  });

  it('un lot de rations vaut sept jours, d’après sa fiche', () => {
    const entree = equipmentIndex.find((e) => e.slug === 'rations-de-voyage') as { uses?: number };
    expect(entree.uses).toBe(7);
    expect(remainingUses(lot(2))).toBe(14);
    expect(remainingUses(lot(2, 3))).toBe(10);
  });

  it('s’entame avant de disparaître', () => {
    const ligne = lot(1);
    for (let jour = 1; jour <= 6; jour++) {
      expect(spendUse(ligne)).toBe(false);
      expect(ligne.qty).toBe(1);
    }
    expect(ligne.usesLeft).toBe(1);
    expect(usesLabel(ligne)).toBe('1/7');
    // Le septième jour vide le lot.
    expect(spendUse(ligne)).toBe(true);
    expect(ligne.qty).toBe(0);
  });

  it('transvase deux lots entamés au lieu d’en garder deux ouverts', () => {
    const ligne = lot(1, 5);
    absorbUses(ligne, 1, 4);
    // 5 + 4 = 9 jours : un lot plein et un lot entamé à 2.
    expect(ligne.qty).toBe(2);
    expect(ligne.usesLeft).toBe(2);
  });
});

describe('manger une ration de voyage', () => {
  it('ne jette pas le lot : elle retire une des sept journées', () => {
    let enc = halt([
      mkUnit('pc', 'allies', {
        survival: freshSurvival(),
        inventory: [{ name: RATIONS, qty: 1, kind: 'other' }],
      }),
    ]);
    enc = applyAction(enc, { type: 'passTime', seconds: 4 * SEGMENT_SECONDS, activity: 'route' });
    enc = applyAction(enc, { type: 'eat', actorId: 'pc', item: RATIONS });

    const ligne = findUnit(enc, 'pc')!.inventory.find((i) => i.name === RATIONS)!;
    expect(ligne.qty).toBe(1);
    expect(ligne.usesLeft).toBe(6);
  });

  it('ne quitte le sac qu’au septième repas', () => {
    let enc = halt([
      mkUnit('pc', 'allies', {
        survival: freshSurvival(),
        inventory: [{ name: RATIONS, qty: 1, kind: 'other' }],
      }),
    ]);
    for (let i = 0; i < 7; i++) enc = applyAction(enc, { type: 'eat', actorId: 'pc', item: RATIONS });
    expect(findUnit(enc, 'pc')!.inventory.find((i) => i.name === RATIONS)).toBeUndefined();
  });

  it('un chevreuil rapporte UNE journée, pas un lot de sept', () => {
    const median = HUNT_TABLE.find((o) => o.key === 'median')!;
    expect(median.nourishment!.name).toBe(RATIONS);
    expect(median.uses).toBe(1);

    // On cherche une graine qui tire le gibier médian : la chasse est un vrai jet.
    for (let seed = 1; seed < 500; seed++) {
      const enc = halt([mkUnit('pc', 'allies', { survival: freshSurvival() })]);
      enc.seed = seed;
      const apres = applyAction(enc, { type: 'hunt', actorId: 'pc' });
      const ligne = findUnit(apres, 'pc')!.inventory.find((i) => i.name === RATIONS);
      if (!ligne) continue;
      expect(ligne.qty).toBe(1);
      expect(ligne.usesLeft).toBe(1);
      return;
    }
    throw new Error('aucune graine ne donne de gibier médian');
  });

  it('reporte l’entame sur la fiche, et compte l’écart en journées', () => {
    let enc = halt([
      mkUnit('pc', 'allies', {
        survival: freshSurvival(),
        inventory: [{ name: RATIONS, qty: 2, kind: 'other', usesPer: 7 }],
      }),
    ]);
    enc = applyAction(enc, { type: 'eat', actorId: 'pc', item: RATIONS });
    const unit = findUnit(enc, 'pc')!;
    const sheet = {
      inventory: [{ name: RATIONS, qty: 2, weight: 3.5 }],
    } as unknown as CharacterSheet;

    const report = diffAgainstSheet(unit, sheet, 'fiche');
    const change = report.items.find((i) => i.name === RATIONS)!;
    expect(change).toMatchObject({ delta: -1, to: 2, uses: true });

    const next = applyReport(sheet, report, unit, () => 0);
    expect(next.inventory.find((i) => i.name === RATIONS)).toMatchObject({ qty: 2, usesLeft: 6 });
  });
});

describe('sels odorants : trois doses par flacon', () => {
  it('une dose ne jette pas le flacon', () => {
    const ability = careAbility(SELS);
    const medic = mkUnit('medic', 'allies', {
      abilities: [ability],
      inventory: [{ name: SELS.name, qty: 1, kind: 'care', usesPer: 3 }],
    });
    let enc = fight([medic], 'medic');
    const doses: { qty: number; usesLeft?: number }[] = [];
    for (let i = 0; i < 3; i++) {
      findUnit(enc, 'medic')!.actionUsed = false;
      enc = applyAction(enc, { type: 'use', actorId: 'medic', abilityId: ability.id, at: medic.pos });
      const ligne = findUnit(enc, 'medic')!.inventory.find((l) => l.name === SELS.name)!;
      doses.push({ qty: ligne.qty, usesLeft: ligne.usesLeft });
    }
    expect(doses).toEqual([
      { qty: 1, usesLeft: 2 },
      { qty: 1, usesLeft: 1 },
      { qty: 0, usesLeft: undefined },
    ]);
  });
});

/* ── Les objets qui se jouent ─────────────────────────────────────────────── */

describe('objets jouables — catalogue', () => {
  it('se repèrent au tag `use`', () => {
    const tagged = equipmentIndex.filter((e) => e.tags?.includes('use')).map((e) => e.slug).sort();
    expect(tagged).toEqual([
      'chausse-trappes',
      'entraves-de-fer',
      'filet-leste',
      'fiole-d-huile',
      'houlette-de-berger',
      'piege-a-machoires',
      'torche',
    ]);
  });

  it('la torche frappe d’un point contondant et d’un point de feu, sans se consommer', () => {
    const coup = gearAbility(TORCHE);
    expect(coup.damages.map((d) => d.type)).toEqual(['bludgeoning', 'fire']);
    expect(coup.inflicts).toEqual([{ status: 'brulure', chance: 25 }]);
    expect(coup.consumes).toBeUndefined();
    expect(coup.attackAttribute).toBe('force');
  });

  it('les pièges ne ciblent personne : ils se posent', () => {
    const pointes = gearAbility(CHAUSSE);
    expect(pointes.targets).toEqual([]);
    expect(pointes.shape).toEqual({ kind: 'radius', meters: 1.5 });
    expect(pointes.placesHazard?.spec.inflicts?.[0].status).toBe('ralentissement');
    expect(gearAbility(MACHOIRES).outOfCombatOnly).toBe(true);
  });
});

describe('chausse-trappes', () => {
  function traverse(victime: Partial<Combatant>): Encounter {
    const poseur = mkUnit('poseur', 'allies', {
      abilities: [gearAbility(CHAUSSE)],
      inventory: [{ name: CHAUSSE.name, qty: 1, kind: 'other' }],
    });
    const cible = mkUnit('cible', 'ennemis', { pos: { x: 0, y: 4 }, ...victime });
    let enc = fight([poseur, cible], 'poseur');
    enc = applyAction(enc, {
      type: 'use',
      actorId: 'poseur',
      abilityId: gearAbility(CHAUSSE).id,
      at: { x: 2, y: 2 },
    });
    enc.order = ['cible'];
    enc.turnIndex = 0;
    return applyAction(enc, { type: 'move', actorId: 'cible', to: { x: 3, y: 1 } });
  }

  it('couvre une zone, quitte le sac, et ralentit qui la traverse', () => {
    const enc = traverse({});
    expect(enc.hazards?.[0].cells.length).toBe(9);
    expect(findUnit(enc, 'poseur')!.inventory[0].qty).toBe(0);
    const cible = findUnit(enc, 'cible')!;
    expect(hasStatus(cible, 'ralentissement')).toBe(true);
    // Un aventurier chaussé ne saigne pas.
    expect(hasStatus(cible, 'saignement')).toBe(false);
  });

  it('fait saigner les pattes nues d’une bête', () => {
    const cible = findUnit(traverse({ origin: { kind: 'bestiary', slug: 'loup-gris' } }), 'cible')!;
    expect(hasStatus(cible, 'saignement')).toBe(true);
  });

  it('épargne les alliés de qui les a répandues', () => {
    const cible = findUnit(traverse({ team: 'allies' }), 'cible')!;
    expect(hasStatus(cible, 'ralentissement')).toBe(false);
  });
});

describe('piège à mâchoires', () => {
  it('ne s’arme pas en plein combat', () => {
    const poseur = mkUnit('poseur', 'allies', {
      abilities: [gearAbility(MACHOIRES)],
      inventory: [{ name: MACHOIRES.name, qty: 1, kind: 'other' }],
    });
    // Un adversaire en face : sans lui, le combat s'achève aussitôt lancé.
    const garde = mkUnit('garde', 'ennemis', { pos: { x: 8, y: 8 } });
    const enc = applyAction(fight([poseur, garde], 'poseur'), {
      type: 'use',
      actorId: 'poseur',
      abilityId: gearAbility(MACHOIRES).id,
      at: { x: 1, y: 0 },
    });
    expect(enc.hazards).toBeUndefined();
    expect(findUnit(enc, 'poseur')!.inventory[0].qty).toBe(1);
  });

  it('s’arme hors combat, arrête la marche, mord, puis reste au sol', () => {
    const poseur = mkUnit('poseur', 'allies', {
      pos: { x: 2, y: 0 },
      abilities: [gearAbility(MACHOIRES)],
      inventory: [{ name: MACHOIRES.name, qty: 1, kind: 'other' }],
    });
    const proie = mkUnit('proie', 'ennemis', { pos: { x: 0, y: 0 } });
    let enc = halt([poseur, proie]);
    enc = applyAction(enc, { type: 'setHazard', actorId: 'poseur', item: MACHOIRES.name });
    expect(enc.hazards?.length).toBe(1);
    // Le poseur s'éloigne : ses alliés savent où est le piège, lui aussi.
    findUnit(enc, 'poseur')!.pos = { x: 6, y: 6 };

    enc = applyAction(enc, { type: 'start' });
    enc.order = ['proie'];
    enc.turnIndex = 0;
    enc = applyAction(enc, { type: 'move', actorId: 'proie', to: { x: 3, y: 0 } });

    const prise = findUnit(enc, 'proie')!;
    // Stoppée net sur la case du piège, pas à sa destination.
    expect(prise.pos).toEqual({ x: 2, y: 0 });
    expect(prise.hp).toBeLessThan(40);
    expect(hasStatus(prise, 'enracinement')).toBe(true);
    expect(hasStatus(prise, 'saignement')).toBe(true);
    expect(enc.hazards).toBeUndefined();
    expect(groundAt(enc, { x: 2, y: 0 }).map((i) => i.name)).toContain(MACHOIRES.name);
  });

  it('se relève hors combat et retourne au sac', () => {
    let enc = halt([
      mkUnit('poseur', 'allies', {
        abilities: [gearAbility(MACHOIRES)],
        inventory: [{ name: MACHOIRES.name, qty: 1, kind: 'other' }],
      }),
    ]);
    enc = applyAction(enc, { type: 'setHazard', actorId: 'poseur', item: MACHOIRES.name });
    enc = applyAction(enc, { type: 'recoverHazards', actorId: 'poseur' });
    expect(enc.hazards).toBeUndefined();
    expect(findUnit(enc, 'poseur')!.inventory[0].qty).toBe(1);
  });
});

describe('filet lesté', () => {
  it('retombe sur la case visée, qu’il ait pris ou non', () => {
    const lanceur = mkUnit('lanceur', 'allies', {
      abilities: [gearAbility(FILET)],
      inventory: [{ name: FILET.name, qty: 1, kind: 'other' }],
    });
    const cible = mkUnit('cible', 'ennemis', { pos: { x: 2, y: 0 } });
    const enc = applyAction(fight([lanceur, cible], 'lanceur'), {
      type: 'use',
      actorId: 'lanceur',
      abilityId: gearAbility(FILET).id,
      at: { x: 2, y: 0 },
    });
    expect(findUnit(enc, 'lanceur')!.inventory[0].qty).toBe(0);
    expect(groundAt(enc, { x: 2, y: 0 }).map((i) => i.name)).toEqual([FILET.name]);
  });

  it('n’enveloppe pas une bête de taille G', () => {
    const lanceur = mkUnit('lanceur', 'allies', {
      abilities: [gearAbility(FILET)],
      inventory: [{ name: FILET.name, qty: 1, kind: 'other' }],
    });
    const ours = mkUnit('ours', 'ennemis', { pos: { x: 2, y: 0 }, footprint: 2 });
    const enc = applyAction(fight([lanceur, ours], 'lanceur'), {
      type: 'use',
      actorId: 'lanceur',
      abilityId: gearAbility(FILET).id,
      at: { x: 2, y: 0 },
    });
    expect(findUnit(enc, 'lanceur')!.inventory[0].qty).toBe(1);
  });
});

describe('fiole d’huile', () => {
  it('le premier dégât de feu enflamme la cible huilée, et l’huile part', () => {
    expect(gearAbility(HUILE).inflicts).toEqual([{ status: 'huile', chance: 100 }]);
    const flamme: CombatAbility = {
      id: 'test:flamme',
      name: 'Flamme',
      kind: 'spell',
      rangeMeters: 10,
      shape: { kind: 'single' },
      targets: ['enemy'],
      manaCost: 0,
      enduranceCost: 0,
      damages: [{ min: 3, max: 3, type: 'fire' }],
      autoHit: true,
    };
    const mage = mkUnit('mage', 'allies', { abilities: [flamme] });
    const cible = mkUnit('cible', 'ennemis', { pos: { x: 2, y: 0 } });
    let enc = fight([mage, cible], 'mage');
    enc = applyAction(enc, { type: 'applyStatus', targetId: 'cible', status: 'huile' });
    enc = applyAction(enc, { type: 'use', actorId: 'mage', abilityId: flamme.id, at: cible.pos });
    const brulee = findUnit(enc, 'cible')!;
    expect(hasStatus(brulee, 'brulure')).toBe(true);
    expect(hasStatus(brulee, 'huile')).toBe(false);
  });
});

describe('entraves de fer', () => {
  const geste = gearAbility(ENTRAVES);

  function entraver(cible: Partial<Combatant>): Encounter {
    const geolier = mkUnit('geolier', 'allies', {
      abilities: [geste],
      inventory: [{ name: ENTRAVES.name, qty: 1, kind: 'other' }],
    });
    const prisonnier = mkUnit('prisonnier', 'ennemis', { pos: { x: 1, y: 0 }, ...cible });
    return applyAction(fight([geolier, prisonnier], 'geolier'), {
      type: 'use',
      actorId: 'geolier',
      abilityId: geste.id,
      at: { x: 1, y: 0 },
    });
  }

  it('ne se posent pas sur qui se débat encore', () => {
    const enc = entraver({});
    expect(hasStatus(findUnit(enc, 'prisonnier'), 'entrave')).toBe(false);
    expect(findUnit(enc, 'geolier')!.inventory[0].qty).toBe(1);
  });

  it('se posent sur un endormi, et lui retirent arme et geste précis — pas la parole', () => {
    const epee: CombatAbility = {
      id: 'weapon:weapon', name: 'Épée', kind: 'weapon', rangeMeters: 1.5,
      shape: { kind: 'single' }, targets: ['enemy'], manaCost: 0, enduranceCost: 0,
      damages: [{ min: 1, max: 4, type: 'slashing' }],
    };
    const mot: CombatAbility = {
      id: 'spell:mot', name: 'Mot', kind: 'spell', rangeMeters: 10,
      shape: { kind: 'single' }, targets: ['enemy'], manaCost: 0, enduranceCost: 0,
      damages: [{ min: 1, max: 1, type: 'dark' }], autoHit: true,
    };
    let enc = entraver({
      statuses: [{ key: 'sommeil', remaining: 3, stacks: 1, sourcePower: { atk_phy: 0, atk_mag: 0 }, age: 0 }],
      abilities: [epee, mot],
    });
    const prisonnier = findUnit(enc, 'prisonnier')!;
    expect(hasStatus(prisonnier, 'entrave')).toBe(true);

    // Réveillé, il reste entravé : l'épée ne répond plus, la voix si.
    prisonnier.statuses = prisonnier.statuses.filter((s) => s.key !== 'sommeil');
    enc.order = ['prisonnier'];
    enc.turnIndex = 0;
    const coup = applyAction(enc, { type: 'use', actorId: 'prisonnier', abilityId: epee.id, at: { x: 0, y: 0 } });
    expect(findUnit(coup, 'geolier')!.hp).toBe(40);
    const sort = applyAction(enc, { type: 'use', actorId: 'prisonnier', abilityId: mot.id, at: { x: 0, y: 0 } });
    expect(findUnit(sort, 'geolier')!.hp).toBeLessThan(40);
  });
});

describe('vareuse huilée', () => {
  it('garde son porteur au sec sous la pluie', () => {
    const couvert = mkUnit('couvert', 'allies', {
      inventory: [{ name: 'Vareuse huilée', qty: 1, kind: 'other', weatherWards: ['wet'] }],
    });
    const trempe = mkUnit('trempe', 'allies', { pos: { x: 3, y: 3 } });
    let enc = fight([couvert, trempe], 'couvert');
    enc = applyAction(enc, { type: 'setWeather', weather: 'rain' });
    enc = applyAction(enc, { type: 'endTurn' });
    enc = applyAction(enc, { type: 'endTurn' });
    expect(hasStatus(findUnit(enc, 'couvert'), 'wet')).toBe(false);
    expect(hasStatus(findUnit(enc, 'trempe'), 'wet')).toBe(true);
  });
});
