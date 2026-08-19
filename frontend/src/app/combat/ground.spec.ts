import { describe, expect, it } from 'vitest';
import { AttributeKey, StatKey } from '../character/character.types';
import {
  Affinities,
  CombatAbility,
  Combatant,
  Encounter,
  Team,
} from './combat.types';
import { Rng } from './dice';
import { emptyEncounter } from './encounter';
import {
  cellsWithinReach,
  dropOnGround,
  groundAt,
  landingCell,
  reachableGround,
  takeFromGround,
} from './ground';
import { applyAction, carriedQty } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   CE QUI TOMBE PAR TERRE

   Un objet projeté ne s'évapore pas : il atterrit, et il attend. Toucher le
   fait tomber aux pieds de la cible ; manquer l'envoie au-delà, si bien que
   rater coûte deux fois — le coup, puis la marche pour aller le rechercher.
─────────────────────────────────────────────────────────────────────────── */

const STATS = (over: Partial<Record<StatKey, number>> = {}): Record<StatKey, number> => ({
  hp: 40,
  mana: 30,
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

const throwMetal = (over: Partial<CombatAbility> = {}): CombatAbility => ({
  id: 'spell:throw',
  name: 'Projette-métal',
  kind: 'spell',
  rangeMeters: 20,
  shape: { kind: 'single' },
  targets: ['enemy'],
  manaCost: 1,
  enduranceCost: 0,
  damages: [{ min: 0, max: 0, type: 'lightning' }],
  throwsMetal: true,
  ...over,
});

/* ── La pile ───────────────────────────────────────────────────────────────── */

describe('la pile au sol', () => {
  it('fusionne les lignes homonymes plutôt que d’empiler des doublons', () => {
    const enc = emptyEncounter('Sol');
    dropOnGround(enc, { x: 2, y: 2 }, { name: 'Flèches', qty: 0, kind: 'other' }, 3);
    dropOnGround(enc, { x: 2, y: 2 }, { name: 'Flèches', qty: 0, kind: 'other' }, 2);
    expect(groundAt(enc, { x: 2, y: 2 })).toEqual([
      { name: 'Flèches', qty: 5, kind: 'other' },
    ]);
  });

  it('efface la case une fois tout ramassé : un sol vidé est un sol nu', () => {
    const enc = emptyEncounter('Sol');
    dropOnGround(enc, { x: 1, y: 1 }, { name: 'Dague', qty: 0, kind: 'other', metallic: true }, 1);
    expect(takeFromGround(enc, { x: 1, y: 1 }, 'Dague', 1)).toBe(1);
    expect(groundAt(enc, { x: 1, y: 1 })).toEqual([]);
    expect(enc.ground?.['1,1']).toBeUndefined();
  });

  it('ne rend que ce qu’il y avait', () => {
    const enc = emptyEncounter('Sol');
    dropOnGround(enc, { x: 0, y: 0 }, { name: 'Clou', qty: 0, kind: 'other' }, 2);
    expect(takeFromGround(enc, { x: 0, y: 0 }, 'Clou', 10)).toBe(2);
    expect(takeFromGround(enc, { x: 0, y: 0 }, 'Clou', 1)).toBe(0);
  });
});

/* ── Où l'objet atterrit ───────────────────────────────────────────────────── */

describe('l’atterrissage', () => {
  const enc = emptyEncounter('Champ');

  it('tombe aux pieds de la cible quand le coup porte', () => {
    // Lanceur en (0,0), cible en (5,0) : l'objet s'arrête juste avant elle.
    const cell = landingCell(enc, { x: 0, y: 0 }, { x: 5, y: 0 }, true, new Rng(1, 0), {});
    expect(cell).toEqual({ x: 4, y: 0 });
  });

  it('file au-delà de la cible quand le coup manque', () => {
    const cell = landingCell(enc, { x: 0, y: 0 }, { x: 5, y: 0 }, false, new Rng(1, 0), {});
    expect(cell.x).toBeGreaterThan(5);
    expect(cell.x).toBeLessThanOrEqual(8);
    expect(cell.y).toBe(0);
  });

  it('ne sort pas du plateau : il s’arrête au bord', () => {
    // Cible collée au bord droit (grille de 20 de large : x max = 19).
    const cell = landingCell(enc, { x: 15, y: 0 }, { x: 19, y: 0 }, false, new Rng(1, 0), {});
    expect(cell.x).toBeLessThanOrEqual(19);
  });

  it('tombe au pied d’un mur plutôt que de le traverser', () => {
    // Un mur juste derrière la cible : l'objet manqué ne va pas plus loin.
    const cell = landingCell(enc, { x: 0, y: 0 }, { x: 5, y: 0 }, false, new Rng(1, 0), {
      '6,0': 'mur',
    });
    expect(cell).toEqual({ x: 5, y: 0 });
  });
});

/* ── Le tir complet ────────────────────────────────────────────────────────── */

describe('un objet projeté finit toujours quelque part', () => {
  function tir(autoHit: boolean): Encounter {
    const enc = emptyEncounter('Duel');
    enc.seed = 7;
    enc.phase = 'combat';
    enc.round = 1;
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 0, y: 0 },
        abilities: [throwMetal({ autoHit })],
        inventory: [{ name: 'Grappin', qty: 1, kind: 'other', metallic: true, weightKg: 2 }],
      }),
      mkUnit({ id: 'foe', name: 'Bandit', team: 'ennemis', pos: { x: 5, y: 0 } }),
    ];
    return applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:throw',
      at: { x: 5, y: 0 },
      item: 'Grappin',
    });
  }

  it('quitte le sac et se retrouve au sol, touché ou manqué', () => {
    for (const autoHit of [true, false]) {
      const enc = tir(autoHit);
      expect(carriedQty(enc.combatants[0], 'Grappin')).toBe(0);

      const posees = Object.values(enc.ground ?? {}).flat();
      expect(posees.map((i) => i.name)).toEqual(['Grappin']);
      // Il reste en fer : un champ pourra le reprendre, et qui le ramasse
      // pourra le relancer.
      expect(posees[0].metallic).toBe(true);
    }
  });

  it('tombe aux pieds de la cible sur un coup qui porte', () => {
    const enc = tir(true);
    expect(enc.ground?.['4,0']?.[0].name).toBe('Grappin');
  });
});

