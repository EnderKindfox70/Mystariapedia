import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDir } from '../data-dir.js';

// Petit magasin d'utilisateurs sur fichier JSON : suffisant tant qu'aucune
// base de données n'est branchée. Le fichier est ignoré par git.
const usersFile = join(dataDir, 'users.json');

export type StoredUser = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

// Vue publique d'un utilisateur (jamais le hash du mot de passe).
export type PublicUser = Pick<StoredUser, 'id' | 'username' | 'email' | 'createdAt'>;

export function toPublicUser(user: StoredUser): PublicUser {
  const { passwordHash, ...rest } = user;
  return rest;
}

async function readAll(): Promise<StoredUser[]> {
  try {
    const raw = await readFile(usersFile, 'utf8');
    return JSON.parse(raw) as StoredUser[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAll(users: StoredUser[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(usersFile, JSON.stringify(users, null, 2), 'utf8');
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function findByEmail(email: string): Promise<StoredUser | undefined> {
  const target = normalizeEmail(email);
  return (await readAll()).find((user) => user.email === target);
}

export async function findById(id: string): Promise<StoredUser | undefined> {
  return (await readAll()).find((user) => user.id === id);
}

export async function createUser(
  data: Omit<StoredUser, 'id' | 'createdAt'> & { email: string },
): Promise<StoredUser> {
  const users = await readAll();
  const user: StoredUser = {
    id: crypto.randomUUID(),
    username: data.username.trim(),
    email: normalizeEmail(data.email),
    passwordHash: data.passwordHash,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeAll(users);
  return user;
}
