import { Component, inject, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/internal/operators/switchMap';
import { CrossRef, ResourceEntry } from '../../wiki.types';
import { WikiLinkPipe } from '../../pipes/wiki-link-pipe';
import { Navbar } from '../../components/navbar/navbar';
import { PotionUsageService } from '../../services/potion-usage-service';

/** Libellés d'affichage par catégorie de ressource. */
const CATEGORY_LABELS: Record<string, string> = {
  flora: 'Flore',
  minerals: 'Minéraux',
  liquids: 'Liquides',
  remains: 'Dépouilles',
};

/** Libellé du groupe « Utilisé dans » (dérivé automatiquement, jamais saisi à la main). */
const USED_IN_LABEL = 'Utilisé dans';

@Component({
  selector: 'resource-entry',
  imports: [RouterLink, WikiLinkPipe, Navbar],
  templateUrl: './resources-entries.html',
  styleUrl: './resources-entries.css',
})
export class ResourceEntryComponent {
  private route = inject(ActivatedRoute);
  private potionUsage = inject(PotionUsageService);

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

  readonly usedInLabel = USED_IN_LABEL;
}
