import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Magasin de fiches de personnage sur fichier JSON, calqué sur auth/store.ts :
// suffisant tant qu'aucune base de données n'est branchée. Ignoré par git.
const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
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

async function readAll(): Promise<StoredSheet[]> {
  try {
    const raw = await readFile(sheetsFile, 'utf8');
    return JSON.parse(raw) as StoredSheet[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAll(sheets: StoredSheet[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(sheetsFile, JSON.stringify(sheets, null, 2), 'utf8');
}

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

export async function create(userId: string, data: SheetData): Promise<StoredSheet> {
  const sheets = await readAll();
  const now = new Date().toISOString();
  const sheet: StoredSheet = {
    id: crypto.randomUUID(),
    userId,
    data,
    createdAt: now,
    updatedAt: now,
  };
  sheets.push(sheet);
  await writeAll(sheets);
  return sheet;
}

export async function update(
  id: string,
  userId: string,
  data: SheetData,
): Promise<StoredSheet | undefined> {
  const sheets = await readAll();
  const sheet = sheets.find((s) => s.id === id && s.userId === userId);
  if (!sheet) return undefined;
  sheet.data = data;
  sheet.updatedAt = new Date().toISOString();
  await writeAll(sheets);
  return sheet;
}

export async function remove(id: string, userId: string): Promise<boolean> {
  const sheets = await readAll();
  const next = sheets.filter((s) => !(s.id === id && s.userId === userId));
  if (next.length === sheets.length) return false;
  await writeAll(next);
  return true;
}
