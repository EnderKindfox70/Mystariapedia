import { Component, inject, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import weaponCategoryCatalog from '../../../../public/resources/json/weapon_category.json';
import { ARMOR_CATEGORIES } from '../../character/universe-data';
import {
  ArmorCategoryKey,
  ArmorPiece,
  ResourceInfoField,
  WeaponCategoryDef,
  WeaponCategoryKey,
} from '../../wiki.types';
import { Navbar } from '../../components/navbar/navbar';
import { compositionLabel } from '../../combat/materials';

/** Champs unifiés pour l'affichage d'une arme ou d'une armure. */
interface DetailEntry {
  name: string;
  subtitle?: string;
  image?: string;
  icon?: string;
  description: string[];
  info?: ResourceInfoField[];
  /** Matière de l'objet (clé de `materials.json`). */
  material?: string;
  properties?: string[];
  notes?: string[];
  // — Arme —
  weaponCategory?: WeaponCategoryKey;
  minDamage?: number;
  maxDamage?: number;
  // — Armure —
  armorCategory?: ArmorCategoryKey;
  resistances?: string[];
  weaknesses?: string[];
  pieces?: ArmorPiece[];
  // — Munition —
  damageType?: string;
  damageBonus?: number;
  compatibleWith?: WeaponCategoryKey[];
}

/** Libellés d'affichage par catégorie de page (dossier). */
const CATEGORY_LABELS: Record<string, string> = {
  melee: 'Armes de mêlée',
  ranged: 'Armes à distance',
  ammunition: 'Projectiles & munitions',
  armor: 'Armures & vêtements',
  shield: 'Boucliers',
};

/** Libellés FR des attributs (alignés sur AttributeKey de la fiche personnage). */
const ATTRIBUTE_LABELS: Record<string, string> = {
  force: 'Force',
  dexterite: 'Dextérité',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  sagesse: 'Sagesse',
  charisme: 'Charisme',
};

/** Libellés FR des types de dégâts (cf. damage_type.json). */
const DAMAGE_TYPE_LABELS: Record<string, string> = {
  slashing: 'Tranchant',
  piercing: 'Perforant',
  bludgeoning: 'Contondant',
  fire: 'Feu',
  ice: 'Glace',
  lightning: 'Foudre',
  water: 'Eau',
  earth: 'Terre',
  wind: 'Vent',
  dark: 'Ombre',
  light: 'Lumière',
};

/** Libellés FR des emplacements de pièce d'armure. */
const SLOT_LABELS: Record<string, string> = {
  head: 'Tête',
  body: 'Corps',
  legs: 'Jambes',
  feet: 'Bottes',
  shield: 'Bouclier',
};

@Component({
  selector: 'weapon-entry',
  imports: [RouterLink, Navbar],
  templateUrl: './weapons-entries.html',
  styleUrl: './weapons-entries.css',
})
export class WeaponEntryComponent {
  private route = inject(ActivatedRoute);

  private routeData = toSignal(this.route.data, { requireSync: true });
  private paramMap = toSignal(this.route.paramMap, { requireSync: true });

  /** Catalogue des catégories d'armes, chargé une fois au build. */
  private readonly weaponCategories =
    weaponCategoryCatalog.weapon_categories as WeaponCategoryDef[];

  entry = computed(() => this.routeData()['entry'] as DetailEntry);

  /**
   * La bande de caractéristiques, composition comprise.
   *
   * Elle est AJOUTÉE au rendu plutôt que recopiée dans le JSON de chaque fiche :
   * la matière est déjà déclarée une fois, sur `material`, et la dupliquer dans
   * `info` aurait créé deux vérités qui finiraient par diverger.
   */
  infoFields = computed<ResourceInfoField[]>(() => {
    const base = this.entry().info ?? [];
    const composition = compositionLabel(this.entry().material);
    return composition
      ? [...base, { key: 'material', label: 'Composition', value: composition }]
      : [...base];
  });

  category = computed(() => this.paramMap().get('category') ?? '');
  categoryLabel = computed(() => CATEGORY_LABELS[this.category()] ?? 'Armes');

  isAmmunition = computed(() => this.category() === 'ammunition');

  /** Définition partagée de la catégorie de l'arme (type de dégâts, maniement…). */
  categoryDef = computed(() =>
    this.weaponCategories.find((c) => c.key === this.entry().weaponCategory),
  );

  // ── Munition ──
  /** Noms FR des catégories d'armes compatibles avec ce projectile. */
  compatibleNames = computed(() =>
    (this.entry().compatibleWith ?? []).map(
      (key) => this.weaponCategories.find((c) => c.key === key)?.name ?? key,
    ),
  );

  // ── Armure ──
  armorPieces = computed(() => this.entry().pieces ?? []);
  /** Catégorie du set : ce que les classes citent dans leurs maîtrises. */
  armorCategory = computed(() => {
    const key = this.entry().armorCategory;
    return key ? ARMOR_CATEGORIES.find((c) => c.key === key) : undefined;
  });
  resistances = computed(() =>
    (this.entry().resistances ?? []).map((r) => this.damageTypeLabel(r)),
  );
  weaknesses = computed(() =>
    (this.entry().weaknesses ?? []).map((w) => this.damageTypeLabel(w)),
  );
  armorTotals = computed(() => {
    const pieces = this.armorPieces();
    return {
      physical: pieces.reduce((sum, p) => sum + (p.physicalArmor ?? 0), 0),
      magical: pieces.reduce((sum, p) => sum + (p.magicalProtection ?? 0), 0),
    };
  });

  attributeLabel(key: string): string {
    return ATTRIBUTE_LABELS[key] ?? key;
  }

  damageTypeLabel(key: string): string {
    return DAMAGE_TYPE_LABELS[key] ?? key;
  }

  slotLabel(slot: string): string {
    return SLOT_LABELS[slot] ?? slot;
  }
}
