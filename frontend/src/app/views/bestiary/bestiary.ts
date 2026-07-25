import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, NavigationEnd, ParamMap, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs/internal/observable/of';
import { catchError } from 'rxjs/internal/operators/catchError';
import { filter } from 'rxjs/internal/operators/filter';
import { map } from 'rxjs/internal/operators/map';
import { startWith } from 'rxjs/internal/operators/startWith';
import { switchMap } from 'rxjs/internal/operators/switchMap';
import damageTypeCatalog from '../../../../public/resources/json/damage_type.json';
import entityTypeCatalog from '../../../../public/resources/json/entity_type.json';
import traitCatalog from '../../../../public/resources/json/trait.json';
import { abilityModifier, formatBonus } from '../../character/universe-data';
import { Navbar } from '../../components/navbar/navbar';
import { WikiLoaderService } from '../../services/wiki-loader-service';
import { BestiaryChapter, BestiaryEntry, BestiaryIndexEntry, BestiaryStatKey, CrossRef } from '../../wiki.types';

/** Durée du feuilletage. À garder synchro avec `--turn-duration` du CSS. */
const TURN_MS = 720;

/** Sous cette largeur, le livre passe en page simple et redevient scrollable. */
const NARROW_PX = 900;

export interface ChapterMeta {
  slug: BestiaryChapter;
  label: string;
  blurb: string;
  quote: string;
  glyph: string;
}

/** Ajouter un chapitre = une entrée ici + le `chapter` correspondant en JSON. */
const CHAPTERS: ChapterMeta[] = [
  {
    slug: 'communes',
    label: 'Especes communes',
    glyph: '☘',
    blurb:
      "Les bêtes que l'on croise sur les routes de Mystaria : dangereuses par le nombre plus que par nature.",
    quote: "« Ce qui est commun n'est pas ce qui est inoffensif. »",
  },
  {
    slug: 'rares',
    label: 'Especes rares',
    glyph: '✦',
    blurb:
      "Espèces dont l'existence est établie, mais dont les observations restent trop rares pour en tirer des règles.",
    quote: "« Trois témoignages concordants ne font pas encore une certitude. »",
  },
  {
    slug: 'legendaires',
    label: 'Creatures legendaires',
    glyph: '☄',
    blurb:
      "Un seul spécimen connu, parfois un seul récit. Ce qu'on en consigne tient autant du témoignage que de la rumeur.",
    quote: "« Nous les avons nommées. Ce fut notre première erreur. »",
  },
  {
    slug: 'entites',
    label: 'Entites anciennes',
    glyph: '☥',
    blurb:
      "Ce qui existait avant qu'on ait des mots pour le décrire, et qui n'a jamais eu besoin des nôtres.",
    quote: "« Elles ne dorment pas. Elles attendent, ce qui n'est pas la même chose. »",
  },
  {
    slug: 'mutations',
    label: 'Mutations',
    glyph: '❖',
    blurb:
      "Formes altérées par une saturation de mana. Aucune n'est stable, aucune n'est reproductible.",
    quote: "« La chair apprend plus vite que l'esprit. »",
  },
  {
    slug: 'archives',
    label: 'Archives disparues',
    glyph: '✝',
    blurb: "Espèces éteintes, ou effacées. Ce chapitre est incomplet, et le restera.",
    quote: "« Il ne reste que le nom, et parfois même plus. »",
  },
];

/** Libellés FR des clés de domaine portées par les pastilles. */
const DOMAIN_LABELS: Record<string, string> = {
  fire: 'Feu',
  water: 'Eau',
  earth: 'Terre',
  air: 'Air',
  electricity: 'Foudre',
  plant: 'Plantes',
  light: 'Lumière',
  darkness: 'Ténèbres',
  life: 'Vie',
  death: 'Mort',
  time: 'Temps',
  space: 'Espace',
};

/**
 * Libellés FR des types de dégâts, indexés par le nom du catalogue. Celui-ci
 * est en anglais : cette table est ce qui garde la fiche en français sans
 * cesser de tenir `damage_type.json` pour la source de vérité.
 */
const DAMAGE_LABELS: Record<string, string> = {
  bludgeoning: 'Contondant',
  piercing: 'Perforant',
  slashing: 'Tranchant',
  fire: 'Feu',
  ice: 'Glace',
  lightning: 'Foudre',
  water: 'Eau',
  earth: 'Terre',
  wind: 'Vent',
  plant: 'Plantes',
  dark: 'Ténèbres',
  light: 'Lumière',
  life: 'Vie',
  death: 'Mort',
  space: 'Espace',
  time: 'Temps',
};

