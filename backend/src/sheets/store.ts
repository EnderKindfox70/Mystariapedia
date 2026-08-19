import { join } from 'node:path';
import { dataDir } from '../data-dir.js';
import { readJsonSafe, updateJson } from '../json-file.js';

// Magasin de fiches de personnage sur fichier JSON, calqué sur auth/store.ts :
// suffisant tant qu'aucune base de données n'est branchée. Ignoré par git.
const sheetsFile = join(dataDir, 'sheets.json');

// Données libres de la fiche (identité, attributs, sorts…). On ne contraint pas
// la structure ici : le front est seul maître du modèle, le back ne fait que
// stocker, rattacher à un propriétaire et horodater.
export type SheetData = Record<string, unknown>;

export type StoredSheet = {
  id: string;
  userId: string;
  data: SheetData;
  createdAt: string;
  updatedAt: string;
};

// Vue allégée pour la liste (pas besoin de renvoyer toute la fiche).
export type SheetSummary = {
  id: string;
  name: string;
  race: string;
  updatedAt: string;
  /** Image du personnage (corps entier, ou portrait à défaut) pour le catalogue. */
  image: string;
};

// Lecture et écriture passent par `json-file` : les opérations d'un même
// fichier s'y suivent au lieu de se chevaucher, et l'écriture est atomique.
// Deux requêtes simultanées ne peuvent donc plus mêler leurs documents — c'est
// ce qui avait rendu toutes les fiches illisibles d'un coup.
const readAll = (): Promise<StoredSheet[]> => readJsonSafe<StoredSheet[]>(sheetsFile, []);

/** Lit, modifie et réécrit la collection en une seule opération protégée. */
const mutate = <R>(change: (sheets: StoredSheet[]) => R): Promise<R> =>
  updateJson<StoredSheet[], R>(sheetsFile, [], (sheets) => ({
    value: sheets,
    result: change(sheets),
  }));

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

export function toSummary(sheet: StoredSheet): SheetSummary {
  const identity = (sheet.data?.['identity'] ?? {}) as Record<string, unknown>;
  return {
    id: sheet.id,
    name: asString(identity['name']) || 'Personnage sans nom',
    race: asString(identity['subrace']) || asString(identity['race']),
    updatedAt: sheet.updatedAt,
    image: asString(identity['fullImage']) || asString(identity['portrait']),
  };
}

export async function listByUser(userId: string): Promise<StoredSheet[]> {
  return (await readAll())
    .filter((sheet) => sheet.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function findById(id: string): Promise<StoredSheet | undefined> {
  return (await readAll()).find((sheet) => sheet.id === id);
}

export function create(userId: string, data: SheetData): Promise<StoredSheet> {
  return mutate((sheets) => {
    const now = new Date().toISOString();
    const sheet: StoredSheet = {
      id: crypto.randomUUID(),
      userId,
      data,
      createdAt: now,
      updatedAt: now,
    };
    sheets.push(sheet);
    return sheet;
  });
}

export function update(
  id: string,
  userId: string,
  data: SheetData,
): Promise<StoredSheet | undefined> {
  return mutate((sheets) => {
    const sheet = sheets.find((s) => s.id === id && s.userId === userId);
    if (!sheet) return undefined;
    sheet.data = data;
    sheet.updatedAt = new Date().toISOString();
    return sheet;
  });
}

export function remove(id: string, userId: string): Promise<boolean> {
  return updateJson<StoredSheet[], boolean>(sheetsFile, [], (sheets) => {
    const next = sheets.filter((s) => !(s.id === id && s.userId === userId));
    return { value: next, result: next.length !== sheets.length };
  });
}
