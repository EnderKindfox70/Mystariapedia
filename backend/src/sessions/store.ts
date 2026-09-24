import { join as joinPath } from 'node:path';
import { dataDir } from '../data-dir.js';
import { readJsonSafe, updateJson } from '../json-file.js';

/* ──────────────────────────────────────────────────────────────────────────
   LES SESSIONS DE JEU

   Une session, c'est la table d'un MJ : ses joueurs, le personnage que chacun
   y a amené, et l'état vivant de la partie. Le moteur de jeu tourne dans le
   navigateur du MJ — c'est lui qui tranche. Le serveur ne fait que ranger qui
   est à quelle table, garder le dernier état publié, et relayer.

   Deux manières d'y entrer : un CODE court (partagé à voix haute ou par lien),
   ou une INVITATION nominative que le joueur accepte depuis sa liste.
─────────────────────────────────────────────────────────────────────────── */

const sessionsFile = joinPath(dataDir, 'sessions.json');

export type SessionPlayer = {
  userId: string;
  username: string;
  /** La fiche que le joueur a amenée à cette table. */
  sheetId: string;
  joinedAt: string;
};

export type SessionInvite = {
  userId: string;
  username: string;
  invitedAt: string;
};

export type StoredSession = {
  id: string;
  gmId: string;
  gmName: string;
  name: string;
  /** Code d'entrée, en majuscules, sans ambiguïté (ni 0/O ni 1/I). */
  code: string;
  players: SessionPlayer[];
  invites: SessionInvite[];
  /** Dernier état de la partie publié par le MJ (libre : le moteur est côté front). */
  state?: Record<string, unknown>;
  /** Numéro de l'état publié : les joueurs ignorent un état plus ancien que le leur. */
  version: number;
  createdAt: string;
  updatedAt: string;
};

const readAll = (): Promise<StoredSession[]> => readJsonSafe<StoredSession[]>(sessionsFile, []);

const mutate = <R>(change: (sessions: StoredSession[]) => R): Promise<R> =>
  updateJson<StoredSession[], R>(sessionsFile, [], (sessions) => ({
    value: sessions,
    result: change(sessions),
  }));

/** Alphabet sans les caractères qu'on confond en les dictant ou en les lisant. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(taken: Set<string>): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const raw = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    const code = `${raw.slice(0, 3)}-${raw.slice(3)}`;
    if (!taken.has(code)) return code;
  }
}

/** Normalise un code saisi : majuscules, tiret remis au milieu. */
export function normalizeCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.length === 6 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw;
}

export const isMember = (session: StoredSession, userId: string): boolean =>
  session.gmId === userId || session.players.some((p) => p.userId === userId);

/** Vue de liste : sans l'état de partie, qui peut être lourd. */
export function toSummary(session: StoredSession, userId: string) {
  return {
    id: session.id,
    name: session.name,
    gmName: session.gmName,
    role: session.gmId === userId ? ('mj' as const) : ('joueur' as const),
    code: session.gmId === userId ? session.code : undefined,
    players: session.players.map(({ userId: id, username, sheetId }) => ({ userId: id, username, sheetId })),
    invites: session.invites.map(({ userId: id, username }) => ({ userId: id, username })),
    updatedAt: session.updatedAt,
  };
}

/**
 * Vue détaillée pour un membre. Le code n'est montré qu'au MJ : c'est lui qui
 * décide à qui le donner.
 */
export function toDetail(session: StoredSession, userId: string) {
  return { ...toSummary(session, userId), gmId: session.gmId, state: session.state, version: session.version };
}

export async function findById(id: string): Promise<StoredSession | undefined> {
  return (await readAll()).find((s) => s.id === id);
}

export async function listForUser(userId: string): Promise<{ tables: StoredSession[]; invited: StoredSession[] }> {
  const all = await readAll();
  const byDate = (a: StoredSession, b: StoredSession) => b.updatedAt.localeCompare(a.updatedAt);
  return {
    tables: all.filter((s) => isMember(s, userId)).sort(byDate),
    invited: all.filter((s) => s.invites.some((i) => i.userId === userId)).sort(byDate),
  };
}

