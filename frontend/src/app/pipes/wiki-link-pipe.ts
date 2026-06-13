import { Pipe, PipeTransform } from '@angular/core';
import { CrossRef } from '../wiki.types';

@Pipe({ name: 'wikiLink' })
export class WikiLinkPipe implements PipeTransform {
  transform(ref: CrossRef): string[] {
    // Destination par type de page. Ajouter un nouveau lien = 1 ligne ici.
    const paths: Record<string, string> = {
      domains: '/magics',
      bestiary: '/bestiary',
      artifacts: '/artifacts',
      potions: '/alchemy',
      rituals: '/alchemy',
      locations: '/locations',
      factions: '/factions',
      'resources/fauna': '/bestiary',
      'resources/flora': '/resources/flora',
      'resources/minerals': '/resources/minerals',
      'resources/liquids': '/resources/liquids',
      'resources/remains': '/resources/remains',
    };
    const base = paths[ref.collection] ?? '/';
    return [base, ref.ref];
  }
}
