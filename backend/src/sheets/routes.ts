import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../auth/routes.js';
import { gmHasSheet } from '../sessions/store.js';
import {
  create,
  findById,
  listByUser,
  remove,
  toSummary,
  update,
  type SheetData,
} from './store.js';

export const sheetsRouter = Router();

// Toutes les routes des fiches exigent un utilisateur connecté.
sheetsRouter.use(requireAuth);

const userOf = (req: Request) => (req as Request & { userId?: string }).userId!;
const idOf = (req: Request) => String(req.params.id);

// Récupère et valide a minima le corps : on attend un objet « data » contenant
// au moins une identité avec un nom. Le reste de la structure est libre.
function readData(req: Request): SheetData | null {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const data = (body['data'] ?? body) as SheetData;
  if (typeof data !== 'object' || data === null) return null;
  const identity = (data['identity'] ?? {}) as Record<string, unknown>;
  if (typeof identity['name'] !== 'string' || identity['name'].trim().length === 0) {
    return null;
  }
  return data;
}

// Liste des fiches de l'utilisateur courant (vue allégée).
sheetsRouter.get('/', async (req: Request, res: Response) => {
  const sheets = await listByUser(userOf(req));
  res.json({ sheets: sheets.map(toSummary) });
});

// Création d'une fiche.
sheetsRouter.post('/', async (req: Request, res: Response) => {
  const data = readData(req);
  if (!data) return res.status(400).json({ error: 'Le nom du personnage est requis.' });
  const sheet = await create(userOf(req), data);
  return res.status(201).json({ sheet });
});

/**
 * Qui peut ouvrir une fiche : son propriétaire, et le MJ d'une table où ce
 * propriétaire l'a amenée — il doit la poser sur le plateau et y reporter la
 * séance.
 */
async function mayAccess(sheet: { id: string; userId: string } | undefined, userId: string): Promise<boolean> {
  if (!sheet) return false;
  return sheet.userId === userId || (await gmHasSheet(userId, sheet.id));
}

// Détail d'une fiche (propriétaire, ou MJ de la table où elle joue).
sheetsRouter.get('/:id', async (req: Request, res: Response) => {
  const sheet = await findById(idOf(req));
  if (!(await mayAccess(sheet, userOf(req)))) {
    return res.status(404).json({ error: 'Fiche introuvable.' });
  }
  return res.json({ sheet });
});

// Mise à jour d'une fiche existante.
sheetsRouter.put('/:id', async (req: Request, res: Response) => {
  const data = readData(req);
  if (!data) return res.status(400).json({ error: 'Le nom du personnage est requis.' });
  // Le MJ d'une table écrit sur la fiche au nom de son propriétaire (report).
  const existing = await findById(idOf(req));
  if (!existing || !(await mayAccess(existing, userOf(req)))) {
    return res.status(404).json({ error: 'Fiche introuvable.' });
  }
  const sheet = await update(existing.id, existing.userId, data);
  if (!sheet) return res.status(404).json({ error: 'Fiche introuvable.' });
  return res.json({ sheet });
});

// Suppression d'une fiche.
sheetsRouter.delete('/:id', async (req: Request, res: Response) => {
  const ok = await remove(idOf(req), userOf(req));
  if (!ok) return res.status(404).json({ error: 'Fiche introuvable.' });
  return res.status(204).end();
});
