import { Component, DestroyRef, ElementRef, NgZone, afterNextRender, computed, inject, input, model } from '@angular/core';
import { StatusEffectsService } from '../../services/status-effects.service';
import { DamageTypesService } from '../../services/damage-types.service';
import { WeathersService } from '../../services/weathers.service';
import {
  CustomizableSpell,
  getAt,
  measureLines,
  readNum,
} from '../../combat/spell-customization';
import {
  MaterialFamilyKey,
  Material,
  SpellClassBonus,
  SpellChoice,
  SpellNode,
  SpellScaling,
  SpellScalingSource,
  SpellStatEffect,
  SpellTarget,
  StatusCategory,
  StatusEffect,
  StatusSave,
  StatusTick,
} from '../../wiki.types';
import {
  MATERIAL_FAMILIES,
  MATERIAL_REGIONS,
  materialsOfFamily,
} from '../../combat/materials';
import { enchantTargetOf } from '../../combat/abilities';
import { ENCHANT_SHARE, WALL_THICKNESS } from '../../combat/rules';
import { SKILLS } from '../../character/universe-data';
import { domainColor as colorOf, domainLabel as labelOf } from '../../domains.catalog';

/* ──────────────────────────────────────────────────────────────────────────
   LA CARTE DU SORT CONSTRUIT — sa lecture vivante.

   Un `SpellNode` n'est pas une fiche figée : c'est un sort À UN ÉTAT DONNÉ,
   celui que l'atelier vient de construire. Cette carte le dit en toutes
   lettres — « Inflige 2–4 dégâts de feu à un ennemi. Peut appliquer Brûlure
   (30 %). » — et chiffre à chiffre, avec la formule de chaque terme au survol.

   Elle vivait dans la page d'un sort du wiki. Elle en sort parce que la fiche
   de PERSONNAGE en a le même besoin : on y règle le même atelier, et on doit
   y lire le même sort. Deux copies de cette phrase, c'étaient deux vérités.

   Aucun état propre, hormis la matière qu'on choisit de lire : tout vient du
   nœud qu'on lui passe. C'est ce qui garantit que la carte dit exactement ce
   que le moteur jouera.
─────────────────────────────────────────────────────────────────────────── */

/** Libellés FR des sources de scaling (stats de combat + attributs). */
const SOURCE_LABELS: Record<SpellScalingSource, string> = {
  atk_mag: 'Attaque magique',
  atk_phy: 'Attaque physique',
  def_mag: 'Défense magique',
  def_phy: 'Défense physique',
  hp: 'Points de vie',
  mana: 'Mana',
  endurance: 'Endurance',
  speed: 'Vitesse',
  force: 'Force',
  dexterite: 'Dextérité',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  sagesse: 'Sagesse',
  charisme: 'Charisme',
};

/** Libellés FR des cibles. */
const TARGET_LABELS: Record<SpellTarget, string> = {
  enemy: 'Ennemis',
  ally: 'Alliés',
  self: 'Soi-même',
  everyone: 'Tout le monde',
};

/** Libellés FR des classes (cf. classes.json). */
const CLASS_LABELS: Record<string, string> = {
  warrior: 'Guerrier',
  mage: 'Mage',
  ranger: 'Ranger',
  rogue: 'Vagabond',
  pugilist: 'Pugiliste',
};

/** Libellés FR des catégories de statut. */
const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  dot: 'Dégâts sur la durée',
  control: 'Contrôle',
  debuff: 'Affaiblissement',
  mental: 'Altération mentale',
  buff: 'Amélioration',
};

/** Type de dégâts par défaut d'un domaine (cf. damage_type.json). */
const DOMAIN_DAMAGE_TYPE: Record<string, string> = {
  fire: 'fire',
  water: 'water',
  earth: 'earth',
  air: 'wind',
  electricity: 'lightning',
  plant: 'plant',
  light: 'light',
  darkness: 'dark',
  life: 'life',
  death: 'death',
  time: 'time',
  space: 'space',
};

/** Nom français avec article d'une stat/attribut, pour les phrases d'effet. */
const STAT_NOUN: Record<SpellScalingSource, string> = {
  atk_mag: "l'attaque magique",
  atk_phy: "l'attaque physique",
  def_mag: 'la défense magique',
  def_phy: 'la défense physique',
  hp: 'les points de vie',
  mana: 'le mana',
  endurance: "l'endurance",
  speed: 'la vitesse',
  force: 'la force',
  dexterite: 'la dextérité',
  constitution: 'la constitution',
  intelligence: "l'intelligence",
  sagesse: 'la sagesse',
  charisme: 'le charisme',
};

