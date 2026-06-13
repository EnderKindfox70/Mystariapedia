import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/internal/operators/catchError';
import { of } from 'rxjs/internal/observable/of';
import { Navbar } from '../../components/navbar/navbar';
import { WikiLoaderService } from '../../services/wiki-loader-service';
import { ResourceIndexEntry } from '../../wiki.types';

@Component({
  selector: 'app-alchemy',
  imports: [RouterLink, Navbar],
  templateUrl: './alchemy.html',
  styleUrl: './alchemy.css',
})
export class Alchemy {
  private loader = inject(WikiLoaderService);

  /** Slugs dont l'image n'a pas pu se charger → repli sur le glyphe. */
  readonly broken = new Set<string>();

  /** Catalogue des potions, chargé depuis potions/index.json. */
  readonly potions = toSignal(
    this.loader
      .loadAll<ResourceIndexEntry>('potions')
      .pipe(catchError(() => of([] as ResourceIndexEntry[]))),
    { initialValue: [] as ResourceIndexEntry[] },
  );
}
