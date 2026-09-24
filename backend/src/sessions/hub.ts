import type { Response } from 'express';

/* ──────────────────────────────────────────────────────────────────────────
   LE RELAIS EN DIRECT

   Chaque navigateur assis à une table garde une connexion ouverte (Server-Sent
   Events) : le serveur y pousse le nouvel état publié par le MJ, les actions
   des joueurs à destination du MJ, et qui est présent.

   Tout est en mémoire : une connexion n'a de sens que tant qu'elle est ouverte.
   Un redémarrage du serveur coupe tout le monde ; les navigateurs se
   reconnectent d'eux-mêmes et relisent le dernier état, qui, lui, est stocké.
─────────────────────────────────────────────────────────────────────────── */

type Listener = { userId: string; res: Response };

const tables = new Map<string, Set<Listener>>();

/** Envoie un évènement à une connexion. */
function write(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Qui est présent à une table, d'après les connexions ouvertes. */
export function online(sessionId: string): string[] {
  return [...new Set([...(tables.get(sessionId) ?? [])].map((l) => l.userId))];
}

/** Ouvre le flux d'un membre, et le referme proprement à la déconnexion. */
export function attach(sessionId: string, userId: string, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Certains mandataires (nginx, celui de l'hébergeur) retiennent la réponse en
  // tampon : ce drapeau leur demande de la laisser passer au fil de l'eau.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const listener: Listener = { userId, res };
  const set = tables.get(sessionId) ?? new Set<Listener>();
  set.add(listener);
  tables.set(sessionId, set);
  broadcast(sessionId, 'presence', { online: online(sessionId) });

  // Un commentaire toutes les 25 s : sans trafic, les mandataires coupent la
  // connexion au bout d'une minute environ.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);

  res.on('close', () => {
    clearInterval(heartbeat);
    set.delete(listener);
    if (!set.size) tables.delete(sessionId);
    broadcast(sessionId, 'presence', { online: online(sessionId) });
  });
}

/** Pousse un évènement à toute la table, ou à ceux que `only` retient. */
export function broadcast(
  sessionId: string,
  event: string,
  data: unknown,
  only?: (userId: string) => boolean,
): number {
  let sent = 0;
  for (const l of tables.get(sessionId) ?? []) {
    if (only && !only(l.userId)) continue;
    write(l.res, event, data);
    sent += 1;
  }
  return sent;
}