@Component({
  selector: 'spell-detail',
  templateUrl: './spell-detail.html',
  styleUrl: './spell-detail.css',
  host: {
    '[class.sd--dark]': "variant() === 'dark'",
    '[class.sd--compact]': 'compact()',
  },
})
export class SpellDetail {
  private readonly statusService = inject(StatusEffectsService);
  private readonly damageTypes = inject(DamageTypesService);
  private readonly weathers = inject(WeathersService);

  /** Le sort construit : tout ce que la carte montre en vient. */
  readonly node = input.required<SpellNode>();

  /**
   * Le sort vu par le moteur de personnalisation.
   *
   * Seuls les échelons qualitatifs (`gradeLines`) et les mesures
   * (`measureLines`) en ont besoin : ils se lisent sur la DÉCLARATION du sort,
   * pas sur ses stats. `null` pour un sort qui ne se personnalise pas.
   */
  readonly spell = input<CustomizableSpell | null>(null);

  /** Domaine principal : couleur d'accent et type de dégâts par défaut. */
  readonly domain = input('');

  /** Type de dégâts déclaré par la fiche du sort — repli quand le nœud se tait. */
  readonly spellDamageType = input<string | undefined>(undefined);

  /** Famille de matière façonnée, déclarée par la fiche — repli du nœud. */
  readonly shapesMaterial = input<MaterialFamilyKey | undefined>(undefined);

  /** Météo déclarée par la fiche — repli du nœud. */
  readonly weather = input<string | undefined>(undefined);

  /**
   * Entretien par tour d'un sort passé en mode continu.
   *
   * En entrée et non lu sur le nœud : `SpellNodeStats` ne connaît pas ce
   * champ, il n'existe que dans un build.
   */
  readonly upkeep = input<number | undefined>(undefined);

  /** Sur-titre de la carte : l'état du build affiché (« Socle du sort »…). */
  readonly kicker = input('');

  /**
   * Registre de couleurs. `parchment` (défaut) : la fiche du wiki, encre
   * sombre sur papier. `dark` : la fiche de personnage, ivoire sur fond
   * sombre. Cf. la feuille de style — la bascule ne touche que des jetons.
   */
  readonly variant = input<'parchment' | 'dark'>('parchment');

  /**
   * Carte serrée : la grille de stats descend d'un cran.
   *
   * C'est le cas dès que la carte vit dans la colonne de résultat de
   * l'atelier plutôt qu'en pleine largeur de page.
   */
  readonly compact = input(false);

  /**
   * Contexte lu — combat ou hors combat.
   *
   * En `model` : la page qui englobe la carte peut avoir sa propre bande
   * d'utilisation, et les deux doivent basculer ensemble. C'est le CHOIX
   * brut ; `mode()` en donne la lecture effective.
   */
  readonly usageMode = model<'combat' | 'outOfCombat'>('combat');

  /* ─────────────────────────────────────────────
     PLACEMENT DES INFOBULLES

     Elles sont en `position: fixed` (cf. la feuille de style) : c'est la seule
     façon d'échapper au conteneur de défilement dans lequel la carte est
     posée. En contrepartie elles n'ont plus de repère, et c'est ici qu'on leur
     en donne un.
  ───────────────────────────────────────────── */

  /** Ce qui porte une infobulle, quelle que soit sa forme. */
  private static readonly TIP_TRIGGERS = '.has-tip, .se-status-kw, .se-status-chip';

  /** Marge minimale entre une infobulle et le bord de la fenêtre. */
  private static readonly TIP_MARGIN = 8;

  /** Le mot dont l'infobulle est ouverte, à re-placer si la page bouge sous elle. */
  private ouverte: Element | null = null;

  constructor() {
    const hote = inject(ElementRef).nativeElement as HTMLElement;
    const destruction = inject(DestroyRef);
    const zone = inject(NgZone);
    // `afterNextRender` : la page est aussi rendue côté serveur, où il n'y a
    // ni fenêtre à écouter ni pixels à mesurer.
    //
    // Hors zone : `mouseover` part à chaque mot survolé, et déclencher un
    // cycle de détection à chaque fois coûterait plus cher que tout le reste
    // de la carte. Le placement n'écrit que des styles, rien d'observable.
    afterNextRender(() => zone.runOutsideAngular(() => {
      const place = (e: Event) => this.placeTip((e.target as Element | null)?.closest?.(SpellDetail.TIP_TRIGGERS) ?? null);
      hote.addEventListener('mouseover', place);
      hote.addEventListener('focusin', place);
      // Une boîte fixe ne suit pas le texte : sans cela, scroller à la molette
      // en survolant un chiffre laissait son infobulle en arrière.
      const suivre = () => this.placeTip(this.ouverte);
      addEventListener('scroll', suivre, { passive: true, capture: true });
      addEventListener('resize', suivre, { passive: true });
      destruction.onDestroy(() => {
        removeEventListener('scroll', suivre, { capture: true });
        removeEventListener('resize', suivre);
      });
    }));
  }

