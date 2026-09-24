import { describe, expect, it } from 'vitest';
import statusCatalog from '../../../public/resources/json/status_effects.json';
import damageCatalog from '../../../public/resources/json/damage_type.json';
import { Rng } from './dice';
import {
  affinityLines,
  advanceDecay,
  bodyArchetype,
  DANGER_TIERS,
  decayStageAt,
  GHOSTS,
  ghostAffinities,
  ghostControlRange,
  ghostRangeLines,
  ghostStats,
  ghostUpkeep,
  necromancyControlRange,
  onryoPowerFactor,
  rollVeilGhost,
  stageWindow,
  UNDEAD,
  undeadPenalties,
  undeadStats,
  veilChance,
  veilTable,
  veilTurns,
} from './undead';

const STATUS_KEYS = new Set(statusCatalog.status_effects.map((s) => s.key));
const DAMAGE_IDS = new Set(damageCatalog.specific_damage_types.map((t) => t.id));

describe('catalogue undead.json', () => {
  it('compte cinq morts-vivants et onze fantômes', () => {
    expect(UNDEAD.map((u) => u.key)).toEqual(['revenant', 'goule', 'bouffi', 'squelette', 'momie']);
    expect(GHOSTS).toHaveLength(11);
  });

  it('ne cite que des statuts et des types de dégâts qui existent', () => {
    const statuts = [
      ...UNDEAD.flatMap((u) => [u.contact?.status, u.onDestroyed?.status, ...(u.statusImmunities ?? [])]),
      ...GHOSTS.flatMap((g) => [...(g.selfStatuses ?? []), ...g.abilities.flatMap((a) => a.inflicts ?? [])]),
    ].filter((s): s is string => !!s);
    for (const s of statuts) expect(STATUS_KEYS.has(s), s).toBe(true);

    const ids = [...UNDEAD.flatMap((u) => u.affinities ?? []), ...GHOSTS.flatMap((g) => ghostAffinities(g.key))].flatMap(
      (a) => a.damageTypeIds,
    );
    for (const id of ids) expect(DAMAGE_IDS.has(id), String(id)).toBe(true);
  });

  it('pèse la table du voile à 100 %, comme la fiche', () => {
    expect(veilTable().reduce((s, e) => s + e.weight, 0)).toBe(100);
    for (const tier of DANGER_TIERS) expect(GHOSTS.some((g) => g.danger === tier.key)).toBe(true);
  });
});

describe('stats des morts-vivants', () => {
  it('suit la formule base + niveau × moyenne du dé × facteur', () => {
    // Revenant, niveau 10 : 6 + 10 × 4,5 × 0,7 = 37,5 → 38 ; 3 + 10 × 4,5 × 0,6 = 30 ; 2 + 10 × 0,5 = 7.
    expect(undeadStats('revenant', 10)).toEqual({ hp: 38, atk: 30, def: 7, speed: 27 }); // 6 + 10 × 3,5 × 0,6
  });

  it('garde les rôles du roster', () => {
    const niv = 10;
    const all = UNDEAD.map((u) => ({ key: u.key, ...undeadStats(u.key, niv) }));
    const max = (k: 'hp' | 'def' | 'speed') => all.reduce((a, b) => (b[k] > a[k] ? b : a)).key;
    const min = (k: 'hp') => all.reduce((a, b) => (b[k] < a[k] ? b : a)).key;
    expect(max('hp')).toBe('momie');
    expect(max('def')).toBe('momie');
    expect(max('speed')).toBe('squelette');
    expect(min('hp')).toBe('squelette');
  });

  it('fait grandir la vitesse avec le niveau, plus vite pour les archétypes rapides', () => {
    // Squelette : 7 + niveau × 4,5 × 0,6.
    expect(undeadStats('squelette', 1).speed).toBe(10);
    expect(undeadStats('squelette', 20).speed).toBe(61);
    // Une Momie reste lente : son dé de vitesse est un d2.
    expect(undeadStats('momie', 20).speed).toBeLessThan(undeadStats('revenant', 20).speed);
    // L'embaumement ne touche pas l'allure.
    expect(undeadStats('goule', 10, { embalmed: true }).speed).toBe(undeadStats('goule', 10).speed);
  });

  it("retire la perte d'embaumement et un quart de vitesse au désaccord d'espèce", () => {
    // Goule, niveau 10 : 45,5 PV bruts, l'arrondi ne vient qu'après la perte.
    expect(undeadStats('goule', 10).hp).toBe(46);
    expect(undeadStats('goule', 10, { embalmed: true }).hp).toBe(36); // 45,5 × 0,8 = 36,4
    expect(undeadStats('goule', 10, { embalmed: true, embalmingLoss: 35 }).hp).toBe(30); // × 0,65 = 29,6
    // Jamais sous le plancher de 10 %, quoi qu'on demande.
    expect(undeadStats('goule', 10, { embalmed: true, embalmingLoss: 0 }).hp).toBe(41); // × 0,9 = 40,95
    // Squelette niveau 5 : 7 + 5 × 4,5 × 0,6 = 20,5 → 21, puis ⌊21 × 0,75⌋ = 15.
    expect(undeadStats('squelette', 5, { speciesMismatch: true }).speed).toBe(15);
  });

  it('cumule les crans des deux désaccords', () => {
    expect(undeadPenalties({ speciesMismatch: true, stageMismatch: true })).toEqual({
      precisionSteps: -4,
      signatureAttackFactor: 0.5,
      effectFactor: 0.5,
      decayRate: 2,
    });
  });
});

