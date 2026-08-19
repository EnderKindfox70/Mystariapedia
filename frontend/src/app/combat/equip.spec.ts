import { describe, expect, it } from 'vitest';
import { AttributeKey, StatKey } from '../character/character.types';
import { weaponAbility, WeaponSource } from './abilities';
import {
  Affinities,
  CarriedItem,
  CombatAbility,
  Combatant,
  Encounter,
  Team,
} from './combat.types';
import { emptyEncounter } from './encounter';
import { dropOnGround } from './ground';
import { carriedAsLoot, pour } from './loot';
import { metalWithinGrasp } from './metal';
import { applyAction, carriedQty } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   PRENDRE ET RENDRE LES ARMES

   Une arme n'est une capacité que TENUE. Au sac elle n'est qu'une ligne — et
   c'est ce qui permet de la voler, de la lancer, de la ramasser, puis de la
   reprendre en main.

   La maîtrise se rejuge à chaque fois qu'elle change de main : elle appartient
   au bras, pas à la lame.
─────────────────────────────────────────────────────────────────────────── */

const STATS = (): Record<StatKey, number> => ({
  hp: 40,
  mana: 30,
  endurance: 20,
  speed: 10,
  atk_phy: 20,
  atk_mag: 20,
  def_phy: 10,
  def_mag: 10,
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

const EPEE: WeaponSource = {
  name: 'Épée longue',
  slug: 'epee-longue',
  minDamage: 4,
  maxDamage: 9,
  weaponCategory: 'longsword',
  material: 'acier',
};

const ESPADON: WeaponSource = {
  name: 'Espadon',
  minDamage: 7,
  maxDamage: 15,
  weaponCategory: 'greatsword',
  material: 'acier',
};

const DAGUE: WeaponSource = {
  name: 'Dague',
  minDamage: 2,
  maxDamage: 5,
  weaponCategory: 'dagger',
  material: 'acier',
};

/** Une arme au sac, prête à être empoignée. */
const inBag = (source: WeaponSource): CarriedItem => ({
  name: source.name,
  qty: 1,
  kind: 'other',
  metallic: true,
  weapon: { source },
});

const held = (source: WeaponSource, slot = 'weapon', proficient = false): CombatAbility =>
  weaponAbility(source, slot, undefined, proficient);

function scene(over: Partial<Combatant> = {}, phase: 'combat' | 'exploration' = 'combat'): Encounter {
  const enc = emptyEncounter('Essai');
  enc.phase = phase;
  enc.round = 1;
  enc.combatants = [mkUnit({ id: 'pc', name: 'Kael', team: 'allies', pos: { x: 3, y: 3 }, ...over })];
  return enc;
}

const weaponIn = (unit: Combatant, slot: string): CombatAbility | undefined =>
  unit.abilities.find((a) => a.id === `weapon:${slot}`);

/* ── Équiper ───────────────────────────────────────────────────────────────── */

describe('prendre une arme en main', () => {
  it('sort l’arme du sac et la met en main', () => {
    const apres = applyAction(scene({ inventory: [inBag(EPEE)] }), {
      type: 'equip',
      actorId: 'pc',
      item: 'Épée longue',
    });
    const kael = apres.combatants[0];
    expect(weaponIn(kael, 'weapon')?.name).toBe('Épée longue');
    // Elle n'est plus au sac : on ne porte pas deux fois la même lame.
    expect(carriedQty(kael, 'Épée longue')).toBe(0);
  });

  it('range au sac ce qu’on tenait : on ne porte pas trois épées', () => {
    const apres = applyAction(
      scene({ abilities: [held(DAGUE)], inventory: [inBag(EPEE)] }),
      { type: 'equip', actorId: 'pc', item: 'Épée longue' },
    );
    const kael = apres.combatants[0];
    expect(weaponIn(kael, 'weapon')?.name).toBe('Épée longue');
    expect(carriedQty(kael, 'Dague')).toBe(1);
    // …et la dague rangée reste une arme, donc reprenable.
    expect(kael.inventory.find((i) => i.name === 'Dague')?.weapon).toBeDefined();
  });

  it('coûte l’action bonus en combat, et rien hors combat', () => {
    const enCombat = applyAction(scene({ inventory: [inBag(EPEE)] }), {
      type: 'equip',
      actorId: 'pc',
      item: 'Épée longue',
    });
    expect(enCombat.combatants[0].bonusActionUsed).toBe(true);

    const dehors = applyAction(scene({ inventory: [inBag(EPEE)] }, 'exploration'), {
      type: 'equip',
      actorId: 'pc',
      item: 'Épée longue',
    });
    expect(dehors.combatants[0].bonusActionUsed).toBe(false);
    expect(weaponIn(dehors.combatants[0], 'weapon')).toBeDefined();
  });

  it('refuse un second changement dans le même tour', () => {
    const apres = applyAction(
      scene({ bonusActionUsed: true, inventory: [inBag(EPEE)] }),
      { type: 'equip', actorId: 'pc', item: 'Épée longue' },
    );
    expect(weaponIn(apres.combatants[0], 'weapon')).toBeUndefined();
    expect(carriedQty(apres.combatants[0], 'Épée longue')).toBe(1);
  });

  it('refuse ce qui n’est pas une arme', () => {
    const apres = applyAction(
      scene({ inventory: [{ name: 'Corde de chanvre', qty: 1, kind: 'other' }] }),
      { type: 'equip', actorId: 'pc', item: 'Corde de chanvre' },
    );
    expect(weaponIn(apres.combatants[0], 'weapon')).toBeUndefined();
  });
});

describe('la maîtrise appartient au bras, pas à la lame', () => {
  it('accorde la maîtrise à qui a appris cette catégorie', () => {
    const apres = applyAction(
      scene({ inventory: [inBag(EPEE)], weaponProficiencies: ['longsword'] }),
      { type: 'equip', actorId: 'pc', item: 'Épée longue' },
    );
    expect(weaponIn(apres.combatants[0], 'weapon')?.proficient).toBe(true);
  });

  it('la refuse à qui ne l’a pas apprise : ramasser une lame n’entraîne personne', () => {
    const apres = applyAction(
      scene({ inventory: [inBag(EPEE)], weaponProficiencies: ['dagger'] }),
      { type: 'equip', actorId: 'pc', item: 'Épée longue' },
    );
    expect(weaponIn(apres.combatants[0], 'weapon')?.proficient).toBe(false);
  });
});

describe('les deux mains', () => {
  it('rebâtit l’arme pour la main faible plutôt que de la recopier', () => {
    const apres = applyAction(scene({ inventory: [inBag(DAGUE)] }), {
      type: 'equip',
      actorId: 'pc',
      item: 'Dague',
      slot: 'offhand',
    });
    const arme = weaponIn(apres.combatants[0], 'offhand');
    // La main faible se joue en action bonus et perd la part d'attaque physique.
    expect(arme?.bonusAction).toBe(true);
    expect(arme?.damages[0].scaling).toEqual([]);
    expect(arme?.damages[0].attributeModifier).toBeDefined();
  });

  it('vide la main faible quand on empoigne une arme à deux mains', () => {
    const apres = applyAction(
      scene({ abilities: [held(DAGUE, 'offhand')], inventory: [inBag(ESPADON)] }),
      { type: 'equip', actorId: 'pc', item: 'Espadon' },
    );
    const kael = apres.combatants[0];
    expect(weaponIn(kael, 'weapon')?.name).toBe('Espadon');
    expect(weaponIn(kael, 'offhand')).toBeUndefined();
    expect(carriedQty(kael, 'Dague')).toBe(1);
  });

  it('refuse d’armer la main faible quand les deux mains sont prises', () => {
    const apres = applyAction(
      scene({ abilities: [held(ESPADON)], inventory: [inBag(DAGUE)] }),
      { type: 'equip', actorId: 'pc', item: 'Dague', slot: 'offhand' },
    );
    expect(weaponIn(apres.combatants[0], 'offhand')).toBeUndefined();
    expect(apres.log.some((l) => l.text.includes('deux mains'))).toBe(true);
  });
});

describe('ranger', () => {
  it('libère la main et rend l’arme au sac', () => {
    const apres = applyAction(scene({ abilities: [held(EPEE)] }), {
      type: 'unequip',
      actorId: 'pc',
      slot: 'weapon',
    });
    const kael = apres.combatants[0];
    expect(weaponIn(kael, 'weapon')).toBeUndefined();
    expect(carriedQty(kael, 'Épée longue')).toBe(1);
  });

  it('le dit quand la main est déjà vide', () => {
    const apres = applyAction(scene(), { type: 'unequip', actorId: 'pc', slot: 'weapon' });
    expect(apres.log.some((l) => l.text.includes('rien dans cette main'))).toBe(true);
  });
});

/* ── Attire-métal : la main vide se referme d'elle-même ────────────────────── */

const pull = (over: Partial<CombatAbility> = {}): CombatAbility => ({
  id: 'spell:pull',
  name: 'Attire-métal',
  kind: 'spell',
  rangeMeters: 10,
  shape: { kind: 'single' },
  targets: ['enemy'],
  manaCost: 0,
  enduranceCost: 0,
  damages: [],
  autoHit: true,
  pullsMetal: true,
  ...over,
});

describe('Attire-métal referme les doigts sur l’arme volée', () => {
  function vol(mainDuLanceur: CombatAbility[]): Encounter {
    const enc = emptyEncounter('Duel');
    enc.phase = 'combat';
    enc.round = 1;
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 0, y: 0 },
        abilities: [pull(), ...mainDuLanceur],
        weaponProficiencies: ['longsword'],
      }),
      mkUnit({
        id: 'foe',
        name: 'Bandit',
        team: 'ennemis',
        pos: { x: 2, y: 0 },
        abilities: [held(EPEE)],
      }),
    ];
    return applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:pull',
      at: { x: 2, y: 0 },
      item: 'Épée longue',
    });
  }

  it('équipe d’office quand la main du lanceur est vide', () => {
    const apres = vol([]);
    const mage = apres.combatants[0];
    expect(weaponIn(mage, 'weapon')?.name).toBe('Épée longue');
    // Et la maîtrise est celle du VOLEUR, pas celle du volé.
    expect(weaponIn(mage, 'weapon')?.proficient).toBe(true);
    expect(apres.combatants[1].abilities.find((a) => a.kind === 'weapon')).toBeUndefined();
  });

  it('laisse l’arme au sac quand la main est déjà pleine', () => {
    const apres = vol([held(DAGUE)]);
    const mage = apres.combatants[0];
    expect(weaponIn(mage, 'weapon')?.name).toBe('Dague');
    expect(carriedQty(mage, 'Épée longue')).toBe(1);
  });

  it('ne dépense pas l’action bonus : c’est le sort qui referme la main', () => {
    expect(vol([]).combatants[0].bonusActionUsed).toBe(false);
  });
});

