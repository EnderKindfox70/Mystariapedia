import { describe, expect, it } from 'vitest';
import { cellsInShape, parseShape, shapeLabel } from './grid';
import { areaMultiplier } from './spell-economy';

/* Formes de zone : lecture du libellé et empreinte sur la grille.
   Le lanceur est en (5, 9), il vise vers le haut de la grille (y décroît). */

const grid = { width: 20, height: 20 };
const caster = { x: 5, y: 9 };
const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;
const set = (cells: { x: number; y: number }[]) => new Set(cells.map(key));

describe('Rectangle', () => {
  it('se lit en largeur × profondeur ; une seule mesure fait un carré', () => {
    expect(parseShape('Rectangle 4,5 × 3 m')).toEqual({ kind: 'rect', width: 4.5, depth: 3 });
    expect(parseShape('Rectangle 3 m')).toEqual({ kind: 'rect', width: 3, depth: 3 });
    expect(shapeLabel(parseShape('Rectangle 6 × 1,5 m'))).toBe('Rectangle 6 × 1.5 m');
  });

  it('fait face au lanceur : un front en travers, qui s’éloigne de lui', () => {
    // 3 cases de front, 2 de profondeur, posé en (5, 5) : lignes y = 5 et y = 4.
    const cells = cellsInShape(parseShape('Rectangle 4,5 × 3 m'), caster, { x: 5, y: 5 }, grid);
    expect(set(cells)).toEqual(new Set(['4,5', '5,5', '6,5', '4,4', '5,4', '6,4']));
    // Visé sur le côté, le même rectangle tourne avec lui.
    const side = cellsInShape(parseShape('Rectangle 4,5 × 3 m'), caster, { x: 9, y: 9 }, grid);
    expect(set(side)).toEqual(new Set(['9,8', '9,9', '9,10', '10,8', '10,9', '10,10']));
  });

  it('en diagonale, la bande reste pleine', () => {
    const cells = cellsInShape(parseShape('Rectangle 4,5 × 3 m'), caster, { x: 8, y: 6 }, grid);
    expect(cells.length).toBeGreaterThanOrEqual(6);
    expect(set(cells).has('8,6')).toBe(true);
  });
});

describe('Anneau', () => {
  it('ne garde que le pourtour : le centre est épargné', () => {
    const cells = cellsInShape(parseShape('Anneau 3 m'), caster, { x: 10, y: 10 }, grid);
    expect(cells).toHaveLength(16); // pourtour d'un carré de 5 × 5
    expect(set(cells).has('10,10')).toBe(false);
    expect(set(cells).has('11,11')).toBe(false);
    expect(set(cells).has('12,10')).toBe(true);
  });
});

describe('Estimation de puissance', () => {
  it('une zone vaut ce qu’elle couvre : un mince front pèse moins qu’un grand rayon', () => {
    expect(areaMultiplier('Rectangle 4,5 × 1,5 m')).toBeLessThan(areaMultiplier('Rayon 3 m'));
    expect(areaMultiplier('Rectangle 7,5 × 7,5 m')).toBeCloseTo(areaMultiplier('Rayon 3 m'), 5);
    expect(areaMultiplier('Anneau 3 m')).toBeLessThan(areaMultiplier('Rayon 3 m'));
  });
});