  /**
   * Donne ses coordonnées d'écran à l'infobulle d'un mot.
   *
   * Au-dessus du mot si la place y est, sinon dessous, et rabattue dans la
   * fenêtre si elle en sortait — la flèche suit alors le mot, puisque la boîte
   * n'est plus centrée sur lui.
   */
  private placeTip(mot: Element | null): void {
    const bulle = mot?.querySelector<HTMLElement>('.se-effect-tip');
    if (!mot || !bulle) return;
    this.ouverte = mot;

    // L'infobulle peut n'être pas encore dépliée quand l'événement part : on
    // la rend mesurable sans la montrer, puis on rend la main à la feuille
    // de style.
    const masquee = !bulle.offsetWidth;
    if (masquee) {
      bulle.style.visibility = 'hidden';
      bulle.style.display = 'flex';
    }
    const ancre = mot.getBoundingClientRect();
    const largeur = bulle.offsetWidth;
    const hauteur = bulle.offsetHeight;
    if (masquee) {
      bulle.style.visibility = '';
      bulle.style.display = '';
    }

    const marge = SpellDetail.TIP_MARGIN;
    const centre = ancre.left + ancre.width / 2;
    const x = Math.max(marge, Math.min(centre - largeur / 2, innerWidth - largeur - marge));
    const dessus = ancre.top - hauteur - marge >= 0;
    const y = Math.max(
      marge,
      Math.min(dessus ? ancre.top - hauteur - marge : ancre.bottom + marge, innerHeight - hauteur - marge),
    );

    bulle.style.left = `${Math.round(x)}px`;
    bulle.style.top = `${Math.round(y)}px`;
    bulle.style.setProperty('--tip-arrow', `${Math.round(centre - x)}px`);
    if (dessus) bulle.removeAttribute('data-flip');
    else bulle.setAttribute('data-flip', '');
  }

  /** La clé du sort, pour savoir s'il NIMBE une arme (part d'enchantement). */
  private readonly spellKey = computed(() => this.spell()?.key ?? '');

  /** La couleur du domaine, qui borde la carte. */
  readonly accent = computed(() => colorOf(this.domain()));

  /* ─────────────────────────────────────────────
     CONTEXTE D'UTILISATION
  ───────────────────────────────────────────── */

  readonly nodeCombat = computed(() => this.node().usage?.combat);
  readonly nodeOutOfCombat = computed(() => this.node().usage?.outOfCombat);

  /** La bascule n'existe que si le sort sert dans les deux contextes. */
  readonly hasBothUsages = computed(() => !!this.nodeCombat() && !!this.nodeOutOfCombat());

  /** Mode effectif : le choix s'il est disponible, sinon l'unique contexte présent. */
  readonly mode = computed<'combat' | 'outOfCombat'>(() => {
    const pick = this.usageMode();
    if (pick === 'combat' && this.nodeCombat()) return 'combat';
    if (pick === 'outOfCombat' && this.nodeOutOfCombat()) return 'outOfCombat';
    return this.nodeCombat() ? 'combat' : this.nodeOutOfCombat() ? 'outOfCombat' : 'combat';
  });

  setMode(mode: 'combat' | 'outOfCombat'): void {
    this.usageMode.set(mode);
  }

  /* ─────────────────────────────────────────────
     LIBELLÉS
  ───────────────────────────────────────────── */

  readonly domainLabel = (slug: string): string => labelOf(slug);
  readonly sourceLabel = (s: SpellScalingSource): string => SOURCE_LABELS[s] ?? s;
  readonly targetLabel = (t: SpellTarget): string => TARGET_LABELS[t] ?? t;

  /** Nom français d'une compétence, sa clé à défaut. */
  readonly skillLabel = (key: string): string => SKILLS.find((sk) => sk.key === key)?.label ?? key;

  /** Nom français (avec article) d'une stat : « la vitesse », « l'attaque physique ». */
  readonly statNoun = (s: SpellScalingSource): string => STAT_NOUN[s] ?? this.sourceLabel(s);

  /** Nombre formaté à la française (« 0,2 »). */
  readonly num = (n: number): string => String(n).replace('.', ',');

