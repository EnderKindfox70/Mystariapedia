import { describe, expect, it } from 'vitest';
import { AttributeKey, StatKey } from '../character/character.types';
import { Affinities, CombatAbility, Combatant, Encounter, Team } from './combat.types';
import { emptyEncounter } from './encounter';
import { blocksMovement, blocksSight } from './terrain';
import { applyAction, terrainFor } from './rules';
import {
  ageWalls,
  damageWall,
  raiseWall,
  wallAt,
  wallColor,
  WALL_COMMON_WEAKNESS,
  WALL_PERMANENT,
} from './walls';

/* ──────────────────────────────────────────────────────────────────────────
   LES MURS CONJURÉS

   Un mur de sort n'est pas du décor : il s'attaque, il s'écroule, et s'il a été
   tiré du néant il se décompose tout seul. C'est aussi le premier endroit où le
   palier de façonnage a une conséquence VISIBLE — la même incantation laisse
   une barricade permanente là où la pierre est sous les pieds, et un rideau de
   quelques tours en pleine mer.
─────────────────────────────────────────────────────────────────────────── */

const STATS = (): Record<StatKey, number> => ({
  hp: 40, mana: 60, endurance: 20, speed: 10,
  atk_phy: 0, atk_mag: 0, def_phy: 10, def_mag: 10,
});

const ATTRS = (): Record<AttributeKey, number> => ({
  force: 10, dexterite: 10, constitution: 10, intelligence: 10, sagesse: 10, charisme: 10,
});

const NO_AFFINITY = (): Affinities => ({
  immunities: [], resistances: [], weaknesses: [], absorptions: [],
});

function mkUnit(over: Partial<Combatant> & { id: string; name: string; team: Team }): Combatant {
  const base = over.base ?? STATS();
  return {
    origin: { kind: 'custom' }, footprint: 1, pos: { x: 0, y: 0 },
    attributes: ATTRS(), proficiency: 2,
    hp: base.hp, mana: base.mana, endurance: base.endurance,
    moved: 0, actionUsed: false, bonusActionUsed: false, reactionUsed: false,
    statuses: [], effects: [], abilities: [], inventory: [],
    affinities: NO_AFFINITY(), initiative: 0, down: false,
    ...over, base,
  };
}

/** Mur de pierre, palier 2 : 4 cases, 20 PV de base, 3 tours. */
const murDePierre = (): CombatAbility => ({
  id: 'spell:mur',
  name: 'Mur de pierre',
  kind: 'spell',
  rangeMeters: 14,
  shape: { kind: 'single' },
  targets: ['everyone'],
  manaCost: 5,
  enduranceCost: 0,
  damages: [],
  duration: 3,
  autoHit: true,
  shapesMaterial: 'stone',
  raisesWall: { length: 4, hp: 20 },
});

/** Un pic de pierre pour cogner sur le mur : 8 de dégâts contondants. */
const pioche = (type = 'bludgeoning'): CombatAbility => ({
  id: 'weapon:weapon',
  name: 'Pioche',
  kind: 'weapon',
  rangeMeters: 20,
  shape: { kind: 'single' },
  targets: ['enemy'],
  manaCost: 0,
  enduranceCost: 0,
  damages: [{ min: 8, max: 8, type }],
});

function scene(
  geology: string[] | undefined,
  training?: Combatant['earthMaterials'],
): Encounter {
  const enc = emptyEncounter('Carrière');
  enc.seed = 5;
  enc.rollCount = 0;
  enc.phase = 'combat';
  enc.round = 1;
  enc.geology = geology;
  enc.combatants = [
    mkUnit({
      id: 'mage', name: 'Mage', team: 'allies', pos: { x: 2, y: 5 },
      abilities: [murDePierre(), pioche()], earthMaterials: training,
    }),
  ];
  return enc;
}

const dresse = (enc: Encounter, at = { x: 8, y: 5 }): Encounter =>
  applyAction(enc, { type: 'use', actorId: 'mage', abilityId: 'spell:mur', at });

/* ── Le mur se dresse ──────────────────────────────────────────────────────── */