/* ── Les munitions ─────────────────────────────────────────────────────────
   Le décompte du carquois vivait chez la FABRIQUE, hors de `weaponAbility`.
   Tant que la fabrique était le seul chemin par lequel une arme arrivait en
   main, cela tenait. Dès qu'une arme a pu être volée, ramassée ou reprise au
   sac, l'arbalète volée tirait sans rien dépenser.
─────────────────────────────────────────────────────────────────────────── */

const ARBALETE: WeaponSource = {
  name: 'Arbalète',
  minDamage: 6,
  maxDamage: 12,
  weaponCategory: 'crossbow',
  material: 'acier',
};

const ARBALETE_POING: WeaponSource = {
  name: 'Arbalète de poing',
  minDamage: 4,
  maxDamage: 8,
  weaponCategory: 'handCrossbow',
  material: 'acier',
};

const CARREAUX = { name: 'Carreaux', damageType: 'piercing', damageBonus: 2 };

describe('une arme à distance exige ses munitions, d’où qu’elle vienne', () => {
  it('déclare son carquois dès sa construction', () => {
    expect(weaponAbility(ARBALETE, 'weapon', CARREAUX).consumes).toEqual({
      item: 'Carreaux',
      qty: 1,
    });
    // Une arme de mêlée ne consomme rien.
    expect(weaponAbility(EPEE, 'weapon').consumes).toBeUndefined();
  });

  it('reste soumise au décompte même sans munition appariée au catalogue', () => {
    // Sans ce garde-fou, une arme à distance que le catalogue ne sait pas
    // apparier tirerait à l'infini.
    expect(weaponAbility(ARBALETE, 'weapon').consumes).toBeDefined();
  });

  it('refuse de tirer quand le carquois est vide — arme reprise au sac', () => {
    const enc = scene({
      inventory: [
        { name: 'Arbalète', qty: 1, kind: 'other', metallic: true, weapon: { source: ARBALETE, ammo: CARREAUX } },
      ],
    });
    enc.combatants.push(mkUnit({ id: 'foe', name: 'Cible', team: 'ennemis', pos: { x: 6, y: 3 } }));
    const arme = applyAction(enc, { type: 'equip', actorId: 'pc', item: 'Arbalète' });
    expect(weaponIn(arme.combatants[0], 'weapon')?.consumes).toEqual({ item: 'Carreaux', qty: 1 });

    const tir = applyAction(arme, {
      type: 'use',
      actorId: 'pc',
      abilityId: 'weapon:weapon',
      at: { x: 6, y: 3 },
    });
    expect(tir.log.some((l) => l.text.toLowerCase().includes('plus de carreaux'))).toBe(true);
    // Le tir n'a pas eu lieu : la cible est intacte.
    expect(tir.combatants[1].hp).toBe(tir.combatants[1].base.hp);
  });

  it('tire et décompte quand le carquois est garni', () => {
    const enc = scene({
      inventory: [
        { name: 'Arbalète', qty: 1, kind: 'other', metallic: true, weapon: { source: ARBALETE, ammo: CARREAUX } },
        { name: 'Carreaux', qty: 3, kind: 'ammunition', metallic: true },
      ],
    });
    enc.combatants.push(mkUnit({ id: 'foe', name: 'Cible', team: 'ennemis', pos: { x: 6, y: 3 } }));
    const arme = applyAction(enc, { type: 'equip', actorId: 'pc', item: 'Arbalète' });
    const tir = applyAction(arme, {
      type: 'use',
      actorId: 'pc',
      abilityId: 'weapon:weapon',
      at: { x: 6, y: 3 },
    });
    expect(carriedQty(tir.combatants[0], 'Carreaux')).toBe(2);
  });

  it('une arbalète VOLÉE ne tire pas sans les carreaux de son ancien porteur', () => {
    const enc = emptyEncounter('Vol');
    enc.phase = 'combat';
    enc.round = 1;
    enc.combatants = [
      mkUnit({ id: 'mage', name: 'Mage', team: 'allies', pos: { x: 0, y: 0 }, abilities: [pull()] }),
      mkUnit({
        id: 'foe',
        name: 'Bandit',
        team: 'ennemis',
        pos: { x: 2, y: 0 },
        abilities: [weaponAbility(ARBALETE_POING, 'weapon', CARREAUX)],
        inventory: [{ name: 'Carreaux', qty: 20, kind: 'ammunition' }],
      }),
    ];
    const apres = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:pull',
      at: { x: 2, y: 0 },
      item: 'Arbalète de poing',
    });

    const mage = apres.combatants[0];
    // Elle se loge dans sa main vide — c'est le champ qui l'y amène…
    expect(weaponIn(mage, 'weapon')?.name).toBe('Arbalète de poing');
    // …mais les carreaux sont restés dans le carquois du bandit.
    expect(carriedQty(mage, 'Carreaux')).toBe(0);
    // Le tour suivant : l'action est refaite, seule la munition manque.
    mage.actionUsed = false;
    const tir = applyAction(apres, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'weapon:weapon',
      at: { x: 2, y: 0 },
    });
    expect(tir.log.some((l) => l.text.toLowerCase().includes('plus de carreaux'))).toBe(true);
    expect(tir.combatants[1].hp).toBe(tir.combatants[1].base.hp);
  });
});