  /** Libellé FR d'une classe. */
  readonly classLabel = (key: string): string => CLASS_LABELS[key] ?? key;

  /** Libellé FR d'une catégorie de statut. */
  readonly statusCategoryLabel = (cat: StatusCategory): string => STATUS_CATEGORY_LABELS[cat] ?? cat;

  /** Libellé FR d'un type de dégâts (pour faiblesses/résistances). */
  readonly dmgTypeLabel = (key: string): string => this.damageTypes.resolve(key)?.label ?? key;

  /** Libellé des PV de référence pour les dégâts en pourcentage. */
  readonly percentOfLabel = (of: 'max' | 'current'): string =>
    of === 'current' ? 'PV actuels' : 'PV max';

  /** Dégâts par tour en % PV max : « 3 → 5 → 7 % PV max / tour ». */
  readonly tickPercentLabel = (tick: StatusTick): string | null => {
    const p = tick.percentMaxHp;
    if (p === undefined) return null;
    const value = Array.isArray(p) ? p.join(' → ') : `${p}`;
    return `${value} % PV max / tour`;
  };

  /** Libellé d'anti-soin : « aucun soin possible » (1) ou « soins reçus −50 % ». */
  readonly healReductionLabel = (r: number): string =>
    r >= 1 ? 'aucun soin possible' : `soins reçus −${Math.round(r * 100)} %`;

  /** Durée d'un statut : « ∞ » si négative, sinon « 3 tours ». */
  readonly durationLabel = (d: number): string => (d < 0 ? '∞' : `${d} tour${d > 1 ? 's' : ''}`);

  /** Ligne d'un jet de statut. */
  readonly saveLabel = (save: StatusSave): string => {
    const attr = this.sourceLabel(save.attribute);
    const when =
      save.trigger === 'action'
        ? 'à chaque tentative d’action'
        : `tous les ${save.interval ?? 1} tour${(save.interval ?? 1) > 1 ? 's' : ''}`;
    const outcome = save.onSuccess === 'clear' ? 'lève le statut' : 'permet d’agir ce tour';
    return `Jet de ${attr} (base ${save.dc}) ${when} : réussite ${outcome}.`;
  };

  /** Puce d'un modificateur de classe : « +2 Attaque physique ». */
  readonly classEffectChip = (e: SpellStatEffect): string => {
    const v = e.value ?? 0;
    return `${v > 0 ? '+' : ''}${v} ${this.sourceLabel(e.stat)}`;
  };

  /** Puce d'un scaling de classe : « +0,3 × Force (dégâts) ». */
  readonly classScalingChip = (sc: SpellScaling): string => {
    const target = (sc.affects ?? 'damage') === 'heal' ? 'soin' : 'dégâts';
    return `+${this.num(sc.ratio)} × ${this.sourceLabel(sc.source)} (${target})`;
  };

  /** Puce d'un facteur de mana de classe : « Mana −50 % » (0.5) ou « Mana ×1,5 ». */
  readonly manaFactorChip = (f: number): string =>
    f < 1 ? `Mana −${Math.round((1 - f) * 100)} %` : `Mana ×${this.num(f)}`;

  /* ─────────────────────────────────────────────
     SCALING (formules de décomposition, pour calcul à la main)
  ───────────────────────────────────────────── */

  /** Formules de scaling (ratio × source) du nœud pour une valeur cible. */
  private scalingParts(affects: 'damage' | 'heal') {
    return (this.node().stats.scaling ?? [])
      .filter((sc) => (sc.affects ?? 'damage') === affects)
      .map((sc) => ({ label: this.sourceLabel(sc.source), ratio: sc.ratio }));
  }

  /**
   * Composantes de dégâts (base + type + formules de scaling). Gère la forme
   * simple (`damageMin/damageMax`) comme la forme multi-composantes
   * (`damages[]`, ex. lumière + ténèbres). Les valeurs ne sont pas injectées :
   * le survol montre la formule pour un calcul manuel.
   */
  readonly damageComponents = computed(() => {
    const s = this.node().stats;
    const domainType = DOMAIN_DAMAGE_TYPE[this.domain()];
    const build = (baseMin: number, baseMax: number, type: string | undefined, scaling?: SpellScaling[]) => ({
      baseMin,
      baseMax,
      parts: (scaling ?? [])
        .filter((sc) => (sc.affects ?? 'damage') === 'damage')
        .map((sc) => ({ label: this.sourceLabel(sc.source), ratio: sc.ratio })),
      type: this.damageTypes.resolve(type ?? this.spellDamageType() ?? domainType),
    });
    // Domaine de la Terre : c'est la MATIÈRE qui donne les chiffres et le type,
    // pas le palier. Sans ça la fiche annonçait « 1–2 Terre » quelle que soit
    // la pierre choisie — un reliquat de l'ancien modèle en pourcentages.
    const matiere = this.materialValues();
    if (matiere && s.damageMin !== undefined) {
      return [build(matiere.damageMin, matiere.damageMax, matiere.material.damageType, s.scaling)];
    }
    if (s.damages?.length) return s.damages.map((d) => build(d.min, d.max, d.type, d.scaling));
    if (s.damageMin !== undefined) return [build(s.damageMin, s.damageMax ?? s.damageMin, s.damageType, s.scaling)];
    return [];
  });

