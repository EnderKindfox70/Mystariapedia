import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Navbar } from '../../components/navbar/navbar';
import { SpellsService } from '../../services/spells.service';
import { SpellPageData } from '../../wiki.types';
import {
  DOMAINS,
  domainColor as colorOf,
  domainIcon as iconOf,
  domainLabel as labelOf,
  domainSigil as sigilOf,
} from '../../domains.catalog';

/** Rayon du cercle des 12 domaines, marge, et écart entre combos d'une même paire. */
const DOM_R = 440;
const PAD = 150;
const PAIR_GAP = 76;

/**
 * Constellation des combinaisons : les 12 domaines disposés en cercle, et chaque
 * sort de combinaison posé sur le lien qui unit ses domaines. Vue « carte »
 * (zoom molette + déplacement au glisser), accessible depuis la page Magie.
 */
@Component({
  selector: 'magic-constellation',
  imports: [RouterLink, Navbar],
  templateUrl: './magic-constellation.html',
  styleUrl: './magic-constellation.css',
})
export class MagicConstellation {
  private spells = inject(SpellsService);

  domainColor = (s: string): string => colorOf(s);
  domainIcon = (s: string): string => iconOf(s);
  domainLabel = (s: string): string => labelOf(s);
  domainSigil = (s: string): string => sigilOf(s);

  /** Dégradé bicolore (ou plus) d'une combinaison à partir de ses domaines. */
  comboGradient(comps: readonly string[]): string {
    const stops = comps.map((c) => this.domainColor(c)).join(', ');
    return `linear-gradient(135deg, ${stops})`;
  }

  /** Disposition statique de la constellation (données de domaines + combos). */
  readonly layout = this.build();

  private build() {
    const n = DOMAINS.length;
    const c = DOM_R + PAD;
    const size = 2 * c;

    const domainPos = new Map<string, { x: number; y: number }>();
    const domains = DOMAINS.map((d, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = c + DOM_R * Math.cos(a);
      const y = c + DOM_R * Math.sin(a);
      domainPos.set(d.slug, { x, y });
      return { slug: d.slug, label: d.label, x, y };
    });

    // Regroupe les combos par ensemble de domaines (les combos d'une même paire
    // partagent le même lien : on les répartit le long de la perpendiculaire).
    const combos = this.spells.all().filter((p) => p.kind === 'combination');
    const groups = new Map<string, SpellPageData[]>();
    for (const combo of combos) {
      const key = [...combo.domains].sort().join('|');
      const list = groups.get(key);
      if (list) list.push(combo);
      else groups.set(key, [combo]);
    }

    const comboNodes: {
      page: SpellPageData;
      comps: string[];
      label: string;
      x: number;
      y: number;
    }[] = [];
    const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];

    for (const members of groups.values()) {
      const comps = members[0].domains;
      const pts = comps.map((s) => domainPos.get(s)).filter((p): p is { x: number; y: number } => !!p);
      if (!pts.length) continue;
      const base = {
        x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
        y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
      };
      // Direction d'étalement : perpendiculaire au lien pour une paire.
      let dir = { x: 0, y: 0 };
      if (pts.length === 2) {
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        const len = Math.hypot(dx, dy) || 1;
        dir = { x: -dy / len, y: dx / len };
      }
      members.forEach((page, k) => {
        const off = (k - (members.length - 1) / 2) * PAIR_GAP;
        const x = base.x + dir.x * off;
        const y = base.y + dir.y * off + (pts.length !== 2 ? off : 0);
        comboNodes.push({ page, comps, label: page.comboName ?? page.spell.name, x, y });
        for (const s of comps) {
          const p = domainPos.get(s);
          if (p) edges.push({ x1: p.x, y1: p.y, x2: x, y2: y });
        }
      });
    }

    return { domains, comboNodes, edges, width: size, height: size, cx: c, cy: c, ringR: DOM_R };
  }

  /* ── Vue « carte » : zoom molette + déplacement au glisser ── */
  private viewport = viewChild<ElementRef<HTMLElement>>('viewport');

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
    return Math.min(MagicConstellation.ZOOM_MAX, Math.max(MagicConstellation.ZOOM_MIN, z));
  }

  constructor() {
    afterNextRender(() => this.fitView());
  }

  /** Cadre toute la constellation dans le viewport. */
  fitView(): void {
    const vp = this.viewport()?.nativeElement;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const z = this.clampZoom(Math.min(rect.width / this.layout.width, rect.height / this.layout.height) * 0.92);
    this.zoom.set(z);
    this.panX.set((rect.width - this.layout.width * z) / 2);
    this.panY.set((rect.height - this.layout.height * z) / 2);
  }

  onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const old = this.zoom();
    const next = this.clampZoom(old * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    if (next === old) return;
    this.panX.set(mx - ((mx - this.panX()) / old) * next);
    this.panY.set(my - ((my - this.panY()) / old) * next);
    this.zoom.set(next);
  }

  zoomBy(factor: number): void {
    const rect = this.viewport()?.nativeElement?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 0;
    const cy = rect ? rect.height / 2 : 0;
    const old = this.zoom();
    const next = this.clampZoom(old * factor);
    if (next === old) return;
    this.panX.set(cx - ((cx - this.panX()) / old) * next);
    this.panY.set(cy - ((cy - this.panY()) / old) * next);
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

  /** Bloque la navigation si le clic conclut un glissement. */
  onNodeClick(e: MouseEvent): void {
    if (this.didPan) { e.preventDefault(); e.stopPropagation(); }
  }
}
