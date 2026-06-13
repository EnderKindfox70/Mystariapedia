import express from 'express';
import cors from 'cors';
import { authRouter } from './auth/routes.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// CORS ouvert en dev pour que le ng serve (localhost:4200) puisse appeler l'API.
app.use(cors());
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`[backend] API à l'écoute sur http://localhost:${PORT}`);
});
