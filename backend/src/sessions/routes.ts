import { Router, type Request, type Response } from 'express';
import { requireAuth, verifyToken } from '../auth/routes.js';
import { findById as findUser, findByUsername } from '../auth/store.js';
import { findById as findSheet } from '../sheets/store.js';
import { attach, broadcast, online } from './hub.js';
import {
  create,
  dropInvite,
  findById,
  invite,
  isMember,
  join,
  listForUser,
  normalizeCode,
  publishState,
  remove,
  removePlayer,
  toDetail,
  toSummary,
  type StoredSession,
} from './store.js';

export const sessionsRouter = Router();

const userOf = (req: Request) => (req as Request & { userId?: string }).userId!;
const idOf = (req: Request) => String(req.params.id);

/* ── Le flux en direct ─────────────────────────────────────────────────────
   Déclaré AVANT `requireAuth` : un EventSource ne sait pas poser d'en-tête
   Authorization, le jeton voyage donc dans l'URL.
─────────────────────────────────────────────────────────────────────────── */

sessionsRouter.get('/:id/events', async (req: Request, res: Response) => {
  const userId = verifyToken(String(req.query['token'] ?? ''));
  if (!userId) return res.status(401).json({ error: 'Jeton invalide ou expiré.' });
  const session = await findById(idOf(req));
  if (!session || !isMember(session, userId)) return res.status(404).json({ error: 'Table introuvable.' });

  attach(session.id, userId, res);
  // De quoi s'afficher tout de suite, sans attendre la prochaine publication.
  res.write(`event: hello\ndata: ${JSON.stringify({ ...toDetail(session, userId), online: online(session.id) })}\n\n`);
});

sessionsRouter.use(requireAuth);

/** Prévient toute la table que la liste des membres a changé. */
function announceMembers(session: StoredSession): void {
  broadcast(session.id, 'members', {
    players: session.players.map(({ userId, username, sheetId }) => ({ userId, username, sheetId })),
    invites: session.invites.map(({ userId, username }) => ({ userId, username })),
  });
}

/** Rend le résultat d'une opération du magasin, erreur comprise. */
function reply(res: Response, outcome: { session?: StoredSession; error?: string; status?: number }, userId: string) {
  if (!outcome.session) return res.status(outcome.status ?? 400).json({ error: outcome.error });
  announceMembers(outcome.session);
  return res.json({ session: toSummary(outcome.session, userId) });
}

/** Le joueur possède-t-il bien la fiche qu'il amène ? */
async function ownsSheet(userId: string, sheetId: unknown): Promise<boolean> {
  if (typeof sheetId !== 'string') return false;
  const sheet = await findSheet(sheetId);
  return !!sheet && sheet.userId === userId;
}

// Mes tables (MJ ou joueur) et les invitations qui m'attendent.
sessionsRouter.get('/', async (req: Request, res: Response) => {
  const userId = userOf(req);
  const { tables, invited } = await listForUser(userId);
  res.json({
    sessions: tables.map((s) => toSummary(s, userId)),
    invitations: invited.map((s) => ({ id: s.id, name: s.name, gmName: s.gmName })),
  });
});

// Ouvrir une table : celui qui la crée en est le MJ.
sessionsRouter.post('/', async (req: Request, res: Response) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Donne un nom à la table.' });
  const user = await findUser(userOf(req));
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable.' });
  const session = await create(user.id, user.username, name);
  return res.status(201).json({ session: toSummary(session, user.id) });
});

// Rejoindre par code, avec l'un de ses personnages.
sessionsRouter.post('/join', async (req: Request, res: Response) => {
  const userId = userOf(req);
  const code = normalizeCode(String(req.body?.code ?? ''));
  const { sheetId } = req.body ?? {};
  if (!(await ownsSheet(userId, sheetId))) return res.status(400).json({ error: 'Choisis l’un de tes personnages.' });
  const user = await findUser(userId);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable.' });
  const outcome = await join((s) => s.code === code, { userId, username: user.username, sheetId });
  if (outcome.error === 'Table introuvable.') outcome.error = 'Aucune table ne porte ce code.';
  return reply(res, outcome, userId);
});

// Détail d'une table, état de partie compris (membres seulement).
sessionsRouter.get('/:id', async (req: Request, res: Response) => {
  const userId = userOf(req);
  const session = await findById(idOf(req));
  if (!session || !isMember(session, userId)) return res.status(404).json({ error: 'Table introuvable.' });
  return res.json({ session: { ...toDetail(session, userId), online: online(session.id) } });
});

