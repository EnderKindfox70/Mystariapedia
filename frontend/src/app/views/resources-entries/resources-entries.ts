import { Component, inject, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/internal/operators/switchMap';
import { catchError } from 'rxjs/internal/operators/catchError';
import { of } from 'rxjs/internal/observable/of';
import { CrossRef, ResourceEntry, ResourceIndexEntry } from '../../wiki.types';
import { WikiLinkPipe } from '../../pipes/wiki-link-pipe';
import { Navbar } from '../../components/navbar/navbar';
import { PotionUsageService } from '../../services/potion-usage-service';
import { WikiLoaderService } from '../../services/wiki-loader-service';

/** Libellés d'affichage par catégorie de ressource. */
const CATEGORY_LABELS: Record<string, string> = {
  flora: 'Flore',
  minerals: 'Minéraux',
  liquids: 'Liquides',
  remains: 'Dépouilles',
};

/** Libellé du groupe « Utilisé dans » (dérivé automatiquement, jamais saisi à la main). */
const USED_IN_LABEL = 'Utilisé dans';

/** Référence « Utilisé dans » enrichie des métadonnées de la cible (pour les cards). */
export interface UsedInCard extends CrossRef {
  image?: string;
  subtitle?: string;
  rarity?: string;
}

@Component({
  selector: 'resource-entry',
  imports: [RouterLink, WikiLinkPipe, Navbar],
  templateUrl: './resources-entries.html',
  styleUrl: './resources-entries.css',
})
export class ResourceEntryComponent {
  private route = inject(ActivatedRoute);
  private potionUsage = inject(PotionUsageService);
  private loader = inject(WikiLoaderService);

  private routeData = toSignal(this.route.data, { requireSync: true });
  private paramMap = toSignal(this.route.paramMap, { requireSync: true });

  entry = computed(() => this.routeData()['entry'] as ResourceEntry);
  category = computed(() => this.paramMap().get('category') ?? '');
  categoryLabel = computed(() => CATEGORY_LABELS[this.category()] ?? 'Ressources');

  /** Groupes de références saisis à la main, hors « Utilisé dans » (désormais dérivé). */
  referenceGroups = computed(() =>
    (this.entry().references ?? []).filter(
      (g) =>
        g?.items?.length &&
        (g.label ?? '').trim().toLowerCase() !== USED_IN_LABEL.toLowerCase(),
    ),
  );

  /** « Utilisé dans » dérivé : les potions employant cette ressource comme ingrédient. */
  usedIn = toSignal(
    this.route.paramMap.pipe(
      switchMap((pm) =>
        this.potionUsage.forResource(
          `resources/${pm.get('category')}`,
          pm.get('slug') ?? '',
        ),
      ),
    ),
    { initialValue: [] as CrossRef[] },
  );

  /** Index des potions, pour enrichir les références « Utilisé dans » en cards illustrées. */
  private potionsIndex = toSignal(
    this.loader
      .loadAll<ResourceIndexEntry>('potions')
      .pipe(catchError(() => of([] as ResourceIndexEntry[]))),
    { initialValue: [] as ResourceIndexEntry[] },
  );

  /** « Utilisé dans » sous forme de cards : chaque potion jointe à ses métadonnées d'index. */
  usedInCards = computed<UsedInCard[]>(() => {
    const meta = new Map(this.potionsIndex().map((e) => [e.slug, e]));
    return this.usedIn().map((ref) => {
      const m = ref.collection === 'potions' ? meta.get(ref.ref) : undefined;
      return { ...ref, image: m?.image, subtitle: m?.subtitle, rarity: m?.rarity };
    });
  });

  readonly usedInLabel = USED_IN_LABEL;
}