/** Libellés FR des types d'entité, indexés par le nom du catalogue (anglais). */
const ENTITY_TYPE_LABELS: Record<string, string> = {
  bestial: 'Bestial',
  arcane: 'Arcane',
  undead: 'Mort-vivant',
  elemental: 'Élémentaire',
  construct: 'Créature artificielle',
  abberation: 'Aberration',
};

/** Les cinq stats de combat, dans l'ordre d'affichage, avec leur libellé FR. */
const STAT_ROWS: { key: BestiaryStatKey; label: string }[] = [
  { key: 'hp', label: 'Points de vie' },
  { key: 'physical_atk', label: 'Attaque physique' },
  { key: 'magical_atk', label: 'Attaque magique' },
  { key: 'mana', label: 'Mana' },
  { key: 'speed', label: 'Vitesse' },
];

/**
 * Échelle de menace : le `cr` d'une fiche est un indice dans ce tableau, pas
 * un nombre affiché. Le vocabulaire reprend celui du `threatLevel` de
 * `entity-card` (faible / modéré / élevé / oméga) pour que les deux lectures
 * de la dangerosité emploient les mêmes mots.
 */
const THREAT_LABELS = [
  'Inoffensif',
  'Faible',
  'Modéré',
  'Élevé',
  'Critique',
  'Oméga',
];

const AFFINITY_LABELS: Record<string, string> = {
  immunities: 'Immunités',
  resistances: 'Résistances',
  weaknesses: 'Faiblesses',
  absorptions: 'Absorptions',
};

/** Contenu d'un feuillet : le gabarit du template s'aiguille sur `kind`. */
type Folio =
  | { kind: 'chapter'; chapter: ChapterMeta }
  /** Une colonne du flux de vignettes d'un chapitre. */
  | { kind: 'index'; entries: BestiaryIndexEntry[]; column: number; columns: number }
  | { kind: 'colophon'; chapter: ChapterMeta }
  /** Une colonne de la fiche : `column` dit laquelle du flux on montre. */
  | { kind: 'detail'; entry: BestiaryEntry; column: number; columns: number }
  | { kind: 'entry-end'; entry: BestiaryEntry }
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'blank' };

interface Spread {
  left: Folio;
  right: Folio;
}

const BLANK_SPREAD: Spread = { left: { kind: 'blank' }, right: { kind: 'blank' } };

/** Une double page prête à afficher, avec le numéro de sa page de gauche. */
interface Placed {
  spread: Spread;
  /** Numéro de la page de gauche ; 0 pour un feuillet hors foliation. */
  firstPage: number;
}

/** Un feuillet prêt à afficher : son contenu et son numéro de page. */
interface Sheet {
  folio: Folio;
  no: number;
}

const leftOf = (p: Placed): Sheet => ({ folio: p.spread.left, no: p.firstPage });
const rightOf = (p: Placed): Sheet => ({
  folio: p.spread.right,
  no: p.firstPage ? p.firstPage + 1 : 0,
});

/** Une double page du livre, et où elle se trouve dans son chapitre. */
interface BookSpread {
  spread: Spread;
  chapter: ChapterMeta;
  local: number;
}

/**
 * Catalogues référençables par le butin. La clé est la `collection` d'un
 * CrossRef, qui est aussi le chemin de l'index JSON à charger. `route` est le
 * préfixe de la page de détail, ou `null` quand le catalogue n'en a pas encore
 * (les artefacts, p. ex., n'ont qu'une page-liste).
 */
const LOOT_COLLECTIONS: Record<string, { route: string | null }> = {
  'natural-resources/flora': { route: '/resources/flora' },
  'natural-resources/liquids': { route: '/resources/liquids' },
  'natural-resources/minerals': { route: '/resources/minerals' },
  'natural-resources/remains': { route: '/resources/remains' },
  'weapons/melee': { route: '/weapons/melee' },
  'weapons/ranged': { route: '/weapons/ranged' },
  'weapons/armor': { route: '/weapons/armor' },
  'weapons/shield': { route: '/weapons/shield' },
  'weapons/ammunition': { route: '/weapons/ammunition' },
  'artifacts/simple': { route: null },
  'artifacts/complex': { route: null },
  'artifacts/soul': { route: null },
};

