import express from 'express';
import cors from 'cors';
import { authRouter } from './auth/routes.js';
import { sheetsRouter } from './sheets/routes.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// CORS ouvert en dev pour que le ng serve (localhost:4200) puisse appeler l'API.
app.use(cors());
// Limite relevée : les fiches embarquent des images en base64 (portrait jusqu'à
// ~2 Mo + image plein corps jusqu'à ~5 Mo, soit ~9-10 Mo encodés). 16 Mo de marge.
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

app.listen(PORT, () => {
  console.log(`[backend] API à l'écoute sur http://localhost:${PORT}`);
});