  /**
   * Décompositions des dégâts en % de PV, une par forme présente (PV max, PV
   * actuels). Base + formules de scaling en points de %.
   */
  readonly damagePercentBreakdowns = computed(() => {
    const s = this.node().stats;
    const parts = this.scalingParts('damage');
    const out: { of: 'max' | 'current'; baseMin: number; baseMax: number; parts: typeof parts }[] = [];
    if (s.damagePercentMaxHp) {
      const d = s.damagePercentMaxHp;
      out.push({ of: 'max', baseMin: d.min, baseMax: d.max ?? d.min, parts });
    }
    if (s.damagePercentCurrentHp) {
      const d = s.damagePercentCurrentHp;
      out.push({ of: 'current', baseMin: d.min, baseMax: d.max ?? d.min, parts });
    }
    return out;
  });

  /** Type de dégâts du nœud (nœud propre → sort → domaine), s'il est offensif. */
  readonly damageTypeInfo = computed(() => {
    const s = this.node().stats;
    const hasPercent = !!s.damagePercentMaxHp || !!s.damagePercentCurrentHp;
    if (s.damageMin === undefined && !hasPercent) return undefined;
    const key = s.damageType ?? this.spellDamageType() ?? DOMAIN_DAMAGE_TYPE[this.domain()];
    return this.damageTypes.resolve(key);
  });

  /**
   * Décomposition du soin (base + formules), pour le survol.
   *
   * Trois origines à ne pas confondre, d'où l'étiquette qui dit CHEZ QUI se lit
   * chaque terme : la puissance du lanceur, le corps du soigné, et ce que le
   * lanceur sait faire de ses mains. Sans cette mention, une fiche qui scale sur
   * la constitution laisse croire que c'est celle du mage.
   */
  readonly healBreakdown = computed(() => {
    const s = this.node().stats;
    if (s.heal === undefined) return null;
    const parts = [
      ...this.scalingParts('heal'),
      ...(s.healTargetScaling ?? []).map((sc) => ({
        label: `${this.sourceLabel(sc.source)} de la cible`,
        ratio: sc.ratio,
      })),
    ];
    if (s.healCasterSkill) {
      parts.push({
        label: `${this.skillLabel(s.healCasterSkill.skill)} du lanceur`,
        ratio: s.healCasterSkill.ratio,
      });
    }
    return { base: s.heal, parts };
  });

  /** Décomposition du contre-coup (base + formules de scaling). */
  readonly recoilBreakdown = computed(() => {
    const r = this.node().stats.recoil;
    if (!r) return null;
    return {
      hasDamage: r.damageMin !== undefined,
      baseMin: r.damageMin ?? 0,
      baseMax: r.damageMax ?? r.damageMin ?? 0,
      parts: (r.scaling ?? []).map((sc) => ({ label: this.sourceLabel(sc.source), ratio: sc.ratio })),
      /** Malus de stats du contre-coup, en magnitude positive (le « − » est ajouté au rendu). */
      effects: (r.effects ?? []).map((e) => ({
        label: this.statNoun(e.stat),
        // La vitesse perdue vient de la DENSITÉ de la matière, pas du palier :
        // une armure d'or écrase là où l'ardoise suit le corps.
        value:
          e.stat === 'speed' && this.materialValues()
            ? this.materialValues()!.speedPenalty
            : Math.abs(e.value ?? 0),
      })),
      note: r.note,
    };
  });

  /* ─────────────────────────────────────────────
     DESCRIPTION INTERACTIVE (valeurs effectives + survol)
  ───────────────────────────────────────────── */

  /** Complément de cible : « à un ennemi », « à un allié ou à soi-même » (+ zone). */
  targetsPhrase(node: SpellNode): string {
    const t = node.stats.targets ?? [];
    const area = node.stats.area;
    const areaSuffix = area && area !== 'Cible unique' ? ` (${area.toLowerCase()})` : '';
    const has = (x: SpellTarget) => t.includes(x);
    let who = '';
    if (has('everyone')) who = 'à toutes les créatures';
    else if (has('enemy')) who = 'à un ennemi';
    else if (has('ally') && has('self')) who = 'à un allié ou à soi-même';
    else if (has('ally')) who = 'à un allié';
    else if (has('self')) who = 'à soi-même';
    return who ? ` ${who}${areaSuffix}` : areaSuffix;
  }

