import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/* ──────────────────────────────────────────────────────────────────────────
   LIRE ET ÉCRIRE UN FICHIER JSON SANS LE CASSER

   Les magasins tiennent chacun un fichier JSON qu'ils réécrivent en entier.
   Tant qu'une seule requête écrivait à la fois, cela suffisait. Deux requêtes
   simultanées, non : chacune relit, modifie sa copie et réécrit, et l'on perd
   au mieux une modification — au pire on obtient un fichier ILLISIBLE, deux
   documents mêlés, et toutes les fiches deviennent inaccessibles d'un coup.

   C'est arrivé pour de vrai : « Reporter sur les fiches » envoyait un PUT par
   personnage, tous en parallèle.

   Deux garde-fous, indépendants :

   1. **Une file d'attente par fichier.** Les écritures d'un même fichier se
      suivent au lieu de se chevaucher, quelle que soit la source — deux
      onglets, deux joueurs, un script.

   2. **Une écriture atomique.** On écrit dans un fichier temporaire, puis on
      le renomme sur la cible : `rename` est atomique sur un même volume, donc
      un lecteur voit toujours l'ANCIEN document entier ou le NOUVEAU document
      entier, jamais un mélange des deux. Une panne en pleine écriture ne peut
      plus laisser de fichier tronqué.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Dernière opération en cours pour chaque fichier.
 *
 * Une promesse par chemin : la suivante s'y enchaîne. Le `catch` qui remet la
 * chaîne à plat est indispensable — sans lui, une écriture ratée bloquerait
 * définitivement toutes les suivantes.
 */
const queues = new Map<string, Promise<unknown>>();

/** Enchaîne une opération derrière celles déjà en attente sur ce fichier. */
function enqueue<T>(file: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous.then(task, task);
  // On garde une version « qui ne rejette jamais » dans la file : c'est le
  // maillon suivant, pas la file, qui doit voir l'erreur.
  queues.set(
    file,
    next.catch(() => undefined),
  );
  return next;
}

/** Lit un document JSON, ou rend le repli si le fichier n'existe pas encore. */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

/** Écrit un document JSON de façon atomique (temporaire puis renommage). */
async function writeAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  // Le temporaire vit dans LE MÊME dossier : `rename` n'est atomique qu'à
  // l'intérieur d'un même volume, et /tmp peut être ailleurs.
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await rename(temp, file);
}

/**
 * Lit, transforme et réécrit un document JSON — le tout à l'abri des écritures
 * concurrentes.
 *
 * La lecture est DANS la section critique : relire en dehors reviendrait à
 * travailler sur une copie déjà périmée, et la dernière écriture effacerait
 * silencieusement celle d'avant.
 */
export function updateJson<T, R>(
  file: string,
  fallback: T,
  mutate: (current: T) => { value: T; result: R } | Promise<{ value: T; result: R }>,
): Promise<R> {
  return enqueue(file, async () => {
    const current = await readJson<T>(file, fallback);
    const { value, result } = await mutate(current);
    await writeAtomic(file, value);
    return result;
  });
}

/** Lecture sérialisée avec les écritures, pour ne jamais lire un état partiel. */
export function readJsonSafe<T>(file: string, fallback: T): Promise<T> {
  return enqueue(file, () => readJson<T>(file, fallback));
}