/* ── Attire-métal aimante aussi le sol ─────────────────────────────────────
   Un champ qui arrache une épée d'un poing serré n'a aucune raison de laisser
   la même épée par terre. C'est ce qui permet de récupérer ce qu'on vient de
   projeter sans traverser le champ de bataille à pied.
─────────────────────────────────────────────────────────────────────────── */

describe('Attire-métal ramasse à distance', () => {
  function jonche(items: CarriedItem[], mainDuLanceur: CombatAbility[] = []): Encounter {
    const enc = emptyEncounter('Champ');
    enc.phase = 'combat';
    enc.round = 1;
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 0, y: 0 },
        abilities: [pull(), ...mainDuLanceur],
        weaponProficiencies: ['longsword'],
      }),
    ];
    for (const item of items) dropOnGround(enc, { x: 5, y: 0 }, item, item.qty);
    return enc;
  }

  const aimante = (enc: Encounter, item?: string): Encounter =>
    applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:pull',
      at: { x: 5, y: 0 },
      item,
    });

  it('attire une pièce de ferraille posée à distance, sans se déplacer', () => {
    const apres = aimante(
      jonche([{ name: 'Grappin', qty: 1, kind: 'other', metallic: true, weightKg: 2 }]),
    );
    expect(carriedQty(apres.combatants[0], 'Grappin')).toBe(1);
    expect(apres.ground?.['5,0']).toBeUndefined();
    // Le lanceur n'a pas bougé : c'est tout l'intérêt.
    expect(apres.combatants[0].pos).toEqual({ x: 0, y: 0 });
  });

  it('laisse au sol ce qui n’est pas ferreux', () => {
    const apres = aimante(jonche([{ name: 'Corde de chanvre', qty: 1, kind: 'other' }]));
    expect(carriedQty(apres.combatants[0], 'Corde de chanvre')).toBe(0);
    expect(apres.ground?.['5,0']?.[0].name).toBe('Corde de chanvre');
    expect(apres.log.some((l) => l.text.includes('Rien de ferreux à attirer'))).toBe(true);
  });

  it('respecte le choix du joueur quand la case en porte plusieurs', () => {
    const apres = aimante(
      jonche([
        { name: 'Grappin', qty: 1, kind: 'other', metallic: true },
        { name: 'Dague', qty: 1, kind: 'other', metallic: true, weapon: { source: DAGUE } },
      ]),
      // Une arme en main, pour que l'auto-équipement ne brouille pas la lecture.
      [held(EPEE)],
    );
    expect(carriedQty(apres.combatants[0], 'Dague')).toBe(0);
    expect(carriedQty(apres.combatants[0], 'Grappin')).toBe(1);
  });

  it('referme la main vide sur une arme attirée du sol', () => {
    const apres = aimante(
      jonche([{ name: 'Épée longue', qty: 1, kind: 'other', metallic: true, weapon: { source: EPEE } }]),
    );
    const mage = apres.combatants[0];
    expect(weaponIn(mage, 'weapon')?.name).toBe('Épée longue');
    // Et la maîtrise est bien celle du lanceur.
    expect(weaponIn(mage, 'weapon')?.proficient).toBe(true);
  });

  it('n’attire qu’UNE prise : viser quelqu’un debout sur un tas ne rapporte pas double', () => {
    const enc = jonche([{ name: 'Grappin', qty: 1, kind: 'other', metallic: true }]);
    enc.combatants.push(
      mkUnit({
        id: 'foe',
        name: 'Bandit',
        team: 'ennemis',
        pos: { x: 5, y: 0 },
        abilities: [held(DAGUE)],
      }),
    );
    const apres = aimante(enc, 'Dague');
    // La dague est volée au bandit ; le grappin reste par terre.
    expect(carriedQty(apres.combatants[0], 'Dague')).toBe(0); // …passée en main
    expect(weaponIn(apres.combatants[0], 'weapon')?.name).toBe('Dague');
    expect(apres.ground?.['5,0']?.[0].name).toBe('Grappin');
  });
});

