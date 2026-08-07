import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/* ──────────────────────────────────────────────────────────────────────────
   Où sont les fichiers.

   `import.meta.url` ne sert à rien ici : le lanceur de tests regroupe les
   specs dans des bundles dont l'emplacement ne reflète pas l'arborescence des
   sources, et le chemin obtenu pointe alors n'importe où. On part donc du
   répertoire de travail et on REMONTE jusqu'à reconnaître le dépôt à une
   balise qui n'existe que chez lui. Un chemin faux vaudrait ici une mesure
   fausse, silencieusement : mieux vaut échouer tout de suite.
─────────────────────────────────────────────────────────────────────────── */

const LANDMARK = 'frontend/public/resources/json/bestiary/index.json';

function findRoot(): string {
  let dir = resolve(process.cwd());
  for (let up = 0; up < 6; up++) {
    if (existsSync(resolve(dir, LANDMARK))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Racine du dépôt introuvable depuis ${process.cwd()} : le banc d'essai ne sait pas où lire les fiches.`,
  );
}

/** Racine du dépôt, résolue une fois. */
export const REPO_ROOT = findRoot();

/** Un chemin sous la racine du dépôt. */
export const fromRoot = (...parts: string[]): string => resolve(REPO_ROOT, ...parts);
