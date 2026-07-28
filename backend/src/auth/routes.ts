import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, findByEmail, findById, toPublicUser } from './store.js';

// En production, un secret par défaut rendrait tous les jetons forgeables :
// on refuse de démarrer plutôt que de laisser passer.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET doit être défini en production');
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const TOKEN_TTL = '7d';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export const authRouter = Router();

// Inscription : crée un compte puis renvoie un jeton.
authRouter.post('/register', async (req: Request, res: Response) => {
  const { username, email, password } = req.body ?? {};

  if (typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: "Le nom d'utilisateur doit faire au moins 3 caractères." });
  }
  if (typeof email !== 'string' || !emailPattern.test(email)) {
    return res.status(400).json({ error: 'Adresse e-mail invalide.' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères.' });
  }

  if (await findByEmail(email)) {
    return res.status(409).json({ error: 'Un compte existe déjà pour cette adresse e-mail.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createUser({ username, email, passwordHash });
  return res.status(201).json({ token: signToken(user.id), user: toPublicUser(user) });
});

// Connexion : vérifie les identifiants et renvoie un jeton.
authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Adresse e-mail et mot de passe requis.' });
  }

  const user = await findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Identifiants invalides.' });
  }

  return res.json({ token: signToken(user.id), user: toPublicUser(user) });
});

// Middleware : exige un jeton Bearer valide et attache l'id utilisateur.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Jeton manquant.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    (req as Request & { userId?: string }).userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Jeton invalide ou expiré.' });
  }
}

// Profil de l'utilisateur courant.
authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as Request & { userId?: string }).userId!;
  const user = await findById(userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  return res.json({ user: toPublicUser(user) });
});