/** Une ligne de butin prête à afficher : libellé résolu et lien éventuel. */
export interface LootRow {
  label: string;
  link: string[] | null;
}

/** « croc-de-loup » → « Croc de loup » : repli quand l'item n'est pas résolu. */
function humanizeSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

@Component({
  selector: 'app-bestiary',
  imports: [Navbar, RouterLink, NgTemplateOutlet],
  templateUrl: './bestiary.html',
  styleUrl: './bestiary.css',
})
export class Bestiary {
  private loader = inject(WikiLoaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroyRef = inject(DestroyRef);

  readonly chapters = CHAPTERS;
  readonly domainLabels = DOMAIN_LABELS;
  readonly affinityLabels = AFFINITY_LABELS;

  /** Slugs dont l'illustration a échoué → repli sur le glyphe. */
  readonly broken = new Set<string>();

  /**
   * Index d'items déjà chargés, par collection : `collection → (slug → nom)`.
   * Un `signal` pour que la résolution du butin se rafraîchisse quand un index
   * arrive après le premier rendu de la fiche.
   */
  private readonly itemNames = signal<Record<string, Record<string, string>>>({});
  /** Collections dont l'index est en cours de chargement (anti-doublon). */
  private readonly loadingItems = new Set<string>();

  private readonly traits = traitCatalog.traits;
  private readonly damageTypes = damageTypeCatalog.specific_damage_types;
  private readonly entityTypes = entityTypeCatalog.entity_types;

  /** Nom FR d'un type d'entité, résolu contre `entity_type.json`. */
  typeName(id: number | undefined): string {
    const type = this.entityTypes.find(t => t.id === id);
    return type ? ENTITY_TYPE_LABELS[type.name] ?? type.name : '?';
  }

  /**
   * Stats de combat affichées : base du type + bonus propre à la créature.
   * Rien n'est stocké côté fiche, tout se recompose ici, donc le tableau ne
   * peut pas diverger du catalogue quand celui-ci évolue.
   */
  statsOf(entry: BestiaryEntry): { label: string; value: number }[] {
    const base = this.entityTypes.find(t => t.id === entry.entityTypeId)?.stats;
    const bonuses = entry.statBonuses ?? {};
    return STAT_ROWS.map(row => ({
      label: row.label,
      value: (base?.[row.key] ?? 0) + (bonuses[row.key] ?? 0),
    }));
  }

  /**
   * Libellé de menace d'une créature. Une valeur hors de l'échelle est ramenée
   * à ses bornes plutôt que d'afficher un trou.
   */
  threatOf(cr: number | undefined): string {
    const index = Math.min(Math.max(Math.round(cr ?? 0), 0), THREAT_LABELS.length - 1);
    return THREAT_LABELS[index];
  }

  /** Modificateur affiché d'un score, dérivé par la formule commune au jeu. */
  modifierOf(value: number): string {
    return formatBonus(abilityModifier(value));
  }

  /**
   * Résout les ids d'un groupe d'affinités contre `damage_type.json` et rend
   * les libellés français. Un id inconnu est ignoré plutôt qu'affiché brut.
   */
  damageNames(ids: number[] | undefined): string[] {
    return (ids ?? [])
      .map(id => this.damageTypes.find(type => type.id === id))
      .filter(type => !!type)
      .map(type => DAMAGE_LABELS[type!.name] ?? type!.name);
  }

  /**
   * Résout le butin d'une fiche en lignes affichables. Le libellé vient de
   * l'index de l'item (chargé à la demande), à défaut du `label` écrit sur la
   * fiche, à défaut du slug humanisé — donc le butin reste lisible même quand
   * l'item n'existe pas encore. Le lien n'est posé que si le catalogue a une
   * page de détail.
   */
  lootRows(loot: CrossRef[] | undefined): LootRow[] {
    const names = this.itemNames();
    return (loot ?? []).map(item => {
      const known = LOOT_COLLECTIONS[item.collection];
      const resolved = names[item.collection]?.[item.ref];
      return {
        label: resolved ?? item.label ?? humanizeSlug(item.ref),
        link: known?.route ? [known.route, item.ref] : null,
      };
    });
  }

  /**
   * Charge, une seule fois par collection, l'index des items cités par le
   * butin de l'entrée, et le range dans `itemNames`. Appelé quand une fiche
   * s'affiche ; les collections déjà chargées ou inconnues sont ignorées.
   */
  private loadLootIndexes(entry: BestiaryEntry | null): void {
    for (const item of entry?.loot ?? []) {
      const col = item.collection;
      if (
        !(col in LOOT_COLLECTIONS) ||
        col in this.itemNames() ||
        this.loadingItems.has(col)
      ) {
        continue;
      }
      this.loadingItems.add(col);
      this.loader
        .loadAll<{ slug: string; name: string }>(col)
        .pipe(catchError(() => of([])))
        .subscribe(list => {
          const map: Record<string, string> = {};
          for (const it of list) map[it.slug] = it.name;
          this.itemNames.set({ ...this.itemNames(), [col]: map });
          this.loadingItems.delete(col);
        });
    }
  }

  /**
   * Résout les `traitIds` d'une fiche contre `trait.json`. Une méthode plutôt
   * qu'un `computed` : pendant un feuilletage, la feuille animée affiche
   * encore la fiche sortante, qui n'est plus celle du signal courant.
   */
  traitsOf(ids: number[] | undefined) {
    return (ids ?? [])
      .map(id => this.traits.find(trait => trait.id === id))
      .filter((trait): trait is (typeof traitCatalog.traits)[number] => !!trait);
  }

  /** Chapitre courant, piloté par l'URL. */
  readonly chapter = signal<ChapterMeta>(CHAPTERS[0]);
  /** Index de la double page courante dans l'index du chapitre. */
  readonly folio = signal(0);
  /** Index de la double page courante à l'intérieur d'une fiche. */
  readonly page = signal(0);
  /** Slug de la fiche ouverte, `null` quand on est sur l'index. */
  readonly slug = signal<string | null>(null);

  /**
   * Colonnes occupées par l'index de chaque chapitre, par slug. Tous les
   * chapitres sont mesurés, pas seulement celui qu'on lit : sans ça, on ne
   * saurait pas à quelle page commence le chapitre suivant, et la foliation ne
   * pourrait pas être continue d'un bout à l'autre du livre.
   */
  readonly chapterColumns = signal<Record<string, number>>({});

  /** Colonnes occupées par la fiche ouverte. */
  readonly detailColumns = signal(1);

  /** Sens du feuillet en cours d'animation. */
  readonly turning = signal<'next' | 'prev' | null>(null);
  /** Instantané de la double page sortante, figé le temps de l'animation. */
  readonly outgoing = signal<Placed | null>(null);

  private turnTimer?: ReturnType<typeof setTimeout>;
  /** N'anime pas le tout premier rendu (cas du lien profond). */
  private booted = false;

  private readonly all = toSignal(
    this.loader
      .loadAll<BestiaryIndexEntry>('bestiary')
      .pipe(catchError(() => of([] as BestiaryIndexEntry[]))),
    { initialValue: [] as BestiaryIndexEntry[] },
  );

  /** Fiche ouverte : `null` pendant le chargement, `'missing'` si absente. */
  private readonly loaded = toSignal<BestiaryEntry | 'missing' | null>(
    toObservable(this.slug).pipe(
      switchMap(slug =>
        slug
          ? this.loader
              .load<BestiaryEntry>('bestiary', slug)
              .pipe(catchError(() => of('missing' as const)))
          : of(null),
      ),
    ),
    { initialValue: null },
  );

  /** La fiche ouverte quand elle est réellement disponible. */
  readonly entry = computed<BestiaryEntry | null>(() => {
    const loaded = this.loaded();
    return loaded && loaded !== 'missing' ? loaded : null;
  });

  constructor() {
    // Une seule lecture par navigation. `combineLatest` des deux flux en
    // émettait *deux* quand chapitre et folio changeaient ensemble : la
    // première appliquait le nouveau folio à l'ancien chapitre, ce qui
    // déclenchait un feuilletage parasite et faisait partir l'animation
    // suivante de la mauvaise double page.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        startWith(null),
        map(() => this.route.snapshot),
        takeUntilDestroyed(),
      )
      .subscribe(snapshot => this.syncFromUrl(snapshot.paramMap, snapshot.queryParamMap));

    // Le contenu du flux vient de changer : on charge les index d'items cités
    // par le butin, puis on remesure une fois le DOM à jour (le `setTimeout`
    // nous place après le rendu du gabarit).
    effect(() => {
      const entry = this.entry();
      this.all();
      this.loadLootIndexes(entry);
      if (typeof window === 'undefined') return;
      setTimeout(() => this.measure(), 0);
    });

    if (typeof window !== 'undefined') {
      const onResize = () => this.measure();
      window.addEventListener('resize', onResize);
      this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
    }
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  /** Créatures groupées par chapitre. Les tableaux restent stables d'un rendu
      à l'autre, ce dont dépendent les gabarits et les mesureurs. */
  private readonly byChapter = computed<Record<string, BestiaryIndexEntry[]>>(() => {
    const map: Record<string, BestiaryIndexEntry[]> = {};
    for (const meta of CHAPTERS) map[meta.slug] = [];
    for (const entry of this.all()) (map[entry.chapter] ??= []).push(entry);
    return map;
  });

  readonly entriesOf = (slug: string): BestiaryIndexEntry[] => this.byChapter()[slug] ?? [];

  /** Créatures du chapitre courant. */
  readonly entries = computed(() => this.entriesOf(this.chapter().slug));

  /** Feuillets d'un chapitre : garde, colonnes de vignettes, puis colophon. */
  private pagesOfChapter(meta: ChapterMeta): Folio[] {
    const entries = this.entriesOf(meta.slug);
    const columns = this.chapterColumns()[meta.slug] ?? 1;
    const pages: Folio[] = [{ kind: 'chapter', chapter: meta }];
    for (let i = 0; i < columns; i++) {
      pages.push({ kind: 'index', entries, column: i, columns });
    }
    // Compter pair sert deux fois : ça évite une page blanche en fin de
    // chapitre, et ça garantit que le suivant s'ouvre sur une page de gauche.
    if (pages.length % 2) pages.push({ kind: 'colophon', chapter: meta });
    return pages;
  }

  /**
   * Le livre entier, chapitres bout à bout. C'est cette liste unique qui relie
   * les chapitres : la dernière double page de l'un est simplement suivie de la
   * première du suivant, et la foliation court sans se réinitialiser.
   */
  readonly bookSpreads = computed<BookSpread[]>(() => {
    const spreads: BookSpread[] = [];
    for (const meta of CHAPTERS) {
      const pages = this.pagesOfChapter(meta);
      for (let i = 0; i < pages.length; i += 2) {
        spreads.push({
          spread: { left: pages[i], right: pages[i + 1] },
          chapter: meta,
          local: i / 2,
        });
      }
    }
    return spreads;
  });

  /** Doubles pages d'une fiche : une par colonne mesurée du flux. */
  private readonly detailSpreads = computed<Spread[]>(() => {
    const entry = this.entry();
    if (!entry) return [];
    const columns = this.detailColumns();
    const pages: Folio[] = [];
    for (let i = 0; i < columns; i++) pages.push({ kind: 'detail', entry, column: i, columns });
    if (pages.length % 2) pages.push({ kind: 'entry-end', entry });

    const spreads: Spread[] = [];
    for (let i = 0; i < pages.length; i += 2) {
      spreads.push({ left: pages[i], right: pages[i + 1] });
    }
    return spreads;
  });

  /** Rang, dans le livre entier, de la double page du chapitre courant. */
  private readonly bookIndex = computed(() => {
    const spreads = this.bookSpreads();
    const slug = this.chapter().slug;
    const first = spreads.findIndex(s => s.chapter.slug === slug);
    if (first < 0) return 0;
    const count = spreads.filter(s => s.chapter.slug === slug).length;
    return first + Math.min(this.folio(), Math.max(count - 1, 0));
  });

  /** Nombre de doubles pages du mode courant. */
  readonly total = computed(() =>
    this.slug() ? this.detailSpreads().length : this.bookSpreads().length,
  );

  /** Double page courante, quel que soit le mode (livre ou fiche). */
  readonly current = computed(() =>
    this.slug()
      ? Math.min(this.page(), Math.max(this.detailSpreads().length - 1, 0))
      : this.bookIndex(),
  );

  readonly spread = computed<Spread>(() => {
    if (this.slug()) {
      const loaded = this.loaded();
      if (loaded === null) return { left: { kind: 'loading' }, right: { kind: 'blank' } };
      if (loaded === 'missing') return { left: { kind: 'missing' }, right: { kind: 'blank' } };
      return this.detailSpreads()[this.current()] ?? BLANK_SPREAD;
    }
    return this.bookSpreads()[this.current()]?.spread ?? BLANK_SPREAD;
  });

  /**
   * La double page courante et sa foliation. Une fiche est un encart : comme
   * dans un livre imprimé, elle ne porte pas de numéro et n'en consomme pas.
   */
  private placedNow(): Placed {
    return {
      spread: this.spread(),
      firstPage: this.slug() ? 0 : this.current() * 2 + 1,
    };
  }

  // Modèle du feuilletage (voir le schéma en tête du CSS) : une seule feuille
  // bouge. En avant, c'est la page de droite qui bascule vers la gauche ; son
  // recto est l'ancienne page de droite, son verso la nouvelle page de gauche.
  //
  // Chaque emplacement porte aussi son numéro de page : comme dans un livre,
  // la foliation appartient au feuillet, elle voyage donc avec lui pendant le
  // feuilletage au lieu de rester accrochée au décor.
  readonly leafFront = computed<Sheet | null>(() => {
    const dir = this.turning();
    const out = this.outgoing();
    if (!dir || !out) return null;
    return dir === 'next' ? rightOf(out) : leftOf(out);
  });

  readonly leafBack = computed<Sheet | null>(() => {
    const dir = this.turning();
    if (!dir) return null;
    return dir === 'next' ? leftOf(this.placedNow()) : rightOf(this.placedNow());
  });

  /** Feuillet immobile côté gauche pendant l'animation. */
  readonly staticLeft = computed<Sheet>(() => {
    const out = this.outgoing();
    return this.turning() === 'next' && out ? leftOf(out) : leftOf(this.placedNow());
  });

  readonly staticRight = computed<Sheet>(() => {
    const out = this.outgoing();
    return this.turning() === 'prev' && out ? rightOf(out) : rightOf(this.placedNow());
  });

  readonly hasPrev = computed(() => !!this.slug() || this.current() > 0);
  readonly hasNext = computed(() => this.current() < this.total() - 1);

  // ── Mesure du flux ────────────────────────────────────────────────────────

  /**
   * Mesure combien de colonnes occupe la fiche, sur un exemplaire caché du
   * contenu laissé en colonne unique. On mesure en *largeur* : à hauteur
   * contrainte, le moteur multicolonnes ne fait pas déborder le texte vers le
   * bas, il fabrique des colonnes supplémentaires vers la droite. La largeur
   * de défilement dit donc directement combien de pages il faut.
   *
   * Mesurer les pages réelles créerait une boucle : une fois paginées, elles
   * ne débordent plus, et le compte retomberait à une colonne.
   */
  /** Recalcule la pagination : appelé quand une illustration finit de charger. */
  remeasure(): void {
    this.measure();
  }

  private measure(): void {
    // En page simple, le livre redevient scrollable : une seule « colonne ».
    // Testé avant toute lecture du DOM, car les mesureurs y sont masqués.
    if (window.innerWidth <= NARROW_PX) {
      this.chapterColumns.set(Object.fromEntries(CHAPTERS.map(c => [c.slug, 1])));
      this.detailColumns.set(1);
      return;
    }

    const chapters: Record<string, number> = {};
    for (const node of this.host.nativeElement.querySelectorAll<HTMLElement>('.codex__measure')) {
      const sheet = node.querySelector<HTMLElement>('.sheet');
      const flow = node.dataset['flow'];
      if (!sheet || !flow) continue;

      const columns = this.columnsIn(sheet);
      if (columns === null) continue;
      if (flow === 'detail') this.detailColumns.set(columns);
      else chapters[flow] = columns;
    }

    if (Object.keys(chapters).length) {
      this.chapterColumns.set({ ...this.chapterColumns(), ...chapters });
    }
  }

  /** Colonnes occupées par un exemplaire de mesure, ou `null` s'il n'est pas
      encore dimensionné. */
  private columnsIn(sheet: HTMLElement): number | null {
    const page = sheet.clientWidth;
    if (page <= 0) return null;

    const flow = sheet.firstElementChild as HTMLElement | null;
    const gap = flow ? Number.parseFloat(getComputedStyle(flow).columnGap) || 0 : 0;

    // La largeur de défilement vaut n colonnes et n-1 gouttières ; on ajoute
    // une gouttière des deux côtés du rapport pour retomber sur un entier.
    return Math.max(1, Math.round((sheet.scrollWidth + gap) / (page + gap)));
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  /** `folio` et `page` sont 1-indexés dans l'URL pour rester lisibles. */
  private goto(target: { page?: number; slug?: string | null }): void {
    const slug = target.slug === undefined ? this.slug() : target.slug;
    const path = slug
      ? ['/bestiary', this.chapter().slug, slug]
      : ['/bestiary', this.chapter().slug];
    const queryParams: Record<string, number> = { folio: this.folio() + 1 };
    if (slug) queryParams['page'] = (target.page ?? 0) + 1;
    this.router.navigate(path, { queryParams });
  }

  /**
   * Va à une double page du livre désignée par son rang global. Comme ce rang
   * traverse les chapitres, c'est ici que le passage de l'un à l'autre se fait
   * tout seul : on lit dans la table le chapitre où l'on atterrit.
   */
  private gotoBook(index: number): void {
    const target = this.bookSpreads()[index];
    if (!target) return;
    this.router.navigate(['/bestiary', target.chapter.slug], {
      queryParams: { folio: target.local + 1 },
    });
  }

  next(): void {
    if (!this.hasNext()) return;
    if (this.slug()) this.goto({ page: this.current() + 1 });
    else this.gotoBook(this.current() + 1);
  }

  /**
   * Recule d'une double page. Sur la première page d'une fiche, referme la
   * fiche et revient au folio d'index d'où l'on venait.
   */
  prev(): void {
    if (!this.hasPrev()) return;
    if (this.slug()) {
      if (this.current() > 0) this.goto({ page: this.current() - 1 });
      else this.goto({ slug: null });
      return;
    }
    this.gotoBook(this.current() - 1);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') { event.preventDefault(); this.next(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); this.prev(); }
  }

  /**
   * Applique l'état porté par l'URL et lance le feuilletage dans le bon sens.
   * L'URL reste la source de vérité : un lien profond ouvre la bonne page et
   * le bouton « précédent » du navigateur refeuillette en arrière.
   */
  private syncFromUrl(params: ParamMap, query: ParamMap): void {
    const chapter = CHAPTERS.find(c => c.slug === params.get('chapter')) ?? CHAPTERS[0];
    const slug = params.get('slug');
    const folio = Math.max(0, Number(query.get('folio') ?? 1) - 1);
    const page = Math.max(0, Number(query.get('page') ?? 1) - 1);

    const dir = this.directionTo(chapter, folio, page, slug);
    const snapshot = this.placedNow();

    // Une autre fiche = une autre mesure : on repart d'une page unique pour ne
    // pas hériter du découpage de la précédente. Les chapitres, eux, sont tous
    // mesurés en permanence et n'ont rien à réinitialiser.
    if (slug !== this.slug()) this.detailColumns.set(1);

    this.chapter.set(chapter);
    this.slug.set(slug);
    this.page.set(slug ? page : 0);
    // `folio` reste porté par l'URL même sur une fiche : c'est le folio
    // d'index d'où l'on vient, et donc celui où l'on revient en refermant.
    this.folio.set(folio);

    if (!this.booted) {
      this.booted = true;
      return;
    }
    if (dir) this.startTurn(dir, snapshot);
  }

  private directionTo(
    chapter: ChapterMeta,
    folio: number,
    page: number,
    slug: string | null,
  ): 'next' | 'prev' | null {
    if (slug && !this.slug()) return 'next';
    if (!slug && this.slug()) return 'prev';
    if (chapter.slug !== this.chapter().slug) {
      return CHAPTERS.indexOf(chapter) > CHAPTERS.indexOf(this.chapter()) ? 'next' : 'prev';
    }
    if (slug) {
      if (page === this.page()) return null;
      return page > this.page() ? 'next' : 'prev';
    }
    if (folio === this.folio()) return null;
    return folio > this.folio() ? 'next' : 'prev';
  }

  private startTurn(dir: 'next' | 'prev', snapshot: Placed): void {
    clearTimeout(this.turnTimer);
    this.outgoing.set(snapshot);
    this.turning.set(dir);
    this.turnTimer = setTimeout(() => {
      this.turning.set(null);
      this.outgoing.set(null);
    }, TURN_MS);
  }
}

