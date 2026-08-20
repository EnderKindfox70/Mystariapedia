import express from 'express';
import cors from 'cors';
import { authRouter } from './auth/routes.js';
import { encountersRouter } from './encounters/routes.js';
import { sheetsRouter } from './sheets/routes.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// Front et back sont sur des domaines distincts : seules les origines listées
// dans CORS_ORIGIN (séparées par des virgules) sont autorisées. Par défaut, le
// ng serve local.
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:4200')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Ce repli silencieux sur localhost est un piège en production : le front déployé
// est rejeté, et le navigateur ne rapporte qu'un « No Access-Control-Allow-Origin »
// qui n'indique nulle part que la variable manque. D'où ces deux lignes au boot.
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.warn(
    '[backend] CORS_ORIGIN absent en production : seul http://localhost:4200 est ' +
      'autorisé, toute requête du front déployé sera rejetée.',
  );
}
console.log(`[backend] Origines autorisées : ${allowedOrigins.join(', ')}`);

app.use(cors({ origin: allowedOrigins }));
// Limite relevée : les fiches embarquent leurs images en base64. Ce n'est pas la
// taille des fichiers importés qui compte ici (10 Mo autorisés côté éditeur) mais
// celle après recompression WebP par le navigateur — portrait redimensionné à
// 512 px, vignette 240x296, image plein corps à 1024 px. 16 Mo de marge large.
app.use(express.json({ limit: '16mb' }));

// Route de santé, point de départ de l'API.
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mystariapedia-backend',
    time: new Date().toISOString(),
  });
});

// Authentification : inscription, connexion, profil.
app.use('/api/auth', authRouter);

// Fiches de personnage : CRUD réservé aux utilisateurs connectés.
app.use('/api/sheets', sheetsRouter);

// Rencontres de combat : une partie sauvegardée par le MJ qui l'a montée.
app.use('/api/encounters', encountersRouter);

app.listen(PORT, () => {
  console.log(`[backend] API à l'écoute sur http://localhost:${PORT}`);
});
