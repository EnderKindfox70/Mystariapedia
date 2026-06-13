import { Component, inject, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/internal/operators/switchMap';
import { DomainCombination, DomainEntry } from '../../wiki.types';
import { WikiLinkPipe } from '../../pipes/wiki-link-pipe';
import { Navbar } from '../../components/navbar/navbar';
import { DomainCombinationsService } from '../../services/domain-combinations-service';

const DOMAINS = [
  { slug: 'fire',        label: 'Feu',      sigil: '♨' },
  { slug: 'water',       label: 'Eau',      sigil: '≋' },
  { slug: 'earth',       label: 'Terre',    sigil: '△' },
  { slug: 'air',         label: 'Air',      sigil: '☲' },
  { slug: 'electricity', label: 'Foudre',   sigil: 'ϟ' },
  { slug: 'plant',       label: 'Plantes',  sigil: '✥' },
  { slug: 'light',       label: 'Lumière',  sigil: '☼' },
  { slug: 'darkness',    label: 'Ténèbres', sigil: '◉' },
  { slug: 'life',        label: 'Vie',      sigil: '♧' },
  { slug: 'death',       label: 'Mort',     sigil: '☠' },
  { slug: 'time',        label: 'Temps',    sigil: '⌛' },
  { slug: 'space',       label: 'Espace',   sigil: '✧' },
] as const;

@Component({
  selector: 'domain-entry',
  imports: [RouterLink, WikiLinkPipe, Navbar],
  templateUrl: './domains-entries.html',
  styleUrl: './domains-entries.css',
})
export class DomainEntryComponent {
  private route = inject(ActivatedRoute);
  private combinationsService = inject(DomainCombinationsService);

  private routeData  = toSignal(this.route.data,     { requireSync: true });
  private paramMap   = toSignal(this.route.paramMap, { requireSync: true });

  entry      = computed(() => this.routeData()['entry'] as DomainEntry);
  domainSlug = computed(() => this.paramMap().get('domain') ?? '');

  /** Combinaisons impliquant ce domaine, dérivées de la source unique. */
  combinations = toSignal(
    this.route.paramMap.pipe(
      switchMap(pm => this.combinationsService.forDomain(pm.get('domain') ?? ''))
    ),
    { initialValue: [] as DomainCombination[] }
  );

  private currentIndex = computed(() =>
    DOMAINS.findIndex(d => d.slug === this.domainSlug())
  );

  prevDomain = computed(() => {
    const i = this.currentIndex();
    return DOMAINS[(i - 1 + DOMAINS.length) % DOMAINS.length];
  });

  nextDomain = computed(() => {
    const i = this.currentIndex();
    return DOMAINS[(i + 1) % DOMAINS.length];
  });

  crossRefSections = computed(() => [
    { label: 'Artefacts & Objets magiques', items: this.entry()['magic-items-and-artifacts'] ?? [] },
    { label: 'Faune',                        items: this.entry().fauna ?? [] },
    { label: 'Flore',                        items: this.entry().flora ?? [] },
  ]);
}
