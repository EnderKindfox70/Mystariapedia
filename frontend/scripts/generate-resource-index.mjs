// Génère automatiquement les index.json des catalogues à partir des fiches
// présentes dans chaque dossier. Lancé avant `start` et `build` (voir package.json).
//
// Un navigateur ne peut pas lister un dossier via HTTP : on dérive donc ces
// index au build, et le runtime se contente de fetch l'index.json produit ici.
//
// Ajouter une nouvelle catégorie de ressource = créer son dossier sous
// natural-resources/ : il est détecté automatiquement (pas de config à toucher).

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const JSON_ROOT = join(process.cwd(), 'public', 'resources', 'json');

/**
 * Collections à indexer.
 *  - { path }            : le dossier lui-même est une collection.
 *  - { path, nested }    : chaque sous-dossier est une collection.
 */
const COLLECTIONS = [
  { path: 'potions' },
  { path: 'natural-resources', nested: true },
];

/** Extrait un poids numérique d'une fiche (champ `weight` racine, ou champ
 *  `info` de clé 'weight' du type « 0.3 kg »). Renvoie 0 si absent/illisible. */
function parseWeight(data) {
  const raw = data.weight ?? data.info?.find((f) => f?.key === 'weight')?.value;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const n = parseFloat(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Champs légers exposés dans l'index, dérivés d'une fiche complète. */
function toIndexEntry(slug, data) {
  const rarity =
    data.rarity ??
    data.info?.find((f) => f?.key === 'rarity')?.value ??
    undefined;

  const entry = { slug, name: data.name ?? slug };
  if (data.subtitle) entry.subtitle = data.subtitle;
  if (rarity) entry.rarity = rarity;
  if (data.image) entry.image = data.image;
  if (data.icon) entry.icon = data.icon;
  // Poids unitaire pour l'inventaire des fiches de personnage (0 si non défini).
  entry.weight = parseWeight(data);
  return entry;
}

/** Fichiers générés à ne jamais traiter comme des fiches. */
const GENERATED = new Set(['index.json', 'used-in.json']);

/** (Re)génère l'index.json d'un dossier de fiches. */
async function buildIndex(absDir, relLabel) {
  const files = (await readdir(absDir)).filter(
    (f) => f.endsWith('.json') && !GENERATED.has(f),
  );

  const entries = [];
  for (const file of files) {
    const raw = await readFile(join(absDir, file), 'utf8');
    try {
      const data = JSON.parse(raw);
      entries.push(toIndexEntry(basename(file, '.json'), data));
    } catch (err) {
      console.warn(`⚠ JSON invalide ignoré : ${relLabel}/${file} — ${err.message}`);
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  await writeFile(
    join(absDir, 'index.json'),
    JSON.stringify(entries, null, 2) + '\n',
    'utf8',
  );
  console.log(`✓ ${relLabel}/index.json — ${entries.length} entrée(s)`);
}

/**
 * Dérive la carte inverse « ressource → potions qui l'utilisent » à partir des
 * ingrédients de chaque potion, puis l'écrit dans potions/used-in.json.
 * Clé : `${collection}/${slug}` du CrossRef de l'ingrédient (ex. resources/flora/algue-de-courant).
 */
async function buildPotionUsages(absDir) {
  const files = (await readdir(absDir)).filter(
    (f) => f.endsWith('.json') && !GENERATED.has(f),
  );

  /** @type {Record<string, {ref: string, collection: string, label: string}[]>} */
  const usages = {};
  for (const file of files) {
    const slug = basename(file, '.json');
    const data = JSON.parse(await readFile(join(absDir, file), 'utf8'));
    for (const ing of data.ingredients ?? []) {
      const ref = ing?.ref;
      if (!ref?.ref || !ref?.collection) continue;
      const key = `${ref.collection}/${ref.ref}`;
      (usages[key] ??= []).push({ ref: slug, collection: 'potions', label: data.name ?? slug });
    }
  }

  for (const list of Object.values(usages)) {
    list.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }

  await writeFile(
    join(absDir, 'used-in.json'),
    JSON.stringify(usages, null, 2) + '\n',
    'utf8',
  );
  console.log(`✓ potions/used-in.json — ${Object.keys(usages).length} ressource(s) référencée(s)`);
}

async function run() {
  for (const col of COLLECTIONS) {
    const absRoot = join(JSON_ROOT, col.path);
    if (!existsSync(absRoot)) {
      console.warn(`⚠ Dossier introuvable, ignoré : ${col.path}`);
      continue;
    }

    if (col.nested) {
      const subdirs = await readdir(absRoot, { withFileTypes: true });
      for (const d of subdirs) {
        if (d.isDirectory()) {
          await buildIndex(join(absRoot, d.name), `${col.path}/${d.name}`);
        }
      }
    } else {
      await buildIndex(absRoot, col.path);
    }
  }

  // Carte inverse des usages des potions.
  const potionsDir = join(JSON_ROOT, 'potions');
  if (existsSync(potionsDir)) await buildPotionUsages(potionsDir);
}

run().catch((err) => {
  console.error('Échec de la génération des index :', err);
  process.exit(1);
});
