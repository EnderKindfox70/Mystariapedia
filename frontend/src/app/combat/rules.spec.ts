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
import { proficiencyForLevel } from '../character/universe-data';
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
  visibleGroup,
  weaponAbility,
} from './abilities';
import { Affinities, Combatant, CombatAbility, Encounter, Team } from './combat.types';
import { Rng } from './dice';
import { emptyEncounter } from './encounter';
import { enemiesOf } from './tactician';
import {
  cellDistance,
  cellsInShape,
  hasLineOfSight,
  metersBetween,
  movementMeters,
  parseRangeMeters,
  parseShape,
  reachableCells,
  samePos,
  unitDistanceMeters,
} from './grid';
import {
  abilityDamageRanges,
  abilityHealAmount,
  abilityManaAmount,
  ambienceDamageFactor,
  applyAction,
  effectiveManaCost,
  allegianceOf,
  anchorBlocker,
  announcedBreakdown,
  applyStatus,
  cannotUse,
  CASTER_HANDS,
  controllerOf,
  handsBound,
  homesOn,
  isValidTarget,
  movementOverlay,
  movementPath,
  swapAnchorMissing,
  swapPartnerAt,
  carriedQty,
  currentUnit,
  damageReduction,
  DISADVANTAGE_PRECISION,
  PRECISION_PER_STEP,
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
  BASE_PROFICIENCY,
  masterySteps,
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
  statusByKey,
  terrainFor,
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
    applyStatus(enc, findUnit(enc, 'b')!, 'brulure', undefined, { duration: 1 });
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

  it('couvre toute la famille du wiki, poings et arme appariés', () => {
    const all = spells.all().filter((p) => enchantTargetOf(p.spell.key));
    const poings = all.filter((p) => enchantTargetOf(p.spell.key) === 'unarmed');
    const armes = all.filter((p) => enchantTargetOf(p.spell.key) === 'weapon');

    // On ne fige NI le compte, ni l'appariement : ajouter un domaine au wiki ne
    // doit pas casser un test du moteur, et tous les domaines n'ont pas de
    // raison d'offrir les deux formes — le Renforcement densifie une arme, il
    // n'a pas de version pour les poings. Ce qui doit tenir, c'est que les deux
    // familles existent et que chacune produise un enchantement valide.
    expect(poings.length).toBeGreaterThanOrEqual(12);
    expect(armes.length).toBeGreaterThanOrEqual(12);
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

      expect(reactionOptions(enc, findUnit(enc, 'b')!, 'incoming-attack')).toHaveLength(0);
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
      expect(reactionOptions(enc, findUnit(enc, 'b')!, 'incoming-attack')).toHaveLength(0);
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
      // L'arme est MAÎTRISÉE : sans cela, la maîtrise ne compte pas, et un
      // virtuose ne serait virtuose que de ses attributs.
      const arme = flatHit({ autoHit: false, proficient: true });
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

  describe('la maîtrise', () => {
    const arme = (proficient: boolean) => flatHit({ autoHit: false, proficient });
    const cible = () => mkUnit({ id: 'z', name: 'Z', team: 'ennemis', pos: { x: 1, y: 0 } });
    const combattant = (proficiency: number) =>
      mkUnit({ id: 'a', name: 'A', team: 'allies', proficiency });

    it('ne compte que sur ce qu’on sait manier', () => {
      // C'est TOUTE la règle : ramasser l'arc d'un mort ne donne pas vingt ans
      // d'entraînement à l'arc.
      const veteran = combattant(6);
      expect(masterySteps(veteran, arme(true))).toBeGreaterThan(0);
      expect(masterySteps(veteran, arme(false))).toBe(0);
      expect(hitThreshold(veteran, arme(true), cible())).toBeLessThan(
        hitThreshold(veteran, arme(false), cible()),
      );
    });

    it('ne change rien pour qui ne maîtrise pas, quel que soit son niveau', () => {
      // Un guerrier de niveau 20 tient l'arc comme un débutant : sa progression
      // est passée dans l'épée.
      expect(hitThreshold(combattant(6), arme(false), cible())).toBe(
        hitThreshold(combattant(2), arme(false), cible()),
      );
    });

    it('vaut UN CRAN par palier — pas une fraction que l’arrondi avale', () => {
      // Passée par l'échelle fine, la maîtrise ne valait que 0,4 cran : monter
      // de 2 à 4 ne déplaçait pas le seuil d'un iota, et vingt niveaux de
      // carrière n'en gagnaient qu'un et demi. Une progression qu'on ne voit
      // pas n'existe pas.
      const debutant = hitThreshold(combattant(BASE_PROFICIENCY), arme(true), cible());
      for (const palier of [3, 4, 5, 6]) {
        expect(hitThreshold(combattant(palier), arme(true), cible())).toBe(
          debutant - (palier - BASE_PROFICIENCY),
        );
      }
    });

    it('suit le niveau du personnage, du débutant au vétéran', () => {
      expect(proficiencyForLevel(1)).toBe(BASE_PROFICIENCY);
      expect(proficiencyForLevel(12)).toBe(4);
      expect(proficiencyForLevel(20)).toBe(6);
      // Quatre crans d'écart entre le premier et le dernier niveau : vingt
      // points de pourcentage, et ça se sent.
      expect(
        hitThreshold(combattant(proficiencyForLevel(1)), arme(true), cible()) -
          hitThreshold(combattant(proficiencyForLevel(20)), arme(true), cible()),
      ).toBe(4);
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

/* ── Action bonus ──────────────────────────────────────────────────────────── */

describe('action bonus', () => {
  const dague = { name: 'Dague', minDamage: 3, maxDamage: 3, weaponCategory: 'dagger' };

  /** Une frappe d'action bonus qui touche toujours, en plus de l'attaque du tour. */
  const bonus = (over: Partial<CombatAbility> = {}) =>
    flatHit({ id: 'test:bonus', name: 'Main gauche', bonusAction: true, ...over });

  const jouer = (enc: Encounter, abilityId: string): Encounter =>
    applyAction(enc, { type: 'use', actorId: 'a', abilityId, at: { x: 1, y: 0 } });

  it('marque l’arme secondaire, jamais la main principale', () => {
    expect(weaponAbility(dague, 'offhand').bonusAction).toBe(true);
    expect(weaponAbility(dague, 'weapon').bonusAction).toBe(false);
  });

  it('frappe sans la part d’attaque physique, mais avec le modificateur du bras', () => {
    const arbalete = {
      name: 'Arbalète de poing',
      minDamage: 4,
      maxDamage: 8,
      weaponCategory: 'handCrossbow',
    };
    // Dextérité 16 → +3. L'arbalète de poing blesse à la Dextérité.
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies', attributes: ATTRS({ dexterite: 16 }) });

    // Main faible : les 4–8 de l'arme, plus le seul modificateur.
    const faible = abilityDamageRanges(unit, weaponAbility(arbalete, 'offhand'))[0];
    expect(faible).toEqual({ min: 7, max: 11, type: 'piercing' });

    // La MÊME arme en main principale reprend ses 25 % d'attaque physique (20 → 5).
    const principale = abilityDamageRanges(unit, weaponAbility(arbalete, 'weapon'))[0];
    expect(principale.min).toBe(4 + WEAPON_ATTACK_RATIO * 20);
    expect(principale.max).toBe(8 + WEAPON_ATTACK_RATIO * 20);
  });

  it('n’ajoute le modificateur qu’une fois, pas sur le projectile', () => {
    const arbalete = {
      name: 'Arbalète de poing',
      minDamage: 4,
      maxDamage: 8,
      weaponCategory: 'handCrossbow',
    };
    const carreaux = { name: 'Carreaux', damageType: 'piercing', damageBonus: 2 };
    const unit = mkUnit({ id: 'u', name: 'U', team: 'allies', attributes: ATTRS({ dexterite: 16 }) });

    const ranges = abilityDamageRanges(unit, weaponAbility(arbalete, 'offhand', carreaux));
    expect(ranges[0]).toEqual({ min: 7, max: 11, type: 'piercing' });
    expect(ranges[1]).toEqual({ min: 2, max: 2, type: 'piercing' });
  });

  it('porte vraiment ce qu’elle annonce', () => {
    // Le coup RÉSOLU doit valoir la fourchette affichée : dés + modificateur,
    // sans un point d'attaque physique.
    const dague = { name: 'Dague', minDamage: 4, maxDamage: 4, weaponCategory: 'dagger' };
    const arme = { ...weaponAbility(dague, 'offhand'), id: 'test:bonus', autoHit: true };
    let enc = duel({ abilities: [arme], attributes: ATTRS({ dexterite: 16 }) });
    enc = applyAction(enc, { type: 'start' });
    enc = jouer(enc, 'test:bonus');
    // 4 (dague) + 3 (mod. de Dextérité) = 7, et non 4 + 5 (25 % de 20).
    expect(findUnit(enc, 'b')!.hp).toBe(33);
  });

  it('marque les objets du sac : boire ne coûte plus le tour', () => {
    const fiole = consumableAbility(
      { name: 'Potion de soin', slug: 'potion-de-soin', effects: ['Rend 2d4 points de vie.'] },
      new Map(),
    );
    expect(fiole.bonusAction).toBe(true);
  });

  it('laisse frapper de la main gauche après l’attaque du tour', () => {
    let enc = duel({ abilities: [flatHit(), bonus()] });
    enc = applyAction(enc, { type: 'start' });

    enc = jouer(enc, 'test:hit');
    expect(findUnit(enc, 'a')!.actionUsed).toBe(true);
    expect(findUnit(enc, 'a')!.bonusActionUsed).toBe(false);

    enc = jouer(enc, 'test:bonus');
    expect(findUnit(enc, 'a')!.bonusActionUsed).toBe(true);
    // Les deux coups ont porté : 10 + 10.
    expect(findUnit(enc, 'b')!.hp).toBe(20);
  });

  it('ne rend qu’un seul créneau bonus par tour', () => {
    let enc = duel({ abilities: [flatHit(), bonus()] });
    enc = applyAction(enc, { type: 'start' });
    enc = jouer(enc, 'test:bonus');
    const apres = jouer(enc, 'test:bonus');

    expect(findUnit(apres, 'b')!.hp).toBe(30);
    expect(apres.log.at(-1)?.text).toContain('Action bonus déjà utilisée');
  });

  it('ne reporte pas un créneau sur l’autre', () => {
    let enc = duel({ abilities: [flatHit(), bonus()] });
    enc = applyAction(enc, { type: 'start' });
    // L'action bonus dépensée ne paie pas une attaque ordinaire…
    const unit = findUnit(enc, 'a')!;
    unit.bonusActionUsed = true;
    expect(cannotUse(enc, unit, bonus(), { x: 1, y: 0 })).toContain('Action bonus déjà utilisée');
    expect(cannotUse(enc, unit, flatHit(), { x: 1, y: 0 })).toBeNull();

    // …et l'action dépensée ne bloque pas la main gauche.
    unit.bonusActionUsed = false;
    unit.actionUsed = true;
    expect(cannotUse(enc, unit, flatHit(), { x: 1, y: 0 })).toContain('Action déjà utilisée');
    expect(cannotUse(enc, unit, bonus(), { x: 1, y: 0 })).toBeNull();
  });

  it('rend les deux créneaux à l’ouverture du tour', () => {
    let enc = duel({ abilities: [flatHit(), bonus()] });
    enc = applyAction(enc, { type: 'start' });
    enc = jouer(enc, 'test:hit');
    enc = jouer(enc, 'test:bonus');

    enc = applyAction(enc, { type: 'endTurn' });
    enc = applyAction(enc, { type: 'endTurn' });
    expect(findUnit(enc, 'a')!.actionUsed).toBe(false);
    expect(findUnit(enc, 'a')!.bonusActionUsed).toBe(false);
  });

  it('n’entame pas le créneau du tour quand la main gauche riposte', () => {
    // Une réaction se joue hors de son tour : elle ne doit rien prendre au
    // budget de celui qui réagit, pas même son action bonus.
    let enc = duel(
      {},
      { abilities: [bonus({ reaction: ['leave-reach'] })], pos: { x: 1, y: 0 } },
    );
    enc = applyAction(enc, { type: 'start' });
    // Le défenseur a déjà joué son tour : c'est le cas ordinaire d'une riposte.
    const avant = findUnit(enc, 'b')!;
    avant.actionUsed = true;
    avant.bonusActionUsed = false;

    // L'attaquant se dérobe : la fenêtre s'ouvre sur le défenseur.
    enc = applyAction(enc, { type: 'move', actorId: 'a', to: { x: 4, y: 0 } });
    expect(enc.pendingReaction?.actorId).toBe('b');

    enc = applyAction(enc, { type: 'react', abilityId: 'test:bonus' });
    expect(findUnit(enc, 'a')!.hp).toBeLessThan(40);

    const apres = findUnit(enc, 'b')!;
    expect(apres.reactionUsed).toBe(true);
    expect(apres.bonusActionUsed).toBe(false);
    expect(apres.actionUsed).toBe(true);
  });
});

/* ── Maniement à deux mains ────────────────────────────────────────────────── */

describe('maniement à deux mains', () => {
  const claymore = { name: 'Claymore', minDamage: 8, maxDamage: 14, weaponCategory: 'claymore' };
  const dague = { name: 'Dague', minDamage: 3, maxDamage: 5, weaponCategory: 'dagger' };

  /** Un combattant qui tient `principale`, plus une dague en main faible. */
  const armé = (principale: typeof claymore) =>
    duel({
      abilities: [weaponAbility(principale, 'weapon'), weaponAbility(dague, 'offhand')],
    });

  it('reconnaît les armes qui prennent les deux mains', () => {
    expect(weaponAbility(claymore, 'weapon').twoHanded).toBe(true);
    expect(weaponAbility(dague, 'weapon').twoHanded).toBe(false);
  });

  it('refuse la main faible tant que l’arme principale prend les deux mains', () => {
    const enc = applyAction(armé(claymore), { type: 'start' });
    const unit = findUnit(enc, 'a')!;
    const faible = unit.abilities.find((a) => a.id === 'weapon:offhand')!;

    expect(cannotUse(enc, unit, faible, { x: 1, y: 0 })).toContain('à deux mains');
  });

  it('laisse la main faible frapper sous une arme à une main', () => {
    const enc = applyAction(armé(dague), { type: 'start' });
    const unit = findUnit(enc, 'a')!;
    const faible = unit.abilities.find((a) => a.id === 'weapon:offhand')!;

    expect(cannotUse(enc, unit, faible, { x: 1, y: 0 })).toBeNull();
  });

  it('n’empêche pas l’arme principale elle-même de frapper', () => {
    const enc = applyAction(armé(claymore), { type: 'start' });
    const unit = findUnit(enc, 'a')!;
    const principale = unit.abilities.find((a) => a.id === 'weapon:weapon')!;

    expect(cannotUse(enc, unit, principale, { x: 1, y: 0 })).toBeNull();
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

/* ── Marque spatiale et échange de place ───────────────────────────────────
   Trois choses distinguent l'échange d'une téléportation, et chacune s'est
   d'abord trompée : il vise un CORPS et non une case libre (donc les deux
   pions bougent vraiment), il se passe de ligne de vue, et il fonctionne
   à l'identique en réaction. La marque, elle, se pose au contact et tient à
   une laisse — s'en éloigner la rompt.
─────────────────────────────────────────────────────────────────────────── */

describe('marque spatiale et change-place', () => {
  const spells = new SpellsService();
  const node = (key: string, index = 0) => {
    const page = spells.bySlug(key)!;
    return spellAbility(page, page.spell.progression!.nodes[index]);
  };

  const marque = node('space-marque-spatiale');
  /** Palier III : le premier qui se joue en réaction ET qui prend un ennemi. */
  const changePlace = node('space-change-place', 2);

  /** Un mage marqueur en (0,0), un compagnon en (5,5), une brute en (1,0). */
  const table = () => {
    const enc = emptyEncounter('Permutation');
    enc.seed = 3;
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 0, y: 0 },
        abilities: [
          { ...marque, id: 'marque' },
          { ...changePlace, id: 'change' },
        ],
        mana: 80,
        attributes: ATTRS({ dexterite: 20 }),
        proficiency: 6,
      }),
      mkUnit({ id: 'ami', name: 'Ami', team: 'allies', pos: { x: 5, y: 5 } }),
      mkUnit({
        id: 'brute',
        name: 'Brute',
        team: 'ennemis',
        pos: { x: 1, y: 0 },
        abilities: [flatHit({ id: 'coup' })],
      }),
    ];
    return applyAction(enc, { type: 'start' });
  };

  /**
   * Pose la marque du mage sur `id`, en l'amenant au contact le temps du sort.
   *
   * Sur un ennemi, le sceau demande un jet : on réessaie jusqu'à ce qu'il
   * prenne, puisque ce n'est pas ce que ces tests-là éprouvent.
   */
  const marquer = (enc: Encounter, id: string): Encounter => {
    const depart = { ...findUnit(enc, 'mage')!.pos };
    let etat = structuredClone(enc);
    // Un echange se fait entre DEUX marques : le mage porte d'abord la sienne.
    // Sur soi le sceau ne rate jamais, donc un seul essai suffit.
    if (id !== 'mage' && !findUnit(etat, 'mage')!.statuses.length) {
      etat = applyAction(etat, { type: 'use', actorId: 'mage', abilityId: 'marque', at: depart });
      findUnit(etat, 'mage')!.actionUsed = false;
    }
    for (let essai = 0; essai < 30; essai++) {
      const cible = findUnit(etat, id)!;
      findUnit(etat, 'mage')!.pos = { x: cible.pos.x - 1, y: cible.pos.y };
      findUnit(etat, 'mage')!.actionUsed = false;
      etat = applyAction(etat, { type: 'use', actorId: 'mage', abilityId: 'marque', at: cible.pos });
      if (findUnit(etat, id)!.statuses.some((s) => s.key === 'marque-spatiale')) break;
    }
    // Le mage regagne sa place : seule la marque devait rester de ce détour.
    findUnit(etat, 'mage')!.pos = depart;
    findUnit(etat, 'mage')!.actionUsed = false;
    return etat;
  };

  it('se pose au CONTACT, pas à distance', () => {
    expect(marque.rangeMeters).toBe(1.5);
    const enc = table();
    // L'ami est à cinq cases : hors de portée du sceau.
    const rate = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'marque',
      at: { x: 5, y: 5 },
    });
    expect(findUnit(rate, 'ami')!.statuses).toHaveLength(0);
    expect(rate.log.some((l) => l.text.includes('Hors de portée'))).toBe(true);
  });

  it('pose une marque illimitée, ancrée, et qui nomme son auteur', () => {
    const enc = marquer(table(), 'brute');
    const posee = findUnit(enc, 'brute')!.statuses.find((s) => s.key === 'marque-spatiale');
    expect(posee).toBeDefined();
    expect(posee!.remaining).toBe(-1);
    expect(posee!.sourceId).toBe('mage');
    expect(posee!.tetherMeters).toBe(15);
  });

  it('ÉCHANGE réellement les deux pions sur le plateau', () => {
    const enc = marquer(table(), 'brute');
    const after = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'change',
      at: { x: 1, y: 0 },
    });
    expect(findUnit(after, 'mage')!.pos).toEqual({ x: 1, y: 0 });
    expect(findUnit(after, 'brute')!.pos).toEqual({ x: 0, y: 0 });
    expect(after.log.some((l) => l.text.includes('échangent leur place'))).toBe(true);
  });

  it('ne demande AUCUNE ligne de vue', () => {
    const enc = marquer(table(), 'ami');
    // Un mur plein entre les deux : une visée s'y briserait, pas un lien.
    const mure = structuredClone(enc);
    for (let y = 0; y <= 6; y++) mure.terrain[`3,${y}`] = 'mur';
    const after = applyAction(mure, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'change',
      at: { x: 5, y: 5 },
    });
    expect(findUnit(after, 'mage')!.pos).toEqual({ x: 5, y: 5 });
    expect(findUnit(after, 'ami')!.pos).toEqual({ x: 0, y: 0 });
  });

  it('refuse de permuter avec qui ne porte pas SA marque', () => {
    const enc = table();
    const after = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'change',
      at: { x: 1, y: 0 },
    });
    expect(findUnit(after, 'mage')!.pos).toEqual({ x: 0, y: 0 });
    expect(findUnit(after, 'brute')!.pos).toEqual({ x: 1, y: 0 });
    expect(after.log.some((l) => l.text.includes('Marque spatiale'))).toBe(true);
  });

  it('échange AUSSI en réaction, au lieu de se téléporter', () => {
    // Le change-place n'est pas une dérobade : rien ne doit le faire passer
    // pour une téléportation ordinaire.
    expect(changePlace.teleport).toBeUndefined();
    expect(changePlace.swap).toBe(true);
    expect(changePlace.reaction).toEqual(['incoming-attack']);

    // « Voir le coup venir » est un jet : un mage pris de court ne se voit pas
    // offrir de menu. On rejoue donc l'assaut jusqu'à ce que la fenêtre
    // s'ouvre — ce n'est pas elle qu'on éprouve ici, c'est ce qu'on en fait.
    let enc = marquer(table(), 'brute');
    let attaque = enc;
    for (let seed = 1; seed <= 40 && !attaque.pendingReaction; seed++) {
      enc = { ...enc, seed, rollCount: 0 };
      attaque = applyAction(enc, {
        type: 'use',
        actorId: 'brute',
        abilityId: 'coup',
        at: { x: 0, y: 0 },
      });
    }
    expect(attaque.pendingReaction?.actorId).toBe('mage');
    expect(attaque.pendingReaction?.options).toContain('change');

    const reagi = applyAction(attaque, {
      type: 'react',
      abilityId: 'change',
      at: { x: 1, y: 0 },
    });
    // Les deux ont permuté — et le coup, qui visait (0,0), ne trouve plus que
    // son propre auteur : il se perd.
    expect(findUnit(reagi, 'mage')!.pos).toEqual({ x: 1, y: 0 });
    expect(findUnit(reagi, 'brute')!.pos).toEqual({ x: 0, y: 0 });
    expect(findUnit(reagi, 'mage')!.hp).toBe(findUnit(enc, 'mage')!.hp);
    // Et surtout : la brute ne se frappe PAS elle-même. Le passe-droit accordé
    // aux corps poussés dans la ligne de mire lève la question du camp, pas
    // celle de savoir qui frappe — un assaillant permuté avec sa proie
    // atterrissait sur la case qu'il visait et s'y assommait tout seul.
    expect(findUnit(reagi, 'brute')!.hp).toBe(findUnit(enc, 'brute')!.hp);
    expect(reagi.log.some((l) => l.text.includes('Aucune cible valide'))).toBe(true);
  });

  it('rompt la marque quand son porteur sort de la laisse', () => {
    const enc = marquer(table(), 'ami');
    expect(findUnit(enc, 'ami')!.statuses).toHaveLength(1);
    // 15 m de laisse = 10 cases. On envoie l'ami à 12.
    const loin = structuredClone(enc);
    findUnit(loin, 'ami')!.pos = { x: 12, y: 0 };
    const after = applyAction(loin, { type: 'endTurn' });
    expect(findUnit(after, 'ami')!.statuses).toHaveLength(0);
    expect(after.log.some((l) => l.text.includes('se rompt'))).toBe(true);
  });
});

