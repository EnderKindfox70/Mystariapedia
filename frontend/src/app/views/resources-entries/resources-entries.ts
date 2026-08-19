import { Component, inject, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/internal/operators/switchMap';
import { catchError } from 'rxjs/internal/operators/catchError';
import { of } from 'rxjs/internal/observable/of';
import { ResourceInfoField, CrossRef, ResourceEntry, ResourceIndexEntry } from '../../wiki.types';
import { WikiLinkPipe } from '../../pipes/wiki-link-pipe';
import { Navbar } from '../../components/navbar/navbar';
import { PotionUsageService } from '../../services/potion-usage-service';
import { WikiLoaderService } from '../../services/wiki-loader-service';
import { compositionLabel } from '../../combat/materials';

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

  /**
   * La bande de caractéristiques, composition comprise.
   *
   * Elle est AJOUTÉE au rendu plutôt que recopiée dans le JSON de chaque fiche :
   * la matière est déjà déclarée une fois, sur `material`, et la dupliquer dans
   * `info` aurait créé deux vérités qui finiraient par diverger.
   */
  infoFields = computed<ResourceInfoField[]>(() => {
    const base = this.entry().info;
    const composition = compositionLabel(this.entry().material);
    return composition
      ? [...base, { key: 'material', label: 'Composition', value: composition }]
      : [...base];
  });


  /**
   * Catégorie de la fiche : segment d'URL pour les ressources naturelles
   * (/resources/:category/:slug), sinon valeur fixe donnée par la route (`data`)
   * pour les collections plates qui réutilisent cette vue (équipement…).
   */
  category = computed(
    () => this.paramMap().get('category') ?? (this.routeData()['category'] as string) ?? '',
  );

  categoryLabel = computed(
    () =>
      (this.routeData()['categoryLabel'] as string) ??
      CATEGORY_LABELS[this.category()] ??
      'Ressources',
  );

  /** Page d'index vers laquelle renvoie le lien de retour. */
  indexLink = computed(() => (this.routeData()['indexLink'] as string) ?? '/resources');

  /** Libellé du lien de retour (accord variable selon la collection). */
  backLabel = computed(
    () => (this.routeData()['backLabel'] as string) ?? `Retour à la ${this.categoryLabel()}`,
  );

  /** Groupes de références saisis à la main, hors « Utilisé dans » (désormais dérivé). */
  referenceGroups = computed(() =>
    (this.entry().references ?? []).filter(
      (g) =>
        g?.items?.length &&
        (g.label ?? '').trim().toLowerCase() !== USED_IN_LABEL.toLowerCase(),
    ),
  );

  /**
   * Clé de collection sous laquelle les potions référencent cette fiche
   * (cf. `collection` des CrossRef d'ingrédients) : `resources/<catégorie>` pour
   * une ressource naturelle, le nom de la collection pour les collections plates.
   */
  private usageCollection = computed(() => {
    const routeCategory = this.paramMap().get('category');
    return routeCategory ? `resources/${routeCategory}` : this.category();
  });

  /** « Utilisé dans » dérivé : les potions employant cette ressource comme ingrédient. */
  usedIn = toSignal(
    this.route.paramMap.pipe(
      switchMap((pm) =>
        this.potionUsage.forResource(this.usageCollection(), pm.get('slug') ?? ''),
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