/* ── Le ramassage ──────────────────────────────────────────────────────────── */

describe('ramasser', () => {
  function scene(over: Partial<Combatant> = {}, phase: 'combat' | 'exploration' = 'combat'): Encounter {
    const enc = emptyEncounter('Sol');
    enc.phase = phase;
    enc.round = 1;
    enc.combatants = [
      mkUnit({ id: 'pc', name: 'Kael', team: 'allies', pos: { x: 3, y: 3 }, ...over }),
    ];
    dropOnGround(enc, { x: 4, y: 3 }, { name: 'Épée longue', qty: 0, kind: 'other', metallic: true }, 1);
    return enc;
  }

  it('voit ce qui traîne sur sa case et autour', () => {
    const enc = scene();
    expect(cellsWithinReach(enc.combatants[0])).toHaveLength(9);
    expect(reachableGround(enc, enc.combatants[0]).map((p) => p.pos)).toEqual([{ x: 4, y: 3 }]);
  });

  it('met l’objet au sac et vide la case', () => {
    const apres = applyAction(scene(), {
      type: 'pickUp',
      actorId: 'pc',
      at: { x: 4, y: 3 },
      item: 'Épée longue',
    });
    expect(carriedQty(apres.combatants[0], 'Épée longue')).toBe(1);
    expect(groundAt(apres, { x: 4, y: 3 })).toEqual([]);
    // La matière survit au ramassage.
    expect(apres.combatants[0].inventory[0].metallic).toBe(true);
  });

  it('coûte l’action bonus en combat', () => {
    const apres = applyAction(scene(), { type: 'pickUp', actorId: 'pc', at: { x: 4, y: 3 } });
    expect(apres.combatants[0].bonusActionUsed).toBe(true);
  });

  it('refuse quand l’action bonus est déjà partie', () => {
    const apres = applyAction(scene({ bonusActionUsed: true }), {
      type: 'pickUp',
      actorId: 'pc',
      at: { x: 4, y: 3 },
    });
    expect(carriedQty(apres.combatants[0], 'Épée longue')).toBe(0);
    expect(apres.log.some((l) => l.text.includes('action bonus'))).toBe(true);
  });

  it('ne coûte rien hors combat : personne ne compte les gestes', () => {
    const apres = applyAction(scene({ bonusActionUsed: true }, 'exploration'), {
      type: 'pickUp',
      actorId: 'pc',
      at: { x: 4, y: 3 },
    });
    expect(carriedQty(apres.combatants[0], 'Épée longue')).toBe(1);
  });

  it('refuse ce qui est hors d’atteinte', () => {
    const apres = applyAction(scene(), { type: 'pickUp', actorId: 'pc', at: { x: 9, y: 9 } });
    expect(carriedQty(apres.combatants[0], 'Épée longue')).toBe(0);
    expect(apres.log.some((l) => l.text.includes('trop loin'))).toBe(true);
  });
});