  /** Verbe d'action de la phrase d'effet selon les cibles (buff vs malus). */
  readonly effectActionVerb = (node: SpellNode): string =>
    (node.stats.targets ?? []).includes('enemy') ? 'Réduit' : 'Augmente';

  /** Signe d'affichage d'un effet selon les cibles du nœud (+ buff / − malus). */
  readonly effectSign = (node: SpellNode): string =>
    (node.stats.targets ?? []).includes('enemy') ? '−' : '+';

  /** Vrai si le nœud inflige des dégâts sous une forme quelconque (fixe, multi, % PV). */
  readonly nodeHasDamage = (node: SpellNode): boolean => {
    const s = node.stats;
    return (
      s.damageMin !== undefined ||
      !!s.damages?.length ||
      !!s.damagePercentMaxHp ||
      !!s.damagePercentCurrentHp
    );
  };

  /** Vrai si le nœud n'est qu'un malus (cible ennemie, aucun dégât ni soin). */
  readonly isPureMalus = (node: SpellNode): boolean =>
    this.effectSign(node) === '−' && !this.nodeHasDamage(node) && node.stats.heal === undefined;

  /** Durée négative = actif tant qu'on paie (mode continu), et non « −1 tour ». */
  readonly isContinuous = (node: SpellNode): boolean => (node.stats.duration ?? 0) < 0;

  /** Vrai si la durée du nœud est scalée par une stat/attribut. */
  readonly durationScaled = (node: SpellNode): boolean => (node.stats.durationScaling?.length ?? 0) > 0;

  /**
   * Décomposition de la durée : durée de base + formules de scaling
   * (`ratio × source`), sans injecter de valeur — pour un calcul à la main.
   */
  readonly durationBreakdown = (node: SpellNode) => ({
    base: node.stats.duration ?? 0,
    parts: (node.stats.durationScaling ?? []).map((sc) => ({
      label: this.sourceLabel(sc.source),
      ratio: sc.ratio,
    })),
  });

  /**
   * Décomposition d'un effet : valeur de base + formules de scaling
   * (`ratio × source`), sans injecter de valeur — pour un calcul à la main.
   */
  readonly effectBreakdown = (e: SpellStatEffect) => ({
    base: e.value ?? 0,
    parts: (e.scaling ?? []).map((sc) => ({
      label: this.sourceLabel(sc.source),
      ratio: sc.ratio,
    })),
  });

  /* ─────────────────────────────────────────────
     STATUTS INFLIGÉS + BONUS DE CLASSE
  ───────────────────────────────────────────── */

  /** Statuts infligés par le nœud, résolus depuis le catalogue. */
  readonly inflictedStatuses = computed(() =>
    (this.node().stats.inflicts ?? []).map((app) => {
      const def = this.statusService.byKey(app.status);
      return { chance: app.chance, duration: app.duration ?? def?.defaultDuration ?? 0, def };
    }),
  );

  /** Riposte défensive du nœud (statuts renvoyés résolus + dégâts). */
  readonly retaliateInfo = computed(() => {
    const r = this.node().stats.retaliate;
    if (!r) return undefined;
    return {
      trigger: r.trigger ?? 'melee',
      damageMin: r.damageMin,
      damageMax: r.damageMax,
      damageType: r.damageType ? this.damageTypes.resolve(r.damageType) : undefined,
      statuses: (r.inflicts ?? []).map((app) => ({
        chance: app.chance,
        duration: app.duration ?? this.statusService.byKey(app.status)?.defaultDuration ?? 0,
        def: this.statusService.byKey(app.status),
      })),
    };
  });

  /** Chance d'esquive (annulation totale d'une attaque), ou 0. */
  readonly evadeChance = computed<number>(() => this.node().stats.evadeChance ?? 0);
  /** Cases dont recule chaque cible touchée (0 = le sort ne déplace personne). */
  readonly knockback = computed<number>(() => this.node().stats.knockback ?? 0);
  /** Zone persistante : posée au sol, ou attachée au lanceur. */
  readonly lingers = computed(() => this.node().stats.lingers);

