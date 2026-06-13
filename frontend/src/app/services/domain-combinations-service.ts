import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs/internal/operators/map';
import { shareReplay } from 'rxjs/internal/operators/shareReplay';
import { Observable } from 'rxjs/internal/Observable';
import { DomainCombination } from '../wiki.types';

/**
 * Source unique des combinaisons de domaines.
 *
 * Chaque combinaison n'est déclarée qu'une seule fois dans
 * `domains/combinations.json`. Le service dérive automatiquement les
 * combinaisons à afficher pour un domaine donné en filtrant sur ses
 * composants — inutile de les recopier dans chaque fichier de domaine.
 */
@Injectable({ providedIn: 'root' })
export class DomainCombinationsService {
  private http = inject(HttpClient);

  private all$ = this.http
    .get<DomainCombination[]>('/resources/json/domains/combinations.json')
    .pipe(shareReplay(1));

  /** Toutes les combinaisons déclarées. */
  all(): Observable<DomainCombination[]> {
    return this.all$;
  }

  /** Les combinaisons qui impliquent le domaine `slug`. */
  forDomain(slug: string): Observable<DomainCombination[]> {
    return this.all$.pipe(
      map(list => list.filter(combo => combo.components.includes(slug)))
    );
  }
}
