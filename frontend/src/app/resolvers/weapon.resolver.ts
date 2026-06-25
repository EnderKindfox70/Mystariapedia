import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { WikiLoaderService } from '../services/wiki-loader-service';
import { ArmorEntry, WeaponEntry } from '../wiki.types';

export const weaponResolver: ResolveFn<WeaponEntry | ArmorEntry> = (route) => {
  const category = route.paramMap.get('category')!; // 'melee' | 'ranged' | 'armor'
  const slug = route.paramMap.get('slug')!;
  return inject(WikiLoaderService).load<WeaponEntry | ArmorEntry>(
    `weapons/${category}`,
    slug,
  );
};
