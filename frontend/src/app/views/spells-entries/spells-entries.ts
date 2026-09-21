import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Navbar } from '../../components/navbar/navbar';
import { SpellWorkshop } from '../../components/spell-workshop/spell-workshop';
import {
  BuilderContext,
  DEFAULT_RULES,
  assessAtLevel,
  builtNode,
  emptyBuild,
  fillTemplate,
  measureLines,
  fromSpellEntry,
  getAt,
  readNum,
} from '../../combat/spell-customization';
import { SpellsService } from '../../services/spells.service';
import { StatusEffectsService } from '../../services/status-effects.service';
import { DamageTypesService } from '../../services/damage-types.service';
import { WeathersService } from '../../services/weathers.service';
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
import {
  domainColor as colorOf,
  domainIcon as iconOf,
  domainLabel as labelOf,
  domainSigil as sigilOf,
} from '../../domains.catalog';

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

/**
 * Page auto-générée et interactive d'un sort (`/magics/spell/:spell`).
 *
 * Un sort se lit par sa PERSONNALISATION : la fiche montre l'atelier, où l'on
 * règle les curseurs dans les limites d'un budget, et le panneau de détail
 * affiche le sort tel que le build essayé le construit. Un sort qui ne déclare
 * pas de `customization` reste une simple carte descriptive.
 */
@Component({
  selector: 'spell-entry',
  imports: [RouterLink, Navbar, NgTemplateOutlet, SpellWorkshop],
  templateUrl: './spells-entries.html',
  styleUrl: './spells-entries.css',
})
export class SpellEntryComponent {
  private route = inject(ActivatedRoute);
  private spells = inject(SpellsService);
  private statusService = inject(StatusEffectsService);
  private damageTypes = inject(DamageTypesService);
  private weathers = inject(WeathersService);

  private paramMap = toSignal(this.route.paramMap, { requireSync: true });

  /** Slug du sort demandé. */
  slug = computed(() => this.paramMap().get('spell') ?? '');

  /** Données de la page (sort + origine), ou `undefined` si le slug est inconnu. */
  page = computed(() => this.spells.bySlug(this.slug()));

  /** Domaine principal (premier composant) — pilote le thème et la navigation. */
  primaryDomain = computed(() => this.page()?.domains[0] ?? '');

  /** Emblème du sort : icône effective (propre ou sous-domaine), sinon icône du domaine. */
  emblem = computed(() => {
    const p = this.page();
    if (!p) return '';
    return p.icon || this.domainIcon(this.primaryDomain());
  });

  /* ─────────────────────────────────────────────
     PERSONNALISATION

     Un sort se règle par curseurs sous budget : la fiche montre l'atelier, et
     le panneau de détail affiche le sort tel que le build essayé le construit.
  ───────────────────────────────────────────── */

  /** Le sort vu par le moteur de personnalisation, ou `null` s'il n'en déclare pas. */
  customizable = computed(() => {
    const p = this.page();
    return p ? fromSpellEntry(p.spell, p.domains) : null;
  });

  /** Build essayé dans l'atelier ; repart du socle à chaque changement de sort. */
  readonly customBuild = linkedSignal({ source: this.slug, computation: () => emptyBuild() });
  /** Niveau de sort supposé (donc budget) ; 0 par défaut : le socle, tel qu'on apprend le sort. */
  readonly customLevel = linkedSignal({ source: this.slug, computation: () => 0 });

  private readonly customCtx: BuilderContext = { rules: DEFAULT_RULES, classes: [], catalog: {} };

  customAssessment = computed(() => {
    const spell = this.customizable();
    if (!spell) return null;
    // Niveau 0 : le socle, verrouillé — le build essayé reste en mémoire pour
    // réapparaître si l'on remonte, mais ne s'affiche pas.
    const build = this.customLevel() === 0 ? emptyBuild() : this.customBuild();
    return assessAtLevel(spell, build, this.customLevel(), this.customCtx);
  });

