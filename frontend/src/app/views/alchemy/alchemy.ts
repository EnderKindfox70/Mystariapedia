import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/internal/operators/catchError';
import { of } from 'rxjs/internal/observable/of';
import { Navbar } from '../../components/navbar/navbar';
import { WikiLoaderService } from '../../services/wiki-loader-service';
import { ResourceIndexEntry } from '../../wiki.types';

/** Métadonnées d'affichage d'une section. Ajouter une catégorie = 1 entrée ici. */
const CATEGORY_META = [
  { slug: 'potion',  label: 'Potions',  blurb: "Décoctions aux effets immédiats : soin, mana et altérations passagères du corps." },
  { slug: 'elixir',  label: 'Élixirs',  blurb: "Préparations rares et puissantes, souvent dangereuses, aux effets profonds et durables." },
  { slug: 'tonique', label: 'Toniques', blurb: "Remèdes et fortifiants à action lente, pris en cure pour renforcer le corps." },
] as const;

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

  /** Catalogue complet, chargé depuis potions/index.json. */
  private readonly all = toSignal(
    this.loader
      .loadAll<ResourceIndexEntry>('potions')
      .pipe(catchError(() => of([] as ResourceIndexEntry[]))),
    { initialValue: [] as ResourceIndexEntry[] },
  );

  /** Une section par catégorie, filtrée depuis le catalogue. */
  readonly categories = CATEGORY_META.map(meta => ({
    ...meta,
    entries: computed(() =>
      this.all().filter(p => (p.category ?? 'potion') === meta.slug),
    ),
  }));
}
