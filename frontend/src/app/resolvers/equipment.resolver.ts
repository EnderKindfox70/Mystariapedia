import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { WikiLoaderService } from '../services/wiki-loader-service';
import { ResourceEntry } from '../wiki.types';

/**
 * Fiche d'équipement (corde, bandages…). La collection est plate : les
 * catégories d'affichage viennent du champ `category` de la fiche, pas du chemin.
 */
export const equipmentResolver: ResolveFn<ResourceEntry> = (route) => {
  const slug = route.paramMap.get('slug')!;
  return inject(WikiLoaderService).load<ResourceEntry>('equipment', slug);
};