/* ── Les fils du marionnettiste ────────────────────────────────────────────
   Six règles, toutes portées par le moteur : la prise se rate, elle occupe des
   mains, le pantin change de camp, il peut refuser un ordre, un 20 naturel le
   libère, et un coup encaissé par le maître fait lâcher les fils.
─────────────────────────────────────────────────────────────────────────── */

describe('fils du marionnettiste', () => {
  const spells = new SpellsService();
  const node = (key: string, index = 0) => {
    const page = spells.bySlug(key)!;
    return spellAbility(page, page.spell.progression!.nodes[index]);
  };

  const fils = node('darkness-fils-du-marionnettiste');

  /** Un marionnettiste au contact de deux gardes, et un compagnon derrière lui. */
  const scene = () => {
    const enc = emptyEncounter('Fils');
    enc.seed = 4;
    enc.combatants = [
      mkUnit({
        id: 'maitre',
        name: 'Marionnettiste',
        team: 'allies',
        pos: { x: 1, y: 1 },
        abilities: [
          { ...fils, id: 'fils' },
          flatHit({ id: 'weapon:offhand', name: 'Dague de main faible' }),
          flatHit({ id: 'weapon:weapon', name: 'Épée' }),
        ],
        mana: 200,
        attributes: ATTRS({ intelligence: 20, sagesse: 20 }),
        proficiency: 6,
      }),
      mkUnit({ id: 'garde', name: 'Garde', team: 'ennemis', pos: { x: 2, y: 1 } }),
      mkUnit({ id: 'sbire', name: 'Sbire', team: 'ennemis', pos: { x: 1, y: 2 } }),
      mkUnit({ id: 'ami', name: 'Ami', team: 'allies', pos: { x: 0, y: 0 } }),
    ];
    return applyAction(enc, { type: 'start' });
  };

  /** Noue les fils sur `id`, en réessayant : la prise se rate, et c'est voulu. */
  const nouer = (enc: Encounter, id: string): Encounter => {
    let etat = enc;
    for (let essai = 0; essai < 40; essai++) {
      const cible = findUnit(etat, id)!;
      findUnit(etat, 'maitre')!.actionUsed = false;
      etat = applyAction(etat, { type: 'use', actorId: 'maitre', abilityId: 'fils', at: cible.pos });
      if (findUnit(etat, id)!.statuses.some((s) => s.key === 'controle')) break;
    }
    findUnit(etat, 'maitre')!.actionUsed = false;
    return etat;
  };

  it('exige un jet de toucher, contrairement aux sorts sans dégâts', () => {
    // Un sort qui ne blesse pas porte d'office — sauf celui-ci, qui s'impose.
    expect(fils.requiresHit).toBe(true);
    expect(fils.autoHit).toBe(false);
    expect(fils.precisionPenalty).toBe(25);
    expect(aims(fils)).toBe(true);
  });

  it('relève le seuil de toucher à proportion de son exigence', () => {
    const enc = scene();
    const maitre = findUnit(enc, 'maitre')!;
    const garde = findUnit(enc, 'garde')!;
    const nu = hitThreshold(maitre, { ...fils, precisionPenalty: 0 }, garde);
    expect(hitThreshold(maitre, fils, garde)).toBe(nu + 25 / PRECISION_PER_STEP);
  });

  it('prend le contrôle et retourne le pantin contre les siens', () => {
    const enc = nouer(scene(), 'garde');
    const garde = findUnit(enc, 'garde')!;
    expect(garde.statuses.find((s) => s.key === 'controle')?.sourceId).toBe('maitre');
    // Il reste ennemi sur la fiche, mais plus dans le camp qu'il sert.
    expect(garde.team).toBe('ennemis');
    expect(allegianceOf(enc, garde)).toBe('allies');
    expect(controllerOf(enc, garde)?.id).toBe('maitre');
    // Et il peut désormais frapper son ancien compagnon, mais plus son maître.
    const coup = flatHit();
    expect(isValidTarget(enc, coup, garde, findUnit(enc, 'sbire')!)).toBe(true);
    expect(isValidTarget(enc, coup, garde, findUnit(enc, 'ami')!)).toBe(false);
  });

  it('occupe une main par pantin, et pas une de plus', () => {
    const un = nouer(scene(), 'garde');
    const maitre = findUnit(un, 'maitre')!;
    expect(handsBound(un, maitre)).toBe(1);
    // Une main prise : la main faible ne sert plus, la main directrice si.
    expect(cannotUse(un, maitre, maitre.abilities[1], { x: 2, y: 1 })).toContain('main faible');
    expect(cannotUse(un, maitre, maitre.abilities[2], { x: 2, y: 1 })).toBeNull();

    const deux = nouer(un, 'sbire');
    const charge = findUnit(deux, 'maitre')!;
    expect(handsBound(deux, charge)).toBe(CASTER_HANDS);
    // Les deux prises : plus rien que le déplacement.
    expect(cannotUse(deux, charge, charge.abilities[2], { x: 2, y: 1 })).toContain('se déplacer');
    // Et pas de troisième pantin, faute de main pour le tenir.
    const troisieme = applyAction(deux, {
      type: 'use',
      actorId: 'maitre',
      abilityId: 'fils',
      at: { x: 0, y: 0 },
    });
    expect(findUnit(troisieme, 'ami')!.statuses).toHaveLength(0);
  });

  it('laisse le pantin refuser un ordre sur une réussite de sagesse', () => {
    const enc = nouer(scene(), 'garde');
    findUnit(enc, 'garde')!.abilities = [flatHit({ id: 'coup' })];
    // Sagesse écrasante : il refuse à tous les coups, et l'ordre se perd.
    findUnit(enc, 'garde')!.attributes = ATTRS({ sagesse: 20 });
    findUnit(enc, 'garde')!.proficiency = 12;
    const ordre = applyAction(enc, {
      type: 'use',
      actorId: 'garde',
      abilityId: 'coup',
      at: { x: 1, y: 2 },
    });
    expect(ordre.log.some((l) => l.text.includes('refuse d’obéir'))).toBe(true);
    expect(findUnit(ordre, 'sbire')!.hp).toBe(findUnit(enc, 'sbire')!.hp);
    // Il reste tenu : refuser n'est pas se libérer.
    expect(findUnit(ordre, 'garde')!.statuses.some((s) => s.key === 'controle')).toBe(true);
  });

  it('libère le pantin sur un 20 naturel', () => {
    const enc = nouer(scene(), 'garde');
    findUnit(enc, 'garde')!.abilities = [flatHit({ id: 'coup' })];
    let libre = enc;
    for (let seed = 1; seed <= 80; seed++) {
      const essai = { ...enc, seed, rollCount: 0 };
      findUnit(essai, 'garde')!.actionUsed = false;
      const joue = applyAction(essai, {
        type: 'use',
        actorId: 'garde',
        abilityId: 'coup',
        at: { x: 1, y: 2 },
      });
      if (joue.log.some((l) => l.text.includes('se libère'))) {
        libre = joue;
        break;
      }
    }
    expect(libre.log.some((l) => l.text.includes('se libère'))).toBe(true);
    expect(findUnit(libre, 'garde')!.statuses.some((s) => s.key === 'controle')).toBe(false);
  });

  it('rompt les fils quand le maître encaisse un coup et perd sa concentration', () => {
    const enc = nouer(scene(), 'garde');
    // Un maître peu sage : sa concentration cède au premier coup sérieux.
    findUnit(enc, 'maitre')!.attributes = ATTRS({ intelligence: 20, sagesse: 1 });
    findUnit(enc, 'maitre')!.proficiency = 0;
    findUnit(enc, 'sbire')!.abilities = [
      flatHit({ id: 'coup', damages: [{ min: 60, max: 60, type: 'slashing' }] }),
    ];
    const frappe = applyAction(enc, {
      type: 'use',
      actorId: 'sbire',
      abilityId: 'coup',
      at: { x: 1, y: 1 },
    });
    expect(frappe.log.some((l) => l.text.includes('concentration'))).toBe(true);
    expect(findUnit(frappe, 'garde')!.statuses.some((s) => s.key === 'controle')).toBe(false);
  });

  it('libère le pantin poussé hors de la portée effective', () => {
    const enc = nouer(scene(), 'garde');
    expect(findUnit(enc, 'garde')!.statuses[0].tetherMeters).toBe(10);
    // 10 m de fil = un peu moins de 7 cases. On l'envoie à 10.
    const loin = structuredClone(enc);
    findUnit(loin, 'garde')!.pos = { x: 11, y: 1 };
    const apres = applyAction(loin, { type: 'endTurn' });
    expect(findUnit(apres, 'garde')!.statuses).toHaveLength(0);
  });

  it('lâche tout ce qu’il tenait quand le marionnettiste tombe', () => {
    const enc = nouer(scene(), 'garde');
    const acheve = structuredClone(enc);
    const maitre = findUnit(acheve, 'maitre')!;
    maitre.hp = 0;
    maitre.down = true;
    const apres = applyAction(acheve, { type: 'endTurn' });
    expect(findUnit(apres, 'garde')!.statuses).toHaveLength(0);
  });
});

