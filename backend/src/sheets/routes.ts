import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../auth/routes.js';
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

// Détail d'une fiche (réservé au propriétaire).
sheetsRouter.get('/:id', async (req: Request, res: Response) => {
  const sheet = await findById(idOf(req));
  if (!sheet || sheet.userId !== userOf(req)) {
    return res.status(404).json({ error: 'Fiche introuvable.' });
  }
  return res.json({ sheet });
});

// Mise à jour d'une fiche existante.
sheetsRouter.put('/:id', async (req: Request, res: Response) => {
  const data = readData(req);
  if (!data) return res.status(400).json({ error: 'Le nom du personnage est requis.' });
  const sheet = await update(idOf(req), userOf(req), data);
  if (!sheet) return res.status(404).json({ error: 'Fiche introuvable.' });
  return res.json({ sheet });
});

// Suppression d'une fiche.
sheetsRouter.delete('/:id', async (req: Request, res: Response) => {
  const ok = await remove(idOf(req), userOf(req));
  if (!ok) return res.status(404).json({ error: 'Fiche introuvable.' });
  return res.status(204).end();
});
