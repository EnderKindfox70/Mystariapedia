import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import loupGris from '../../../public/resources/json/bestiary/loup-gris.json';
import belier from '../../../public/resources/json/bestiary/belier-des-cimes.json';
import chien from '../../../public/resources/json/bestiary/chien-de-troupeau.json';
import corneille from '../../../public/resources/json/bestiary/corneille_funeste.json';
import hurleVent from '../../../public/resources/json/bestiary/hurle-vent.json';
import lezard from '../../../public/resources/json/bestiary/lezard-rocailleux.json';
import poule from '../../../public/resources/json/bestiary/poule-des-chaumes.json';
import scarabee from '../../../public/resources/json/bestiary/scarabee-pollinisateur-geant.json';
import serpentFantome from '../../../public/resources/json/bestiary/serpent-fantome.json';
import serpentMarais from '../../../public/resources/json/bestiary/serpent-des-marais.json';
import truite from '../../../public/resources/json/bestiary/truite-de-courant.json';
import vache from '../../../public/resources/json/bestiary/vache-des-vallons.json';
import classCatalog from '../../../public/resources/json/characters/classes.json';
import { AttributeKey, ClassDef, StatKey } from '../character/character.types';
import { BestiaryEntry } from '../wiki.types';
import { CombatantFactory } from './combatant-factory';
import { SpellsService } from '../services/spells.service';
import { normalizeTerrain, terrainKind } from './terrain';
import {
  classSkillsFor,
  consumableAbility,
  GUARD_DEFENSE_BONUS,
  CLASS_SKILL_ENDURANCE_FACTOR,
  GUARD_ENDURANCE_GAIN,
  guardAbility,
  enchantTargetOf,
  parseDice,
  spellAbility,
  PUGILIST_UNARMED_RATIO,
  UNARMED_ATTACK_RATIO,
  unarmedAbility,
  unarmedDamage,
  unarmedRatioFor,
  usesAmmunition,
  weaponAbility,
} from './abilities';
import { Affinities, Combatant, CombatAbility, Encounter, Team } from './combat.types';
import { Rng } from './dice';
import { emptyEncounter } from './encounter';
import {
  cellsInShape,
  hasLineOfSight,
  metersBetween,
  movementMeters,
  parseRangeMeters,
  parseShape,
  reachableCells,
  unitDistanceMeters,
} from './grid';
import {
  abilityDamageRanges,
  abilityHealAmount,
  abilityManaAmount,
  ambienceDamageFactor,
  applyAction,
  effectiveManaCost,
  applyStatus,
  cannotUse,
  carriedQty,
  currentUnit,
  damageReduction,
  DISADVANTAGE_PRECISION,
  GRAZE_FACTOR,
  GRAZE_STEPS,
  HIT_TARGET_BASE,
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  aims,
  hitThreshold,
  isDisadvantaged,
  reflexThreshold,
  resolveReflexRoll,
  outcomeOf,
  precisionOf,
  resolveHitRoll,
  scalingFalloff,
  pendingStrikeTargets,
  reactionOptions,
  effectiveStat,
  ENDURANCE_RECOVERY_BASE,
  ENDURANCE_RECOVERY_FLOOR,
  MOVE_FREE_METERS,
  MOVE_METERS_PER_ENDURANCE,
  affordableMovement,
  movementToll,
  WINDED_PRECISION_PENALTY,
  WINDED_RECOVERY_SHARE,
  WINDED_SPEED_SHARE,
  enduranceRecovery,
  evadeChance,
  naturalEvade,
  findUnit,
  isOver,
  movementBudget,
  resolveScaling,
  WEAPON_ATTACK_RATIO,
} from './rules';

/* ── Fabriques de test ─────────────────────────────────────────────────────── */

const STATS = (over: Partial<Record<StatKey, number>> = {}): Record<StatKey, number> => ({
  hp: 40,
  mana: 20,
  endurance: 20,
  speed: 10,
  atk_phy: 20,
  atk_mag: 20,
  def_phy: 0,
  def_mag: 0,
  ...over,
});

const ATTRS = (over: Partial<Record<AttributeKey, number>> = {}): Record<AttributeKey, number> => ({
  force: 10,
  dexterite: 10,
  constitution: 10,
  intelligence: 10,
  sagesse: 10,
  charisme: 10,
  ...over,
});