export function create(gmId: string, gmName: string, name: string): Promise<StoredSession> {
  return mutate((sessions) => {
    const now = new Date().toISOString();
    const session: StoredSession = {
      id: crypto.randomUUID(),
      gmId,
      gmName,
      name,
      code: newCode(new Set(sessions.map((s) => s.code))),
      players: [],
      invites: [],
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    sessions.push(session);
    return session;
  });
}

type Outcome = { session?: StoredSession; error?: string; status?: number };

/**
 * Fait entrer un joueur, par code ou par invitation acceptée. Un joueur déjà
 * assis change simplement de personnage ; une invitation en attente tombe.
 */
export function join(
  match: (s: StoredSession) => boolean,
  player: { userId: string; username: string; sheetId: string },
): Promise<Outcome> {
  return mutate((sessions) => {
    const session = sessions.find(match);
    if (!session) return { error: 'Table introuvable.', status: 404 };
    if (session.gmId === player.userId) return { error: 'Tu es déjà le MJ de cette table.', status: 409 };
    session.invites = session.invites.filter((i) => i.userId !== player.userId);
    const deja = session.players.find((p) => p.userId === player.userId);
    if (deja) deja.sheetId = player.sheetId;
    else session.players.push({ ...player, joinedAt: new Date().toISOString() });
    session.updatedAt = new Date().toISOString();
    return { session };
  });
}

export function invite(id: string, gmId: string, target: { userId: string; username: string }): Promise<Outcome> {
  return mutate((sessions) => {
    const session = sessions.find((s) => s.id === id && s.gmId === gmId);
    if (!session) return { error: 'Table introuvable.', status: 404 };
    if (target.userId === gmId) return { error: 'Tu ne peux pas t’inviter toi-même.', status: 400 };
    if (session.players.some((p) => p.userId === target.userId)) {
      return { error: `${target.username} est déjà à cette table.`, status: 409 };
    }
    if (!session.invites.some((i) => i.userId === target.userId)) {
      session.invites.push({ ...target, invitedAt: new Date().toISOString() });
      session.updatedAt = new Date().toISOString();
    }
    return { session };
  });
}

/** Refuse une invitation (le joueur) ou la retire (le MJ). */
export function dropInvite(id: string, actorId: string, targetId: string): Promise<Outcome> {
  return mutate((sessions) => {
    const session = sessions.find((s) => s.id === id);
    if (!session || (actorId !== targetId && actorId !== session.gmId)) {
      return { error: 'Table introuvable.', status: 404 };
    }
    session.invites = session.invites.filter((i) => i.userId !== targetId);
    session.updatedAt = new Date().toISOString();
    return { session };
  });
}

/** Un joueur quitte la table (lui-même), ou le MJ l'en retire. */
export function removePlayer(id: string, actorId: string, targetId: string): Promise<Outcome> {
  return mutate((sessions) => {
    const session = sessions.find((s) => s.id === id);
    if (!session || (actorId !== targetId && actorId !== session.gmId)) {
      return { error: 'Table introuvable.', status: 404 };
    }
    session.players = session.players.filter((p) => p.userId !== targetId);
    session.updatedAt = new Date().toISOString();
    return { session };
  });
}

/** Le MJ publie l'état de la partie : il remplace le précédent. */
export function publishState(id: string, gmId: string, state: Record<string, unknown>): Promise<Outcome> {
  return mutate((sessions) => {
    const session = sessions.find((s) => s.id === id && s.gmId === gmId);
    if (!session) return { error: 'Table introuvable.', status: 404 };
    session.state = state;
    session.version += 1;
    session.updatedAt = new Date().toISOString();
    return { session };
  });
}

export function remove(id: string, gmId: string): Promise<boolean> {
  return updateJson<StoredSession[], boolean>(sessionsFile, [], (sessions) => {
    const next = sessions.filter((s) => !(s.id === id && s.gmId === gmId));
    return { value: next, result: next.length !== sessions.length };
  });
}

/**
 * Le MJ a-t-il accès à cette fiche ? Oui si son propriétaire l'a amenée à
 * l'une de ses tables : il doit pouvoir la lire pour la poser sur le plateau,
 * et y écrire pour reporter la séance.
 */
export async function gmHasSheet(gmId: string, sheetId: string): Promise<boolean> {
  return (await readAll()).some((s) => s.gmId === gmId && s.players.some((p) => p.sheetId === sheetId));
}
