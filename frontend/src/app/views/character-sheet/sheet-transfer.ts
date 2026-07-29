/**
 * Transport de la fiche DANS le PDF exporté, pour pouvoir la réimporter.
 *
 * On n'essaie pas de relire la fiche depuis ce qui est *dessiné* : le PDF montre
 * des valeurs calculées (stats finales, bonus, modificateurs) et pas le modèle
 * qui les produit — achat de points, graine de tirage, arbres de sorts. Les
 * relire serait à la fois fragile et incapable de restituer la fiche éditable.
 *
 * À la place, le modèle complet voyage dans le flux XMP du document
 * (`addMetadata`). jsPDF l'écrit NON compressé, même avec `compress: true` :
 * la charge utile reste lisible en clair dans les octets du fichier, et
 * l'import se réduit à une recherche de marqueur — aucun analyseur PDF requis.
 *
 * Conséquence à assumer : seuls les PDF produits par cette version savent se
 * réimporter. Un PDF plus ancien, ou retouché par un autre outil qui aurait
 * réécrit ses métadonnées, n'a pas la charge utile.
 */
import type { CharacterSheet } from '../../character/character.types';

/** Espace de noms XMP du bloc de métadonnées. */
export const SHEET_NAMESPACE = 'https://mystariapedia.local/ns/character-sheet';

/**
 * Marqueur de la charge utile. Le suffixe indique l'encodage :
 *  - `Z` : JSON dégonflable (`deflate-raw`) puis base64 ;
 *  - `R` : JSON base64 brut, quand le navigateur n'a pas `CompressionStream`.
 * Versionné : un futur changement de format se distinguera sans ambiguïté.
 */
const MARKER = 'MYSTARIAPEDIA-SHEET-V1';
const RE_PAYLOAD = new RegExp(`${MARKER}-([ZR]):([A-Za-z0-9+/=]+)`);

/* ── Encodage ─────────────────────────────────────────────────────────────── */

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  // Par tranches : `String.fromCharCode(...bytes)` explose la pile sur un
  // modèle qui embarque un portrait.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const base64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};

/** Passe un flux d'octets dans une CompressionStream / DecompressionStream. */
async function pipe(bytes: Uint8Array, stream: ReadableWritablePair): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart]);
  const piped = blob.stream().pipeThrough(stream as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

/**
 * Sérialise la fiche pour le flux XMP. La fiche embarque ses images en data URL
 * (portrait, original de recadrage, illustration) : elles pèsent l'essentiel de
 * la charge, d'où la compression quand le navigateur la propose.
 */
export async function encodeSheetPayload(sheet: CharacterSheet): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(sheet));
  if (typeof CompressionStream === 'function') {
    try {
      const packed = await pipe(json, new CompressionStream('deflate-raw'));
      return `${MARKER}-Z:${bytesToBase64(packed)}`;
    } catch {
      // On retombe sur le brut : un import raté vaut mieux qu'un export raté.
    }
  }
  return `${MARKER}-R:${bytesToBase64(json)}`;
}

/* ── Décodage ─────────────────────────────────────────────────────────────── */

/** Erreur d'import lisible par l'utilisateur. */
export class SheetImportError extends Error {}

/**
 * Retrouve la fiche dans un PDF exporté. Rend le modèle brut : c'est à
 * l'appelant de le passer par sa normalisation (une fiche ancienne peut avoir
 * été produite par une version antérieure du modèle).
 */
export async function extractSheetFromPdf(file: File): Promise<Partial<CharacterSheet>> {
  const buffer = await file.arrayBuffer();
  // Le PDF est binaire, mais le bloc XMP est du texte ASCII : `latin1` fait une
  // correspondance octet ↔ caractère, sans risque de perte sur les octets hauts.
  const raw = new TextDecoder('latin1').decode(buffer);
  const found = RE_PAYLOAD.exec(raw);
  if (!found) {
    throw new SheetImportError(
      "Ce PDF ne contient pas de fiche importable. Seuls les PDF exportés depuis Mystariapedia embarquent leurs données.",
    );
  }

  const [, encoding, payload] = found;
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(payload);
    if (encoding === 'Z') {
      if (typeof DecompressionStream !== 'function') {
        throw new SheetImportError(
          "Ce navigateur ne sait pas décompresser la fiche. Essaie avec un navigateur plus récent.",
        );
      }
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
  } catch (err) {
    if (err instanceof SheetImportError) throw err;
    throw new SheetImportError('Les données de ce PDF sont illisibles ou corrompues.');
  }

  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<CharacterSheet>;
    if (!parsed || typeof parsed !== 'object') throw new Error('forme inattendue');
    return parsed;
  } catch {
    throw new SheetImportError('Les données de ce PDF sont illisibles ou corrompues.');
  }
}
