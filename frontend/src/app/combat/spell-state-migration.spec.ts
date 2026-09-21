import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, spellProgress, xpThreshold } from './spell-customization';

/* La conversion de l'ancien arbre vers l'XP, telle que `normalizeSpells` la
   fait au chargement d'une fiche. On la rejoue ici sur la même règle : un arbre
   comptait sa racine comme un palier, donc N nœuds valent N−1 niveaux. */

const legacyXp = (nodes: string[] | undefined, rank?: number): number => {
  const paliers = Array.isArray(nodes)
    ? Math.max(0, nodes.length - 1)
    : typeof rank === 'number' ? Math.max(0, Math.round(rank) - 1) : 0;
  return paliers ? xpThreshold(Math.min(paliers, DEFAULT_RULES.maxSpellLevel), DEFAULT_RULES) : 0;
};

const niveau = (nodes: string[] | undefined, rank?: number): number =>
  spellProgress(legacyXp(nodes, rank), DEFAULT_RULES).level;

describe('les paliers de l’ancien arbre deviennent de l’XP', () => {
  it('un sort tout juste appris (racine seule) reste au socle', () => {
    expect(niveau(['sp1'])).toBe(0);
    expect(legacyXp(['sp1'])).toBe(0);
  });

  it('un sort à 5 nœuds vaut 4 niveaux — le cas d’Ambre Crimson', () => {
    expect(niveau(['e1', 'e2', 'e3', 'p4', 'p5'])).toBe(4);
  });

  it('un sort à 3 nœuds vaut 2 niveaux', () => {
    expect(niveau(['cs1', 'cs2', 'cs3'])).toBe(2);
  });

  it('un arbre plus profond que le barème ne dépasse pas le plafond', () => {
    const tres = Array.from({ length: 12 }, (_, i) => `n${i}`);
    expect(niveau(tres)).toBe(DEFAULT_RULES.maxSpellLevel);
  });

  it('l’ancien format `ranks` se convertit sur la même règle', () => {
    expect(niveau(undefined, 3)).toBe(2);
    expect(niveau(undefined, 1)).toBe(0);
  });

  it('aucun palier, aucune XP : rien n’est offert', () => {
    expect(legacyXp(undefined)).toBe(0);
    expect(legacyXp([])).toBe(0);
  });

  it('le niveau rendu ouvre bien un budget à redépenser', () => {
    const p = spellProgress(legacyXp(['e1', 'e2', 'e3', 'p4', 'p5']), DEFAULT_RULES);
    expect(p.pointsEarned).toBe(4 * DEFAULT_RULES.pointsPerSpellLevel);
  });
});