/* ── L'identité d'un objet survit à ses déplacements ───────────────────────
   Un objet change de contenant sans arrêt : sac → sol → sac, sac → dépouille →
   sac. À chaque transfert, ce qu'il EST doit voyager avec lui, sans quoi il
   arrive inerte — un nom, une quantité, et plus rien à en faire.
─────────────────────────────────────────────────────────────────────────── */

describe('ce qu’un objet est survit au transfert', () => {
  it('garde arme et matière en passant par une dépouille', () => {
    const sac: CarriedItem[] = [
      { name: 'Épée longue', qty: 1, kind: 'other', metallic: true, weightKg: 1.5, weapon: { source: EPEE } },
    ];
    const depouille = carriedAsLoot(sac);
    expect(depouille[0].weapon?.source.name).toBe('Épée longue');
    expect(depouille[0].metallic).toBe(true);

    const heritier: CarriedItem[] = [];
    pour(heritier, depouille[0]);
    expect(heritier[0].weapon?.source.name).toBe('Épée longue');
    expect(heritier[0].metallic).toBe(true);
    expect(heritier[0].weightKg).toBe(1.5);
  });

  it('renseigne une ligne homonyme qui n’avait pas d’identité', () => {
    // Une ligne saisie à la main ne sait rien d'elle-même ; l'arrivée l'instruit.
    const sac: CarriedItem[] = [{ name: 'Épée longue', qty: 1, kind: 'other' }];
    pour(sac, { name: 'Épée longue', qty: 1, metallic: true, weapon: { source: EPEE } });
    expect(sac[0].qty).toBe(2);
    expect(sac[0].weapon?.source.name).toBe('Épée longue');
    expect(sac[0].metallic).toBe(true);
  });
});

