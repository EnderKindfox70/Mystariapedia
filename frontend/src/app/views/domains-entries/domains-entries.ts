import { Component, inject, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/internal/operators/switchMap';
import { DomainCombination, DomainEntry, DomainSpellEntry } from '../../wiki.types';
import { WikiLinkPipe } from '../../pipes/wiki-link-pipe';
import { Navbar } from '../../components/navbar/navbar';
import { DomainCombinationsService } from '../../services/domain-combinations-service';

const DOMAINS = [
  { slug: 'fire',        label: 'Feu',      sigil: '♨', color: '#b8482b' },
  { slug: 'water',       label: 'Eau',      sigil: '≋', color: '#3d79a8' },
  { slug: 'earth',       label: 'Terre',    sigil: '△', color: '#9a7440' },
  { slug: 'air',         label: 'Air',      sigil: '☲', color: '#8fb8aa' },
  { slug: 'electricity', label: 'Foudre',   sigil: 'ϟ', color: '#d6a736' },
  { slug: 'plant',       label: 'Plantes',  sigil: '✥', color: '#6f8f3d' },
  { slug: 'light',       label: 'Lumière',  sigil: '☼', color: '#d8c17a' },
  { slug: 'darkness',    label: 'Ténèbres', sigil: '◉', color: '#7f559b' },
  { slug: 'life',        label: 'Vie',      sigil: '♧', color: '#77a356' },
  { slug: 'death',       label: 'Mort',     sigil: '☠', color: '#3a3632' },
  { slug: 'time',        label: 'Temps',    sigil: '⌛', color: '#9b79ad' },
  { slug: 'space',       label: 'Espace',   sigil: '✧', color: '#68a9b3' },
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

  /**
   * Combinaisons impliquant ce domaine, dérivées de la source unique.
   * Une combinaison sans `name` est une combinaison « basique » : un sort
   * orphelin croisant des sous-domaines, affiché sans titre de combinaison.
   */
  private domainCombinations = toSignal(
    this.route.paramMap.pipe(
      switchMap(pm => this.combinationsService.forDomain(pm.get('domain') ?? ''))
    ),
    { initialValue: [] as DomainCombination[] }
  );

  /** Combinaisons triées par niveau de déblocage de leur sort. */
  combinations = computed(() =>
    [...this.domainCombinations()].sort(
      (a, b) => (a.spells?.[0]?.level ?? 0) - (b.spells?.[0]?.level ?? 0)
    )
  );

  /** Combinaisons nommées : des sous-domaines fusionnés (un concept + ses sorts). */
  namedCombinations = computed(() =>
    this.combinations().filter(c => c.name.trim().length > 0)
  );

  /** Combinaisons sans nom : de simples sorts « standalone » croisant des sous-domaines. */
  standaloneCombinations = computed(() =>
    this.combinations().filter(c => c.name.trim().length === 0)
  );

  /** Sorts du domaine triés par niveau de déblocage. */
  spells = computed(() =>
    [...(this.entry().spells ?? [])].sort((a, b) => a.level - b.level)
  );

  /** Sous-domaine sélectionné via le panneau « Aspects » (filtre le tableau de sorts). */
  selectedAspect = signal<string | null>(null);

  toggleAspect(name: string): void {
    this.selectedAspect.update(cur => (cur === name ? null : name));
  }

  /**
   * Sorts groupés par leur sous-domaine réel (un sort apparaît sous chaque
   * sous-domaine auquel il appartient), triés par niveau. Les sorts sans
   * sous-domaine (ex. Temps) forment un groupe sans titre.
   */
  spellGroups = computed<{ label: string; spells: DomainSpellEntry[] }[]>(() => {
    const entry = this.entry();
    const spells = this.spells();
    const groups = (entry.subdomains ?? [])
      .map(sub => ({
        label: sub.name,
        spells: spells.filter(sp => sp.subdomains.includes(sub.name)),
      }))
      .filter(g => g.spells.length > 0);
    const noSub = spells.filter(sp => sp.subdomains.length === 0);
    if (noSub.length) groups.push({ label: '', spells: noSub });
    return groups;
  });

  private DOMAIN_BY_SLUG = new Map<string, (typeof DOMAINS)[number]>(
    DOMAINS.map(d => [d.slug, d])
  );
  domainSigil = (slug: string): string => this.DOMAIN_BY_SLUG.get(slug)?.sigil ?? '◇';
  domainLabel = (slug: string): string => this.DOMAIN_BY_SLUG.get(slug)?.label ?? slug;
  domainColor = (slug: string): string => this.DOMAIN_BY_SLUG.get(slug)?.color ?? '#8b6b2f';

  /** Dégradé de ruban mêlant les couleurs des domaines composants (assombri pour le texte). */
  comboGradient(components: readonly string[]): string {
    const stops = components.map(c => this.domainColor(c)).join(', ');
    return (
      'linear-gradient(180deg, rgba(10, 8, 7, .34), rgba(10, 8, 7, .5)),' +
      `linear-gradient(100deg, ${stops})`
    );
  }

  /** Sigil du domaine courant — sert d'emblème par défaut pour ses sorts. */
  currentSigil = computed(() => this.domainSigil(this.domainSlug()));

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
