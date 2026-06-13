import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { WikiLoaderService } from '../services/wiki-loader-service';
import { DomainEntry } from '../wiki.types';

export const domainResolver: ResolveFn<DomainEntry> = (route) => {
  const slug = route.paramMap.get('domain')!;
  return inject(WikiLoaderService).load<DomainEntry>('domains', slug);
};