/* ── L'onglet d'actions affiché ────────────────────────────────────────────
   Un onglet est un réglage global ; les familles d'action, elles, dépendent du
   combattant. Rester sur « Magie » en passant la main à un garde qui n'a qu'une
   épée vidait le panneau — et comme un onglet vide n'est pas affiché, il n'y
   avait rien à cliquer pour en sortir : le combattant paraissait réduit au
   déplacement. C'est ce que ces trois lignes empêchent de revenir.
─────────────────────────────────────────────────────────────────────────── */

describe('onglet d’actions visible', () => {
  const ordre = ['attaque', 'competences', 'magie', 'objets', 'garde'];
  const table = (rempli: Record<string, number>): Map<string, unknown[]> =>
    new Map(ordre.map((k) => [k, Array.from({ length: rempli[k] ?? 0 }, () => ({}))]));

  it('garde l’onglet choisi tant qu’il a quelque chose dedans', () => {
    expect(visibleGroup(ordre, table({ attaque: 1, magie: 3 }), 'magie')).toBe('magie');
  });

  it('retombe sur la première famille garnie quand le sien est vide', () => {
    // Le cas du pantin : le MJ venait de lancer un sort, l'onglet est resté sur
    // « Magie », et le garde qu'il pilote n'a qu'une épée.
    expect(visibleGroup(ordre, table({ attaque: 1 }), 'magie')).toBe('attaque');
    expect(visibleGroup(ordre, table({ garde: 1 }), 'magie')).toBe('garde');
  });

  it('ne change rien quand le combattant n’a aucune action', () => {
    expect(visibleGroup(ordre, table({}), 'magie')).toBe('magie');
  });
});

/* ── L'échange à deux marques, et le corps qu'on met sous le coup ──────────
   Deux règles que la première version ratait : un échange se fait entre DEUX
   porteurs — le lanceur compris —, et le corps qu'on jette dans la ligne de
   mire encaisse vraiment, même s'il appartient au camp de l'attaquant.
─────────────────────────────────────────────────────────────────────────── */