describe('horloge de décomposition', () => {
  it('lit le stade sur l’âge du cadavre', () => {
    expect(decayStageAt(0).archetype).toBe('revenant');
    expect(decayStageAt(3).archetype).toBe('goule');
    expect(decayStageAt(10).archetype).toBe('bouffi');
    expect(decayStageAt(200).archetype).toBe('squelette');
    expect(decayStageAt(200, true).archetype).toBe('momie');
  });

  it('fait changer l’archétype sans rituel, et s’arrête aux stades terminaux', () => {
    const r = advanceDecay({ ageDays: 1 }, 2);
    expect(r).toMatchObject({ from: 'revenant', to: 'goule' });
    const vieux = advanceDecay({ ageDays: 400 }, 400);
    expect(vieux.to).toBeUndefined();
    expect(bodyArchetype(vieux.body).key).toBe('squelette');
  });

  it('fige un corps embaumé, et use deux fois plus vite un corps instable', () => {
    const embaume = advanceDecay({ ageDays: 1, embalmedAt: 'frais' }, 100);
    expect(bodyArchetype(embaume.body).key).toBe('revenant');
    expect(advanceDecay({ ageDays: 0, stageMismatch: true }, 1).body.ageDays).toBe(2);
  });
});

describe('portées et fantômes', () => {
  it('étend le contrôle avec le Charisme', () => {
    expect(necromancyControlRange(3)).toBe(35);
    expect(ghostControlRange('banshee', 2)).toBe(50);
    expect(ghostControlRange('spectre', 2)).toBe('regional');
  });

  it('libère le Cauchemar une fois accroché à un hôte', () => {
    expect(ghostControlRange('cauchemar', 1)).toBe(15);
    expect(ghostControlRange('cauchemar', 1, true)).toBe('regional');
  });

  it("essouffle l'Onryō sans jamais l'éteindre", () => {
    // CHA +2 : pleine puissance jusqu'à 30 m.
    expect(onryoPowerFactor(30, 2)).toBe(1);
    expect(onryoPowerFactor(45, 2)).toBe(0.9);
    expect(onryoPowerFactor(60, 2)).toBe(0.7);
    expect(onryoPowerFactor(10_000, 2)).toBe(0.25);
  });

  it('pose le socle commun sous les variations propres', () => {
    const spectre = ghostAffinities('spectre');
    expect(spectre.find((a) => a.kind === 'immunities')?.damageTypeIds).toEqual([1, 2, 3]);
    expect(spectre.find((a) => a.kind === 'weaknesses')?.damageTypeIds).toEqual([13, 12]);
    expect(spectre.find((a) => a.kind === 'resistances')?.damageTypeIds).toEqual([11]);
  });

  it('coûte selon la dangerosité', () => {
    expect(ghostUpkeep('errant')).toBeLessThan(ghostUpkeep('onryo'));
  });

  it('tire le voile selon ses poids', () => {
    const rng = new Rng(42);
    const counts = new Map<string, number>();
    for (let i = 0; i < 10_000; i++) {
      const g = rollVeilGhost(rng).danger;
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    expect(counts.get('leger')! / 10_000).toBeCloseTo(0.6, 1);
    expect(counts.get('extreme')! / 10_000).toBeLessThan(0.04);
  });

  it("donne au moins un tour d'aide depuis le voile", () => {
    expect(veilTurns(2)).toBe(5);
    expect(veilTurns(-4)).toBe(1);
  });
});

describe('lecture en clair pour la fiche', () => {
  it("donne la fenêtre d'âge de chaque stade", () => {
    expect(stageWindow('frais')).toBe('moins de 2 jours');
    expect(stageWindow('rigidite')).toBe('2 à 7 jours');
    expect(stageWindow('ballonnement')).toBe('7 à 21 jours');
    expect(stageWindow('squelettisation')).toBe('21 jours et plus');
    expect(stageWindow('momification')).toBe('21 jours et plus, climat sec');
  });

  it('écrit les portées de chaque fantôme', () => {
    expect(ghostRangeLines('banshee')).toEqual([{ label: 'Contrôle', value: '40 m + 5 m × CHA' }]);
    expect(ghostRangeLines('zashiki-warashi').map((l) => l.label)).toEqual(['Hôte', 'Médium ↔ hôte']);
    expect(ghostRangeLines('onryo').map((l) => l.label)).toContain('Au-delà');
    expect(ghostRangeLines('cauchemar').map((l) => l.label)).toContain('Une fois accroché');
  });

  it('nomme les affinités en français', () => {
    expect(affinityLines([{ kind: 'weaknesses', damageTypeIds: [13, 12] }])[0].label).toBe('Faiblesses');
    expect(affinityLines([{ kind: 'weaknesses', damageTypeIds: [13] }])[0].types[0]).not.toBe('life');
  });

  it('donne la chance de chaque fantôme au voile', () => {
    expect(veilChance('errant')).toBe(15);
    expect(veilChance('onryo')).toBe(2);
  });
});

describe('stats des fantômes', () => {
  it('suivent la même formule que les morts-vivants', () => {
    // Banshee, niveau 10 : 3 + 10 × 2,5 × 0,7 = 20,5 → 21 ; 3 + 10 × 4,5 × 0,6 = 30 ; 1 + 10 × 0,3 = 4.
    expect(ghostStats('banshee', 10)).toEqual({ hp: 21, atk: 30, def: 4, speed: 27 }); // 6 + 10 × 3,5 × 0,6
  });

  it('gardent les rôles de chacun', () => {
    const all = GHOSTS.map((g) => ({ key: g.key, ...ghostStats(g.key, 10) }));
    const top = (k: 'hp' | 'def' | 'speed') => all.reduce((a, b) => (b[k] > a[k] ? b : a)).key;
    expect(top('hp')).toBe('ombre-gardienne');
    expect(top('def')).toBe('ombre-gardienne');
    expect(top('speed')).toBe('feu-follet');
    const atk = all.filter((g) => g.atk !== null).reduce((a, b) => (b.atk! > a.atk! ? b : a)).key;
    expect(atk).toBe('onryo');
    // La Banshee frappe fort mais casse vite.
    const banshee = all.find((g) => g.key === 'banshee')!;
    expect(banshee.hp).toBeLessThan(ghostStats('spectre', 10).hp);
  });

  it("n'arment pas un fantôme qui ne se bat jamais", () => {
    expect(ghostStats('zashiki-warashi', 10).atk).toBeNull();
  });

  it('pèsent selon la dangerosité, en moyenne', () => {
    const moy = (danger: string) => {
      const liste = GHOSTS.filter((g) => g.danger === danger).map((g) => ghostStats(g.key, 10));
      return liste.reduce((s, x) => s + x.hp + (x.atk ?? 0), 0) / liste.length;
    };
    expect(moy('leger')).toBeLessThan(moy('modere'));
    expect(moy('modere')).toBeLessThan(moy('eleve'));
    expect(moy('eleve')).toBeLessThan(moy('extreme'));
  });
});

describe('stats entières', () => {
  it('ne rend jamais de dixièmes, à aucun niveau, embaumé ou non', () => {
    for (let niv = 1; niv <= 20; niv++) {
      for (const u of UNDEAD) {
        for (const s of [undeadStats(u.key, niv), undeadStats(u.key, niv, { embalmed: true, embalmingLoss: 17 })]) {
          for (const v of Object.values(s)) expect(Number.isInteger(v), `${u.key} niv. ${niv}`).toBe(true);
        }
      }
      for (const g of GHOSTS) {
        for (const v of Object.values(ghostStats(g.key, niv))) {
          if (v !== null) expect(Number.isInteger(v), `${g.key} niv. ${niv}`).toBe(true);
        }
      }
    }
  });
});
