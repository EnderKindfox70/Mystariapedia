// Génère les vignettes des icônes de domaine magique.
//
// Les icônes d'origine (`<domaine>/<domaine>_icon.png`) font 1024 à 1254 px pour
// ~2 Mo pièce — soit 24 Mo pour les douze. Or la fiche de personnage les affiche
// en pastilles de 2 rem, et l'export PDF en carrés de 4 mm : servir les
// originaux ferait télécharger 24 Mo pour afficher des timbres-poste.
//
// Ce script en dérive donc des `<domaine>_icon_sm.png` de THUMB_SIZE px, à
// committer avec les originaux. À relancer si une icône source change :
//
//     npm run gen:domain-icons
//
// Pas de dépendance d'image dans le projet : le PNG est décodé, ré-échantillonné
// et ré-encodé à la main (RGBA 8 bits, le format de toutes les sources).

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';

const ICON_ROOT = join(process.cwd(), 'public', 'resources', 'media', 'icons', 'domains');
/** Côté des vignettes. Couvre l'affichage écran en 2× comme le PDF en 300 ppp. */
const THUMB_SIZE = 128;
/** Suffixe des fichiers dérivés. */
const THUMB_SUFFIX = '_sm.png';

/* ── CRC32, exigé par le format PNG sur chaque chunk ──────────────────────── */

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ── Décodage ─────────────────────────────────────────────────────────────── */

/** Lit les chunks d'un PNG et rend { width, height, rgba } en 8 bits RGBA. */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('signature PNG absente');

  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = 0;
  const idat = [];

  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('PNG entrelacé non géré');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`attendu RGBA 8 bits, trouvé type ${colorType} / ${bitDepth} bits`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const rgba = Buffer.alloc(stride * height);

  // Défiltrage ligne à ligne (spec PNG §9) : chaque scanline est préfixée du
  // filtre appliqué, et se reconstruit à partir du pixel de gauche (a) et de la
  // ligne du dessus (b, c).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = rgba.subarray(y * stride, (y + 1) * stride);
    const prev = y ? rgba.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let value = src[i];
      switch (filter) {
        case 0: break;
        case 1: value += a; break;
        case 2: value += b; break;
        case 3: value += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error(`filtre PNG inconnu : ${filter}`);
      }
      cur[i] = value & 0xff;
    }
  }
  return { width, height, rgba };
}

/* ── Ré-échantillonnage ───────────────────────────────────────────────────── */

/**
 * Réduction par moyenne de boîte. La couleur est pondérée par l'alpha
 * (prémultipliée) : sans ça, les pixels transparents — souvent noirs — bavent
 * sur le contour de l'icône et laissent un liseré sale.
 */
function downscale(src, size) {
  const out = Buffer.alloc(size * size * 4);
  const sx = src.width / size;
  const sy = src.height / size;

  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          const alpha = src.rgba[i + 3];
          r += src.rgba[i] * alpha;
          g += src.rgba[i + 1] * alpha;
          b += src.rgba[i + 2] * alpha;
          a += alpha;
          n++;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(a / n);
    }
  }
  return { width: size, height: size, rgba: out };
}

/* ── Encodage ─────────────────────────────────────────────────────────────── */

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePng({ width, height, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  const stride = width * 4;

  // Filtre 0 (aucun) sur chaque ligne : à cette taille le gain des autres
  // filtres est marginal, et zlib fait déjà l'essentiel du travail.
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── Parcours des domaines ────────────────────────────────────────────────── */

const domains = (await readdir(ICON_ROOT, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

let before = 0;
let after = 0;

for (const domain of domains) {
  const source = join(ICON_ROOT, domain, `${domain}_icon.png`);
  if (!existsSync(source)) {
    console.warn(`  ${domain} : pas d'icône principale, ignoré`);
    continue;
  }
  const buf = await readFile(source);
  const thumb = encodePng(downscale(decodePng(buf), THUMB_SIZE));
  await writeFile(join(ICON_ROOT, domain, `${domain}_icon${THUMB_SUFFIX}`), thumb);
  before += buf.length;
  after += thumb.length;
  console.log(`  ${domain.padEnd(12)} ${(buf.length / 1024 / 1024).toFixed(2)} Mo → ${(thumb.length / 1024).toFixed(0)} Ko`);
}

console.log(
  `\n${domains.length} vignettes ${THUMB_SIZE}px : ` +
  `${(before / 1024 / 1024).toFixed(1)} Mo → ${(after / 1024).toFixed(0)} Ko`,
);