describe('dresser un mur', () => {
  it('occupe plusieurs cases, en travers de la visée', () => {
    const enc = dresse(scene(['granite']));
    const mur = enc.walls![0];
    expect(mur.cells).toHaveLength(4);
    // Visée horizontale (le mage est à gauche) : le mur se pose à la verticale.
    expect(new Set(mur.cells.map((c) => c.x))).toEqual(new Set([8]));
  });

  it('tire sa solidité de la matière', () => {
    const granite = dresse(scene(['granite'])).walls![0];
    const gres = dresse(scene(['gres'])).walls![0];
    const basalte = dresse(scene(['basalte'])).walls![0];
    // La solidité vient désormais de la DÉFENSE de la matière, pas d'un chiffre
    // écrit sur le palier : basalte 29 > granite 28 > grès 19.
    expect(basalte.maxHp).toBeGreaterThan(granite.maxHp);
    expect(granite.maxHp).toBeGreaterThan(gres.maxHp);
    // L'écart doit rester lisible, pas cosmétique.
    expect(basalte.maxHp - gres.maxHp).toBeGreaterThanOrEqual(10);
  });

  it('reste debout indéfiniment quand il est façonné dans le sol', () => {
    const mur = dresse(scene(['granite'])).walls![0];
    expect(mur.remaining).toBe(WALL_PERMANENT);
  });

  it('se décompose quand il a été tiré du néant', () => {
    const mur = dresse(scene([], { studied: ['granite'], equipped: 'granite' })).walls![0];
    expect(mur.remaining).toBeGreaterThan(0);
  });

  it('tient moitié moins longtemps, et moitié moins solide, improvisé', () => {
    const conjure = dresse(scene([], { studied: ['granite'], equipped: 'granite' })).walls![0];
    const improvise = dresse(scene([], { studied: [], known: ['granite'], equipped: 'granite' })).walls![0];
    expect(improvise.remaining).toBeLessThan(conjure.remaining);
    expect(improvise.maxHp).toBeLessThan(conjure.maxHp);
  });

  it('ne bâtit pas sur les gens', () => {
    const enc = scene(['granite']);
    enc.combatants.push(mkUnit({ id: 'foe', name: 'Bandit', team: 'ennemis', pos: { x: 8, y: 5 } }));
    const mur = dresse(enc).walls![0];
    expect(mur.cells.some((c) => c.x === 8 && c.y === 5)).toBe(false);
  });
});

/* ── Le mur fait son office ────────────────────────────────────────────────── */

describe('un mur arrête ce qu’un mur arrête', () => {
  it('bloque le pas et le regard, comme n’importe quel mur', () => {
    const enc = dresse(scene(['granite']));
    const decor = terrainFor(enc);
    const cell = `${enc.walls![0].cells[0].x},${enc.walls![0].cells[0].y}`;
    expect(blocksMovement(decor, cell)).toBe(true);
    expect(blocksSight(decor, cell)).toBe(true);
  });

  it('disparaît du décor une fois abattu', () => {
    const enc = dresse(scene(['granite']));
    const cell = `${enc.walls![0].cells[0].x},${enc.walls![0].cells[0].y}`;
    const apres = applyAction(enc, { type: 'breakWall', wallId: enc.walls![0].id });
    expect(apres.walls).toHaveLength(0);
    expect(blocksMovement(terrainFor(apres), cell)).toBe(false);
  });
});

/* ── On peut le démolir ────────────────────────────────────────────────────── */