// Le MJ invite un joueur par son nom d'utilisateur.
sessionsRouter.post('/:id/invite', async (req: Request, res: Response) => {
  const userId = userOf(req);
  const target = await findByUsername(String(req.body?.username ?? ''));
  if (!target) return res.status(404).json({ error: 'Aucun joueur ne porte ce nom.' });
  const outcome = await invite(idOf(req), userId, { userId: target.id, username: target.username });
  return reply(res, outcome, userId);
});

// Le joueur accepte une invitation, avec l'un de ses personnages.
sessionsRouter.post('/:id/accept', async (req: Request, res: Response) => {
  const userId = userOf(req);
  const { sheetId } = req.body ?? {};
  if (!(await ownsSheet(userId, sheetId))) return res.status(400).json({ error: 'Choisis l’un de tes personnages.' });
  const user = await findUser(userId);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable.' });
  const outcome = await join(
    (s) => s.id === idOf(req) && s.invites.some((i) => i.userId === userId),
    { userId, username: user.username, sheetId },
  );
  return reply(res, outcome, userId);
});

// Changer de personnage à une table où l'on est déjà assis.
sessionsRouter.put('/:id/sheet', async (req: Request, res: Response) => {
  const userId = userOf(req);
  const { sheetId } = req.body ?? {};
  if (!(await ownsSheet(userId, sheetId))) return res.status(400).json({ error: 'Choisis l’un de tes personnages.' });
  const user = await findUser(userId);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable.' });
  const outcome = await join(
    (s) => s.id === idOf(req) && s.players.some((p) => p.userId === userId),
    { userId, username: user.username, sheetId },
  );
  return reply(res, outcome, userId);
});

// Refuser une invitation (le joueur), ou la retirer (le MJ).
sessionsRouter.delete('/:id/invites/:userId', async (req: Request, res: Response) => {
  const userId = userOf(req);
  return reply(res, await dropInvite(idOf(req), userId, String(req.params.userId)), userId);
});

// Quitter la table (le joueur), ou en retirer un joueur (le MJ).
sessionsRouter.delete('/:id/players/:userId', async (req: Request, res: Response) => {
  const userId = userOf(req);
  return reply(res, await removePlayer(idOf(req), userId, String(req.params.userId)), userId);
});

// Le MJ publie l'état de la partie ; il part aussitôt chez les joueurs.
sessionsRouter.put('/:id/state', async (req: Request, res: Response) => {
  const state = req.body?.state;
  if (typeof state !== 'object' || state === null || !Array.isArray(state['combatants'])) {
    return res.status(400).json({ error: 'État de partie invalide.' });
  }
  const outcome = await publishState(idOf(req), userOf(req), state);
  if (!outcome.session) return res.status(outcome.status ?? 400).json({ error: outcome.error });
  const { version } = outcome.session;
  broadcast(outcome.session.id, 'state', { version, state }, (id) => id !== outcome.session!.gmId);
  return res.json({ version });
});

// Un joueur propose une action : elle part chez le MJ, qui seul la joue.
sessionsRouter.post('/:id/actions', async (req: Request, res: Response) => {
  const userId = userOf(req);
  const session = await findById(idOf(req));
  const player = session?.players.find((p) => p.userId === userId);
  if (!session || !player) return res.status(404).json({ error: 'Table introuvable.' });
  const action = req.body?.action;
  if (typeof action !== 'object' || action === null || typeof action['type'] !== 'string') {
    return res.status(400).json({ error: 'Action invalide.' });
  }
  const envoye = broadcast(
    session.id,
    'action',
    { id: crypto.randomUUID(), from: { userId, username: player.username }, action },
    (id) => id === session.gmId,
  );
  if (!envoye) return res.status(409).json({ error: 'Le MJ n’est pas à la table : ton action attendra son retour.' });
  return res.status(202).json({ ok: true });
});

// Le MJ répond à un joueur : une action refusée, un mot.
sessionsRouter.post('/:id/notice', async (req: Request, res: Response) => {
  const session = await findById(idOf(req));
  if (!session || session.gmId !== userOf(req)) return res.status(404).json({ error: 'Table introuvable.' });
  const to = String(req.body?.userId ?? '');
  const text = String(req.body?.text ?? '').slice(0, 300);
  broadcast(session.id, 'notice', { text }, (id) => id === to);
  return res.status(204).end();
});

// Fermer la table.
sessionsRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = idOf(req);
  const ok = await remove(id, userOf(req));
  if (!ok) return res.status(404).json({ error: 'Table introuvable.' });
  broadcast(id, 'closed', {});
  return res.status(204).end();
});
