import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDir } from '../data-dir.js';

// Magasin des rencontres de combat, calqué sur sheets/store.ts : un fichier
// JSON suffit tant qu'aucune base n'est branchée.
const encountersFile = join(dataDir, 'encounters.json');

// État complet d'une rencontre (grille, combattants, journal, graine). Comme
// pour les fiches, le back ne contraint pas la structure : le moteur de combat
// vit côté front et reste seul maître du modèle. Le serveur ne fait que
// stocker, rattacher à un propriétaire et horodater.
export type EncounterData = Record<string, unknown>;

export type StoredEncounter = {
  id: string;
  userId: string;
  data: EncounterData;
  createdAt: string;
  updatedAt: string;
};

// Vue allégée pour la liste (une rencontre porte tout son journal : inutile de
// renvoyer des centaines de lignes pour afficher un catalogue).
export type EncounterSummary = {
  id: string;
  name: string;
  round: number;
  combatants: number;
  updatedAt: string;
};

async function readAll(): Promise<StoredEncounter[]> {
  try {
    const raw = await readFile(encountersFile, 'utf8');
    return JSON.parse(raw) as StoredEncounter[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAll(encounters: StoredEncounter[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(encountersFile, JSON.stringify(encounters, null, 2), 'utf8');
}

export function toSummary(encounter: StoredEncounter): EncounterSummary {
  const data = encounter.data ?? {};
  const name = typeof data['name'] === 'string' ? data['name'] : '';
  const round = typeof data['round'] === 'number' ? data['round'] : 0;
  const combatants = Array.isArray(data['combatants']) ? data['combatants'].length : 0;
  return {
    id: encounter.id,
    name: name || 'Rencontre sans nom',
    round,
    combatants,
    updatedAt: encounter.updatedAt,
  };
}

export async function listByUser(userId: string): Promise<StoredEncounter[]> {
  return (await readAll())
    .filter((e) => e.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function findById(id: string): Promise<StoredEncounter | undefined> {
  return (await readAll()).find((e) => e.id === id);
}

export async function create(userId: string, data: EncounterData): Promise<StoredEncounter> {
  const encounters = await readAll();
  const now = new Date().toISOString();
  const encounter: StoredEncounter = {
    id: crypto.randomUUID(),
    userId,
    data,
    createdAt: now,
    updatedAt: now,
  };
  encounters.push(encounter);
  await writeAll(encounters);
  return encounter;
}

export async function update(
  id: string,
  userId: string,
  data: EncounterData,
): Promise<StoredEncounter | undefined> {
  const encounters = await readAll();
  const encounter = encounters.find((e) => e.id === id && e.userId === userId);
  if (!encounter) return undefined;
  encounter.data = data;
  encounter.updatedAt = new Date().toISOString();
  await writeAll(encounters);
  return encounter;
}

export async function remove(id: string, userId: string): Promise<boolean> {
  const encounters = await readAll();
  const next = encounters.filter((e) => !(e.id === id && e.userId === userId));
  if (next.length === encounters.length) return false;
  await writeAll(next);
  return true;
}
