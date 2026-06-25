import { Component, inject, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/internal/operators/switchMap';
import { map } from 'rxjs/internal/operators/map';
import { catchError } from 'rxjs/internal/operators/catchError';
import { forkJoin } from 'rxjs/internal/observable/forkJoin';
import { of } from 'rxjs/internal/observable/of';
import { PotionEntry, PotionIngredient, ResourceIndexEntry, WikiCollection } from '../../wiki.types';
import { WikiLinkPipe } from '../../pipes/wiki-link-pipe';
import { Navbar } from '../../components/navbar/navbar';
import { WikiLoaderService } from '../../services/wiki-loader-service';

/** Collection d'un CrossRef → dossier JSON réel (resources/* vit sous natural-resources/*). */
function jsonCollection(collection: string): string {
  return collection.startsWith('resources/')
    ? collection.replace('resources/', 'natural-resources/')
    : collection;
}

@Component({
  selector: 'potion-entry',
  imports: [RouterLink, WikiLinkPipe, Navbar],
  templateUrl: './potions-entries.html',
  styleUrl: './potions-entries.css',
})
export class PotionEntryComponent {
  private route = inject(ActivatedRoute);
  private loader = inject(WikiLoaderService);

  private routeData = toSignal(this.route.data, { requireSync: true });

  entry = computed(() => this.routeData()['entry'] as PotionEntry);

  /**
   * Étapes normalisées pour l'affichage : les étapes facultatives ne sont pas
   * numérotées et la numérotation des étapes standard reste continue.
   */
  steps = computed(() => {
    let n = 0;
    return this.entry().preparation.map((step) => {
      const optional = typeof step !== 'string' && !!step.optional;
      const text = typeof step === 'string' ? step : step.text;
      return { text, optional, num: optional ? null : ++n };
    });
  });

  /**
   * Images des ingrédients résolues depuis les fiches ressources liées.
   * Clé : `${collection}/${slug}` du CrossRef ; valeur : chemin de l'image.
   */
  private ingredientImages = toSignal(
    this.route.data.pipe(
      switchMap((data) => {
        const entry = data['entry'] as PotionEntry;
        const collections = [
          ...new Set(
            entry.ingredients
              .map((ing) => ing.ref?.collection)
              .filter((c): c is WikiCollection => !!c),
          ),
        ];
        if (!collections.length) return of(new Map<string, string>());

        return forkJoin(
          collections.map((c) =>
            this.loader
              .loadAll<ResourceIndexEntry>(jsonCollection(c))
              .pipe(catchError(() => of([] as ResourceIndexEntry[]))),
          ),
        ).pipe(
          map((lists) => {
            const images = new Map<string, string>();
            lists.forEach((list, i) => {
              for (const item of list) {
                if (item.image) images.set(`${collections[i]}/${item.slug}`, item.image);
              }
            });
            return images;
          }),
        );
      }),
    ),
    { initialValue: new Map<string, string>() },
  );

  /** Image à afficher pour un ingrédient : `icon` explicite, sinon celle de la ressource liée. */
  ingredientImage(ing: PotionIngredient): string | undefined {
    if (ing.icon) return ing.icon;
    if (!ing.ref) return undefined;
    return this.ingredientImages().get(`${ing.ref.collection}/${ing.ref.ref}`);
  }
}
