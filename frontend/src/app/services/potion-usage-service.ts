import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs/internal/operators/map';
import { catchError } from 'rxjs/internal/operators/catchError';
import { shareReplay } from 'rxjs/internal/operators/shareReplay';
import { of } from 'rxjs/internal/observable/of';
import { Observable } from 'rxjs/internal/Observable';
import { CrossRef } from '../wiki.types';

/**
 * Source dérivée du « Utilisé dans » : quelles potions emploient une ressource.
 *
 * La relation n'est déclarée qu'une fois — dans les `ingredients` de chaque potion.
 * Le build (generate-resource-index) en dérive `potions/used-in.json`, et ce
 * service le filtre par ressource. Aucune liste à recopier dans les fiches.
 */
@Injectable({ providedIn: 'root' })
export class PotionUsageService {
  private http = inject(HttpClient);

  private usages$ = this.http
    .get<Record<string, CrossRef[]>>('/resources/json/potions/used-in.json')
    .pipe(
      catchError(() => of({} as Record<string, CrossRef[]>)),
      shareReplay(1),
    );

  /** Les potions qui utilisent la ressource `collection/slug` (ex. resources/flora, algue-de-courant). */
  forResource(collection: string, slug: string): Observable<CrossRef[]> {
    const key = `${collection}/${slug}`;
    return this.usages$.pipe(map((all) => all[key] ?? []));
  }
}