  /**
   * Le sort construit : c'est ce qui permet au panneau de détail (dégâts
   * colorés, statuts, bonus de classe…) de l'afficher sans rien réécrire.
   */
  selectedNode = computed<SpellNode | undefined>(() => {
    const spell = this.customizable();
    const a = this.customAssessment();
    if (!spell || !a) return undefined;
    // Les textes vivants décrivent le sort TEL QU'IL EST CONSTRUIT : ils
    // passent donc avant l'`usage` figé de la fiche.
    const p = this.page()?.spell;
    const live = p?.liveText;
    const base = p?.usage;
    // Même fabrique que le moteur de combat : ce que la fiche montre est
    // exactement ce que le simulateur jouera.
    return builtNode(spell, a.stats, {
      // Sans texte vivant, l'accroche reste la description de la fiche :
      // le panneau ne doit jamais s'ouvrir sur un blanc.
      description: this.live(live?.lead) ?? this.live(live?.description) ?? p?.description,
      usage: {
        ...base,
        ...(live?.combat ? { combat: this.live(live.combat) ?? base?.combat } : {}),
        ...(live?.outOfCombat ? { outOfCombat: this.live(live.outOfCombat) ?? base?.outOfCombat } : {}),
      },
    });
  });

  /**
   * Entretien par tour d'un sort passé en mode continu (2bis). `SpellNodeStats`
   * ne connaît pas ce champ : il n'existe que dans un build.
   */
  upkeep = computed(() => this.customAssessment()?.stats.upkeep);

  /** Durée négative = actif tant qu'on paie (mode continu), et non « −1 tour ». */
  isContinuous = (node: SpellNode): boolean => (node.stats.duration ?? 0) < 0;

  /** Sur-titre du panneau de détail : l'état du build affiché. */
  detailKicker = computed(() =>
    this.customAssessment()?.ledger.length
      ? `Build essayé · sort niv. ${this.customLevel()}`
      : 'Socle du sort',
  );

  /* ─────────────────────────────────────────────
     UTILISATION : bascule combat / hors combat
  ───────────────────────────────────────────── */

  /** Utilisation déclarée au niveau du sort (repli hérité par les paliers). */
  /**
   * Remplit un texte vivant avec le sort tel qu'il est construit (socle ou
   * build essayé) ; `null` sans texte vivant ou hors atelier.
   */
  private live(text: string | undefined): string | null {
    const spell = this.customizable();
    const a = this.customAssessment();
    if (!text || !spell || !a) return null;
    return fillTemplate(text, spell, a.stats);
  }

  /** Description du bandeau : elle suit le build si le sort déclare un texte vivant. */
  heroDescription = computed(() => {
    const spell = this.page()?.spell;
    return this.live(spell?.liveText?.description) ?? spell?.description ?? '';
  });

  /** Mana affichée au bandeau : celle du sort construit dans l'atelier, sinon la fiche. */
  heroMana = computed(() => this.customAssessment()?.stats.mana ?? this.page()?.spell.mana);

  usage = computed(() => {
    const spell = this.page()?.spell;
    const base = spell?.usage;
    const live = spell?.liveText;
    if (!live?.combat && !live?.outOfCombat) return base;
    return {
      ...base,
      ...(live.combat ? { combat: this.live(live.combat) ?? base?.combat } : {}),
      ...(live.outOfCombat ? { outOfCombat: this.live(live.outOfCombat) ?? base?.outOfCombat } : {}),
    };
  });

  /** Un contexte est « disponible » s'il est renseigné sur la fiche. */
  hasCombatUsage = computed(() => !!this.usage()?.combat);
  hasOutOfCombatUsage = computed(() => !!this.usage()?.outOfCombat);
  /** La bascule n'existe que si le sort a une utilité dans les deux contextes. */
  hasBothUsages = computed(() => this.hasCombatUsage() && this.hasOutOfCombatUsage());