describe('change-place — les deux bouts du fil', () => {
  const spells = new SpellsService();
  const node = (key: string, index = 0) => {
    const page = spells.bySlug(key)!;
    return spellAbility(page, page.spell.progression!.nodes[index]);
  };

  const marque = node('space-marque-spatiale');
  /** Palier III : réaction, et prise sur les ennemis. */
  const changePlace = node('space-change-place', 2);

  /** Le mage en (0,0), une brute au contact, un second assaillant derrière elle. */
  const table = () => {
    const enc = emptyEncounter('Deux marques');
    enc.seed = 3;
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 0, y: 0 },
        abilities: [
          { ...marque, id: 'marque' },
          { ...changePlace, id: 'change' },
        ],
        mana: 80,
        attributes: ATTRS({ dexterite: 20 }),
        proficiency: 6,
      }),
      mkUnit({
        id: 'brute',
        name: 'Brute',
        team: 'ennemis',
        pos: { x: 1, y: 0 },
        abilities: [flatHit({ id: 'coup' })],
      }),
      mkUnit({ id: 'complice', name: 'Complice', team: 'ennemis', pos: { x: 2, y: 0 } }),
    ];
    return applyAction(enc, { type: 'start' });
  };

  /** Pose la marque du mage sur `id`, en réessayant sur un ennemi qui se débat. */
  const marquer = (enc: Encounter, id: string): Encounter => {
    const depart = { ...findUnit(enc, 'mage')!.pos };
    let etat = structuredClone(enc);
    for (let essai = 0; essai < 30; essai++) {
      const cible = findUnit(etat, id)!;
      findUnit(etat, 'mage')!.pos = id === 'mage' ? depart : { x: cible.pos.x - 1, y: cible.pos.y };
      findUnit(etat, 'mage')!.actionUsed = false;
      etat = applyAction(etat, { type: 'use', actorId: 'mage', abilityId: 'marque', at: cible.pos });
      if (findUnit(etat, id)!.statuses.some((s) => s.key === 'marque-spatiale')) break;
    }
    findUnit(etat, 'mage')!.pos = depart;
    findUnit(etat, 'mage')!.actionUsed = false;
    return etat;
  };

  it('refuse l’échange tant que le LANCEUR ne porte pas sa propre marque', () => {
    // La brute est marquée, le mage non : il manque un bout au fil.
    const enc = marquer(table(), 'brute');
    const mage = findUnit(enc, 'mage')!;
    expect(mage.statuses).toHaveLength(0);
    expect(swapAnchorMissing(mage, mage.abilities[1])).toContain('sa propre');
    expect(swapPartnerAt(enc, mage, mage.abilities[1], { x: 1, y: 0 })).toBeUndefined();

    const rate = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'change',
      at: { x: 1, y: 0 },
    });
    expect(findUnit(rate, 'mage')!.pos).toEqual({ x: 0, y: 0 });
    expect(rate.log.some((l) => l.text.includes('sa propre'))).toBe(true);
  });

  it('l’autorise dès que les deux portent la marque', () => {
    const enc = marquer(marquer(table(), 'brute'), 'mage');
    const mage = findUnit(enc, 'mage')!;
    expect(mage.statuses.some((s) => s.key === 'marque-spatiale')).toBe(true);
    expect(swapAnchorMissing(mage, mage.abilities[1])).toBeNull();

    const fait = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'change',
      at: { x: 1, y: 0 },
    });
    expect(findUnit(fait, 'mage')!.pos).toEqual({ x: 1, y: 0 });
    expect(findUnit(fait, 'brute')!.pos).toEqual({ x: 0, y: 0 });
  });

  it('fait ENCAISSER le coup à l’ennemi jeté sous la lame, fût-ce par les siens', () => {
    // Le complice porte la marque ; c'est lui qu'on met à sa place sous le coup
    // de la brute — son propre camp le frappe.
    const enc = marquer(marquer(table(), 'complice'), 'mage');
    const avant = findUnit(enc, 'complice')!.hp;

    let attaque = enc;
    for (let seed = 1; seed <= 40 && !attaque.pendingReaction; seed++) {
      attaque = applyAction(
        { ...enc, seed, rollCount: 0 },
        { type: 'use', actorId: 'brute', abilityId: 'coup', at: { x: 0, y: 0 } },
      );
    }
    expect(attaque.pendingReaction?.actorId).toBe('mage');

    const reagi = applyAction(attaque, {
      type: 'react',
      abilityId: 'change',
      at: { x: 2, y: 0 },
    });
    // Les deux ont permuté : le complice se retrouve sous la lame.
    expect(findUnit(reagi, 'mage')!.pos).toEqual({ x: 2, y: 0 });
    expect(findUnit(reagi, 'complice')!.pos).toEqual({ x: 0, y: 0 });
    // Et il l'encaisse, bien qu'il soit du camp de l'attaquant.
    expect(findUnit(reagi, 'complice')!.hp).toBeLessThan(avant);
    expect(findUnit(reagi, 'mage')!.hp).toBe(findUnit(enc, 'mage')!.hp);
  });

  it('ne laisse pas le passe-droit survivre à l’action qu’il servait', () => {
    // `inTheWay` est une exception le temps d'un coup, pas une porte ouverte au
    // tir fratricide : elle ne doit rien laisser derrière elle.
    const enc = marquer(marquer(table(), 'complice'), 'mage');
    const fait = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'change',
      at: { x: 2, y: 0 },
    });
    expect(fait.inTheWay).toBeUndefined();
  });
});

/* ── Le trajet, et pas seulement son prix ──────────────────────────────────
   `reachableCells` savait ce qu'une case coûte ; elle ne savait pas par où
   l'on passe. C'est pourtant le trajet qui coûte — contourner un mur double
   parfois l'addition — et le joueur ne le découvrait qu'après avoir cliqué.
─────────────────────────────────────────────────────────────────────────── */

describe('trajet de déplacement', () => {
  const marcheur = (over: Partial<Combatant> = {}) =>
    mkUnit({ id: 'm', name: 'Marcheur', team: 'allies', pos: { x: 0, y: 0 }, ...over });

  const plateau = (over: Partial<Encounter> = {}): Encounter => {
    const enc = emptyEncounter('Trajet');
    enc.grid = { width: 8, height: 8 };
    enc.combatants = [marcheur()];
    return { ...enc, ...over };
  };

  it('rend la suite des cases, départ compris', () => {
    const enc = plateau();
    const route = movementPath(enc, findUnit(enc, 'm')!, { x: 3, y: 0 }, 30);
    expect(route[0]).toEqual({ x: 0, y: 0 });
    expect(route[route.length - 1]).toEqual({ x: 3, y: 0 });
    // Quatre cases pour trois pas : la ligne droite ne fait pas de détour.
    expect(route).toHaveLength(4);
  });

  it('CONTOURNE ce qui bloque, et le trajet le montre', () => {
    // Un mur plein sur la colonne 1, sauf tout en bas : la seule route passe
    // par là, et c'est précisément ce qu'une case verte ne disait pas.
    const enc = plateau();
    for (let y = 0; y <= 5; y++) enc.terrain[`1,${y}`] = 'mur';
    const route = movementPath(enc, findUnit(enc, 'm')!, { x: 2, y: 0 }, 60);

    expect(route[0]).toEqual({ x: 0, y: 0 });
    expect(route[route.length - 1]).toEqual({ x: 2, y: 0 });
    // Aucune case du trajet ne traverse le mur…
    expect(route.some((c) => c.x === 1 && c.y <= 5)).toBe(false);
    // …et il descend chercher le passage plutôt que d'aller tout droit.
    expect(Math.max(...route.map((c) => c.y))).toBeGreaterThan(0);
  });

  it('enchaîne des cases adjacentes, sans saut', () => {
    const enc = plateau();
    for (let y = 0; y <= 5; y++) enc.terrain[`1,${y}`] = 'mur';
    const route = movementPath(enc, findUnit(enc, 'm')!, { x: 2, y: 0 }, 60);
    for (let i = 1; i < route.length; i++) {
      expect(cellDistance(route[i - 1], route[i])).toBe(1);
    }
  });

  it('ne rend AUCUN trajet vers une case injoignable à pied', () => {
    // C'est ce qui distingue une marche d'une téléportation sans avoir à le
    // demander : un saut n'a pas de route, donc pas de glissement.
    const enc = plateau();
    const route = movementPath(enc, findUnit(enc, 'm')!, { x: 7, y: 7 }, 3);
    expect(route).toEqual([]);
  });

  it('n’emmène pas à travers un combattant', () => {
    const enc = plateau();
    enc.combatants = [
      marcheur(),
      mkUnit({ id: 'obstacle', name: 'Obstacle', team: 'ennemis', pos: { x: 1, y: 0 } }),
    ];
    const route = movementPath(enc, findUnit(enc, 'm')!, { x: 2, y: 0 }, 60);
    expect(route.some((c) => c.x === 1 && c.y === 0)).toBe(false);
  });
});

/* ── Un pantin n'est le compagnon de personne ──────────────────────────────
   L'allégeance seule créait une impasse : le marionnettiste et sa marionnette
   restés seuls, plus personne n'avait le droit de la viser, et le combat ne
   pouvait plus finir. La règle est donc asymétrique — le pantin se bat pour son
   maître, mais son maître peut l'abattre.
─────────────────────────────────────────────────────────────────────────── */

describe('un pantin reste frappable', () => {
  const spells = new SpellsService();
  const page = spells.bySlug('darkness-fils-du-marionnettiste')!;
  const fils = spellAbility(page, page.spell.progression!.nodes[0]);

  const coup = (id: string) => flatHit({ id, targets: ['enemy'] });

  /** Le maître et son second face à un garde, qu'on va asservir. */
  const scene = () => {
    const enc = emptyEncounter('Impasse');
    enc.seed = 4;
    enc.combatants = [
      mkUnit({
        id: 'maitre',
        name: 'Maitre',
        team: 'allies',
        pos: { x: 1, y: 1 },
        abilities: [{ ...fils, id: 'fils' }, coup('epee')],
        mana: 200,
        attributes: ATTRS({ intelligence: 20 }),
        proficiency: 6,
      }),
      mkUnit({
        id: 'second',
        name: 'Second',
        team: 'allies',
        pos: { x: 1, y: 2 },
        abilities: [coup('epee')],
      }),
      mkUnit({
        id: 'garde',
        name: 'Garde',
        team: 'ennemis',
        pos: { x: 2, y: 1 },
        abilities: [coup('epee')],
      }),
    ];
    return applyAction(enc, { type: 'start' });
  };

  const asservir = (enc: Encounter): Encounter => {
    let etat = enc;
    for (let essai = 0; essai < 40; essai++) {
      findUnit(etat, 'maitre')!.actionUsed = false;
      etat = applyAction(etat, { type: 'use', actorId: 'maitre', abilityId: 'fils', at: { x: 2, y: 1 } });
      if (findUnit(etat, 'garde')!.statuses.some((s) => s.key === 'controle')) break;
    }
    findUnit(etat, 'maitre')!.actionUsed = false;
    return etat;
  };

  it('laisse le camp qui le tient le viser malgré l’allégeance', () => {
    const enc = asservir(scene());
    const garde = findUnit(enc, 'garde')!;
    const maitre = findUnit(enc, 'maitre')!;
    const second = findUnit(enc, 'second')!;

    // Il se bat pour eux…
    expect(allegianceOf(enc, garde)).toBe('allies');
    // …et pourtant ils peuvent le frapper, tous les deux.
    expect(isValidTarget(enc, coup('epee'), maitre, garde)).toBe(true);
    expect(isValidTarget(enc, coup('epee'), second, garde)).toBe(true);
  });

  it('ne lui laisse pas pour autant frapper les alliés de son maître', () => {
    // Asservi, pas devenu fou : c'est ce qui distingue le contrôle de la
    // confusion, et l'exception ne doit pas jouer dans les deux sens.
    const enc = asservir(scene());
    const garde = findUnit(enc, 'garde')!;
    expect(isValidTarget(enc, coup('epee'), garde, findUnit(enc, 'second')!)).toBe(false);
    expect(isValidTarget(enc, coup('epee'), garde, findUnit(enc, 'maitre')!)).toBe(false);
  });

  it('permet donc de finir un combat où il ne reste que lui et son maître', () => {
    let enc = asservir(scene());
    // Le second s'en va : il ne reste que le maître et son pantin.
    enc = structuredClone(enc);
    enc.combatants = enc.combatants.filter((c) => c.id !== 'second');
    expect(isOver(enc)).toBe(false);

    // Le maître abat sa propre marionnette — l'attaque doit porter.
    const garde = findUnit(enc, 'garde')!;
    findUnit(enc, 'maitre')!.actionUsed = false;
    expect(cannotUse(enc, findUnit(enc, 'maitre')!, coup('epee'), garde.pos)).toBeNull();

    let fini = enc;
    for (let tour = 0; tour < 20 && !isOver(fini); tour++) {
      findUnit(fini, 'maitre')!.actionUsed = false;
      fini = applyAction(fini, {
        type: 'use',
        actorId: 'maitre',
        abilityId: 'epee',
        at: findUnit(fini, 'garde')!.pos,
      });
    }
    expect(findUnit(fini, 'garde')!.down).toBe(true);
    expect(isOver(fini)).toBe(true);
  });

  it('mais le tacticien ne s’en prend pas de lui-même à son propre pantin', () => {
    // La règle l'autorise, le bon sens non : tant qu'un adversaire tient
    // debout, on ne casse pas son propre outil.
    const enc = asservir(scene());
    const maitre = findUnit(enc, 'maitre')!;
    expect(enemiesOf(enc, maitre).map((c) => c.id)).not.toContain('garde');
  });
});

/* ── Ce qui MARCHE et ce qui SAUTE ─────────────────────────────────────────
   `walked` est le seul témoin fiable de la différence. Le déduire d'un
   changement de case paraissait suffire et ne suffisait pas : la case d'arrivée
   d'un pas dimensionnel est souvent joignable à pied, et l'on voyait le pion
   marcher jusqu'à une case où il aurait dû se téléporter.
─────────────────────────────────────────────────────────────────────────── */