const NO_AFFINITY = (over: Partial<Affinities> = {}): Affinities => ({
  immunities: [],
  resistances: [],
  weaknesses: [],
  absorptions: [],
  ...over,
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

/** Une frappe qui touche toujours et fait exactement 10 dégâts tranchants. */
const flatHit = (over: Partial<CombatAbility> = {}): CombatAbility => ({
  id: 'test:hit',
  name: 'Frappe test',
  kind: 'weapon',
  rangeMeters: 1.5,
  shape: { kind: 'single' },
  targets: ['enemy'],
  manaCost: 0,
  enduranceCost: 0,
  damages: [{ min: 10, max: 10, type: 'slashing' }],
  autoHit: true,
  ...over,
});

function duel(
  attackerOver: Partial<Combatant> = {},
  defenderOver: Partial<Combatant> = {},
): Encounter {
  const enc = emptyEncounter('Test');
  enc.seed = 42;
  enc.combatants = [
    mkUnit({
      id: 'a',
      name: 'Attaquant',
      team: 'allies',
      pos: { x: 0, y: 0 },
      abilities: [flatHit()],
      ...attackerOver,
    }),
    mkUnit({ id: 'b', name: 'Cible', team: 'ennemis', pos: { x: 1, y: 0 }, ...defenderOver }),
  ];
  return enc;
}

const strike = (enc: Encounter, at = { x: 1, y: 0 }): Encounter =>
  applyAction(enc, { type: 'use', actorId: 'a', abilityId: 'test:hit', at });

/* ── Grille ────────────────────────────────────────────────────────────────── */

describe('grille', () => {
  it('mesure les distances en Tchebychev, converties en mètres', () => {
    expect(metersBetween({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1.5);
    // La diagonale coûte comme la ligne droite : 3 cases, pas 3×√2.
    expect(metersBetween({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(4.5);
  });

  it('mesure depuis le bord de l’empreinte des grandes créatures', () => {
    const ogre = mkUnit({ id: 'o', name: 'Ogre', team: 'ennemis', footprint: 2, pos: { x: 0, y: 0 } });
    const nain = mkUnit({ id: 'n', name: 'Nain', team: 'allies', pos: { x: 2, y: 1 } });
    // L'ogre occupe (0,0)-(1,1) : son pied droit est au contact du nain.
    expect(unitDistanceMeters(ogre, nain)).toBe(1.5);
  });

  it('lit les portées écrites sur les fiches', () => {
    expect(parseRangeMeters('12 m')).toBe(12);
    expect(parseRangeMeters('Contact')).toBe(1.5);
    expect(parseRangeMeters('Personnel')).toBe(0);
    expect(parseRangeMeters('Autour de soi')).toBe(1.5);
  });

  it('lit les zones écrites sur les fiches', () => {
    expect(parseShape('Rayon 5 m')).toEqual({ kind: 'radius', meters: 5 });
    expect(parseShape('Cône 8 m')).toEqual({ kind: 'cone', meters: 8 });
    expect(parseShape('Ligne 10 m')).toEqual({ kind: 'line', meters: 10 });
    expect(parseShape('Soi-même')).toEqual({ kind: 'self' });
    expect(parseShape('Cible unique')).toEqual({ kind: 'single' });
    expect(parseShape('1 à 5 cibles')).toEqual({ kind: 'targets', count: 5 });
    // Une formulation narrative ne doit pas casser : elle retombe sur l'unique.
    expect(parseShape('Bassin / source')).toEqual({ kind: 'single' });
  });

  it('dessine un rayon centré sur la case visée', () => {
    const grid = { width: 20, height: 20 };
    // 3 m = 2 cases de rayon → carré 5×5.
    const cells = cellsInShape({ kind: 'radius', meters: 3 }, { x: 0, y: 0 }, { x: 10, y: 10 }, grid);
    expect(cells).toHaveLength(25);
    expect(cells).toContainEqual({ x: 10, y: 10 });
    expect(cells).toContainEqual({ x: 12, y: 12 });
    expect(cells).not.toContainEqual({ x: 13, y: 10 });
  });

  it('projette une ligne depuis le lanceur vers la cible', () => {
    const cells = cellsInShape(
      { kind: 'line', meters: 6 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { width: 20, height: 20 },
    );
    expect(cells).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
  });

  it('ouvre le cône dans la direction visée, et pas derrière', () => {
    const cells = cellsInShape(
      { kind: 'cone', meters: 4.5 },
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { width: 20, height: 20 },
    );
    expect(cells).toContainEqual({ x: 6, y: 5 });
    expect(cells).toContainEqual({ x: 8, y: 7 });
    // Derrière le lanceur : hors du cône.
    expect(cells).not.toContainEqual({ x: 4, y: 5 });
  });

  it('convertit la vitesse en mètres de déplacement', () => {
    // Allure de référence : 4 cases pour une vitesse de 10.
    expect(movementMeters(10)).toBe(6);
    expect(movementMeters(20)).toBe(10.5);
    // Une vitesse effondrée laisse toujours un pas : on ne fige personne à 0.
    expect(movementMeters(0)).toBe(1.5);
  });

  it('contourne les murs et paie double le terrain difficile', () => {
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies', pos: { x: 0, y: 0 } });
    const reach = reachableCells(
      unit,
      3,
      { width: 10, height: 10 },
      { '1,0': 'mur', '0,1': 'ruines' },
      [unit],
    );
    // Mur : la case est retirée de l'accessible.
    expect(reach.has('1,0')).toBe(false);
    // Terrain difficile : atteignable, mais à 3 m au lieu de 1,5 m.
    expect(reach.get('0,1')?.cost).toBe(3);
  });
});

/* ── Riposte ───────────────────────────────────────────────────────────────── */

describe('riposte', () => {
  const EPINES = { damageMin: 3, damageMax: 3, damageType: 'piercing' } as const;

  /** Une cible hérissée d'épines, et un assaillant à la distance voulue. */
  const epines = (
    arme: CombatAbility,
    distance: number,
    trigger: 'melee' | 'unarmed' | 'any' = 'unarmed',
  ) => {
    const enc = duel(
      { abilities: [{ ...arme, id: 'test:hit', autoHit: true }] },
      { pos: { x: distance, y: 0 } },
    );
    findUnit(enc, 'b')!.effects.push({
      id: 'e',
      name: 'Durcissement',
      remaining: 5,
      mods: [],
      retaliate: { ...EPINES, trigger },
    });
    return applyAction(enc, {
      type: 'use',
      actorId: 'a',
      abilityId: 'test:hit',
      at: { x: distance, y: 0 },
    });
  };
  const aRiposte = (enc: Encounter) => enc.log.some((l) => l.text.includes('riposte'));

  const EPEE = { name: 'Épée', minDamage: 5, maxDamage: 5, weaponCategory: 'longsword' };
  const LANCE = { name: 'Lance', minDamage: 5, maxDamage: 5, weaponCategory: 'spear' };
  const ARC = { name: 'Arc', minDamage: 5, maxDamage: 5, weaponCategory: 'longBow' };
  const SORT = () => flatHit({ kind: 'spell', damages: [{ min: 5, max: 5, type: 'fire' }] });
  const CROCS = (): CombatAbility => ({ ...unarmedAbility(), kind: 'natural', unarmed: false });

  describe('« unarmed » — ne punit que ce qui touche la chair', () => {
    it('blesse le poing et les crocs', () => {
      expect(aRiposte(epines(unarmedAbility(), 1))).toBe(true);
      expect(aRiposte(epines(CROCS(), 1))).toBe(true);
    });

    it('laisse le fer indemne, même au contact', () => {
      // C'est là toute la différence : l'arme tient son porteur à distance des
      // épines. Une pique ne « vole » pas, un sort non plus.
      expect(aRiposte(epines(weaponAbility(EPEE, 'weapon'), 1))).toBe(false);
      expect(aRiposte(epines(weaponAbility(LANCE, 'weapon'), 1))).toBe(false);
      expect(aRiposte(epines(SORT(), 1))).toBe(false);
    });
  });

  describe('« melee » — punit tout ce qui frappe de près', () => {
    it('se déclenche sur la distance, quelle que soit l’arme', () => {
      expect(aRiposte(epines(unarmedAbility(), 1, 'melee'))).toBe(true);
      expect(aRiposte(epines(weaponAbility(EPEE, 'weapon'), 1, 'melee'))).toBe(true);
      expect(aRiposte(epines(SORT(), 1, 'melee'))).toBe(true);
    });

    it('épargne qui frappe de plus loin — allonge comprise', () => {
      // Une lance porte à 3 m : hors de portée de la riposte.
      expect(weaponAbility(LANCE, 'weapon').rangeMeters).toBe(3);
      expect(aRiposte(epines(weaponAbility(LANCE, 'weapon'), 2, 'melee'))).toBe(false);
      expect(aRiposte(epines(weaponAbility(ARC, 'weapon'), 6, 'melee'))).toBe(false);
    });
  });

  it('« any » atteint jusqu’à l’archer', () => {
    expect(aRiposte(epines(weaponAbility(ARC, 'weapon'), 6, 'any'))).toBe(true);
  });

  it('ne se déclenche que sur ce qui blesse', () => {
    // Un buff ou un malus posé au contact ne « saisit » personne.
    const malus = flatHit({ damages: [], duration: 2, mods: [{ stat: 'speed', value: 3 }] });
    expect(aRiposte(epines(malus, 1, 'melee'))).toBe(false);
  });
});

/* ── Non-cumul des effets ──────────────────────────────────────────────────── */

describe('effets — un buff ne s’empile pas sur lui-même', () => {
  /** Le lézard rocailleux se durcit `fois` de suite, sans rien attendre. */
  const durcir = (fois: number): Combatant => {
    // Repartir à neuf : un même test appelle cette fabrique plusieurs fois pour
    // comparer une carapace à trois, et le TestBed refuse d'être reconfiguré.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const factory = TestBed.inject(CombatantFactory);
    let enc = emptyEncounter('Éboulis');
    enc.combatants = [
      factory.fromBestiary(lezard as unknown as BestiaryEntry, 'ennemis', { x: 0, y: 0 }),
      factory.fromBestiary(loupGris as unknown as BestiaryEntry, 'allies', { x: 5, y: 0 }),
    ];
    enc = applyAction(enc, { type: 'start' });
    const bete = enc.combatants[0];
    const durcissement = bete.abilities.find((a) => a.name === 'Durcissement')!;

    for (let i = 0; i < fois; i++) {
      // On le laisse relancer sans attendre son tour : c'est précisément le cas
      // qu'on veut voir échouer à s'empiler.
      const unit = findUnit(enc, bete.id)!;
      unit.actionUsed = false;
      unit.endurance = unit.base.endurance;
      enc.order = [bete.id];
      enc.turnIndex = 0;
      enc = applyAction(enc, { type: 'use', actorId: bete.id, abilityId: durcissement.id, at: unit.pos });
    }
    return findUnit(enc, bete.id)!;
  };

  it('ne pose qu’un seul Durcissement, si souvent qu’il le relance', () => {
    const une = durcir(1);
    const trois = durcir(3);
    expect(une.effects.filter((e) => e.name === 'Durcissement')).toHaveLength(1);
    expect(trois.effects.filter((e) => e.name === 'Durcissement')).toHaveLength(1);
  });

  it('n’en tire aucune défense supplémentaire', () => {
    // Trois carapaces superposées vaudraient +30 de défense : le lézard
    // deviendrait inentamable en trois tours. Il vaut ce qu'il vaut, un point.
    expect(effectiveStat(durcir(3), 'def_phy')).toBe(effectiveStat(durcir(1), 'def_phy'));
  });

  it('ne dilue pas non plus le contre-coup', () => {
    // Le prix de la parade — la lenteur — doit rester payé une seule fois, mais
    // payé : le buff ne peut pas être reconduit indéfiniment à moitié tarif.
    expect(effectiveStat(durcir(3), 'speed')).toBe(effectiveStat(durcir(1), 'speed'));
    expect(effectiveStat(durcir(1), 'speed')).toBeLessThan(effectiveStat(durcir(0), 'speed'));
  });

  it('mais repart pour sa durée pleine', () => {
    const unit = durcir(2);
    const buff = unit.effects.find((e) => e.name === 'Durcissement')!;
    expect(buff.remaining).toBe(5);
  });
});

/* ── Décors ────────────────────────────────────────────────────────────────── */

describe('décors', () => {
  const mover = () => mkUnit({ id: 'u', name: 'U', team: 'allies', pos: { x: 0, y: 0 } });
  const reach = (terrain: Record<string, string>) =>
    reachableCells(mover(), 6, { width: 10, height: 10 }, terrain, [mover()]);

  it('croise passage, vue et coût — c’est ce qui distingue les décors', () => {
    // Un gouffre se franchit du regard mais pas des pieds ; un fourré fait
    // exactement l'inverse. Sans ces deux axes, tout décor serait un mur.
    const gouffre = terrainKind('gouffre')!;
    expect(gouffre.blocksMovement).toBe(true);
    expect(gouffre.blocksSight).toBe(false);

    const fourre = terrainKind('fourre')!;
    expect(fourre.blocksMovement).toBe(false);
    expect(fourre.blocksSight).toBe(true);
    expect(fourre.moveCost).toBe(2);
  });

  it('interdit de traverser un décor infranchissable', () => {
    for (const dur of ['mur', 'rocher', 'arbre', 'gouffre']) {
      expect(reach({ '1,0': dur }).has('1,0'), dur).toBe(false);
    }
  });

  it('laisse traverser un décor pénible, mais au double du prix', () => {
    for (const mou of ['eau', 'boue', 'fourre', 'ruines']) {
      expect(reach({ '0,1': mou }).get('0,1')?.cost, mou).toBe(3);
    }
  });

  it('ne coupe la vue que par ce qui est opaque', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 4, y: 0 };
    expect(hasLineOfSight(from, to, { '2,0': 'mur' })).toBe(false);
    expect(hasLineOfSight(from, to, { '2,0': 'fourre' })).toBe(false);
    // On tire au-dessus d'un gouffre et d'une flaque.
    expect(hasLineOfSight(from, to, { '2,0': 'gouffre' })).toBe(true);
    expect(hasLineOfSight(from, to, { '2,0': 'eau' })).toBe(true);
  });

  it('relit une rencontre sauvegardée avant les types de décor', () => {
    // L'ancienne forme portait deux listes ; elle doit rester jouable.
    const migre = normalizeTerrain({ walls: ['1,1'], difficult: ['2,2'] });
    expect(migre).toEqual({ '1,1': 'mur', '2,2': 'ruines' });
    // Et la forme courante traverse la migration sans dommage.
    expect(normalizeTerrain({ '3,3': 'eau' })).toEqual({ '3,3': 'eau' });
  });
});

/* ── Garde ─────────────────────────────────────────────────────────────────── */

describe('garde', () => {
  it('est offerte à tout le monde, et ne blesse personne', () => {
    const garde = guardAbility();
    expect(garde.kind).toBe('guard');
    expect(garde.damages).toHaveLength(0);
    expect(garde.targets).toEqual(['self']);
  });

  it('renforce les deux défenses jusqu’au tour suivant', () => {
    let enc = duel({ abilities: [{ ...guardAbility(), id: 'test:hit' }], endurance: 20 });
    enc = applyAction(enc, { type: 'start' });
    const avant = effectiveStat(findUnit(enc, 'a')!, 'def_phy');

    enc = applyAction(enc, { type: 'use', actorId: 'a', abilityId: 'test:hit', at: { x: 0, y: 0 } });
    const garde = findUnit(enc, 'a')!;
    expect(effectiveStat(garde, 'def_phy')).toBe(avant + GUARD_DEFENSE_BONUS);
    expect(effectiveStat(garde, 'def_mag')).toBe(avant + GUARD_DEFENSE_BONUS);
    expect(garde.actionUsed).toBe(true);
  });

  it('réduit vraiment les dégâts encaissés', () => {
    const frappe = (enGarde: boolean): number => {
      const enc = duel({}, { abilities: [] });
      if (enGarde) {
        findUnit(enc, 'b')!.effects.push({
          id: 'g',
          name: 'Garde',
          remaining: 1,
          mods: [
            { stat: 'def_phy', value: GUARD_DEFENSE_BONUS },
            { stat: 'def_mag', value: GUARD_DEFENSE_BONUS },
          ],
        });
      }
      return 40 - findUnit(strike(enc), 'b')!.hp;
    };
    expect(frappe(true)).toBeLessThan(frappe(false));
  });

  it('rend du souffle au lieu d’en coûter', () => {
    // C'est ce qui donne son tempo au combat : on frappe tant qu'on tient, on
    // se couvre pour reprendre haleine. Se garder n'est plus le tour qu'on
    // subit faute de mieux.
    const enc = applyAction(duel({ abilities: [guardAbility()], endurance: 3 }), { type: 'start' });
    const avant = findUnit(enc, 'a')!.endurance;
    const apres = applyAction(enc, { type: 'use', actorId: 'a', abilityId: 'guard', at: { x: 0, y: 0 } });
    expect(findUnit(apres, 'a')!.endurance).toBe(avant + GUARD_ENDURANCE_GAIN);
  });
});

/* ── Dés ───────────────────────────────────────────────────────────────────── */

describe('dés', () => {
  it('rejoue exactement la même séquence depuis (graine, compteur)', () => {
    const first = new Rng(1234);
    const drawn = [first.d20(), first.d20(), first.d20()];

    // Reprise d'une partie sauvegardée : on repart du compteur, pas du début.
    const resumed = new Rng(1234, 2);
    expect(resumed.d20()).toBe(drawn[2]);
  });

  it('reste dans les bornes demandées', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 500; i++) {
      const value = rng.int(3, 8);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(8);
    }
  });
});

/* ── Dégâts et affinités ───────────────────────────────────────────────────── */

describe('dégâts', () => {
  it('retire les PV et rend le détail du calcul', () => {
    const after = strike(duel());
    expect(findUnit(after, 'b')!.hp).toBe(30);
    expect(after.log.some((l) => l.kind === 'damage')).toBe(true);
  });

  it('halve les dégâts sur une résistance', () => {
    const after = strike(duel({}, { affinities: NO_AFFINITY({ resistances: ['slashing'] }) }));
    expect(findUnit(after, 'b')!.hp).toBe(35);
  });

  it('majore les dégâts sur une faiblesse', () => {
    const after = strike(duel({}, { affinities: NO_AFFINITY({ weaknesses: ['slashing'] }) }));
    expect(findUnit(after, 'b')!.hp).toBe(25);
  });

  it('annule les dégâts sur une immunité', () => {
    const after = strike(duel({}, { affinities: NO_AFFINITY({ immunities: ['slashing'] }) }));
    expect(findUnit(after, 'b')!.hp).toBe(40);
  });

  it('soigne au lieu de blesser sur une absorption', () => {
    const enc = duel({}, { affinities: NO_AFFINITY({ absorptions: ['slashing'] }), hp: 20 });
    expect(findUnit(strike(enc), 'b')!.hp).toBe(30);
  });

  it('met la cible hors de combat à 0 PV et clôt le combat', () => {
    const enc = duel({}, { hp: 6 });
    const started = applyAction(enc, { type: 'start' });
    const after = strike(started);
    const target = findUnit(after, 'b')!;
    expect(target.hp).toBe(0);
    expect(target.down).toBe(true);
    expect(after.log.some((l) => l.kind === 'death')).toBe(true);
    expect(isOver(after)).toBe(true);
  });

  it('ajoute le scaling de l’attaquant aux dégâts de base', () => {
    const enc = duel({
      abilities: [
        flatHit({ damages: [{ min: 10, max: 10, type: 'slashing', scaling: [{ source: 'atk_phy', ratio: 0.5 }] }] }),
      ],
    });
    // 10 (dés) + 0,5 × 20 (atk_phy) = 20.
    expect(findUnit(strike(enc), 'b')!.hp).toBe(20);
  });
});

/* ── Défense et jets de toucher ────────────────────────────────────────────── */

describe('défense', () => {
  const armored = (over: Partial<Record<StatKey, number>>) =>
    mkUnit({ id: 'b', name: 'B', team: 'ennemis', base: STATS(over) });

  it('absorbe un POURCENTAGE, pas un nombre de points fixe', () => {
    // déf / (déf + 25).
    expect(damageReduction(armored({ def_phy: 0 }), 'slashing')).toBe(0);
    expect(damageReduction(armored({ def_phy: 25 }), 'slashing')).toBeCloseTo(0.5);
    expect(damageReduction(armored({ def_phy: 75 }), 'slashing')).toBeCloseTo(0.75);
  });

  it('oppose la bonne défense selon le type de dégâts', () => {
    const target = armored({ def_phy: 5, def_mag: 25 });
    expect(damageReduction(target, 'slashing')).toBeCloseTo(5 / 30);
    expect(damageReduction(target, 'fire')).toBeCloseTo(0.5);
    expect(damageReduction(target, 'true')).toBe(0);
  });

  it('n’atteint JAMAIS 100 % : il en passe toujours au moins un point', () => {
    // C'est la propriété qui compte : une armure protège, elle ne rend pas
    // invulnérable. Une soustraction plate, elle, annulait les petits coups.
    for (const def of [10, 50, 200, 1000]) {
      expect(damageReduction(armored({ def_phy: def }), 'slashing')).toBeLessThan(1);
      const after = strike(duel({}, { base: STATS({ def_phy: def }) }));
      expect(findUnit(after, 'b')!.hp).toBeLessThan(40);
    }
  });

  it('laisse malgré tout une immunité tout annuler', () => {
    // Le plancher d'un point ne doit pas ressusciter des dégâts qu'une immunité
    // a déjà effacés.
    const after = strike(
      duel({}, { base: STATS({ def_phy: 10 }), affinities: NO_AFFINITY({ immunities: ['slashing'] }) }),
    );
    expect(findUnit(after, 'b')!.hp).toBe(40);
  });

  it('traite un petit coup et une grosse frappe de la même façon', () => {
    // Le défaut de la soustraction plate : elle annulait le poing et ne pesait
    // rien sur l'ultime. Le pourcentage retire la même PART aux deux.
    const petit = flatHit({ damages: [{ min: 5, max: 5, type: 'slashing' }] });
    const gros = flatHit({ damages: [{ min: 60, max: 60, type: 'slashing' }] });
    const cible = { base: STATS({ def_phy: 25, hp: 500 }), hp: 500 };

    const a = strike(duel({ abilities: [{ ...petit, id: 'test:hit' }] }, cible));
    const b = strike(duel({ abilities: [{ ...gros, id: 'test:hit' }] }, cible));
    // 50 % d'absorption dans les deux cas.
    expect(500 - findUnit(a, 'b')!.hp).toBe(3);
    expect(500 - findUnit(b, 'b')!.hp).toBe(30);
  });

  it('s’applique APRÈS l’affinité', () => {
    // Résistance : 10 ×0,5 = 5, puis −50 % d'armure = 3 (arrondi).
    const after = strike(
      duel({}, { base: STATS({ def_phy: 25 }), affinities: NO_AFFINITY({ resistances: ['slashing'] }) }),
    );
    expect(findUnit(after, 'b')!.hp).toBe(37);
  });

  it('pare chaque composante avec la défense de SON type', () => {
    const mixed = flatHit({
      damages: [
        { min: 10, max: 10, type: 'slashing' },
        { min: 10, max: 10, type: 'fire' },
      ],
    });
    const after = strike(
      duel({ abilities: [{ ...mixed, id: 'test:hit' }] }, { base: STATS({ def_phy: 25, def_mag: 0 }) }),
    );
    // Part physique halvée par l'armure, part magique intacte : 5 + 10 = 15.
    expect(findUnit(after, 'b')!.hp).toBe(25);
  });

  it('ne pénalise pas un enchaînement plus qu’un coup unique', () => {
    // Un pourcentage frappe chaque coup pareil : quatre coups de 6 subissent la
    // même part qu'un coup de 24. C'est ce qui empêche l'armure d'effacer une
    // rafale entière, comme le faisait la soustraction plate.
    const rafale = flatHit({
      damages: Array.from({ length: 4 }, () => ({ min: 6, max: 6, type: 'bludgeoning' })),
    });
    const unique = flatHit({ damages: [{ min: 24, max: 24, type: 'bludgeoning' }] });
    const cible = { base: STATS({ def_phy: 25 }) };

    const a = strike(duel({ abilities: [{ ...rafale, id: 'test:hit' }] }, cible));
    const b = strike(duel({ abilities: [{ ...unique, id: 'test:hit' }] }, cible));
    expect(40 - findUnit(a, 'b')!.hp).toBe(40 - findUnit(b, 'b')!.hp);
  });

  it('ne pare pas ce qui agit de l’intérieur (effets par tour)', () => {
    // Une armure n'arrête pas un poison déjà dans les veines.
    const enc = applyAction(duel({}, { base: STATS({ def_phy: 50, def_mag: 50 }) }), {
      type: 'start',
    });
    applyStatus(enc, findUnit(enc, 'b')!, 'brulure', findUnit(enc, 'a'));
    const before = findUnit(enc, 'b')!.hp;
    const next = applyAction(enc, { type: 'endTurn' });
    expect(findUnit(next, 'b')!.hp).toBeLessThan(before);
  });

  it('ne pare pas un ajustement manuel du MJ', () => {
    const enc = duel({}, { base: STATS({ def_phy: 50, def_mag: 50 }) });
    const after = applyAction(enc, { type: 'damage', targetId: 'b', amount: 12 });
    expect(findUnit(after, 'b')!.hp).toBe(28);
  });
});

/* ── Portée et conditions d'usage ──────────────────────────────────────────── */

describe('conditions d’usage', () => {
  it('refuse une cible hors de portée', () => {
    const enc = duel({}, { pos: { x: 10, y: 0 } });
    const actor = findUnit(enc, 'a')!;
    expect(cannotUse(enc, actor, flatHit(), { x: 10, y: 0 })).toMatch(/Hors de portée/);
  });

  it('refuse quand la ligne de vue est coupée', () => {
    const enc = duel({}, { pos: { x: 4, y: 0 } });
    enc.terrain['2,0'] = 'mur';
    const actor = findUnit(enc, 'a')!;
    expect(cannotUse(enc, actor, flatHit({ rangeMeters: 12 }), { x: 4, y: 0 })).toMatch(
      /ligne de vue/,
    );
  });

  it('refuse un sort sans assez de mana', () => {
    const enc = duel({ mana: 2 });
    const actor = findUnit(enc, 'a')!;
    expect(cannotUse(enc, actor, flatHit({ kind: 'spell', manaCost: 10 }), { x: 1, y: 0 })).toMatch(
      /Mana insuffisant/,
    );
  });

  it('refuse d’agir sous un statut qui paralyse', () => {
    const enc = duel();
    applyStatus(enc, findUnit(enc, 'a')!, 'paralysie', undefined);
    const actor = findUnit(enc, 'a')!;
    expect(cannotUse(enc, actor, flatHit(), { x: 1, y: 0 })).toMatch(/ne peut pas agir/);
  });

  it('n’autorise qu’une action par tour', () => {
    const enc = applyAction(duel(), { type: 'start' });
    const once = strike(enc);
    const twice = strike(once);
    // Le second coup est refusé : les PV n'ont pas rebougé.
    expect(findUnit(twice, 'b')!.hp).toBe(findUnit(once, 'b')!.hp);
    expect(twice.log.some((l) => l.text.includes('Action déjà utilisée'))).toBe(true);
  });
});

/* ── Déplacement ───────────────────────────────────────────────────────────── */

describe('déplacement', () => {
  it('autorise un déplacement dans le budget de vitesse', () => {
    const enc = applyAction(duel(), { type: 'start' });
    // Vitesse 10 → 6 m, soit 4 cases pile.
    const after = applyAction(enc, { type: 'move', actorId: 'a', to: { x: 0, y: 4 } });
    expect(findUnit(after, 'a')!.pos).toEqual({ x: 0, y: 4 });
    expect(findUnit(after, 'a')!.moved).toBe(6);
  });

  it('refuse un déplacement au-delà du budget', () => {
    const enc = applyAction(duel(), { type: 'start' });
    // La 5e case est hors d'atteinte.
    const after = applyAction(enc, { type: 'move', actorId: 'a', to: { x: 0, y: 5 } });
    expect(findUnit(after, 'a')!.pos).toEqual({ x: 0, y: 0 });
    expect(after.log.some((l) => l.text.includes('ne peut pas atteindre'))).toBe(true);
  });

  it('décompte le budget entre deux déplacements du même tour', () => {
    const enc = applyAction(duel(), { type: 'start' });
    const first = applyAction(enc, { type: 'move', actorId: 'a', to: { x: 0, y: 3 } });
    expect(findUnit(first, 'a')!.moved).toBe(4.5);
    // 4,5 m consommés sur 6 : il reste une seule case, la 5e est hors d'atteinte.
    const tooFar = applyAction(first, { type: 'move', actorId: 'a', to: { x: 0, y: 5 } });
    expect(findUnit(tooFar, 'a')!.pos).toEqual({ x: 0, y: 3 });
    const ok = applyAction(first, { type: 'move', actorId: 'a', to: { x: 0, y: 4 } });
    expect(findUnit(ok, 'a')!.pos).toEqual({ x: 0, y: 4 });
  });

  it('immobilise sous un statut qui bloque le mouvement', () => {
    const enc = applyAction(duel(), { type: 'start' });
    applyStatus(enc, findUnit(enc, 'a')!, 'enracinement', undefined);
    const after = applyAction(enc, { type: 'move', actorId: 'a', to: { x: 0, y: 2 } });
    expect(findUnit(after, 'a')!.pos).toEqual({ x: 0, y: 0 });
  });

  it('tient compte des buffs de vitesse dans le budget', () => {
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies' });
    expect(movementBudget(unit)).toBe(6);
    unit.effects.push({ id: 'e', name: 'Hâte', remaining: 3, mods: [{ stat: 'speed', value: 10 }] });
    expect(effectiveStat(unit, 'speed')).toBe(20);
    expect(movementBudget(unit)).toBe(10.5);
  });
});

/* ── Endurance ─────────────────────────────────────────────────────────────── */

describe('endurance', () => {
  it('rend peu par tour — moins qu’une attaque ne coûte', () => {
    // Tant que la récupération passive couvrait la dépense, la jauge MONTAIT
    // pendant qu'on se battait : 2 784 combats mesurés sans un seul tour perdu
    // faute de souffle. Reprendre haleine doit se mériter.
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies' });
    expect(enduranceRecovery(unit)).toBe(ENDURANCE_RECOVERY_BASE);
    expect(enduranceRecovery(unit)).toBeLessThan(GUARD_ENDURANCE_GAIN);
  });

  it('suit le modificateur de Constitution vers le haut', () => {
    const costaud = mkUnit({
      id: 'u',
      name: 'U',
      team: 'allies',
      attributes: ATTRS({ constitution: 18 }), // mod. +4
    });
    expect(enduranceRecovery(costaud)).toBe(ENDURANCE_RECOVERY_BASE + 4);
  });

  it('ne descend jamais sous son plancher', () => {
    // Constitution 6 → mod. −2 : sans plancher, on perdrait du souffle en
    // respirant.
    const frele = mkUnit({
      id: 'u',
      name: 'U',
      team: 'allies',
      attributes: ATTRS({ constitution: 6 }),
    });
    expect(enduranceRecovery(frele)).toBe(ENDURANCE_RECOVERY_FLOOR);

    // Constitution 3 → mod. −4, donc 3 − 4 = −1 : jamais de perte.
    const exsangue = mkUnit({
      id: 'v',
      name: 'V',
      team: 'allies',
      attributes: ATTRS({ constitution: 3 }),
    });
    expect(enduranceRecovery(exsangue)).toBe(ENDURANCE_RECOVERY_FLOOR);
  });

  it('recharge la réserve au début du tour', () => {
    let enc = applyAction(duel({ endurance: 4 }), { type: 'start' });
    const first = enc.order[0];
    // Un tour complet pour revenir au même combattant.
    const before = findUnit(enc, first)!.endurance;
    enc = applyAction(enc, { type: 'endTurn' });
    enc = applyAction(enc, { type: 'endTurn' });
    expect(findUnit(enc, first)!.endurance).toBe(before + ENDURANCE_RECOVERY_BASE);
    expect(enc.log.some((l) => l.text.includes('endurance'))).toBe(true);
  });

  it('ne dépasse pas la réserve maximale', () => {
    // Endurance pleine : rien à récupérer, et rien au journal.
    let enc = applyAction(duel(), { type: 'start' });
    const first = enc.order[0];
    expect(findUnit(enc, first)!.endurance).toBe(20);
    enc = applyAction(enc, { type: 'endTurn' });
    enc = applyAction(enc, { type: 'endTurn' });
    expect(findUnit(enc, first)!.endurance).toBe(20);
  });

  it('plafonne sur la réserve courante, buffs compris', () => {
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies', endurance: 19 });
    // Réserve max 20 : la récupération de 3 est rognée à 1.
    let enc = duel({ endurance: 19 });
    enc = applyAction(enc, { type: 'start' });
    const first = enc.order[0];
    enc = applyAction(enc, { type: 'endTurn' });
    enc = applyAction(enc, { type: 'endTurn' });
    expect(findUnit(enc, first)!.endurance).toBe(20);
    expect(unit.base.endurance).toBe(20);
  });

  it('laisse le souffle revenir même sous un malus qui bride l’action', () => {
    const enc = duel({ endurance: 0 });
    const actor = findUnit(enc, 'a')!;
    // Sans endurance, une arme est injouable…
    expect(cannotUse(enc, actor, flatHit({ enduranceCost: 2 }), { x: 1, y: 0 })).toMatch(
      /Endurance insuffisante/,
    );
    // …mais le tour suivant en rend assez pour repartir.
    let next = applyAction(enc, { type: 'start' });
    next = applyAction(next, { type: 'endTurn' });
    next = applyAction(next, { type: 'endTurn' });
    expect(findUnit(next, 'a')!.endurance).toBeGreaterThanOrEqual(2);
  });
});

/* ── Statuts ───────────────────────────────────────────────────────────────── */

describe('statuts', () => {
  it('inflige les dégâts par tour au début du tour de la victime', () => {
    const enc = applyAction(duel(), { type: 'start' });
    applyStatus(enc, findUnit(enc, 'b')!, 'brulure', findUnit(enc, 'a'));
    const hpBefore = findUnit(enc, 'b')!.hp;

    // On passe la main : c'est au tour de la cible que la brûlure mord.
    const next = applyAction(enc, { type: 'endTurn' });
    expect(findUnit(next, 'b')!.hp).toBeLessThan(hpBefore);
    expect(next.log.some((l) => l.text.includes('Brûlure'))).toBe(true);
  });

  it('expire après sa durée', () => {
    let enc = applyAction(duel(), { type: 'start' });
    applyStatus(enc, findUnit(enc, 'b')!, 'brulure', undefined, 1);
    // Un aller-retour dans l'ordre d'initiative suffit à consommer le tour.
    enc = applyAction(enc, { type: 'endTurn' });
    enc = applyAction(enc, { type: 'endTurn' });
    enc = applyAction(enc, { type: 'endTurn' });
    expect(findUnit(enc, 'b')!.statuses.find((s) => s.key === 'brulure')).toBeUndefined();
  });

  it('cumule les charges d’un statut cumulable', () => {
    const enc = duel();
    const target = findUnit(enc, 'b')!;
    applyStatus(enc, target, 'brulure', undefined);
    applyStatus(enc, target, 'brulure', undefined);
    expect(target.statuses.find((s) => s.key === 'brulure')!.stacks).toBe(2);
  });

  it('applique les modificateurs de stats d’un statut', () => {
    const enc = duel();
    const target = findUnit(enc, 'b')!;
    const before = effectiveStat(target, 'speed');
    applyStatus(enc, target, 'ralentissement', undefined);
    expect(effectiveStat(target, 'speed')).toBeLessThan(before);
  });

  it('honore les deux sens d’un statut qui donne et qui prend', () => {
    const enc = duel();
    const target = findUnit(enc, 'b')!;
    // La Rage est un buff, mais elle ouvre la garde : le signe ne peut pas se
    // déduire de la catégorie du statut, il est porté par chaque valeur.
    applyStatus(enc, target, 'rage', undefined);
    expect(effectiveStat(target, 'atk_phy')).toBe(25);
    expect(effectiveStat(target, 'def_phy')).toBe(0);
  });

  it('réduit les soins sous un statut anti-soin', () => {
    const enc = duel({}, { hp: 10 });
    applyStatus(enc, findUnit(enc, 'b')!, 'brulure', undefined);
    // La brûlure coupe les soins de moitié : 10 demandés, 5 rendus.
    const after = applyAction(enc, { type: 'heal', targetId: 'b', amount: 10 });
    expect(findUnit(after, 'b')!.hp).toBe(15);
  });

  it('ne dépasse jamais les PV maximum en soignant', () => {
    const after = applyAction(duel({}, { hp: 38 }), { type: 'heal', targetId: 'b', amount: 50 });
    expect(findUnit(after, 'b')!.hp).toBe(40);
  });

  it('fige la puissance du lanceur au moment où le statut est posé', () => {
    const enc = duel();
    const caster = findUnit(enc, 'a')!;
    applyStatus(enc, findUnit(enc, 'b')!, 'brulure', caster);
    const status = findUnit(enc, 'b')!.statuses[0];
    expect(status.sourcePower.atk_mag).toBe(20);

    // Un buff obtenu APRÈS coup ne doit pas raviver la brûlure déjà en cours.
    caster.effects.push({ id: 'e', name: 'Puissance', remaining: 5, mods: [{ stat: 'atk_mag', value: 40 }] });
    expect(findUnit(enc, 'b')!.statuses[0].sourcePower.atk_mag).toBe(20);
  });
});

/* ── Attaque de base ───────────────────────────────────────────────────────── */

describe('attaque de base', () => {
  const staff = { name: 'Bâton', minDamage: 4, maxDamage: 4, weaponCategory: 'staff' };
  const bow = { name: 'Arc court', minDamage: 6, maxDamage: 6, weaponCategory: 'shortBow' };
  const arrows = { name: 'Flèches', damageType: 'piercing', damageBonus: 1, compatibleWith: ['shortBow'] };

  it('vaut 25 % de l’attaque + l’arme au corps à corps', () => {
    const ability = { ...weaponAbility(staff, 'weapon'), autoHit: true };
    const enc = duel({ abilities: [{ ...ability, id: 'test:hit' }] });
    // Attaque physique 20 → 25 % = 5, plus les 4 du bâton = 9.
    expect(findUnit(strike(enc), 'b')!.hp).toBe(31);
  });

  it('ajoute les dégâts du projectile pour une arme à distance', () => {
    const ability = { ...weaponAbility(bow, 'weapon', arrows), autoHit: true };
    // Cible hors de la zone de gêne de l'arc, sinon le tir serait diminué.
    const enc = duel({ abilities: [{ ...ability, id: 'test:hit' }] }, { pos: { x: 5, y: 0 } });
    // 25 % de 20 = 5, + 6 (arc) + 1 (flèche) = 12.
    expect(findUnit(strike(enc, { x: 5, y: 0 }), 'b')!.hp).toBe(28);
  });

  it('n’applique la part d’attaque qu’une fois, pas sur le projectile', () => {
    const ability = weaponAbility(bow, 'weapon', arrows);
    expect(ability.damages).toHaveLength(2);
    expect(ability.damages[0].scaling?.[0].ratio).toBe(0.25);
    // La composante « projectile » est un ajout plat, sans scaling.
    expect(ability.damages[1].scaling ?? []).toHaveLength(0);
  });

  it('garde le projectile dans son propre type de dégâts', () => {
    const sling = { name: 'Fronde', minDamage: 2, maxDamage: 2, weaponCategory: 'sling' };
    const pellets = { name: 'Billes', damageType: 'bludgeoning', damageBonus: 1, compatibleWith: ['sling'] };
    const ability = weaponAbility(sling, 'weapon', pellets);
    expect(ability.damages[1].type).toBe('bludgeoning');
    // Résistance au contondant : les deux composantes sont réduites.
    const enc = duel(
      { abilities: [{ ...ability, id: 'test:hit', autoHit: true }] },
      { affinities: NO_AFFINITY({ resistances: ['bludgeoning'] }), pos: { x: 3, y: 0 } },
    );
    // (2 + 5) ×0,5 = 4 (arrondi) puis 1 ×0,5 = 1 (arrondi) → 5 au total.
    expect(findUnit(strike(enc, { x: 3, y: 0 }), 'b')!.hp).toBe(35);
  });

  it('ne donne pas de projectile à une arme de mêlée', () => {
    expect(usesAmmunition(staff)).toBe(false);
    expect(usesAmmunition(bow)).toBe(true);
    expect(weaponAbility(staff, 'weapon').damages).toHaveLength(1);
  });
});

/* ── Jet de toucher fixe ───────────────────────────────────────────────────── */

describe('toucher', () => {
  it('atteint toujours sa cible à portée : il n’y a plus de jet', () => {
    const enc = duel({ abilities: [flatHit({ autoHit: false })] });
    const after = strike(enc);
    expect(findUnit(after, 'b')!.hp).toBe(30);
    expect(after.log.some((l) => l.text.includes('manque'))).toBe(false);
  });

  it('ne tire que l’esquive et les dégâts, jamais un jet de toucher', () => {
    // Dégâts fixes (10–10) : `Rng.int` ne tire rien quand les bornes se
    // rejoignent. Reste le seul jet d'esquive naturelle de la cible.
    const flat = applyAction(duel({ abilities: [flatHit({ autoHit: false })] }), { type: 'start' });
    expect(strike(flat).rollCount).toBe(flat.rollCount + 1);

    // Avec une vraie fourchette de dégâts : esquive + dégâts, soit deux jets.
    const ranged = applyAction(
      duel({ abilities: [flatHit({ autoHit: false, damages: [{ min: 2, max: 8, type: 'slashing' }] })] }),
      { type: 'start' },
    );
    expect(strike(ranged).rollCount).toBe(ranged.rollCount + 2);
  });

  it('reste annulable par une esquive, la seule parade totale', () => {
    const enc = duel({ abilities: [flatHit({ autoHit: false })] });
    findUnit(enc, 'b')!.effects.push({
      id: 'e',
      name: 'Disparition',
      remaining: 2,
      mods: [],
      evadeChance: 100,
    });
    const after = strike(enc);
    expect(findUnit(after, 'b')!.hp).toBe(40);
    expect(after.log.some((l) => l.text.includes('esquive'))).toBe(true);
  });
});

/* ── Poings ────────────────────────────────────────────────────────────────── */

describe('attaques à mains nues', () => {
  it('vaut 25 % de l’attaque, davantage pour un pugiliste', () => {
    expect(UNARMED_ATTACK_RATIO).toBe(0.25);
    expect(unarmedRatioFor('warrior')).toBe(0.25);
    expect(unarmedRatioFor(undefined)).toBe(0.25);
    // Le pugiliste fait du poing son arme : il doit en tirer plus que les autres.
    expect(unarmedRatioFor('pugilist')).toBe(PUGILIST_UNARMED_RATIO);
    expect(PUGILIST_UNARMED_RATIO).toBeGreaterThan(UNARMED_ATTACK_RATIO);
  });

  it('est entièrement dérivée de l’attaque, sans dé de base', () => {
    const [component] = unarmedAbility().damages;
    expect(component.min).toBe(0);
    expect(component.max).toBe(0);
    expect(component.type).toBe('bludgeoning');
    expect(component.scaling).toEqual([{ source: 'atk_phy', ratio: 0.25 }]);
  });

  it('reste plus faible qu’une arme à ratio égal', () => {
    // Même part d'attaque, mais l'arme ajoute ses propres dégâts par-dessus :
    // c'est ce qui fait qu'on ne se bat pas à mains nues par choix.
    expect(UNARMED_ATTACK_RATIO).toBe(WEAPON_ATTACK_RATIO);
    const sword = { name: 'Épée', minDamage: 5, maxDamage: 5, weaponCategory: 'longsword' };

    const fist = duel({ abilities: [{ ...unarmedAbility(), id: 'test:hit' }] });
    const armed = duel({ abilities: [{ ...weaponAbility(sword, 'weapon'), id: 'test:hit' }] });
    expect(40 - findUnit(strike(armed), 'b')!.hp).toBeGreaterThan(
      40 - findUnit(strike(fist), 'b')!.hp,
    );
  });

  it('est marquée comme telle, pour que les buffs de poing la reconnaissent', () => {
    const fist = unarmedAbility();
    expect(fist.unarmed).toBe(true);
    expect(fist.rangeMeters).toBe(1.5);
  });

  it('profite des buffs de poing', () => {
    const enc = duel({ abilities: [{ ...unarmedAbility(), id: 'test:hit' }] });
    const nu = 40 - findUnit(strike(enc), 'b')!.hp;

    const buffed = duel({ abilities: [{ ...unarmedAbility(), id: 'test:hit' }] });
    findUnit(buffed, 'a')!.effects.push({
      id: 'e',
      name: 'Poing de fer',
      remaining: 3,
      mods: [],
      enchant: { target: 'unarmed', damage: { min: 6, max: 6, type: 'bludgeoning' } },
    });
    expect(40 - findUnit(strike(buffed), 'b')!.hp).toBe(nu + 6);
  });

  it('n’applique PAS les buffs de poing à une attaque armée', () => {
    const sword = { name: 'Épée', minDamage: 5, maxDamage: 5, weaponCategory: 'longsword' };
    const armed = { ...weaponAbility(sword, 'weapon'), id: 'test:hit' };

    const enc = duel({ abilities: [armed] });
    const nu = 40 - findUnit(strike(enc), 'b')!.hp;

    const buffed = duel({ abilities: [armed] });
    findUnit(buffed, 'a')!.effects.push({
      id: 'e',
      name: 'Poing de fer',
      remaining: 3,
      mods: [],
      enchant: { target: 'unarmed', damage: { min: 6, max: 6, type: 'bludgeoning' } },
    });
    // Nimber ses poings ne rend pas une épée plus tranchante.
    expect(40 - findUnit(strike(buffed), 'b')!.hp).toBe(nu);
  });
});

/* ── Attaques naturelles des créatures ─────────────────────────────────────── */

describe('attaques de créature', () => {
  const wolf = loupGris as unknown as BestiaryEntry;

/** Tout le bestiaire, pour éprouver l'ensemble et pas seulement le loup. */
const BESTIARY: Record<string, unknown> = {
  'belier-des-cimes': belier,
  'chien-de-troupeau': chien,
  corneille_funeste: corneille,
  'hurle-vent': hurleVent,
  'lezard-rocailleux': lezard,
  'loup-gris': loupGris,
  'poule-des-chaumes': poule,
  'scarabee-pollinisateur-geant': scarabee,
  'serpent-des-marais': serpentMarais,
  'serpent-fantome': serpentFantome,
  'truite-de-courant': truite,
  'vache-des-vallons': vache,
};
const BESTIARY_INDEX = Object.keys(BESTIARY);
  const make = (): CombatantFactory => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    return TestBed.inject(CombatantFactory);
  };

  it('n’en donne aucune à distance par défaut : un loup ne projette rien', () => {
    const muette = { ...wolf, abilities: undefined } as BestiaryEntry;
    const unit = make().fromBestiary(muette, 'ennemis', { x: 0, y: 0 });
    // Le loup a 2 d'attaque magique sur sa fiche : ça ne doit pas suffire à
    // en faire un lanceur de sorts.
    expect(unit.base.atk_mag).toBeGreaterThan(0);
    // La garde se joue sur soi : seules les ATTAQUES doivent être au contact.
    for (const ability of unit.abilities.filter((a) => a.damages.length)) {
      expect(ability.rangeMeters, ability.name).toBe(1.5);
    }
    expect(unit.abilities.some((a) => a.id === 'natural:arcane')).toBe(false);
  });

  it('joue les capacités que sa FICHE déclare', () => {
    const unit = make().fromBestiary(wolf, 'ennemis', { x: 0, y: 0 });
    // Le loup gris a son propre répertoire : il ne se bat pas comme une poule.
    expect(unit.abilities.map((a) => a.name)).toEqual([
      'Morsure',
      'Croc au jarret',
      'Hurlement de meute',
      'Garde',
    ]);
  });

  it('retombe sur les attaques génériques quand la fiche ne déclare rien', () => {
    const muette = { ...wolf, abilities: undefined } as BestiaryEntry;
    const unit = make().fromBestiary(muette, 'ennemis', { x: 0, y: 0 });
    expect(unit.abilities.map((a) => a.name)).toEqual(['Morsure', 'Prise au sol', 'Garde']);
  });

  it('traduit les effets déclarés : statuts, buffs de meute, portées', () => {
    const unit = make().fromBestiary(wolf, 'ennemis', { x: 0, y: 0 });
    const jarret = unit.abilities.find((a) => a.name === 'Croc au jarret')!;
    expect(jarret.inflicts?.map((i) => i.status)).toEqual(['saignement', 'ralentissement']);

    // Le hurlement ne blesse pas : il renforce les siens, dans un rayon.
    const hurlement = unit.abilities.find((a) => a.name === 'Hurlement de meute')!;
    expect(hurlement.damages).toHaveLength(0);
    expect(hurlement.targets).toEqual(['ally']);
    expect(hurlement.shape).toEqual({ kind: 'radius', meters: 9 });
    expect(hurlement.autoHit).toBe(true);
  });

  it('durcit vraiment le lézard, au prix de sa mobilité', () => {
    const unit = make().fromBestiary(lezard as unknown as BestiaryEntry, 'ennemis', {
      x: 0,
      y: 0,
    });
    const durcissement = unit.abilities.find((a) => a.name === 'Durcissement')!;

    // Ce que la fiche annonce : minéralisation, donc une vraie défense…
    expect(durcissement.mods?.map((m) => m.stat).sort()).toEqual(['def_mag', 'def_phy']);
    // …déclenchée « au moindre danger », donc jouable en réaction…
    expect(durcissement.reaction).toEqual(['incoming-attack']);
    // …et payée en lenteur, pas seulement racontée.
    expect(durcissement.recoil?.mods?.[0]).toEqual({ stat: 'speed', value: 8 });
  });

  it('fait vraiment scaler les capacités sur l’attaque de la bête', () => {
    const unit = make().fromBestiary(wolf, 'ennemis', { x: 0, y: 0 });
    const morsure = unit.abilities[0];
    // atk_phy du loup = 10 → 0,35 × 10 = 3,5 ajouté aux dés.
    expect(abilityDamageRanges(unit, morsure)[0].max).toBe(7);
  });

  it('garde chaque créature dans un répertoire jouable', () => {
    // Personne ne doit se retrouver sans rien à faire, ni avec des chiffres
    // absurdes : c'est ce qui casserait en silence en enrichissant le bestiaire.
    const f = make();
    for (const slug of BESTIARY_INDEX) {
      const entry = BESTIARY[slug] as BestiaryEntry;
      const unit = f.fromBestiary(entry, 'ennemis', { x: 0, y: 0 });
      expect(unit.abilities.length, slug).toBeGreaterThanOrEqual(2);
      for (const a of unit.abilities) {
        expect(a.name, slug).toBeTruthy();
        expect(a.rangeMeters, `${slug}/${a.name}`).toBeGreaterThanOrEqual(0);
        for (const d of a.damages) {
          expect(d.max, `${slug}/${a.name}`).toBeGreaterThanOrEqual(d.min);
          // Aucune bête ne doit emporter un aventurier de niveau 1 d'un coup.
          const inflige = abilityDamageRanges(unit, a).reduce((t, r) => t + r.max, 0);
          expect(inflige, `${slug}/${a.name}`).toBeLessThan(17);
        }
      }
    }
  });

  it('fait de la morsure générique 25 % de l’attaque, en perforant', () => {
    const muette = { ...wolf, abilities: undefined } as BestiaryEntry;
    const unit = make().fromBestiary(muette, 'ennemis', { x: 0, y: 0 });
    const bite = unit.abilities[0];
    expect(bite.damages).toEqual([
      { min: 0, max: 0, type: 'piercing', scaling: [{ source: 'atk_phy', ratio: 0.25 }] },
    ]);
    // atk_phy du loup = 10 (type bestial 5 + fiche 5) → 2,5 arrondi à 3.
    expect(abilityDamageRanges(unit, bite)[0].max).toBe(3);
  });

  it('fait de la prise de contrôle générique une immobilisation, pas un coup', () => {
    const muette = { ...wolf, abilities: undefined } as BestiaryEntry;
    const unit = make().fromBestiary(muette, 'ennemis', { x: 0, y: 0 });
    const control = unit.abilities[1];
    expect(control.inflicts).toEqual([{ status: 'enracinement', chance: 60 }]);
    // Elle blesse nettement moins que la morsure : c'est son rôle.
    expect(abilityDamageRanges(unit, control)[0].max).toBeLessThan(
      abilityDamageRanges(unit, unit.abilities[0])[0].max,
    );
  });
});

/* ── Météo et heure du jour ────────────────────────────────────────────────── */

describe('ambiance', () => {
  const darkBolt = flatHit({
    kind: 'spell',
    damages: [{ min: 20, max: 20, type: 'dark' }],
    domains: ['darkness'],
    manaCost: 10,
  });

  it('laisse tout inchangé sans météo ni heure', () => {
    const enc = duel({ abilities: [{ ...darkBolt, id: 'test:hit' }], mana: 50 });
    expect(ambienceDamageFactor(enc, ['darkness'])).toBe(1);
    expect(effectiveManaCost(enc, darkBolt)).toBe(10);
  });

  it('renforce les ténèbres la nuit, et les affaiblit à midi', () => {
    const nuit = { ...duel(), daytime: 'nuit' };
    const midi = { ...duel(), daytime: 'midi' };
    expect(ambienceDamageFactor(nuit, ['darkness'])).toBeCloseTo(1.3);
    expect(ambienceDamageFactor(midi, ['darkness'])).toBeCloseTo(0.7);
    expect(ambienceDamageFactor(nuit, ['light'])).toBeCloseTo(0.7);
  });

  it('module le coût en mana selon l’heure', () => {
    const nuit = { ...duel(), daytime: 'nuit' };
    // 10 × 0,75 : un sort de ténèbres coûte moins cher la nuit.
    expect(effectiveManaCost(nuit, darkBolt)).toBe(8);
    const midi = { ...duel(), daytime: 'midi' };
    expect(effectiveManaCost(midi, darkBolt)).toBe(13);
  });

  it('ne touche pas un sort d’un autre domaine', () => {
    const nuit = { ...duel(), daytime: 'nuit' };
    expect(ambienceDamageFactor(nuit, ['fire'])).toBe(1);
    // Ni une arme, qui n'a pas de domaine du tout.
    expect(ambienceDamageFactor(nuit, undefined)).toBe(1);
  });

  it('cumule la météo et l’heure du jour', () => {
    // La nuit magique renforce les ténèbres, la nuit aussi : les deux jouent.
    const enc = { ...duel(), daytime: 'nuit', weather: 'magical-night' };
    const seul = ambienceDamageFactor({ ...duel(), daytime: 'nuit' }, ['darkness']);
    expect(ambienceDamageFactor(enc, ['darkness'])).toBeGreaterThanOrEqual(seul);
  });

  it('applique vraiment le facteur aux dégâts infligés', () => {
    const nuit = { ...duel({ abilities: [{ ...darkBolt, id: 'test:hit' }], mana: 50 }), daytime: 'nuit' };
    // 20 × 1,3 = 26, cible sans défense magique.
    expect(findUnit(strike(nuit), 'b')!.hp).toBe(14);
  });
});

/* ── Dégâts annoncés ───────────────────────────────────────────────────────── */

describe('dégâts annoncés', () => {
  it('chiffre une attaque dont toute la puissance vient du scaling', () => {
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies' }); // atk_phy 20
    const [range] = abilityDamageRanges(unit, unarmedAbility());
    // 25 % de 20 : le bouton doit annoncer 5, pas « 0–0 ».
    expect(range).toEqual({ min: 5, max: 5, type: 'bludgeoning' });
  });

  it('annonce exactement ce qui sera infligé', () => {
    const ability = flatHit({
      damages: [{ min: 4, max: 4, type: 'slashing', scaling: [{ source: 'atk_phy', ratio: 0.5 }] }],
    });
    const enc = duel({ abilities: [{ ...ability, id: 'test:hit' }] });
    const actor = findUnit(enc, 'a')!;

    const [annonce] = abilityDamageRanges(actor, ability);
    // Cible sans défense : ce qui est annoncé est ce qui est retiré.
    expect(40 - findUnit(strike(enc), 'b')!.hp).toBe(annonce.max);
  });

  it('inclut le buff de poing dans le chiffre annoncé', () => {
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies' });
    expect(abilityDamageRanges(unit, unarmedAbility())).toHaveLength(1);
    unit.effects.push({
      id: 'e',
      name: 'Poing de fer',
      remaining: 3,
      mods: [],
      enchant: { target: 'unarmed', damage: { min: 6, max: 6, type: 'bludgeoning' } },
    });
    // L'enchantement forme sa PROPRE composante : deux chips au lieu d'une.
    expect(abilityDamageRanges(unit, unarmedAbility())).toHaveLength(2);
    expect(abilityDamageRanges(unit, unarmedAbility())[1].max).toBe(6);
    // …mais pas dans celui d'une arme.
    const sword = { name: 'Épée', minDamage: 5, maxDamage: 5, weaponCategory: 'longsword' };
    const armed = abilityDamageRanges(unit, weaponAbility(sword, 'weapon'))[0];
    expect(armed.max).toBe(5 + Math.round(WEAPON_ATTACK_RATIO * 20));
  });

  it('chiffre le soin et le mana rendus, scaling compris', () => {
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies' });
    const potion = flatHit({
      damages: [],
      heal: 10,
      healScaling: [{ source: 'constitution', ratio: 1 }],
      restoreMana: 5,
      restoreManaScaling: [{ source: 'intelligence', ratio: 2 }],
    });
    expect(abilityHealAmount(unit, potion)).toBe(20); // 10 + 1 × 10
    expect(abilityManaAmount(unit, potion)).toBe(25); // 5 + 2 × 10
  });
});

/* ── Sorts de revêtement (poings et armes enchantés) ───────────────────────── */

describe('sorts de revêtement', () => {
  const spells = new SpellsService();
  const nodeOf = (key: string) => {
    const page = spells.bySlug(key)!;
    return spellAbility(page, page.spell.progression!.nodes[0]);
  };

  it('reconnaît la famille à sa clé', () => {
    expect(enchantTargetOf('darkness-revetement-poings')).toBe('unarmed');
    expect(enchantTargetOf('water-revetement-glace-poings')).toBe('unarmed');
    expect(enchantTargetOf('fire-revetement-arme')).toBe('weapon');
    // Les revêtements défensifs sont déjà modélisés en effets : on n'y touche pas.
    expect(enchantTargetOf('fire-revetement-manteau')).toBeNull();
    expect(enchantTargetOf('fire-boule-de-feu')).toBeNull();
  });

  it('ne frappe personne à l’incantation : il nimbe les poings', () => {
    const sort = nodeOf('darkness-revetement-poings');
    expect(sort.damages).toHaveLength(0);
    expect(sort.targets).toEqual(['self']);
    expect(sort.enchant?.target).toBe('unarmed');
    expect(sort.enchant?.damage.type).toBe('dark');
    expect(sort.duration).toBeGreaterThan(0);
  });

  it('ajoute vraiment ses dégâts au coup de poing suivant', () => {
    const sort = nodeOf('darkness-revetement-poings');
    const fist = { ...unarmedAbility(), id: 'test:hit' };

    const nu = duel({ abilities: [fist] });
    const avant = 40 - findUnit(strike(nu), 'b')!.hp;

    const enchante = duel({ abilities: [fist] });
    findUnit(enchante, 'a')!.effects.push({
      id: 'e',
      name: sort.name,
      remaining: 3,
      mods: [],
      enchant: sort.enchant,
    });
    // C'était le bug : le sort se lançait sans rien changer aux coups portés.
    expect(40 - findUnit(strike(enchante), 'b')!.hp).toBeGreaterThan(avant);
  });

  it('ajoute ses dégâts dans SON type, pas dans celui du coup', () => {
    const sort = nodeOf('darkness-revetement-poings');
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies' });
    unit.effects.push({ id: 'e', name: sort.name, remaining: 3, mods: [], enchant: sort.enchant });

    const [coup, nimbe] = abilityDamageRanges(unit, unarmedAbility());
    expect(coup.type).toBe('bludgeoning');
    expect(nimbe.type).toBe('dark');
  });

  it('ne nimbe que ce qu’il vise : poings ou arme, jamais les deux', () => {
    const poings = nodeOf('darkness-revetement-poings');
    const lame = nodeOf('fire-revetement-arme');
    const sword = { name: 'Épée', minDamage: 5, maxDamage: 5, weaponCategory: 'longsword' };
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies' });

    unit.effects.push({ id: 'p', name: 'Poings', remaining: 3, mods: [], enchant: poings.enchant });
    expect(abilityDamageRanges(unit, unarmedAbility())).toHaveLength(2);
    expect(abilityDamageRanges(unit, weaponAbility(sword, 'weapon'))).toHaveLength(1);

    unit.effects.push({ id: 'l', name: 'Lame', remaining: 3, mods: [], enchant: lame.enchant });
    expect(abilityDamageRanges(unit, weaponAbility(sword, 'weapon'))).toHaveLength(2);
    // Les poings n'ont pas gagné la lame ardente au passage.
    expect(abilityDamageRanges(unit, unarmedAbility())).toHaveLength(2);
  });

  it('s’ajoute à CHAQUE coup d’un enchaînement', () => {
    const sort = nodeOf('darkness-revetement-poings');
    const combo = classSkillsFor(
      (classCatalog as unknown as ClassDef[]).find((c) => c.key === 'pugilist'),
      1,
    ).find((a) => a.name === 'Combo rapide')!;
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies' });
    unit.effects.push({ id: 'e', name: sort.name, remaining: 3, mods: [], enchant: sort.enchant });
    // 3 coups + 3 nimbes : « chaque coup à mains nues inflige ces dégâts en plus ».
    expect(abilityDamageRanges(unit, combo)).toHaveLength(6);
  });

  it('remplace le revêtement précédent : on ne nimbe pas deux fois', () => {
    const ombre = nodeOf('darkness-revetement-poings');
    const flammes = nodeOf('fire-revetement-poings');
    let enc = duel({ abilities: [{ ...ombre, id: 'a1' }, { ...flammes, id: 'a2' }], mana: 50 });
    enc = applyAction(enc, { type: 'start' });

    enc = applyAction(enc, { type: 'use', actorId: 'a', abilityId: 'a1', at: { x: 0, y: 0 } });
    expect(findUnit(enc, 'a')!.effects.filter((e) => e.enchant)).toHaveLength(1);
    expect(findUnit(enc, 'a')!.effects[0].enchant!.damage.type).toBe('dark');

    // Second revêtement : il chasse le premier plutôt que de s'y ajouter.
    findUnit(enc, 'a')!.actionUsed = false;
    enc = applyAction(enc, { type: 'use', actorId: 'a', abilityId: 'a2', at: { x: 0, y: 0 } });
    const enchants = findUnit(enc, 'a')!.effects.filter((e) => e.enchant);
    expect(enchants).toHaveLength(1);
    expect(enchants[0].enchant!.damage.type).toBe('fire');
    expect(enc.log.some((l) => l.text.includes('remplace'))).toBe(true);
  });

  it('ne désenchante que ce qui est visé : les poings, pas l’arme', () => {
    const poings = nodeOf('darkness-revetement-poings');
    const lame = nodeOf('fire-revetement-arme');
    let enc = duel({ abilities: [{ ...poings, id: 'a1' }, { ...lame, id: 'a2' }], mana: 50 });
    enc = applyAction(enc, { type: 'start' });

    enc = applyAction(enc, { type: 'use', actorId: 'a', abilityId: 'a1', at: { x: 0, y: 0 } });
    findUnit(enc, 'a')!.actionUsed = false;
    enc = applyAction(enc, { type: 'use', actorId: 'a', abilityId: 'a2', at: { x: 0, y: 0 } });

    // Les deux coexistent : ils ne nimbent pas la même chose.
    const targets = findUnit(enc, 'a')!.effects.map((e) => e.enchant?.target).filter(Boolean);
    expect(targets.sort()).toEqual(['unarmed', 'weapon']);
  });

  it('garde ce que l’effet remplacé apportait par ailleurs', () => {
    // Une Transe de combat donne vitesse ET nimbe les poings : un nouveau
    // revêtement ne doit lui prendre que le nimbe.
    const ombre = nodeOf('darkness-revetement-poings');
    let enc = duel({ abilities: [{ ...ombre, id: 'a1' }], mana: 50 });
    findUnit(enc, 'a')!.effects.push({
      id: 'transe',
      name: 'Transe de combat',
      remaining: 3,
      mods: [{ stat: 'speed', value: 6 }],
      enchant: { target: 'unarmed', damage: { min: 2, max: 4, type: 'bludgeoning' } },
    });
    enc = applyAction(enc, { type: 'start' });
    const avant = effectiveStat(findUnit(enc, 'a')!, 'speed');

    enc = applyAction(enc, { type: 'use', actorId: 'a', abilityId: 'a1', at: { x: 0, y: 0 } });
    const unit = findUnit(enc, 'a')!;
    expect(effectiveStat(unit, 'speed')).toBe(avant);
    expect(unit.effects.find((e) => e.name === 'Transe de combat')!.enchant).toBeUndefined();
    expect(unit.effects.filter((e) => e.enchant)).toHaveLength(1);
  });

  it('couvre toute la famille du wiki : 14 sorts de poings, 14 d’arme', () => {
    const all = spells.all().filter((p) => enchantTargetOf(p.spell.key));
    // Un par domaine (12), plus les deux déclinaisons de l'eau (glace, brume).
    expect(all.filter((p) => enchantTargetOf(p.spell.key) === 'unarmed')).toHaveLength(14);
    expect(all.filter((p) => enchantTargetOf(p.spell.key) === 'weapon')).toHaveLength(14);
    for (const page of all) {
      const ability = spellAbility(page, page.spell.progression!.nodes[0]);
      expect(ability.enchant, page.spell.key).toBeDefined();
      expect(ability.damages, page.spell.key).toHaveLength(0);
    }
  });
});

/* ── Bonus de classe des sorts ─────────────────────────────────────────────── */

describe('bonus de classe', () => {
  const spells = new SpellsService();
  const root = (key: string) => {
    const page = spells.bySlug(key)!;
    return (classKey?: string) =>
      spellAbility(page, page.spell.progression!.nodes[0], undefined, classKey);
  };

  it('ajoute le scaling de la classe aux dégâts de l’enchantement', () => {
    // Le pugiliste tire davantage de ses poings de pierre (force ×0,3).
    const sort = root('earth-revetement-poings');
    const neutre = sort('mage').enchant!.damage.scaling ?? [];
    const pugiliste = sort('pugilist').enchant!.damage.scaling ?? [];
    expect(pugiliste.length).toBeGreaterThan(neutre.length);
    expect(pugiliste).toContainEqual({ source: 'force', ratio: 0.3 });
  });

  it('applique le facteur de mana de la classe', () => {
    // « le coût du sort est divisé par deux » pour le pugiliste.
    const sort = root('electricity-revetement-poings');
    expect(sort('pugilist').manaCost).toBe(Math.round(sort('mage').manaCost / 2));
  });

  it('renforce aussi les enchantements d’ARME pour les classes martiales', () => {
    const sort = root('air-revetement-arme');
    const ranger = sort('ranger').enchant!.damage.scaling ?? [];
    expect(ranger.length).toBeGreaterThan((sort('mage').enchant!.damage.scaling ?? []).length);
  });

  it('accorde la frappe immédiate au pugiliste, et à lui seul', () => {
    const sort = root('darkness-revetement-poings');
    expect(sort('pugilist').freeStrike).toBe('unarmed');
    expect(sort('mage').freeStrike).toBeUndefined();
    // Les domaines dont le bonus est chiffré autrement n'en accordent pas.
    expect(root('earth-revetement-poings')('pugilist').freeStrike).toBeUndefined();
  });

  /** Un pugiliste ayant lancé Poings d'ombre, frappe gratuite en attente. */
  const withPendingStrike = (defender: Partial<Combatant> = {}) => {
    const sort = root('darkness-revetement-poings')('pugilist');
    const fist = unarmedAbility(PUGILIST_UNARMED_RATIO);
    let enc = duel(
      { abilities: [{ ...sort, id: 'sort' }, fist], mana: 50, endurance: 20 },
      defender,
    );
    enc = applyAction(enc, { type: 'start' });
    return applyAction(enc, { type: 'use', actorId: 'a', abilityId: 'sort', at: { x: 0, y: 0 } });
  };

  it('n’est PAS portée d’office : elle attend une cible', () => {
    const enc = withPendingStrike();
    expect(enc.pendingStrike?.slot).toBe('unarmed');
    // Rien n'a encore été infligé : c'est au joueur de trancher.
    expect(findUnit(enc, 'b')!.hp).toBe(40);
    expect(pendingStrikeTargets(enc).map((c) => c.id)).toEqual(['b']);
  });

  it('porte le coup sur la cible désignée, enchantement compris, sans rien coûter', () => {
    const enc = withPendingStrike();
    const enduranceAvant = findUnit(enc, 'a')!.endurance;
    const after = applyAction(enc, { type: 'freeStrike', targetId: 'b' });

    expect(findUnit(after, 'b')!.hp).toBeLessThan(40);
    expect(after.pendingStrike).toBeUndefined();
    // Ni endurance ni seconde action : c'est une faveur, pas un tour de plus.
    expect(findUnit(after, 'a')!.endurance).toBe(enduranceAvant);
    // Le coup profite du revêtement qu'on vient de poser.
    const coup = after.log.filter((l) => l.kind === 'damage').at(-1);
    expect(coup?.details?.some((d) => d.startsWith('Ténèbres'))).toBe(true);
  });

  it('peut être déclinée', () => {
    const after = applyAction(withPendingStrike(), { type: 'skipStrike' });
    expect(after.pendingStrike).toBeUndefined();
    expect(findUnit(after, 'b')!.hp).toBe(40);
    expect(after.log.some((l) => l.text.includes('déclinée'))).toBe(true);
  });

  it('refuse une cible hors de portée', () => {
    const enc = withPendingStrike();
    enc.combatants.push(
      mkUnit({ id: 'loin', name: 'Loin', team: 'ennemis', pos: { x: 15, y: 10 } }),
    );
    const after = applyAction(enc, { type: 'freeStrike', targetId: 'loin' });
    expect(findUnit(after, 'loin')!.hp).toBe(40);
    expect(after.log.some((l) => l.text.includes('pas à portée'))).toBe(true);
  });

  it('ne survit pas à la fin du tour', () => {
    const after = applyAction(withPendingStrike(), { type: 'endTurn' });
    expect(after.pendingStrike).toBeUndefined();
    expect(after.log.some((l) => l.text.includes('perdue (fin du tour)'))).toBe(true);
  });

  it('n’est pas proposée quand personne n’est à portée', () => {
    const enc = withPendingStrike({ pos: { x: 15, y: 10 } });
    expect(enc.pendingStrike).toBeUndefined();
    expect(enc.log.some((l) => l.text.includes('personne à portée'))).toBe(true);
  });

  it('reporte au MJ un bonus qui ne se chiffre pas', () => {
    // « En lançant le sort, le pugiliste porte aussitôt une attaque gratuite »
    // n'est pas automatisable : le moteur le met sous les yeux du MJ.
    const sort = root('air-revetement-poings');
    expect(sort('pugilist').manualEffects?.[0]).toContain('attaque à mains nues');
    expect(sort('mage').manualEffects).toBeUndefined();
  });

  it('ajoute les modificateurs de stats d’un bonus de classe', () => {
    const sort = root('fire-echauffement');
    const guerrier = sort('warrior').mods ?? [];
    const mage = sort('mage').mods ?? [];
    expect(guerrier.length).toBeGreaterThan(mage.length);
    expect(guerrier).toContainEqual(expect.objectContaining({ stat: 'atk_phy' }));
  });

  it('ne donne rien à une classe non concernée', () => {
    const sort = root('earth-revetement-poings');
    expect(sort('warrior').enchant!.damage.scaling).toEqual(
      sort(undefined).enchant!.damage.scaling,
    );
  });

  it('se traduit en dégâts réellement plus élevés', () => {
    const sort = root('earth-revetement-poings');
    const fist = { ...unarmedAbility(PUGILIST_UNARMED_RATIO), id: 'test:hit' };
    const frappe = (classKey: string): number => {
      const enc = duel({ abilities: [fist] });
      findUnit(enc, 'a')!.effects.push({
        id: 'e',
        name: 'Poings de pierre',
        remaining: 3,
        mods: [],
        enchant: sort(classKey).enchant,
      });
      return 40 - findUnit(strike(enc), 'b')!.hp;
    };
    expect(frappe('pugilist')).toBeGreaterThan(frappe('mage'));
  });
});

/* ── Réactions et attaques d'opportunité ───────────────────────────────────── */

describe('réactions', () => {
  const spells = new SpellsService();
  const spellNode = (key: string, index = 0) => {
    const page = spells.bySlug(key)!;
    return spellAbility(page, page.spell.progression!.nodes[index]);
  };

  /** Un duel où le défenseur tient une épée : il menace donc l'allonge. */
  const armed = (over: Partial<Combatant> = {}) => {
    const sword = { name: 'Épée', minDamage: 6, maxDamage: 6, weaponCategory: 'longsword' };
    return mkUnit({
      id: 'b',
      name: 'Garde',
      team: 'ennemis',
      pos: { x: 1, y: 0 },
      abilities: [weaponAbility(sword, 'weapon')],
      ...over,
    });
  };

  describe('attaques d’opportunité', () => {
    const fleeing = () => {
      const enc = emptyEncounter('Fuite');
      enc.seed = 5;
      enc.combatants = [
        mkUnit({ id: 'a', name: 'Fuyard', team: 'allies', pos: { x: 0, y: 0 } }),
        armed(),
      ];
      return applyAction(enc, { type: 'start' });
    };

    it('ouvre une fenêtre quand on quitte une allonge', () => {
      const enc = applyAction(fleeing(), { type: 'move', actorId: 'a', to: { x: 0, y: 3 } });
      expect(enc.pendingReaction?.trigger).toBe('leave-reach');
      expect(enc.pendingReaction?.actorId).toBe('b');
      // Le déplacement est SUSPENDU : on frappe celui qui part, pas celui qui est parti.
      expect(findUnit(enc, 'a')!.pos).toEqual({ x: 0, y: 0 });
    });

    it('n’en ouvre pas si l’on reste au contact', () => {
      // (0,0) → (1,1) reste dans l'allonge du garde en (1,0).
      const enc = applyAction(fleeing(), { type: 'move', actorId: 'a', to: { x: 1, y: 1 } });
      expect(enc.pendingReaction).toBeUndefined();
      expect(findUnit(enc, 'a')!.pos).toEqual({ x: 1, y: 1 });
    });

    it('n’en ouvre pas pour un allié qui s’éloigne', () => {
      const enc = fleeing();
      findUnit(enc, 'b')!.team = 'allies';
      const after = applyAction(enc, { type: 'move', actorId: 'a', to: { x: 0, y: 3 } });
      expect(after.pendingReaction).toBeUndefined();
    });

    it('n’en ouvre pas pour un archer : on ne punit pas à trente mètres', () => {
      const enc = fleeing();
      const bow = { name: 'Arc', minDamage: 6, maxDamage: 6, weaponCategory: 'longBow' };
      findUnit(enc, 'b')!.abilities = [weaponAbility(bow, 'weapon')];
      const after = applyAction(enc, { type: 'move', actorId: 'a', to: { x: 0, y: 3 } });
      expect(after.pendingReaction).toBeUndefined();
    });

    it('frappe puis laisse partir', () => {
      const enc = applyAction(fleeing(), { type: 'move', actorId: 'a', to: { x: 0, y: 3 } });
      const after = applyAction(enc, { type: 'react', abilityId: 'weapon:weapon' });

      expect(findUnit(after, 'a')!.hp).toBeLessThan(40);
      // Le déplacement reprend après le coup.
      expect(findUnit(after, 'a')!.pos).toEqual({ x: 0, y: 3 });
      expect(after.pendingReaction).toBeUndefined();
      expect(after.suspended).toBeUndefined();
    });

    it('laisse partir sans frapper si l’on renonce', () => {
      const enc = applyAction(fleeing(), { type: 'move', actorId: 'a', to: { x: 0, y: 3 } });
      const after = applyAction(enc, { type: 'skipReaction' });
      expect(findUnit(after, 'a')!.hp).toBe(40);
      expect(findUnit(after, 'a')!.pos).toEqual({ x: 0, y: 3 });
      // Renoncer ne dépense pas la réaction.
      expect(findUnit(after, 'b')!.reactionUsed).toBe(false);
    });

    it('dépense la réaction : une seule par round', () => {
      let enc = applyAction(fleeing(), { type: 'move', actorId: 'a', to: { x: 0, y: 3 } });
      enc = applyAction(enc, { type: 'react', abilityId: 'weapon:weapon' });
      expect(findUnit(enc, 'b')!.reactionUsed).toBe(true);

      // Revenir puis repartir n'ouvre plus de fenêtre ce round-ci.
      enc = applyAction(enc, { type: 'move', actorId: 'a', to: { x: 1, y: 1 } });
      enc = applyAction(enc, { type: 'move', actorId: 'a', to: { x: 3, y: 3 } });
      expect(enc.pendingReaction).toBeUndefined();
    });

    it('ne consomme pas l’action du réacteur', () => {
      let enc = applyAction(fleeing(), { type: 'move', actorId: 'a', to: { x: 0, y: 3 } });
      enc = applyAction(enc, { type: 'react', abilityId: 'weapon:weapon' });
      // Le garde pourra encore agir à son tour : réagir n'est pas jouer.
      expect(findUnit(enc, 'b')!.actionUsed).toBe(false);
    });

    it('ne redemande pas deux fois au même combattant', () => {
      let enc = applyAction(fleeing(), { type: 'move', actorId: 'a', to: { x: 0, y: 3 } });
      enc = applyAction(enc, { type: 'skipReaction' });
      // La reprise ne doit pas rouvrir la fenêtre du même garde.
      expect(enc.pendingReaction).toBeUndefined();
      expect(findUnit(enc, 'a')!.pos).toEqual({ x: 0, y: 3 });
    });
  });

  describe('réaction défensive', () => {
    const pasDimensionnel = spellNode('space-pas-dimensionnel');

    const ambush = () => {
      const enc = emptyEncounter('Embuscade');
      enc.seed = 9;
      enc.combatants = [
        mkUnit({
          id: 'a',
          name: 'Brute',
          team: 'ennemis',
          pos: { x: 0, y: 0 },
          abilities: [flatHit({ id: 'coup' })],
        }),
        mkUnit({
          id: 'b',
          name: 'Mage',
          team: 'allies',
          pos: { x: 1, y: 0 },
          abilities: [{ ...pasDimensionnel, id: 'pas' }],
          mana: 50,
          // Assez vif pour que seul un 1 le prenne de court : ces tests
          // éprouvent la MÉCANIQUE de la fenêtre, pas le jet de réflexe, qui a
          // sa propre série juste en dessous.
          attributes: ATTRS({ dexterite: 20 }),
          proficiency: 6,
        }),
      ];
      return applyAction(enc, { type: 'start' });
    };

    it('marque Pas dimensionnel comme réaction et téléportation', () => {
      expect(pasDimensionnel.reaction).toEqual(['incoming-attack']);
      expect(pasDimensionnel.teleport).toBe(true);
    });

    it('ouvre une fenêtre quand la cible peut se dérober', () => {
      const enc = applyAction(ambush(), {
        type: 'use',
        actorId: 'a',
        abilityId: 'coup',
        at: { x: 1, y: 0 },
      });
      expect(enc.pendingReaction?.trigger).toBe('incoming-attack');
      expect(enc.pendingReaction?.actorId).toBe('b');
      // Rien n'est encore payé ni infligé.
      expect(findUnit(enc, 'b')!.hp).toBe(40);
      expect(findUnit(enc, 'a')!.actionUsed).toBe(false);
    });

    it('esquive vraiment : se téléporter hors de portée annule le coup', () => {
      let enc = applyAction(ambush(), {
        type: 'use',
        actorId: 'a',
        abilityId: 'coup',
        at: { x: 1, y: 0 },
      });
      enc = applyAction(enc, { type: 'react', abilityId: 'pas', at: { x: 6, y: 6 } });

      expect(findUnit(enc, 'b')!.pos).toEqual({ x: 6, y: 6 });
      // L'attaque a repris, mais la case visée est vide : elle ne touche personne.
      expect(findUnit(enc, 'b')!.hp).toBe(40);
      expect(enc.log.some((l) => l.text.includes('Aucune cible valide'))).toBe(true);
      // L'attaquant a quand même dépensé son action : se dérober n'est pas gratuit pour lui.
      expect(findUnit(enc, 'a')!.actionUsed).toBe(true);
    });

    it('encaisse le coup si l’on ne réagit pas', () => {
      let enc = applyAction(ambush(), {
        type: 'use',
        actorId: 'a',
        abilityId: 'coup',
        at: { x: 1, y: 0 },
      });
      enc = applyAction(enc, { type: 'skipReaction' });
      expect(findUnit(enc, 'b')!.hp).toBe(30);
      expect(enc.pendingReaction).toBeUndefined();
    });

    it('ne paie le coût de l’attaque qu’une seule fois', () => {
      let enc = applyAction(ambush(), {
        type: 'use',
        actorId: 'a',
        abilityId: 'coup',
        at: { x: 1, y: 0 },
      });
      const enduranceAvant = findUnit(enc, 'a')!.endurance;
      enc = applyAction(enc, { type: 'skipReaction' });
      // L'action suspendue puis reprise ne doit pas prélever deux fois.
      expect(findUnit(enc, 'a')!.endurance).toBe(enduranceAvant);
    });

    it('réagit même quand on a déjà joué son tour', () => {
      // Le cas ORDINAIRE, pas un cas limite : on réagit pendant le tour d'un
      // autre, donc on a presque toujours déjà dépensé son action. Confondre
      // les deux monnaies rendait toute réaction injouable en pratique.
      let enc = ambush();
      findUnit(enc, 'b')!.actionUsed = true;

      enc = applyAction(enc, { type: 'use', actorId: 'a', abilityId: 'coup', at: { x: 1, y: 0 } });
      expect(enc.pendingReaction?.actorId).toBe('b');

      enc = applyAction(enc, { type: 'react', abilityId: 'pas', at: { x: 6, y: 6 } });
      expect(findUnit(enc, 'b')!.pos).toEqual({ x: 6, y: 6 });
      // Et l'action reste dépensée : réagir ne la rend pas.
      expect(findUnit(enc, 'b')!.actionUsed).toBe(true);
    });

    it('n’ouvre aucune fenêtre quand rien n’est jouable', () => {
      // Proposer une réaction qu'un refus rejettera ensuite fait perdre sa
      // réaction au joueur en apparence, et le laisse chercher pourquoi.
      const enc = ambush();
      findUnit(enc, 'b')!.mana = 0; // Pas dimensionnel devient inabordable.

      expect(reactionOptions(findUnit(enc, 'b')!, 'incoming-attack')).toHaveLength(0);
      const frappe = applyAction(enc, {
        type: 'use',
        actorId: 'a',
        abilityId: 'coup',
        at: { x: 1, y: 0 },
      });
      expect(frappe.pendingReaction).toBeUndefined();
      expect(findUnit(frappe, 'b')!.hp).toBeLessThan(40);
    });

    it('n’offre pas la fenêtre à qui a déjà réagi', () => {
      let enc = applyAction(ambush(), {
        type: 'use',
        actorId: 'a',
        abilityId: 'coup',
        at: { x: 1, y: 0 },
      });
      enc = applyAction(enc, { type: 'react', abilityId: 'pas', at: { x: 6, y: 6 } });
      expect(findUnit(enc, 'b')!.reactionUsed).toBe(true);
      expect(reactionOptions(findUnit(enc, 'b')!, 'incoming-attack')).toHaveLength(0);
    });

    describe('voir le coup venir', () => {
      const rolling = (value: number) => ({ d20: () => value }) as unknown as Rng;
      const vif = (dex: number, prof = 2) =>
        mkUnit({
          id: 'b', name: 'B', team: 'allies',
          attributes: ATTRS({ dexterite: dex }), proficiency: prof,
        });
      const menace = (speed: number) =>
        mkUnit({ id: 'a', name: 'A', team: 'ennemis', base: STATS({ speed }) });

      it('se joue à la Dextérité, pas à la Vitesse', () => {
        // La Vitesse fait déjà déplacement, initiative et esquive naturelle.
        // C'est la Dextérité qui n'avait presque aucun métier en combat.
        const adroit = vif(18);
        const gourd = vif(6);
        expect(reflexThreshold(adroit, menace(10))).toBeLessThan(
          reflexThreshold(gourd, menace(10)),
        );

        // La Vitesse du réactant, elle, n'y change rien.
        const rapide = vif(10);
        rapide.base = STATS({ speed: 90 });
        expect(reflexThreshold(rapide, menace(10))).toBe(reflexThreshold(vif(10), menace(10)));
      });

      it('devient plus dur face à un assaillant fulgurant', () => {
        expect(reflexThreshold(vif(14), menace(90))).toBeGreaterThan(
          reflexThreshold(vif(14), menace(10)),
        );
      });

      it('laisse au 1 et au 20 le dernier mot', () => {
        // Le plus vif est pris de court une fois sur vingt ; le plus gourd voit
        // parfois venir. C'est ce qui empêche une parade d'être acquise.
        expect(resolveReflexRoll(THRESHOLD_MIN, rolling(1)).success).toBe(false);
        expect(resolveReflexRoll(THRESHOLD_MAX, rolling(20)).success).toBe(true);
      });

      it('n’ouvre aucun menu quand le réflexe échoue', () => {
        // C'est le comportement demandé : un combattant pris de court ne se
        // voit pas proposer un choix qu'il n'a pas le temps de faire.
        const enc = ambush();
        // Gourd et lent d'esprit : il lui faut presque tout le dé.
        const cible = findUnit(enc, 'b')!;
        cible.attributes = ATTRS({ dexterite: 1 });
        cible.proficiency = 0;

        // On cherche une graine qui le prend de court, puis on vérifie tout ce
        // qui doit en découler.
        const raté = [...Array(40).keys()]
          .map((seed) =>
            applyAction(
              { ...enc, seed: seed + 1 },
              { type: 'use', actorId: 'a', abilityId: 'coup', at: { x: 1, y: 0 } },
            ),
          )
          .find((state) => state.log.some((l) => l.text.includes('trop tard')));

        expect(raté).toBeDefined();
        expect(raté!.pendingReaction).toBeUndefined();
        // Le coup est passé pendant qu'il cherchait sa garde.
        expect(findUnit(raté!, 'b')!.hp).toBeLessThan(40);
        // Et sa réaction lui reste : il n'a rien tenté, il n'a pas eu le temps.
        expect(findUnit(raté!, 'b')!.reactionUsed).toBe(false);
        expect(findUnit(raté!, 'b')!.mana).toBe(50);
      });

      it('annonce le jet au journal, score compris', () => {
        const enc = applyAction(ambush(), {
          type: 'use', actorId: 'a', abilityId: 'coup', at: { x: 1, y: 0 },
        });
        const ligne = enc.log.find((l) => l.text.startsWith('Réaction de'))!;
        expect(ligne.text).toMatch(/^Réaction de Mage — dé \d+ \/ \d+\+ → (à temps|trop tard)\.$/);
        expect(ligne.details?.[0]).toContain('rien ne s’y ajoute');
      });
    });

    it('fait détaler l’Évasion enflammée ET brûler à l’arrivée', () => {
      const evasion = spellNode('combo-evasion-enflammee');
      // Le saut se mesure à part : « Autour de soi » décrit le brasier, pas la
      // longueur du bond.
      expect(evasion.teleport).toBe(true);
      expect(evasion.teleportMeters).toBe(8);
      expect(evasion.shape).toEqual({ kind: 'radius', meters: 3 });
      expect(evasion.reaction).toEqual(['incoming-attack']);

      const enc = emptyEncounter('Brasier');
      enc.seed = 11;
      enc.combatants = [
        mkUnit({
          id: 'a',
          name: 'Sorcier',
          team: 'allies',
          pos: { x: 0, y: 0 },
          abilities: [{ ...evasion, id: 'evasion' }],
          mana: 50,
        }),
        // Un poursuivant sur la case d'arrivée : il doit prendre le brasier.
        mkUnit({ id: 'b', name: 'Poursuivant', team: 'ennemis', pos: { x: 4, y: 0 } }),
        // Un badaud resté au départ : il ne doit RIEN prendre.
        mkUnit({ id: 'c', name: 'Badaud', team: 'ennemis', pos: { x: 1, y: 0 } }),
      ];
      const started = applyAction(enc, { type: 'start' });
      const after = applyAction(started, {
        type: 'use',
        actorId: 'a',
        abilityId: 'evasion',
        at: { x: 5, y: 0 },
      });

      expect(findUnit(after, 'a')!.pos).toEqual({ x: 5, y: 0 });
      // Le brasier est centré sur l'ARRIVÉE, pas sur le départ.
      expect(findUnit(after, 'b')!.hp).toBeLessThan(40);
      expect(findUnit(after, 'c')!.hp).toBe(40);
    });

    it('refuse un saut au-delà de la distance de téléportation', () => {
      const evasion = spellNode('combo-evasion-enflammee');
      const enc = emptyEncounter('Saut');
      enc.combatants = [
        mkUnit({
          id: 'a',
          name: 'Sorcier',
          team: 'allies',
          pos: { x: 0, y: 0 },
          abilities: [{ ...evasion, id: 'evasion' }],
          mana: 50,
        }),
        mkUnit({ id: 'b', name: 'B', team: 'ennemis', pos: { x: 18, y: 12 } }),
      ];
      const started = applyAction(enc, { type: 'start' });
      // 8 m = 5 cases : la 10e est hors d'atteinte.
      const after = applyAction(started, {
        type: 'use',
        actorId: 'a',
        abilityId: 'evasion',
        at: { x: 10, y: 0 },
      });
      expect(findUnit(after, 'a')!.pos).toEqual({ x: 0, y: 0 });
      expect(after.log.some((l) => l.text.includes('Trop loin'))).toBe(true);
    });

    it('refuse une téléportation hors de portée ou sur une case occupée', () => {
      const enc = ambush();
      const mage = findUnit(enc, 'b')!;
      // Portée du palier 1 : 10 m, soit moins de 7 cases.
      const trop = applyAction(enc, { type: 'use', actorId: 'b', abilityId: 'pas', at: { x: 19, y: 14 } });
      expect(findUnit(trop, 'b')!.pos).toEqual(mage.pos);
      const occupe = applyAction(enc, { type: 'use', actorId: 'b', abilityId: 'pas', at: { x: 0, y: 0 } });
      expect(findUnit(occupe, 'b')!.pos).toEqual(mage.pos);
    });
  });
});

/* ── Zone de gêne des armes à distance ─────────────────────────────────────── */

describe('tir à bout portant', () => {
  const bow = (category: string) => ({
    name: category,
    minDamage: 10,
    maxDamage: 10,
    weaponCategory: category,
  });

  it('donne à chaque arme sa zone, en cases', () => {
    // 1 case = 1,5 m.
    expect(weaponAbility(bow('shortBow'), 'weapon').disadvantageMeters).toBe(3);
    expect(weaponAbility(bow('longBow'), 'weapon').disadvantageMeters).toBe(4.5);
    expect(weaponAbility(bow('crossbow'), 'weapon').disadvantageMeters).toBe(1.5);
    expect(weaponAbility(bow('handCrossbow'), 'weapon').disadvantageMeters).toBe(1.5);
    expect(weaponAbility(bow('sling'), 'weapon').disadvantageMeters).toBe(1.5);
  });

  it('n’en donne pas aux armes de mêlée ni aux sorts', () => {
    expect(weaponAbility(bow('longsword'), 'weapon').disadvantageMeters).toBe(0);
    expect(unarmedAbility().disadvantageMeters ?? 0).toBe(0);
  });

  it('coûte de la précision, pas de la puissance', () => {
    // La gêne se paie désormais sur le jet : le tir part quand même, mais mal
    // servi. Un tireur adroit en compense donc une partie, ce qu'une division
    // des dégâts ne permettait pas.
    const arc = weaponAbility(bow('longBow'), 'weapon');
    const actor = mkUnit({ id: 'a', name: 'A', team: 'allies', pos: { x: 0, y: 0 } });
    const colle = mkUnit({ id: 'b', name: 'B', team: 'ennemis', pos: { x: 1, y: 0 } });
    const loin = mkUnit({ id: 'c', name: 'C', team: 'ennemis', pos: { x: 5, y: 0 } });

    // Cinq crans de dé : le seuil monte d'autant.
    expect(hitThreshold(actor, arc, colle) - hitThreshold(actor, arc, loin)).toBe(
      DISADVANTAGE_PRECISION / 5,
    );
  });

  it('mesure la gêne comme le moteur, à la case près', () => {
    const actor = mkUnit({ id: 'a', name: 'A', team: 'allies', pos: { x: 0, y: 0 } });
    const arc = weaponAbility(bow('shortBow'), 'weapon'); // 2 cases = 3 m
    const at = (x: number) => mkUnit({ id: 'b', name: 'B', team: 'ennemis', pos: { x, y: 0 } });

    expect(isDisadvantaged(actor, arc, at(2))).toBe(true); // 3 m : dans la zone
    expect(isDisadvantaged(actor, arc, at(3))).toBe(false); // 4,5 m : dehors
  });

  it('le dit au journal plutôt que de rogner en silence', () => {
    const arc = { ...weaponAbility(bow('longBow'), 'weapon'), id: 'test:hit', autoHit: true };
    const enc = strike(duel({ abilities: [arc] }, { pos: { x: 1, y: 0 } }), { x: 1, y: 0 });
    expect(enc.log.some((l) => l.details?.some((d) => d.includes('tir gêné')))).toBe(true);
  });
});

/* ── Érosion du scaling ────────────────────────────────────────────────────── */

describe('un vieux sort ne reste pas redoutable', () => {
  const trait = (spellLevel: number) =>
    flatHit({
      autoHit: true,
      spellLevel,
      damages: [{ min: 10, max: 10, type: 'fire', scaling: [{ source: 'atk_mag', ratio: 0.6 }] }],
    });
  const lanceur = (level: number) =>
    mkUnit({ id: 'a', name: 'A', team: 'allies', level, base: STATS({ atk_mag: 100 }) });

  it('rend tout son scaling à qui vient de l’apprendre', () => {
    expect(scalingFalloff(lanceur(5), trait(5))).toBe(1);
    expect(abilityDamageRanges(lanceur(5), trait(5))[0].min).toBe(70);
  });

  it('l’érode à mesure que le lanceur dépasse le sort', () => {
    // Dix niveaux d'écart : la moitié du scaling. C'est ce qui empêchait un
    // sort d'apprenti de tuer un guerrier de niveau 20 en deux coups.
    expect(scalingFalloff(lanceur(15), trait(5))).toBe(0.5);
    expect(abilityDamageRanges(lanceur(15), trait(5))[0].min).toBe(40);
  });

  it('n’érode jamais les dés — la puissance propre du sort reste', () => {
    // C'est ce que la fiche annonce : seule décroît la part empruntée au
    // lanceur, jamais celle qui appartient au sort.
    const tresVieux = abilityDamageRanges(lanceur(100), trait(1))[0];
    expect(tresVieux.min).toBeGreaterThan(10);
    expect(tresVieux.min).toBeLessThan(20);
  });

  it('laisse tranquille ce qui n’est pas un sort', () => {
    const arme = flatHit({ damages: [{ min: 5, max: 5, type: 'slashing' }] });
    expect(scalingFalloff(lanceur(20), arme)).toBe(1);
  });
});

/* ── Le prix du mouvement ──────────────────────────────────────────────────── */

describe('le prix du mouvement', () => {
  const marcheur = (over: Partial<Combatant> = {}) =>
    mkUnit({ id: 'a', name: 'A', team: 'allies', base: STATS({ speed: 20, endurance: 20 }), ...over });

  it('laisse un pas gratuit', () => {
    expect(movementToll(MOVE_FREE_METERS)).toBe(0);
  });

  it('fait payer au-delà, par tranche entamée', () => {
    expect(movementToll(MOVE_FREE_METERS + 0.1)).toBe(1);
    expect(movementToll(MOVE_FREE_METERS + MOVE_METERS_PER_ENDURANCE)).toBe(1);
    expect(movementToll(MOVE_FREE_METERS + MOVE_METERS_PER_ENDURANCE + 0.1)).toBe(2);
  });

  it('ne se contourne pas en fractionnant son trajet', () => {
    // C'est la raison d'être du calcul sur le CUMUL : trois petits bonds
    // doivent coûter ce que coûte le trajet d'un trait.
    const enc = applyAction(
      duel({ base: STATS({ speed: 30, endurance: 20 }) }, { pos: { x: 12, y: 6 } }),
      { type: 'start' },
    );
    const dEnAffilee = applyAction(enc, { type: 'move', actorId: 'a', to: { x: 4, y: 0 } });

    let parBonds = enc;
    for (const x of [1, 2, 3, 4]) {
      parBonds = applyAction(parBonds, { type: 'move', actorId: 'a', to: { x, y: 0 } });
    }
    expect(findUnit(parBonds, 'a')!.pos).toEqual({ x: 4, y: 0 });
    expect(findUnit(parBonds, 'a')!.endurance).toBe(findUnit(dEnAffilee, 'a')!.endurance);
  });

  it('rétrécit la portée quand le souffle manque', () => {
    // La vue dessine ce budget-là : proposer une case qu'on refusera ensuite
    // serait une fausse promesse.
    const frais = marcheur();
    const asseche = marcheur({ endurance: 0 });
    expect(affordableMovement(asseche)).toBeLessThan(affordableMovement(frais));
    // Mais un pas reste toujours possible : épuisé, on avance encore.
    expect(affordableMovement(asseche)).toBe(MOVE_FREE_METERS);
  });

  it('peut mettre à bout de souffle à lui seul', () => {
    const enc = applyAction(
      duel({ base: STATS({ speed: 40, endurance: 20 }) }, { pos: { x: 14, y: 6 } }),
      { type: 'start' },
    );
    findUnit(enc, 'a')!.endurance = 1;
    const apres = applyAction(enc, { type: 'move', actorId: 'a', to: { x: 3, y: 0 } });
    expect(findUnit(apres, 'a')!.endurance).toBe(0);
    expect(findUnit(apres, 'a')!.winded).toBe(true);
  });
});

/* ── Essoufflement ─────────────────────────────────────────────────────────── */

describe('essoufflement', () => {
  /** Un combattant qui n'a plus qu'un souffle, et une action qui le lui prend. */
  const aBout = () => {
    const coup = flatHit({ id: 'test:hit', enduranceCost: 2 });
    const enc = applyAction(
      duel({ abilities: [coup], base: STATS({ endurance: 20, speed: 20 }) }),
      { type: 'start' },
    );
    // On vide la réserve APRÈS l'ouverture du tour : celle-ci en rend déjà, et
    // la régler avant ferait mentir le compte.
    findUnit(enc, 'a')!.endurance = 2;
    return strike(enc);
  };

  it('se déclenche quand la réserve touche le fond', () => {
    const enc = aBout();
    expect(findUnit(enc, 'a')!.endurance).toBe(0);
    expect(findUnit(enc, 'a')!.winded).toBe(true);
    expect(enc.log.some((l) => l.text.includes('à bout de souffle'))).toBe(true);
  });

  it('coûte de la précision — on frappe encore, mais mal', () => {
    const arme = flatHit({ autoHit: false, attackAttribute: 'dexterite' });
    const frais = mkUnit({ id: 'x', name: 'X', team: 'allies' });
    const creve = mkUnit({ id: 'y', name: 'Y', team: 'allies', winded: true });
    expect(precisionOf(frais, arme) - precisionOf(creve, arme)).toBe(WINDED_PRECISION_PENALTY);
  });

  it('coûte de la vitesse, donc le déplacement, l’initiative ET l’esquive', () => {
    // La Vitesse porte les trois : la sanction se paie sur tout à la fois.
    // C'est voulu — un combattant épuisé devient une proie.
    const frais = mkUnit({ id: 'x', name: 'X', team: 'allies', base: STATS({ speed: 30 }) });
    const creve = mkUnit({
      id: 'y', name: 'Y', team: 'allies', base: STATS({ speed: 30 }), winded: true,
    });
    expect(effectiveStat(creve, 'speed')).toBe(effectiveStat(frais, 'speed') * WINDED_SPEED_SHARE);
    expect(naturalEvade(creve)).toBeLessThan(naturalEvade(frais));
    expect(movementBudget(creve)).toBeLessThan(movementBudget(frais));
  });

  it('ne se lève pas au premier point regagné', () => {
    // Sans seuil de sortie, on oscillerait autour de zéro en retrouvant sa
    // pleine forme un tour sur deux.
    let enc = aBout();
    enc = applyAction(enc, { type: 'endTurn' });
    enc = applyAction(enc, { type: 'endTurn' });
    const unit = findUnit(enc, 'a')!;
    // Un tour de respiration ne rend qu'une poignée de souffle, loin du seuil.
    expect(unit.endurance).toBeLessThan(unit.base.endurance * WINDED_RECOVERY_SHARE);
    expect(unit.winded).toBe(true);
  });

  it('se lève une fois la réserve vraiment refaite', () => {
    let enc = aBout();
    findUnit(enc, 'a')!.endurance = findUnit(enc, 'a')!.base.endurance - 1;
    enc = applyAction(enc, { type: 'endTurn' });
    enc = applyAction(enc, { type: 'endTurn' });
    expect(findUnit(enc, 'a')!.winded).toBe(false);
    expect(enc.log.some((l) => l.text.includes('repris son souffle'))).toBe(true);
  });

  it('la garde en sort plus vite que la respiration', () => {
    // C'est tout le tempo du combat : se couvrir vaut plusieurs tours de repos.
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies' });
    expect(GUARD_ENDURANCE_GAIN).toBeGreaterThan(enduranceRecovery(unit));
  });
});

/* -- Jet de toucher --------------------------------------------------------- */

describe('jet de toucher', () => {
  /** Un jet dont on connait le d100 : c'est le degre qu'on veut eprouver. */
  const rolling = (value: number) => ({ d20: () => value }) as unknown as Rng;

  describe('qui vise, et qui balaye', () => {
    it('fait jeter les des a ce qui prend une cible', () => {
      expect(aims(flatHit({ autoHit: false }))).toBe(true);
    });

    it('en dispense les zones - un souffle n’ajuste rien', () => {
      // C'est la FORME qui decide, pas la nature : un sort a cible unique jette,
      // un coup d'arme en cone ne jetterait pas non plus.
      expect(aims(flatHit({ autoHit: false, shape: { kind: 'radius', meters: 6 } }))).toBe(false);
      expect(aims(flatHit({ autoHit: false, shape: { kind: 'cone', meters: 8 } }))).toBe(false);
    });
  });

  describe('la precision vient de l’outil', () => {
    it('suit l’attribut que la categorie d’arme designe', () => {
      // La rapiere vise a la Dexterite, la hache de bataille a la Force : c'est
      // ecrit dans weapon_category.json, et c'est ce qui fait qu'un bretteur et
      // un cogneur ne valent pas la meme chose avec les memes outils.
      const fine = { name: 'Rapiere', minDamage: 3, maxDamage: 5, weaponCategory: 'rapier' };
      const lourd = { name: 'Hache', minDamage: 3, maxDamage: 5, weaponCategory: 'battleAxe' };
      const adroit = mkUnit({
        id: 'a',
        name: 'A',
        team: 'allies',
        attributes: ATTRS({ dexterite: 18, force: 8 }),
      });

      expect(precisionOf(adroit, weaponAbility(fine, 'weapon'))).toBeGreaterThan(
        precisionOf(adroit, weaponAbility(lourd, 'weapon')),
      );
    });

    it('ne doit rien a l’attaque - sinon le niveau compterait deux fois', () => {
      // atk_phy pilote deja les degats. Une brute et un fluet egalement adroits
      // touchent aussi souvent ; ce qui les separe, c'est ce que le coup coute.
      const arme = weaponAbility(
        { name: 'Dague', minDamage: 2, maxDamage: 4, weaponCategory: 'dagger' },
        'weapon',
      );
      const brute = mkUnit({ id: 'a', name: 'A', team: 'allies', base: STATS({ atk_phy: 80 }) });
      const fluet = mkUnit({ id: 'b', name: 'B', team: 'allies', base: STATS({ atk_phy: 5 }) });
      expect(precisionOf(brute, arme)).toBe(precisionOf(fluet, arme));
    });
  });

  describe('la chance de toucher', () => {
    it('descend le seuil à mesure que la précision monte', () => {
      const arme = flatHit({ autoHit: false, attackAttribute: 'dexterite' });
      const cible = mkUnit({ id: 'b', name: 'B', team: 'ennemis', pos: { x: 1, y: 0 } });
      const gauche = mkUnit({
        id: 'a', name: 'A', team: 'allies', attributes: ATTRS({ dexterite: 6 }), proficiency: 0,
      });
      const adroit = mkUnit({
        id: 'c', name: 'C', team: 'allies', attributes: ATTRS({ dexterite: 18 }), proficiency: 4,
      });
      expect(hitThreshold(adroit, arme, cible)).toBeLessThan(hitThreshold(gauche, arme, cible));
    });

    it('accumule fin et n’arrondit qu’une fois', () => {
      // L'esquive naturelle vaut 1 à 4 points, soit MOINS d'un cran de dé.
      // Arrondie séparément elle serait perdue ; additionnée à la précision
      // avant conversion, elle peut faire basculer un cas limite.
      const arme = flatHit({ autoHit: false, attackAttribute: 'dexterite' });
      const actor = mkUnit({ id: 'a', name: 'A', team: 'allies' });
      const lent = mkUnit({ id: 'b', name: 'B', team: 'ennemis', pos: { x: 1, y: 0 } });
      const vif = mkUnit({
        id: 'c', name: 'C', team: 'ennemis', pos: { x: 1, y: 0 }, base: STATS({ speed: 90 }),
      });
      expect(hitThreshold(actor, arme, vif)).toBeGreaterThan(hitThreshold(actor, arme, lent));
    });

    it('reproduit la table de référence quand rien ne joue', () => {
      // Précision nulle : rate sur 1, effleure de 2 à 5, touche de 6 à 19,
      // critique sur 20. Tout le reste du système n'est que ce barème décalé.
      const arme = flatHit({ autoHit: false, attackAttribute: 'dexterite' });
      const quidam = mkUnit({
        id: 'a', name: 'A', team: 'allies', attributes: ATTRS({ dexterite: 10 }), proficiency: 0,
      });
      const cible = mkUnit({ id: 'b', name: 'B', team: 'ennemis', pos: { x: 1, y: 0 } });
      const seuil = hitThreshold(quidam, arme, cible);
      expect(seuil).toBe(HIT_TARGET_BASE);

      // Exprimé PAR les constantes, pas par des nombres recopiés : le barème
      // se règle encore, et un test qui fige les chiffres à la main devient un
      // frein plutôt qu'un garde-fou.
      expect(outcomeOf(1, seuil)).toBe('miss');
      expect(outcomeOf(seuil - GRAZE_STEPS - 1, seuil)).toBe('miss');
      for (let roll = seuil - GRAZE_STEPS; roll < seuil; roll++) {
        expect(outcomeOf(roll, seuil)).toBe('graze');
      }
      for (const roll of [seuil, 19]) expect(outcomeOf(roll, seuil)).toBe('hit');
      expect(outcomeOf(20, seuil)).toBe('critical');
    });

    it('reste bornee des deux cotes', () => {
      // Rien n'est jamais acquis ni perdu d'avance : le meilleur bretteur peut
      // manquer, la cible la plus insaisissable finit par etre atteinte.
      const arme = flatHit({ autoHit: false });
      const virtuose = mkUnit({
        id: 'a',
        name: 'A',
        team: 'allies',
        attributes: ATTRS({ dexterite: 20 }),
        proficiency: 20,
      });
      const insaisissable = mkUnit({
        id: 'b',
        name: 'B',
        team: 'ennemis',
        pos: { x: 1, y: 0 },
        base: STATS({ speed: 900 }),
      });
      const empote = mkUnit({
        id: 'c',
        name: 'C',
        team: 'allies',
        attributes: ATTRS({ dexterite: 1 }),
        proficiency: 0,
      });
      const pataud = mkUnit({ id: 'd', name: 'D', team: 'ennemis', pos: { x: 1, y: 0 } });

      expect(hitThreshold(virtuose, arme, pataud)).toBe(THRESHOLD_MIN);
      expect(hitThreshold(empote, arme, insaisissable)).toBe(THRESHOLD_MAX);
    });
  });

  describe('les degres', () => {
    it('classe le jet selon ou il tombe', () => {
      // Seuil 8 : effleure de 4 a 7, touche a partir de 8.
      expect(resolveHitRoll(8, rolling(8)).outcome).toBe('hit');
      expect(resolveHitRoll(8, rolling(7)).outcome).toBe('graze');
      expect(resolveHitRoll(8, rolling(8 - GRAZE_STEPS)).outcome).toBe('graze');
      expect(resolveHitRoll(8, rolling(8 - GRAZE_STEPS - 1)).outcome).toBe('miss');
    });

    it('garde au 1 et au 20 leur mot final', () => {
      // Le meilleur bretteur rate sur un 1 ; la cible la plus insaisissable
      // finit par etre atteinte. C'est ce qui empeche un combat d'etre joue
      // d'avance — et ce qui fait les histoires qu'on raconte apres.
      expect(outcomeOf(1, THRESHOLD_MIN)).toBe('miss');
      expect(outcomeOf(20, THRESHOLD_MAX)).toBe('critical');
    });

    it('rend l’echec sec rare - un tour perdu ne doit pas decider la partie', () => {
      // La regle qui doit survivre a tous les reglages : un mauvais jet ECORNE
      // plus souvent qu'il ne vole le tour. Avec une seule action par tour, un
      // rate sec est du temps de jeu pris au joueur, et sur des combats courts
      // il decide la partie a lui seul.
      const degres = [...Array(20).keys()].map((i) => outcomeOf(i + 1, HIT_TARGET_BASE));
      const secs = degres.filter((d) => d === 'miss').length;
      const ecornes = degres.filter((d) => d === 'graze').length;

      expect(secs).toBe(HIT_TARGET_BASE - GRAZE_STEPS - 1);
      expect(secs).toBeLessThan(ecornes);
    });

    it('dit que le dé est BRUT — la question que tout joueur se pose', () => {
      // Venant du d20 classique, on croit que son modificateur s'ajoute au dé.
      // Ici il descend le seuil. La ligne doit le dire d'elle-même, sinon il
      // faut l'expliquer à chaque partie.
      const detail = resolveHitRoll(6, rolling(12)).detail;
      expect(detail).toContain('dé 12 brut');
      expect(detail).toContain('rien ne s’y ajoute');
      expect(detail).toContain('seuil 6+');
      expect(detail).toContain('→ touche');
    });

    it('explique d’où vient le seuil quand on lui donne le détail', () => {
      const detail = resolveHitRoll(6, rolling(12), {
        threshold: 6,
        steps: 2,
        causes: ['précision'],
      }).detail;
      expect(detail).toContain(`socle ${HIT_TARGET_BASE} − 2 : précision`);
    });
  });

  describe('a la resolution', () => {
    /** Un duel ou l'attaquant jette vraiment les des. */
    const combat = (seed: number, over: Partial<CombatAbility> = {}) => {
      const enc = duel({ abilities: [flatHit({ autoHit: false, ...over })] }, {});
      enc.seed = seed;
      return strike(enc);
    };
    const pv = (enc: Encounter) => findUnit(enc, 'b')!.hp;

    it('un coup manque ne coute rien du tout a sa cible', () => {
      // On cherche une graine qui manque, puis on verifie qu'il ne s'est
      // VRAIMENT rien passe : ni degats, ni statut.
      const manque = [...Array(80).keys()]
        .map((seed) => combat(seed + 1, { inflicts: [{ status: 'brulure', chance: 100 }] }))
        .find((enc) => enc.log.some((l) => l.text.includes('manque')));
      expect(manque).toBeDefined();
      expect(pv(manque!)).toBe(40);
      expect(findUnit(manque!, 'b')!.statuses).toHaveLength(0);
    });

    it('un effleurement ecorne au lieu de blesser', () => {
      const effleure = [...Array(80).keys()]
        .map((seed) => combat(seed + 1))
        // « → effleure », pas « effleure » tout court : le détail annonce aussi
        // le seuil d'effleurement sur les jets qui touchent pleinement.
        .find((enc) => enc.log.some((l) => l.details?.some((d) => d.includes('→ effleure'))));
      expect(effleure).toBeDefined();
      expect(40 - pv(effleure!)).toBe(Math.round(10 * GRAZE_FACTOR));
    });

    it('résume tout sur la ligne d’en-tête : brut ET réel', () => {
      // Le journal se lit en pleine partie, sans déplier les détails : le degré,
      // ce qui a été porté, ce qui a été encaissé et la nature du coup doivent
      // tenir sur cette seule ligne.
      const enc = duel(
        { abilities: [flatHit({ autoHit: true })] },
        { base: STATS({ def_phy: 25 }) }, // 25/(25+25) = 50 % absorbés
      );
      const ligne = strike(enc).log.find((l) => l.kind === 'damage')!;
      expect(ligne.text).toBe(
        'Attaquant touche Cible — Frappe test : 5 dégâts [10 bruts] de Tranchant.',
      );
    });

    it('dit le degré dans le verbe, pas seulement dans les détails', () => {
      const critique = [...Array(80).keys()]
        .map((seed) => combat(seed + 1))
        .find((enc) => enc.log.some((l) => l.details?.some((d) => d.includes('→ coup critique'))));
      expect(critique).toBeDefined();
      expect(critique!.log.find((l) => l.kind === 'damage')!.text).toContain('coup critique');
    });

    it('une zone ne peut pas manquer', () => {
      const souffle = combat(1, { shape: { kind: 'radius', meters: 6 }, rangeMeters: 9 });
      expect(souffle.log.some((l) => l.text.includes('manque'))).toBe(false);
      expect(pv(souffle)).toBeLessThan(40);
    });

    it('un buff d’esquive l’emporte encore sur le jet', () => {
      // L'effacement passe AVANT : Disparition ne rend pas dur a viser, elle
      // fait qu'il n'y a plus rien a viser.
      const enc = duel({ abilities: [flatHit({ autoHit: false })] }, {});
      findUnit(enc, 'b')!.effects.push({
        id: 'e',
        name: 'Disparition',
        remaining: 3,
        mods: [],
        evadeChance: 100,
      });
      expect(pv(strike(enc))).toBe(40);
    });
  });
});

/* ── Esquive naturelle ─────────────────────────────────────────────────────── */

describe('esquive naturelle', () => {
  const withSpeed = (speed: number) =>
    mkUnit({ id: 'u', name: 'U', team: 'allies', base: STATS({ speed }) });

  it('vaut 1 % par tranche de 10 de Vitesse', () => {
    expect(naturalEvade(withSpeed(0))).toBe(0);
    expect(naturalEvade(withSpeed(9))).toBe(0);
    expect(naturalEvade(withSpeed(10))).toBe(1);
    expect(naturalEvade(withSpeed(25))).toBe(2);
    expect(naturalEvade(withSpeed(40))).toBe(4);
  });

  it('suit les buffs de Vitesse', () => {
    const unit = withSpeed(10);
    unit.effects.push({ id: 'e', name: 'Hâte', remaining: 3, mods: [{ stat: 'speed', value: 20 }] });
    expect(naturalEvade(unit)).toBe(3);
  });

  it('ne se cumule pas avec l’esquive d’un buff : la meilleure l’emporte', () => {
    const unit = withSpeed(30); // naturelle : 3 %
    unit.effects.push({ id: 'e', name: 'Camouflage', remaining: 3, mods: [], evadeChance: 40 });
    expect(evadeChance(unit)).toBe(40);
  });
});

/* ── Sac : munitions et consommables ───────────────────────────────────────── */

describe('sac', () => {
  const shot = (over: Partial<CombatAbility> = {}): CombatAbility =>
    flatHit({ consumes: { item: 'Flèches', qty: 1 }, rangeMeters: 18, ...over });

  it('décompte la munition à chaque tir', () => {
    const enc = duel({
      abilities: [shot()],
      inventory: [{ name: 'Flèches', qty: 3, kind: 'ammunition' }],
    });
    const after = strike(enc);
    expect(carriedQty(findUnit(after, 'a')!, 'Flèches')).toBe(2);
    expect(after.log.some((l) => l.details?.some((d) => d.includes('−1 Flèches (reste 2)')))).toBe(
      true,
    );
  });

  it('refuse le tir quand le carquois est vide', () => {
    const enc = duel({
      abilities: [shot()],
      inventory: [{ name: 'Flèches', qty: 0, kind: 'ammunition' }],
    });
    const actor = findUnit(enc, 'a')!;
    expect(cannotUse(enc, actor, shot(), { x: 1, y: 0 })).toMatch(/Plus de flèches/i);

    // Et l'action n'a rien retiré à la cible.
    expect(findUnit(strike(enc), 'b')!.hp).toBe(40);
  });

  it('laisse la ligne à zéro plutôt que de l’effacer', () => {
    let enc = duel({
      abilities: [shot()],
      inventory: [{ name: 'Flèches', qty: 1, kind: 'ammunition' }],
    });
    enc = applyAction(enc, { type: 'start' });
    enc = applyAction(enc, { type: 'use', actorId: 'a', abilityId: 'test:hit', at: { x: 1, y: 0 } });
    const line = findUnit(enc, 'a')!.inventory.find((i) => i.name === 'Flèches');
    expect(line).toBeDefined();
    expect(line!.qty).toBe(0);
  });

  it('consomme la fiole et rend les PV d’une potion', () => {
    const potion: CombatAbility = flatHit({
      id: 'test:hit',
      name: 'Potion de soin',
      kind: 'item',
      damages: [],
      heal: 7,
      targets: ['self', 'ally'],
      consumes: { item: 'Potion de soin', qty: 1 },
    });
    const enc = duel({
      abilities: [potion],
      hp: 20,
      inventory: [{ name: 'Potion de soin', qty: 2, kind: 'consumable' }],
    });
    // On se soigne soi-même : la cible est la case du lanceur.
    const after = applyAction(enc, {
      type: 'use',
      actorId: 'a',
      abilityId: 'test:hit',
      at: { x: 0, y: 0 },
    });
    expect(findUnit(after, 'a')!.hp).toBe(27);
    expect(carriedQty(findUnit(after, 'a')!, 'Potion de soin')).toBe(1);
  });

  it('rend du mana sans dépasser la réserve', () => {
    const flask: CombatAbility = flatHit({
      id: 'test:hit',
      name: 'Potion de mana',
      kind: 'item',
      damages: [],
      restoreMana: 50,
      targets: ['self'],
      consumes: { item: 'Potion de mana', qty: 1 },
    });
    const enc = duel({
      abilities: [flask],
      mana: 5,
      inventory: [{ name: 'Potion de mana', qty: 1, kind: 'consumable' }],
    });
    const after = applyAction(enc, {
      type: 'use',
      actorId: 'a',
      abilityId: 'test:hit',
      at: { x: 0, y: 0 },
    });
    expect(findUnit(after, 'a')!.mana).toBe(20);
  });

  it('lit les dés écrits sur une fiche de potion', () => {
    expect(parseDice('Rend 2d4 + 2 points de vie au buveur, immédiatement.')).toEqual({
      min: 4,
      max: 10,
    });
    expect(parseDice('Restaure une petite quantité de mana')).toBeUndefined();
  });

  it('résout ce qui est chiffré et reporte le reste au MJ', () => {
    const statuses = new Map([['poison', 'poison']]);
    const antidote = consumableAbility(
      {
        name: 'Antidote',
        effects: [
          'Rend 2d4 + 2 points de vie au buveur, immédiatement.',
          'Met fin au statut Poison.',
          'Amertume violente et haut-le-cœur dans la minute qui suit.',
        ],
      },
      statuses,
    );
    expect(antidote.heal).toBe(7); // moyenne de 4–10
    expect(antidote.cleanses).toEqual(['poison']);
    // La ligne non chiffrée n'est pas perdue : elle part au journal.
    expect(antidote.manualEffects).toEqual([
      'Amertume violente et haut-le-cœur dans la minute qui suit.',
    ]);
    expect(antidote.consumes).toEqual({ item: 'Antidote', qty: 1 });
  });
});

/* ── Compétences de classe ─────────────────────────────────────────────────── */

describe('compétences de classe', () => {
  const guerrier: ClassDef = {
    key: 'warrior',
    name: 'Guerrier',
    spells: [
      { name: 'Frappe puissante', level: 1, endurance: 5, description: 'Décuple les dégâts.' },
      { name: 'Bastion', level: 17, endurance: 26, description: 'Devient inébranlable.' },
    ],
  };

  it('n’ouvre que les compétences atteintes en niveau', () => {
    expect(classSkillsFor(guerrier, 5).map((a) => a.name)).toEqual(['Frappe puissante']);
    expect(classSkillsFor(guerrier, 20).map((a) => a.name)).toEqual([
      'Frappe puissante',
      'Bastion',
    ]);
  });

  it('renchérit le coût écrit sur la fiche de classe', () => {
    // Les fiches chiffrent l'effort « à froid » ; en combat, un grand geste se
    // mérite. Le facteur vit dans le code, pas dans les 38 fiches : le régler
    // se fait en un point.
    const [strike] = classSkillsFor(guerrier, 1);
    expect(strike.enduranceCost).toBe(Math.round(5 * CLASS_SKILL_ENDURANCE_FACTOR));
    expect(strike.manaCost).toBe(0);
  });

  it('se déclare, coûte son endurance et porte sa description au journal', () => {
    const [skill] = classSkillsFor(guerrier, 1);
    const enc = duel({ abilities: [{ ...skill, id: 'test:hit' }], endurance: 20 });
    const after = applyAction(enc, {
      type: 'use',
      actorId: 'a',
      abilityId: 'test:hit',
      at: { x: 1, y: 0 },
    });
    expect(findUnit(after, 'a')!.endurance).toBe(20 - skill.enduranceCost);
    expect(findUnit(after, 'a')!.actionUsed).toBe(true);
    // Le moteur ne chiffre pas l'effet : il le met sous les yeux du MJ.
    expect(
      after.log.some((l) => l.details?.includes('Décuple les dégâts.')),
    ).toBe(true);
  });

  it('est refusée sans l’endurance nécessaire', () => {
    const [skill] = classSkillsFor(guerrier, 1);
    const enc = duel({ endurance: 2 });
    expect(cannotUse(enc, findUnit(enc, 'a')!, skill, { x: 1, y: 0 })).toMatch(
      /Endurance insuffisante/,
    );
  });

  /* Contre le VRAI catalogue : c'est ce qui casserait en silence si un bloc
     `combat` de classes.json était mal formé. */
  describe('catalogue réel', () => {
    const byKey = (key: string): ClassDef =>
      (classCatalog as unknown as ClassDef[]).find((c) => c.key === key)!;

    it('chiffre toutes les compétences sauf celles qui sont hors combat', () => {
      const all = (classCatalog as unknown as ClassDef[]).flatMap((c) => c.spells ?? []);
      const sansEffet = all.filter((s) => !s.combat).map((s) => s.name);
      expect(all.length).toBe(38);
      expect(sansEffet).toEqual(['Pister', 'Crochetage expert']);
    });

    it('résout « Frappe puissante » en vrais dégâts', () => {
      const [frappe] = classSkillsFor(byKey('warrior'), 1);
      expect(frappe.name).toBe('Frappe puissante');
      expect(frappe.damages[0].type).toBe('slashing');
      expect(frappe.rangeMeters).toBe(1.5);

      const enc = duel({ abilities: [{ ...frappe, id: 'test:hit' }], endurance: 20 });
      const after = strike(enc);
      // 5–9 de base + 0,35 × 20 d'attaque = 12 à 16, cible sans défense.
      const lost = 40 - findUnit(after, 'b')!.hp;
      expect(lost).toBeGreaterThanOrEqual(12);
      expect(lost).toBeLessThanOrEqual(16);
      // Le garde-fou qui compte : une compétence entame, elle n'achève pas.
      expect(lost).toBeLessThan(40);
    });

    it('ne laisse aucune compétence tuer un pair d’un seul coup', () => {
      const cible = () =>
        mkUnit({ id: 'b', name: 'B', team: 'ennemis', pos: { x: 1, y: 0 }, base: STATS() });

      for (const klass of classCatalog as unknown as ClassDef[]) {
        for (const ability of classSkillsFor(klass, 20)) {
          if (!ability.damages.length) continue;
          // Pire cas : tous les dés au maximum, aucune défense en face.
          const maxed = {
            ...ability,
            id: 'test:hit',
            damages: ability.damages.map((d) => ({ ...d, min: d.max })),
          };
          const enc = duel({ abilities: [maxed], endurance: 99 }, {});
          enc.combatants[1] = cible();
          const lost = 40 - findUnit(strike(enc), 'b')!.hp;
          expect(lost, `${klass.name} — ${ability.name}`).toBeLessThan(40);
        }
      }
    });

    it('résout « Garde inébranlable » en buff de défense', () => {
      const garde = classSkillsFor(byKey('warrior'), 5).find((a) => a.name === 'Garde inébranlable')!;
      const enc = duel({ abilities: [{ ...garde, id: 'test:hit' }], endurance: 20 });
      const after = applyAction(enc, {
        type: 'use',
        actorId: 'a',
        abilityId: 'test:hit',
        at: { x: 0, y: 0 },
      });
      const caster = findUnit(after, 'a')!;
      expect(effectiveStat(caster, 'def_phy')).toBe(9);
      expect(caster.effects[0].remaining).toBe(3);
    });

    it('fait ignorer l’armure à « Brise-garde »', () => {
      const brise = classSkillsFor(byKey('warrior'), 11).find((a) => a.name === 'Brise-garde')!;
      // Type `true` : aucune défense ne le réduit.
      expect(damageReduction(mkUnit({ id: 'x', name: 'X', team: 'ennemis', base: STATS({ def_phy: 30 }) }), brise.damages[0].type)).toBe(0);
    });

    it('rend du mana avec « Meditation », scaling compris', () => {
      const medit = classSkillsFor(byKey('mage'), 3).find((a) => a.name === 'Meditation')!;
      const enc = duel({ abilities: [{ ...medit, id: 'test:hit' }], mana: 0, endurance: 20 });
      const after = applyAction(enc, {
        type: 'use',
        actorId: 'a',
        abilityId: 'test:hit',
        at: { x: 0, y: 0 },
      });
      // 22 de base + 1 × 10 (intelligence) = 32, plafonné à la réserve de 20.
      expect(findUnit(after, 'a')!.mana).toBe(20);
    });

    it('fait de « Combo rapide » trois attaques au poing, sans dégâts propres', () => {
      const combo = classSkillsFor(byKey('pugilist'), 1).find((a) => a.name === 'Combo rapide')!;
      expect(combo.unarmed).toBe(true);
      expect(combo.damages).toHaveLength(3);
      // Trois coups de poing identiques, sans dé de base : tout vient de l'attaque.
      const [first] = combo.damages;
      expect(first.min).toBe(0);
      expect(first.type).toBe('bludgeoning');
      for (const d of combo.damages) expect(d).toEqual(first);
    });

    it('frappe moins fort par coup que le poing isolé', () => {
      // L'attaque physique dépasse les PV à niveau égal dans cet univers :
      // trois poings PLEINS tueraient mécaniquement un pair. L'enchaînement a
      // donc son propre ratio, plus bas — c'est ce qui l'empêche d'assommer.
      const combo = classSkillsFor(byKey('pugilist'), 1).find((a) => a.name === 'Combo rapide')!;
      const perStrike = combo.damages[0].scaling![0].ratio;
      expect(perStrike).toBeLessThan(PUGILIST_UNARMED_RATIO);
      // …mais l'enchaînement complet doit valoir plus qu'un seul poing.
      expect(perStrike * combo.damages.length).toBeGreaterThan(PUGILIST_UNARMED_RATIO);
    });

    it('ne laisse aucun enchaînement de poings emporter un pair', () => {
      // Profil réaliste : attaque et PV d'un niveau 10 (l'attaque dépasse les PV).
      const ATK = 99;
      const HP = 84;
      for (const ability of classSkillsFor(byKey('pugilist'), 20)) {
        if (!ability.unarmed || !ability.damages.length) continue;
        const total = ability.damages.reduce((sum, d) => sum + d.max + d.scaling![0].ratio * ATK, 0);
        expect(total, ability.name).toBeLessThan(HP);
      }
    });

    it('renforce « Combo rapide » via les buffs de poing, pas via une arme', () => {
      const combo = classSkillsFor(byKey('pugilist'), 1).find((a) => a.name === 'Combo rapide')!;
      const enc = duel({ abilities: [{ ...combo, id: 'test:hit' }], endurance: 30 });
      const nu = 40 - findUnit(strike(enc), 'b')!.hp;

      const buffed = duel({ abilities: [{ ...combo, id: 'test:hit' }], endurance: 30 });
      findUnit(buffed, 'a')!.effects.push({
        id: 'e',
        name: 'Poing de fer',
        remaining: 3,
        mods: [],
        enchant: { target: 'unarmed', damage: { min: 4, max: 4, type: 'bludgeoning' } },
      });
      // +4 par coup, sur les trois coups.
      expect(40 - findUnit(strike(buffed), 'b')!.hp).toBe(nu + 12);
    });

    it('fait de « Poing de fer » un buff de poing, plus une frappe', () => {
      const poing = classSkillsFor(byKey('pugilist'), 17).find((a) => a.name === 'Poing de fer')!;
      expect(poing.damages).toHaveLength(0);
      expect(poing.enchant?.target).toBe('unarmed');
      expect(poing.duration).toBeGreaterThan(0);
    });

    it('laisse une compétence hors combat en description seule', () => {
      const pister = classSkillsFor(byKey('ranger'), 3).find((a) => a.name === 'Pister')!;
      expect(pister.damages).toHaveLength(0);
      expect(pister.manualEffects?.length).toBe(1);
    });
  });
});

/* ── Tours et initiative ───────────────────────────────────────────────────── */

describe('initiative', () => {
  it('classe les combattants par Vitesse décroissante', () => {
    const enc = applyAction(
      duel(
        { base: STATS({ speed: 8 }) },
        { base: STATS({ speed: 16 }) },
      ),
      { type: 'start' },
    );
    // Le plus rapide ouvre le bal, quel que soit l'ordre d'ajout.
    expect(enc.order).toEqual(['b', 'a']);
    expect(findUnit(enc, 'b')!.initiative).toBe(16);
    expect(findUnit(enc, 'a')!.initiative).toBe(8);
  });

  it('ne consomme aucun jet de dés pour établir l’ordre', () => {
    const enc = applyAction(duel(), { type: 'start' });
    // L'ordre est déterministe : rien à tirer, donc rien à rejouer de travers.
    expect(enc.rollCount).toBe(0);
  });

  it('départage les ex æquo sur la Dextérité, jamais au hasard', () => {
    const enc = applyAction(
      duel(
        { attributes: ATTRS({ dexterite: 8 }) },
        { attributes: ATTRS({ dexterite: 18 }) },
      ),
      { type: 'start' },
    );
    expect(enc.order).toEqual(['b', 'a']);
  });

  it('tient compte des buffs de Vitesse dans l’ordre', () => {
    const enc = duel({ base: STATS({ speed: 10 }) }, { base: STATS({ speed: 12 }) });
    // Une hâte sur le plus lent le fait passer devant.
    findUnit(enc, 'a')!.effects.push({
      id: 'e',
      name: 'Hâte',
      remaining: 5,
      mods: [{ stat: 'speed', value: 5 }],
    });
    expect(applyAction(enc, { type: 'start' }).order).toEqual(['a', 'b']);
  });
});

describe('tours', () => {
  it('ouvre le premier round', () => {
    const enc = applyAction(duel(), { type: 'start' });
    expect(enc.started).toBe(true);
    expect(enc.round).toBe(1);
  });

  it('incrémente le round après le dernier combattant', () => {
    let enc = applyAction(duel(), { type: 'start' });
    expect(enc.round).toBe(1);
    enc = applyAction(enc, { type: 'endTurn' });
    enc = applyAction(enc, { type: 'endTurn' });
    expect(enc.round).toBe(2);
  });

  it('remet le budget d’action à neuf au début d’un tour', () => {
    let enc = applyAction(duel(), { type: 'start' });
    const firstId = enc.order[0];
    enc = applyAction(enc, { type: 'move', actorId: firstId, to: { x: 0, y: 2 } });
    expect(findUnit(enc, firstId)!.moved).toBeGreaterThan(0);

    enc = applyAction(enc, { type: 'endTurn' });
    enc = applyAction(enc, { type: 'endTurn' });
    expect(findUnit(enc, firstId)!.moved).toBe(0);
    expect(findUnit(enc, firstId)!.actionUsed).toBe(false);
  });

  it('saute le tour d’un combattant à terre', () => {
    let enc = duel({}, { hp: 1 });
    enc.combatants.push(
      mkUnit({ id: 'c', name: 'Renfort', team: 'ennemis', pos: { x: 5, y: 5 } }),
    );
    enc = applyAction(enc, { type: 'start' });
    // On abat la cible, puis on fait un tour complet : elle ne doit pas jouer.
    const actorId = 'a';
    enc = applyAction(enc, { type: 'damage', targetId: 'b', amount: 99 });
    const roundBefore = enc.round;
    for (let i = 0; i < 3; i++) enc = applyAction(enc, { type: 'endTurn' });
    expect(enc.round).toBeGreaterThan(roundBefore);
    expect(currentUnit(enc)?.id).not.toBe('b');
    expect(findUnit(enc, actorId)!.down).toBe(false);
  });
});

/* ── Rejouabilité ──────────────────────────────────────────────────────────── */

describe('rejouabilité', () => {
  it('produit exactement la même partie à graine égale', () => {
    const play = (): Encounter => {
      let enc = duel({ abilities: [flatHit({ autoHit: false })] });
      enc.seed = 987;
      enc = applyAction(enc, { type: 'start' });
      for (let i = 0; i < 6; i++) {
        enc = applyAction(enc, { type: 'use', actorId: 'a', abilityId: 'test:hit', at: { x: 1, y: 0 } });
        enc = applyAction(enc, { type: 'endTurn' });
      }
      return enc;
    };

    const first = play();
    const second = play();
    expect(second.log.map((l) => l.text)).toEqual(first.log.map((l) => l.text));
    expect(second.combatants.map((c) => c.hp)).toEqual(first.combatants.map((c) => c.hp));
    expect(second.rollCount).toBe(first.rollCount);
  });

  it('ne modifie jamais la rencontre passée en entrée', () => {
    const enc = duel();
    const snapshot = structuredClone(enc);
    applyAction(enc, { type: 'start' });
    expect(enc).toEqual(snapshot);
  });
});

/* ── Scaling ───────────────────────────────────────────────────────────────── */

describe('scaling', () => {
  it('additionne les contributions de stats et d’attributs', () => {
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies', attributes: ATTRS({ intelligence: 16 }) });
    const total = resolveScaling(unit, [
      { source: 'atk_mag', ratio: 0.5 }, // 0,5 × 20 = 10
      { source: 'intelligence', ratio: 1 }, // 1 × 16 = 16
    ]);
    expect(total).toBe(26);
  });
});
