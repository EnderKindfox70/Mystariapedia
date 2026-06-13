import {HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs/internal/Observable';
import { shareReplay } from 'rxjs/internal/operators/shareReplay';

@Injectable({ providedIn: 'root' })

export class WikiLoaderService 
{
  private http = inject(HttpClient);
  private cache = new Map<string, Observable<unknown>>();

  load<T>(collection: string, slug: string): Observable<T> {
    const key = `${collection}/${slug}`;
    if (!this.cache.has(key)) {
      this.cache.set(key,
        this.http.get<T>(`/resources/json/${collection}/${slug}.json`).pipe(
          shareReplay(1)
        )
      );
    }
    return this.cache.get(key) as Observable<T>;
  }

  loadAll<T>(collection: string): Observable<T[]> {
    return this.http.get<T[]>(`/resources/json/${collection}/index.json`).pipe(
      shareReplay(1)
    );
  }
}
