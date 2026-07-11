import { Component, ElementRef, inject, computed, signal, viewChild, afterNextRender, DestroyRef } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs/internal/operators/switchMap';
import { DomainCombination, DomainEntry, DomainSpellEntry } from '../../wiki.types';
import { WikiLinkPipe } from '../../pipes/wiki-link-pipe';
import { Navbar } from '../../components/navbar/navbar';
import { DomainCombinationsService } from '../../services/domain-combinations-service';
import {
  DOMAINS,
  domainColor as colorOf,
  domainIcon as iconOf,
  domainLabel as labelOf,
  domainSigil as sigilOf,
} from '../../domains.catalog';

/** Dimensions du graphe radial « arbre de sorts complet » (overlay page domaine). */
const ST_RING = 168;   // écart de rayon entre deux paliers de niveau
const ST_NODE_W = 150;
const ST_NODE_H = 52;

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

  domainSigil = (slug: string): string => sigilOf(slug);
  domainLabel = (slug: string): string => labelOf(slug);
  domainColor = (slug: string): string => colorOf(slug);
  domainIcon  = (slug: string): string => iconOf(slug);

  /** Icône effective d'un sort : la sienne, sinon celle de son sous-domaine (repli). */
  spellIcon = (sp: DomainSpellEntry): string => {
    if (sp.icon) return sp.icon;
    const subs = this.entry().subdomains ?? [];
    for (const name of sp.subdomains ?? []) {
      const s = subs.find((x) => x.name === name);
      if (s?.icon) return s.icon;
    }
    return '';
  };

  /* ─────────────────────────────────────────────
     ARBRE DE SORTS COMPLET (overlay)
  ───────────────────────────────────────────── */

  /** Ouverture de l'overlay montrant l'intégralité de l'arbre de sorts du domaine. */
  showSpellTree = signal(false);
  openSpellTree(): void {
    this.showSpellTree.set(true);
    // Laisse l'overlay passer en display:grid avant de mesurer le viewport.
    setTimeout(() => this.fitTree(), 0);
  }
  closeSpellTree(): void { this.showSpellTree.set(false); }

  /* ── Vue « carte » : zoom molette + déplacement au glisser ── */
  private treeViewport = viewChild<ElementRef<HTMLElement>>('treeViewport');

  zoom = signal(1);
  panX = signal(0);
  panY = signal(0);
  isDragging = signal(false);

  private dragging = false;
  private didPan = false;
  private lastX = 0;
  private lastY = 0;
  private startX = 0;
  private startY = 0;

  private static readonly ZOOM_MIN = 0.15;
  private static readonly ZOOM_MAX = 2.5;
  private clampZoom(z: number): number {
    return Math.min(DomainEntryComponent.ZOOM_MAX, Math.max(DomainEntryComponent.ZOOM_MIN, z));
  }

  /** Ajuste zoom + centre pour que tout l'arbre tienne dans le viewport. */
  fitTree(): void {
    const tree = this.spellTree();
    const vp = this.treeViewport()?.nativeElement;
    if (!tree || !vp) return;
    const rect = vp.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const z = this.clampZoom(Math.min(rect.width / tree.width, rect.height / tree.height) * 0.9);
    this.zoom.set(z);
    this.panX.set((rect.width - tree.width * z) / 2);
    this.panY.set((rect.height - tree.height * z) / 2);
  }

  /** Zoom molette, centré sur le curseur. */
  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const old = this.zoom();
    const next = this.clampZoom(old * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    if (next === old) return;
    // Garde le point sous le curseur immobile.
    const wx = (mx - this.panX()) / old;
    const wy = (my - this.panY()) / old;
    this.panX.set(mx - wx * next);
    this.panY.set(my - wy * next);
    this.zoom.set(next);
  }

  /** Boutons +/− : zoom centré sur le viewport. */
  zoomBy(factor: number): void {
    const vp = this.treeViewport()?.nativeElement;
    const rect = vp?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 0;
    const cy = rect ? rect.height / 2 : 0;
    const old = this.zoom();
    const next = this.clampZoom(old * factor);
    if (next === old) return;
    const wx = (cx - this.panX()) / old;
    const wy = (cy - this.panY()) / old;
    this.panX.set(cx - wx * next);
    this.panY.set(cy - wy * next);
    this.zoom.set(next);
  }

  onPointerDown(e: PointerEvent): void {
    this.dragging = true;
    this.didPan = false;
    this.startX = this.lastX = e.clientX;
    this.startY = this.lastY = e.clientY;
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    if (!this.didPan && Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > 4) {
      this.didPan = true;
      this.isDragging.set(true);
    }
    if (!this.didPan) return;
    this.panX.update((x) => x + (e.clientX - this.lastX));
    this.panY.update((y) => y + (e.clientY - this.lastY));
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  onPointerUp(): void {
    this.dragging = false;
    this.isDragging.set(false);
  }

  /** Ouvre la fiche du sort — sauf si le clic conclut un glissement (pan). */
  onNodeClick(e: MouseEvent): void {
    if (this.didPan) { e.preventDefault(); e.stopPropagation(); return; }
    this.closeSpellTree();
  }

  /**
   * Élément d'overlay téléporté dans <body> : `position: fixed` doit se caler sur
   * la fenêtre, or un ancêtre peut établir un bloc conteneur ; le déplacer sous
   * <body> garantit qu'il se superpose au-dessus de tout, au niveau du visiteur.
   */
  private treeOverlay = viewChild<ElementRef<HTMLElement>>('treeOverlay');

  constructor() {
    afterNextRender(() => {
      const el = this.treeOverlay()?.nativeElement;
      if (el && typeof document !== 'undefined') document.body.appendChild(el);
    });
    inject(DestroyRef).onDestroy(() => this.treeOverlay()?.nativeElement?.remove());
  }

  readonly stNodeW = ST_NODE_W;
  readonly stNodeH = ST_NODE_H;

  /**
   * Disposition en couches de l'arbre de sorts du domaine : colonne = profondeur
   * de prérequis, rangée calculée pour centrer chaque sort sur ses déblocages.
   * Les arêtes relient chaque prérequis (interne au domaine) au sort débloqué.
   */
  spellTree = computed(() => {
    const spells = this.entry().spells ?? [];
    if (!spells.length) return null;
    const inSet = new Set(spells.map((s) => s.key));
    const reqsInSet = (s: DomainSpellEntry) => (s.requires ?? []).filter((k) => inSet.has(k));
    const childrenOf = (key: string) => spells.filter((s) => reqsInSet(s).includes(key));

    // Slot angulaire par sort : les feuilles reçoivent des positions successives,
    // un parent se centre sur la moyenne de ses déblocages (évite les croisements).
    const slotOf = new Map<string, number>();
    let nextSlot = 0;
    const assign = (key: string, seen = new Set<string>()): number => {
      const cached = slotOf.get(key);
      if (cached !== undefined) return cached;
      if (seen.has(key)) return nextSlot++;
      seen.add(key);
      const kids = childrenOf(key);
      const slot = kids.length
        ? kids.map((c) => assign(c.key, seen)).reduce((a, b) => a + b, 0) / kids.length
        : nextSlot++;
      slotOf.set(key, slot);
      return slot;
    };
    spells.filter((s) => reqsInSet(s).length === 0).forEach((r) => assign(r.key));
    spells.forEach((s) => { if (!slotOf.has(s.key)) slotOf.set(s.key, nextSlot++); });
    const totalSlots = Math.max(1, nextSlot);

    // Rayon par palier de NIVEAU de déblocage : niveau bas = plus central.
    const levels = [...new Set(spells.map((s) => s.level))].sort((a, b) => a - b);
    const rankOf = (lvl: number) => levels.indexOf(lvl);
    const maxRank = Math.max(0, levels.length - 1);
    const innerR = ST_RING * 0.85;
    const maxRadius = innerR + maxRank * ST_RING;
    const pad = ST_NODE_W * 0.6 + 26;
    const cx = maxRadius + pad;
    const cy = maxRadius + pad;

    const centerOf = new Map<string, { x: number; y: number }>();
    const nodes = spells.map((s) => {
      const angle = (((slotOf.get(s.key) ?? 0) + 0.5) / totalSlots) * Math.PI * 2 - Math.PI / 2;
      const radius = innerR + rankOf(s.level) * ST_RING;
      const ccx = cx + radius * Math.cos(angle);
      const ccy = cy + radius * Math.sin(angle);
      centerOf.set(s.key, { x: ccx, y: ccy });
      return { spell: s, x: ccx - ST_NODE_W / 2, y: ccy - ST_NODE_H / 2 };
    });

    const edges: { d: string }[] = [];
    for (const s of spells) {
      for (const r of reqsInSet(s)) {
        const a = centerOf.get(r);
        const b = centerOf.get(s.key);
        if (!a || !b) continue;
        edges.push({ d: `M ${a.x} ${a.y} L ${b.x} ${b.y}` });
      }
    }

    const rings: number[] = [];
    for (let d = 0; d <= maxRank; d++) rings.push(innerR + d * ST_RING);

    const size = 2 * (maxRadius + pad);
    return { nodes, edges, rings, cx, cy, width: size, height: size };
  });

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

  /** Icône du domaine courant — emblème des sorts du domaine quand elle existe. */
  currentIcon = computed(() => this.domainIcon(this.domainSlug()));

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