  /** Échelons atteints sur les échelles qualitatives du sort, et ce qu'ils permettent. */
  readonly gradeLines = computed(() => {
    const spell = this.spell();
    if (!spell) return [];
    const stats = this.node().stats;
    return (spell.customization.params ?? []).flatMap((p) => {
      const step = p.ladder?.[Math.round(readNum(getAt(stats, p.path)))];
      return step ? [{ label: p.label, step }] : [];
    });
  });

  /** Mesures du sort construit (volume, poids…), dans leur unité, avec leur repère. */
  readonly measures = computed(() => {
    const spell = this.spell();
    return spell ? measureLines(spell, this.node().stats) : [];
  });

  /** Statuts purifiés par le nœud, résolus depuis le catalogue. */
  readonly cleansedStatuses = computed<{ key: string; def?: StatusEffect }[]>(() =>
    (this.node().stats.cleanses ?? []).map((key) => ({
      key,
      def: this.statusService.byKey(key),
    })),
  );

  /**
   * La purge TIENT-elle, ou passe-t-elle une fois pour toutes ?
   *
   * Un manteau écarte les statuts tant qu'il dure ; un sort instantané les lève
   * et s'en va. Sans cette distinction la fiche promettait « tant que le manteau
   * tient » à un soin au contact, qui ne tient rien du tout.
   */
  readonly cleanseHolds = computed<boolean>(() => !!this.node().stats.duration);

  /** Jet imposé au corps de la cible, s'il y en a un. */
  readonly targetSave = computed(() => this.node().stats.targetSave);

  /**
   * Vrai si tous les statuts infligés le sont à coup sûr (100 %). Pilote la
   * formulation : « Applique … » (certain) vs « Peut appliquer … (X %) ».
   */
  readonly allInflictsCertain = computed(() => {
    const list = this.inflictedStatuses();
    return list.length > 0 && list.every((s) => s.chance >= 100);
  });

  /* ── Matériaux de Terre : le comparatif ───────────────────────────────────
     Un sort qui façonne de la matière ne porte pas ses chiffres, il porte une
     famille. Sans ce tableau, sa fiche ne dit rien de ce qu'il vaut : c'est
     ici, et nulle part ailleurs, qu'on voit qu'une même lame taille à
     l'obsidienne et écrase au basalte.
  ─────────────────────────────────────────────────────────────────────────── */

  /** La famille façonnée par ce sort, s'il en façonne une. */
  readonly shapedFamily = computed<MaterialFamilyKey | undefined>(
    () => this.node().stats.shapesMaterial ?? this.shapesMaterial(),
  );

  /** Le nom de la famille, pour le titre du bloc. */
  readonly shapedFamilyName = computed<string>(() => {
    const key = this.shapedFamily();
    return MATERIAL_FAMILIES.find((f) => f.key === key)?.name ?? '';
  });

  /**
   * Matière retenue pour LIRE la carte.
   *
   * Un tableau comparatif ne suffisait pas : la description du sort continuait
   * d'annoncer les chiffres bruts du palier (« Inflige 1–2 … Terre »), qui ne
   * veulent plus rien dire depuis que c'est la matière qui les dicte. En faire
   * un choix qui pilote TOUTE la carte règle les deux à la fois.
   */
  readonly sheetMaterial = model<string | null>(null);

  /** Les matières que ce sort peut façonner, pour le sélecteur. */
  readonly materialChoices = computed<Material[]>(() => {
    const family = this.shapedFamily();
    return family ? materialsOfFamily(family) : [];
  });

  /** La matière lue : celle qu'on a choisie, sinon la première de la famille. */
  readonly activeMaterial = computed<Material | undefined>(() => {
    const choix = this.materialChoices();
    const voulu = this.sheetMaterial();
    return choix.find((m) => m.key === voulu) ?? choix[0];
  });

  setSheetMaterial(key: string): void {
    this.sheetMaterial.set(key);
  }

  /**
   * Combien de matière le palier façonne, part d'enchantement comprise.
   *
   * Un revêtement nimbe : il n'ajoute qu'une fraction de la matière, à chaque
   * coup. La carte doit annoncer cette fraction, pas une frappe entière.
   */
  private readonly materialScale = computed<number>(() => {
    const nimbe = !!enchantTargetOf(this.spellKey());
    return (this.node().stats.materialScale ?? 1) * (nimbe ? ENCHANT_SHARE : 1);
  });

