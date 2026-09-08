import { describe, expect, it } from 'vitest';
import bandagesFiche from '../../../public/resources/json/equipment/bandages.json';
import equipmentIndex from '../../../public/resources/json/equipment/index.json';
import garrotFiche from '../../../public/resources/json/equipment/garrot.json';
import selsFiche from '../../../public/resources/json/equipment/sels-odorants.json';
import trousseFiche from '../../../public/resources/json/equipment/trousse-de-chirurgien.json';
import { AttributeKey, StatKey } from '../character/character.types';
import { catalogTrait } from '../character/universe-data';
import { careAbility, CareSource } from './abilities';
import { Affinities, Combatant, Encounter, Team } from './combat.types';
import { emptyEncounter } from './encounter';
import { abilityHealAmount, applyAction, findUnit, reachesDowned } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   MATÉRIEL DE SOIN

   Rien de magique : ce que la fiche écrit en français est ce qui se joue. Le
   bandage rend 1d4 + le modificateur DU BLESSÉ, le garrot ne rend rien mais
   arrête le sang, la trousse stabilise un corps à terre — et le trait Soigneur
   y ajoute le point de vie qui remet debout.
─────────────────────────────────────────────────────────────────────────── */

const source = (fiche: { name: string; care?: unknown }, slug: string): CareSource => ({
  name: fiche.name,
  slug,
  ...(fiche.care as object),
});

const BANDAGES = source(bandagesFiche, 'bandages');
const GARROT = source(garrotFiche, 'garrot');
const SELS = source(selsFiche, 'sels-odorants');
const TROUSSE = source(trousseFiche, 'trousse-de-chirurgien');

const STATS = (): Record<StatKey, number> => ({
  hp: 40, mana: 10, endurance: 20, speed: 10,
  atk_phy: 15, atk_mag: 10, def_phy: 10, def_mag: 10,
});
const ATTRS = (con: number): Record<AttributeKey, number> => ({
  force: 10, dexterite: 10, constitution: con, intelligence: 10, sagesse: 10, charisme: 10,
});
const NO_AFFINITY = (): Affinities => ({
  immunities: [], resistances: [], weaknesses: [], absorptions: [],
});

function mkUnit(id: string, team: Team, con = 10): Combatant {
  const base = STATS();
  return {
    origin: { kind: 'custom' },
    footprint: 1,
    pos: { x: 0, y: 0 },
    attributes: ATTRS(con),
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
  } as unknown as Combatant;
}

describe('matériel de soin — catalogue', () => {
  it('se repère au tag `care`, dans l’index comme dans la fiche', () => {
    const tagged = equipmentIndex.filter((e) => e.tags?.includes('care')).map((e) => e.slug).sort();
    expect(tagged).toEqual(['bandages', 'garrot', 'sels-odorants', 'trousse-de-chirurgien']);
    expect(bandagesFiche.tags).toContain('care');
  });

  it('reprend les chiffres écrits sur les fiches', () => {
    expect(BANDAGES.heal).toEqual({ min: 1, max: 4, targetAttribute: 'constitution', minimum: 1 });
    expect(BANDAGES.kitBonus).toBe(2);
    expect(BANDAGES.cleanses).toEqual(['saignement']);
    expect(GARROT.heal).toBeUndefined();
    expect(GARROT.consumed).toBe(false);
    expect(SELS.cleanses).toEqual(['sommeil', 'etourdissement']);
    expect(SELS.charges).toBe(3);
    expect(TROUSSE.stabilizes).toBe(true);
  });
});

describe('bandages', () => {
  it('rend 1d4 + le modificateur du BLESSÉ, pas celui du secouriste', () => {
    const ability = careAbility(BANDAGES);
    const secouriste = mkUnit('medic', 'allies', 20); // +5, sans effet ici
    const blesse = mkUnit('blesse', 'allies', 16); // +3
    // Moyenne du dé (2,5 → 3 après arrondi) + 3 de la Constitution du blessé.
    expect(abilityHealAmount(secouriste, ability, blesse)).toBe(6);
    expect(abilityHealAmount(secouriste, ability, mkUnit('x', 'allies', 10))).toBe(3);
  });

  it('gagne le bonus de la trousse quand elle est dans le sac', () => {
    const sans = careAbility(BANDAGES);
    const avec = careAbility(BANDAGES, { hasKit: true });
    const blesse = mkUnit('blesse', 'allies', 10);
    const medic = mkUnit('medic', 'allies');
    expect(abilityHealAmount(medic, avec, blesse) - abilityHealAmount(medic, sans, blesse)).toBe(
      BANDAGES.kitBonus,
    );
  });

  it('se consomme, coûte le tour, et lève le saignement', () => {
    const ability = careAbility(BANDAGES);
    expect(ability.consumes).toEqual({ item: BANDAGES.name, qty: 1 });
    expect(ability.bonusAction).toBe(false);
    expect(ability.cleanses).toEqual(['saignement']);
    // Un garrot ne part pas avec la plaie.
    expect(careAbility(GARROT).consumes).toBeUndefined();
  });
});