  /** Mode choisi par l'utilisateur (peut pointer un contexte non disponible). */
  private usagePick = signal<'combat' | 'outOfCombat'>('combat');

  /** Mode effectif : le pick s'il est disponible, sinon l'unique contexte présent. */
  usageMode = computed<'combat' | 'outOfCombat'>(() => {
    const pick = this.usagePick();
    if (pick === 'combat' && this.hasCombatUsage()) return 'combat';
    if (pick === 'outOfCombat' && this.hasOutOfCombatUsage()) return 'outOfCombat';
    return this.hasCombatUsage() ? 'combat' : this.hasOutOfCombatUsage() ? 'outOfCombat' : 'combat';
  });

  setUsageMode(mode: 'combat' | 'outOfCombat'): void {
    this.usagePick.set(mode);
  }

  /** Texte hors-combat effectif du palier sélectionné (palier → repli sort). */
  nodeOutOfCombat = computed(() => {
    const n = this.selectedNode();
    return n?.usage?.outOfCombat ?? this.usage()?.outOfCombat;
  });

  /** Texte de contexte combat éventuel du palier (palier → repli sort). */
  nodeCombat = computed(() => {
    const n = this.selectedNode();
    return n?.usage?.combat ?? this.usage()?.combat;
  });

  /** Sorts requis pour débloquer ce sort (prérequis d'arbre de sorts). */
  prerequisites = computed(() => this.spells.prerequisites(this.slug()));
  /** Sorts que ce sort débloque (relation inverse dérivée). */
  unlocks = computed(() => this.spells.unlocks(this.slug()));

  domainSigil = (slug: string): string => sigilOf(slug);
  domainLabel = (slug: string): string => labelOf(slug);
  domainColor = (slug: string): string => colorOf(slug);
  domainIcon = (slug: string): string => iconOf(slug);

  sourceLabel = (s: SpellScalingSource): string => SOURCE_LABELS[s] ?? s;
  targetLabel = (t: SpellTarget): string => TARGET_LABELS[t] ?? t;

  /** Dégradé de ruban mêlant les couleurs des domaines d'origine. */
  originGradient = computed(() => {
    const p = this.page();
    if (!p) return '';
    const stops = p.domains.map((c) => this.domainColor(c)).join(', ');
    return (
      'linear-gradient(180deg, rgba(10, 8, 7, .34), rgba(10, 8, 7, .5)),' +
      `linear-gradient(100deg, ${stops})`
    );
  });

  /* ─────────────────────────────────────────────
     SCALING (formules de décomposition, pour calcul à la main)
  ───────────────────────────────────────────── */

  /** Formules de scaling (ratio × source) du nœud sélectionné pour une valeur cible. */
  private scalingParts(affects: 'damage' | 'heal') {
    const node = this.selectedNode();
    return (node?.stats.scaling ?? [])
      .filter((sc) => (sc.affects ?? 'damage') === affects)
      .map((sc) => ({ label: this.sourceLabel(sc.source), ratio: sc.ratio }));
  }

