import { HttpBackend, HttpErrorResponse, HttpEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable, Provider } from '@angular/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Observable, of, throwError } from 'rxjs';
import { fromRoot } from './paths';

/* ──────────────────────────────────────────────────────────────────────────
   Le wiki servi depuis le disque.

   Les fabriques de combattants lisent leurs catalogues par HTTP, comme dans le
   navigateur. Hors navigateur, ces appels échouent en silence : la fabrique
   `catchError` chaque requête et se rabat sur des catalogues vides. Un
   personnage monté ainsi n'a ni arme, ni armure, ni classe — il se bat à mains
   nues en chemise, et tout ce qu'on mesurerait sur lui serait faux.

   Ce backend rebranche les requêtes sur `public/resources/json`. Le simulateur
   travaille donc sur les MÊMES fichiers que le site, sans copie ni fixture à
   maintenir en parallèle : ajouter une arme au wiki la rend jouable dans le
   banc d'essai le jour même.

   Réservé aux tests : il importe `node:fs`, et n'a rien à faire dans un bundle.
─────────────────────────────────────────────────────────────────────────── */

const PUBLIC_DIR = fromRoot('frontend/public');

/**
 * Cache de PORTÉE MODULE, pas d'instance : une série de combats reconstruit la
 * fabrique des dizaines de fois, et relire le wiki entier à chaque fois coûte
 * plus cher que tous les combats réunis.
 */
const cache = new Map<string, unknown>();

@Injectable()
export class FileSystemWikiBackend implements HttpBackend {

  handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    const path = req.url.startsWith('/') ? req.url.slice(1) : req.url;

    if (!cache.has(path)) {
      try {
        cache.set(path, JSON.parse(readFileSync(join(PUBLIC_DIR, path), 'utf8')));
      } catch {
        // Un fichier absent n'est pas une anomalie : le wiki a des collections
        // sans index, et les fabriques savent s'en passer. On répond comme le
        // ferait un vrai serveur, pour qu'elles empruntent le même chemin.
        cache.set(path, null);
      }
    }

    const body = cache.get(path);
    if (body === null) {
      return throwError(
        () => new HttpErrorResponse({ status: 404, statusText: 'Not Found', url: req.url }),
      );
    }
    return of(new HttpResponse({ body, status: 200, url: req.url }));
  }
}

/** À passer aux `providers` d'un `TestBed` qui monte des combattants. */
export const provideFileSystemWiki = (): Provider => ({
  provide: HttpBackend,
  useClass: FileSystemWikiBackend,
});