describe('frapper un mur', () => {
  it('lui retire des points de vie, et le dit', () => {
    const enc = dresse(scene(['granite']));
    const cible = enc.walls![0].cells[0];
    // Le tour suivant : dresser le mur a déjà consommé l'action.
    enc.combatants[0].actionUsed = false;
    const apres = applyAction(enc, {
      type: 'use', actorId: 'mage', abilityId: 'weapon:weapon', at: cible,
    });
    const mur = apres.walls![0];
    expect(mur.hp).toBeLessThan(mur.maxHp);
    expect(apres.log.some((l) => l.text.includes('encaisse'))).toBe(true);
  });

  it('s’effondre une fois à zéro', () => {
    const enc = dresse(scene(['gres'])); // 16 PV
    let etat = enc;
    for (let i = 0; i < 3 && etat.walls?.length; i++) {
      etat.combatants[0].actionUsed = false;
      etat = applyAction(etat, {
        type: 'use', actorId: 'mage', abilityId: 'weapon:weapon', at: enc.walls![0].cells[0],
      });
    }
    expect(etat.walls).toHaveLength(0);
    expect(etat.log.some((l) => l.text.includes('s’effondre'))).toBe(true);
  });

  it('cède au contondant, quelle que soit sa matière', () => {
    // Une paroi ne se tranche pas et ne brûle pas : elle se BRISE. C'est ce qui
    // empêche un mage de Terre de bloquer indéfiniment une escouade d'épéistes.
    for (const matiere of ['granite', 'basalte', 'obsidienne', 'marbre']) {
      const mur = raiseWall(
        { ...emptyEncounter('E'), combatants: [] } as Encounter,
        mkUnit({ id: 'm', name: 'M', team: 'allies' }),
        { x: 3, y: 0 },
        { length: 1, hp: 40 },
        matiere,
        { stable: true, duration: 3, effectFactor: 1 },
      )!;
      expect(damageWall(mur, 10, WALL_COMMON_WEAKNESS), matiere).toBe(20);
    }
  });

  it('ne cumule pas le contondant avec la faille de la matière', () => {
    // Calcaire + contondant ne doit pas faire ×4 : une paroi tomberait d'un coup.
    const mur = raiseWall(
      { ...emptyEncounter('E'), combatants: [] } as Encounter,
      mkUnit({ id: 'm', name: 'M', team: 'allies' }),
      { x: 3, y: 0 },
      { length: 1, hp: 100 },
      'calcaire',
      { stable: true, duration: 3, effectFactor: 1 },
    )!;
    expect(damageWall(mur, 10, WALL_COMMON_WEAKNESS)).toBe(20);
  });

  it('porte la teinte de sa matière, pour être lisible sur le plateau', () => {
    const enc = dresse(scene(['obsidienne']));
    expect(wallColor(enc.walls![0])).toMatch(/^#[0-9a-f]{6}$/i);
    // Deux matières différentes ne se ressemblent pas.
    const autre = dresse(scene(['marbre']));
    expect(wallColor(enc.walls![0])).not.toBe(wallColor(autre.walls![0]));
  });

  it('cède deux fois plus vite à ce qui ronge sa matière', () => {
    // Le calcaire se dissout : le poison compte double contre lui.
    const enc = emptyEncounter('Essai');
    const mur = raiseWall(
      { ...enc, combatants: [] } as Encounter,
      mkUnit({ id: 'm', name: 'M', team: 'allies' }),
      { x: 3, y: 0 },
      { length: 1, hp: 20 },
      'calcaire',
      { stable: true, duration: 3, effectFactor: 1 },
    )!;
    const avant = mur.hp;
    expect(damageWall(mur, 6, 'poison')).toBe(12);
    expect(mur.hp).toBe(avant - 12);
  });

  it('n’encaisse jamais plus que ce qu’il lui reste', () => {
    const enc = emptyEncounter('Essai');
    const mur = raiseWall(
      { ...enc, combatants: [] } as Encounter,
      mkUnit({ id: 'm', name: 'M', team: 'allies' }),
      { x: 3, y: 0 },
      { length: 1, hp: 5 },
      'granite',
      { stable: true, duration: 3, effectFactor: 1 },
    )!;
    expect(damageWall(mur, 999)).toBe(mur.maxHp);
    expect(mur.hp).toBe(0);
  });
});

/* ── Le temps fait son œuvre ───────────────────────────────────────────────── */

describe('le vieillissement', () => {
  it('ne touche pas à un mur permanent', () => {
    const enc = dresse(scene(['granite']));
    for (let i = 0; i < 10; i++) ageWalls(enc);
    expect(enc.walls).toHaveLength(1);
    expect(enc.walls![0].remaining).toBe(WALL_PERMANENT);
  });

  it('finit par abattre un mur conjuré', () => {
    const enc = dresse(scene([], { studied: ['granite'], equipped: 'granite' }));
    const duree = enc.walls![0].remaining;
    for (let i = 0; i < duree - 1; i++) expect(ageWalls(enc)).toHaveLength(0);
    expect(ageWalls(enc)).toHaveLength(1);
    expect(enc.walls).toHaveLength(0);
  });

  it('se retrouve par sa case', () => {
    const enc = dresse(scene(['granite']));
    const cell = enc.walls![0].cells[0];
    expect(wallAt(enc, cell)?.id).toBe(enc.walls![0].id);
    expect(wallAt(enc, { x: 0, y: 0 })).toBeUndefined();
  });
});
