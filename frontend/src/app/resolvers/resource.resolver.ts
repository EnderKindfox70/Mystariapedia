import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { WikiLoaderService } from '../services/wiki-loader-service';
import { ResourceEntry } from '../wiki.types';

export const resourceResolver: ResolveFn<ResourceEntry> = (route) => {
  const category = route.paramMap.get('category')!; // 'flora' | 'minerals'
  const slug = route.paramMap.get('slug')!;
  return inject(WikiLoaderService).load<ResourceEntry>(
    `natural-resources/${category}`,
    slug,
  );
};