describe('trajet relevé par le moteur', () => {
  const spells = new SpellsService();
  const pas = spellAbility(
    spells.bySlug('space-pas-dimensionnel')!,
    spells.bySlug('space-pas-dimensionnel')!.spell.progression!.nodes[0],
  );

  const scene = () => {
    const enc = emptyEncounter('Marche ou saut');
    enc.grid = { width: 12, height: 12 };
    enc.seed = 6;
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 0, y: 0 },
        abilities: [{ ...pas, id: 'pas' }],
        mana: 50,
      }),
      mkUnit({ id: 'cible', name: 'Cible', team: 'ennemis', pos: { x: 11, y: 11 } }),
    ];
    return applyAction(enc, { type: 'start' });
  };

  it('relève le trajet d’une marche, du départ à l’arrivée', () => {
    const apres = applyAction(scene(), { type: 'move', actorId: 'mage', to: { x: 2, y: 0 } });
    expect(apres.walked?.unitId).toBe('mage');
    expect(apres.walked?.path[0]).toEqual({ x: 0, y: 0 });
    expect(apres.walked?.path.at(-1)).toEqual({ x: 2, y: 0 });
  });

  it('n’en relève AUCUN pour une téléportation, même vers une case joignable à pied', () => {
    // Le cœur du défaut : (2,0) est à deux pas, donc parfaitement marchable.
    // C'est pourtant d'un bond qu'on s'y rend, et le pion ne doit pas marcher.
    const enc = scene();
    const aPied = applyAction(enc, { type: 'move', actorId: 'mage', to: { x: 2, y: 0 } });
    expect(aPied.walked?.path.length).toBeGreaterThan(1);

    const saut = applyAction(enc, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'pas',
      at: { x: 2, y: 0 },
    });
    expect(findUnit(saut, 'mage')!.pos).toEqual({ x: 2, y: 0 });
    expect(saut.walked).toBeUndefined();
  });

  it('ne traîne pas le trajet d’une action à la suivante', () => {
    // Sans quoi la vue rejouerait une marche déjà faite au coup d'après.
    const marche = applyAction(scene(), { type: 'move', actorId: 'mage', to: { x: 1, y: 1 } });
    expect(marche.walked).toBeDefined();
    expect(applyAction(marche, { type: 'endTurn' }).walked).toBeUndefined();
  });
});

/* ── Où l'on peut sauter ───────────────────────────────────────────────────
   La vue avait sa propre idée des cases atteignables par un saut, plus
   indulgente que le moteur : elle proposait des cases occupées, et n'en
   proposait aucune quand le sort était armé en action. `cannotUse` tranche
   désormais seul — c'est lui que la vue interroge, case par case.
─────────────────────────────────────────────────────────────────────────── */

describe('portée d’une téléportation', () => {
  const spells = new SpellsService();
  const page = spells.bySlug('space-pas-dimensionnel')!;
  const pas = { ...spellAbility(page, page.spell.progression!.nodes[0]), id: 'pas' };

  const scene = () => {
    const enc = emptyEncounter('Saut');
    enc.grid = { width: 14, height: 14 };
    enc.seed = 6;
    enc.combatants = [
      mkUnit({ id: 'mage', name: 'Mage', team: 'allies', pos: { x: 0, y: 0 }, abilities: [pas], mana: 50 }),
      mkUnit({ id: 'gene', name: 'Gêneur', team: 'ennemis', pos: { x: 3, y: 0 } }),
    ];
    return applyAction(enc, { type: 'start' });
  };

  it('autorise une case libre dans la distance de saut', () => {
    const enc = scene();
    // 10 m de saut ≈ 6 cases.
    expect(cannotUse(enc, findUnit(enc, 'mage')!, pas, { x: 5, y: 0 })).toBeNull();
  });

  it('REFUSE une case occupée — la vue n’a plus à le deviner', () => {
    // Le moteur le refusait déjà au moment de résoudre, mais `cannotUse` ne le
    // disait pas : la vue surlignait donc une case où le clic échouait.
    const enc = scene();
    expect(cannotUse(enc, findUnit(enc, 'mage')!, pas, { x: 3, y: 0 })).toContain('quelqu’un');
  });

  it('refuse au-delà de la distance de saut, et derrière un mur', () => {
    const enc = scene();
    expect(cannotUse(enc, findUnit(enc, 'mage')!, pas, { x: 13, y: 0 })).toContain('Trop loin');

    const mure = structuredClone(enc);
    for (let y = 0; y <= 3; y++) mure.terrain[`2,${y}`] = 'mur';
    expect(cannotUse(mure, findUnit(mure, 'mage')!, pas, { x: 4, y: 0 })).toContain('ligne de vue');
  });

  it('ne refuse pas le saut lui-même quand l’action du tour est déjà dépensée', () => {
    // C'est la condition que la vue neutralise pour dessiner une réaction : le
    // refus doit venir de l'action dépensée, et de rien d'autre.
    const enc = scene();
    const mage = { ...findUnit(enc, 'mage')!, actionUsed: true };
    expect(cannotUse(enc, mage, pas, { x: 5, y: 0 })).toContain('Action déjà utilisée');
    expect(cannotUse(enc, { ...mage, actionUsed: false }, pas, { x: 5, y: 0 })).toBeNull();
  });
});

/* ── Le seuil annoncé sur le bouton ────────────────────────────────────────
   La vue avait recopié la formule du seuil. La copie ignorait
   `precisionPenalty`, donc elle annonçait un sort exigeant au prix d'un sort
   ordinaire — et elle taisait complètement le seuil des sorts qui VISENT sans
   blesser, qui sont justement ceux dont on veut connaître la chance avant de
   payer. Une seule formule désormais, et ces tests la tiennent.
─────────────────────────────────────────────────────────────────────────── */

describe('seuil annoncé avant la cible', () => {
  const spells = new SpellsService();
  const node = (key: string, index = 0) => {
    const page = spells.bySlug(key)!;
    return spellAbility(page, page.spell.progression!.nodes[index]);
  };

  const lanceur = () =>
    mkUnit({
      id: 'l',
      name: 'Lanceur',
      team: 'allies',
      attributes: ATTRS({ intelligence: 20 }),
      proficiency: 6,
    });

  it('annonce un seuil aux sorts qui VISENT sans blesser', () => {
    // Marque spatiale et Fils du marionnettiste ne font aucun dégât, mais
    // s'imposent : ils jettent le dé, donc ils doivent afficher leur chance.
    for (const key of ['space-marque-spatiale', 'darkness-fils-du-marionnettiste']) {
      const ability = node(key);
      expect(ability.damages).toHaveLength(0);
      expect(aims(ability)).toBe(true);
      expect(announcedBreakdown(lanceur(), ability).threshold).toBeGreaterThan(0);
    }
  });

  it('n’en annonce aucun à ce qui ne se rate pas', () => {
    // Un soin porte toujours : pas de dé, donc pas de seuil à montrer.
    const soin = node('life-soin-vital');
    expect(soin.autoHit).toBe(true);
    expect(aims(soin)).toBe(false);
  });

  it('compte la pénalité de précision du sort', () => {
    const unit = lanceur();
    const exigeant = node('darkness-fils-du-marionnettiste');
    expect(exigeant.precisionPenalty).toBe(25);

    const nu = announcedBreakdown(unit, { ...exigeant, precisionPenalty: 0 }).threshold;
    // 25 points = 5 crans de dé, et le seuil doit MONTER d'autant.
    expect(announcedBreakdown(unit, exigeant).threshold).toBe(nu + 25 / PRECISION_PER_STEP);
    expect(announcedBreakdown(unit, exigeant).causes).toContain('sort exigeant');
  });

  it('reste d’accord avec le seuil réel, esquive de la cible en moins', () => {
    // Le seuil annoncé est le seuil réel contre une cible sans esquive
    // naturelle : c'est ce qui rend l'approximation honnête plutôt que fausse.
    const unit = lanceur();
    const ability = node('darkness-fils-du-marionnettiste');
    const inerte = mkUnit({ id: 'c', name: 'Cible', team: 'ennemis', base: STATS({ speed: 0 }) });
    expect(hitThreshold(unit, ability, inerte)).toBe(announcedBreakdown(unit, ability).threshold);
  });
});

/* ── Le rayon à tête chercheuse ────────────────────────────────────────────
   Un rayon ordinaire tant qu'il vise ; un trait qui ne manque jamais dès qu'il
   suit une marque. Son seul contre est l'absence de CHEMIN — pas l'absence de
   vue, qu'il contourne, mais quatre murs pleins.
─────────────────────────────────────────────────────────────────────────── */

describe('rayon à tête chercheuse', () => {
  const spells = new SpellsService();
  const page = spells.bySlug('space-rayon-chercheur')!;
  const rayon = { ...spellAbility(page, page.spell.progression!.nodes[0]), id: 'rayon' };
  const marquePage = spells.bySlug('space-marque-spatiale')!;
  const marque = { ...spellAbility(marquePage, marquePage.spell.progression!.nodes[0]), id: 'marque' };

  const scene = () => {
    const enc = emptyEncounter('Rayon');
    enc.grid = { width: 14, height: 14 };
    enc.seed = 5;
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 1, y: 6 },
        abilities: [rayon, marque],
        mana: 90,
        attributes: ATTRS({ intelligence: 20 }),
        proficiency: 6,
      }),
      mkUnit({ id: 'cible', name: 'Cible', team: 'ennemis', pos: { x: 6, y: 6 } }),
    ];
    return applyAction(enc, { type: 'start' });
  };

  /** Pose la marque du mage sur la cible, en le collant le temps du sort. */
  const marquer = (enc: Encounter): Encounter => {
    const depart = { ...findUnit(enc, 'mage')!.pos };
    let etat = structuredClone(enc);
    for (let essai = 0; essai < 40; essai++) {
      const c = findUnit(etat, 'cible')!;
      findUnit(etat, 'mage')!.pos = { x: c.pos.x - 1, y: c.pos.y };
      findUnit(etat, 'mage')!.actionUsed = false;
      etat = applyAction(etat, { type: 'use', actorId: 'mage', abilityId: 'marque', at: c.pos });
      if (findUnit(etat, 'cible')!.statuses.some((s) => s.key === 'marque-spatiale')) break;
    }
    findUnit(etat, 'mage')!.pos = depart;
    findUnit(etat, 'mage')!.actionUsed = false;
    return etat;
  };

  /** Enferme la cible derrière des murs pleins, sur ses huit côtés. */
  const emmurer = (enc: Encounter): Encounter => {
    const mure = structuredClone(enc);
    const c = findUnit(mure, 'cible')!.pos;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        mure.terrain[`${c.x + dx},${c.y + dy}`] = 'mur';
      }
    }
    return mure;
  };

  it('reste un rayon ordinaire sur une cible NON marquée', () => {
    const enc = scene();
    expect(homesOn(enc, findUnit(enc, 'mage')!, rayon, findUnit(enc, 'cible')!)).toBe(false);
    // Il vise donc, et un mur lui coupe la route comme à n'importe quel trait.
    const mure = structuredClone(enc);
    for (let y = 0; y <= 13; y++) mure.terrain[`3,${y}`] = 'mur';
    expect(cannotUse(mure, findUnit(mure, 'mage')!, rayon, { x: 6, y: 6 })).toContain('ligne de vue');
  });

  it('se guide sur un marqué, et se passe alors de ligne de vue', () => {
    // Un mur percé d'une seule ouverture : le regard ne passe pas, le trait si.
    const enc = marquer(scene());
    const mure = structuredClone(enc);
    for (let y = 0; y <= 13; y++) mure.terrain[`3,${y}`] = 'mur';
    delete mure.terrain['3,0'];

    expect(hasLineOfSight({ x: 1, y: 6 }, { x: 6, y: 6 }, terrainFor(mure))).toBe(false);
    expect(homesOn(mure, findUnit(mure, 'mage')!, rayon, findUnit(mure, 'cible')!)).toBe(true);
    expect(cannotUse(mure, findUnit(mure, 'mage')!, rayon, { x: 6, y: 6 })).toBeNull();
  });

  it('ne peut alors PAS manquer', () => {
    const enc = marquer(scene());
    const avant = findUnit(enc, 'cible')!.hp;
    // Vingt tirs de suite : aucun ne doit se perdre.
    for (let seed = 1; seed <= 20; seed++) {
      const essai = { ...enc, seed, rollCount: 0 };
      findUnit(essai, 'mage')!.actionUsed = false;
      const tir = applyAction(essai, { type: 'use', actorId: 'mage', abilityId: 'rayon', at: { x: 6, y: 6 } });
      expect(tir.log.some((l) => l.text.includes('manque'))).toBe(false);
      expect(findUnit(tir, 'cible')!.hp).toBeLessThan(avant);
    }
  });

  it('perd sa prise sur une cible EMMURÉE de tous les côtés', () => {
    // Le seul abri qui vaille : plus aucun chemin, donc plus rien à suivre.
    const enc = emmurer(marquer(scene()));
    expect(homesOn(enc, findUnit(enc, 'mage')!, rayon, findUnit(enc, 'cible')!)).toBe(false);
    expect(cannotUse(enc, findUnit(enc, 'mage')!, rayon, { x: 6, y: 6 })).toContain('aucun chemin');
  });

  it('garde sa prise si une seule brèche subsiste', () => {
    // Sept murs sur huit : il reste un interstice, et il suffit.
    const enc = emmurer(marquer(scene()));
    const perce = structuredClone(enc);
    delete perce.terrain['6,5'];
    expect(homesOn(perce, findUnit(perce, 'mage')!, rayon, findUnit(perce, 'cible')!)).toBe(true);
  });

  it('ne se laisse enfermer que par du VRAI plein', () => {
    // Un gouffre arrête le pas mais se survole ; un fourré arrête la vue mais
    // se traverse. Ni l'un ni l'autre n'emmure qui que ce soit.
    const enc = marquer(scene());
    const c = findUnit(enc, 'cible')!.pos;
    for (const decor of ['gouffre', 'fourre']) {
      const autour = structuredClone(enc);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          autour.terrain[`${c.x + dx},${c.y + dy}`] = decor;
        }
      }
      expect(homesOn(autour, findUnit(autour, 'mage')!, rayon, findUnit(autour, 'cible')!)).toBe(true);
    }
  });

  it('ne se guide pas sur la marque d’un AUTRE lanceur', () => {
    // La marque est une prise personnelle : on n'emprunte pas celle du voisin.
    const enc = marquer(scene());
    const vole = structuredClone(enc);
    findUnit(vole, 'cible')!.statuses[0].sourceId = 'quelqu-un-dautre';
    expect(homesOn(vole, findUnit(vole, 'mage')!, rayon, findUnit(vole, 'cible')!)).toBe(false);
  });
});

