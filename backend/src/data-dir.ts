import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Emplacement des fichiers JSON de données, partagé par les magasins.
// En production, DATA_DIR pointe sur un disque persistant (le système de
// fichiers d'un conteneur est effacé à chaque déploiement).
// En développement, on retombe sur backend/data.
export const dataDir =
  process.env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
