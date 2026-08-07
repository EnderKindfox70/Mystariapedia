/* ──────────────────────────────────────────────────────────────────────────
   Les noms français des types de dégâts.

   `damage_type.json` fait foi, mais il ne parle qu'anglais : ses clés sont des
   identifiants (`slashing`, `dark`), pas des mots à montrer. La traduction vit
   donc ici, et NON dans le service qui l'utilisait jusqu'ici — le moteur écrit
   lui aussi au journal, et il est en TypeScript pur : il ne peut rien importer
   d'Angular. Deux tables auraient divergé le jour où l'on ajoute un type.
─────────────────────────────────────────────────────────────────────────── */

export const DAMAGE_LABELS: Record<string, string> = {
  bludgeoning: 'Contondant',
  piercing: 'Perforant',
  slashing: 'Tranchant',
  fire: 'Feu',
  ice: 'Glace',
  lightning: 'Foudre',
  water: 'Eau',
  earth: 'Terre',
  wind: 'Vent',
  plant: 'Végétal',
  dark: 'Ténèbres',
  light: 'Lumière',
  life: 'Vie',
  death: 'Mort',
  space: 'Espace',
  time: 'Temps',
};

/**
 * Nom affichable d'un type de dégâts. Une clé inconnue est rendue telle quelle
 * plutôt que masquée : mieux vaut lire « obscur » que rien du tout.
 */
export const damageLabel = (key: string | undefined): string =>
  (key && DAMAGE_LABELS[key]) || key || 'inconnu';