/* ── Effondrement de marque ────────────────────────────────────────────────
   Le seul sort du catalogue qui ne vise RIEN : ses cibles ont été désignées au
   tour où on les a marquées. D'où une forme de ciblage à part (`marked`), et
   une contrepartie qui l'empêche d'être gratuit — la marque se consume.
─────────────────────────────────────────────────────────────────────────── */

describe('effondrement de marque', () => {
  const spells = new SpellsService();
  const page = spells.bySlug('space-effondrement-de-marque')!;
  const boum = { ...spellAbility(page, page.spell.progression!.nodes[0]), id: 'boum' };
  const mPage = spells.bySlug('space-marque-spatiale')!;
  const marque = { ...spellAbility(mPage, mPage.spell.progression!.nodes[0]), id: 'marque' };

  const scene = () => {
    const enc = emptyEncounter('Effondrement');
    enc.grid = { width: 16, height: 16 };
    enc.seed = 8;
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 1, y: 1 },
        abilities: [boum, marque],
        mana: 200,
        attributes: ATTRS({ intelligence: 20 }),
        proficiency: 6,
      }),
      mkUnit({ id: 'proche', name: 'Proche', team: 'ennemis', pos: { x: 2, y: 1 } }),
      // Volontairement à l'autre bout : la détonation n'a pas de portée.
      mkUnit({ id: 'loin', name: 'Loin', team: 'ennemis', pos: { x: 14, y: 14 } }),
      mkUnit({ id: 'neutre', name: 'Neutre', team: 'ennemis', pos: { x: 5, y: 5 } }),
    ];
    return applyAction(enc, { type: 'start' });
  };

  const marquer = (enc: Encounter, id: string): Encounter => {
    const depart = { ...findUnit(enc, 'mage')!.pos };
    let etat = structuredClone(enc);
    for (let essai = 0; essai < 40; essai++) {
      const c = findUnit(etat, id)!;
      findUnit(etat, 'mage')!.pos = id === 'mage' ? depart : { x: c.pos.x - 1, y: c.pos.y };
      findUnit(etat, 'mage')!.actionUsed = false;
      etat = applyAction(etat, { type: 'use', actorId: 'mage', abilityId: 'marque', at: c.pos });
      if (findUnit(etat, id)!.statuses.some((s) => s.key === 'marque-spatiale')) break;
    }
    findUnit(etat, 'mage')!.pos = depart;
    findUnit(etat, 'mage')!.actionUsed = false;
    return etat;
  };

  it('se lit comme une liste de porteurs, pas comme une zone', () => {
    expect(boum.shape).toEqual({ kind: 'marked' });
    expect(boum.marksTargets).toBe('marque-spatiale');
    expect(boum.consumesMark).toBe(true);
    // Rien à viser : pas de jet de toucher non plus.
    expect(aims(boum)).toBe(false);
  });

  it('refuse de partir quand rien n’est marqué', () => {
    const enc = scene();
    expect(cannotUse(enc, findUnit(enc, 'mage')!, boum, { x: 1, y: 1 })).toContain('sur qui agir');
  });

  it('frappe TOUS les marqués d’un coup, la distance n’y faisant rien', () => {
    const enc = marquer(marquer(scene(), 'proche'), 'loin');
    const avantProche = findUnit(enc, 'proche')!.hp;
    const avantLoin = findUnit(enc, 'loin')!.hp;
    const avantNeutre = findUnit(enc, 'neutre')!.hp;

    const apres = applyAction(enc, { type: 'use', actorId: 'mage', abilityId: 'boum', at: { x: 1, y: 1 } });

    expect(findUnit(apres, 'proche')!.hp).toBeLessThan(avantProche);
    // À treize cases : la détonation n'a ni portée ni ligne de vue.
    expect(findUnit(apres, 'loin')!.hp).toBeLessThan(avantLoin);
    // Et celui qu'on n'a pas marqué ne sent rien.
    expect(findUnit(apres, 'neutre')!.hp).toBe(avantNeutre);
  });

  it('consume les marques : le sort ne se répète pas', () => {
    const enc = marquer(scene(), 'proche');
    expect(findUnit(enc, 'proche')!.statuses.some((s) => s.key === 'marque-spatiale')).toBe(true);

    const apres = applyAction(enc, { type: 'use', actorId: 'mage', abilityId: 'boum', at: { x: 1, y: 1 } });
    expect(findUnit(apres, 'proche')!.statuses).toHaveLength(0);
    expect(apres.log.some((l) => l.text.includes('se consume'))).toBe(true);

    // Plus rien à faire éclater : le second lancer est refusé.
    findUnit(apres, 'mage')!.actionUsed = false;
    expect(cannotUse(apres, findUnit(apres, 'mage')!, boum, { x: 1, y: 1 })).toContain('sur qui agir');
  });

  it('n’emporte PAS la marque d’un autre lanceur', () => {
    // Faire sauter ses propres ancres ne doit pas défaire celles du voisin.
    const enc = marquer(scene(), 'proche');
    const autre = structuredClone(enc);
    findUnit(autre, 'loin')!.statuses.push({
      key: 'marque-spatiale',
      remaining: -1,
      stacks: 1,
      sourceId: 'quelqu-un-dautre',
      sourcePower: { atk_phy: 0, atk_mag: 0 },
      age: 0,
    });
    const avant = findUnit(autre, 'loin')!.hp;

    const apres = applyAction(autre, { type: 'use', actorId: 'mage', abilityId: 'boum', at: { x: 1, y: 1 } });
    expect(findUnit(apres, 'loin')!.hp).toBe(avant);
    expect(findUnit(apres, 'loin')!.statuses).toHaveLength(1);
  });

  it('emporte aussi ce que le lanceur a marqué dans son propre camp', () => {
    // C'est le prix assumé d'un sort qui ne rate pas : `targets: everyone`.
    expect(boum.targets).toContain('everyone');
    const enc = marquer(scene(), 'mage');
    const avant = findUnit(enc, 'mage')!.hp;
    const apres = applyAction(enc, { type: 'use', actorId: 'mage', abilityId: 'boum', at: { x: 1, y: 1 } });
    expect(findUnit(apres, 'mage')!.hp).toBeLessThan(avant);
    expect(findUnit(apres, 'mage')!.statuses).toHaveLength(0);
  });
});

/* ── Piège d'ancrage ───────────────────────────────────────────────────────
   Un statut qui ne retient personne sur place et interdit pourtant l'essentiel :
   ses porteurs ne peuvent plus SE RAPPROCHER. Ils marchent, ils reculent, ils
   contournent — mais l'écart ne se referme plus. C'est une contrainte sur la
   VARIATION de distance, pas sur le mouvement, et c'est ce que ces tests
   vérifient dans les deux sens.
─────────────────────────────────────────────────────────────────────────── */

