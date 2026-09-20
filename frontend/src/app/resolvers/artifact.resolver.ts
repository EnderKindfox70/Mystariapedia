import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { WikiLoaderService } from '../services/wiki-loader-service';
import { ResourceEntry } from '../wiki.types';

/**
 * Fiche d'artefact. La collection est rangée par dossier de complexité
 * (`simple` | `complex` | `soul`), qui vient du segment `:category` de l'URL.
 */
export const artifactResolver: ResolveFn<ResourceEntry> = (route) => {
  const category = route.paramMap.get('category')!;
  const slug = route.paramMap.get('slug')!;
  return inject(WikiLoaderService).load<ResourceEntry>(`artifacts/${category}`, slug);
};
