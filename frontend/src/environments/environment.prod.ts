// Environnement de production (substitué au build via fileReplacements).
// Le front est un site statique (https://mystariapedia.onrender.com) et l'API
// un service séparé : les appels /api doivent viser son domaine.
// ⚠ Valeur figée à la compilation : la changer impose un redéploiement du front.
export const environment = {
  apiBaseUrl: 'https://mystariapedia2.onrender.com',
};
