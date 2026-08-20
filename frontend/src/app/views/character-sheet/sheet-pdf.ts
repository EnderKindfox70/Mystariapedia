/**
 * Export PDF **vectoriel** de la fiche de personnage.
 *
 * L'ancien export rastérisait le DOM (html2canvas) et poussait une image plein
 * cadre par page : plusieurs mégaoctets, du texte non sélectionnable, et des
 * lecteurs stricts — Adobe en tête — qui peinaient à afficher chaque page.
 *
 * Ici, la fiche est redessinée directement en primitives PDF : le texte est du
 * vrai texte (sélectionnable, cherchable, net à tout zoom), les cadres et les
 * barres sont des tracés. Seuls restent en image le fond de parchemin — une
 * seule fois pour tout le document, réutilisé page après page — et les
 * illustrations du personnage, qui sont des photos par nature.
 *
 * La contrepartie : la mise en page n'est plus déduite de la CSS, elle est
 * décrite ici. Les deux doivent donc évoluer ensemble.
 */
import type { jsPDF } from 'jspdf';
import type { CharacterSheet } from '../../character/character.types';
import { SHEET_NAMESPACE, encodeSheetPayload } from './sheet-transfer';

/* ── Géométrie de page (mm) ───────────────────────────────────────────────── */

const PAGE_W = 210;
const PAGE_H = 297;
/** Marge du contenu. Le cadre décoratif court à l'intérieur. */
const MARGIN = 12;
/** Gouttière entre les deux colonnes. */
const COL_GAP = 4;
/** Espace vertical entre deux blocs. */
const BLOCK_GAP = 3;
/** Marge intérieure d'un bloc. */
const PAD = 2.4;
/** Hauteur du bandeau de titre d'un bloc. */
const BANNER_H = 5.4;

const CONTENT_W = PAGE_W - MARGIN * 2;
const COL_W = (CONTENT_W - COL_GAP) / 2;
const CONTENT_TOP = MARGIN;
const CONTENT_BOTTOM = PAGE_H - MARGIN;

/* ── Palette (reprise de character-sheet.css) ─────────────────────────────── */

type Rgb = readonly [number, number, number];

const INK: Rgb = [34, 23, 19];
const STRONG: Rgb = [42, 28, 20];
const MUTED: Rgb = [94, 70, 50];
const FAINT: Rgb = [107, 83, 64];
const GOLD: Rgb = [139, 107, 47];
const PANEL: Rgb = [255, 250, 235];
const IVORY: Rgb = [237, 230, 214];
const FRAME: Rgb = [132, 112, 89];
const RED: Rgb = [107, 31, 31];

/* ── Échelle typographique (pt) ───────────────────────────────────────────── */

const PT = {
  banner: 8.4,
  body: 7.4,
  small: 6.3,
  micro: 5.5,
  value: 8.4,
  score: 9,
};
const MM_PER_PT = 25.4 / 72;
const LINE = 1.32;

const ptToMm = (pt: number): number => pt * MM_PER_PT;
const lineH = (pt: number): number => ptToMm(pt) * LINE;

/* ── Fond de parchemin ────────────────────────────────────────────────────── */

const PAPER_TEXTURE_URL = '/resources/media/pictures/background_parchment_texture.png';
/** Teinte du papier — rendu de `--paper-tint` (cf. `.sheet` / `.paper-surface`). */
const PAPER_TINT = 'rgb(195, 180, 157)';
/** Tuile de texture, en fraction de la largeur de page (720px sur ~760px de fiche). */
const PAPER_TILE_RATIO = 0.95;
/**
 * Résolution du fond, en pixels de large. C'est LA seule image de fond du
 * document : dessinée une fois, référencée par toutes les pages. Le grain du
 * parchemin étant du bruit, monter cette valeur ne fait que gonfler le fichier.
 */
const PAPER_PX = 640;
const PAPER_QUALITY = 0.72;
/** Alias jsPDF : identique partout ⇒ un seul XObject pour tout le document. */
const PAPER_ALIAS = 'mystaria-paper';

/* ── Polices embarquées (OFL, cf. resources/fonts/README.md) ──────────────── */

const FONT_DIR = '/resources/fonts/';
const FONTS = [
  { file: 'Cinzel-Regular.ttf', family: 'Cinzel', style: 'normal' },
  { file: 'Cinzel-Bold.ttf', family: 'Cinzel', style: 'bold' },
  { file: 'Spectral-Regular.ttf', family: 'Spectral', style: 'normal' },
  { file: 'Spectral-Bold.ttf', family: 'Spectral', style: 'bold' },
  { file: 'Spectral-Italic.ttf', family: 'Spectral', style: 'italic' },
] as const;

type Family = 'Cinzel' | 'Spectral';
type Style = 'normal' | 'bold' | 'italic';

/* ── Données attendues de la fiche ────────────────────────────────────────── */

export interface PdfSpellRow {
  level: number;
  name: string;
  /** Rang affiché (« R3 ») quand le sort a un arbre d'amélioration. */
  rank?: string;
  mana: number;
  /** Icônes des domaines du sort (vignettes, cf. `domainIcon`). */
  domainIcons: string[];
  /** Domaines en toutes lettres — repli quand une icône manque. */
  domains: string;
}

/** Un domaine choisi par le personnage : nom + vignette. */
export interface PdfDomain {
  name: string;
  icon?: string;
}

export interface PdfSlotRow {
  label: string;
  item: string;
  /** Lignes de caractéristiques (dégâts, protections…). */
  lines: string[];
}

/** Une maîtrise imprimée : son libellé, et si elle vient d'un ajout manuel. */
export interface PdfProficiency {
  label: string;
  manual: boolean;
}

export interface SheetPdfData {
  fileName: string;
  /**
   * Modèle éditable complet, embarqué tel quel dans les métadonnées du document
   * pour permettre la réimportation (cf. sheet-transfer.ts). Il ne sert à rien
   * au dessin : le rendu n'utilise que les valeurs déjà résolues ci-dessous.
   */
  source: CharacterSheet;
  identity: {
    name: string;
    race: string;
    className: string;
    level: number;
    background: string;
    /** Origine géographique et religion, vides quand le personnage n'en a pas. */
    origin: string;
    religion: string;
    age: string | number;
    gold: number;
    portrait?: string;
    fullImage?: string;
  };
  /** Avancement d'expérience vers le palier suivant. */
  xp: {
    total: number;
    into: number;
    needed: number;
    pct: number;
    /** Vrai au niveau maximal : il n'y a plus de palier à viser. */
    atMax: boolean;
  };
  /** Domaines choisis (déjà résolus). */
  domains: PdfDomain[];
  attributes: { label: string; score: number; mod: string }[];
  bars: { label: string; icon: string; value: number; pct: number }[];
  /** Jauges de survie : des crans cochés, pas un pourcentage. */
  survival: {
    label: string;
    icon: string;
    /** Crans cochés / crans totaux. */
    filled: number;
    segments: number;
    /** Verdict en toutes lettres (« Affamé », « Désaltéré »…). */
    stage: string;
  }[];
  /** Réserves : une proportion de points, et le verdict qui va avec. */
  pools: {
    label: string;
    icon: string;
    /** Niveau du moment / maximum calculé. */
    current: number;
    max: number;
    pct: number;
    /** Verdict en toutes lettres (« Blessé », « À bout de souffle »…). */
    stage: string;
  }[];
  defenses: { label: string; icon: string; spark?: string; value: number }[];
  spells: {
    cap: number;
    inspirationLeft: number;
    inspirationTotal: number;
    equipped: PdfSpellRow[];
    unlocked: PdfSpellRow[];
  };
  classSpells: { level: number; name: string; endurance: number; description: string }[];
  /** Maîtrises d'armes et d'armures, chacune marquée « ajoutée à la main » ou non. */
  proficiencies: { weapons: PdfProficiency[]; armors: PdfProficiency[] };
  equipment: { left: PdfSlotRow[]; right: PdfSlotRow[] };
  skills: { label: string; bonus: string; trained: boolean }[];
  inventory: { name: string; qty: number; weight: number }[];
  weight: { total: number; capacity: number; over: boolean };
  traits: { name: string; description?: string; icon: string }[];
  notes: string;
}

