import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { Navbar } from '../../components/navbar/navbar';
import { CharacterSheetService } from '../../services/character-sheet.service';
import { WikiLoaderService } from '../../services/wiki-loader-service';
import weaponCategoryCatalog from '../../../../public/resources/json/weapon_category.json';
import { ArmorEntry, ResourceIndexEntry, WeaponCategoryDef, WeaponEntry } from '../../wiki.types';
import {
  AttributeKey,
  BackgroundDef,
  CharacterSheet,
  ClassDef,
  CharacterSpells,
  ClassSpell,
  RaceDef,
  StatKey,
  StatMode,
  SubraceDef,
  TraitDef,
} from '../../character/character.types';
import {
  ATTRIBUTES,
  ATTRIBUTE_POINTS,
  BASE_ATTRIBUTE,
  MIN_ATTRIBUTE,
  MAX_ATTRIBUTE,
  attributeCost,
  attributeIncrementCost,
  BAR_STATS,
  MAX_LEVEL,
  XP_MAX,
  levelForXp,
  xpForLevel,
  xpProgress,
  xpToNextLevel,
  type XpProgress,
  DEFAULT_TRAIT_ICON,
  EQUIPMENT_SLOTS,
  DEFENSE_STATS,
  MAGIC_DEFENSE_SPARK,
  MAGIC_DOMAINS,
  SKILLS,
  STATS,
  abilityModifier,
  attributeBonuses,
  backgroundSkillBonuses,
  computeAttributes,
  computeGold,
  computeStats,
  purseDelta,
  purseTotal,
  maxTheoreticalScale,
  statContributions,
  type StatContribution,
  domainName,
  domainIcon,
  domainSigil,
  availableSpellsFor,
  findDomainSpell,
  spellMaxTier,
  spellTree,
  type DomainSpell,
  type SpellTreeNode,
  emptySheet,
  formatBonus,
  grantedTraits,
  randomSeed,
  roll4d6DropLowest,
  skillLabel,
} from '../../character/universe-data';
import type { PdfSlotRow, PdfSpellRow, SheetPdfData } from './sheet-pdf';

/** Tailles max des images importées (octets bruts du fichier, avant recompression). */
const MAX_PORTRAIT_BYTES = 10 * 1024 * 1024;
const MAX_FULL_IMAGE_BYTES = 10 * 1024 * 1024;


/** Collections du wiki proposées comme objets d'inventaire (avec poids). */
const INVENTORY_COLLECTIONS = [
  'potions',
  'equipment',
  'natural-resources/fauna',
  'natural-resources/flora',
  'natural-resources/minerals',
  'natural-resources/liquids',
  'natural-resources/remains',
  'weapons/melee',
  'weapons/ranged',
  'weapons/ammunition',
  'weapons/armor',
  'weapons/shield',
];

/** Collections d'armes proposées dans les emplacements d'arme (main/secondaire). */
const WEAPON_COLLECTIONS = ['weapons/melee', 'weapons/ranged'];

/** Collections de sets (armures, vêtements, boucliers) dont on tire les pièces équipables. */
const ARMOR_COLLECTIONS = ['weapons/armor', 'weapons/shield'];

/** Emplacement de pièce d'armure (cf. ArmorPiece.slot) → emplacement d'équipement. */
const PIECE_TO_EQUIP_SLOT: Record<string, string> = {
  head: 'head',
  body: 'chest',
  legs: 'legs',
  feet: 'feet',
  shield: 'offhand',
};

/** Catégories d'armes indexées par clé (maniement, dégâts, portée, attributs…). */
const WEAPON_CATEGORY_BY_KEY = new Map<string, WeaponCategoryDef>(
  (weaponCategoryCatalog.weapon_categories as WeaponCategoryDef[]).map((c) => [c.key, c]),
);

/** Maniement (nombre de mains) par clé de catégorie d'arme. */
const WEAPON_HANDLING = new Map<string, number>(
  [...WEAPON_CATEGORY_BY_KEY.values()].map((c) => [c.key, c.handling]),
);

/** Libellés FR des attributs. */
const ATTRIBUTE_LABELS: Record<string, string> = {
  force: 'Force',
  dexterite: 'Dextérité',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  sagesse: 'Sagesse',
  charisme: 'Charisme',
};

/** Libellés FR des types de dégâts physiques. */
const DAMAGE_TYPE_LABELS: Record<string, string> = {
  slashing: 'Tranchant',
  piercing: 'Perforant',
  bludgeoning: 'Contondant',
};

/** Détail de combat d'une arme équipée, prêt à afficher sur la fiche. */
export interface EquippedWeapon {
  slotKey: string;
  slotLabel: string;
  name: string;
  minDamage: number;
  maxDamage: number;
  /** Dégâts min/max une fois le modificateur de l'attribut de dégâts appliqué. */
  modMin: number;
  modMax: number;
  damageType: string;
  attributeDamage: string;
  enduranceCost: number;
}

/** Catégories d'armes réservées à la main secondaire (jamais en main principale). */
const OFFHAND_ONLY_CATEGORIES = new Set(['handCrossbow']);

/** Contribution d'un objet équipé aux défenses et au poids. */
interface EquipmentStat {
  physicalArmor: number;
  magicalProtection: number;
  weight: number;
}

/**
 * Sacs à dos : ce sont des fiches d'équipement comme les autres. Une fiche est
 * un sac dès qu'elle annonce une capacité ou un allègement dans sa bande
 * d'identité — le build en dérive les valeurs dans equipment/index.json.
 */
const isBag = (e: ResourceIndexEntry): boolean =>
  e.capacityBonus != null || e.weightReductionPct != null;

/**
 * Part du poids des objets PORTÉS qui compte dans la charge. Bien réparti sur le
 * corps, l'équipement « pèse » moins qu'au fond du sac (≈ 50 %).
 */
const EQUIPPED_WEIGHT_FACTOR = 0.5;

@Component({
  selector: 'app-character-sheet',
  imports: [FormsModule, RouterLink, Navbar],
  templateUrl: './character-sheet.html',
  styleUrl: './character-sheet.css',
})
export class CharacterSheetEditor {
  private readonly sheets = inject(CharacterSheetService);
  private readonly wiki = inject(WikiLoaderService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // Modèle édité : objet simple lié par ngModel. Chaque modification passe par un
  // évènement DOM (input/click) qui déclenche la détection, donc les valeurs
  // calculées du template (modificateurs, poids total…) se rafraîchissent.
  model: CharacterSheet = emptySheet();
  sheetId: string | null = null;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);
  readonly exporting = signal(false);
  readonly importing = signal(false);

  // Listes chargées depuis les datasets JSON.
  readonly races = signal<RaceDef[]>([]);
  readonly backgrounds = signal<BackgroundDef[]>([]);
  readonly classes = signal<ClassDef[]>([]);
  /** Objets d'inventaire proposés (nom + poids) issus du wiki. */
  readonly itemCatalog = signal<{ name: string; weight: number }[]>([]);
  private readonly itemWeights = new Map<string, number>();
  /** Suggestions d'équipement par emplacement (datalists), issues du wiki. */
  readonly equipmentOptions = signal<Record<string, string[]>>({});
  /** Contribution (défense + poids) de chaque objet équipable, indexée par nom. */
  private readonly equipmentStats = signal<Map<string, EquipmentStat>>(new Map());
  /** Dégâts et catégorie des armes, indexés par nom (pour le détail combat de la fiche). */
  private readonly weaponInfo = signal<
    Map<string, { minDamage: number; maxDamage: number; weaponCategory?: string }>
  >(new Map());
  /** Sacs à dos indexés par nom (capacité, allègement, poids propre). */
  private readonly bagByName = signal<Map<string, ResourceIndexEntry>>(new Map());
  /** Objets du wiki indexés par slug (pour le matériel de départ des backgrounds). */
  private readonly itemBySlug = signal<Map<string, { name: string; weight: number }>>(new Map());
  /** Tenue/armure complète indexée par slug (pour l'auto-équipement). */
  private readonly outfitBySlug = signal<Map<string, ArmorEntry>>(new Map());
  /** Nom d'arme indexé par slug (pour l'auto-équipement). */
  private readonly weaponNameBySlug = signal<Map<string, string>>(new Map());