describe('piège d’ancrage', () => {
  const spells = new SpellsService();
  const page = spells.bySlug('space-piege-d-ancrage')!;
  const piege = { ...spellAbility(page, page.spell.progression!.nodes[0]), id: 'piege' };
  const mPage = spells.bySlug('space-marque-spatiale')!;
  const marque = { ...spellAbility(mPage, mPage.spell.progression!.nodes[0]), id: 'marque' };

  /** Deux ennemis distants de quatre cases, et un mage qui va les marquer. */
  const scene = () => {
    const enc = emptyEncounter('Ancrage');
    enc.grid = { width: 16, height: 16 };
    enc.seed = 9;
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 1, y: 8 },
        abilities: [piege, marque],
        mana: 200,
        attributes: ATTRS({ intelligence: 20, sagesse: 20 }),
        proficiency: 6,
      }),
      mkUnit({ id: 'gaucher', name: 'Gaucher', team: 'ennemis', pos: { x: 6, y: 8 } }),
      mkUnit({ id: 'droitier', name: 'Droitier', team: 'ennemis', pos: { x: 9, y: 8 } }),
    ];
    return applyAction(enc, { type: 'start' });
  };

  const marquer = (enc: Encounter, id: string): Encounter => {
    const depart = { ...findUnit(enc, 'mage')!.pos };
    let etat = structuredClone(enc);
    for (let essai = 0; essai < 40; essai++) {
      const c = findUnit(etat, id)!;
      findUnit(etat, 'mage')!.pos = { x: c.pos.x - 1, y: c.pos.y };
      findUnit(etat, 'mage')!.actionUsed = false;
      etat = applyAction(etat, { type: 'use', actorId: 'mage', abilityId: 'marque', at: c.pos });
      if (findUnit(etat, id)!.statuses.some((s) => s.key === 'marque-spatiale')) break;
    }
    findUnit(etat, 'mage')!.pos = depart;
    findUnit(etat, 'mage')!.actionUsed = false;
    return etat;
  };

  /** Marque les deux ennemis, puis referme le piège sur eux. */
  const tendre = (): Encounter => {
    const enc = marquer(marquer(scene(), 'gaucher'), 'droitier');
    return applyAction(enc, { type: 'use', actorId: 'mage', abilityId: 'piege', at: { x: 1, y: 8 } });
  };

  it('pose le champ sur le LANCEUR, et laisse les marques intactes', () => {
    // Le piège n'est pas un statut qu'on subit : c'est un champ que le mage
    // tient. Ses victimes ne portent que leur marque — c'est elle qui commande.
    const enc = tendre();
    expect(findUnit(enc, 'mage')!.statuses.map((s) => s.key)).toContain('ancrage');
    for (const id of ['gaucher', 'droitier']) {
      const st = findUnit(enc, id)!.statuses.map((s) => s.key);
      expect(st).toContain('marque-spatiale');
      expect(st).not.toContain('ancrage');
    }
  });

  it('prend un renfort marqué APRÈS COUP', () => {
    // Le point qui distingue un champ d'une photographie : marquer quelqu'un
    // en pleine bataille le fait entrer sous la règle sans relancer le sort.
    const enc = tendre();
    const tardif = structuredClone(enc);
    tardif.combatants.push(
      mkUnit({ id: 'renfort', name: 'Renfort', team: 'ennemis', pos: { x: 12, y: 8 } }),
    );
    const marque = marquer(tardif, 'renfort');
    expect(findUnit(marque, 'renfort')!.statuses.map((s) => s.key)).toContain('marque-spatiale');
    // Il n'a jamais été visé par le piège — il ne porte rien d'autre…
    expect(findUnit(marque, 'renfort')!.statuses.map((s) => s.key)).not.toContain('ancrage');

    // …et pourtant il est tenu. Droitier à deux cases : s'en approcher est
    // désormais interdit, alors que le sort a été lancé avant son arrivée.
    findUnit(marque, 'droitier')!.pos = { x: 10, y: 8 };
    findUnit(marque, 'renfort')!.pos = { x: 12, y: 8 };
    expect(anchorBlocker(marque, findUnit(marque, 'renfort')!, { x: 11, y: 8 })?.id).toBe('droitier');
  });

  it('élargit son écart au fil des paliers', () => {
    // Le champ du palier III tient à 4,5 m : une ligne de front s'y disloque.
    const trois = spellAbility(page, page.spell.progression!.nodes[2]);
    expect(trois.anchorGapMeters).toBe(4.5);

    const enc = marquer(marquer(scene(), 'gaucher'), 'droitier');
    findUnit(enc, 'mage')!.abilities = [{ ...trois, id: 'piege' }, marque];
    const large = applyAction(enc, { type: 'use', actorId: 'mage', abilityId: 'piege', at: { x: 1, y: 8 } });
    // Gaucher (6,8) et Droitier (9,8) : trois cases, soit 4,5 m — le champ du
    // palier I les laissait tranquilles, celui-ci les écarte.
    expect(unitDistanceMeters(findUnit(large, 'gaucher')!, findUnit(large, 'droitier')!))
      .toBeGreaterThan(4.5);
  });

  it('laisse les porteurs SE RAPPROCHER — ce n’est pas une entrave', () => {
    // Gaucher (6,8) et Droitier (9,8) : trois cases. Se réduire à deux est
    // parfaitement permis, le piège ne fige pas la distance.
    const enc = tendre();
    const gaucher = findUnit(enc, 'gaucher')!;
    expect(anchorBlocker(enc, gaucher, { x: 7, y: 8 })).toBeUndefined();

    const apres = applyAction(enc, { type: 'move', actorId: 'gaucher', to: { x: 7, y: 8 } });
    expect(findUnit(apres, 'gaucher')!.pos).toEqual({ x: 7, y: 8 });
  });

  it('mais les empêche de venir à MOINS DE 1,5 m l’un de l’autre', () => {
    const enc = tendre();
    const gaucher = findUnit(enc, 'gaucher')!;
    // (8,8) est au contact de Droitier (9,8) : c'est là que le piège mord.
    expect(anchorBlocker(enc, gaucher, { x: 8, y: 8 })?.id).toBe('droitier');
    // Et par la diagonale non plus : c'est la distance qui compte.
    expect(anchorBlocker(enc, gaucher, { x: 8, y: 9 })?.id).toBe('droitier');

    const apres = applyAction(enc, { type: 'move', actorId: 'gaucher', to: { x: 8, y: 8 } });
    expect(findUnit(apres, 'gaucher')!.pos).toEqual({ x: 6, y: 8 });
    expect(apres.log.some((l) => l.text.includes('L’ancrage retient'))).toBe(true);
  });

  it('le laisse reculer et contourner librement', () => {
    const enc = tendre();
    const gaucher = findUnit(enc, 'gaucher')!;
    expect(anchorBlocker(enc, gaucher, { x: 5, y: 8 })).toBeUndefined();
    expect(anchorBlocker(enc, gaucher, { x: 6, y: 9 })).toBeUndefined();

    const apres = applyAction(enc, { type: 'move', actorId: 'gaucher', to: { x: 5, y: 8 } });
    expect(findUnit(apres, 'gaucher')!.pos).toEqual({ x: 5, y: 8 });
  });

  it('ne fige pas ceux que le piège surprend déjà collés', () => {
    // Sans quoi deux porteurs pris au contact dans un couloir n'auraient plus
    // aucun pas légal : le sort les paralyserait au lieu de les écarter.
    const enc = tendre();
    const colles = structuredClone(enc);
    findUnit(colles, 'droitier')!.pos = { x: 7, y: 8 };
    const gaucher = findUnit(colles, 'gaucher')!;
    // Rester à la même distance : permis. S'éloigner : permis.
    expect(anchorBlocker(colles, gaucher, { x: 6, y: 9 })).toBeUndefined();
    expect(anchorBlocker(colles, gaucher, { x: 5, y: 8 })).toBeUndefined();
  });

  it('retire du calque de déplacement ce qu’il refusera', () => {
    // Une case verte sur laquelle le clic échoue est un mensonge : le calque
    // doit déjà exclure ce que le piège interdit.
    const enc = tendre();
    const gaucher = findUnit(enc, 'gaucher')!;
    const cases = movementOverlay(enc, gaucher);
    expect(cases.has('8,8')).toBe(false);
    expect(cases.has('7,8')).toBe(true);
    expect(cases.has('5,8')).toBe(true);
  });

  it('ne retient pas un marqué SEUL — il faut être deux', () => {
    // Le champ n'est pas une entrave : sans second marqué, il n'interdit rien.
    const enc = marquer(scene(), 'gaucher');
    const seul = applyAction(enc, { type: 'use', actorId: 'mage', abilityId: 'piege', at: { x: 1, y: 8 } });
    expect(findUnit(seul, 'mage')!.statuses.map((s) => s.key)).toContain('ancrage');
    expect(anchorBlocker(seul, findUnit(seul, 'gaucher')!, { x: 8, y: 8 })).toBeUndefined();
  });

  it('cède quand le lanceur perd sa concentration', () => {
    const enc = tendre();
    // Un mage peu sage, et un gros coup.
    const fragile = structuredClone(enc);
    findUnit(fragile, 'mage')!.attributes = ATTRS({ intelligence: 20, sagesse: 1 });
    findUnit(fragile, 'mage')!.proficiency = 0;
    findUnit(fragile, 'droitier')!.pos = { x: 2, y: 8 };
    findUnit(fragile, 'droitier')!.abilities = [
      flatHit({ id: 'coup', damages: [{ min: 60, max: 60, type: 'slashing' }] }),
    ];

    const frappe = applyAction(fragile, {
      type: 'use',
      actorId: 'droitier',
      abilityId: 'coup',
      at: { x: 1, y: 8 },
    });
    expect(frappe.log.some((l) => l.text.includes('concentration'))).toBe(true);
    for (const id of ['gaucher', 'droitier']) {
      expect(findUnit(frappe, id)!.statuses.map((s) => s.key)).not.toContain('ancrage');
    }
  });

  it('ne gouverne que les marques de SON lanceur', () => {
    // La marque d'un autre mage n'entre pas dans mon champ : deux réseaux
    // d'ancres se croisent sans se tenir.
    const enc = tendre();
    const separe = structuredClone(enc);
    const droitier = findUnit(separe, 'droitier')!;
    droitier.statuses = droitier.statuses.map((s) =>
      s.key === 'marque-spatiale' ? { ...s, sourceId: 'un-autre-mage' } : s,
    );
    expect(anchorBlocker(separe, findUnit(separe, 'gaucher')!, { x: 8, y: 8 })).toBeUndefined();
  });
});

/* ── Le piège se fait respecter tout de suite ──────────────────────────────
   Interdire l'avenir ne suffit pas : ceux que le sort surprend au contact
   doivent s'écarter sur-le-champ. Ce recul est SUBI — ni coût, ni budget de
   mouvement, et surtout aucune attaque d'opportunité : on ne punit pas
   quelqu'un d'avoir été poussé.
─────────────────────────────────────────────────────────────────────────── */

describe('piège d’ancrage — mise en conformité', () => {
  const spells = new SpellsService();
  const page = spells.bySlug('space-piege-d-ancrage')!;
  const piege = { ...spellAbility(page, page.spell.progression!.nodes[0]), id: 'piege' };
  const mPage = spells.bySlug('space-marque-spatiale')!;
  const marque = { ...spellAbility(mPage, mPage.spell.progression!.nodes[0]), id: 'marque' };

  /** Deux ennemis COLLÉS l'un à l'autre, loin du mage. */
  const scene = () => {
    const enc = emptyEncounter('Conformité');
    enc.grid = { width: 16, height: 16 };
    enc.seed = 12;
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 1, y: 8 },
        abilities: [piege, marque],
        mana: 200,
        attributes: ATTRS({ intelligence: 20, sagesse: 20 }),
        proficiency: 6,
      }),
      mkUnit({ id: 'un', name: 'Un', team: 'ennemis', pos: { x: 7, y: 8 } }),
      mkUnit({ id: 'deux', name: 'Deux', team: 'ennemis', pos: { x: 8, y: 8 } }),
    ];
    return applyAction(enc, { type: 'start' });
  };

  const marquer = (enc: Encounter, id: string): Encounter => {
    const depart = { ...findUnit(enc, 'mage')!.pos };
    let etat = structuredClone(enc);
    for (let essai = 0; essai < 40; essai++) {
      const c = findUnit(etat, id)!;
      findUnit(etat, 'mage')!.pos = { x: c.pos.x, y: c.pos.y - 1 };
      findUnit(etat, 'mage')!.actionUsed = false;
      etat = applyAction(etat, { type: 'use', actorId: 'mage', abilityId: 'marque', at: c.pos });
      if (findUnit(etat, id)!.statuses.some((s) => s.key === 'marque-spatiale')) break;
    }
    findUnit(etat, 'mage')!.pos = depart;
    findUnit(etat, 'mage')!.actionUsed = false;
    return etat;
  };

  const tendre = (): Encounter => {
    const enc = marquer(marquer(scene(), 'un'), 'deux');
    // Ils se touchent au moment où le piège tombe.
    expect(unitDistanceMeters(findUnit(enc, 'un')!, findUnit(enc, 'deux')!)).toBe(1.5);
    return applyAction(enc, { type: 'use', actorId: 'mage', abilityId: 'piege', at: { x: 1, y: 8 } });
  };

  it('écarte sur-le-champ ceux qu’il surprend au contact', () => {
    const apres = tendre();
    const un = findUnit(apres, 'un')!;
    const deux = findUnit(apres, 'deux')!;
    expect(unitDistanceMeters(un, deux)).toBeGreaterThan(1.5);
    expect(apres.log.some((l) => l.text.includes('repoussé par l’ancrage'))).toBe(true);
  });

  it('ne repousse QUE ce qu’il faut : un seul des deux bouge', () => {
    // Écarter le premier suffit à mettre le second en règle ; personne ne
    // recule pour rien.
    const avant = scene();
    const apres = tendre();
    const bouges = ['un', 'deux'].filter(
      (id) => !samePos(findUnit(avant, id)!.pos, findUnit(apres, id)!.pos),
    );
    expect(bouges).toHaveLength(1);
  });

  it('recule au plus court', () => {
    const avant = scene();
    const apres = tendre();
    for (const id of ['un', 'deux']) {
      const parcouru = unitDistanceMeters(findUnit(avant, id)!, findUnit(apres, id)!);
      // Une case suffit à sortir du contact : on n'en fait pas plus.
      expect(parcouru).toBeLessThanOrEqual(1.5);
    }
  });

  it('ne provoque AUCUNE attaque d’opportunité', () => {
    // Le point qui compte : on ne punit pas quelqu'un d'avoir été poussé. Un
    // garde tient les deux sous son allonge, et ne doit rien pouvoir en tirer.
    const enc = marquer(marquer(scene(), 'un'), 'deux');
    const garde = structuredClone(enc);
    garde.combatants.push(
      mkUnit({
        id: 'garde',
        name: 'Garde',
        team: 'allies',
        pos: { x: 8, y: 9 },
        abilities: [flatHit({ id: 'epee', reaction: ['leave-reach'] })],
      }),
    );

    const apres = applyAction(garde, { type: 'use', actorId: 'mage', abilityId: 'piege', at: { x: 1, y: 8 } });
    expect(apres.pendingReaction).toBeUndefined();
    expect(apres.suspended).toBeUndefined();
    expect(apres.log.some((l) => l.text.includes('quitte l’allonge'))).toBe(false);
  });

  it('ne coûte ni endurance ni budget de déplacement', () => {
    const avant = scene();
    const apres = tendre();
    for (const id of ['un', 'deux']) {
      expect(findUnit(apres, id)!.endurance).toBe(findUnit(avant, id)!.endurance);
      expect(findUnit(apres, id)!.moved).toBe(0);
    }
  });

  it('le dit plutôt que de déménager quelqu’un quand la place manque', () => {
    // Emmurés ensemble : le piège ne peut pas les séparer, et il l'annonce
    // au lieu d'expédier l'un à l'autre bout du plateau.
    const enc = marquer(marquer(scene(), 'un'), 'deux');
    const boite = structuredClone(enc);
    for (let x = 6; x <= 9; x++) {
      for (let y = 7; y <= 9; y++) {
        if (y === 8 && (x === 7 || x === 8)) continue;
        boite.terrain[`${x},${y}`] = 'mur';
      }
    }
    const apres = applyAction(boite, { type: 'use', actorId: 'mage', abilityId: 'piege', at: { x: 1, y: 8 } });
    expect(apres.log.some((l) => l.text.includes('ne trouve pas où s’écarter'))).toBe(true);
    expect(findUnit(apres, 'un')!.pos).toEqual({ x: 7, y: 8 });
    expect(findUnit(apres, 'deux')!.pos).toEqual({ x: 8, y: 8 });
  });
});