/* ── Projette-métal puise dans ce qui traîne ───────────────────────────────── */

const throwMetal = (): CombatAbility => ({
  id: 'spell:throw',
  name: 'Projette-métal',
  kind: 'spell',
  rangeMeters: 20,
  shape: { kind: 'single' },
  targets: ['enemy'],
  manaCost: 0,
  enduranceCost: 0,
  damages: [{ min: 0, max: 0, type: 'lightning' }],
  throwsMetal: true,
  autoHit: true,
});

describe('Projette-métal saisit aussi ce qui gît par terre', () => {
  function champ(): Encounter {
    const enc = emptyEncounter('Champ');
    enc.phase = 'combat';
    enc.round = 1;
    enc.combatants = [
      mkUnit({ id: 'mage', name: 'Mage', team: 'allies', pos: { x: 3, y: 3 }, abilities: [throwMetal()] }),
      mkUnit({ id: 'foe', name: 'Bandit', team: 'ennemis', pos: { x: 8, y: 3 } }),
    ];
    // Une épée tombée juste à côté du lanceur.
    dropOnGround(enc, { x: 4, y: 3 }, { name: 'Épée longue', qty: 0, kind: 'other', metallic: true, weapon: { source: EPEE } }, 1);
    return enc;
  }

  it('voit la ferraille au sol comme une prise, les mains vides', () => {
    const enc = champ();
    const prises = metalWithinGrasp(enc.combatants[0], [
      { pos: { x: 4, y: 3 }, items: enc.ground!['4,3'] },
    ]);
    expect(prises.map((p) => p.name)).toEqual(['Épée longue']);
    expect(prises[0].source).toBe('ground');
    // Une lame lancée taille : le type vient de la catégorie de l'arme.
    expect(prises[0].thrown).toEqual({ min: 4, max: 9, type: 'slashing' });
  });

  it('une arme projetée reste une ARME au sol, puis dans le sac qui la ramasse', () => {
    // Le défaut : l'objet tombait en bagage inerte. On le ramassait, il figurait
    // bien à l'inventaire — mais plus rien ne disait que c'était une épée, donc
    // « Dégainer » ne s'affichait jamais, ce tour-là ni les suivants.
    const enc = emptyEncounter('Champ');
    enc.phase = 'combat';
    enc.round = 1;
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 3, y: 3 },
        abilities: [throwMetal()],
        inventory: [{ name: 'Épée longue', qty: 1, kind: 'other', metallic: true, weapon: { source: EPEE } }],
      }),
      mkUnit({ id: 'foe', name: 'Bandit', team: 'ennemis', pos: { x: 5, y: 3 } }),
    ];
    const lance = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:throw',
      at: { x: 5, y: 3 },
      item: 'Épée longue',
    });

    // Au sol, elle sait encore ce qu'elle est.
    const posee = Object.values(lance.ground ?? {}).flat()[0];
    expect(posee.weapon?.source.name).toBe('Épée longue');

    // Ramassée, elle reste équipable — et s'équipe.
    const tombee = Object.entries(lance.ground ?? {})[0][0].split(',').map(Number);
    lance.combatants[0].pos = { x: tombee[0], y: tombee[1] };
    const ramassee = applyAction(lance, {
      type: 'pickUp',
      actorId: 'mage',
      at: { x: tombee[0], y: tombee[1] },
      item: 'Épée longue',
    });
    expect(ramassee.combatants[0].inventory.find((i) => i.name === 'Épée longue')?.weapon)
      .toBeDefined();

    ramassee.combatants[0].bonusActionUsed = false;
    const enMain = applyAction(ramassee, { type: 'equip', actorId: 'mage', item: 'Épée longue' });
    expect(weaponIn(enMain.combatants[0], 'weapon')?.name).toBe('Épée longue');
  });

  it('la décoche sans se baisser, et elle quitte la case', () => {
    const apres = applyAction(champ(), {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:throw',
      at: { x: 8, y: 3 },
      item: 'Épée longue',
    });
    // Partie de sa case d'origine…
    expect(apres.ground?.['4,3']).toBeUndefined();
    // …et retombée près de la cible.
    expect(apres.ground?.['7,3']?.[0].name).toBe('Épée longue');
    // Le sac du lanceur n'a jamais été touché.
    expect(carriedQty(apres.combatants[0], 'Épée longue')).toBe(0);
  });

  it('reste indisponible quand il n’y a de ferraille ni sur soi ni au sol', () => {
    const enc = champ();
    delete enc.ground;
    const apres = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'spell:throw',
      at: { x: 8, y: 3 },
    });
    expect(apres.log.some((l) => l.text.includes('Rien de ferreux à projeter'))).toBe(true);
  });
});
