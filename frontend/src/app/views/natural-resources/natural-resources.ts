import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/internal/operators/catchError';
import { of } from 'rxjs/internal/observable/of';
import { Navbar } from '../../components/navbar/navbar';
import { WikiLoaderService } from '../../services/wiki-loader-service';
import { ResourceIndexEntry } from '../../wiki.types';

/** Métadonnées d'affichage d'une section. Ajouter une catégorie = 1 entrée ici. */
const CATEGORY_META = [
  { slug: 'flora',    label: 'Flore',      blurb: 'Plantes, algues et champignons aux vertus alchimiques.' },
  { slug: 'minerals', label: 'Minéraux',   blurb: 'Cristaux, métaux et pierres chargés d’énergie.' },
  { slug: 'liquids',  label: 'Liquides',   blurb: 'Eaux, sèves et fluides employés comme bases ou réactifs.' },
  { slug: 'remains',  label: 'Dépouilles', blurb: 'Organes, crocs et matières prélevés sur les créatures.' },
] as const;

@Component({
  selector: 'app-natural-resources',
  imports: [RouterLink, Navbar],
  templateUrl: './natural-resources.html',
  styleUrl: './natural-resources.css',
})
export class NaturalResources {
  private loader = inject(WikiLoaderService);

  /** Une section par catégorie, chaque liste chargée depuis son index.json. */
  readonly categories = CATEGORY_META.map(meta => ({
    ...meta,
    entries: toSignal(
      this.loader
        .loadAll<ResourceIndexEntry>(`natural-resources/${meta.slug}`)
        .pipe(catchError(() => of([] as ResourceIndexEntry[]))),
      { initialValue: [] as ResourceIndexEntry[] },
    ),
  }));
}
