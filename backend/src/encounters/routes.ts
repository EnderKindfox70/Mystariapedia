import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../auth/routes.js';
import {
  create,
  findById,
  listByUser,
  remove,
  toSummary,
  update,
  type EncounterData,
} from './store.js';

export const encountersRouter = Router();

// Une rencontre appartient à son MJ : toutes les routes exigent un compte.
encountersRouter.use(requireAuth);

const userOf = (req: Request) => (req as Request & { userId?: string }).userId!;
const idOf = (req: Request) => String(req.params.id);

// Validation minimale : une rencontre doit avoir un nom et une liste de
// combattants. Le reste (grille, journal, graine) reste libre — le moteur vit
// côté front et le serveur n'a pas à connaître ses règles.
function readData(req: Request): EncounterData | null {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const data = (body['data'] ?? body) as EncounterData;
  if (typeof data !== 'object' || data === null) return null;
  if (typeof data['name'] !== 'string' || data['name'].trim().length === 0) return null;
  if (!Array.isArray(data['combatants'])) return null;
  return data;
}

// Liste des rencontres du MJ courant (vue allégée, sans le journal).
encountersRouter.get('/', async (req: Request, res: Response) => {
  const encounters = await listByUser(userOf(req));
  res.json({ encounters: encounters.map(toSummary) });
});

// Création d'une rencontre.
encountersRouter.post('/', async (req: Request, res: Response) => {
  const data = readData(req);
  if (!data) {
    return res.status(400).json({ error: 'Un nom et une liste de combattants sont requis.' });
  }
  const encounter = await create(userOf(req), data);
  return res.status(201).json({ encounter });
});

// Détail d'une rencontre (réservé à son propriétaire).
encountersRouter.get('/:id', async (req: Request, res: Response) => {
  const encounter = await findById(idOf(req));
  if (!encounter || encounter.userId !== userOf(req)) {
    return res.status(404).json({ error: 'Rencontre introuvable.' });
  }
  return res.json({ encounter });
});

// Sauvegarde de l'état courant du combat.
encountersRouter.put('/:id', async (req: Request, res: Response) => {
  const data = readData(req);
  if (!data) {
    return res.status(400).json({ error: 'Un nom et une liste de combattants sont requis.' });
  }
  const encounter = await update(idOf(req), userOf(req), data);
  if (!encounter) return res.status(404).json({ error: 'Rencontre introuvable.' });
  return res.json({ encounter });
});

// Suppression.
encountersRouter.delete('/:id', async (req: Request, res: Response) => {
  const ok = await remove(idOf(req), userOf(req));
  if (!ok) return res.status(404).json({ error: 'Rencontre introuvable.' });
  return res.status(204).end();
});
