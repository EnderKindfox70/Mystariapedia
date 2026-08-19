import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from './encounter';
import {
  LAYOUT_LEGEND,
  TERRAIN_LAYOUTS,
  layoutByKey,
  layoutSize,
  layoutToTerrain,
} from './layouts';
import { blocksMovement, blocksSight, terrainKind } from './terrain';

/* ──────────────────────────────────────────────────────────────────────────
   Une carte ASCII se relit d'un coup d'œil, mais une ligne à laquelle il
   manque un caractère ne se voit PAS. Ces tests comptent à notre place, et
   vérifient que chaque décor tient encore la promesse de son nom.
─────────────────────────────────────────────────────────────────────────── */

const cell = (terrain: Record<string, string>, x: number, y: number) => terrain[`${x},${y}`];

describe('décors prêts à jouer', () => {
  it('en propose assez pour varier', () => {
    expect(TERRAIN_LAYOUTS.length).toBeGreaterThanOrEqual(6);
  });

  it('a des clés et des noms uniques', () => {
    const keys = new Set(TERRAIN_LAYOUTS.map((l) => l.key));
    const names = new Set(TERRAIN_LAYOUTS.map((l) => l.name));
    expect(keys.size).toBe(TERRAIN_LAYOUTS.length);
    expect(names.size).toBe(TERRAIN_LAYOUTS.length);
  });

  for (const layout of TERRAIN_LAYOUTS) {
    describe(layout.name, () => {
      it('a toutes ses lignes de la même longueur', () => {
        const largeurs = new Set(layout.rows.map((r) => r.length));
        expect([...largeurs]).toHaveLength(1);
      });

      it('tient dans la grille par défaut', () => {
        const { width, height } = layoutSize(layout);
        expect(width).toBeLessThanOrEqual(DEFAULT_GRID.width);
        expect(height).toBeLessThanOrEqual(DEFAULT_GRID.height);
      });

      it('n’emploie que des symboles connus', () => {
        const inconnus = new Set<string>();
        for (const row of layout.rows) {
          for (const glyph of row) {
            if (glyph !== '.' && !LAYOUT_LEGEND[glyph]) inconnus.add(glyph);
          }
        }
        expect([...inconnus]).toEqual([]);
      });

      it('ne pose que des décors du catalogue', () => {
        const terrain = layoutToTerrain(layout, DEFAULT_GRID);
        for (const key of Object.values(terrain)) {
          expect(terrainKind(key), `décor inconnu : ${key}`).toBeDefined();
        }
      });

      it('laisse de la place pour se battre', () => {
        // Une carte plus obstruée que dégagée n'est plus un terrain, c'est un
        // labyrinthe : les combattants passeraient leur temps à contourner.
        const terrain = layoutToTerrain(layout, DEFAULT_GRID);
        const total = DEFAULT_GRID.width * DEFAULT_GRID.height;
        const bloquees = Object.keys(terrain).filter((c) => blocksMovement(terrain, c)).length;
        expect(bloquees / total).toBeLessThan(0.45);
      });
    });
  }
});

describe('ce que chaque décor promet', () => {
  const monter = (key: string) => layoutToTerrain(layoutByKey(key)!, DEFAULT_GRID);

  it('« Le pont » : un gouffre qu’on voit mais qu’on ne franchit qu’en un point', () => {
    const terrain = monter('pont');
    const gouffres = Object.entries(terrain).filter(([, k]) => k === 'gouffre');
    expect(gouffres.length).toBeGreaterThan(20);

    // On tire au travers : c'est ce qui distingue un gouffre d'un mur.
    const [premier] = gouffres;
    expect(blocksMovement(terrain, premier[0])).toBe(true);
    expect(blocksSight(terrain, premier[0])).toBe(false);

    // Et il existe une VRAIE traversée : une ligne sans gouffre de bord à bord.
    const lignesLibres = Array.from({ length: DEFAULT_GRID.height }, (_, y) =>
      Array.from({ length: DEFAULT_GRID.width }, (_, x) => cell(terrain, x, y)).every(
        (k) => k !== 'gouffre',
      ),
    ).filter(Boolean);
    expect(lignesLibres.length).toBeGreaterThanOrEqual(1);
  });

  it('« Le gué » : ça ralentit, ça n’arrête pas', () => {
    const terrain = monter('gue');
    const cases = Object.keys(terrain);
    expect(cases.length).toBeGreaterThan(30);
    // Aucune case ne bloque : une rivière se traverse, elle coûte seulement cher.
    expect(cases.filter((c) => blocksMovement(terrain, c))).toEqual([]);
    expect(cases.every((c) => (terrainKind(terrain[c])?.moveCost ?? 1) > 1)).toBe(true);
  });

  it('« La clairière » : du couvert partout, un centre dégagé', () => {
    const terrain = monter('clairiere');
    const milieu = Math.floor(DEFAULT_GRID.height / 2);
    const ligneCentrale = Array.from({ length: DEFAULT_GRID.width }, (_, x) =>
      cell(terrain, x, milieu),
    );
    expect(ligneCentrale.every((k) => k === undefined)).toBe(true);
    expect(Object.keys(terrain).filter((c) => blocksSight(terrain, c)).length).toBeGreaterThan(40);
  });

  it('« La cour à piliers » : des obstacles réguliers, jamais de cul-de-sac', () => {
    const terrain = monter('cour');
    // Des piliers, pas des murs : chaque colonne du plateau reste franchissable.
    for (let x = 0; x < DEFAULT_GRID.width; x++) {
      const colonne = Array.from({ length: DEFAULT_GRID.height }, (_, y) => cell(terrain, x, y));
      expect(colonne.some((k) => k === undefined), `colonne ${x} murée`).toBe(true);
    }
  });

  it('« Le marais » : rien ne bloque, tout ralentit', () => {
    const terrain = monter('marais');
    const cases = Object.keys(terrain);
    expect(cases.filter((c) => blocksMovement(terrain, c))).toEqual([]);
    expect(cases.length).toBeGreaterThan(80);
  });
});

describe('pose sur la grille', () => {
  const pont = layoutByKey('pont')!;

  it('centre le dessin sur une grille plus grande', () => {
    const large = layoutToTerrain(pont, { width: 30, height: 21 });
    // Décalé de (30−20)/2 = 5 et (21−15)/2 = 3 : le gouffre suit.
    expect(large['14,3']).toBe('gouffre');
    expect(large['9,0']).toBeUndefined();
  });

  it('rogne sans déborder sur une grille plus petite', () => {
    const petite = { width: 10, height: 8 };
    const terrain = layoutToTerrain(pont, petite);
    for (const key of Object.keys(terrain)) {
      const [x, y] = key.split(',').map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(petite.width);
      expect(y).toBeLessThan(petite.height);
    }
    // Et il reste le cœur du dessin : le gouffre, pas un coin vide.
    expect(Object.values(terrain)).toContain('gouffre');
  });
});
