export interface PieSlice {
  key: string;
  label: string;
  value: number;
  details: string;
  color: string;
  start: number;
}

export interface PieChart {
  key: string;
  title: string;
  center: string;
  slices: PieSlice[];
}

export const DOMAIN_COLORS: Record<string, string> = {
  fire: 'var(--domain-fire)',
  water: 'var(--domain-water)',
  earth: 'var(--domain-earth)',
  air: 'var(--domain-air)',
  lightning: 'var(--domain-lightning)',
  plants: 'var(--domain-plants)',
  light: 'var(--domain-light)',
  darkness: 'var(--domain-darkness)',
  life: 'var(--domain-life)',
  death: 'var(--domain-death-muted)',
  time: 'var(--domain-time)',
  space: 'var(--domain-space)',
};

export function buildSlices(
  slices: Array<Omit<PieSlice, 'start'>>
): PieSlice[] {
  let start = 0;

  return slices.map((slice) => {
    const pieSlice = { ...slice, start };
    start += slice.value;
    return pieSlice;
  });
}

function domainSlices(
  slices: Array<[key: string, label: string, value: number]>
): PieSlice[] {
  return buildSlices(
    slices.map(([key, label, value]) => ({
      key,
      label,
      value,
      details: 'Domaine documenté dans cette population éveillée',
      color: DOMAIN_COLORS[key],
    }))
  );
}

export const DOMAIN_DISTRIBUTION_CHARTS: PieChart[] = [
  {
    key: 'humans',
    title: 'Humains',
    center: 'Humains',
    slices: domainSlices([
      ['fire', 'Feu', 11],
      ['water', 'Eau', 11],
      ['earth', 'Terre', 11],
      ['air', 'Air', 11],
      ['lightning', 'Électricité', 11],
      ['plants', 'Plantes', 11],
      ['light', 'Lumière', 9],
      ['darkness', 'Ténèbres', 9],
      ['life', 'Vie', 7],
      ['death', 'Mort', 7],
      ['time', 'Temps', 1],
      ['space', 'Espace', 1],
    ]),
  },
  {
    key: 'dwarves',
    title: 'Nains',
    center: 'Nains',
    slices: domainSlices([
      ['earth', 'Terre', 26],
      ['lightning', 'Électricité', 20],
      ['fire', 'Feu', 11],
      ['water', 'Eau', 10],
      ['air', 'Air', 9],
      ['plants', 'Plantes', 7],
      ['light', 'Lumière', 5],
      ['darkness', 'Ténèbres', 5],
      ['life', 'Vie', 2],
      ['death', 'Mort', 3],
      ['time', 'Temps', 1],
      ['space', 'Espace', 1],
    ]),
  },
  {
    key: 'elves',
    title: 'Elfes',
    center: 'Elfes',
    slices: domainSlices([
      ['plants', 'Plantes', 24],
      ['life', 'Vie', 23],
      ['light', 'Lumière', 9],
      ['darkness', 'Ténèbres', 8],
      ['fire', 'Feu', 1],
      ['water', 'Eau', 11],
      ['earth', 'Terre', 9],
      ['air', 'Air', 7],
      ['lightning', 'Électricité', 3],
      ['death', 'Mort', 1],
      ['time', 'Temps', 2],
      ['space', 'Espace', 2],
    ]),
  },
  {
    key: 'beast-humans',
    title: 'Beast humans',
    center: 'Beast humans',
    slices: domainSlices([
      ['earth', 'Terre', 22],
      ['fire', 'Feu', 18],
      ['water', 'Eau', 17],
      ['air', 'Air', 15],
      ['lightning', 'Électricité', 10],
      ['plants', 'Plantes', 5],
      ['light', 'Lumière', 3],
      ['darkness', 'Ténèbres', 3],
      ['life', 'Vie', 5],
      ['death', 'Mort', 1],
      ['time', 'Temps', 0.5],
      ['space', 'Espace', 0.5],
    ]),
  },
  {
    key: 'deep-walkers',
    title: 'Marcheurs des Profondeurs',
    center: 'Marcheurs',
    slices: domainSlices([
      ['water', 'Eau', 32],
      ['earth', 'Terre', 4],
      ['fire', 'Feu', 5],
      ['air', 'Air', 7],
      ['lightning', 'Électricité', 8],
      ['plants', 'Plantes', 5],
      ['light', 'Lumière', 5],
      ['darkness', 'Ténèbres', 18],
      ['life', 'Vie', 10],
      ['death', 'Mort', 4],
      ['time', 'Temps', 1],
      ['space', 'Espace', 1],
    ]),
  },
];