  /**
   * Les effets de stats du nœud, relus à travers la matière.
   *
   * La défense d'une armure de pierre ne s'écrit plus sur le nœud : elle vient
   * de la dureté de la matière. Sans ce passage, la phrase « Confère défense
   * physique de +18 » restait figée quelle que soit la pierre choisie.
   */
  readonly effectRows = computed(() => {
    const stats = this.node().stats;
    const v = this.materialValues();
    return (stats.effects ?? [])
      .map((e) => {
        if (!v) return { ...e, value: e.value ?? 0 };
        if (e.stat === 'def_phy') return { ...e, value: v.defense };
        // Une matière sans résonance n'accorde AUCUNE défense magique : la
        // ligne disparaît au lieu d'afficher la valeur de sa dureté.
        if (e.stat === 'def_mag') {
          return v.magicDefense ? { ...e, value: v.magicDefense } : null;
        }
        return { ...e, value: e.value ?? 0 };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  });

  /** Ce que la matière donne à ce nœud : dégâts, défense, mur. */
  readonly materialValues = computed(() => {
    const m = this.activeMaterial();
    if (!m) return null;
    const stats = this.node().stats;
    const taille = (base: number) => Math.max(1, Math.round(base * this.materialScale()));
    return {
      material: m,
      damageMin: taille(m.damage.min),
      damageMax: taille(m.damage.max),
      defense: Math.max(1, Math.round(m.defense * (stats.materialScale ?? 1))),
      wallHp: stats.raisesWall
        ? Math.max(1, Math.round(m.defense * WALL_THICKNESS * (stats.materialScale ?? 1)))
        : 0,
      /** Ce que la matière coûte en vitesse à qui la porte. */
      speedPenalty: Math.max(1, Math.round(m.speedPenalty * this.materialScale())),
      /** Ce qu'elle oppose à la magie — souvent rien, pour une pierre. */
      magicDefense: m.magicDefense
        ? Math.max(1, Math.round(m.magicDefense * (stats.materialScale ?? 1)))
        : 0,
      /** Ces dégâts s'ajoutent-ils à chaque coup, ou sont-ils la frappe ? */
      perHit: !!enchantTargetOf(this.spellKey()),
      where: m.native.length
        ? m.native.map((k) => MATERIAL_REGIONS.find((r) => r.key === k)?.name ?? k).join(', ')
        : 'Nulle part — alliage à conjurer',
    };
  });

  /** Une liste de types de dégâts en clair. */
  materialTypes(keys: string[] | undefined): string {
    return (keys ?? []).map((k) => this.dmgTypeLabel(k)).join(', ');
  }

  /** Statuts qu'une matière tient à distance, en clair. */
  readonly materialCleanses = (m: Material): string =>
    (m.cleanses ?? []).map((k) => this.statusService.byKey(k)?.name ?? k).join(', ');

  /* ─────────────────────────────────────────────
     CHOIX, BONUS DE CLASSE, MÉTÉO
  ───────────────────────────────────────────── */

  /** Bonus de classe du nœud. */
  readonly classBonuses = computed<SpellClassBonus[]>(() => this.node().stats.classBonuses ?? []);

  /** Choix disponibles du nœud (sorts à options). */
  readonly choices = computed<SpellChoice[]>(() => this.node().stats.choices ?? []);

  /** Statuts résolus d'un choix (nom, chance, durée, définition), pour l'affichage. */
  readonly choiceStatuses = (choice: SpellChoice) =>
    (choice.inflicts ?? []).map((app) => {
      const def = this.statusService.byKey(app.status);
      return { chance: app.chance, duration: app.duration ?? def?.defaultDuration ?? 0, def };
    });

  /** Type de dégâts résolu d'un choix (choix → sort → domaine), pour couleur/badge. */
  readonly choiceDamageType = (choice: SpellChoice) =>
    this.damageTypes.resolve(
      choice.damageType ?? this.spellDamageType() ?? DOMAIN_DAMAGE_TYPE[this.domain()],
    );

  /** Météo invoquée par le nœud, résolue avec ses effets. */
  readonly weatherInfo = computed(() => {
    const key = this.node().stats.weather ?? this.weather();
    const w = key ? this.weathers.byKey(key) : undefined;
    if (!w) return undefined;
    return {
      weather: w,
      statuses: (w.appliesStatus ?? [])
        .map((k) => this.statusService.byKey(k))
        .filter((s): s is NonNullable<typeof s> => !!s),
      randomType: w.randomDamage ? this.damageTypes.resolve(w.randomDamage.type) : undefined,
      costMods: (w.costModifiers ?? []).map((m) => ({
        label: this.domainLabel(m.domain),
        factor: m.factor,
        pct: Math.round((m.factor - 1) * 100),
      })),
      damageMods: (w.damageModifiers ?? []).map((m) => ({
        label: this.domainLabel(m.domain),
        factor: m.factor,
        pct: Math.round((m.factor - 1) * 100),
      })),
    };
  });
}
