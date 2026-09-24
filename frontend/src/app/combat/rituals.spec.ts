import { describe, expect, it } from 'vitest';
import deathDomain from '../../../public/resources/json/domains/death.json';
import minerals from '../../../public/resources/json/natural-resources/minerals/index.json';
import { DomainSpellEntry } from '../wiki.types';
import { isRitual, playableInCombat } from './abilities';
import { contactSeverity } from './soul-stone';
import { assessAtLevel, DEFAULT_RULES, emptyBuild, fillTemplate, fromSpellEntry, targetLabelFor } from './spell-customization';

const SPELLS = deathDomain.spells as unknown as DomainSpellEntry[];
const byKey = (key: string) => SPELLS.find((s) => s.key === key)!;

describe('sorts rituels', () => {
  it('ne laisse un rituel en combat que s’il le déclare', () => {
    expect(playableInCombat(byKey('death-toucher-necrotique'))).toBe(true);
    expect(playableInCombat(byKey('death-capture-d-ame'))).toBe(false);
    expect(playableInCombat(byKey('death-embaumement-rituel'))).toBe(false);
    expect(playableInCombat(byKey('death-manifestation-spectrale'))).toBe(true);
  });

  it('décrit chaque rituel, et seulement les rituels', () => {
    for (const s of SPELLS) {
      expect(!!s.ritual, s.key).toBe(isRitual(s));
      if (s.ritual) expect(s.ritual.castingTime, s.key).toBeTruthy();
    }
  });

  it('réserve la Pierre d’âme aux rituels', () => {
    const lies = SPELLS.filter((s) => s.ritual?.soulStone).map((s) => [s.key, s.ritual!.soulStone!.role]);
    expect(lies).toEqual([
      ['death-capture-d-ame', 'fills'],
      ['death-releve-les-morts', 'draws'],
      ['death-manifestation-spectrale', 'draws'],
    ]);
    // Aide depuis le voile appelle un fantôme SANS pierre : ce n'est pas un rituel.
    expect(isRitual(byKey('death-aide-depuis-le-voile'))).toBe(false);
  });

  it('pointe vers une Pierre d’âme qui existe dans les ressources', () => {
    const slugs = new Set(minerals.map((m) => m.slug));
    const refs = SPELLS.flatMap((s) => s.ritual?.components ?? []).filter((c) => c.collection === 'resources/minerals');
    for (const c of refs) expect(slugs.has(c.ref!), c.ref).toBe(true);
  });

  it('résout toutes les dépendances de l’arbre de la Mort', () => {
    const keys = new Set(SPELLS.map((s) => s.key));
    for (const s of SPELLS) for (const r of s.requires ?? []) expect(keys.has(r), `${s.key} → ${r}`).toBe(true);
  });
});

describe('Contact spectral', () => {
  it('durcit le contact d’une semaine à l’autre, jusqu’à 16', () => {
    expect(contactSeverity(0)).toBe(4);
    expect(contactSeverity(3)).toBe(7);
    expect(contactSeverity(52)).toBe(16);
  });
});

describe('curseurs des sorts de la Mort', () => {
  const ctx = { rules: DEFAULT_RULES, classes: [], catalog: {} };
  const spell = (key: string) => fromSpellEntry(byKey(key), ['death'])!;

  it('raccourcit le rite et allège la perte de stats, jamais sous 10 %', () => {
    const e = spell('death-embaumement-rituel');
    const mieux = assessAtLevel(e, { ...emptyBuild(), params: { riteDays: 3, statLoss: 5 } }, 5, ctx);
    expect(mieux.errors).toEqual([]);
    expect(mieux.stats.rite).toEqual({ days: 2, statLoss: 15 });

    // Un rite plus long et plus coûteux pour le corps REND des points.
    const pire = assessAtLevel(e, { ...emptyBuild(), params: { riteDays: -2, statLoss: -5 } }, 5, ctx);
    expect(pire.net).toBeLessThan(0);

    const trop = assessAtLevel(e, { ...emptyBuild(), params: { statLoss: 15 } }, 5, ctx);
    expect(trop.errors.join()).toMatch(/Perte de stats.*minimum absolu \(10\)/);
  });

  it('donne à la Vision spirituelle une acuité et un mode continu', () => {
    const v = spell('death-vision-spirituelle');
    const a = assessAtLevel(v, { ...emptyBuild(), continuous: true, params: { sight: 1 } }, 5, ctx);
    expect(a.errors).toEqual([]);
    expect(a.stats.grades?.['sight']).toBe(1);
    expect(a.stats.duration).toBeLessThan(0);
    expect(a.stats.upkeep).toBeGreaterThan(0);
  });

  it('fait viser un cadavre à la Reconstruction funèbre, n’importe lequel une fois débloqué', () => {
    const r = spell('death-reconstruction-funebre');
    expect(r.baseStats.targets).toEqual(['ally']);
    expect(targetLabelFor('ally', r.baseStats.targetKind)).toBe('Cadavres alliés');
    const a = assessAtLevel(r, { ...emptyBuild(), targetUnlocks: ['enemy'] }, 5, ctx);
    expect(a.errors).toEqual([]);
    expect(a.stats.targets).toEqual(['ally', 'enemy']);
  });
});

describe('procédure des rituels', () => {
  const ctx = { rules: DEFAULT_RULES, classes: [], catalog: {} };
  const rituels = SPELLS.filter((s) => s.ritual);

  it('raconte chaque rituel étape par étape', () => {
    for (const s of rituels) {
      expect(s.ritual!.summary, s.key).toBeTruthy();
      expect(s.ritual!.procedure?.length ?? 0, s.key).toBeGreaterThanOrEqual(3);
    }
  });

  it('remplit chaque étape avec le sort construit, sans variable orpheline', () => {
    for (const s of rituels) {
      const spell = fromSpellEntry(s, ['death'])!;
      const stats = assessAtLevel(spell, emptyBuild(), 0, ctx).stats;
      for (const step of s.ritual!.procedure ?? []) {
        expect(fillTemplate(step.text, spell, stats), `${s.key} / ${step.title}`).not.toMatch(/\{[\w.:]+\}/);
      }
    }
  });

  it('donne les cinq degrés de chaque jet, du pire au meilleur', () => {
    const ordre = ['echec-total', 'echec', 'partiel', 'reussite', 'critique'];
    for (const s of rituels) {
      for (const c of s.ritual!.checks ?? []) expect(c.outcomes?.map((o) => o.degree), `${s.key} / ${c.label}`).toEqual(ordre);
    }
  });
});
