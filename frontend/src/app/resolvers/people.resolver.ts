import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { WikiLoaderService } from '../services/wiki-loader-service';
import { PeopleEntry } from '../wiki.types';

export const peopleResolver: ResolveFn<PeopleEntry> = (route) => {
  const slug = route.paramMap.get('slug')!;
  return inject(WikiLoaderService).load<PeopleEntry>('peoples', slug);
};
