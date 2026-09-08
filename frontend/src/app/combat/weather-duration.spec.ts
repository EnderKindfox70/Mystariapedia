import { describe, expect, it } from 'vitest';
import weatherCatalog from '../../../public/resources/json/weathers.json';
import { AttributeKey, StatKey } from '../character/character.types';
import { Affinities, Combatant, Encounter, Team } from './combat.types';
import { emptyEncounter } from './encounter';
import { applyAction, setWeather } from './rules';

/* ──────────────────────────────────────────────────────────────────────────
   DURÉE DES MÉTÉOS

   `weathers.json` donne depuis toujours une `defaultDuration` en rounds — le
   moteur ne la lisait pas, et une tempête appelée au round 2 tenait jusqu'à la
   fin du combat. Les durées viennent du catalogue, jamais recopiées ici.

   Le moteur sait aussi tenir un ciel SANS durée — il resterait jusqu'à ce
   qu'on en change — mais plus aucune entrée du catalogue n'est dans ce cas.
─────────────────────────────────────────────────────────────────────────── */

const weathers = weatherCatalog.weathers as { key: string; defaultDuration?: number }[];
const byKey = (key: string) => weathers.find((w) => w.key === key)!;

const STATS = (): Record<StatKey, number> => ({
  hp: 200, mana: 30, endurance: 40, speed: 10,
  atk_phy: 10, atk_mag: 10, def_phy: 30, def_mag: 30,
});
const ATTRS = (): Record<AttributeKey, number> => ({
  force: 12, dexterite: 12, constitution: 12, intelligence: 12, sagesse: 12, charisme: 12,
});
const NO_AFFINITY = (): Affinities => ({
  immunities: [], resistances: [], weaknesses: [], absorptions: [],
});

function mkUnit(id: string, team: Team, x: number): Combatant {
  const base = STATS();
  return {
    origin: { kind: 'custom' }, footprint: 1, pos: { x, y: 0 },
    attributes: ATTRS(), proficiency: 2, id, name: id, team, base,
    hp: base.hp, mana: base.mana, endurance: base.endurance,
    moved: 0, actionUsed: false, bonusActionUsed: false, reactionUsed: false,
    statuses: [], effects: [], abilities: [], inventory: [],
    affinities: NO_AFFINITY(), initiative: 0, down: false,
  } as unknown as Combatant;
}

/** Une rencontre lancée, deux combattants, prête à enchaîner les rounds. */
function duel(): Encounter {
  let enc: Encounter = emptyEncounter('Test');
  enc.combatants = [mkUnit('a', 'allies', 0), mkUnit('b', 'ennemis', 6)];
  enc = applyAction(enc, { type: 'start' });
  return enc;
}

/** Fait tourner `n` rounds complets. */
function rounds(enc: Encounter, n: number): Encounter {
  for (let i = 0; i < n * enc.order.length; i++) {
    enc = applyAction(enc, { type: 'endTurn', actorId: enc.order[enc.turnIndex] });
  }
  return enc;
}

describe('durée des météos', () => {
  it('part de la durée du catalogue quand le MJ la pose', () => {
    let enc = duel();
    enc = applyAction(enc, { type: 'setWeather', weather: 'storm' });
    expect(enc.weather).toBe('storm');
    expect(enc.weatherRounds).toBe(byKey('storm').defaultDuration);
  });

  it('se dissipe toute seule une fois sa durée passée', () => {
    let enc = duel();
    enc = applyAction(enc, { type: 'setWeather', weather: 'storm' });
    const duree = byKey('storm').defaultDuration!;

    enc = rounds(enc, duree - 1);
    expect(enc.weather).toBe('storm');

    enc = rounds(enc, 1);
    expect(enc.weather).toBeUndefined();
    expect(enc.weatherRounds).toBeUndefined();
    expect(enc.log.some((l) => l.text.includes('retombe'))).toBe(true);
  });

  it('repart à plein quand on en pose une autre en cours de route', () => {
    let enc = duel();
    enc = applyAction(enc, { type: 'setWeather', weather: 'storm' });
    enc = rounds(enc, 2);
    enc = applyAction(enc, { type: 'setWeather', weather: 'fog' });
    expect(enc.weatherRounds).toBe(byKey('fog').defaultDuration);
  });

  it('donne une durée à CHAQUE météo du catalogue', () => {
    // Le moteur sait tenir un ciel sans durée (il resterait jusqu'à ce qu'on en
    // change), mais plus aucune entrée n'est dans ce cas : toutes retombent.
    for (const weather of weathers) {
      expect(weather.defaultDuration).toBeGreaterThan(0);
    }
  });

  it('oublie le compteur quand le ciel se dégage', () => {
    const enc = duel();
    setWeather(enc, 'hail');
    expect(enc.weatherRounds).toBe(byKey('hail').defaultDuration);
    setWeather(enc, undefined);
    expect(enc.weather).toBeUndefined();
    expect(enc.weatherRounds).toBeUndefined();
  });
});