  /**
   * Composantes de dégâts du nœud sélectionné (base + type + formules de scaling).
   * Gère la forme simple (`damageMin/damageMax`) comme la forme multi-composantes
   * (`damages[]`, ex. lumière + ténèbres). Les valeurs ne sont pas injectées :
   * le survol montre la formule pour un calcul manuel.
   */
  damageComponents = computed(() => {
    const p = this.page();
    const s = this.selectedNode()?.stats;
    if (!p || !s) return [];
    const domainType = DOMAIN_DAMAGE_TYPE[this.primaryDomain()];
    const build = (baseMin: number, baseMax: number, type: string | undefined, scaling?: SpellScaling[]) => ({
      baseMin,
      baseMax,
      parts: (scaling ?? [])
        .filter((sc) => (sc.affects ?? 'damage') === 'damage')
        .map((sc) => ({ label: this.sourceLabel(sc.source), ratio: sc.ratio })),
      type: this.damageTypes.resolve(type ?? p.spell.damageType ?? domainType),
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
   * Décompositions des dégâts en % de PV du nœud sélectionné, une par forme
   * présente (PV max, PV actuels). Base + formules de scaling en points de %.
   */
  damagePercentBreakdowns = computed(() => {
    const s = this.selectedNode()?.stats;
    if (!s) return [];
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

  /** Libellé des PV de référence pour les dégâts en pourcentage. */
  percentOfLabel = (of: 'max' | 'current'): string =>
    of === 'current' ? 'PV actuels' : 'PV max';

  /** Type de dégâts du nœud sélectionné (nœud propre → sort → domaine), si offensif. */
  damageTypeInfo = computed(() => {
    const p = this.page();
    const s = this.selectedNode()?.stats;
    const hasPercent = !!s?.damagePercentMaxHp || !!s?.damagePercentCurrentHp;
    if (!p || !s || (s.damageMin === undefined && !hasPercent)) return undefined;
    const key = s.damageType ?? p.spell.damageType ?? DOMAIN_DAMAGE_TYPE[this.primaryDomain()];
    return this.damageTypes.resolve(key);
  });

  /** Nom français d'une compétence, sa clé à défaut. */
  skillLabel = (key: string): string => SKILLS.find((sk) => sk.key === key)?.label ?? key;

  /**
   * Décomposition du soin (base + formules), pour le survol.
   *
   * Trois origines à ne pas confondre, d'où l'étiquette qui dit CHEZ QUI se lit
   * chaque terme : la puissance du lanceur, le corps du soigné, et ce que le
   * lanceur sait faire de ses mains. Sans cette mention, une fiche qui scale sur
   * la constitution laisse croire que c'est celle du mage.
   */
  healBreakdown = computed(() => {
    const s = this.selectedNode()?.stats;
    if (!s || s.heal === undefined) return null;
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
  recoilBreakdown = computed(() => {
    const r = this.selectedNode()?.stats.recoil;
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

  /** Nom français (avec article) d'une stat/attribut : « la vitesse », « l'attaque physique ». */
  statNoun = (s: SpellScalingSource): string => STAT_NOUN[s] ?? this.sourceLabel(s);

  /** Verbe d'action de la phrase d'effet selon les cibles (buff vs malus). */
  effectActionVerb = (node: SpellNode): string =>
    (node.stats.targets ?? []).includes('enemy') ? 'Réduit' : 'Augmente';

  /** Signe d'affichage d'un effet selon les cibles du nœud (+ buff / − malus). */
  effectSign = (node: SpellNode): string =>
    (node.stats.targets ?? []).includes('enemy') ? '−' : '+';

  /** Vrai si le nœud inflige des dégâts sous une forme quelconque (fixe, multi, % PV). */
  nodeHasDamage = (node: SpellNode): boolean => {
    const s = node.stats;
    return (
      s.damageMin !== undefined ||
      !!s.damages?.length ||
      !!s.damagePercentMaxHp ||
      !!s.damagePercentCurrentHp
    );
  };

  /** Vrai si le nœud n'est qu'un malus (cible ennemie, aucun dégât ni soin). */
  isPureMalus = (node: SpellNode): boolean =>
    this.effectSign(node) === '−' && !this.nodeHasDamage(node) && node.stats.heal === undefined;

  /** Vrai si la durée du nœud est scalée par une stat/attribut. */
  durationScaled = (node: SpellNode): boolean => (node.stats.durationScaling?.length ?? 0) > 0;

  /**
   * Décomposition de la durée : durée de base + formules de scaling
   * (`ratio × source`), sans injecter de valeur — pour un calcul à la main.
   */
  durationBreakdown = (node: SpellNode) => ({
    base: node.stats.duration ?? 0,
    parts: (node.stats.durationScaling ?? []).map((sc) => ({
      label: this.sourceLabel(sc.source),
      ratio: sc.ratio,
    })),
  });

  /** Nombre formaté à la française (« 0,2 »). */
  num = (n: number): string => String(n).replace('.', ',');

  /**
   * Décomposition d'un effet : valeur de base + formules de scaling
   * (`ratio × source`), sans injecter de valeur — pour un calcul à la main.
   */
  effectBreakdown = (e: SpellStatEffect) => ({
    base: e.value ?? 0,
    parts: (e.scaling ?? []).map((sc) => ({
      label: this.sourceLabel(sc.source),
      ratio: sc.ratio,
    })),
  });

  /* ─────────────────────────────────────────────
     STATUTS INFLIGÉS + BONUS DE CLASSE
  ───────────────────────────────────────────── */

  /** Statuts infligés par le nœud sélectionné, résolus depuis le catalogue. */
  inflictedStatuses = computed(() => {
    const node = this.selectedNode();
    return (node?.stats.inflicts ?? []).map((app) => {
      const def = this.statusService.byKey(app.status);
      return {
        chance: app.chance,
        duration: app.duration ?? def?.defaultDuration ?? 0,
        def,
      };
    });
  });

  /** Riposte défensive du nœud sélectionné (statuts renvoyés résolus + dégâts). */
  retaliateInfo = computed(() => {
    const r = this.selectedNode()?.stats.retaliate;
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

  /** Chance d'esquive (annulation totale d'une attaque) du nœud sélectionné, ou 0. */
  evadeChance = computed<number>(() => this.selectedNode()?.stats.evadeChance ?? 0);
  /** Cases dont recule chaque cible touchée (0 = le sort ne déplace personne). */
  knockback = computed<number>(() => this.selectedNode()?.stats.knockback ?? 0);
  /** Échelons atteints sur les échelles qualitatives du sort, et ce qu'ils permettent. */
  gradeLines = computed(() => {
    const spell = this.customizable();
    const stats = this.selectedNode()?.stats;
    if (!spell || !stats) return [];
    return (spell.customization.params ?? []).flatMap((p) => {
      const step = p.ladder?.[Math.round(readNum(getAt(stats, p.path)))];
      return step ? [{ label: p.label, step }] : [];
    });
  });
  /** Mesures du sort construit (volume, poids…), dans leur unité, avec leur repère. */
  measures = computed(() => {
    const spell = this.customizable();
    const stats = this.selectedNode()?.stats;
    return spell && stats ? measureLines(spell, stats) : [];
  });
  /** Zone persistante : posée au sol, ou attachée au lanceur (cf. `lingers`). */
  lingers = computed(() => this.selectedNode()?.stats.lingers);

  /** Statuts purifiés par le nœud sélectionné, résolus depuis le catalogue. */
  cleansedStatuses = computed<{ key: string; def?: StatusEffect }[]>(() =>
    (this.selectedNode()?.stats.cleanses ?? []).map((key) => ({
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
  cleanseHolds = computed<boolean>(() => !!this.selectedNode()?.stats.duration);

  /** Jet imposé au corps de la cible par le nœud sélectionné, s'il y en a un. */
  targetSave = computed(() => this.selectedNode()?.stats.targetSave);

  /**
   * Vrai si tous les statuts infligés le sont à coup sûr (100 %). Pilote la
   * formulation : « Applique … » (certain) vs « Peut appliquer … (X %) ».
   */
  allInflictsCertain = computed(() => {
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
  shapedFamily = computed<MaterialFamilyKey | undefined>(
    () => this.selectedNode()?.stats.shapesMaterial ?? this.page()?.spell.shapesMaterial,
  );

  /** Le nom de la famille, pour le titre du bloc. */
  shapedFamilyName = computed<string>(() => {
    const key = this.shapedFamily();
    return MATERIAL_FAMILIES.find((f) => f.key === key)?.name ?? '';
  });

  /**
   * Ce que chaque matière de la famille donne AU PALIER AFFICHÉ.
   *
   * Les trois coûts sont montrés côte à côte parce que c'est exactement la
   * décision du joueur : façonner ce qui est sous ses pieds, conjurer ce qu'il
   * a étudié, ou improviser. Le même sort n'a pas le même prix selon l'endroit,
   * et la fiche doit le dire avant la table, pas pendant.
   */
  /**
   * Matière retenue pour LIRE la fiche.
   *
   * Un tableau comparatif ne suffisait pas : la description du sort continuait
   * d'annoncer les chiffres bruts du palier (« Inflige 1–2 … Terre »), qui ne
   * veulent plus rien dire depuis que c'est la matière qui les dicte. En faire
   * un choix qui pilote TOUTE la fiche règle les deux à la fois.
   */
  readonly sheetMaterial = signal<string | null>(null);

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
   * coup. La fiche doit annoncer cette fraction, pas une frappe entière.
   */
  readonly materialScale = computed<number>(() => {
    const stats = this.selectedNode()?.stats;
    const nimbe = !!enchantTargetOf(this.page()?.spell.key ?? '');
    return (stats?.materialScale ?? 1) * (nimbe ? ENCHANT_SHARE : 1);
  });

  /**
   * Les effets de stats du palier, relus à travers la matière.
   *
   * La défense d'une armure de pierre ne s'écrit plus sur le nœud : elle vient
   * de la dureté de la matière. Sans ce passage, la phrase « Confère défense
   * physique de +18 » restait figée quelle que soit la pierre choisie.
   */
  readonly effectRows = computed(() => {
    const stats = this.selectedNode()?.stats;
    const v = this.materialValues();
    return (stats?.effects ?? [])
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

  /** Ce que la matière donne à ce palier : dégâts, défense, mur. */
  readonly materialValues = computed(() => {
    const m = this.activeMaterial();
    const stats = this.selectedNode()?.stats;
    if (!m || !stats) return null;
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
      perHit: !!enchantTargetOf(this.page()?.spell.key ?? ''),
      where: m.native.length
        ? m.native.map((k) => MATERIAL_REGIONS.find((r) => r.key === k)?.name ?? k).join(', ')
        : 'Nulle part — alliage à conjurer',
    };
  });

  /** Bonus de classe du nœud sélectionné. */
  classBonuses = computed<SpellClassBonus[]>(() => this.selectedNode()?.stats.classBonuses ?? []);

  /** Choix disponibles du nœud sélectionné (sorts à options). */
  choices = computed<SpellChoice[]>(() => this.selectedNode()?.stats.choices ?? []);

  /** Libellé FR d'un type de dégâts (pour faiblesses/résistances). */
  dmgTypeLabel = (key: string): string => this.damageTypes.resolve(key)?.label ?? key;

  /** Une liste de types de dégâts en clair. */
  materialTypes(keys: string[] | undefined): string {
    return (keys ?? []).map((k) => this.dmgTypeLabel(k)).join(', ');
  }

  /** Statuts qu'une matière tient à distance, en clair. */
  materialCleanses = (m: Material): string =>
    (m.cleanses ?? []).map((k) => this.statusService.byKey(k)?.name ?? k).join(', ');

  /** Météo invoquée par le nœud sélectionné, résolue avec ses effets. */
  weatherInfo = computed(() => {
    const key = this.selectedNode()?.stats.weather ?? this.page()?.spell.weather;
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

  /** Statuts résolus d'un choix (nom, chance, durée, définition), pour l'affichage. */
  choiceStatuses = (choice: SpellChoice) =>
    (choice.inflicts ?? []).map((app) => {
      const def = this.statusService.byKey(app.status);
      return { chance: app.chance, duration: app.duration ?? def?.defaultDuration ?? 0, def };
    });

  /** Type de dégâts résolu d'un choix (choix → sort → domaine), pour couleur/badge. */
  choiceDamageType = (choice: SpellChoice) => {
    const key =
      choice.damageType ??
      this.page()?.spell.damageType ??
      DOMAIN_DAMAGE_TYPE[this.primaryDomain()];
    return this.damageTypes.resolve(key);
  };

  /** Libellé FR d'une classe. */
  classLabel = (key: string): string => CLASS_LABELS[key] ?? key;

  /** Libellé FR d'une catégorie de statut. */
  statusCategoryLabel = (cat: StatusCategory): string => STATUS_CATEGORY_LABELS[cat] ?? cat;

  /** Dégâts par tour en % PV max : « 3 → 5 → 7 % PV max / tour » ou « 5 % PV max / tour ». */
  tickPercentLabel = (tick: StatusTick): string | null => {
    const p = tick.percentMaxHp;
    if (p === undefined) return null;
    const value = Array.isArray(p) ? p.join(' → ') : `${p}`;
    return `${value} % PV max / tour`;
  };

  /** Libellé d'anti-soin : « aucun soin possible » (1) ou « soins reçus −50 % ». */
  healReductionLabel = (r: number): string =>
    r >= 1 ? 'aucun soin possible' : `soins reçus −${Math.round(r * 100)} %`;

  /** Durée d'un statut : « ∞ » si négative, sinon « 3 tours ». */
  durationLabel = (d: number): string => (d < 0 ? '∞' : `${d} tour${d > 1 ? 's' : ''}`);

  /** Ligne d'un jet de statut : « Jet de constitution (base 12) tous les 2 tours : purge le statut. » */
  saveLabel = (save: StatusSave): string => {
    const attr = this.sourceLabel(save.attribute);
    const when =
      save.trigger === 'action'
        ? 'à chaque tentative d’action'
        : `tous les ${save.interval ?? 1} tour${(save.interval ?? 1) > 1 ? 's' : ''}`;
    const outcome = save.onSuccess === 'clear' ? 'lève le statut' : 'permet d’agir ce tour';
    return `Jet de ${attr} (base ${save.dc}) ${when} : réussite ${outcome}.`;
  };

  /** Puce d'un modificateur de classe : « +2 Attaque physique ». */
  classEffectChip = (e: SpellStatEffect): string => {
    const v = e.value ?? 0;
    return `${v > 0 ? '+' : ''}${v} ${this.sourceLabel(e.stat)}`;
  };

  /** Puce d'un scaling de classe : « +0,3 × Force (dégâts) ». */
  classScalingChip = (sc: SpellScaling): string => {
    const target = (sc.affects ?? 'damage') === 'heal' ? 'soin' : 'dégâts';
    return `+${this.num(sc.ratio)} × ${this.sourceLabel(sc.source)} (${target})`;
  };

  /** Puce d'un facteur de mana de classe : « Mana −50 % » (0.5) ou « Mana ×1,5 ». */
  manaFactorChip = (f: number): string =>
    f < 1 ? `Mana −${Math.round((1 - f) * 100)} %` : `Mana ×${this.num(f)}`;

  /* ─────────────────────────────────────────────
     NAVIGATION ENTRE SORTS
  ───────────────────────────────────────────── */

  private siblings = computed(() => this.spells.spellSlugsForDomain(this.primaryDomain()));
  private siblingIndex = computed(() => this.siblings().indexOf(this.slug()));

  prevSpell = computed(() => {
    const sibs = this.siblings();
    const i = this.siblingIndex();
    if (sibs.length < 2 || i < 0) return undefined;
    return this.spells.bySlug(sibs[(i - 1 + sibs.length) % sibs.length]);
  });

  nextSpell = computed(() => {
    const sibs = this.siblings();
    const i = this.siblingIndex();
    if (sibs.length < 2 || i < 0) return undefined;
    return this.spells.bySlug(sibs[(i + 1) % sibs.length]);
  });
}
