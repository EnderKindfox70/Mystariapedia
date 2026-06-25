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
  { slug: 'melee',      label: 'Armes de mêlée',          blurb: "Lames, masses et hampes forgées pour le combat rapproché." },
  { slug: 'ranged',     label: 'Armes à distance',        blurb: "Arcs, arbalètes et engins de jet qui frappent de loin." },
  { slug: 'ammunition', label: 'Projectiles & munitions', blurb: "Flèches, carreaux et billes : ce que crachent les armes à distance." },
  { slug: 'armor',      label: 'Armures & vêtements',     blurb: "De la cotte de mailles aux simples tenues, ce qui se porte sur le corps." },
  { slug: 'shield',     label: 'Boucliers',               blurb: "Pavois, rondaches et targes pour parer coups et projectiles." },
] as const;

@Component({
  selector: 'app-weapons',
  imports: [RouterLink, Navbar],
  templateUrl: './weapons.html',
  styleUrl: './weapons.css',
})
export class Weapons {
  private loader = inject(WikiLoaderService);

  /** Slugs dont l'image n'a pas pu se charger → repli sur le glyphe. */
  readonly broken = new Set<string>();

  /** Une section par catégorie, chaque liste chargée depuis son index.json. */
  readonly categories = CATEGORY_META.map(meta => ({
    ...meta,
    entries: toSignal(
      this.loader
        .loadAll<ResourceIndexEntry>(`weapons/${meta.slug}`)
        .pipe(catchError(() => of([] as ResourceIndexEntry[]))),
      { initialValue: [] as ResourceIndexEntry[] },
    ),
  }));
}
