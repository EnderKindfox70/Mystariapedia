import { describe, expect, it } from 'vitest';
import airDomain from '../../../public/resources/json/domains/air.json';
import { AttributeKey, StatKey } from '../character/character.types';
import { Affinities, Combatant, CombatAbility, Encounter, Team } from './combat.types';
import { emptyEncounter } from './encounter';
import { ambienceDamageFactor, applyAction, findUnit } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   TEMPS CALME

   Le sort ne convoque plus rien : il DÉFAIT la météo en cours. Neutre, dans ce
   moteur, c'est l'absence de météo — donc plus aucun multiplicateur d'ambiance
   et plus aucun statut imposé par le ciel.
─────────────────────────────────────────────────────────────────────────── */

const CALME = airDomain.spells.find((s) => s.key === 'air-temps-calme')!;

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

/** La capacité telle que la fabrique la produirait depuis le palier I. */
const abilityFromNode = (): CombatAbility => ({
  id: 'spell:air-temps-calme',
  name: 'Temps calme',
  kind: 'spell',
  rangeMeters: 20,
  shape: { kind: 'single' },
  targets: ['everyone'],
  manaCost: CALME.progression.nodes[0].stats.mana,
  enduranceCost: 0,
  damages: [],
  autoHit: true,
  domains: ['air'],
  clearsWeather: true,
});

function mkUnit(id: string, team: Team): Combatant {
  const base = STATS();
  return {
    origin: { kind: 'custom' }, footprint: 1, pos: { x: 0, y: 0 },
    attributes: ATTRS(), proficiency: 2, id, name: id, team, base,
    hp: base.hp, mana: base.mana, endurance: base.endurance,
    moved: 0, actionUsed: false, bonusActionUsed: false, reactionUsed: false,
    statuses: [], effects: [], abilities: [], inventory: [],
    affinities: NO_AFFINITY(), initiative: 0, down: false,
  } as unknown as Combatant;
}

describe('Temps calme — la fiche', () => {
  it('est un sort de niveau 5 qui ne blesse pas', () => {
    expect(CALME.level).toBe(5);
    expect(CALME.name).toBe('Temps calme');
    for (const node of CALME.progression.nodes) {
      expect(node.stats.clearsWeather).toBe(true);
      expect(node.stats).not.toHaveProperty('damageMin');
      expect(node.stats).not.toHaveProperty('inflicts');
    }
  });

  it("ne convoque aucune météo : c'est bien l'inverse", () => {
    for (const node of CALME.progression.nodes) {
      expect(node.stats).not.toHaveProperty('weather');
    }
  });
});

describe('Temps calme — en jeu', () => {
  /** Une rencontre sous un ciel donné, où le sort vient d'être lancé. */
  function apresLeSort(weather: string | undefined): Encounter {
    let enc: Encounter = { ...emptyEncounter('Test'), weather };
    const mage = mkUnit('mage', 'allies');
    const ability = abilityFromNode();
    mage.abilities = [ability];
    enc.combatants = [mage, { ...mkUnit('cible', 'ennemis'), pos: { x: 2, y: 0 } }];
    enc = applyAction(enc, { type: 'start' });
    enc.order = [mage.id];
    enc.turnIndex = 0;
    return applyAction(enc, { type: 'use', actorId: mage.id, abilityId: ability.id, at: mage.pos });
  }

  it('dissipe la météo en cours', () => {
    const apres = apresLeSort('storm');
    expect(apres.weather).toBeUndefined();
    expect(apres.log.some((l) => l.text.includes('se dissipe'))).toBe(true);
  });

  it("rend au ciel sa neutralité : plus aucun multiplicateur d'ambiance", () => {
    const secheresse: Encounter = { ...emptyEncounter('Test'), weather: 'drought' };
    // La sécheresse pousse le Feu ×1,5 — c'est ce qu'on veut voir tomber.
    expect(ambienceDamageFactor(secheresse, ['fire'])).toBeCloseTo(1.5);
    expect(ambienceDamageFactor(apresLeSort('drought'), ['fire'])).toBe(1);
  });

  it('le dit sans mentir quand le ciel était déjà calme', () => {
    const apres = apresLeSort(undefined);
    expect(apres.weather).toBeUndefined();
    expect(apres.log.some((l) => l.text.includes('déjà calme'))).toBe(true);
  });

  it('laisse le lanceur et sa cible intacts : le sort ne blesse pas', () => {
    const apres = apresLeSort('rain');
    for (const id of ['mage', 'cible']) {
      const unit = findUnit(apres, id)!;
      expect(unit.hp).toBe(unit.base.hp);
    }
  });
});
