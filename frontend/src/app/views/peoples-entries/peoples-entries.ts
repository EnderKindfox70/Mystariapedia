import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/internal/operators/catchError';
import { of } from 'rxjs/internal/observable/of';
import { Navbar } from '../../components/navbar/navbar';
import { WikiLinkPipe } from '../../pipes/wiki-link-pipe';
import { WikiLoaderService } from '../../services/wiki-loader-service';
import { PeopleEntry } from '../../wiki.types';
import { CatalogTrait, RaceDef, StatKV } from '../../character/character.types';
import { traitsGrantedBy } from '../../character/universe-data';
import { STATS } from '../../character/universe-data';
import { PEOPLES, peopleColor, peopleRaceKey, peopleSigil } from '../../peoples.catalog';
import {
  domainColor as domainColorOf,
  domainIcon as domainIconOf,
  domainLabel as domainLabelOf,
  domainSigil as domainSigilOf,
} from '../../domains.catalog';

/** Ordre et libellés FR des six attributs (races.json utilise des clés anglaises). */
const ATTR_ORDER = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
const ATTR_LABEL: Record<string, string> = {
  strength: 'Force',
  dexterity: 'Dextérité',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Sagesse',
  charisma: 'Charisme',
};

/** Libellés FR des stats de départ (hp, mana, atk_phy…), réutilisés de l'univers. */
const STAT_LABEL = new Map<string, string>(STATS.map((s) => [s.key, s.label]));

/** Une valeur affichée sur la fiche JDR : libellé + valeur signée. */
interface KeyedValue {
  key: string;
  label: string;
  value: number;
}

@Component({
  selector: 'people-entry',
  imports: [RouterLink, WikiLinkPipe, Navbar],
  templateUrl: './peoples-entries.html',
  styleUrl: './peoples-entries.css',
})
export class PeopleEntryComponent {
  private route = inject(ActivatedRoute);
  private wiki = inject(WikiLoaderService);

  private routeData = toSignal(this.route.data, { requireSync: true });
  private paramMap = toSignal(this.route.paramMap, { requireSync: true });

  entry = computed(() => this.routeData()['entry'] as PeopleEntry);
  slug = computed(() => this.paramMap().get('slug') ?? '');

  /** Couleur et emblème d'accent du peuple courant (catalogue). */
  color = computed(() => peopleColor(this.slug()));
  sigil = computed(() => peopleSigil(this.slug()));

  /**
   * Données de jeu du peuple, tirées de la source unique characters/races.json
   * (attributs, sous-races, traits mécaniques, stats de départ).
   */
  private races = toSignal(
    this.wiki.load<RaceDef[]>('characters', 'races').pipe(catchError(() => of([] as RaceDef[]))),
    { initialValue: [] as RaceDef[] },
  );
  /**
   * Aptitudes accordées par une race ou une sous-race. Elles ne sont plus
   * écrites dans `races.json` : le catalogue `trait.json` déclare, trait par
   * trait, qui l'accorde. On lit donc le catalogue par référence.
   */
  raceTraits(raceKey: string | undefined): CatalogTrait[] {
    return raceKey ? traitsGrantedBy([`race:${raceKey}`]) : [];
  }

  subraceTraits(subraceKey: string | undefined): CatalogTrait[] {
    return subraceKey ? traitsGrantedBy([`subrace:${subraceKey}`]) : [];
  }

  race = computed(() => {
    const key = peopleRaceKey(this.slug());
    return this.races().find((r) => r.key === key);
  });

  /** Modificateurs d'attributs non nuls, dans l'ordre canonique, libellés en FR. */
  attrMods = (attrs?: StatKV[]): KeyedValue[] => {
    if (!attrs) return [];
    return ATTR_ORDER.map((k) => ({
      key: k,
      label: ATTR_LABEL[k],
      value: attrs.find((a) => a.key === k)?.value ?? 0,
    })).filter((a) => a.value !== 0);
  };

  /** Stats de départ (genetics-stats) libellées en FR. */
  genetics = (stats?: StatKV[]): KeyedValue[] =>
    (stats ?? []).map((s) => ({ key: s.key, label: STAT_LABEL.get(s.key) ?? s.key, value: s.value }));

  /** Libellé FR d'une stat d'effet (def_phy, atk_mag…). */
  statLabel = (key: string): string => STAT_LABEL.get(key) ?? key;

  /** Formate une valeur signée (+1, -2). */
  signed = (value: number): string => (value > 0 ? `+${value}` : `${value}`);

  /* ── Helpers domaine pour les affinités magiques (lien vers /magics) ── */
  domainLabel = (slug: string): string => domainLabelOf(slug);
  domainColor = (slug: string): string => domainColorOf(slug);
  domainIcon = (slug: string): string => domainIconOf(slug);
  domainSigil = (slug: string): string => domainSigilOf(slug);

  private currentIndex = computed(() => PEOPLES.findIndex((p) => p.slug === this.slug()));

  prevPeople = computed(() => {
    const i = this.currentIndex();
    return PEOPLES[(i - 1 + PEOPLES.length) % PEOPLES.length];
  });

  nextPeople = computed(() => {
    const i = this.currentIndex();
    return PEOPLES[(i + 1) % PEOPLES.length];
  });
}
