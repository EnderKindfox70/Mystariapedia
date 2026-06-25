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
  { slug: 'simple',  label: 'Objet magique simple',   blurb: "Objets enchantés d'une seule fonction, issus d'un enchantement courant." },
  { slug: 'complex', label: 'Objet magique complexe',  blurb: "Mécanismes magiques aux effets multiples ou conditionnels, œuvres de maîtres." },
  { slug: 'soul',    label: 'Artefact à âme',          blurb: "Reliques dotées d'une conscience ou d'une volonté propre, uniques et imprévisibles." },
] as const;

@Component({
  selector: 'app-artifacts',
  imports: [RouterLink, Navbar],
  templateUrl: './artifacts.html',
  styleUrl: './artifacts.css',
})
export class Artifacts {
  private loader = inject(WikiLoaderService);

  /** Slugs dont l'image n'a pas pu se charger → repli sur le glyphe. */
  readonly broken = new Set<string>();

  /** Une section par catégorie, chaque liste chargée depuis son index.json. */
  readonly categories = CATEGORY_META.map(meta => ({
    ...meta,
    entries: toSignal(
      this.loader
        .loadAll<ResourceIndexEntry>(`artifacts/${meta.slug}`)
        .pipe(catchError(() => of([] as ResourceIndexEntry[]))),
      { initialValue: [] as ResourceIndexEntry[] },
    ),
  }));
}
