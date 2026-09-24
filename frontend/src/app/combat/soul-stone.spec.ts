import { describe, expect, it } from 'vitest';
import { Rng } from './dice';
import {
  captureSoul,
  CapturedSoul,
  invocationLimit,
  isStoneUsable,
  markInvoked,
  ritualDegree,
  ritualThreshold,
  SOUL_STONE_RULES,
  visibleProfile,
} from './soul-stone';

/** Un dé truqué : rend les faces demandées, dans l'ordre. */
function loaded(...faces: number[]): Rng {
  const rng = new Rng(1);
  let i = 0;
  rng.d20 = () => faces[i++];
  return rng;
}

const LOUP: CapturedSoul = { species: 'loup', profile: 'banshee', severity: 8 };
const base = { soul: LOUP, chaMod: 3, intMod: 0, mastery: 2, day: 10 };

describe('seuil du rituel', () => {
  it('suit le barème des sauvegardes', () => {
    // CHA +3, sévérité 4 : résistance 8 → 2 crans ; maîtrise 2 → seuil 4.
    expect(ritualThreshold(3, 4, 2)).toBe(4);
    // Mort en agonie, praticien sans charisme : seuil qui monte.
    expect(ritualThreshold(0, 16, 0)).toBe(11);
    expect(ritualThreshold(-5, 30, 0)).toBe(18);
    expect(ritualThreshold(10, 0, 10)).toBe(3);
  });

  it('distingue les cinq degrés', () => {
    expect(ritualDegree(1, 3)).toBe('echec-total');
    expect(ritualDegree(3, 10)).toBe('echec');
    expect(ritualDegree(7, 10)).toBe('partiel');
    expect(ritualDegree(12, 10)).toBe('reussite');
    expect(ritualDegree(20, 18)).toBe('critique');
  });
});

describe('capture', () => {
  it("perd la pierre sur un échec, sans jet de lecture", () => {
    const r = captureSoul(base, loaded(1));
    expect(r.stone).toBeNull();
    expect(r.reading).toBeUndefined();
  });

  it('impose un délai de stabilisation sur un partiel', () => {
    // Seuil de capture : 8 − round((12 − 8)/5) − 2 = 5 ; 2 tombe dans la bande partielle.
    const r = captureSoul(base, loaded(2, 15));
    expect(r.capture.degree).toBe('partiel');
    expect(r.stone!.usableFromDay).toBe(10 + SOUL_STONE_RULES.stabilizationDays);
    expect(isStoneUsable(r.stone!, 10)).toBe(false);
    expect(isStoneUsable(r.stone!, 10 + SOUL_STONE_RULES.stabilizationDays)).toBe(true);
  });

  it('cumule la stabilité des deux critiques', () => {
    const r = captureSoul(base, loaded(20, 20));
    expect(r.stone).toMatchObject({ usableFromDay: 10, stability: 2, knowledge: 'complet' });
  });

  it('laisse diverger capture et lecture', () => {
    const r = captureSoul(base, loaded(15, 2));
    expect(r.capture.degree).toBe('reussite');
    expect(r.stone!.knowledge).toBe('inconnu');
    expect(visibleProfile(r.stone!)).toEqual({});
  });

  it("ne révèle qu'une catégorie sur une lecture partielle", () => {
    // Seuil de lecture (INT +0, sévérité 8, maîtrise 2) : 8 − round(−8/5) − 2 = 8 ; 5 est partiel.
    const r = captureSoul(base, loaded(15, 5));
    expect(visibleProfile(r.stone!)).toEqual({ species: 'loup', danger: 'modere' });
  });

  it("marque l'âme hostile quand le geôlier l'a tuée", () => {
    expect(captureSoul({ ...base, keeperResponsible: true }, loaded(15, 15)).stone!.hostileToKeeper).toBe(true);
  });

  it("révèle le profil à la première invocation", () => {
    const pierre = markInvoked(captureSoul(base, loaded(15, 2)).stone!);
    expect(pierre.knowledge).toBe('complet');
    expect(pierre.invocations).toBe(1);
  });
});

describe("limite d'invocation", () => {
  it('vaut 1 + CHA, au moins 1', () => {
    expect(invocationLimit(3)).toBe(4);
    expect(invocationLimit(-2)).toBe(1);
  });
});
