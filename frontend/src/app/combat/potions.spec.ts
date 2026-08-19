import { describe, expect, it } from 'vitest';
import faible from '../../../public/resources/json/potions/potion_de_mana_faible.json';
import intermediaire from '../../../public/resources/json/potions/potion_de_mana_intermediaire.json';
import superieure from '../../../public/resources/json/potions/potion_de_mana_superieure.json';
import soinFaible from '../../../public/resources/json/potions/potion_de_soin_faible.json';
import antidote from '../../../public/resources/json/potions/antidote.json';
import { AttributeKey, StatKey } from '../character/character.types';
import { Affinities, Combatant, Encounter, Team } from './combat.types';
import { consumableAbility, ConsumableSource } from './abilities';
import { emptyEncounter } from './encounter';
import { abilityManaAmount, applyAction } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   LES POTIONS DE MANA

   Une fiole rend un FORFAIT plus une PART de la réserve du buveur. Les deux
   moitiés font un travail différent : le forfait porte le début de carrière,
   où 5 points comptent ; la part porte la fin, où ils ne comptent plus.

   Ce que le catalogue écrit en français est la source unique — ces tests le
   lisent tel quel, sans le recopier, pour que retoucher une fiche sans
   retoucher le moteur se voie tout de suite.
─────────────────────────────────────────────────────────────────────────── */

const STATS = (over: Partial<Record<StatKey, number>> = {}): Record<StatKey, number> => ({
  hp: 40,
  mana: 100,
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

const NO_STATUS = new Map<string, string>();
const potion = (fiche: { name: string; effects?: string[] }) =>
  consumableAbility(fiche as ConsumableSource, NO_STATUS);

describe('potions de mana', () => {
  it('lit le forfait et la part de réserve sur les trois qualités', () => {
    expect(potion(faible).restoreMana).toBe(5);
    expect(potion(faible).restoreManaPercent).toBe(5);

    expect(potion(intermediaire).restoreMana).toBe(5);
    expect(potion(intermediaire).restoreManaPercent).toBe(15);

    expect(potion(superieure).restoreMana).toBe(5);
    expect(potion(superieure).restoreManaPercent).toBe(30);
  });

  it('ne verse RIEN dans le soin : « points de mana » n’est pas un point de vie', () => {
    for (const fiche of [faible, intermediaire, superieure]) {
      expect(potion(fiche).heal).toBeUndefined();
    }
  });

  it('ignore un nombre qui n’est pas du mana, même sur une ligne qui en parle', () => {
    // « absorber passivement la mana ambiante pendant 10 minutes » : ni forfait,
    // ni pourcentage. Une lecture large en aurait tiré 10 points de mana.
    expect(potion(superieure).restoreMana).toBe(5);
    // La ligne reste affichée au MJ plutôt que d'être perdue.
    expect(potion(superieure).manualEffects?.join(' ')).toContain('mana ambiante');
  });

  it('compte la part sur la réserve de QUI BOIT, pas de qui tend la fiole', () => {
    const archimage = mkUnit({ id: 'a', name: 'Archimage', team: 'allies', base: STATS({ mana: 200 }) });
    const novice = mkUnit({ id: 'n', name: 'Novice', team: 'allies', base: STATS({ mana: 20 }) });
    const fiole = potion(superieure);

    // 5 + 30 % de 200 = 65 pour l'un, 5 + 30 % de 20 = 11 pour l'autre.
    expect(abilityManaAmount(archimage, fiole, archimage)).toBe(65);
    expect(abilityManaAmount(archimage, fiole, novice)).toBe(11);
  });

  it('rend réellement le mana en jeu, plafonné à la réserve', () => {
    const fiole = potion(intermediaire);
    const enc: Encounter = emptyEncounter('Essai');
    enc.phase = 'combat';
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        base: STATS({ mana: 100 }),
        mana: 10,
        abilities: [fiole],
        inventory: [{ name: fiole.name, qty: 1, kind: 'consumable' }],
      }),
    ];

    const apres = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: fiole.id,
      at: { x: 0, y: 0 },
    });
    // 10 + 5 + 15 % de 100 = 30.
    expect(apres.combatants[0].mana).toBe(30);
    // La fiole est bue.
    expect(apres.combatants[0].inventory[0].qty).toBe(0);
  });

  it('ne déborde pas de la réserve', () => {
    const fiole = potion(superieure);
    const enc: Encounter = emptyEncounter('Essai');
    enc.phase = 'combat';
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        base: STATS({ mana: 100 }),
        mana: 95,
        abilities: [fiole],
        inventory: [{ name: fiole.name, qty: 1, kind: 'consumable' }],
      }),
    ];
    const apres = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: fiole.id,
      at: { x: 0, y: 0 },
    });
    expect(apres.combatants[0].mana).toBe(100);
  });
});

describe('les autres fioles restent lues comme avant', () => {
  it('garde le soin en dés des potions de soin', () => {
    // « Rend 2d4 + 2 points de vie » → moyenne de 4 et 10.
    const fiole = potion(soinFaible);
    expect(fiole.heal).toBe(7);
    expect(fiole.restoreMana).toBeUndefined();
    expect(fiole.restoreManaPercent).toBeUndefined();
  });

  it('garde les purges de statut de l’antidote', () => {
    const cles = new Map([
      ['poison', 'poison'],
      ['paralysie', 'paralysie'],
    ]);
    const fiole = consumableAbility(antidote as ConsumableSource, cles);
    expect(fiole.cleanses).toContain('poison');
    expect(fiole.cleanses).toContain('paralysie');
  });
});
