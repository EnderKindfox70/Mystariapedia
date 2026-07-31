import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/internal/operators/catchError';
import { of } from 'rxjs/internal/observable/of';
import { Navbar } from '../../components/navbar/navbar';
import { WikiLoaderService } from '../../services/wiki-loader-service';
import { ResourceIndexEntry } from '../../wiki.types';

/** Métadonnées d'affichage d'une section de la page. */
interface CategoryMeta {
  slug: string;
  label: string;
  blurb: string;
  /**
   * Section de repli, qui recueille les fiches sans catégorie connue. Filet de
   * sécurité plutôt que rubrique promise : elle disparaît quand elle est vide.
   */
  fallback?: boolean;
}

/** Sections de la page. Ajouter une catégorie = 1 entrée ici. */
const CATEGORY_META: readonly CategoryMeta[] = [
  { slug: 'sacs',     label: 'Sacs & portage',          blurb: "Ce qui porte tout le reste : capacité, allègement et accès rapide au matériel qu'on ne peut pas chercher au fond d'un sac." },
  { slug: 'lumiere',  label: 'Lumière & feu',           blurb: "Voir, allumer, brûler. Sous terre, la lumière n'est pas un confort : c'est une ressource qui se consomme et qui se compte." },
  { slug: 'escalade', label: 'Cordes & franchissement', blurb: "Descendre, remonter, passer de l'autre côté : le matériel qui transforme un obstacle infranchissable en simple détour." },
  { slug: 'camp',     label: 'Camp & survie',           blurb: "Manger, boire, dormir à l'abri. C'est ce qui décide si un repos rend vraiment des forces." },
  { slug: 'recolte',  label: 'Récolte & terrain',       blurb: "L'outillage de l'herboriste et du chasseur de reliques : récolter proprement, conserver, transporter sans danger." },
  { slug: 'chasse',   label: 'Chasse & contention',     blurb: "Prendre vivant, retenir, ouvrir ce qui est fermé : le matériel de qui a besoin d'une créature entière ou d'une porte franchie." },
  { slug: 'soins',    label: 'Soins',                   blurb: "Matériel de premiers secours, sans une goutte d'alchimie : de la toile propre, des herbes et un geste sûr." },
  { slug: 'erudition', label: 'Érudition & mesure',     blurb: "Écrire, relever, calculer. Ce qui transforme ce qu'on a vu en ce que d'autres sauront, et une position en un point sur une carte." },
  { slug: 'insignes', label: 'Insignes & papiers',      blurb: "Ce qui parle à votre place : un anneau, un sceau, un papier. Aucune valeur au combat, décisif partout ailleurs." },
  { slug: 'outils',   label: 'Outils & matériel divers', blurb: "Le reste du sac : ce qui ne se range dans aucune catégorie et qui sauve pourtant la journée.", fallback: true },
];

/** Catégorie de repli d'une fiche qui n'en déclare pas. */
const DEFAULT_CATEGORY = 'outils';

@Component({
  selector: 'app-equipment',
  imports: [RouterLink, Navbar],
  templateUrl: './equipment.html',
  // Même mise en page d'index que les ressources naturelles : on partage la
  // feuille plutôt que d'en dupliquer une copie qui divergerait.
  styleUrl: '../natural-resources/natural-resources.css',
})
export class Equipment {
  private loader = inject(WikiLoaderService);

  /** Slugs dont l'image n'a pas pu se charger → repli sur le glyphe. */
  readonly broken = new Set<string>();

  /** Catalogue complet des fiches, chargé depuis equipment/index.json. */
  private readonly all = toSignal(
    this.loader
      .loadAll<ResourceIndexEntry>('equipment')
      .pipe(catchError(() => of([] as ResourceIndexEntry[]))),
    { initialValue: [] as ResourceIndexEntry[] },
  );

  /** Une section par catégorie, filtrée depuis le catalogue. */
  readonly categories = CATEGORY_META.map((meta) => ({
    ...meta,
    cards: computed(() =>
      this.all().filter((e) => (e.category ?? DEFAULT_CATEGORY) === meta.slug),
    ),
  }));
}