  // Constantes de l'univers exposées au template.
  readonly domains = MAGIC_DOMAINS;
  readonly attributes = ATTRIBUTES;
  readonly skills = SKILLS;
  readonly equipmentSlots = EQUIPMENT_SLOTS;
  readonly leftSlots = EQUIPMENT_SLOTS.filter((s) => s.side === 'left');
  readonly rightSlots = EQUIPMENT_SLOTS.filter((s) => s.side === 'right');
  readonly stats = STATS;
  readonly barStats = BAR_STATS;
  readonly defenseStats = DEFENSE_STATS;
  readonly magicDefenseSpark = MAGIC_DEFENSE_SPARK;

  readonly domainName = domainName;
  readonly domainSigil = domainSigil;
  readonly domainIcon = domainIcon;
  readonly formatBonus = formatBonus;

  constructor() {
    // Datasets pilotant les listes déroulantes race/sous-race/background/classe.
    this.wiki.load<RaceDef[]>('characters', 'races').subscribe((races) => this.races.set(races));
    this.wiki
      .load<BackgroundDef[]>('characters', 'backgrounds')
      .subscribe((bg) => this.backgrounds.set(bg));
    this.wiki.load<ClassDef[]>('characters', 'classes').subscribe((cls) => this.classes.set(cls));

    // Catalogue d'inventaire : agrège les index du wiki (objets + leur poids).
    forkJoin(
      INVENTORY_COLLECTIONS.map((c) =>
        this.wiki.loadAll<ResourceIndexEntry>(c).pipe(catchError(() => of([] as ResourceIndexEntry[]))),
      ),
    ).subscribe((lists) => {
      const byName = new Map<string, number>();
      const bySlug = new Map<string, { name: string; weight: number }>();
      for (const entry of lists.flat()) {
        if (entry?.name && !byName.has(entry.name)) byName.set(entry.name, entry.weight ?? 0);
        // Slug → objet : sert à résoudre le matériel de départ d'un background.
        if (entry?.slug && !bySlug.has(entry.slug)) {
          bySlug.set(entry.slug, { name: entry.name, weight: entry.weight ?? 0 });
        }
      }
      this.itemBySlug.set(bySlug);
      this.itemWeights.clear();
      byName.forEach((w, name) => this.itemWeights.set(name, w));
      this.itemCatalog.set(
        [...byName.entries()]
          .map(([name, weight]) => ({ name, weight }))
          .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      );
    });

    // Suggestions d'équipement : armes (slots arme) + pièces d'armure par emplacement.
    // Les index d'armes ne portent que nom/poids : les dégâts et la catégorie
    // (maniement, type de dégâts, attribut, endurance) ne vivent que dans la
    // fiche détaillée de chaque arme, qu'on va donc chercher entrée par entrée.
    const weapons$ = forkJoin(
      WEAPON_COLLECTIONS.map((col) =>
        this.wiki.loadAll<ResourceIndexEntry>(col).pipe(
          catchError(() => of([] as ResourceIndexEntry[])),
          switchMap((index) =>
            index.length
              ? forkJoin(
                  index.map((e) =>
                    this.wiki.load<WeaponEntry>(col, e.slug).pipe(
                      map((w) => ({
                        ...e,
                        weaponCategory: w.weaponCategory ?? e.weaponCategory,
                        minDamage: w.minDamage ?? e.minDamage,
                        maxDamage: w.maxDamage ?? e.maxDamage,
                      })),
                      catchError(() => of(e)),
                    ),
                  ),
                )
              : of([] as ResourceIndexEntry[]),
          ),
        ),
      ),
    ).pipe(map((lists) => lists.flat()));

    const armorSets$ = forkJoin(
      ARMOR_COLLECTIONS.map((col) =>
        this.wiki.loadAll<ResourceIndexEntry>(col).pipe(
          catchError(() => of([] as ResourceIndexEntry[])),
          switchMap((index) =>
            index.length
              ? forkJoin(
                  index.map((e) =>
                    this.wiki.load<ArmorEntry>(col, e.slug).pipe(
                      map((set) => ({ slug: e.slug, set })),
                      catchError(() => of(null)),
                    ),
                  ),
                )
              : of([] as ({ slug: string; set: ArmorEntry } | null)[]),
          ),
        ),
      ),
    ).pipe(map((lists) => lists.flat()));

    // Sacs à dos : les fiches d'équipement qui annoncent une capacité ou un allègement.
    const bags$ = this.wiki.loadAll<ResourceIndexEntry>('equipment').pipe(
      catchError(() => of([] as ResourceIndexEntry[])),
      map((index) => index.filter(isBag)),
    );

    forkJoin([weapons$, armorSets$, bags$]).subscribe(([weapons, sets, bags]) => {
      const opts: Record<string, string[]> = {
        head: [], chest: [], legs: [], feet: [],
        weapon: [], offhand: [], amulet: [], ring: [], bag: [],
      };
      const stats = new Map<string, EquipmentStat>();
      const weapons2 = new Map<string, { minDamage: number; maxDamage: number; weaponCategory?: string }>();
      const weaponNames = new Map<string, string>();
      const outfits = new Map<string, ArmorEntry>();
      const push = (slot: string, name: string) => {
        if (name && !opts[slot].includes(name)) opts[slot].push(name);
      };

      // Sacs à dos : proposés dans l'emplacement « bag », avec leur poids propre.
      for (const b of bags) {
        push('bag', b.name);
        stats.set(b.name, { physicalArmor: 0, magicalProtection: 0, weight: b.weight ?? 0 });
      }
      this.bagByName.set(new Map(bags.map((b) => [b.name, b])));

      // Armes : main principale (sauf catégories réservées) et/ou main secondaire (1 main).
      for (const w of weapons) {
        if (!w.name) continue;
        const handling = w.weaponCategory ? WEAPON_HANDLING.get(w.weaponCategory) ?? 1 : 1;
        const offhandOnly = !!w.weaponCategory && OFFHAND_ONLY_CATEGORIES.has(w.weaponCategory);
        if (!offhandOnly) push('weapon', w.name);
        if (handling === 1) push('offhand', w.name);
        stats.set(w.name, { physicalArmor: 0, magicalProtection: 0, weight: w.weight ?? 0 });
        weapons2.set(w.name, {
          minDamage: w.minDamage ?? 0,
          maxDamage: w.maxDamage ?? 0,
          weaponCategory: w.weaponCategory,
        });
        if (w.slug) weaponNames.set(w.slug, w.name);
      }

      // Pièces d'armure (et boucliers) : ventilées par emplacement, avec leurs protections.
      for (const item of sets) {
        if (!item) continue;
        outfits.set(item.slug, item.set);
        for (const piece of item.set?.pieces ?? []) {
          const slot = PIECE_TO_EQUIP_SLOT[piece.slot];
          if (!slot) continue;
          const label = piece.label || item.set?.name || piece.slot;
          push(slot, label);
          stats.set(label, {
            physicalArmor: piece.physicalArmor ?? 0,
            magicalProtection: piece.magicalProtection ?? 0,
            weight: piece.weight ?? 0,
          });
        }
      }

      for (const key of Object.keys(opts)) {
        opts[key].sort((a, b) => a.localeCompare(b, 'fr'));
      }
      this.equipmentOptions.set(opts);
      this.equipmentStats.set(stats);
      this.weaponInfo.set(weapons2);
      this.outfitBySlug.set(outfits);
      this.weaponNameBySlug.set(weaponNames);
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.load(id);
  }

  /** Sous-races disponibles pour la race actuellement sélectionnée. */
  get subracesForSelected(): SubraceDef[] {
    return this.races().find((r) => r.name === this.model.identity.race)?.subraces ?? [];
  }

  /** Sous-backgrounds disponibles pour le background sélectionné. */
  get subbackgroundsForSelected(): SubraceDef[] {
    return (
      this.backgrounds().find((b) => b.name === this.model.identity.background)?.subbackgrounds ?? []
    );
  }

  /** Définition du sous-background sélectionné (porte tenue + arme de départ). */
  get selectedSubbackground(): SubraceDef | undefined {
    return this.subbackgroundsForSelected.find((s) => s.name === this.model.identity.subbackground);
  }

  /** Vrai si on peut auto-équiper : un sous-background est choisi et ses sets sont chargés. */
  get canAutoEquip(): boolean {
    const sub = this.selectedSubbackground;
    return (
      !!sub &&
      (this.outfitBySlug().has(sub.key) || !!sub.startingWeapon || !!sub.startingItems?.length)
    );
  }

  /** Équipe la tenue, l'arme et le matériel de départ du sous-background sélectionné. */
  autoEquipStartingGear(): void {
    const sub = this.selectedSubbackground;
    if (!sub) return;
    const outfit = this.outfitBySlug().get(sub.key);
    if (outfit) {
      for (const piece of outfit.pieces ?? []) {
        const slot = PIECE_TO_EQUIP_SLOT[piece.slot];
        if (slot) this.model.equipment[slot] = piece.label || outfit.name;
      }
    }
    const weaponName = sub.startingWeapon
      ? this.weaponNameBySlug().get(sub.startingWeapon)
      : undefined;
    if (weaponName) this.model.equipment['weapon'] = weaponName;

    // Matériel de départ : un sac à dos va dans son emplacement, le reste à
    // l'inventaire. Idempotent : re-cliquer n'empile pas les doublons.
    const bySlug = this.itemBySlug();
    const bags = this.bagByName();
    for (const slug of sub.startingItems ?? []) {
      const item = bySlug.get(slug);
      if (!item) continue;
      if (bags.has(item.name)) {
        this.model.equipment['bag'] = item.name;
        continue;
      }
      if (this.model.inventory.some((line) => line.name === item.name)) continue;
      this.model.inventory.push({ name: item.name, qty: 1, weight: item.weight });
    }
  }

  /** À chaque changement de race, on invalide une sous-race devenue incohérente. */
  onRaceChange(): void {
    const valid = this.subracesForSelected.some((s) => s.name === this.model.identity.subrace);
    if (!valid) this.model.identity.subrace = '';
  }

  /** Idem pour le background → sous-background. */
  onBackgroundChange(): void {
    const valid = this.subbackgroundsForSelected.some(
      (s) => s.name === this.model.identity.subbackground,
    );
    if (!valid) this.model.identity.subbackground = '';
  }

  // ── Expérience ─────────────────────────────────────────────────────────────

  readonly maxLevel = MAX_LEVEL;
  readonly xpMax = XP_MAX;

  /** Avancement dans le niveau courant (barre, restant, seuils). */
  get xp(): XpProgress {
    return xpProgress(this.model.xp);
  }

  /** Coût du palier suivant, pour l'afficher sans recalcul dans le gabarit. */
  get xpToNext(): number {
    return xpToNextLevel(this.model.level);
  }

  /**
   * Saisie d'XP : borne la valeur puis en redéduit le niveau. L'XP est la
   * source de vérité, le niveau la suit.
   */
  onXpChange(): void {
    const xp = Math.round(Number(this.model.xp) || 0);
    this.model.xp = Math.max(0, Math.min(XP_MAX, xp));
    this.model.level = levelForXp(this.model.xp);
  }

  /**
   * Saisie directe du niveau — pratique pour poser un personnage sans compter
   * ses XP. On borne, puis on cale l'XP au seuil du niveau demandé, sauf si
   * l'XP courant y correspond déjà : sinon changer le niveau perdrait
   * l'avancement en cours dès qu'on repasse sur le champ.
   */
  clampLevel(): void {
    const n = Math.round(Number(this.model.level) || 1);
    this.model.level = Math.max(1, Math.min(MAX_LEVEL, n));
    if (levelForXp(this.model.xp) !== this.model.level) {
      this.model.xp = xpForLevel(this.model.level);
    }
  }

  /** Ajoute (ou retire) des XP — les boutons de gain rapide. */
  addXp(amount: number): void {
    this.model.xp = Math.max(0, Math.min(XP_MAX, Math.round(Number(this.model.xp) || 0) + amount));
    this.model.level = levelForXp(this.model.xp);
  }

  // ── Race / classe / traits / stats calculées ───────────────────────────────

  /** Définition de la race actuellement sélectionnée. */
  get selectedRace(): RaceDef | undefined {
    return this.races().find((r) => r.name === this.model.identity.race);
  }

  /** Définition de la classe actuellement sélectionnée. */
  get selectedClass(): ClassDef | undefined {
    return this.classes().find((c) => c.name === this.model.identity.class);
  }

  /** Définition du background actuellement sélectionné. */
  get selectedBackground(): BackgroundDef | undefined {
    return this.backgrounds().find((b) => b.name === this.model.identity.background);
  }

  // ── Bourse ─────────────────────────────────────────────────────────────────

  /** Or de départ, tiré entre min/max du background et lié à la graine. */
  get goldBase(): number {
    return computeGold(this.model, this.selectedBackground);
  }

  /**
   * Bourse courante = tirage de départ + tout ce que la partie a rapporté ou
   * coûté. Modifiable : la saisie est reconvertie en écart, pour que la base
   * reste celle du background.
   */
  get gold(): number {
    return purseTotal(this.goldBase, this.model.goldDelta);
  }

  set gold(value: number) {
    this.model.goldDelta = purseDelta(this.goldBase, value);
  }

  /** Ajoute (ou retire) des pièces, sans jamais passer sous zéro. */
  addGold(amount: number): void {
    this.gold = this.gold + amount;
  }

  /** Vrai si la bourse a bougé depuis le tirage du background. */
  get goldAdjusted(): boolean {
    return this.model.goldDelta !== 0;
  }

  /** Revient au montant tiré par le background. */
  resetGold(): void {
    this.model.goldDelta = 0;
  }

  /** Sorts de la classe, triés par niveau requis. */
  get classSpells(): ClassSpell[] {
    return [...(this.selectedClass?.spells ?? [])].sort((a, b) => a.level - b.level);
  }

  /** Un sort de classe est débloqué quand le niveau du perso l'atteint. */
  spellUnlocked(spell: ClassSpell): boolean {
    return this.model.level >= spell.level;
  }

  /** Sorts de classe effectivement débloqués (pour la fiche). */
  get unlockedClassSpells(): ClassSpell[] {
    return this.classSpells.filter((s) => this.spellUnlocked(s));
  }

  /** Traits accordés par la race + la sous-race + le background (icône par défaut). */
  get traits(): TraitDef[] {
    return grantedTraits(this.selectedRace, this.model.identity.subrace, this.selectedBackground).map(
      (t) => ({ ...t, icon: t.icon ?? DEFAULT_TRAIT_ICON }),
    );
  }

  /** Somme des contributions de l'équipement porté : défenses + poids. */
  get equipmentBonus(): { def_phy: number; def_mag: number; weight: number } {
    const stats = this.equipmentStats();
    let defPhy = 0;
    let defMag = 0;
    let weight = 0;
    for (const slot of EQUIPMENT_SLOTS) {
      const name = this.model.equipment[slot.key];
      const s = name ? stats.get(name) : undefined;
      if (!s) continue;
      defPhy += s.physicalArmor;
      defMag += s.magicalProtection;
      weight += s.weight;
    }
    return { def_phy: defPhy, def_mag: defMag, weight: this.round2(weight) };
  }

  /** Détail combat des armes équipées (main + secondaire), pour l'affichage de la fiche. */
  get equippedWeapons(): EquippedWeapon[] {
    const info = this.weaponInfo();
    const out: EquippedWeapon[] = [];
    for (const slot of EQUIPMENT_SLOTS) {
      if (slot.key !== 'weapon' && slot.key !== 'offhand') continue;
      const name = this.model.equipment[slot.key];
      const w = name ? info.get(name) : undefined;
      if (!w) continue;
      const cat = w.weaponCategory ? WEAPON_CATEGORY_BY_KEY.get(w.weaponCategory) : undefined;
      const mod = cat ? abilityModifier(this.finalAttributes[cat.attributeDamage]) : 0;
      out.push({
        slotKey: slot.key,
        slotLabel: slot.label,
        name,
        minDamage: w.minDamage,
        maxDamage: w.maxDamage,
        modMin: Math.max(0, w.minDamage + mod),
        modMax: Math.max(0, w.maxDamage + mod),
        damageType: cat ? DAMAGE_TYPE_LABELS[cat.damageType] ?? cat.damageType : '—',
        attributeDamage: cat ? ATTRIBUTE_LABELS[cat.attributeDamage] ?? cat.attributeDamage : '—',
        enduranceCost: cat?.enduranceCost ?? 0,
      });
    }
    return out;
  }

  /** Arme équipée dans un emplacement donné (pour afficher ses dégâts dans le slot). */
  weaponForSlot(slotKey: string): EquippedWeapon | undefined {
    return this.equippedWeapons.find((w) => w.slotKey === slotKey);
  }

  /** Valeurs de protection de la pièce équipée dans un emplacement (armure + magie). */
  armorForSlot(slotKey: string): { physicalArmor: number; magicalProtection: number } | undefined {
    const name = this.model.equipment[slotKey];
    const s = name ? this.equipmentStats().get(name) : undefined;
    if (!s || (s.physicalArmor === 0 && s.magicalProtection === 0)) return undefined;
    return { physicalArmor: s.physicalArmor, magicalProtection: s.magicalProtection };
  }

  /** Stats finales = génétique + montée de niveau (+ modif. d'attribut) + traits + équipement. */
  get finalStats(): Record<StatKey, number> {
    const stats = computeStats(
      this.model,
      this.selectedRace,
      this.selectedClass,
      this.traits,
      this.finalAttributes,
    );
    const eq = this.equipmentBonus;
    stats.def_phy += eq.def_phy;
    stats.def_mag += eq.def_mag;
    return stats;
  }

  /** Détail du calcul d'une stat (pour l'infobulle de vérification). */
  statParts(statKey: StatKey): StatContribution[] {
    const parts = statContributions(
      this.model,
      this.selectedRace,
      this.selectedClass,
      this.traits,
      this.finalAttributes,
      statKey,
    ).parts;
    if (statKey === 'def_phy' || statKey === 'def_mag') {
      const eq = this.equipmentBonus;
      const value = statKey === 'def_phy' ? eq.def_phy : eq.def_mag;
      if (value) parts.push({ label: 'Équipement', value });
    }
    return parts;
  }

  /** Échelle des barres = plus haute valeur THÉORIQUE par niveau (classe +
   *  modif. d'attribut + génétique) parmi les stats en barre. */
  get barScale(): number {
    return maxTheoreticalScale(
      this.model,
      this.selectedRace,
      this.selectedClass,
      this.traits,
      this.finalAttributes,
      this.barStats.map((s) => s.key),
    );
  }

  /** Largeur (%) d'une barre, relative à la plus haute stat, bornée 0–100. */
  barPct(value: number, max: number): number {
    return Math.min(100, Math.max(0, (Math.max(0, value) / max) * 100));
  }

  /** Bascule entre tirage aléatoire et moyenne. */
  setStatMode(mode: StatMode): void {
    this.model.statMode = mode;
  }

  /** Relance le tirage aléatoire des stats (nouvelle graine). */
  rerollStats(): void {
    this.model.statSeed = randomSeed();
  }

  /**
   * Redimensionne et recompresse une image (WebP, repli PNG) pour alléger
   * fortement la fiche. C'est aussi la définition qui partira dans le PDF, où
   * l'image est retranscodée en JPEG (cf. `toPdfImage` dans sheet-pdf.ts).
   */
  private compressImage(file: File, maxDim: number, quality = 0.82): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas'));
        ctx.drawImage(img, 0, 0, w, h);
        let out = canvas.toDataURL('image/webp', quality);
        if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
        resolve(out);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image'));
      };
      img.src = url;
    });
  }

  /** Lit, valide, compresse une image puis confie son data URL à `assign`. */
  private async readImage(
    event: Event,
    maxBytes: number,
    maxDim: number,
    assign: (url: string) => void,
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permet de re-sélectionner le même fichier plus tard
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('Le fichier choisi n’est pas une image.');
      return;
    }
    if (file.size > maxBytes) {
      this.error.set(`Image trop lourde (max ${Math.round(maxBytes / 1024 / 1024)} Mo).`);
      return;
    }
    this.error.set(null);
    try {
      assign(await this.compressImage(file, maxDim));
    } catch {
      this.error.set('Image illisible.');
    }
  }

  // Image originale du portrait, gardée en mémoire pour recadrer à la volée.
  private portraitImg: HTMLImageElement | null = null;

  async onPortraitSelected(event: Event): Promise<void> {
    await this.readImage(event, MAX_PORTRAIT_BYTES, 512, (url) => {
      this.model.identity.portraitOriginal = url;
      this.model.identity.portraitZoom = 1;
      this.model.identity.portraitPosX = 50;
      this.model.identity.portraitPosY = 50;
    });
    if (this.model.identity.portraitOriginal) this.loadPortraitOriginal(true);
  }

  removePortrait(): void {
    this.portraitImg = null;
    this.model.identity.portrait = '';
    this.model.identity.portraitOriginal = '';
    this.model.identity.portraitZoom = 1;
    this.model.identity.portraitPosX = 50;
    this.model.identity.portraitPosY = 50;
  }

  /** Charge l'image originale en mémoire ; rebake ensuite si demandé. */
  private loadPortraitOriginal(rebake = false): void {
    const src = this.model.identity.portraitOriginal;
    if (!src) {
      this.portraitImg = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      this.portraitImg = img;
      if (rebake) this.rebakePortrait();
    };
    img.src = src;
  }

  /** Recadre le portrait (zoom + point focal) dans une image cuite, façon
   *  object-fit: cover. L'image stockée est donc déjà recadrée → même cadrage
   *  dans l'aperçu et dans le PDF. */
  rebakePortrait(): void {
    const img = this.portraitImg;
    if (!img || !img.naturalWidth) return;
    const TW = 240;
    const TH = 296; // ratio proche du cadre de la fiche
    const aspect = TW / TH;
    const i = this.model.identity;
    const zoom = Math.max(1, Number(i.portraitZoom) || 1);
    const px = Math.min(100, Math.max(0, Number(i.portraitPosX) || 0));
    const py = Math.min(100, Math.max(0, Number(i.portraitPosY) || 0));

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    let rw: number;
    let rh: number;
    if (iw / ih > aspect) {
      rh = ih;
      rw = ih * aspect;
    } else {
      rw = iw;
      rh = iw / aspect;
    }
    rw /= zoom;
    rh /= zoom;
    const rx = (iw - rw) * (px / 100);
    const ry = (ih - rh) * (py / 100);

    const canvas = document.createElement('canvas');
    canvas.width = TW;
    canvas.height = TH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, rx, ry, rw, rh, 0, 0, TW, TH);
    let out = canvas.toDataURL('image/webp', 0.85);
    if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
    this.model.identity.portrait = out;
  }

  onFullImageSelected(event: Event): void {
    void this.readImage(event, MAX_FULL_IMAGE_BYTES, 1024, (url) => (this.model.identity.fullImage = url));
  }

  removeFullImage(): void {
    this.model.identity.fullImage = '';
  }

  private load(id: string): void {
    this.sheetId = id;
    this.loading.set(true);
    this.sheets.get(id).subscribe({
      next: (stored) => {
        this.model = this.normalize(stored.data);
        this.loadPortraitOriginal(false); // permet de réajuster le recadrage
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Fiche introuvable.');
        this.loading.set(false);
      },
    });
  }

  // Complète une fiche reçue avec les valeurs par défaut manquantes (robustesse
  // si le modèle évolue ou si une fiche ancienne n'a pas tous les champs).
  private normalize(data: Partial<CharacterSheet>): CharacterSheet {
    const base = emptySheet();
    // XP d'abord : c'est lui qui fixe le niveau. Une fiche antérieure à ce champ
    // n'a qu'un niveau — on la place alors au seuil exact de ce niveau.
    const level = Math.max(1, Math.min(MAX_LEVEL, Math.round(Number(data.level) || 1)));
    const xp =
      typeof data.xp === 'number' && Number.isFinite(data.xp)
        ? Math.max(0, Math.min(XP_MAX, Math.round(data.xp)))
        : xpForLevel(level);

    return {
      identity: { ...base.identity, ...data.identity },
      xp,
      level: levelForXp(xp),
      domains: Array.isArray(data.domains) ? data.domains.slice(0, 3) : base.domains,
      attributes: { ...base.attributes, ...data.attributes },
      attributeMode: data.attributeMode === 'roll' ? 'roll' : 'pointbuy',
      attributePointBuy: { ...base.attributePointBuy!, ...data.attributePointBuy },
      attributeRolls: Array.isArray(data.attributeRolls) ? data.attributeRolls : [],
      attributeAssign: { ...base.attributeAssign!, ...data.attributeAssign },
      statMode: data.statMode === 'mean' ? 'mean' : 'random',
      // Graine stockée conservée (stats stables) ; sinon valeur stable par défaut.
      statSeed: typeof data.statSeed === 'number' ? data.statSeed : 1,
      proficiencyBonus: data.proficiencyBonus ?? base.proficiencyBonus,
      skills: Array.isArray(data.skills) ? data.skills : [],
      spells: this.normalizeSpells(data.spells),
      goldDelta: Math.round(Number(data.goldDelta) || 0),
      inventory: data.inventory ?? [],
      equipment: { ...base.equipment, ...data.equipment },
      notes: data.notes ?? '',
    };
  }

  /**
   * Normalise le bloc de sorts. Accepte le nouveau format
   * `{ unlocked, equipped }` et migre l'ancien `{ known: Spell[] }` en gardant
   * uniquement les clés en `unlocked` (migration « débloqués seulement »).
   */
  private normalizeSpells(s: unknown): CharacterSpells {
    const rec = (s ?? {}) as {
      unlocked?: unknown; equipped?: unknown; nodes?: unknown; ranks?: unknown; known?: unknown;
    };
    const uniqStrings = (arr: unknown): string[] =>
      Array.isArray(arr) ? [...new Set(arr.filter((k): k is string => typeof k === 'string' && !!k))] : [];

    // Clés débloquées (nouveau format `unlocked`, sinon migration de l'ancien `known`).
    const unlockedRaw = Array.isArray(rec.unlocked)
      ? uniqStrings(rec.unlocked)
      : uniqStrings((Array.isArray(rec.known) ? rec.known : []).map((x) => (x as { key?: unknown })?.key));
    const unlocked = unlockedRaw.filter((k) => !!findDomainSpell(k));

    const nodesSrc = (rec.nodes && typeof rec.nodes === 'object' ? rec.nodes : {}) as Record<string, unknown>;
    const ranksSrc = (rec.ranks && typeof rec.ranks === 'object' ? rec.ranks : {}) as Record<string, unknown>;

    const nodes: Record<string, string[]> = {};
    for (const k of unlocked) {
      if (Array.isArray(nodesSrc[k])) {
        nodes[k] = this.sanitizeNodeSet(k, (nodesSrc[k] as unknown[]).filter((x): x is string => typeof x === 'string'));
      } else if (typeof ranksSrc[k] === 'number') {
        nodes[k] = this.trunkPath(k, Math.max(1, Math.round(Number(ranksSrc[k])))); // migration rang → chemin de tronc
      } else {
        nodes[k] = this.sanitizeNodeSet(k, []); // racine seule
      }
    }

    const equipped = uniqStrings(rec.equipped).filter((k) => unlocked.includes(k));
    return { unlocked, equipped, nodes };
  }

  /** Nettoie un ensemble de nœuds : garde ceux de l'arbre, force la racine, élague les orphelins. */
  private sanitizeNodeSet(key: string, ids: string[]): string[] {
    const tree = spellTree(key);
    if (!tree) return ['__root__'];
    const valid = new Set(tree.nodes.map((n) => n.id));
    const set = new Set(ids.filter((id) => valid.has(id)));
    set.add(tree.root);
    const parentOf = new Map<string, string>();
    for (const n of tree.nodes) for (const c of n.next ?? []) parentOf.set(c, n.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...set]) {
        if (id === tree.root) continue;
        const p = parentOf.get(id);
        if (!p || !set.has(p)) { set.delete(id); changed = true; }
      }
    }
    return [...set];
  }

  /** Chemin du tronc (racine puis premier enfant à répétition) sur `count` nœuds — pour la migration des rangs. */
  private trunkPath(key: string, count: number): string[] {
    const tree = spellTree(key);
    if (!tree) return ['__root__'];
    const path = [tree.root];
    let cur = tree.root;
    while (path.length < count) {
      const nxt = tree.nodes.find((n) => n.id === cur)?.next?.[0];
      if (!nxt) break;
      path.push(nxt);
      cur = nxt;
    }
    return path;
  }

  // ── Valeurs calculées (appelées dans le template) ──────────────────────────

  /** Attributs finaux = base saisie + bonus de race + bonus de sous-race. */
  get finalAttributes(): Record<AttributeKey, number> {
    return computeAttributes(this.model, this.selectedRace, this.model.identity.subrace);
  }

  /** Bonus de race/sous-race pour un attribut (0 si aucun). */
  attrBonus(key: AttributeKey): number {
    return attributeBonuses(this.selectedRace, this.model.identity.subrace)[key];
  }

  // ── Achat de points des attributs (point-buy : base 8, budget 27, max 15) ──

  readonly baseAttribute = BASE_ATTRIBUTE;
  readonly minAttribute = MIN_ATTRIBUTE;
  readonly maxAttribute = MAX_ATTRIBUTE;
  readonly attributePoints = ATTRIBUTE_POINTS;

  /** Points dépensés = somme des coûts d'achat de chaque score (14/15 plus chers ;
   *  descendre sous 8 rend des points). */
  get pointsSpent(): number {
    return this.attributes.reduce(
      (sum, a) => sum + attributeCost(this.model.attributes[a.key]),
      0,
    );
  }

  get pointsRemaining(): number {
    return this.attributePoints - this.pointsSpent;
  }

  /** Vrai si on peut encore monter cet attribut (sous le max et budget suffisant). */
  canIncAttr(key: AttributeKey): boolean {
    const score = this.model.attributes[key];
    return score < MAX_ATTRIBUTE && this.pointsRemaining >= attributeIncrementCost(score);
  }

  /** Vrai si on peut encore baisser cet attribut (au-dessus du plancher). */
  canDecAttr(key: AttributeKey): boolean {
    return this.model.attributes[key] > MIN_ATTRIBUTE;
  }

  incAttr(key: AttributeKey): void {
    if (this.canIncAttr(key)) this.model.attributes[key]++;
  }

  decAttr(key: AttributeKey): void {
    if (this.canDecAttr(key)) this.model.attributes[key]--;
  }

  // ── Mode de génération des attributs (achat de points ou lancer de dés) ─────

  get attributeMode(): 'pointbuy' | 'roll' {
    return this.model.attributeMode ?? 'pointbuy';
  }

  /** Bascule le mode en conservant l'état de chaque mode (achat de points vs dés). */
  setAttributeMode(mode: 'pointbuy' | 'roll'): void {
    if (this.attributeMode === mode) return;
    if (mode === 'roll') {
      // On quitte l'achat de points : on mémorise ses scores, puis on rétablit les dés.
      this.model.attributePointBuy = { ...this.model.attributes };
      this.model.attributeMode = 'roll';
      this.applyRollAssignment();
    } else {
      // On revient à l'achat de points : on restaure les scores mémorisés.
      this.model.attributeMode = 'pointbuy';
      this.model.attributes = {
        ...(this.model.attributePointBuy ?? this.model.attributes),
      };
    }
  }

  private resetAssignment(): void {
    this.model.attributeAssign = Object.fromEntries(
      this.attributes.map((a) => [a.key, -1]),
    ) as Record<AttributeKey, number>;
  }

  /** Recalcule les scores depuis l'affectation des dés (base si non affecté). */
  private applyRollAssignment(): void {
    for (const a of this.attributes) {
      const idx = this.assignmentOf(a.key);
      this.model.attributes[a.key] =
        idx >= 0 ? this.attributeRolls[idx] ?? BASE_ATTRIBUTE : BASE_ATTRIBUTE;
    }
  }

  /** Valeurs actuellement tirées (4d6, dé le plus bas retiré). */
  get attributeRolls(): number[] {
    return this.model.attributeRolls ?? [];
  }

  /** Lance 6 fois 4d6 (dé le plus bas retiré) et réinitialise l'affectation. */
  rollAttributes(): void {
    this.model.attributeRolls = Array.from({ length: 6 }, () => roll4d6DropLowest());
    this.resetAssignment();
    this.applyRollAssignment();
  }

  /** Index du tirage affecté à un attribut (-1 si aucun). */
  assignmentOf(key: AttributeKey): number {
    return this.model.attributeAssign?.[key] ?? -1;
  }

  /** Tirages disponibles pour un attribut : ceux non pris par un autre attribut. */
  rollOptionsFor(key: AttributeKey): { idx: number; value: number }[] {
    const assign = this.model.attributeAssign ?? ({} as Record<AttributeKey, number>);
    const used = new Set(
      this.attributes.filter((a) => a.key !== key).map((a) => assign[a.key]).filter((i) => i >= 0),
    );
    return this.attributeRolls
      .map((value, idx) => ({ idx, value }))
      .filter((o) => !used.has(o.idx));
  }

  /** Affecte (ou retire) un tirage à un attribut et met à jour le score. */
  assignRoll(key: AttributeKey, idx: number): void {
    const assign =
      this.model.attributeAssign ??
      (this.model.attributeAssign = Object.fromEntries(
        this.attributes.map((a) => [a.key, -1]),
      ) as Record<AttributeKey, number>);
    assign[key] = idx;
    this.model.attributes[key] = idx >= 0 ? this.attributeRolls[idx] ?? BASE_ATTRIBUTE : BASE_ATTRIBUTE;
  }

  /** Vrai si un tirage donné est déjà affecté à un attribut. */
  isRollUsed(idx: number): boolean {
    const assign = this.model.attributeAssign ?? ({} as Record<AttributeKey, number>);
    return this.attributes.some((a) => assign[a.key] === idx);
  }

  /** Nombre de tirages déjà affectés (sur 6). */
  get rollsAssigned(): number {
    return this.attributeRolls.length ? this.attributes.filter((a) => this.assignmentOf(a.key) >= 0).length : 0;
  }

  modifier(key: AttributeKey): number {
    return abilityModifier(this.finalAttributes[key]);
  }

  // ── Compétences ────────────────────────────────────────────────────────────

  readonly skillLabel = skillLabel;

  /** Bonus de compétences accordés par le background (clé → valeur). */
  get backgroundSkills(): Map<string, number> {
    return backgroundSkillBonuses(this.selectedBackground);
  }

  /** Compétences sélectionnables pour la classe (clés). */
  get classSkillOptions(): string[] {
    return this.selectedClass?.skillOptions ?? [];
  }

  /** Nombre de compétences à choisir pour la classe. */
  get classSkillChoices(): number {
    return this.selectedClass?.skillChoices ?? 0;
  }

  /** Compétences choisies valides (présentes dans les options de la classe). */
  get chosenSkillCount(): number {
    const opts = this.classSkillOptions;
    return this.model.skills.filter((k) => opts.includes(k)).length;
  }

  isSkillChosen(key: string): boolean {
    return this.model.skills.includes(key);
  }

  /** Vraie si la compétence est « entraînée » (choisie via classe OU background). */
  isSkillTrained(key: string): boolean {
    return this.isSkillChosen(key) || (this.backgroundSkills.get(key) ?? 0) > 0;
  }

  toggleSkill(key: string): void {
    const i = this.model.skills.indexOf(key);
    if (i >= 0) {
      this.model.skills.splice(i, 1);
    } else if (this.chosenSkillCount < this.classSkillChoices) {
      this.model.skills.push(key);
    }
  }

  /** Au changement de classe : on retire les choix hors des nouvelles options. */
  onClassChange(): void {
    const opts = this.classSkillOptions;
    this.model.skills = this.model.skills.filter((k) => opts.includes(k));
  }

  /** Bonus total : mod. attribut + valeurs du background + maîtrise (si choisie). */
  skillBonus(skillKey: string, attribute: AttributeKey): number {
    const bg = this.backgroundSkills.get(skillKey) ?? 0;
    const prof = this.isSkillChosen(skillKey) ? this.model.proficiencyBonus : 0;
    return abilityModifier(this.finalAttributes[attribute]) + bg + prof;
  }

  /** Arrondi à 2 décimales (évite les flottants type 0.30000000000004). */
  round2(n: number): number {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  /** Sac à dos actuellement équipé (donne un bonus de capacité et/ou allège le sac). */
  get equippedBag(): ResourceIndexEntry | undefined {
    return this.bagByName().get(this.model.equipment['bag'] ?? '');
  }

  get totalWeight(): number {
    // Contenu du sac, éventuellement allégé par le sac à dos équipé.
    const reduction = (this.equippedBag?.weightReductionPct ?? 0) / 100;
    const inventory =
      this.model.inventory.reduce(
        (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.weight) || 0),
        0,
      ) *
      (1 - reduction);
    // Équipement porté : ne compte qu'à 50 % (bien réparti sur le corps).
    const equipped = this.equipmentBonus.weight * EQUIPPED_WEIGHT_FACTOR;
    return this.round2(inventory + equipped);
  }

  /** Capacité de charge (kg) : 1,5 × score de Force + bonus du sac à dos équipé. */
  get carryCapacity(): number {
    return Math.round(this.finalAttributes.force * 1.5) + (this.equippedBag?.capacityBonus ?? 0);
  }

  /** Vrai si le poids transporté dépasse la capacité. */
  get overweight(): boolean {
    return this.totalWeight > this.carryCapacity;
  }

  /** Borne la quantité d'un objet entre 1 et 99. */
  clampQty(item: { qty: number }): void {
    item.qty = Math.max(1, Math.min(99, Math.round(Number(item.qty) || 1)));
  }

  // Affichage « sous-valeur (valeur) » façon « Elfe continental (elfe) ».
  private compose(main: string, parenthetical: string): string {
    const m = main?.trim();
    const p = parenthetical?.trim();
    if (m && p) return `${m} (${p})`;
    return m || p || '';
  }

  get raceDisplay(): string {
    return this.compose(this.model.identity.subrace, this.model.identity.race);
  }

  get backgroundDisplay(): string {
    return this.compose(this.model.identity.subbackground, this.model.identity.background);
  }

  // ── Domaines de magie ──────────────────────────────────────────────────────

  isDomainSelected(key: string): boolean {
    return this.model.domains.includes(key);
  }

  toggleDomain(key: string): void {
    const selected = this.model.domains;
    const idx = selected.indexOf(key);
    if (idx >= 0) {
      selected.splice(idx, 1);
      this.pruneSpells(); // retirer les sorts d'un domaine désélectionné
    } else if (selected.length < 3) {
      selected.push(key);
    }
  }

  // ── Sorts : débloqués (appris) & équipés (loadout de combat) ────────────────

  /** Tout le pool de sorts de base des domaines choisis (+ combinaisons), trié par niveau puis nom. */
  get domainSpellPool(): DomainSpell[] {
    return availableSpellsFor(this.model.domains)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }

  /** Plafond de sorts équipés = 3 + modificateur d'Intelligence (jamais sous 3). */
  get equippedCap(): number {
    return 3 + Math.max(0, abilityModifier(this.finalAttributes.intelligence));
  }

  /* ── Points d'inspiration (débloquer & améliorer) ── */

  /** Points d'inspiration accordés par niveau selon la classe (0 si aucune). */
  get inspirationPerLevel(): number {
    return this.selectedClass?.inspirationPerLevel ?? 0;
  }
  /** Budget total = points/niveau × niveau. */
  get inspirationTotal(): number {
    return this.inspirationPerLevel * this.model.level;
  }
  /** Points dépensés = nombre total de nœuds débloqués (1 nœud = 1 point). */
  get inspirationSpent(): number {
    return this.model.spells.unlocked.reduce((sum, k) => sum + this.unlockedNodes(k).length, 0);
  }
  /** Points disponibles. */
  get inspirationLeft(): number {
    return this.inspirationTotal - this.inspirationSpent;
  }

  /* ── Amélioration par nœuds / choix de branche ── */

  /** Ids des nœuds débloqués d'un sort (inclut la racine si le sort est débloqué). */
  unlockedNodes(key: string): string[] {
    return this.model.spells.nodes[key] ?? [];
  }
  isNodeUnlocked(key: string, id: string): boolean {
    return this.unlockedNodes(key).includes(id);
  }

  /** Nœuds de l'arbre d'un sort, triés par palier puis par nom (pour l'affichage). */
  spellNodes(key: string): SpellTreeNode[] {
    return [...(spellTree(key)?.nodes ?? [])].sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  }
  /** Libellé de la branche d'un nœud (`trunk` → « Tronc commun »). */
  branchLabel(key: string, node: SpellTreeNode): string {
    if (!node.branch || node.branch === 'trunk') return 'Tronc commun';
    const b = spellTree(key)?.branches?.find((x) => x.id === node.branch);
    return b?.label ?? node.branch;
  }

  /** Parent d'un nœud dans l'arbre (le nœud dont `next` le contient), ou undefined si racine. */
  private nodeParent(key: string, id: string): string | undefined {
    return (spellTree(key)?.nodes ?? []).find((n) => (n.next ?? []).includes(id))?.id;
  }
  /** La racine est-elle ce nœud ? */
  isRootNode(key: string, id: string): boolean {
    return spellTree(key)?.root === id;
  }

  /** Branches sœurs : les autres enfants du même parent (choix alternatifs à une scission). */
  private nodeSiblings(key: string, id: string): string[] {
    const parent = this.nodeParent(key, id);
    if (!parent) return [];
    const p = (spellTree(key)?.nodes ?? []).find((n) => n.id === parent);
    return (p?.next ?? []).filter((c) => c !== id);
  }
  /** Une branche sœur a-t-elle déjà été choisie (verrouille ce palier) ? */
  isBranchExcluded(key: string, id: string): boolean {
    return !this.isNodeUnlocked(key, id) && this.nodeSiblings(key, id).some((sib) => this.isNodeUnlocked(key, sib));
  }

  /**
   * Peut-on débloquer ce palier ? Non déjà pris, parent débloqué (ou racine d'un
   * sort déjà débloqué), aucune branche sœur déjà choisie, et au moins 1 point
   * d'inspiration disponible.
   */
  canUnlockNode(key: string, id: string): boolean {
    if (!this.isSpellUnlocked(key) || this.isNodeUnlocked(key, id) || this.inspirationLeft < 1) return false;
    if (this.isRootNode(key, id)) return true; // la racine vient avec le déblocage
    const parent = this.nodeParent(key, id);
    return !!parent && this.isNodeUnlocked(key, parent) && !this.isBranchExcluded(key, id);
  }
  unlockNode(key: string, id: string): void {
    if (this.canUnlockNode(key, id)) this.model.spells.nodes[key] = [...this.unlockedNodes(key), id];
  }

  /** Un palier débloqué a-t-il un enfant débloqué (empêche son retrait) ? */
  private nodeHasUnlockedChild(key: string, id: string): boolean {
    const node = (spellTree(key)?.nodes ?? []).find((n) => n.id === id);
    return (node?.next ?? []).some((c) => this.isNodeUnlocked(key, c));
  }
  /** Peut-on retirer ce palier ? Débloqué, non racine, sans enfant débloqué. */
  canRemoveNode(key: string, id: string): boolean {
    return this.isNodeUnlocked(key, id) && !this.isRootNode(key, id) && !this.nodeHasUnlockedChild(key, id);
  }
  removeNode(key: string, id: string): void {
    if (this.canRemoveNode(key, id)) {
      this.model.spells.nodes[key] = this.unlockedNodes(key).filter((n) => n !== id);
    }
  }

  /** Rang affiché = plus haut palier débloqué (indicateur de puissance). */
  spellRank(key: string): number {
    const tiers = this.unlockedNodes(key)
      .map((id) => (spellTree(key)?.nodes ?? []).find((n) => n.id === id)?.tier ?? 1);
    return tiers.length ? Math.max(...tiers) : 1;
  }

  /**
   * Nom du palier courant d'un sort (le nom du nœud débloqué le plus avancé) —
   * plus reconnaissable que le nom de base. Repli sur le nom du sort si aucun arbre.
   */
  spellCurrentName(key: string): string {
    const tree = spellTree(key);
    const fallback = findDomainSpell(key)?.name ?? key;
    if (!tree) return fallback;
    const unlocked = this.unlockedNodes(key);
    let best: SpellTreeNode | undefined;
    for (const n of tree.nodes) {
      if (unlocked.includes(n.id) && (!best || n.tier > best.tier)) best = n;
    }
    return best?.name ?? fallback;
  }
  /** Rang maximal = nombre de paliers du sort. */
  spellMaxRank(key: string): number {
    return spellMaxTier(key);
  }
  /** Le sort a-t-il un arbre d'amélioration (plusieurs paliers) ? */
  hasSpellTree(key: string): boolean {
    return this.spellMaxRank(key) > 1;
  }

  isSpellUnlocked(key: string): boolean {
    return this.model.spells.unlocked.includes(key);
  }
  isSpellEquipped(key: string): boolean {
    return this.model.spells.equipped.includes(key);
  }

  /** Prérequis d'un sort encore non débloqués (résolus). */
  missingPrereqs(spell: DomainSpell): DomainSpell[] {
    return (spell.requires ?? [])
      .filter((k) => !this.isSpellUnlocked(k))
      .map((k) => findDomainSpell(k))
      .filter((s): s is DomainSpell => !!s);
  }

  /**
   * Peut-on débloquer ce sort ? Niveau atteint + prérequis débloqués + pas déjà
   * appris + au moins 1 point d'inspiration disponible.
   */
  canUnlock(spell: DomainSpell): boolean {
    return (
      !this.isSpellUnlocked(spell.key) &&
      spell.level <= this.model.level &&
      this.missingPrereqs(spell).length === 0 &&
      this.inspirationLeft >= 1
    );
  }

  /** Libellé de la raison de verrouillage (niveau, prérequis ou inspiration). */
  lockReason(spell: DomainSpell): string {
    if (spell.level > this.model.level) return `Niveau ${spell.level} requis`;
    const miss = this.missingPrereqs(spell);
    if (miss.length) return 'Requiert : ' + miss.map((m) => m.name).join(', ');
    if (this.inspirationLeft < 1) return "Plus de points d'inspiration";
    return '';
  }

  /** Noms des prérequis d'un sort (pour l'affichage). */
  requiresLabel(spell: DomainSpell): string {
    return (spell.requires ?? []).map((k) => findDomainSpell(k)?.name ?? k).join(', ');
  }

  unlockSpell(spell: DomainSpell): void {
    if (!this.canUnlock(spell)) return;
    this.model.spells.unlocked.push(spell.key);
    // Ouvre le nœud racine (= 1 point d'inspiration) ; sans arbre, une racine « fictive ».
    const root = spellTree(spell.key)?.root ?? '__root__';
    this.model.spells.nodes[spell.key] = [root];
  }

  /** Un sort débloqué a-t-il des dépendants débloqués (qui le requièrent) ? */
  hasUnlockedDependents(key: string): boolean {
    return this.model.spells.unlocked.some((k) => {
      const s = findDomainSpell(k);
      return !!s && (s.requires ?? []).includes(key);
    });
  }

  /** Oublie un sort débloqué (rend toute l'inspiration, retire l'équipement) — refusé s'il a des dépendants. */
  forgetSpell(key: string): void {
    if (this.hasUnlockedDependents(key)) return;
    this.model.spells.unlocked = this.model.spells.unlocked.filter((k) => k !== key);
    this.model.spells.equipped = this.model.spells.equipped.filter((k) => k !== key);
    delete this.model.spells.nodes[key];
  }

  /** Équipe / déséquipe un sort débloqué (dans la limite du plafond). */
  toggleEquip(key: string): void {
    if (!this.isSpellUnlocked(key)) return;
    const eq = this.model.spells.equipped;
    const i = eq.indexOf(key);
    if (i >= 0) {
      eq.splice(i, 1);
    } else if (eq.length < this.equippedCap) {
      eq.push(key);
    }
  }

  /** Domaines d'un sort : un seul pour un sort de base, tous les composants
   *  pour une combinaison. Sert à afficher leurs icônes sur la fiche. */
  domainSpellKeys(s: DomainSpell): string[] {
    const keys = s.components?.length ? s.components : [s.domain ?? ''];
    return keys.filter(Boolean);
  }

  /** Domaines d'un sort en toutes lettres (infobulles, export PDF). */
  domainSpellNames(s: DomainSpell): string {
    return this.domainSpellKeys(s).map((k) => domainName(k)).join(' + ');
  }

  /** Sorts débloqués résolus, triés par niveau (pour la fiche). */
  get unlockedSpells(): DomainSpell[] {
    return this.resolveSpellKeys(this.model.spells.unlocked);
  }
  /** Sorts équipés résolus, triés par niveau. */
  get equippedSpells(): DomainSpell[] {
    return this.resolveSpellKeys(this.model.spells.equipped);
  }
  /** Sorts débloqués mais non équipés (liste secondaire de la fiche). */
  get unlockedNotEquipped(): DomainSpell[] {
    return this.unlockedSpells.filter((s) => !this.isSpellEquipped(s.key));
  }

  private resolveSpellKeys(keys: string[]): DomainSpell[] {
    return keys
      .map((k) => findDomainSpell(k))
      .filter((s): s is DomainSpell => !!s)
      .sort((a, b) => a.level - b.level);
  }

  /** Retire des sorts débloqués/équipés/rangs ceux qui ne sont plus proposés (domaine retiré). */
  private pruneSpells(): void {
    const valid = new Set(availableSpellsFor(this.model.domains).map((s) => s.key));
    this.model.spells.unlocked = this.model.spells.unlocked.filter((k) => valid.has(k));
    const stillUnlocked = new Set(this.model.spells.unlocked);
    this.model.spells.equipped = this.model.spells.equipped.filter((k) => stillUnlocked.has(k));
    for (const k of Object.keys(this.model.spells.nodes)) {
      if (!stillUnlocked.has(k)) delete this.model.spells.nodes[k];
    }
  }

  addItem(): void {
    this.model.inventory.push({ name: '', qty: 1, weight: 0 });
  }

  removeItem(index: number): void {
    this.model.inventory.splice(index, 1);
  }

  /** Quand l'objet correspond à une entrée du wiki, on auto-remplit son poids. */
  onItemNameChange(item: { name: string; weight: number }): void {
    const w = this.itemWeights.get(item.name);
    if (w !== undefined) item.weight = w;
  }

  trackByIndex(index: number): number {
    return index;
  }

  // ── Persistance & impression ───────────────────────────────────────────────

  save(): void {
    if (this.saving()) return;
    if (!this.model.identity.name.trim()) {
      this.error.set('Donne au moins un nom à ton personnage.');
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    this.justSaved.set(false);

    const request$ = this.sheetId
      ? this.sheets.update(this.sheetId, this.model)
      : this.sheets.create(this.model);

    request$.subscribe({
      next: (stored) => {
        this.saving.set(false);
        this.justSaved.set(true);
        // Première sauvegarde : on bascule en mode édition sans recharger la page.
        if (!this.sheetId) {
          this.sheetId = stored.id;
          this.router.navigate(['/characters', stored.id], { replaceUrl: true });
        }
      },
      error: () => {
        this.error.set('Enregistrement impossible. Réessaie.');
        this.saving.set(false);
      },
    });
  }

  /**
   * Assemble la fiche pour l'export PDF. Tout ce que le gabarit affiche est
   * résolu ici (stats finales, bonus, libellés) : `sheet-pdf.ts` ne redessine
   * que des valeurs prêtes, il ne connaît rien aux règles de l'univers.
   */
  private pdfData(): SheetPdfData {
    const stats = this.finalStats;
    const attrs = this.finalAttributes;
    const maxBar = this.barScale;

    const spellRow = (s: DomainSpell): PdfSpellRow => ({
      level: s.level,
      name: this.spellCurrentName(s.key),
      rank: this.hasSpellTree(s.key) ? `R${this.spellRank(s.key)}` : undefined,
      mana: s.mana,
      domainIcons: this.domainSpellKeys(s)
        .map((k) => domainIcon(k))
        .filter((icon): icon is string => !!icon),
      // Repli si une icône manque : les sigils sont des glyphes Unicode absents
      // des polices embarquées dans le PDF, on écrit donc les noms.
      domains: this.domainSpellNames(s),
    });

    const slotRow = (slot: { key: string; label: string }): PdfSlotRow => {
      const lines: string[] = [];
      const weapon = this.weaponForSlot(slot.key);
      if (weapon) {
        lines.push(
          `${weapon.minDamage}–${weapon.maxDamage} (${weapon.modMin}–${weapon.modMax}) · ${weapon.damageType}`,
        );
        lines.push(`${weapon.attributeDamage} · ${weapon.enduranceCost} end.`);
      }
      const armor = this.armorForSlot(slot.key);
      if (armor) lines.push(`Arm. ${armor.physicalArmor} · Mag. ${armor.magicalProtection}`);
      return { label: slot.label, item: this.model.equipment[slot.key] ?? '', lines };
    };

    return {
      fileName: (this.model.identity.name || 'fiche').replace(/[^\p{L}\p{N}_-]+/gu, '_'),
      source: this.model,
      identity: {
        name: this.model.identity.name,
        race: this.raceDisplay,
        className: this.model.identity.class,
        level: this.model.level,
        background: this.backgroundDisplay,
        age: this.model.identity.age,
        gold: this.gold,
        portrait: this.model.identity.portrait,
        fullImage: this.model.identity.fullImage,
      },
      xp: {
        total: this.model.xp,
        into: this.xp.into,
        needed: this.xp.needed,
        pct: this.xp.pct,
        atMax: this.model.level >= MAX_LEVEL,
      },
      domains: this.model.domains.map((k) => ({ name: domainName(k), icon: domainIcon(k) })),
      attributes: this.attributes.map((a) => ({
        label: a.label,
        score: attrs[a.key],
        mod: formatBonus(this.modifier(a.key)),
      })),
      bars: this.barStats.map((st) => ({
        label: st.label,
        icon: st.icon,
        value: stats[st.key],
        pct: this.barPct(stats[st.key], maxBar),
      })),
      defenses: this.defenseStats.map((st) => ({
        label: st.label,
        icon: st.icon,
        spark: st.key === 'def_mag' ? MAGIC_DEFENSE_SPARK : undefined,
        value: stats[st.key],
      })),
      spells: {
        cap: this.equippedCap,
        inspirationLeft: this.inspirationLeft,
        inspirationTotal: this.inspirationTotal,
        equipped: this.equippedSpells.map(spellRow),
        unlocked: this.unlockedNotEquipped.map(spellRow),
      },
      classSpells: this.unlockedClassSpells.map((sp) => ({
        level: sp.level,
        name: sp.name,
        endurance: sp.endurance,
        description: sp.description,
      })),
      equipment: {
        left: this.leftSlots.map(slotRow),
        right: this.rightSlots.map(slotRow),
      },
      skills: this.skills.map((s) => ({
        label: s.label,
        bonus: formatBonus(this.skillBonus(s.key, s.attribute)),
        trained: this.isSkillTrained(s.key),
      })),
      inventory: this.model.inventory.map((i) => ({
        name: i.name,
        qty: Number(i.qty) || 0,
        weight: Number(i.weight) || 0,
      })),
      weight: {
        total: this.totalWeight,
        capacity: this.carryCapacity,
        over: this.overweight,
      },
      traits: this.traits.map((t) => ({
        name: t.name,
        description: t.description,
        icon: t.icon ?? DEFAULT_TRAIT_ICON,
      })),
      notes: this.model.notes,
    };
  }

  /**
   * Recharge une fiche depuis un PDF exporté. Les données éditables voyagent
   * dans les métadonnées du document (cf. sheet-transfer.ts) : on ne relit donc
   * rien de ce qui est dessiné, et la fiche est restituée à l'identique.
   *
   * L'import remplit l'éditeur SANS rien enregistrer, et détache la fiche
   * courante : la sauvegarde suivante crée une nouvelle fiche plutôt que
   * d'écraser celle qu'on était en train de consulter.
   */
  async importPdf(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permet de re-sélectionner le même fichier plus tard
    if (!file || this.importing()) return;

    if (this.hasContent && !confirm(
      'Importer cette fiche remplacera ce qui est actuellement à l’écran. Continuer ?',
    )) {
      return;
    }

    this.importing.set(true);
    this.error.set(null);
    this.justSaved.set(false);
    try {
      const { extractSheetFromPdf, SheetImportError } = await import('./sheet-transfer');
      try {
        this.model = this.normalize(await extractSheetFromPdf(file));
      } catch (err) {
        this.error.set(
          err instanceof SheetImportError ? err.message : 'Import impossible : fichier illisible.',
        );
        return;
      }
      this.loadPortraitOriginal(false); // rend le recadrage du portrait à nouveau ajustable
      if (this.sheetId) {
        this.sheetId = null;
        this.router.navigate(['/characters/new'], { replaceUrl: true });
      }
    } finally {
      this.importing.set(false);
    }
  }

  /** Vrai si l'éditeur contient déjà quelque chose qu'un import écraserait. */
  private get hasContent(): boolean {
    const m = this.model;
    return !!(
      m.identity.name.trim() ||
      m.identity.race ||
      m.identity.class ||
      m.domains.length ||
      m.skills.length ||
      m.inventory.length ||
      m.spells.unlocked.length ||
      m.notes.trim()
    );
  }

  /**
   * Génère et télécharge le PDF de la fiche. Le rendu est vectoriel : la fiche
   * est redessinée en primitives PDF plutôt que photographiée (cf. sheet-pdf.ts).
   */
  async downloadPdf(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.error.set(null);
    try {
      const { exportSheetPdf } = await import('./sheet-pdf');
      await exportSheetPdf(this.pdfData());
    } catch {
      this.error.set('Échec de la génération du PDF.');
    } finally {
      this.exporting.set(false);
    }
  }
}
