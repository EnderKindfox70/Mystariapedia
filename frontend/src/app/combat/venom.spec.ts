import { describe, expect, it } from 'vitest';
import remainsIndex from '../../../public/resources/json/natural-resources/remains/index.json';
import veninSerpent from '../../../public/resources/json/natural-resources/remains/venin-de-serpent.json';
import veninFantome from '../../../public/resources/json/natural-resources/remains/venin-de-serpent-fantome.json';
import { AttributeKey, StatKey } from '../character/character.types';
import { catalogTrait } from '../character/universe-data';
import { venomAbility, VenomSource, weaponAbility } from './abilities';
import { Affinities, Combatant, Encounter, Team } from './combat.types';
import { emptyEncounter } from './encounter';
import { applyAction, enchantStatusesOn, findUnit } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   LES VENINS

   Un venin n'ajoute pas de dégâts : il pose un revêtement sur l'arme, et
   chaque coup qui touche tente d'y faire passer son statut. C'est la même
   lecture que le catalogue de statuts — le poison est un statut, pas un type
   de dégâts. Les chiffres viennent des fiches, jamais recopiés ici.
─────────────────────────────────────────────────────────────────────────── */

const source = (
  fiche: { name: string; venom?: unknown },
  slug: string,
): VenomSource => ({ name: fiche.name, slug, ...(fiche.venom as object) });

const SERPENT = source(veninSerpent, 'venin-de-serpent');
const FANTOME = source(veninFantome, 'venin-de-serpent-fantome');

const STATS = (): Record<StatKey, number> => ({
  hp: 40, mana: 20, endurance: 20, speed: 10,
  atk_phy: 20, atk_mag: 10, def_phy: 10, def_mag: 10,
});
const ATTRS = (): Record<AttributeKey, number> => ({
  force: 12, dexterite: 12, constitution: 12, intelligence: 12, sagesse: 12, charisme: 12,
});
const NO_AFFINITY = (): Affinities => ({
  immunities: [], resistances: [], weaknesses: [], absorptions: [],
});

function mkUnit(id: string, name: string, team: Team): Combatant {
  const base = STATS();
  return {
    origin: { kind: 'custom' },
    footprint: 1,
    pos: { x: 0, y: 0 },
    attributes: ATTRS(),
    proficiency: 2,
    id,
    name,
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

describe('venins — catalogue', () => {
  it("se repère au tag `venom`, dans l'index comme dans la fiche", () => {
    const tagged = remainsIndex.filter((e) => e.tags?.includes('venom')).map((e) => e.slug);
    expect(tagged).toEqual(['venin-de-serpent', 'venin-de-serpent-fantome']);
    expect(veninSerpent.tags).toContain('venom');
    expect(veninFantome.tags).toContain('venom');
  });

  it('déclare ce que chaque coup tente de faire passer', () => {
    expect(SERPENT.inflicts).toEqual([{ status: 'poison', chance: 50 }]);
    expect(FANTOME.inflicts?.map((i) => i.status)).toEqual(['poison', 'silence']);
    expect(SERPENT.coatingTurns).toBe(3);
  });
});

describe("venins — capacité « enduire »", () => {
  it("pose un revêtement sur l'arme, sans dégâts propres", () => {
    const ability = venomAbility(SERPENT, false);
    expect(ability.damages).toEqual([]);
    expect(ability.enchant?.target).toBe('weapon');
    expect(ability.enchant?.damage).toBeUndefined();
    expect(ability.enchant?.inflicts).toEqual(SERPENT.inflicts);
    expect(ability.consumes).toEqual({ item: SERPENT.name, qty: 1 });
    expect(ability.duration).toBe(3);
  });

  it("coûte le tour, sauf pour l'Empoisonneur", () => {
    expect(venomAbility(SERPENT, false).bonusAction).toBe(false);
    expect(venomAbility(SERPENT, true).bonusAction).toBe(true);
    // Le trait dit exactement ça, et rien d'autre.
    expect(catalogTrait('empoisonneur')?.description).toContain('action bonus');
  });
});

describe('venins — en combat', () => {
  /** Un combattant qui vient d'enduire son arme. */
  function coated(): Combatant {
    let enc: Encounter = emptyEncounter('Test');
    const unit = mkUnit('u1', 'Empoisonneuse', 'allies');
    const cible = mkUnit('u2', 'Cible', 'ennemis');
    cible.pos = { x: 1, y: 0 };
    const ability = venomAbility(SERPENT, true);
    unit.abilities = [ability];
    unit.inventory = [{ name: SERPENT.name, qty: 1, kind: 'venom' }];
    enc.combatants = [unit, cible];
    enc = applyAction(enc, { type: 'start' });
    enc.order = [unit.id];
    enc.turnIndex = 0;
    enc = applyAction(enc, { type: 'use', actorId: unit.id, abilityId: ability.id, at: unit.pos });
    return findUnit(enc, unit.id)!;
  }

  it("consomme la fiole et tient trois tours sur l'arme", () => {
    const unit = coated();
    const effect = unit.effects.find((e) => e.enchant?.target === 'weapon');
    expect(effect).toBeTruthy();
    expect(effect?.enchant?.inflicts).toEqual(SERPENT.inflicts);
    expect(unit.inventory.find((c) => c.name === SERPENT.name)?.qty).toBe(0);
  });

  it('ajoute son statut aux coups d’arme, jamais aux sorts', () => {
    const unit = coated();
    const epee = weaponAbility(
      { name: 'Épée longue', minDamage: 4, maxDamage: 8, weaponCategory: 'longsword' },
      'weapon',
    );
    expect(enchantStatusesOn(unit, epee)).toEqual(SERPENT.inflicts);

    const sort = { ...epee, kind: 'spell' as const };
    expect(enchantStatusesOn(unit, sort)).toEqual([]);
  });
});
