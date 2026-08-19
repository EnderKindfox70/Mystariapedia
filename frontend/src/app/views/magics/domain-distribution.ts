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

/**
 * Combien de domaines un individu porte à l'éveil. Source unique : la page
 * Magie l'affiche en camembert, et le tirage d'affinité des fiches de
 * personnage en tire ses poids (cf. character/magic-affinity.ts).
 */
export const AFFINITY_CHART: PieChart = {
  key: 'affinity',
  title: 'Répartition naturelle des affinités magiques',
  center: 'Affinités natives',
  slices: buildSlices([
    {
      key: 'single',
      label: 'Affinité unique',
      value: 76,
      details: "Un seul domaine, accessible à l'éveil",
      color: '#8b6b2f',
    },
    {
      key: 'dual',
      label: 'Deux affinités',
      value: 11,
      details: 'Rares, souvent instables dans leur pratique initiale',
      color: '#6b1f1f',
    },
    {
      key: 'many',
      label: 'Trois affinités ou plus',
      value: 4,
      details: "Exceptionnels, parfois soupçonnés d'ascendance divine non documentée",
      color: '#4b2e59',
    },
    {
      key: 'sealed',
      label: 'Mana impossible à réguler',
      value: 9,
      details: 'Ni affinité, ni éveil possible par voie ordinaire',
      color: '#1c1a18',
    },
  ]),
};

/**
 * Nombre d'affinités porté par chaque tranche du camembert ci-dessus. « Trois
 * ou plus » compte pour 3 : c'est le plafond d'une fiche de personnage.
 */
export const AFFINITY_SLICE_COUNT: Record<string, number> = {
  sealed: 0,
  single: 1,
  dual: 2,
  many: 3,
};

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

/* ─────────────────────────────────────────────
   TABLEAU COMPARATIF — % de magie par peuple
   Réutilise les données des camemberts (une seule source) et les met à plat
   sous forme de tableau : une ligne par peuple, une colonne par domaine.
───────────────────────────────────────────── */

export interface ComparisonColumn {
  key: string;
  label: string;
  color: string;
}

export interface ComparisonCell {
  key: string;
  value: number;
  /** Domaine dominant de ce peuple (valeur maximale de la ligne). */
  isMax: boolean;
}

export interface ComparisonRow {
  people: string;
  cells: ComparisonCell[];
}

export interface ComparisonTable {
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
}

/** Ordre canonique des colonnes (12 domaines) pour le tableau comparatif. */
const COLUMN_ORDER = [
  'fire', 'water', 'earth', 'air', 'lightning', 'plants',
  'light', 'darkness', 'life', 'death', 'time', 'space',
] as const;

/**
 * Construit le tableau comparatif à partir des camemberts de distribution :
 * les libellés et couleurs de colonnes proviennent des tranches elles-mêmes,
 * garantissant que tableau et graphiques restent alimentés par la même source.
 */
export function buildComparisonTable(charts: PieChart[]): ComparisonTable {
  const labelByKey = new Map<string, string>();
  for (const chart of charts) {
    for (const slice of chart.slices) {
      if (!labelByKey.has(slice.key)) labelByKey.set(slice.key, slice.label);
    }
  }

  const columns: ComparisonColumn[] = COLUMN_ORDER.map((key) => ({
    key,
    label: labelByKey.get(key) ?? key,
    color: DOMAIN_COLORS[key] ?? 'var(--ancient-gold)',
  }));

  const rows: ComparisonRow[] = charts.map((chart) => {
    const valueByKey = new Map(chart.slices.map((s) => [s.key, s.value]));
    const max = Math.max(...chart.slices.map((s) => s.value));
    const cells: ComparisonCell[] = columns.map((col) => {
      const value = valueByKey.get(col.key) ?? 0;
      return { key: col.key, value, isMax: value > 0 && value === max };
    });
    return { people: chart.title, cells };
  });

  return { columns, rows };
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

/** Tableau comparatif prêt à l'emploi, dérivé des camemberts ci-dessus. */
export const DOMAIN_COMPARISON: ComparisonTable = buildComparisonTable(
  DOMAIN_DISTRIBUTION_CHARTS
);

/**
 * Correspondance entre le `slug` de route d'un domaine (domains.catalog) et la
 * clé de tranche utilisée dans les camemberts, quand les deux diffèrent.
 */
const DOMAIN_SLUG_TO_KEY: Record<string, string> = {
  electricity: 'lightning',
  plant: 'plants',
};

export interface RaceShare {
  people: string;
  value: number;
}

/**
 * Pour un domaine donné (via son slug de route), renvoie la part d'affinité de
 * chaque peuple, triée de la plus forte à la plus faible. Réutilise la même
 * source unique que les camemberts et le tableau comparatif.
 */
export function racesForDomain(slug: string): RaceShare[] {
  const key = DOMAIN_SLUG_TO_KEY[slug] ?? slug;
  return DOMAIN_COMPARISON.rows
    .map((row) => ({
      people: row.people,
      value: row.cells.find((c) => c.key === key)?.value ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
}
