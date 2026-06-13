import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { WikiLoaderService } from '../services/wiki-loader-service';
import { PotionEntry } from '../wiki.types';

export const potionResolver: ResolveFn<PotionEntry> = (route) => {
  const slug = route.paramMap.get('slug')!;
  return inject(WikiLoaderService).load<PotionEntry>('potions', slug);
};