/* ── L'entretien d'un sort maintenu ────────────────────────────────────────
   Un sort qu'on garde ouvert doit coûter tant qu'il dure : sans cela, rien
   n'incite jamais à le relâcher, et une réserve pleine au premier tour
   financerait tout le combat. À sec, le lien se rompt de lui-même — le lanceur
   ne choisit pas, il ne peut simplement plus suivre.
─────────────────────────────────────────────────────────────────────────── */

describe('entretien des sorts maintenus', () => {
  const spells = new SpellsService();
  const page = spells.bySlug('space-piege-d-ancrage')!;
  const piege = { ...spellAbility(page, page.spell.progression!.nodes[0]), id: 'piege' };

  /** Un mage tenant déjà son champ, avec la réserve qu'on lui donne. */
  const enTrain = (mana: number): Encounter => {
    const enc = emptyEncounter('Entretien');
    enc.seed = 14;
    enc.combatants = [
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 1, y: 1 },
        abilities: [piege],
        mana,
        attributes: ATTRS({ intelligence: 20, sagesse: 20 }),
        proficiency: 6,
      }),
      mkUnit({ id: 'autre', name: 'Autre', team: 'ennemis', pos: { x: 8, y: 8 } }),
    ];
    const debut = applyAction(enc, { type: 'start' });
    findUnit(debut, 'mage')!.statuses.push({
      key: 'ancrage',
      remaining: -1,
      stacks: 1,
      sourceId: 'mage',
      sourcePower: { atk_phy: 0, atk_mag: 0 },
      age: 0,
    });
    return debut;
  };

  /** Fait tourner l'initiative jusqu'à ce que le tour du mage se rouvre. */
  const tourSuivant = (enc: Encounter): Encounter => {
    let etat = enc;
    for (let i = 0; i < 12; i++) {
      etat = applyAction(etat, { type: 'endTurn' });
      if (etat.order[etat.turnIndex] === 'mage') break;
    }
    return etat;
  };

  it('déclare un entretien moins cher que l’incantation', () => {
    const def = statusByKey('ancrage')!;
    expect(def.sustain?.upkeep).toBe(2);
    expect(def.sustain!.upkeep!).toBeLessThan(piege.manaCost);
  });

  it('prélève le mana à l’ouverture du tour du lanceur', () => {
    const enc = enTrain(30);
    const apres = tourSuivant(enc);
    expect(findUnit(apres, 'mage')!.mana).toBe(28);
    expect(apres.log.some((l) => l.text.includes('entretient ses sorts'))).toBe(true);
    // Et le champ tient toujours.
    expect(findUnit(apres, 'mage')!.statuses.map((s) => s.key)).toContain('ancrage');
  });

  it('lâche le sort quand la réserve ne suit plus', () => {
    const enc = enTrain(1);
    const apres = tourSuivant(enc);
    expect(findUnit(apres, 'mage')!.statuses.map((s) => s.key)).not.toContain('ancrage');
    expect(apres.log.some((l) => l.text.includes('plus de quoi entretenir'))).toBe(true);
    // On ne prélève pas ce qu'on ne peut pas payer.
    expect(findUnit(apres, 'mage')!.mana).toBe(1);
  });

  it('ne prélève rien à qui ne tient rien', () => {
    const enc = enTrain(30);
    const sans = structuredClone(enc);
    findUnit(sans, 'mage')!.statuses = [];
    const apres = tourSuivant(sans);
    expect(findUnit(apres, 'mage')!.mana).toBe(30);
    expect(apres.log.some((l) => l.text.includes('entretient ses sorts'))).toBe(false);
  });
});

/* ── Qui recule, quand deux sont collés ────────────────────────────────────
   Écarter le premier dispense le second : l'ordre dans lequel on les traite
   décide donc lequel bouge. Le champ émane du lanceur et repousse ce qui s'en
   approche — c'est le PLUS PROCHE de lui qui recule, pas celui d'en face.
─────────────────────────────────────────────────────────────────────────── */

describe('piège d’ancrage — qui recule', () => {
  const spells = new SpellsService();
  const page = spells.bySlug('space-piege-d-ancrage')!;
  const piege = { ...spellAbility(page, page.spell.progression!.nodes[0]), id: 'piege' };
  const mPage = spells.bySlug('space-marque-spatiale')!;
  const marque = { ...spellAbility(mPage, mPage.spell.progression!.nodes[0]), id: 'marque' };

  /**
   * Le mage en (1,8), et deux ennemis collés en (5,8) et (6,8).
   *
   * `loin` est délibérément placé EN PREMIER dans le tableau : si l'ordre de
   * la liste décidait, ce serait lui qui reculerait — c'est précisément ce
   * qu'on ne veut pas.
   */
  const scene = () => {
    const enc = emptyEncounter('Qui recule');
    enc.grid = { width: 16, height: 16 };
    enc.seed = 15;
    enc.combatants = [
      mkUnit({ id: 'loin', name: 'Loin', team: 'ennemis', pos: { x: 6, y: 8 } }),
      mkUnit({
        id: 'mage',
        name: 'Mage',
        team: 'allies',
        pos: { x: 1, y: 8 },
        abilities: [piege, marque],
        mana: 200,
        attributes: ATTRS({ intelligence: 20, sagesse: 20 }),
        proficiency: 6,
      }),
      mkUnit({ id: 'pres', name: 'Pres', team: 'ennemis', pos: { x: 5, y: 8 } }),
    ];
    return applyAction(enc, { type: 'start' });
  };

  const marquer = (enc: Encounter, id: string): Encounter => {
    const depart = { ...findUnit(enc, 'mage')!.pos };
    let etat = structuredClone(enc);
    for (let essai = 0; essai < 40; essai++) {
      const c = findUnit(etat, id)!;
      findUnit(etat, 'mage')!.pos = { x: c.pos.x, y: c.pos.y - 1 };
      findUnit(etat, 'mage')!.actionUsed = false;
      etat = applyAction(etat, { type: 'use', actorId: 'mage', abilityId: 'marque', at: c.pos });
      if (findUnit(etat, id)!.statuses.some((s) => s.key === 'marque-spatiale')) break;
    }
    findUnit(etat, 'mage')!.pos = depart;
    findUnit(etat, 'mage')!.actionUsed = false;
    return etat;
  };

  it('repousse celui qui est le plus PRÈS du lanceur', () => {
    const avant = marquer(marquer(scene(), 'pres'), 'loin');
    expect(unitDistanceMeters(findUnit(avant, 'pres')!, findUnit(avant, 'loin')!)).toBe(1.5);

    const apres = applyAction(avant, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'piege',
      at: { x: 1, y: 8 },
    });

    // Celui d'en face n'a pas bougé…
    expect(findUnit(apres, 'loin')!.pos).toEqual({ x: 6, y: 8 });
    // …c'est celui que le champ avait sous le nez qui a reculé.
    expect(findUnit(apres, 'pres')!.pos).not.toEqual({ x: 5, y: 8 });
    expect(
      unitDistanceMeters(findUnit(apres, 'pres')!, findUnit(apres, 'loin')!),
    ).toBeGreaterThan(1.5);
  });

  it('choisit QUI recule, pas dans quelle direction', () => {
    // La nuance vaut d'être fixée : le tri désigne le reculant, puis celui-ci
    // prend le chemin le plus court pour se dégager — quitte à se rapprocher du
    // lanceur si c'est de ce côté que la place se trouve.
    const avant = marquer(marquer(scene(), 'pres'), 'loin');
    const apres = applyAction(avant, {
      type: 'use',
      actorId: 'mage',
      abilityId: 'piege',
      at: { x: 1, y: 8 },
    });
    const parcouru = unitDistanceMeters(findUnit(avant, 'pres')!, findUnit(apres, 'pres')!);
    expect(parcouru).toBe(1.5);
  });
});


/* ── L'entretien des fils ──────────────────────────────────────────────────
   Un pantin ne se paie pas qu'à la prise : il se tient. Et comme l'entretien se
   compte PAR LIEN TENU, deux pantins coûtent le double — ce qui donne enfin un
   prix au fait d'en mener deux, là où seules les mains le limitaient.
─────────────────────────────────────────────────────────────────────────── */

describe('fils du marionnettiste — entretien', () => {
  const spells = new SpellsService();
  const page = spells.bySlug('darkness-fils-du-marionnettiste')!;
  const fils = spellAbility(page, page.spell.progression!.nodes[0]);

  /** Un maître tenant `pantins` marionnettes, avec la réserve qu'on lui donne. */
  const enTrain = (pantins: number, mana: number): Encounter => {
    const enc = emptyEncounter('Fils tenus');
    enc.seed = 16;
    enc.combatants = [
      mkUnit({
        id: 'maitre',
        name: 'Maitre',
        team: 'allies',
        pos: { x: 1, y: 1 },
        abilities: [{ ...fils, id: 'fils' }],
        mana,
        attributes: ATTRS({ intelligence: 20, sagesse: 20 }),
        proficiency: 6,
      }),
      mkUnit({ id: 'p1', name: 'P1', team: 'ennemis', pos: { x: 2, y: 1 } }),
      mkUnit({ id: 'p2', name: 'P2', team: 'ennemis', pos: { x: 1, y: 2 } }),
    ];
    const debut = applyAction(enc, { type: 'start' });
    for (const id of ['p1', 'p2'].slice(0, pantins)) {
      findUnit(debut, id)!.statuses.push({
        key: 'controle',
        remaining: -1,
        stacks: 1,
        sourceId: 'maitre',
        sourcePower: { atk_phy: 0, atk_mag: 0 },
        age: 0,
      });
    }
    return debut;
  };

  const tourDuMaitre = (enc: Encounter): Encounter => {
    let etat = enc;
    for (let i = 0; i < 12; i++) {
      etat = applyAction(etat, { type: 'endTurn' });
      if (etat.order[etat.turnIndex] === 'maitre') break;
    }
    return etat;
  };

  it('déclare un entretien, moins cher que la prise', () => {
    const def = statusByKey('controle')!;
    expect(def.sustain?.upkeep).toBe(3);
    expect(def.sustain!.upkeep!).toBeLessThan(fils.manaCost);
  });

  it('coûte le DOUBLE pour deux pantins', () => {
    // C'est le point : l'entretien se compte par lien tenu. Mener deux corps a
    // désormais un prix, là où seules les mains le limitaient.
    const un = tourDuMaitre(enTrain(1, 60));
    expect(findUnit(un, 'maitre')!.mana).toBe(57);

    const deux = tourDuMaitre(enTrain(2, 60));
    expect(findUnit(deux, 'maitre')!.mana).toBe(54);
  });

  it('lâche TOUS les pantins d’un coup quand la réserve ne suit plus', () => {
    // On ne choisit pas lequel garder : la main s'ouvre, tout tombe.
    const apres = tourDuMaitre(enTrain(2, 5));
    for (const id of ['p1', 'p2']) {
      expect(findUnit(apres, id)!.statuses.map((s) => s.key)).not.toContain('controle');
    }
    expect(apres.log.some((l) => l.text.includes('plus de quoi entretenir'))).toBe(true);
    expect(findUnit(apres, 'maitre')!.mana).toBe(5);
  });
});