describe('trousse de chirurgien & trait Soigneur', () => {
  it('stabilise sans relever, tant qu’on n’est pas Soigneur', () => {
    const ability = careAbility(TROUSSE);
    expect(ability.stabilizes).toBe(true);
    expect(ability.heal).toBeUndefined();
  });

  it('rend 1 PV entre les mains d’un Soigneur — donc remet debout', () => {
    const ability = careAbility(TROUSSE, { healer: true });
    expect(ability.heal).toBe(1);
    expect(catalogTrait('soigneur')?.description).toContain('1 PV');
  });

  it('est la SEULE chose qui atteigne un allié à terre', () => {
    expect(reachesDowned(careAbility(TROUSSE))).toBe(true);
    // Un rouleau de toile ne rattrape pas un mourant, un garrot non plus.
    expect(reachesDowned(careAbility(BANDAGES))).toBe(false);
    expect(reachesDowned(careAbility(GARROT))).toBe(false);
    expect(reachesDowned(careAbility(SELS))).toBe(false);
  });

  /** Un secouriste soigne un compagnon tombé, avec ou sans le trait. */
  function soigneUnTombe(healer: boolean): Combatant {
    let enc: Encounter = emptyEncounter('Test');
    const medic = mkUnit('medic', 'allies');
    const tombe = mkUnit('tombe', 'allies');
    tombe.pos = { x: 1, y: 0 };
    tombe.hp = 0;
    tombe.down = true;
    const ability = careAbility(TROUSSE, { healer });
    medic.abilities = [ability];
    medic.inventory = [{ name: TROUSSE.name, qty: 1, kind: 'care' }];
    enc.combatants = [medic, tombe];
    enc = applyAction(enc, { type: 'start' });
    enc.order = [medic.id];
    enc.turnIndex = 0;
    enc = applyAction(enc, {
      type: 'use',
      actorId: medic.id,
      abilityId: ability.id,
      at: tombe.pos,
    });
    return findUnit(enc, tombe.id)!;
  }

  it('un bandage ne ressuscite pas : le tombé reste à 0 et à terre', () => {
    let enc: Encounter = emptyEncounter('Test');
    const medic = mkUnit('medic', 'allies');
    const tombe = mkUnit('tombe', 'allies');
    tombe.pos = { x: 1, y: 0 };
    tombe.hp = 0;
    tombe.down = true;
    const ability = careAbility(BANDAGES);
    medic.abilities = [ability];
    medic.inventory = [{ name: BANDAGES.name, qty: 1, kind: 'care' }];
    enc.combatants = [medic, tombe];
    enc = applyAction(enc, { type: 'start' });
    enc.order = [medic.id];
    enc.turnIndex = 0;
    enc = applyAction(enc, {
      type: 'use',
      actorId: medic.id,
      abilityId: ability.id,
      at: tombe.pos,
    });

    const toujoursTombe = findUnit(enc, tombe.id)!;
    expect(toujoursTombe.hp).toBe(0);
    expect(toujoursTombe.down).toBe(true);
    expect(toujoursTombe.stabilized).toBeFalsy();
  });

  it('sans le trait : le tombé cesse de décliner, mais reste à terre', () => {
    const tenu = soigneUnTombe(false);
    expect(tenu.stabilized).toBe(true);
    expect(tenu.hp).toBe(0);
    expect(tenu.down).toBe(true);
  });

  it('avec le trait : le point de vie rendu le remet debout', () => {
    const releve = soigneUnTombe(true);
    expect(releve.hp).toBe(1);
    expect(releve.down).toBe(false);
    // Debout, il n'a plus à être « tenu stable » : ça ne concerne qu'un corps à terre.
    expect(releve.stabilized).toBe(false);
  });
});
