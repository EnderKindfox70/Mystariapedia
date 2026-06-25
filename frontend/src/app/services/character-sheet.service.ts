import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  CharacterSheet,
  CharacterSheetSummary,
  StoredSheet,
} from '../character/character.types';

// CRUD des fiches de personnage. Le jeton Bearer est ajouté automatiquement par
// authInterceptor pour tout appel vers /api/.
@Injectable({ providedIn: 'root' })
export class CharacterSheetService {
  private readonly http = inject(HttpClient);

  list(): Observable<CharacterSheetSummary[]> {
    return this.http
      .get<{ sheets: CharacterSheetSummary[] }>('/api/sheets')
      .pipe(map((res) => res.sheets));
  }

  get(id: string): Observable<StoredSheet> {
    return this.http.get<{ sheet: StoredSheet }>(`/api/sheets/${id}`).pipe(map((r) => r.sheet));
  }

  create(data: CharacterSheet): Observable<StoredSheet> {
    return this.http
      .post<{ sheet: StoredSheet }>('/api/sheets', { data })
      .pipe(map((r) => r.sheet));
  }

  update(id: string, data: CharacterSheet): Observable<StoredSheet> {
    return this.http
      .put<{ sheet: StoredSheet }>(`/api/sheets/${id}`, { data })
      .pipe(map((r) => r.sheet));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/sheets/${id}`);
  }
}