/* ── Chargement des ressources ────────────────────────────────────────────── */

const bytesToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Par tranches : `String.fromCharCode(...bytes)` explose la pile sur 50 ko.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** Une image prête pour jsPDF : format supporté + proportions + alias de cache. */
interface PdfImage {
  data: string;
  format: 'JPEG' | 'PNG';
  ratio: number;
  /** Passé à `addImage` : deux appels de même alias partagent un seul XObject. */
  alias: string;
}

/**
 * Côté des icônes de domaine dans le PDF. Elles sont dessinées en ~5 mm : à
 * 300 ppp cela fait 59 px, la vignette 128 px du dépôt est donc encore deux
 * fois trop fine pour l'usage — on la réduit avant embarquement.
 */
const ICON_PX = 64;

/**
 * Convertit une image de la fiche en JPEG. Indispensable : les portraits sont
 * stockés en WebP (cf. `compressImage` du composant), que jsPDF ne sait pas
 * lire — il faut repasser par un canvas.
 */
async function toPdfImage(
  src: string | undefined,
  maxPx: number,
  alias: string,
  transparent = false,
): Promise<PdfImage | null> {
  if (!src) return null;
  const img = await loadImage(src);
  if (!img?.naturalWidth) return null;
  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (!transparent) {
    // Le JPEG n'a pas de couche alpha : sans ce fond, les zones transparentes
    // ressortiraient en noir.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // PNG pour les icônes : jsPDF en extrait l'alpha dans un SMask, indispensable
  // pour qu'elles se posent sur le parchemin sans pavé blanc autour.
  return transparent
    ? { data: canvas.toDataURL('image/png'), format: 'PNG', ratio: canvas.width / canvas.height, alias }
    : { data: canvas.toDataURL('image/jpeg', 0.82), format: 'JPEG', ratio: canvas.width / canvas.height, alias };
}

/**
 * Charge les icônes de domaine une seule fois chacune, indexées par URL. Une
 * même icône revient sur la pastille du personnage ET sur chaque sort du
 * domaine : sans cette table, on la retranscoderait à chaque occurrence.
 */
async function loadDomainIcons(urls: Iterable<string>): Promise<Map<string, PdfImage>> {
  const unique = [...new Set([...urls].filter(Boolean))];
  const loaded = await Promise.all(
    unique.map((url, i) => toPdfImage(url, ICON_PX, `domain-${i}`, true)),
  );
  const byUrl = new Map<string, PdfImage>();
  unique.forEach((url, i) => {
    const image = loaded[i];
    if (image) byUrl.set(url, image);
  });
  return byUrl;
}

/**
 * Compose le fond de parchemin : teinte, texture en `multiply` par-dessus, puis
 * halo — la recette de `.sheet`. Une seule image pour tout le document.
 */
async function buildPaper(): Promise<string | null> {
  const texture = await loadImage(PAPER_TEXTURE_URL);
  const canvas = document.createElement('canvas');
  canvas.width = PAPER_PX;
  canvas.height = Math.round((PAPER_PX * PAGE_H) / PAGE_W);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = PAPER_TINT;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const pattern = texture && ctx.createPattern(texture, 'repeat');
  if (pattern) {
    const tile = canvas.width * PAPER_TILE_RATIO;
    pattern.setTransform(
      new DOMMatrix().scaleSelf(tile / texture.width, tile / texture.height),
    );
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  const cx = canvas.width * 0.2;
  const cy = canvas.height * 0.12;
  const radius = Math.hypot(canvas.width - cx, canvas.height - cy) * 0.32;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  halo.addColorStop(0, 'rgba(255, 253, 246, 0.16)');
  halo.addColorStop(1, 'rgba(255, 253, 246, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', PAPER_QUALITY);
}

/* ── Tracé des icônes SVG ─────────────────────────────────────────────────── */

const PATH_TOKENS = /([astvzqmhlcASTVZQMHLC])([^astvzqmhlcASTVZQMHLC]*)/g;
const NUMBERS = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

/**
 * Convertit un arc elliptique SVG (`A`) en courbes de Bézier cubiques, seule
 * primitive courbe du PDF. Paramétrage centre standard de la spec SVG.
 */
function arcToCurves(
  x1: number, y1: number,
  rxIn: number, ryIn: number, rotation: number,
  largeArc: boolean, sweep: boolean,
  x2: number, y2: number,
): number[][] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (!rx || !ry) return [[x2, y2, x2, y2, x2, y2]];

  const phi = (rotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Rayons trop petits pour relier les deux points : la spec impose de les
  // dilater jusqu'à ce que l'arc soit réalisable.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const k = Math.sqrt(lambda);
    rx *= k;
    ry *= k;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const a = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
    return ux * vy - uy * vx < 0 ? -a : a;
  };

  const theta = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle(
    (x1p - cxp) / rx, (y1p - cyp) / ry,
    (-x1p - cxp) / rx, (-y1p - cyp) / ry,
  );
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  // Un quart de tour par courbe au maximum : au-delà l'approximation dérive.
  const segments = Math.ceil(Math.abs(delta) / (Math.PI / 2));
  const step = delta / segments;
  const alpha = (4 / 3) * Math.tan(step / 4);
  const curves: number[][] = [];
  let th = theta;
  let px = x1;
  let py = y1;

  for (let i = 0; i < segments; i++) {
    const th2 = th + step;
    const cos1 = Math.cos(th);
    const sin1 = Math.sin(th);
    const cos2 = Math.cos(th2);
    const sin2 = Math.sin(th2);
    const e2x = cosPhi * rx * cos2 - sinPhi * ry * sin2 + cx;
    const e2y = sinPhi * rx * cos2 + cosPhi * ry * sin2 + cy;
    const d1x = alpha * (-cosPhi * rx * sin1 - sinPhi * ry * cos1);
    const d1y = alpha * (-sinPhi * rx * sin1 + cosPhi * ry * cos1);
    const d2x = alpha * (-cosPhi * rx * sin2 - sinPhi * ry * cos2);
    const d2y = alpha * (-sinPhi * rx * sin2 + cosPhi * ry * cos2);
    curves.push([px + d1x, py + d1y, e2x - d2x, e2y - d2y, e2x, e2y]);
    px = e2x;
    py = e2y;
    th = th2;
  }
  return curves;
}

/**
 * Rejoue un `d` SVG (viewBox 0 0 24 24) dans le PDF, mis à l'échelle dans un
 * carré de `size` mm à partir de (x, y). Les icônes de la fiche sont écrites en
 * M/L/H/V/C/S/Q/A, absolus comme relatifs.
 */
function drawIconPath(pdf: jsPDF, d: string, x: number, y: number, size: number): void {
  const k = size / 24;
  const px = (vx: number) => x + vx * k;
  const py = (vy: number) => y + vy * k;

  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  // Dernier point de contrôle, pour les raccourcis S/T.
  let ctrlX = 0;
  let ctrlY = 0;
  let prevCmd = '';

  PATH_TOKENS.lastIndex = 0;
  let token: RegExpExecArray | null;
  while ((token = PATH_TOKENS.exec(d)) !== null) {
    const cmd = token[1];
    const nums = (token[2].match(NUMBERS) ?? []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    let i = 0;

    // Les commandes SVG se répètent tant qu'il reste des paramètres
    // (« M0 0 1 1 » = un moveTo puis un lineTo).
    do {
      switch (upper) {
        case 'M': {
          const nx = (rel ? cx : 0) + nums[i++];
          const ny = (rel ? cy : 0) + nums[i++];
          cx = nx; cy = ny; startX = nx; startY = ny;
          pdf.moveTo(px(cx), py(cy));
          break;
        }
        case 'L': {
          cx = (rel ? cx : 0) + nums[i++];
          cy = (rel ? cy : 0) + nums[i++];
          pdf.lineTo(px(cx), py(cy));
          break;
        }
        case 'H': {
          cx = (rel ? cx : 0) + nums[i++];
          pdf.lineTo(px(cx), py(cy));
          break;
        }
        case 'V': {
          cy = (rel ? cy : 0) + nums[i++];
          pdf.lineTo(px(cx), py(cy));
          break;
        }
        case 'C': {
          const ox = rel ? cx : 0;
          const oy = rel ? cy : 0;
          const c1x = ox + nums[i++]; const c1y = oy + nums[i++];
          const c2x = ox + nums[i++]; const c2y = oy + nums[i++];
          cx = ox + nums[i++]; cy = oy + nums[i++];
          ctrlX = c2x; ctrlY = c2y;
          pdf.curveTo(px(c1x), py(c1y), px(c2x), py(c2y), px(cx), py(cy));
          break;
        }
        case 'S': {
          const ox = rel ? cx : 0;
          const oy = rel ? cy : 0;
          const smooth = prevCmd === 'C' || prevCmd === 'S';
          const c1x = smooth ? 2 * cx - ctrlX : cx;
          const c1y = smooth ? 2 * cy - ctrlY : cy;
          const c2x = ox + nums[i++]; const c2y = oy + nums[i++];
          cx = ox + nums[i++]; cy = oy + nums[i++];
          ctrlX = c2x; ctrlY = c2y;
          pdf.curveTo(px(c1x), py(c1y), px(c2x), py(c2y), px(cx), py(cy));
          break;
        }
        case 'Q':
        case 'T': {
          const ox = rel ? cx : 0;
          const oy = rel ? cy : 0;
          let qx: number;
          let qy: number;
          if (upper === 'Q') {
            qx = ox + nums[i++];
            qy = oy + nums[i++];
          } else {
            const smooth = prevCmd === 'Q' || prevCmd === 'T';
            qx = smooth ? 2 * cx - ctrlX : cx;
            qy = smooth ? 2 * cy - ctrlY : cy;
          }
          const ex = ox + nums[i++];
          const ey = oy + nums[i++];
          // Quadratique → cubique : les points de contrôle sont aux 2/3.
          pdf.curveTo(
            px(cx + (2 / 3) * (qx - cx)), py(cy + (2 / 3) * (qy - cy)),
            px(ex + (2 / 3) * (qx - ex)), py(ey + (2 / 3) * (qy - ey)),
            px(ex), py(ey),
          );
          ctrlX = qx; ctrlY = qy; cx = ex; cy = ey;
          break;
        }
        case 'A': {
          const rx = nums[i++]; const ry = nums[i++]; const rot = nums[i++];
          const large = nums[i++] !== 0; const sweep = nums[i++] !== 0;
          const ex = (rel ? cx : 0) + nums[i++];
          const ey = (rel ? cy : 0) + nums[i++];
          for (const c of arcToCurves(cx, cy, rx, ry, rot, large, sweep, ex, ey)) {
            pdf.curveTo(px(c[0]), py(c[1]), px(c[2]), py(c[3]), px(c[4]), py(c[5]));
          }
          cx = ex; cy = ey;
          break;
        }
        case 'Z': {
          pdf.close();
          cx = startX; cy = startY;
          break;
        }
      }
      prevCmd = upper;
    } while (i < nums.length && upper !== 'Z');
  }
}

/* ── Peintre : primitives de dessin et gestion des pages ──────────────────── */

class Painter {
  /** Ordonnée courante du flux, en mm depuis le haut de page. */
  y = CONTENT_TOP;

  constructor(
    private readonly pdf: jsPDF,
    private readonly paper: string | null,
  ) {}

  get doc(): jsPDF {
    return this.pdf;
  }

  /** Fond + cadre d'une page. Le parchemin est toujours le même XObject. */
  paintPage(): void {
    if (this.paper) {
      this.pdf.addImage(this.paper, 'JPEG', 0, 0, PAGE_W, PAGE_H, PAPER_ALIAS, 'NONE');
    }
    // Cadre : deux filets, en remplacement vectoriel du `border-image` déchiré
    // de la CSS — qui, lui, ne se transpose pas en tracé.
    this.stroke(FRAME);
    this.pdf.setLineWidth(0.7);
    this.pdf.rect(MARGIN - 4, MARGIN - 4, CONTENT_W + 8, PAGE_H - (MARGIN - 4) * 2, 'S');
    this.pdf.setLineWidth(0.25);
    this.pdf.rect(MARGIN - 2.6, MARGIN - 2.6, CONTENT_W + 5.2, PAGE_H - (MARGIN - 2.6) * 2, 'S');
    this.y = CONTENT_TOP;
  }

  newPage(): void {
    this.pdf.addPage();
    this.paintPage();
  }

  get remaining(): number {
    return CONTENT_BOTTOM - this.y;
  }

  fill(c: Rgb): void {
    this.pdf.setFillColor(c[0], c[1], c[2]);
  }

  stroke(c: Rgb): void {
    this.pdf.setDrawColor(c[0], c[1], c[2]);
  }

  /** Opacité des tracés suivants (panneaux translucides de la CSS). */
  alpha(value: number): void {
    this.pdf.setGState(this.pdf.GState({ opacity: value, 'stroke-opacity': value }));
  }

  opaque(): void {
    this.alpha(1);
  }

  font(family: Family, style: Style, pt: number, color: Rgb = INK): void {
    this.pdf.setFont(family, style);
    this.pdf.setFontSize(pt);
    this.fill(color);
  }

  /** Texte calé sur le HAUT de la ligne : tout le moteur raisonne en hauteurs. */
  text(str: string, x: number, y: number, align: 'left' | 'center' | 'right' = 'left'): void {
    this.pdf.text(str || '', x, y, { align, baseline: 'top' });
  }

  /** Découpe un texte à la largeur donnée, avec la police courante. */
  wrap(str: string, w: number): string[] {
    if (!str) return [];
    return this.pdf.splitTextToSize(str, w) as string[];
  }

  width(str: string): number {
    return this.pdf.getTextWidth(str);
  }

  /** Tronque à la largeur donnée, suffixe « … » — pour les cellules serrées. */
  ellipsis(str: string, w: number): string {
    if (this.width(str) <= w) return str;
    let out = str;
    while (out.length > 1 && this.width(out + '…') > w) out = out.slice(0, -1);
    return out + '…';
  }

  /** Filet pointillé de séparation de lignes (les `border-bottom: dotted`). */
  dottedRule(x: number, y: number, w: number): void {
    this.stroke(MUTED);
    this.pdf.setLineWidth(0.15);
    this.alpha(0.35);
    this.pdf.setLineDashPattern([0.4, 0.6], 0);
    this.pdf.line(x, y, x + w, y);
    this.pdf.setLineDashPattern([], 0);
    this.opaque();
  }

  /** Panneau translucide bordé — l'équivalent de `.sheet-block` / `.sheet-slot`. */
  panel(x: number, y: number, w: number, h: number, radius = 1.6): void {
    this.alpha(0.3);
    this.fill(PANEL);
    this.pdf.roundedRect(x, y, w, h, radius, radius, 'F');
    this.alpha(0.5);
    this.stroke(MUTED);
    this.pdf.setLineWidth(0.2);
    this.pdf.roundedRect(x, y, w, h, radius, radius, 'S');
    this.opaque();
  }

  /** Pastille dorée discrète (coût en endurance…). */
  pill(str: string, x: number, y: number, pt: number): number {
    this.pdf.setFontSize(pt);
    const w = this.width(str) + 1.8;
    const h = ptToMm(pt) + 1;
    this.alpha(0.45);
    this.fill(GOLD);
    this.pdf.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
    this.opaque();
    this.fill(STRONG);
    this.text(str, x + w / 2, y + 0.5, 'center');
    return w;
  }

  /**
   * Badge contrasté (palier « R2 »). Posé juste après le titre d'un sort, un
   * simple aplat doré translucide se confondait avec le texte : fond plein,
   * texte clair et liseré doré le détachent franchement.
   */
  badge(str: string, x: number, y: number, pt: number): number {
    this.pdf.setFontSize(pt);
    const w = this.width(str) + 2;
    const h = ptToMm(pt) + 1.2;
    this.fill(MUTED);
    this.pdf.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
    this.stroke(GOLD);
    this.pdf.setLineWidth(0.2);
    this.pdf.roundedRect(x, y, w, h, h / 2, h / 2, 'S');
    this.fill(IVORY);
    this.text(str, x + w / 2, y + 0.6, 'center');
    return w;
  }

  /** Pose une image en réutilisant son XObject (cf. `PdfImage.alias`). */
  image(img: PdfImage, x: number, y: number, w: number, h: number): void {
    this.pdf.addImage(img.data, img.format, x, y, w, h, img.alias, 'NONE');
  }

  /** Icône de domaine, ajustée dans un carré sans déformation ni rognage. */
  domainIcon(img: PdfImage, x: number, y: number, size: number): void {
    const iw = img.ratio >= 1 ? size : size * img.ratio;
    const ih = img.ratio >= 1 ? size / img.ratio : size;
    this.image(img, x + (size - iw) / 2, y + (size - ih) / 2, iw, ih);
  }

  /** Icône SVG au trait, à la manière des `.sheet-bar__icon`. */
  icon(d: string, x: number, y: number, size: number, color: Rgb = STRONG, filled = false): void {
    this.stroke(color);
    this.fill(color);
    this.pdf.setLineWidth(size * 0.075);
    drawIconPath(this.pdf, d, x, y, size);
    if (filled) this.pdf.fillStroke();
    else this.pdf.stroke();
  }
}

/* ── Blocs : un titre, des lignes qui savent se dessiner ──────────────────── */

interface Row {
  h: number;
  draw(x: number, y: number, w: number): void;
}

interface Block {
  title: string;
  rows: Row[];
}

/** Hauteur totale d'un bloc rendu d'un seul tenant. */
const blockHeight = (block: Block): number =>
  BANNER_H + PAD * 2 + block.rows.reduce((sum, r) => sum + r.h, 0);

/* ── Moteur de mise en page ───────────────────────────────────────────────── */

/**
 * Une entrée du flux : soit un bloc pleine largeur, soit une paire côte à côte.
 * Les constructeurs prennent la largeur en paramètre — une paire trop haute est
 * reconstruite en pleine largeur, ce qui change les retours à la ligne.
 */
type FlowItem =
  | { kind: 'full'; build: (w: number) => Block | null }
  | { kind: 'pair'; left: (w: number) => Block | null; right: (w: number) => Block | null };

class Layout {
  constructor(private readonly p: Painter) {}

  /** Dessine un segment de bloc : bandeau + panneau + lignes. */
  private segment(x: number, y: number, w: number, title: string, rows: Row[]): number {
    const inner = rows.reduce((sum, r) => sum + r.h, 0);
    const h = BANNER_H + PAD * 2 + inner;
    this.p.panel(x, y, w, h);

    // Bandeau de titre (`.sheet-banner`).
    this.p.alpha(0.34);
    this.p.fill(MUTED);
    this.p.doc.roundedRect(x, y, w, BANNER_H, 1.6, 1.6, 'F');
    this.p.doc.rect(x, y + BANNER_H - 1.6, w, 1.6, 'F');
    this.p.opaque();
    this.p.font('Cinzel', 'bold', PT.banner, STRONG);
    this.p.doc.setCharSpace(0.25);
    this.p.text(title.toUpperCase(), x + w / 2, y + (BANNER_H - ptToMm(PT.banner)) / 2, 'center');
    this.p.doc.setCharSpace(0);

    let cursor = y + BANNER_H + PAD;
    for (const row of rows) {
      row.draw(x + PAD, cursor, w - PAD * 2);
      cursor += row.h;
    }
    return h;
  }

  /** Pose un bloc en le coupant sur autant de pages qu'il faut. */
  private flowBreaking(block: Block, x: number, w: number): void {
    const usable = CONTENT_BOTTOM - CONTENT_TOP - BANNER_H - PAD * 2;
    let i = 0;
    let first = true;

    while (first || i < block.rows.length) {
      let room = this.p.remaining - BANNER_H - PAD * 2;
      // Pas la place d'amorcer le bloc ici : on passe à la page suivante.
      if (room < Math.min(block.rows[i]?.h ?? 0, usable) && this.p.y > CONTENT_TOP) {
        this.p.newPage();
        room = this.p.remaining - BANNER_H - PAD * 2;
      }

      let take = 0;
      let sum = 0;
      while (i + take < block.rows.length && sum + block.rows[i + take].h <= room) {
        sum += block.rows[i + take].h;
        take++;
      }
      // Une ligne plus haute qu'une page entière : on la pose quand même, sinon
      // la boucle ne progresse jamais.
      if (take === 0 && i < block.rows.length) {
        take = 1;
        sum = block.rows[i].h;
      }

      const h = this.segment(x, this.p.y, w, first ? block.title : `${block.title} (suite)`,
        block.rows.slice(i, i + take));
      this.p.y += h + BLOCK_GAP;
      i += take;
      first = false;
      if (i < block.rows.length) this.p.newPage();
    }
  }

  run(items: FlowItem[]): void {
    for (const item of items) {
      if (item.kind === 'full') {
        const block = item.build(CONTENT_W);
        if (block) this.flowBreaking(block, MARGIN, CONTENT_W);
        continue;
      }

      const left = item.left(COL_W);
      const right = item.right(COL_W);
      if (!left && !right) continue;
      if (!left || !right) {
        this.flowBreaking((left ?? right)!, MARGIN, COL_W);
        continue;
      }

      const hL = blockHeight(left);
      const hR = blockHeight(right);
      const tallest = Math.max(hL, hR);
      // Côte à côte seulement si la paire tient sur une page : au-delà, chacun
      // reprend toute la largeur et se coupe pour son compte.
      if (tallest > CONTENT_BOTTOM - CONTENT_TOP) {
        this.flowBreaking(item.left(CONTENT_W)!, MARGIN, CONTENT_W);
        this.flowBreaking(item.right(CONTENT_W)!, MARGIN, CONTENT_W);
        continue;
      }
      if (tallest > this.p.remaining) this.p.newPage();
      const top = this.p.y;
      this.segment(MARGIN, top, COL_W, left.title, left.rows);
      this.segment(MARGIN + COL_W + COL_GAP, top, COL_W, right.title, right.rows);
      this.p.y = top + tallest + BLOCK_GAP;
    }
  }
}

/* ── Lignes réutilisables ─────────────────────────────────────────────────── */

/** Ligne libre, hauteur fixée par l'appelant. */
const row = (h: number, draw: Row['draw']): Row => ({ h, draw });

/** Ligne de liste : contenu + filet pointillé de séparation. */
function listRow(p: Painter, h: number, draw: Row['draw']): Row {
  return row(h, (x, y, w) => {
    draw(x, y, w);
    p.dottedRule(x, y + h - 0.6, w);
  });
}

/** Paragraphe justifié à gauche, replié à la largeur du bloc. */
function paragraph(p: Painter, text: string, pt: number, color: Rgb, w: number, style: Style = 'normal'): Row {
  p.font('Spectral', style, pt, color);
  const lines = p.wrap(text, w);
  const lh = lineH(pt);
  return row(Math.max(lh, lines.length * lh), (x, y) => {
    p.font('Spectral', style, pt, color);
    lines.forEach((line, i) => p.text(line, x, y + i * lh));
  });
}

/* ── Construction des blocs de la fiche ───────────────────────────────────── */

function characterBlock(
  p: Painter,
  d: SheetPdfData,
  portrait: PdfImage | null,
  icons: Map<string, PdfImage>,
  w: number,
): Block {
  const inner = w - PAD * 2;
  const rows: Row[] = [];

  // Portrait + état civil, côte à côte (`.sheet-character__top`).
  const portraitW = 20;
  const portraitH = 25;
  const fields: [string, string][] = [
    ['Nom', d.identity.name || '—'],
    ['Race', d.identity.race || '—'],
    ['Classe', `${d.identity.className || '—'} — Niv. ${d.identity.level}`],
    ['Background', d.identity.background || '—'],
    ['Origine', d.identity.origin || '—'],
    ['Foi', d.identity.religion || '—'],
    ['Âge', `${d.identity.age || '—'}`],
    ['Or', `${d.identity.gold}`],
  ];
  const fieldH = lineH(PT.body) + 0.5;
  // Jauge d'XP, calée sous l'état civil (`.sheet-xp`).
  const xpH = lineH(PT.micro) + 2.6;
  const topH = Math.max(portraitH, fields.length * fieldH + xpH);

  rows.push(row(topH + 1.5, (x, y) => {
    p.panel(x, y, portraitW, portraitH, 1.2);
    if (portrait) {
      // `object-fit: cover` : on garde le cadre plein, quitte à rogner.
      const boxRatio = portraitW / portraitH;
      let iw = portraitW;
      let ih = portraitH;
      if (portrait.ratio > boxRatio) iw = portraitH * portrait.ratio;
      else ih = portraitW / portrait.ratio;
      p.doc.saveGraphicsState();
      p.doc.rect(x, y, portraitW, portraitH, null);
      p.doc.clip();
      p.doc.discardPath();
      p.doc.addImage(portrait.data, portrait.format,
        x - (iw - portraitW) / 2, y - (ih - portraitH) / 2, iw, ih);
      p.doc.restoreGraphicsState();
    }

    const fx = x + portraitW + 3;
    const fw = inner - portraitW - 3;
    fields.forEach(([label, value], i) => {
      const fy = y + i * fieldH;
      p.font('Spectral', 'bold', PT.body, STRONG);
      const labelText = `${label} : `;
      p.text(labelText, fx, fy);
      const lw = p.width(labelText);
      p.font('Spectral', 'normal', PT.body, INK);
      p.text(p.ellipsis(value, fw - lw), fx + lw, fy);
    });

    // Jauge d'expérience vers le palier suivant.
    const xy = y + fields.length * fieldH + 0.8;
    p.font('Cinzel', 'normal', PT.micro, MUTED);
    p.doc.setCharSpace(0.15);
    p.text('EXPÉRIENCE', fx, xy);
    p.doc.setCharSpace(0);
    p.font('Spectral', 'bold', PT.small, STRONG);
    const label = d.xp.atMax ? `${d.xp.total} XP — max` : `${d.xp.into} / ${d.xp.needed}`;
    p.text(label, fx + fw, xy - 0.3, 'right');

    const trackY = xy + lineH(PT.micro) + 0.4;
    const trackH = 1.7;
    p.alpha(0.22);
    p.fill(MUTED);
    p.doc.roundedRect(fx, trackY, fw, trackH, 0.8, 0.8, 'F');
    p.opaque();
    const fillW = Math.max(0, Math.min(1, d.xp.pct / 100)) * fw;
    if (fillW > 0.4) {
      p.fill(GOLD);
      p.doc.roundedRect(fx, trackY, fillW, trackH, 0.8, 0.8, 'F');
    }
    p.alpha(0.5);
    p.stroke(MUTED);
    p.doc.setLineWidth(0.18);
    p.doc.roundedRect(fx, trackY, fw, trackH, 0.8, 0.8, 'S');
    p.opaque();
  }));

  // Domaines de magie : médaillons ronds portant l'icône du domaine, comme les
  // `.sheet-domains__circle` de l'aperçu. Le nom est ajouté dessous — sur une
  // fiche imprimée il n'y a pas d'infobulle pour le donner.
  const medallion = 9;
  const nameH = lineH(PT.micro);
  rows.push(row(lineH(PT.small) + medallion + nameH + 2, (x, y) => {
    p.font('Cinzel', 'normal', PT.small, MUTED);
    p.doc.setCharSpace(0.2);
    p.text('DOMAINES DE MAGIE', x + inner / 2, y, 'center');
    p.doc.setCharSpace(0);
    const top = y + lineH(PT.small) + 0.8;
    if (!d.domains.length) {
      p.font('Spectral', 'italic', PT.small, FAINT);
      p.text('—', x + inner / 2, top + 1, 'center');
      return;
    }

    p.font('Spectral', 'normal', PT.micro, MUTED);
    const cellW = Math.max(medallion, ...d.domains.map((dom) => p.width(dom.name))) + 3;
    const total = cellW * d.domains.length;
    let cursor = x + (inner - total) / 2;
    for (const dom of d.domains) {
      const cx = cursor + cellW / 2;
      p.alpha(0.35);
      p.fill(PANEL);
      p.doc.circle(cx, top + medallion / 2, medallion / 2, 'F');
      p.opaque();
      const image = dom.icon ? icons.get(dom.icon) : undefined;
      if (image) {
        // Légèrement débordant du disque : les PNG sources ont une marge
        // transparente qui, cadrée au plus juste, laisse le médaillon vide.
        const size = medallion * 1.18;
        p.domainIcon(image, cx - size / 2, top + medallion / 2 - size / 2, size);
      }
      p.stroke(MUTED);
      p.doc.setLineWidth(0.45);
      p.doc.circle(cx, top + medallion / 2, medallion / 2, 'S');
      p.font('Spectral', 'normal', PT.micro, MUTED);
      p.text(p.ellipsis(dom.name, cellW), cx, top + medallion + 0.8, 'center');
      cursor += cellW;
    }
  }));

  return { title: 'Personnage', rows };
}

function attributesBlock(p: Painter, d: SheetPdfData): Block {
  const h = lineH(PT.body) + 1.6;
  return {
    title: 'Attributs',
    rows: d.attributes.map((a) =>
      listRow(p, h, (x, y, w) => {
        p.font('Spectral', 'normal', PT.body, INK);
        p.text(a.label, x, y);
        p.font('Spectral', 'bold', PT.score, STRONG);
        p.text(`${a.score}`, x + w - 12, y, 'right');
        p.font('Spectral', 'bold', PT.small, MUTED);
        p.text(a.mod, x + w, y + 0.6, 'right');
      }),
    ),
  };
}

function statsBlock(p: Painter, d: SheetPdfData, w: number): Block {
  const inner = w - PAD * 2;
  // Barres à gauche, défenses à droite (`.sheet-stats-layout`).
  const defW = 26;
  const barsW = inner - defW - 4;
  const barRowH = 6;
  const barsH = d.bars.length * barRowH;
  const defRowH = 9;
  const defsH = d.defenses.length * defRowH;

  return {
    title: 'Statistiques',
    rows: [row(Math.max(barsH, defsH), (x, y) => {
      d.bars.forEach((bar, i) => {
        const by = y + i * barRowH;
        p.icon(bar.icon, x, by + 0.4, 4.2);
        const trackX = x + 5.6;
        const trackW = barsW - 5.6 - 9;
        const trackY = by + 1.9;
        const trackH = 2.2;
        p.alpha(0.22);
        p.fill(MUTED);
        p.doc.roundedRect(trackX, trackY, trackW, trackH, 1, 1, 'F');
        p.opaque();
        const fillW = Math.max(0, Math.min(1, bar.pct / 100)) * trackW;
        if (fillW > 0.4) {
          p.fill(GOLD);
          p.doc.roundedRect(trackX, trackY, fillW, trackH, 1, 1, 'F');
        }
        p.stroke(MUTED);
        p.doc.setLineWidth(0.18);
        p.alpha(0.5);
        p.doc.roundedRect(trackX, trackY, trackW, trackH, 1, 1, 'S');
        p.opaque();
        p.font('Spectral', 'bold', PT.value, STRONG);
        p.text(`${bar.value}`, x + barsW, by + 0.6, 'right');
      });

      const dx = x + barsW + 4;
      p.stroke(MUTED);
      p.doc.setLineWidth(0.2);
      p.alpha(0.35);
      p.doc.line(dx - 2, y, dx - 2, y + Math.max(barsH, defsH));
      p.opaque();
      d.defenses.forEach((def, i) => {
        const dy = y + i * defRowH;
        p.icon(def.icon, dx, dy, 6.4);
        if (def.spark) p.icon(def.spark, dx, dy, 6.4, STRONG, true);
        p.font('Spectral', 'bold', PT.score, STRONG);
        p.text(`${def.value}`, dx + 8, dy + 1.6);
        p.font('Spectral', 'normal', PT.micro, MUTED);
        p.text(p.ellipsis(def.label, defW - 8), dx + 8, dy + 1.6 + lineH(PT.score));
      });
    })],
  };
}

/**
 * Jauges de survie. Elles se dessinent en crans séparés — c'est ce qui les
 * distingue des barres de réserves posées juste à côté : ici on coche des
 * jours de réserve, on n'affiche pas une proportion.
 */
function survivalBlock(p: Painter, d: SheetPdfData, w: number): Block {
  const inner = w - PAD * 2;
  const rowH = 9.5;
  const gap = 1;

  return {
    title: 'Survie',
    rows: d.survival.map((g) =>
      row(rowH, (x, y) => {
        // Intitulé à gauche, verdict à droite : la rangée de crans passe sous
        // les deux et court sur TOUTE la largeur du bloc.
        p.icon(g.icon, x, y + 0.2, 4.2);
        p.font('Spectral', 'normal', PT.small, INK);
        p.text(g.label, x + 5.6, y + 0.7);
        p.font('Spectral', 'normal', PT.micro, MUTED);
        p.text(`${g.stage} (${g.filled}/${g.segments})`, x + inner, y + 1, 'right');

        const segW = (inner - gap * (g.segments - 1)) / g.segments;
        const trackY = y + 5.4;
        const trackH = 3;
        for (let i = 0; i < g.segments; i++) {
          const sx = x + i * (segW + gap);
          if (i < g.filled) {
            p.fill(GOLD);
            p.doc.roundedRect(sx, trackY, segW, trackH, 0.5, 0.5, 'F');
          } else {
            p.alpha(0.22);
            p.fill(MUTED);
            p.doc.roundedRect(sx, trackY, segW, trackH, 0.5, 0.5, 'F');
            p.opaque();
          }
          p.stroke(MUTED);
          p.doc.setLineWidth(0.18);
          p.alpha(0.5);
          p.doc.roundedRect(sx, trackY, segW, trackH, 0.5, 0.5, 'S');
          p.opaque();
        }
      }),
    ),
  };
}

/**
 * Réserves. Une barre continue, à l'inverse des crans de survie posés juste à
 * côté : ici on lit bien une proportion de points, et le nombre exact se lit à
 * droite parce qu'à la table c'est lui qu'on annonce.
 *
 * Dessiné à la largeur qu'on lui donne — pleine page ou colonne selon ce que la
 * mise en page décide (cf. `Layout.run`).
 */
function poolsBlock(p: Painter, d: SheetPdfData, w: number): Block {
  const inner = w - PAD * 2;
  const rowH = 9.5;

  return {
    title: 'Réserves',
    rows: d.pools.map((g) =>
      row(rowH, (x, y) => {
        p.icon(g.icon, x, y + 0.2, 4.2);
        p.font('Spectral', 'normal', PT.small, INK);
        p.text(g.label, x + 5.6, y + 0.7);
        p.font('Spectral', 'normal', PT.micro, MUTED);
        p.text(`${g.stage} (${g.current}/${g.max})`, x + inner, y + 1, 'right');

        const trackY = y + 5.4;
        const trackH = 3;
        p.alpha(0.22);
        p.fill(MUTED);
        p.doc.roundedRect(x, trackY, inner, trackH, 0.5, 0.5, 'F');
        p.opaque();
        const fillW = Math.max(0, Math.min(1, g.pct / 100)) * inner;
        if (fillW > 0.4) {
          p.fill(GOLD);
          p.doc.roundedRect(x, trackY, fillW, trackH, 0.5, 0.5, 'F');
        }
        p.stroke(MUTED);
        p.doc.setLineWidth(0.18);
        p.alpha(0.5);
        p.doc.roundedRect(x, trackY, inner, trackH, 0.5, 0.5, 'S');
        p.opaque();
      }),
    ),
  };
}

function spellsBlock(p: Painter, d: SheetPdfData, icons: Map<string, PdfImage>, w: number): Block {
  const inner = w - PAD * 2;
  const rows: Row[] = [];
  const h = lineH(PT.body) + 1.4;

  if (d.spells.inspirationTotal > 0) {
    rows.push(row(lineH(PT.small) + 1, (x, y) => {
      p.font('Spectral', 'bold', PT.small, MUTED);
      p.text(`Inspiration ${d.spells.inspirationLeft}/${d.spells.inspirationTotal}`, x, y);
      p.font('Spectral', 'bold', PT.small, STRONG);
      p.text(`Équipés ${d.spells.equipped.length}/${d.spells.cap}`, x + inner, y, 'right');
    }));
  }

  /** Écart entre le nom du sort et son badge de palier. */
  const BADGE_GAP = 1.6;
  const iconSize = ptToMm(PT.body) * 1.35;

  const spellRow = (s: PdfSpellRow, muted: boolean): Row =>
    listRow(p, h, (x, y, rw) => {
      p.font('Spectral', 'bold', PT.body, muted ? MUTED : STRONG);
      p.text(`${s.level}`, x + 2, y, 'center');

      // Colonnes de droite mesurées d'abord : le nom prend ce qui reste.
      const available = s.domainIcons.map((u) => icons.get(u)).filter((i): i is PdfImage => !!i);
      p.font('Spectral', 'normal', PT.small, MUTED);
      const domainsW = available.length
        ? available.length * (iconSize + 0.5) + 1
        : s.domains ? p.width(s.domains) + 1.5 : 0;
      const mana = `${s.mana} mana`;
      const manaW = p.width(mana);
      p.text(mana, x + rw - domainsW, y + 0.5, 'right');
      if (available.length) {
        let ix = x + rw - available.length * (iconSize + 0.5) + 0.5;
        for (const image of available) {
          p.domainIcon(image, ix, y + (ptToMm(PT.body) - iconSize) / 2 + 0.3, iconSize);
          ix += iconSize + 0.5;
        }
      } else if (s.domains) {
        p.text(s.domains, x + rw, y + 0.5, 'right');
      }

      const nameX = x + 4.5;
      let nameW = rw - 4.5 - manaW - domainsW - 2;
      if (s.rank) {
        p.font('Spectral', 'bold', PT.micro);
        nameW -= p.width(s.rank) + 2 + BADGE_GAP;
      }
      p.font('Spectral', 'normal', PT.body, muted ? MUTED : INK);
      const name = p.ellipsis(s.name, nameW);
      p.text(name, nameX, y);
      // La largeur du nom se mesure AVANT de basculer sur la police du badge :
      // `width()` dépend de la police courante, et la mesurer après plaçait le
      // badge bien trop à gauche — par-dessus la fin du titre.
      const nameEnd = nameX + p.width(name);
      if (s.rank) {
        p.font('Spectral', 'bold', PT.micro, IVORY);
        p.badge(s.rank, nameEnd + BADGE_GAP, y + 0.3, PT.micro);
      }
    });

  if (d.spells.equipped.length) {
    rows.push(...d.spells.equipped.map((s) => spellRow(s, false)));
  } else {
    rows.push(row(lineH(PT.small) + 1.5, (x, y) => {
      p.font('Spectral', 'italic', PT.small, FAINT);
      p.text('Aucun sort équipé', x, y);
    }));
  }

  if (d.spells.unlocked.length) {
    rows.push(row(lineH(PT.small) + 2, (x, y) => {
      p.font('Cinzel', 'normal', PT.small, MUTED);
      p.text(`Débloqués (${d.spells.unlocked.length})`, x + inner / 2, y + 1, 'center');
    }));
    rows.push(...d.spells.unlocked.map((s) => spellRow(s, true)));
  }

  return { title: 'Sorts équipés', rows };
}

function classSpellsBlock(p: Painter, d: SheetPdfData, w: number): Block {
  const inner = w - PAD * 2;
  const rows: Row[] = [];

  if (!d.classSpells.length) {
    rows.push(row(lineH(PT.small) + 1.5, (x, y) => {
      p.font('Spectral', 'italic', PT.small, FAINT);
      p.text('Aucune compétence débloquée', x, y);
    }));
    return { title: 'Compétences de classe', rows };
  }

  for (const spell of d.classSpells) {
    const headH = lineH(PT.body) + 1;
    p.font('Spectral', 'normal', PT.small);
    const descLines = p.wrap(spell.description ?? '', inner);
    const descH = descLines.length * lineH(PT.small);
    rows.push(listRow(p, headH + descH + 1.6, (x, y, rw) => {
      p.font('Spectral', 'bold', PT.small, STRONG);
      const lvl = `Niv. ${spell.level}`;
      p.text(lvl, x, y + 0.4);
      const lvlW = p.width(lvl) + 1.5;
      p.font('Spectral', 'bold', PT.micro, STRONG);
      const endW = p.pill(`${spell.endurance} end.`, x + rw - (p.width(`${spell.endurance} end.`) + 1.8), y, PT.micro);
      p.font('Cinzel', 'normal', PT.body, STRONG);
      p.text(p.ellipsis(spell.name, rw - lvlW - endW - 3), x + lvlW, y);
      p.font('Spectral', 'normal', PT.small, MUTED);
      descLines.forEach((line, i) => p.text(line, x, y + headH + i * lineH(PT.small)));
    }));
  }

  return { title: 'Compétences de classe', rows };
}

function equipmentBlock(p: Painter, d: SheetPdfData, figure: PdfImage | null, w: number): Block {
  const inner = w - PAD * 2;
  const figureW = 34;
  const colW = (inner - figureW - 8) / 2;

  // Hauteur d'un emplacement : libellé + objet + lignes de stats.
  const slotHeight = (slot: PdfSlotRow): number =>
    lineH(PT.micro) + lineH(PT.body) + slot.lines.length * lineH(PT.micro) + 2.4;

  const drawSlot = (slot: PdfSlotRow, x: number, y: number, sw: number): number => {
    const h = slotHeight(slot);
    p.panel(x, y, sw, h, 1.2);
    const tx = x + 1.6;
    const tw = sw - 3.2;
    p.font('Cinzel', 'normal', PT.micro, MUTED);
    p.text(p.ellipsis(slot.label.toUpperCase(), tw), tx, y + 1.2);
    p.font('Spectral', slot.item ? 'normal' : 'italic', PT.body, slot.item ? INK : FAINT);
    p.text(p.ellipsis(slot.item || '—', tw), tx, y + 1.2 + lineH(PT.micro));
    p.font('Spectral', 'normal', PT.micro, MUTED);
    slot.lines.forEach((line, i) =>
      p.text(p.ellipsis(line, tw), tx, y + 1.2 + lineH(PT.micro) + lineH(PT.body) + i * lineH(PT.micro)),
    );
    return h;
  };

  const stackH = (slots: PdfSlotRow[]): number =>
    slots.reduce((sum, s) => sum + slotHeight(s), 0) + Math.max(0, slots.length - 1) * 1.6;

  const h = Math.max(stackH(d.equipment.left), stackH(d.equipment.right), 44);

  return {
    title: 'Équipement',
    rows: [row(h, (x, y) => {
      let ly = y;
      for (const slot of d.equipment.left) ly += drawSlot(slot, x, ly, colW) + 1.6;
      let ry = y;
      const rx = x + colW + figureW + 8;
      for (const slot of d.equipment.right) ry += drawSlot(slot, rx, ry, colW) + 1.6;

      const fx = x + colW + 4;
      p.panel(fx, y, figureW, h, 1.6);
      if (figure) {
        // `object-fit: contain` : l'illustration entière, centrée dans le cadre.
        const boxRatio = figureW / h;
        let iw = figureW - 2;
        let ih = (figureW - 2) / figure.ratio;
        if (figure.ratio < boxRatio) {
          ih = h - 2;
          iw = (h - 2) * figure.ratio;
        }
        p.doc.addImage(figure.data, figure.format, fx + (figureW - iw) / 2, y + (h - ih) / 2, iw, ih);
      }
    })],
  };
}

/**
 * Bloc Maîtrises : deux rangées de pastilles, armes puis armures. Une maîtrise
 * ajoutée à la main se dessine en pointillé et en italique — à la table, savoir
 * ce que la classe a donné et ce que la partie a ajouté change la discussion.
 */
function proficienciesBlock(p: Painter, d: SheetPdfData, w: number): Block {
  const inner = w - PAD * 2;
  const chipH = ptToMm(PT.small) + 1.6;
  const gap = 1.4;
  const rows: Row[] = [];

  const group = (title: string, items: PdfProficiency[], empty: string): void => {
    rows.push(row(lineH(PT.micro) + 1.2, (x, y) => {
      p.font('Cinzel', 'normal', PT.micro, MUTED);
      p.text(title.toUpperCase(), x, y);
    }));

    if (!items.length) {
      rows.push(row(lineH(PT.small) + 1.8, (x, y) => {
        p.font('Spectral', 'italic', PT.small, FAINT);
        p.text(empty, x, y);
      }));
      return;
    }

    // Répartition en lignes calculée ici : le moteur de mise en page a besoin
    // de la hauteur de chaque ligne AVANT de la dessiner.
    p.font('Spectral', 'normal', PT.small);
    const chipW = (label: string): number => p.width(label) + 3.4;
    const lines: PdfProficiency[][] = [[]];
    let used = 0;
    for (const item of items) {
      const cw = chipW(item.label);
      if (used > 0 && used + cw > inner) {
        lines.push([]);
        used = 0;
      }
      lines[lines.length - 1].push(item);
      used += cw + gap;
    }

    for (const line of lines) {
      rows.push(row(chipH + 1.4, (x, y) => {
        let cx = x;
        for (const item of line) {
          p.font('Spectral', item.manual ? 'italic' : 'normal', PT.small);
          const cw = p.width(item.label) + 3.4;
          p.alpha(item.manual ? 0.16 : 0.4);
          p.fill(GOLD);
          p.doc.roundedRect(cx, y, cw, chipH, chipH / 2, chipH / 2, 'F');
          p.alpha(0.55);
          p.stroke(MUTED);
          p.doc.setLineWidth(0.2);
          if (item.manual) p.doc.setLineDashPattern([0.5, 0.5], 0);
          p.doc.roundedRect(cx, y, cw, chipH, chipH / 2, chipH / 2, 'S');
          p.doc.setLineDashPattern([], 0);
          p.opaque();
          p.fill(STRONG);
          p.text(item.label, cx + cw / 2, y + 0.8, 'center');
          cx += cw + gap;
        }
      }));
    }
  };

  group('Armes', d.proficiencies.weapons, 'Aucune — mains nues');
  group('Armures', d.proficiencies.armors, 'Aucune — sans armure');

  return { title: 'Maîtrises', rows };
}

function skillsBlock(p: Painter, d: SheetPdfData): Block {
  const h = lineH(PT.body) + 1.2;
  return {
    title: 'Compétences',
    rows: d.skills.map((s) =>
      listRow(p, h, (x, y, w) => {
        // Pastille pleine = compétence entraînée (`.is-proficient`).
        const cy = y + ptToMm(PT.body) / 2;
        p.fill(s.trained ? GOLD : MUTED);
        if (!s.trained) p.alpha(0.3);
        p.doc.circle(x + 0.9, cy, 0.8, 'F');
        p.opaque();
        p.font('Spectral', s.trained ? 'bold' : 'normal', PT.body, s.trained ? STRONG : INK);
        p.text(p.ellipsis(s.label, w - 12), x + 2.8, y);
        p.font('Spectral', 'bold', PT.body, s.trained ? STRONG : MUTED);
        p.text(s.bonus, x + w, y, 'right');
      }),
    ),
  };
}

function inventoryBlock(p: Painter, d: SheetPdfData): Block {
  const h = lineH(PT.body) + 1.2;
  const rows: Row[] = [];

  rows.push(listRow(p, lineH(PT.micro) + 1.4, (x, y, w) => {
    p.font('Cinzel', 'normal', PT.micro, MUTED);
    p.text('OBJET', x, y);
    p.text('QTÉ', x + w - 12, y, 'right');
    p.text('POIDS', x + w, y, 'right');
  }));

  if (d.inventory.length) {
    for (const item of d.inventory) {
      rows.push(listRow(p, h, (x, y, w) => {
        p.font('Spectral', 'normal', PT.body, INK);
        p.text(p.ellipsis(item.name || '—', w - 24), x, y);
        p.text(`${item.qty}`, x + w - 12, y, 'right');
        p.text(`${Math.round(item.qty * item.weight * 100) / 100}`, x + w, y, 'right');
      }));
    }
  } else {
    rows.push(row(lineH(PT.small) + 1.5, (x, y) => {
      p.font('Spectral', 'italic', PT.small, FAINT);
      p.text('Sac vide', x, y);
    }));
  }

  rows.push(row(lineH(PT.body) + 1.5, (x, y, w) => {
    p.font('Spectral', 'bold', PT.small, d.weight.over ? RED : STRONG);
    p.text(`Poids total : ${d.weight.total} / ${d.weight.capacity}`, x + w, y + 1, 'right');
  }));

  return { title: 'Sac', rows };
}

function traitsBlock(p: Painter, d: SheetPdfData, w: number): Block {
  const inner = w - PAD * 2;
  if (!d.traits.length) {
    return {
      title: 'Traits',
      rows: [row(lineH(PT.small) + 1.5, (x, y) => {
        p.font('Spectral', 'italic', PT.small, FAINT);
        p.text('Aucun trait', x, y);
      })],
    };
  }

  // Deux colonnes tant que le bloc est large (`repeat(auto-fill, minmax(200px, 1fr))`).
  const cols = inner > 120 ? 2 : 1;
  const cellW = (inner - (cols - 1) * 3) / cols;
  const textW = cellW - 9;

  const cells = d.traits.map((t) => {
    p.font('Spectral', 'normal', PT.micro);
    const lines = p.wrap(t.description ?? '', textW);
    return {
      trait: t,
      lines,
      h: lineH(PT.small) + lines.length * lineH(PT.micro) + 3,
    };
  });

  const rows: Row[] = [];
  for (let i = 0; i < cells.length; i += cols) {
    const group = cells.slice(i, i + cols);
    const h = Math.max(...group.map((c) => c.h));
    rows.push(row(h + 2.5, (x, y) => {
      group.forEach((cell, c) => {
        const cx = x + c * (cellW + 3);
        p.panel(cx, y, cellW, h, 1.4);
        p.icon(cell.trait.icon, cx + 1.6, y + 1.6, 5, MUTED);
        const tx = cx + 8;
        p.font('Spectral', 'bold', PT.small, STRONG);
        p.text(p.ellipsis(cell.trait.name, textW), tx, y + 1.5);
        p.font('Spectral', 'normal', PT.micro, MUTED);
        cell.lines.forEach((line, li) =>
          p.text(line, tx, y + 1.5 + lineH(PT.small) + li * lineH(PT.micro)),
        );
      });
    }));
  }

  return { title: 'Traits', rows };
}

/**
 * Bloc Notes. Toujours présent, même vide : l'aperçu affiche un cadre réservé
 * (`min-height: 3rem`) et la fiche imprimée sert justement à y écrire à la main.
 */
function notesBlock(p: Painter, d: SheetPdfData, w: number): Block {
  const inner = w - PAD * 2;
  const text = (d.notes ?? '').trim();
  if (!text) {
    // Hauteur du cadre vide, alignée sur le `min-height` de `.sheet-notes__body`.
    return { title: 'Notes', rows: [row(14, () => undefined)] };
  }
  // `white-space: pre-wrap` : les sauts de ligne saisis sont conservés.
  const rows = text.split(/\r?\n/).map((para) => paragraph(p, para || ' ', PT.body, INK, inner));
  return { title: 'Notes', rows };
}

function artworkBlock(p: Painter, artwork: PdfImage | null, w: number): Block | null {
  if (!artwork) return null;
  const inner = w - PAD * 2;
  const maxH = 150;
  let iw = inner;
  let ih = inner / artwork.ratio;
  if (ih > maxH) {
    ih = maxH;
    iw = maxH * artwork.ratio;
  }
  return {
    title: 'Illustration',
    rows: [row(ih, (x, y) => {
      p.doc.addImage(artwork.data, artwork.format, x + (inner - iw) / 2, y, iw, ih);
    })],
  };
}

/* ── Point d'entrée ───────────────────────────────────────────────────────── */

/** Génère et télécharge le PDF vectoriel de la fiche. */
export async function exportSheetPdf(data: SheetPdfData): Promise<void> {
  const [{ jsPDF: JsPdf }, paper, fontFiles, portrait, artwork, icons] = await Promise.all([
    import('jspdf'),
    buildPaper(),
    Promise.all(
      FONTS.map(async (f) => {
        const res = await fetch(FONT_DIR + f.file);
        if (!res.ok) throw new Error(`police manquante : ${f.file}`);
        return { ...f, base64: bytesToBase64(await res.arrayBuffer()) };
      }),
    ),
    toPdfImage(data.identity.portrait, 640, 'portrait'),
    toPdfImage(data.identity.fullImage, 1200, 'artwork'),
    loadDomainIcons([
      ...data.domains.map((dom) => dom.icon ?? ''),
      ...data.spells.equipped.flatMap((s) => s.domainIcons),
      ...data.spells.unlocked.flatMap((s) => s.domainIcons),
    ]),
  ]);

  const pdf = new JsPdf({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  // jsPDF ne retient du TTF que les glyphes réellement employés (sous-ensemble
  // Identity-H) : embarquer les cinq graisses coûte quelques kilo-octets.
  for (const f of fontFiles) {
    pdf.addFileToVFS(f.file, f.base64);
    pdf.addFont(f.file, f.family, f.style);
  }
  pdf.setProperties({
    title: `Fiche de ${data.identity.name || 'personnage'}`,
    subject: 'Mystariapedia — fiche de personnage',
    creator: 'Mystariapedia',
  });
  // Le modèle éditable voyage avec le document : c'est ce qui rend le PDF
  // réimportable (cf. sheet-transfer.ts).
  pdf.addMetadata(await encodeSheetPayload(data.source), SHEET_NAMESPACE);

  const painter = new Painter(pdf, paper);
  painter.paintPage();

  new Layout(painter).run([
    {
      kind: 'pair',
      left: (w) => characterBlock(painter, data, portrait, icons, w),
      right: () => attributesBlock(painter, data),
    },
    // Réserves et survie côte à côte : trois lignes chacun, et deux façons de
    // lire le même instant — les points d'un côté, les jours de l'autre.
    {
      kind: 'pair',
      left: (w) => poolsBlock(painter, data, w),
      right: (w) => survivalBlock(painter, data, w),
    },
    { kind: 'full', build: (w) => statsBlock(painter, data, w) },
    {
      kind: 'pair',
      left: (w) => spellsBlock(painter, data, icons, w),
      right: (w) => classSpellsBlock(painter, data, w),
    },
    { kind: 'full', build: (w) => proficienciesBlock(painter, data, w) },
    { kind: 'full', build: (w) => equipmentBlock(painter, data, artwork, w) },
    {
      kind: 'pair',
      left: () => skillsBlock(painter, data),
      right: () => inventoryBlock(painter, data),
    },
    { kind: 'full', build: (w) => traitsBlock(painter, data, w) },
    { kind: 'full', build: (w) => notesBlock(painter, data, w) },
    { kind: 'full', build: (w) => artworkBlock(painter, artwork, w) },
  ]);

  pdf.save(`${data.fileName}.pdf`);
}
