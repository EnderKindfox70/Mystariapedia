import { describe, expect, it } from 'vitest';
import plantDomain from '../../../public/resources/json/domains/plant.json';
import { AttributeKey, CharacterSheet, StatKey } from '../character/character.types';
import { emptySheet, featPassives, findDomainFeat } from '../character/universe-data';
import { Affinities, Combatant, Encounter, Team } from './combat.types';
import { emptyEncounter } from './encounter';
import { applyAction, applyStatus, featDamageFactor, findUnit, syncFeatPassives } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   PASSIFS CONDITIONNELS DE FEAT

   « Croissance végétale » branche quatre choses sur des mécanismes qui
   existaient déjà : les statuts `wet` et `regeneration`, le moment `midi`, la
   météo `drought`, et la faiblesse de type `fire`. Les chiffres viennent de la
   fiche de domaine — jamais recopiés ici.
─────────────────────────────────────────────────────────────────────────── */

const CROISSANCE = plantDomain.feats.find((f) => f.key === 'plant-croissance')!;
const passiveFor = (predicate: (p: { label: string }) => boolean) =>
  CROISSANCE.passives!.find(predicate as never)!;

const SOLEIL = CROISSANCE.passives!.find((p) => p.when?.daytime === 'midi')!;
const SECHERESSE = CROISSANCE.passives!.find((p) => p.when?.weather === 'drought')!;

const STATS = (): Record<StatKey, number> => ({
  hp: 40, mana: 30, endurance: 20, speed: 10,
  atk_phy: 15, atk_mag: 20, def_phy: 10, def_mag: 10,
});
const ATTRS = (): Record<AttributeKey, number> => ({
  force: 12, dexterite: 12, constitution: 12, intelligence: 12, sagesse: 12, charisme: 12,
});
const NO_AFFINITY = (): Affinities => ({
  immunities: [], resistances: [], weaknesses: [], absorptions: [],
});

function mkUnit(id: string, team: Team): Combatant {
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
    hp: 20,
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
    featPassives: CROISSANCE.passives,
  } as unknown as Combatant;
}

describe('Croissance végétale — la fiche', () => {
  it('déclare ses quatre passifs sur des clés de catalogue existantes', () => {
    expect(CROISSANCE.passives).toHaveLength(4);
    expect(passiveFor((p) => !!(p as never as { grantsStatus?: string }).grantsStatus)).toBeTruthy();
    expect(SOLEIL.domains).toEqual(['plant']);
    expect(SECHERESSE.domains).toEqual(['plant']);
    expect(CROISSANCE.passives!.some((p) => p.weakness === 'fire')).toBe(true);
  });

  it('remonte jusqu’à la fiche de personnage qui a pris le feat', () => {
    expect(findDomainFeat('plant-croissance')?.domain).toBe('plant');
    const sheet: CharacterSheet = emptySheet();
    sheet.level = 10;
    sheet.domains = ['plant'];
    sheet.feats = [{ level: 5, pick: 'domain', feat: 'plant-croissance', domain: 'plant' }];
    expect(featPassives(sheet)).toHaveLength(4);
  });
});

describe('Croissance végétale — en combat', () => {
  it("incline les sorts de Plantes selon l'heure et le ciel, et eux seuls", () => {
    const unit = mkUnit('u1', 'allies');
    const clair: Encounter = { ...emptyEncounter('Test'), daytime: 'midi' };
    const sec: Encounter = { ...emptyEncounter('Test'), weather: 'drought' };
    const gris: Encounter = { ...emptyEncounter('Test'), weather: 'fog', daytime: 'soiree' };

    expect(featDamageFactor(clair, unit, ['plant'])).toBeCloseTo(SOLEIL.damageFactor!);
    expect(featDamageFactor(sec, unit, ['plant'])).toBeCloseTo(SECHERESSE.damageFactor!);
    expect(featDamageFactor(gris, unit, ['plant'])).toBe(1);
    // Un coup d'épée ne pousse pas au soleil.
    expect(featDamageFactor(clair, unit, undefined)).toBe(1);
    expect(featDamageFactor(clair, unit, ['fire'])).toBe(1);
  });

  it('entretient la Régénération tant que le porteur est Trempé', () => {
    const enc = emptyEncounter('Test');
    const unit = mkUnit('u1', 'allies');
    enc.combatants = [unit];

    // À sec : rien.
    syncFeatPassives(enc, unit);
    expect(unit.statuses.some((s) => s.key === 'regeneration')).toBe(false);

    applyStatus(enc, unit, 'wet', undefined);
    syncFeatPassives(enc, unit);
    expect(unit.statuses.some((s) => s.key === 'regeneration')).toBe(true);
    expect(unit.featStatuses).toEqual(['regeneration']);

    // Séché : la régénération accordée par le feat s'en va avec.
    unit.statuses = unit.statuses.filter((s) => s.key !== 'wet');
    syncFeatPassives(enc, unit);
    expect(unit.statuses.some((s) => s.key === 'regeneration')).toBe(false);
    expect(unit.featStatuses).toEqual([]);
  });

  it('fait entrer la faiblesse au Feu dans les affinités, où le moteur la lit déjà', () => {
    const enc = emptyEncounter('Test');
    const porteur = mkUnit('u1', 'allies');
    porteur.affinities.weaknesses.push('fire');
    enc.combatants = [porteur];
    enc.order = [porteur.id];
    enc.turnIndex = 0;

    const avant = porteur.hp;
    const brasier = {
      id: 'test:feu',
      name: 'Flammèche',
      kind: 'spell' as const,
      rangeMeters: 10,
      shape: { kind: 'single' as const },
      targets: ['enemy' as const],
      manaCost: 0,
      enduranceCost: 0,
      damages: [{ min: 10, max: 10, type: 'fire' }],
      autoHit: true,
      domains: ['fire'],
    };
    const lanceur = mkUnit('u2', 'ennemis');
    lanceur.featPassives = undefined;
    lanceur.abilities = [brasier];
    lanceur.pos = { x: 1, y: 0 };
    let combat: Encounter = { ...enc, combatants: [porteur, lanceur] };
    combat = applyAction(combat, { type: 'start' });
    combat.order = [lanceur.id];
    combat.turnIndex = 0;
    combat = applyAction(combat, {
      type: 'use',
      actorId: lanceur.id,
      abilityId: brasier.id,
      at: porteur.pos,
    });

    const touche = findUnit(combat, porteur.id)!;
    // 10 de feu sur une faiblesse : plus que 10 encaissés.
    expect(avant - touche.hp).toBeGreaterThan(10);
  });
});
