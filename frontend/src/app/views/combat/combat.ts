import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, concatMap, forkJoin, from, of, toArray } from 'rxjs';
import weatherCatalog from '../../../../public/resources/json/weathers.json';
import { CharacterSheet, CharacterSheetSummary, SurvivalKey } from '../../character/character.types';
import { STATS, SURVIVAL_GAUGES, SurvivalGauge } from '../../character/universe-data';
import { Navbar } from '../../components/navbar/navbar';
import { visibleGroup, WEAPON_CATEGORY_BY_KEY } from '../../combat/abilities';
import { CombatantFactory } from '../../combat/combatant-factory';
import { formatClock, formatDuration, HOUR, MINUTE, TIME_STEPS } from '../../combat/clock';
import {
  ActiveStatus,
  CarriedItem,
  Combatant,
  CombatAbility,
  EncounterPhase,
  EncounterSummary,
  GridPos,
  ConjuredWall,
  LogEntry,
  MetalItem,
  Team,
} from '../../combat/combat.types';
import { Material } from '../../wiki.types';
import { damageLabel } from '../../combat/damage-labels';
import {
  MATERIALS,
  MATERIAL_REGIONS,
  EarthShaping,
  shapingOptions,
} from '../../combat/materials';
import { LootItem, pileSize } from '../../combat/loot';
import { reachableGround } from '../../combat/ground';
import {
  wallAt,
  wallColor,
  WALL_COMMON_WEAKNESS,
  WALL_PERMANENT,
} from '../../combat/walls';
import { metalCarriedBy } from '../../combat/metal';
import { applyReport, diffAgainstSheet, SheetReport, summarize } from '../../combat/sheet-report';
import {
  ACTIVITIES,
  DEFAULT_ACTIVITY,
  HUNGER_SUPPLIES,
  HUNT_TABLE,
  huntBonus,
  notchesLeft,
  nourishmentOf,
  stageOf,
  survivalMods,
} from '../../combat/survival';
import { freeSpot, TEAM_LABELS } from '../../combat/encounter';
import { AutoplayHalt, nextStep, progressFingerprint } from '../../combat/autoplay';
import { TERRAIN_LAYOUTS, TerrainLayout, layoutToTerrain } from '../../combat/layouts';
import { pendingDecider } from '../../combat/tactician';
import { DoorState, newDoor, TERRAIN_KINDS, TerrainKind, terrainKind } from '../../combat/terrain';
import {
  cellKey,
  cellsInShape,
  CELL_METERS,
  hasLineOfSight,
  occupiedCells,
  shapeLabel,
  unitDistanceMeters,
  unitToCellMeters,
} from '../../combat/grid';
import {
  abilityDamageRanges,
  abilityHealAmount,
  abilityManaAmount,
  aims,
  allDaytimes,
  announcedBreakdown,
  explainThreshold,
  cannotUse,
  clockOf,
  phaseOf,
  effectiveManaCost,
  carriedQty,
  effectiveStat,
  enduranceRecovery,
  findUnit,
  isValidTarget,
  movementOverlay,
  movementPath,
  pendingStrikeTargets,
  CASTER_HANDS,
  controllerOf,
  handsBound,
  homesOn,
  statusByKey,
  sustainedBy,
  unitsInEffect,
  swapAnchorMissing,
  swapPartnerAt,
  teleportRangeOf,
  terrainFor,
  applyMaterial,
  forcedMaterialSurcharge,
} from '../../combat/rules';
import { DamageTypesService } from '../../services/damage-types.service';
import { CharacterSheetService } from '../../services/character-sheet.service';
import { EncounterService } from '../../services/encounter.service';
import { StatusEffectsService } from '../../services/status-effects.service';
import { WikiLoaderService } from '../../services/wiki-loader-service';
import { BestiaryEntry, BestiaryIndexEntry, ResourceIndexEntry, Weather } from '../../wiki.types';

/**
 * Ce que le clic sur une case déclenche. `play` couvre aussi la préparation :
 * avant le lancement, cliquer un pion le sélectionne et cliquer une case libre
 * l'y déplace — pas de mode à activer pour ce geste-là.
 */
type Mode = 'play' | 'terrain';

/** Regroupement des actions par nature, pour ne pas noyer le joueur. */
interface ActionGroup {
  key: string;
  label: string;
  kinds: CombatAbility['kind'][];
}

/**
 * Les cinq familles d'action. L'ordre est celui du réflexe : on frappe, puis on
 * cherche mieux, puis on se protège.
 */
const ACTION_GROUPS: ActionGroup[] = [
  { key: 'attaque', label: 'Attaque de base', kinds: ['weapon', 'natural'] },
  { key: 'competences', label: 'Compétences', kinds: ['class'] },
  { key: 'magie', label: 'Magie', kinds: ['spell'] },
  { key: 'objets', label: 'Objets', kinds: ['item'] },
  { key: 'garde', label: 'Garde', kinds: ['guard'] },
];

/** Une case prête à dessiner. */
interface Cell {
  key: string;
  pos: GridPos;
}

@Component({
  selector: 'app-combat',
  imports: [DecimalPipe, FormsModule, RouterLink, Navbar],
  templateUrl: './combat.html',
  styleUrl: './combat.css',
  // Le menu contextuel se referme au premier clic ailleurs, ou sur Échap :
  // un menu flottant qui survit au geste suivant est un piège.
  host: {
    '(document:click)': 'closeMenu()',
    '(document:keydown.escape)': 'closeMenu()',
  },
})
export class CombatView implements OnDestroy {
  private readonly encounters = inject(EncounterService);
  private readonly factory = inject(CombatantFactory);
  private readonly sheets = inject(CharacterSheetService);
  private readonly wiki = inject(WikiLoaderService);
  private readonly damageTypes = inject(DamageTypesService);

  /* ── État partagé avec le service ─────────────────────────────────────── */

  readonly encounter = this.encounters.encounter;
  readonly active = this.encounters.active;
  readonly movementLeft = this.encounters.movementLeft;
  readonly finished = this.encounters.finished;
  readonly canUndo = this.encounters.canUndo;
  readonly saving = this.encounters.saving;
  readonly saveError = this.encounters.error;

  /* ── État propre à la vue ─────────────────────────────────────────────── */

  readonly mode = signal<Mode>('play');
  /** Capacité armée : le prochain clic sur la grille la déclenche. */
  readonly armed = signal<CombatAbility | null>(null);
  readonly hover = signal<GridPos | null>(null);
  /** Cibles désignées une à une pour une capacité « N cibles ». */
  readonly picked = signal<string[]>([]);
  /** Combattant sélectionné hors combat (pour le déplacer ou le retirer). */
  readonly selectedId = signal<string | null>(null);
  readonly panel = signal<'roster' | 'log'>('roster');

  /** Catalogues du montage de rencontre. */
  readonly sheetList = signal<CharacterSheetSummary[]>([]);
  readonly bestiary = signal<BestiaryIndexEntry[]>([]);
  readonly savedList = signal<EncounterSummary[]>([]);
  readonly loadingRoster = signal(true);
  readonly rosterError = signal<string | null>(null);

  /** Équipe dans laquelle atterrissent les ajouts. */
  readonly addTeam = signal<Team>('ennemis');
  readonly bestiaryFilter = signal('');
  readonly sheetFilter = signal('');
  /** Catalogue affiché : ses fiches, ou le bestiaire. */
  readonly rosterTab = signal<'sheets' | 'bestiary'>('sheets');

  readonly weathers = weatherCatalog.weathers as unknown as Weather[];
  readonly daytimes = allDaytimes();
  readonly teams = Object.entries(TEAM_LABELS) as [Team, string][];
  readonly cellMeters = CELL_METERS;
  readonly shapeLabel = shapeLabel;
  readonly statusByKey = statusByKey;
  readonly effectiveStat = effectiveStat;
  readonly enduranceRecovery = enduranceRecovery;
  readonly carriedQty = carriedQty;

  /** Dernière phase vue, pour ne ranger qu'aux vraies bascules. */
  private lastPhase: EncounterPhase | null = null;

  /* ── Le pion qui glisse ─────────────────────────────────────────────────
     L'état est déjà à l'arrivée quand on l'apprend : le vrai pion est donc
     masqué le temps qu'un fantôme parcoure la route à sa place. Rien de tout
     cela ne touche la rencontre — c'est du décor, et une animation ne doit
     jamais pouvoir mentir sur l'état du combat.
  ─────────────────────────────────────────────────────────────────────────── */

  /** Durée d'un pas, en millisecondes. Assez lent pour suivre, assez vif pour ne pas attendre. */
  private static readonly STEP_MS = 110;

  private slideTimer: ReturnType<typeof setTimeout> | null = null;

  /** Le pion en cours de trajet : sa route, et où il en est. */
  readonly slide = signal<{ unitId: string; path: GridPos[]; step: number } | null>(null);

  /** Le combattant qui glisse, s'il y en a un. */
  readonly slidingUnit = computed(() => {
    const en = this.slide();
    return en ? findUnit(this.encounter(), en.unitId) : undefined;
  });

  /**
   * Anime-t-on ? Non hors navigateur, et non pour qui a demandé du calme au
   * système — une case qui se déplace toute seule est exactement ce que le
   * réglage « mouvement réduit » veut éviter.
   */
  private animates(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Lance le parcours : une case, puis la suivante, jusqu'au bout. */
  private startSlide(unitId: string, path: GridPos[]): void {
    if (this.slideTimer) clearTimeout(this.slideTimer);
    this.slide.set({ unitId, path, step: 0 });

    const avancer = (): void => {
      const en = this.slide();
      if (!en) return;
      const next = en.step + 1;
      if (next >= en.path.length) {
        this.slide.set(null);
        this.slideTimer = null;
        return;
      }
      this.slide.set({ ...en, step: next });
      this.slideTimer = setTimeout(avancer, CombatView.STEP_MS);
    };
    this.slideTimer = setTimeout(avancer, CombatView.STEP_MS);
  }

  constructor() {
    this.factory.load().subscribe({
      next: () => this.loadingRoster.set(false),
      error: () => {
        this.loadingRoster.set(false);
        this.rosterError.set("Les catalogues d'armes et d'armures n'ont pas pu être chargés.");
      },
    });

    this.sheets
      .list()
      .pipe(catchError(() => of([] as CharacterSheetSummary[])))
      .subscribe((list) => this.sheetList.set(list));

    this.wiki
      .loadAll<BestiaryIndexEntry>('bestiary')
      .pipe(catchError(() => of([] as BestiaryIndexEntry[])))
      .subscribe((list) => this.bestiary.set(list));

    this.encounters
      .list()
      .pipe(catchError(() => of([] as EncounterSummary[])))
      .subscribe((list) => this.savedList.set(list));

    /* ── Chaque phase range ses outils ──────────────────────────────────
       Le montage pose le décor, le combat joue les tours, le hors-combat fait
       vivre le camp. Traîner d'une phase à l'autre un pinceau de décor, une
       capacité armée ou une dépouille ouverte encombre l'écran de commandes
       qui n'y ont plus cours — c'est ce qui obligeait à faire défiler la page
       pour retrouver ce qu'on cherchait.

       Un effet plutôt qu'un nettoyage dans `setPhase` : la table change aussi
       de phase TOUTE SEULE (l'initiative lancée, la dernière chute), et ces
       bascules-là ne passent pas par le bouton.
    ───────────────────────────────────────────────────────────────────────── */
    effect(() => {
      const phase = this.phase();
      if (phase === this.lastPhase) return;
      this.lastPhase = phase;

      this.armed.set(null);
      this.picked.set([]);
      this.mode.set('play');
      this.featureCell.set(null);
      // La dépouille ouverte n'a de sens qu'au camp ; ailleurs elle occupe la
      // place du panneau d'actions.
      if (phase !== 'exploration') this.lootTargetId.set(null);
    });

    /* ── Le pion suit sa route ──────────────────────────────────────────
       On lit le trajet que le MOTEUR a relevé (`walked`), plutôt que de le
       déduire d'un changement de case. La déduction paraissait suffisante et
       ne l'était pas : la case d'arrivée d'un pas dimensionnel est souvent
       joignable à pied, et l'on voyait alors le pion MARCHER jusqu'à une case
       où il aurait dû se téléporter.

       Seule la marche écrit ce champ. Une téléportation, un échange de place
       n'y laissent rien, et le pion paraît à l'arrivée — sans que la vue ait à
       reconnaître de quel sort il s'agit.

       Lire l'état plutôt que le clic reste nécessaire : un pion bouge aussi
       quand le tacticien joue ou qu'une réaction le déplace.
    ───────────────────────────────────────────────────────────────────────── */
    effect(() => {
      const marche = this.encounter().walked;
      if (!marche || !this.animates()) return;
      // Deux cases au moins : sinon il n'y a rien à faire glisser.
      if (marche.path.length > 1) this.startSlide(marche.unitId, marche.path);
    });

    // Poids de ce qui peut entrer dans un sac en cours de séance : les
    // dépouilles ramassées sur les corps, et les vivres rapportés de la chasse.
    // Sans eux, l'encombrement du personnage mentirait au report sur sa fiche.
    for (const collection of ['natural-resources/remains', 'equipment']) {
      this.wiki
        .loadAll<ResourceIndexEntry>(collection)
        .pipe(catchError(() => of([] as ResourceIndexEntry[])))
        .subscribe((list) => {
          for (const entry of list) this.lootWeights.set(entry.name, entry.weight ?? 0);
        });
    }
  }

  /* ── Grille ───────────────────────────────────────────────────────────── */

  /** Toutes les cases, à plat, pour le rendu du template. */
  readonly cells = computed<Cell[]>(() => {
    const { width, height } = this.encounter().grid;
    const out: Cell[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) out.push({ key: `${x},${y}`, pos: { x, y } });
    }
    return out;
  });

  /** Décor de la rencontre, case par case. */
  readonly terrain = computed(() => this.encounter().terrain);

  /* ── Le décor qu'on manipule ──────────────────────────────────────────
     Une porte n'est pas un mur : cliquer dessus hors préparation ouvre ses
     actions — ouvrir, crocheter, enfoncer — comme cliquer un corps ouvre sa
     dépouille. C'est le même geste, appliqué au décor.
  ─────────────────────────────────────────────────────────────────────────── */

  /** Case du décor ouverte dans le panneau d'actions. */
  readonly featureCell = signal<string | null>(null);

  /** État de la porte ouverte dans le panneau, s'il y en a une. */
  readonly openedDoor = computed(() => {
    const cell = this.featureCell();
    if (!cell) return null;
    const enc = this.encounter();
    if (!terrainKind(enc.terrain[cell])?.operable) return null;
    return { cell, door: enc.features?.[cell] ?? newDoor() };
  });

  /** Y a-t-il un élément manipulable sur cette case ? */
  isOperable(cell: string): boolean {
    return !!terrainKind(this.encounter().terrain[cell])?.operable;
  }

  /** État d'une porte pour l'affichage de la case. */
  doorAt(cell: string): DoorState | undefined {
    return this.isOperable(cell) ? (this.encounter().features?.[cell] ?? newDoor()) : undefined;
  }

  /**
   * Qui agit sur le décor : le combattant actif en combat, le personnage
   * désigné hors combat. C'est lui qui doit être à portée du battant.
   */
  readonly handler = computed<Combatant | undefined>(() =>
    this.phase() === 'combat' ? this.active() : this.looter(),
  );

  door(cell: string, act: 'open' | 'close' | 'pick' | 'break' | 'lock' | 'unlock'): void {
    this.encounters.dispatch({ type: 'door', cell, act, actorId: this.handler()?.id });
  }

  /** Le MJ décide qui sait nager. */
  toggleSwim(unit: Combatant): void {
    this.encounters.dispatch({ type: 'setSwim', actorId: unit.id, canSwim: !unit.canSwim });
  }
  /* ── Résolution autonome ──────────────────────────────────────────────
     Faire jouer l'adversaire SOUS LES YEUX du MJ. Une action à la fois, avec
     un temps d'arrêt entre chaque : dérouler le tour d'un bloc ne laisserait
     qu'un journal à lire après coup, et l'on ne verrait ni qui se déplace, ni
     qui riposte.
  ─────────────────────────────────────────────────────────────────────────── */

  /** Camps confiés au tacticien. Vide = le MJ joue tout, comme avant. */
  readonly autoTeams = signal<Team[]>([]);
  /** La résolution tourne-t-elle ? */
  readonly autoRunning = signal(false);
  /** Millisecondes entre deux actions : c'est le temps de VOIR. */
  readonly autoDelay = signal(700);
  /** Pourquoi la résolution s'est arrêtée, à afficher. */
  readonly autoHalt = signal<AutoplayHalt | null>(null);

  private autoTimer: ReturnType<typeof setTimeout> | null = null;

  /** Le camp est-il joué par le tacticien ? */
  isAuto(team: Team): boolean {
    return this.autoTeams().includes(team);
  }

  /** Confie un camp au tacticien, ou le rend au MJ. */
  toggleAuto(team: Team): void {
    this.autoTeams.update((teams) =>
      teams.includes(team) ? teams.filter((t) => t !== team) : [...teams, team],
    );
    this.autoHalt.set(null);
  }

  /** À qui revient la main : le tour, ou la fenêtre de réaction ouverte. */
  readonly decider = computed(() => pendingDecider(this.encounter()));

  /** Le tacticien a-t-il quelque chose à jouer, là, maintenant ? */
  readonly autoCanPlay = computed(() => {
    const who = this.decider();
    return !!who && this.autoTeams().includes(who.team) && !this.finished();
  });

  /**
   * Joue UNE action du tacticien.
   *
   * Rend `false` quand il n'y a rien à jouer ou que le moteur a refusé : c'est
   * ce que la boucle attend pour s'arrêter d'elle-même.
   */
  autoStep(): boolean {
    const before = this.encounter();
    const step = nextStep(before, {
      teams: this.autoTeams(),
      stopOnHuman: true,
    });
    if (step.kind === 'halt') {
      this.autoHalt.set(step.reason);
      return false;
    }

    const empreinte = progressFingerprint(before);
    this.encounters.dispatch(step.decision.action);

    // Une action que le moteur a refusée laisse le monde tel quel : insister
    // figerait l'écran. On passe le tour plutôt que de boucler.
    if (progressFingerprint(this.encounter()) === empreinte) {
      this.encounters.dispatch({ type: 'endTurn' });
    }
    return true;
  }

  /** Lance la résolution : elle jouera jusqu'à ce que la main te revienne. */
  autoPlay(): void {
    if (this.autoRunning()) return this.autoStop();
    this.autoHalt.set(null);
    this.autoRunning.set(true);
    this.autoTick();
  }

  /** Arrête la résolution en cours. Le combat reste où il en est. */
  autoStop(): void {
    this.autoRunning.set(false);
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = null;
  }

  private autoTick(): void {
    if (!this.autoRunning()) return;
    if (!this.autoStep()) return this.autoStop();
    this.autoTimer = setTimeout(() => this.autoTick(), this.autoDelay());
  }

  /** Un minuteur qui survit à la vue continuerait de jouer dans le vide. */
  ngOnDestroy(): void {
    this.autoStop();
    if (this.slideTimer) clearTimeout(this.slideTimer);
  }

  readonly terrainKinds = TERRAIN_KINDS;
  readonly terrainLayouts = TERRAIN_LAYOUTS;

  /**
   * Pose un décor préfabriqué, en REMPLAÇANT ce qui était là.
   *
   * Remplacer plutôt que superposer : deux cartes mêlées ne donnent pas un
   * terrain, elles donnent un labyrinthe dont personne n'a dessiné les
   * couloirs. Reposer la même carte l'efface, comme un pinceau de la palette.
   */
  applyLayout(layout: TerrainLayout): void {
    const encoutant = this.encounter();
    const pose = layoutToTerrain(layout, encoutant.grid);
    const dejaLa =
      this.activeLayout() === layout.key;
    this.encounters.edit((draft) => {
      draft.terrain = dejaLa ? {} : pose;
    });
    this.activeLayout.set(dejaLa ? null : layout.key);
  }

  /** Le décor actuellement posé, s'il vient d'une carte. */
  readonly activeLayout = signal<string | null>(null);

  /** Efface tout le décor. */
  clearTerrain(): void {
    this.encounters.edit((draft) => {
      draft.terrain = {};
    });
    this.activeLayout.set(null);
  }
  /** Décor que le prochain clic pose (ou efface si la case le porte déjà). */
  readonly brush = signal<string>('mur');

  terrainAt(key: string): TerrainKind | undefined {
    return terrainKind(this.terrain()[key]);
  }

  /* ── Actions groupées ─────────────────────────────────────────────────── */

  readonly actionGroups = ACTION_GROUPS;
  /** Famille d'action affichée. */
  readonly actionTab = signal<string>('attaque');

  /** Capacités du combattant actif, rangées par famille. */
  readonly abilitiesByGroup = computed(() => {
    const unit = this.active();
    const out = new Map<string, CombatAbility[]>();
    for (const group of ACTION_GROUPS) {
      out.set(group.key, (unit?.abilities ?? []).filter((a) => group.kinds.includes(a.kind)));
    }
    // Changer d'arme est un GESTE D'OBJET, pas une attaque : il se range avec
    // les fioles, dans le même onglet et sur le même créneau. Le poser dans un
    // panneau à part le sortait du seul endroit où le joueur cherche « ce que
    // je peux faire d'autre que frapper ».
    if (unit) out.get('objets')?.push(...this.weaponSwitches(unit));
    return out;
  });

  /**
   * Les gestes d'armement, présentés comme des objets.
   *
   * Ce sont des entrées SYNTHÉTIQUES : elles ne vivent pas sur le combattant,
   * elles se recalculent à chaque changement de sac. Leur `id` les distingue
   * (`switch:` / `stow:`), et `toggleAbility` les intercepte avant d'armer quoi
   * que ce soit — il n'y a rien à viser quand on dégaine.
   */
  private weaponSwitches(unit: Combatant): CombatAbility[] {
    const geste = (id: string, name: string, subtitle: string): CombatAbility => ({
      id,
      name,
      kind: 'item',
      subtitle,
      rangeMeters: 0,
      shape: { kind: 'self' },
      targets: ['self'],
      manaCost: 0,
      enduranceCost: 0,
      damages: [],
      autoHit: true,
      bonusAction: true,
    });

    const gestes: CombatAbility[] = [];
    for (const slot of ['weapon', 'offhand'] as const) {
      const arme = unit.abilities.find((a) => a.kind === 'weapon' && a.id === `weapon:${slot}`);
      if (!arme) continue;
      const main = slot === 'offhand' ? 'main faible' : 'main principale';
      gestes.push(geste(`stow:${slot}`, arme.name, `Ranger · ${main}`));
    }
    for (const line of unit.inventory) {
      if (!line.weapon || line.qty <= 0) continue;
      // Ce vers quoi on change doit se lire AVANT de cliquer : les dégâts de
      // l'arme, et si le bras sait s'en servir. Sans cela, dégainer est un pari.
      const { minDamage, maxDamage, weaponCategory } = line.weapon.source;
      const categorie = weaponCategory ? WEAPON_CATEGORY_BY_KEY.get(weaponCategory) : undefined;
      const maitrise = weaponCategory && unit.weaponProficiencies?.includes(weaponCategory);
      gestes.push(
        geste(
          `switch:${line.name}`,
          line.name,
          [
            'Dégainer',
            `${minDamage}–${maxDamage} ${damageLabel(categorie?.damageType ?? 'bludgeoning')}`,
            maitrise ? 'maîtrisée' : 'NON maîtrisée',
          ].join(' · '),
        ),
      );
    }
    return gestes;
  }

  /** Capacités de la famille affichée. */
  /** L'onglet réellement affiché : le sien s'il est garni, sinon le premier qui l'est. */
  readonly effectiveTab = computed(() =>
    visibleGroup(
      ACTION_GROUPS.map((g) => g.key),
      this.abilitiesByGroup(),
      this.actionTab(),
    ),
  );

  readonly visibleAbilities = computed(
    () => this.abilitiesByGroup().get(this.effectiveTab()) ?? [],
  );

  /** Combien d'actions disponibles dans une famille (pour la pastille). */
  countIn(group: string): number {
    return this.abilitiesByGroup().get(group)?.length ?? 0;
  }

  /** Cases atteignables par le combattant actif (surbrillance du déplacement). */
  readonly reachable = computed(() => {
    const unit = this.active();
    if (!unit || this.armed()) return new Map<string, number>();
    return movementOverlay(this.encounter(), unit);
  });

  /* ── Le trajet ──────────────────────────────────────────────────────────
     Une case verte dit qu'on peut aller là ; elle ne dit pas PAR OÙ. Or c'est
     le trajet qui coûte : contourner un pilier double parfois l'addition, et
     le joueur ne le découvrait qu'après avoir cliqué. On dessine donc la route
     sous le curseur, puis on la fait parcourir au pion — le même chemin, aux
     deux moments où il compte.
  ─────────────────────────────────────────────────────────────────────────── */

  /**
   * Le trajet sous le curseur : rang de chaque case sur la route, de 1 à n.
   *
   * La case de départ en est exclue : on montre ce qui reste à parcourir, pas
   * l'endroit d'où l'on vient.
   */
  readonly pathPreview = computed(() => {
    const unit = this.active();
    const at = this.hover();
    const out = new Map<string, number>();
    // Rien à tracer si une capacité est armée : le clic ne déplacera pas.
    if (!unit || !at || this.armed() || !this.reachable().has(cellKey(at))) return out;
    const route = movementPath(this.encounter(), unit, at);
    route.slice(1).forEach((cell, index) => out.set(cellKey(cell), index + 1));
    return out;
  });

  /* ── Réactions ──────────────────────────────────────────────────────────
     Une fenêtre ouverte gèle le combat : tant qu'elle n'est pas tranchée, le
     plateau ne sert qu'à ça.
  ─────────────────────────────────────────────────────────────────────── */

  /** Fenêtre de réaction ouverte, s'il y en a une. */
  readonly reaction = computed(() => this.encounter().pendingReaction);

  /** Le combattant à qui la fenêtre est offerte. */
  readonly reactor = computed(() => {
    const pending = this.reaction();
    return pending ? findUnit(this.encounter(), pending.actorId) : undefined;
  });

  /** Capacités qu'il peut employer en réponse. */
  readonly reactionChoices = computed<CombatAbility[]>(() => {
    const pending = this.reaction();
    const unit = this.reactor();
    if (!pending || !unit) return [];
    return unit.abilities.filter((a) => pending.options.includes(a.id));
  });

  /**
   * Réaction en attente d'une case : téléportation (où va-t-on ?) ou échange
   * (avec qui ?). Les autres réactions se jouent d'un clic ; ces deux-là n'ont
   * aucun sens sans qu'on désigne l'autre bout.
   */
  readonly teleporting = signal<CombatAbility | null>(null);

  /**
   * Cases cliquables pour la réaction en attente.
   *
   * Une téléportation cherche du VIDE à sa portée de saut ; un échange cherche
   * un CORPS marqué, sans ligne de vue. Deux questions opposées, donc deux
   * balayages — mais un seul surlignage, celui que le clic honorera.
   */
  readonly teleportCells = computed(() => {
    const ability = this.teleporting();
    const unit = this.reactor();
    if (!ability || !unit) return new Set<string>();
    if (ability.swap) return this.swapCellsFor(unit, ability);
    return this.teleportCellsFor(unit, ability);
  });

  /**
   * Cases où `unit` peut réellement atterrir avec cette téléportation.
   *
   * C'est le MOTEUR qui tranche, case par case : distance de saut, ligne de vue,
   * place libre. Une seule règle, donc, et ce qui est surligné est exactement ce
   * que le clic réussira — la vue en avait une deuxième version, plus indulgente
   * que le moteur, qui proposait des cases occupées.
   */
  private teleportCellsFor(unit: Combatant, ability: CombatAbility): Set<string> {
    const enc = this.encounter();
    // Une réaction ne dépend ni de l'action du tour ni de l'action bonus, et le
    // moteur les efface le temps de la résoudre : on l'interroge donc dans les
    // mêmes conditions.
    const probe = { ...unit, actionUsed: false, bonusActionUsed: false };
    const cells = new Set<string>();
    for (const cell of this.cells()) {
      if (!cannotUse(enc, probe, ability, cell.pos)) cells.add(cell.key);
    }
    return cells;
  }

  /**
   * Cases de ce qu'une détonation de marques emportera.
   *
   * Le moteur reste seul juge de la liste (`unitsInEffect`) : le calque montre
   * donc exactement ce qui va sauter, alliés et lanceur compris quand le sort
   * ne fait pas le tri.
   */
  private markedCellsFor(unit: Combatant, ability: CombatAbility): Set<string> {
    const cells = new Set<string>();
    for (const cible of unitsInEffect(this.encounter(), unit, ability, unit.pos)) {
      for (const cell of occupiedCells(cible)) cells.add(cellKey(cell));
    }
    return cells;
  }

  /**
   * Cases occupées par quelqu'un que `unit` peut permuter avec cette capacité.
   *
   * C'est le moteur qui tranche (`swapPartnerAt`) : ce qui est surligné est donc
   * exactement ce que le clic réussira, jamais un espoir.
   */
  private swapCellsFor(unit: Combatant, ability: CombatAbility): Set<string> {
    const cells = new Set<string>();
    const enc = this.encounter();
    for (const other of enc.combatants) {
      for (const cell of occupiedCells(other)) {
        if (swapPartnerAt(enc, unit, ability, cell)) cells.add(cellKey(cell));
      }
    }
    return cells;
  }

  /**
   * Pourquoi l'échange proposé en réaction ne mène à rien, ou `null`.
   *
   * La fenêtre de réaction est le pire moment pour laisser quelqu'un chercher :
   * le combat est gelé et le joueur a quelques secondes pour trancher. On dit
   * donc lequel des deux bouts du fil manque.
   */
  swapRefusal(ability: CombatAbility): string | null {
    const unit = this.reactor();
    if (!unit) return null;
    const ancre = swapAnchorMissing(unit, ability);
    if (ancre) return ancre;
    const marque = ability.swapMark ? statusByKey(ability.swapMark)?.name : undefined;
    return marque
      ? `personne à portée ne porte votre « ${marque} ».`
      : 'personne à permuter à portée.';
  }

  /**
   * Distance franchissable d'un saut, en mètres.
   *
   * Distincte de la portée : « Évasion enflammée » porte « Autour de soi »,
   * qui décrit son BRASIER, pas la longueur du bond.
   */
  jumpRange(ability: CombatAbility): number {
    return teleportRangeOf(ability);
  }

  /** Choisit une réaction : soit elle part, soit elle attend son autre bout. */
  chooseReaction(ability: CombatAbility): void {
    if (ability.teleport || ability.swap) {
      this.teleporting.set(ability);
      return;
    }
    this.encounters.dispatch({ type: 'react', abilityId: ability.id });
  }

  skipReaction(): void {
    this.teleporting.set(null);
    this.encounters.dispatch({ type: 'skipReaction' });
  }

  /** Frappe gratuite en attente de cible, s'il y en a une. */
  readonly pending = computed(() => this.encounter().pendingStrike);

  /** Combattants que la frappe gratuite peut atteindre. */
  readonly pendingTargets = computed(() => pendingStrikeTargets(this.encounter()));

  /** Cases où cliquer déclenche la frappe gratuite. */
  readonly pendingCells = computed(() => {
    const cells = new Set<string>();
    for (const unit of this.pendingTargets()) {
      for (const cell of occupiedCells(unit)) cells.add(cellKey(cell));
    }
    return cells;
  });

  /**
   * Zone de gêne de l'arme armée : y tirer coûte la moitié des dégâts. On la
   * mesure avec la même fonction que le moteur, donc ce qui est surligné est
   * exactement ce qui sera pénalisé.
   */
  readonly disadvantageCells = computed(() => {
    const ability = this.armed();
    const unit = this.active();
    const cells = new Set<string>();
    if (!ability?.disadvantageMeters || !unit) return cells;
    for (const cell of this.cells()) {
      if (unitToCellMeters(unit, cell.pos) <= ability.disadvantageMeters + 1e-6) {
        cells.add(cell.key);
      }
    }
    return cells;
  });

  /**
   * Cases à portée de la capacité armée. On mesure avec la même fonction que le
   * moteur (`unitToCellMeters`) et on écarte ce que la vue ne voit pas : une
   * case surlignée est donc une case réellement ciblable, jamais un espoir.
   */
  readonly rangeOverlay = computed(() => {
    const ability = this.armed();
    const unit = this.active();
    const cells = new Set<string>();
    if (!ability || !unit) return cells;

    // Un échange ne vise pas un point : il tire sur un lien déjà noué. Seules
    // les cases de ses porteurs comptent, et aucun mur ne les cache.
    if (ability.swap) return this.swapCellsFor(unit, ability);
    // Une détonation ne se vise pas du tout : on montre ce qu'elle emportera.
    if (ability.shape.kind === 'marked') return this.markedCellsFor(unit, ability);
    // Une téléportation vise sa DESTINATION. Elle passait au travers de ce
    // calque : sa zone est « Soi-même » — c'est le sort qui n'affecte que son
    // lanceur — et l'on renonçait donc avant d'avoir regardé où il peut se
    // rendre. Le joueur ne voyait aucune portée et cliquait à l'aveugle.
    if (ability.teleport) return this.teleportCellsFor(unit, ability);

    if (ability.shape.kind === 'self') return cells;

    // Décor RÉSOLU : une porte ouverte ne coupe plus la ligne de vue, et la
    // portée affichée doit être celle que le moteur validera.
    const terrain = terrainFor(this.encounter());
    for (const cell of this.cells()) {
      if (unitToCellMeters(unit, cell.pos) > ability.rangeMeters + 1e-6) continue;
      if (!hasLineOfSight(unit.pos, cell.pos, terrain)) continue;
      cells.add(cell.key);
    }

    // Un rayon à tête chercheuse atteint aussi ce qu'il ne voit PAS, pourvu que
    // ce soit marqué et joignable. Ces cases-là s'ajoutent après coup : elles
    // sont peu nombreuses (il faut un corps marqué dessus), donc le chemin ne
    // se cherche que pour elles.
    if (ability.homingMark) {
      for (const other of this.encounter().combatants) {
        if (other.down || other.id === unit.id) continue;
        if (unitDistanceMeters(unit, other) > ability.rangeMeters + 1e-6) continue;
        if (!homesOn(this.encounter(), unit, ability, other)) continue;
        for (const cell of occupiedCells(other)) cells.add(cellKey(cell));
      }
    }
    return cells;
  });

  /**
   * Empreinte de la capacité armée sous le curseur. C'est la même fonction que
   * celle du moteur : ce qui est surligné est exactement ce qui sera touché.
   */
  readonly areaPreview = computed(() => {
    const ability = this.armed();
    const unit = this.active();
    const at = this.hover();
    if (!ability || !unit) return new Set<string>();
    // Sans case à survoler : la détonation frappe déjà tout ce qui est marqué.
    if (ability.shape.kind === 'marked') return this.markedCellsFor(unit, ability);
    if (!at) return new Set<string>();
    // Pour un saut, ce qui compte sous le curseur est l'empreinte à L'ARRIVÉE :
    // montrer la case de départ n'apprend rien à qui cherche où atterrir.
    if (ability.teleport) {
      return new Set(occupiedCells({ pos: at, footprint: unit.footprint }).map(cellKey));
    }
    if (ability.shape.kind === 'self') return new Set(occupiedCells(unit).map(cellKey));
    if (ability.shape.kind === 'targets') return new Set<string>();
    return new Set(cellsInShape(ability.shape, unit.pos, at, this.encounter().grid).map(cellKey));
  });

  /** Combattants indexés par case occupée (une grande créature en couvre plusieurs). */
  readonly unitByCell = computed(() => {
    const map = new Map<string, Combatant>();
    for (const unit of this.encounter().combatants) {
      for (const cell of occupiedCells(unit)) map.set(cellKey(cell), unit);
    }
    return map;
  });

  unitAt(key: string): Combatant | undefined {
    return this.unitByCell().get(key);
  }

  /** Le token n'est dessiné qu'à sa case d'ancrage (les autres sont son corps). */
  isAnchor(unit: Combatant, pos: GridPos): boolean {
    return unit.pos.x === pos.x && unit.pos.y === pos.y;
  }

  /* ── Interactions ─────────────────────────────────────────────────────── */

  onCellClick(pos: GridPos): void {
    const key = cellKey(pos);

    // Une réaction en attente prime sur tout le reste.
    if (this.reaction()) {
      const teleport = this.teleporting();
      if (teleport && this.teleportCells().has(key)) {
        this.encounters.dispatch({ type: 'react', abilityId: teleport.id, at: pos });
        this.teleporting.set(null);
      }
      return;
    }

    // Une frappe gratuite en attente prime ensuite : tant qu'elle n'est pas
    // tranchée, le plateau ne sert qu'à désigner sa cible.
    if (this.pending()) {
      const target = this.unitAt(key);
      if (target && this.pendingCells().has(key)) {
        this.encounters.dispatch({ type: 'freeStrike', targetId: target.id });
      }
      return;
    }

    // Peinture du décor : AU MONTAGE uniquement. Une rencontre en cours ne
    // voit pas les murs pousser sous les pieds des combattants, et le camp n'a
    // pas à porter une palette dont personne ne se sert.
    if (this.phase() === 'setup' && this.mode() === 'terrain') {
      const pinceau = this.brush();
      this.encounters.edit((draft) => {
        // Repasser le même décor l'efface : un seul geste pour poser et retirer.
        if (draft.terrain[key] === pinceau) delete draft.terrain[key];
        else draft.terrain[key] = pinceau;
      });
      return;
    }

    // Une porte se manipule dès que la partie est lancée : cliquer dessus ouvre
    // ses actions, comme cliquer un corps ouvre sa dépouille. En préparation on
    // la POSE (palette de décor), on ne l'actionne pas.
    if (this.mode() !== 'terrain' && this.phase() !== 'setup' && this.isOperable(key) && !this.unitAt(key)) {
      this.featureCell.set(this.featureCell() === key ? null : key);
      return;
    }

    // Hors combat, le plateau sert à FOUILLER — cliquer un corps ouvre sa
    // dépouille, cliquer un vivant en fait l'acteur — mais il reste un plateau :
    // on doit pouvoir replacer le groupe autour du feu. Une case libre déplace
    // donc le pion sélectionné, comme au montage, et SANS budget de
    // déplacement : marcher jusqu'au ruisseau ne se compte pas en mètres.
    if (this.phase() === 'exploration') {
      const unit = this.unitAt(key);
      if (unit) {
        this.select(unit);
        return;
      }
      this.walkSelected(pos);
      return;
    }

    // Au montage, le plateau se manipule directement : cliquer un pion le
    // sélectionne, cliquer une case libre y déplace le pion sélectionné. Pas de
    // mode à activer — c'est le geste attendu.
    if (this.phase() === 'setup') {
      const onCell = this.unitAt(key);
      if (onCell) {
        this.select(onCell);
        return;
      }
      this.placeSelected(pos);
      return;
    }

    const ability = this.armed();
    const unit = this.active();
    if (!unit) return;

    if (ability) {
      // Capacité à cibles désignées : on accumule les clics jusqu'au compte.
      if (ability.shape.kind === 'targets') {
        const target = this.unitAt(key);
        if (target && isValidTarget(this.encounter(), ability, unit, target) && !target.down) {
          const next = [...new Set([...this.picked(), target.id])];
          this.picked.set(next.slice(0, ability.shape.count));
          if (next.length >= ability.shape.count) this.fire(pos);
        }
        return;
      }
      // Arracher du métal demande de savoir QUOI : on désigne d'abord la cible,
      // le panneau montre ce qu'elle porte, et le tir part au choix de la prise.
      // Sans cette pause, le moteur prendrait la première venue et le joueur
      // n'aurait jamais la main sur ce qu'il vole.
      if (ability.pullsMetal) {
        const target = this.unitAt(key);
        if (target && !target.down && isValidTarget(this.encounter(), ability, unit, target)) {
          const prises = metalCarriedBy(target);
          // Rien à prendre, ou une seule prise possible : pas de choix à poser.
          if (prises.length > 1) {
            this.pullTarget.set({ id: target.id, at: pos });
            return;
          }
        } else if (!target) {
          // Case vide de tout corps : c'est le SOL qu'on aimante. Même pause
          // dès qu'il y a plus d'une pièce de ferraille dessus.
          const ferreux = (this.encounter().ground?.[key] ?? []).filter((i) => i.metallic);
          if (ferreux.length > 1) {
            this.pullTarget.set({ at: pos });
            return;
          }
        }
      }
      this.fire(pos);
      return;
    }

    // Un mur occupe la case et aucune capacité n'est armée : on regarde de quoi
    // il est fait plutôt que d'essayer de marcher dedans.
    const mur = this.wallOn(key);
    if (mur) {
      this.openWall.set(this.openWall() === mur.id ? null : mur.id);
      return;
    }

    // Aucune capacité armée : le clic déplace, si la case est atteignable.
    if (this.reachable().has(key)) {
      this.encounters.dispatch({ type: 'move', actorId: unit.id, to: pos });
    }
  }

  private fire(at: GridPos, item?: string): void {
    const ability = this.armed();
    const unit = this.active();
    if (!ability || !unit) return;
    this.encounters.dispatch({
      type: 'use',
      actorId: unit.id,
      abilityId: ability.id,
      at,
      targetIds: this.picked(),
      item: item ?? this.thrownItem() ?? this.shapeMaterial() ?? undefined,
    });
    this.armed.set(null);
    this.picked.set([]);
    this.thrownItem.set(null);
    this.shapeMaterial.set(null);
    this.pullTarget.set(null);
  }

  /** Arme une capacité (ou la désarme si on reclique dessus). */
  toggleAbility(ability: CombatAbility): void {
    // Dégainer et rengainer ne se visent pas : ils partent tout de suite, sans
    // passer par l'armement d'une capacité.
    if (this.playWeaponSwitch(ability)) return;
    this.picked.set([]);
    this.thrownItem.set(null);
    this.shapeMaterial.set(null);
    this.pullTarget.set(null);
    this.armed.set(this.armed()?.id === ability.id ? null : ability);
  }

  /** Joue un geste d'armement s'il en est un. Rend `true` s'il a été traité. */
  private playWeaponSwitch(ability: CombatAbility): boolean {
    const unit = this.active();
    if (!unit) return false;
    if (ability.id.startsWith('switch:')) {
      this.equip(ability.id.slice('switch:'.length), 'weapon');
      return true;
    }
    if (ability.id.startsWith('stow:')) {
      this.unequip(ability.id.slice('stow:'.length) as 'weapon' | 'offhand');
      return true;
    }
    return false;
  }

  /* ── Le métal qu'on saisit ────────────────────────────────────────────────
     Deux choix, et ils n'arrivent pas au même moment. Ce qu'on PROJETTE sort de
     son propre sac : on le sait dès que le sort est armé. Ce qu'on ARRACHE
     dépend de la cible : il faut d'abord la désigner, puis regarder ce qu'elle
     porte. D'où deux signaux plutôt qu'un.
  ─────────────────────────────────────────────────────────────────────────── */

  /* ── Choisir sa matière ───────────────────────────────────────────────────
     Un sort de Terre prenait d'office ce que le sol offrait. C'était le
     comportement PAR DÉFAUT, pas une fatalité : le moteur sait déjà forcer une
     matière (cf. `resolveShaping`), il manquait seulement de quoi la désigner.
  ─────────────────────────────────────────────────────────────────────────── */

  /** Matière choisie pour le sort de Terre armé. */
  readonly shapeMaterial = signal<string | null>(null);

  /** Tout ce que le lanceur peut façonner ici, du moins cher au plus cher. */
  readonly shapeOptions = computed<EarthShaping[]>(() => {
    const unit = this.active();
    const ability = this.armed();
    if (!unit || !ability?.shapesMaterial) return [];
    return shapingOptions(ability.shapesMaterial, this.encounter().geology, unit.earthMaterials);
  });

  /** La matière retenue : celle qu'on a désignée, sinon la première proposée. */
  readonly chosenShape = computed<EarthShaping | undefined>(() => {
    const options = this.shapeOptions();
    const voulu = this.shapeMaterial();
    return options.find((o) => o.material.key === voulu) ?? options[0];
  });

  /** Le palier, en un mot, pour la pastille du choix. */
  shapeTierLabel(tier: EarthShaping['tier']): string {
    return tier === 'manipulation'
      ? 'sur place'
      : tier === 'ex-nihilo'
        ? 'conjuré'
        : 'de mémoire';
  }

  /**
   * La capacité TELLE QU'ELLE SERAIT avec cette matière.
   *
   * Calculée par `applyMaterial`, la fonction que le moteur emploie lui-même à
   * la résolution : l'aperçu ne peut donc pas mentir sur ce qui va se passer.
   */
  shapedWith(shaping: EarthShaping): CombatAbility | undefined {
    const ability = this.armed();
    if (!ability) return undefined;
    const surcout = forcedMaterialSurcharge(
      this.encounter().geology,
      ability.shapesMaterial,
      shaping.material.key,
      true,
    );
    return applyMaterial(ability, shaping, surcout);
  }

  /** Ce que la matière coûtera vraiment, surcoût de forçage compris. */
  shapeManaCost(shaping: EarthShaping): number {
    return this.shapedWith(shaping)?.manaCost ?? 0;
  }

  /** Ce que le sort DONNE avec cette matière : dégâts, défense, enchantement, mur. */
  shapeEffects(shaping: EarthShaping): string[] {
    const unit = this.active();
    const forme = this.shapedWith(shaping);
    if (!unit || !forme) return [];
    return [...this.damageChips(unit, forme), ...this.statChips(unit, forme)];
  }

  /** Ce que la matière transmet en plus : faiblesses, résistances, purges. */
  shapeTraits(shaping: EarthShaping): string[] {
    const m = shaping.material;
    const out: string[] = [];
    for (const k of m.resistances ?? []) out.push(`résiste ${this.damageTypes.resolve(k)?.label ?? k}`);
    for (const k of m.weaknesses ?? []) out.push(`fragile ${this.damageTypes.resolve(k)?.label ?? k}`);
    for (const k of m.cleanses ?? []) out.push(`écarte ${k}`);
    return out;
  }

  /** Projectile choisi pour un sort qui lance du métal. */
  readonly thrownItem = signal<string | null>(null);
  /**
   * Prise en attente de choix : un corps qu'on dépouille, ou une case qu'on
   * aimante. `id` absent = c'est le sol qu'on vise.
   */
  readonly pullTarget = signal<{ id?: string; at: GridPos } | null>(null);

  /** Le ferreux que le combattant actif peut projeter. */
  readonly throwable = computed<MetalItem[]>(() => {
    const unit = this.active();
    const ability = this.armed();
    return unit && ability?.throwsMetal ? metalCarriedBy(unit) : [];
  });

  /** Le ferreux qu'on peut arracher à la prise désignée — un corps, ou le sol. */
  readonly pullable = computed<MetalItem[]>(() => {
    const pending = this.pullTarget();
    if (!pending) return [];
    if (pending.id) {
      const target = this.encounter().combatants.find((c) => c.id === pending.id);
      return target ? metalCarriedBy(target) : [];
    }
    const key = `${pending.at.x},${pending.at.y}`;
    return (this.encounter().ground?.[key] ?? [])
      .filter((i) => i.metallic && i.qty > 0)
      .map((i) => ({ name: i.name, source: 'ground' as const, at: pending.at, thrown: { min: 0, max: 0, type: '' } }));
  });

  /** Ce qu'on dépouille : quelqu'un, ou une case du sol. */
  readonly pullTargetName = computed<string>(() => {
    const pending = this.pullTarget();
    if (!pending) return '';
    if (!pending.id) return `au sol (${pending.at.x}, ${pending.at.y})`;
    const target = this.encounter().combatants.find((c) => c.id === pending.id);
    return target?.name ?? '';
  });

  /** Ce qu'un objet inflige projeté, pour que le choix se fasse en connaissance. */
  thrownLabel(item: MetalItem): string {
    return `${item.thrown.min}–${item.thrown.max} ${damageLabel(item.thrown.type)}`;
  }

  /** Arrache la prise désignée : la cible était déjà choisie. */
  confirmPull(name: string): void {
    const pending = this.pullTarget();
    if (pending) this.fire(pending.at, name);
  }

  cancelPull(): void {
    this.pullTarget.set(null);
  }

  /* ── Les murs conjurés ────────────────────────────────────────────────────
     Un mur occupe sa case, porte la teinte de sa matière, et se clique pour
     savoir ce qu'il lui reste à encaisser et combien de temps il tiendra.
  ─────────────────────────────────────────────────────────────────────────── */

  /** Le mur conjuré qui occupe cette case, s'il y en a un. */
  wallOn(key: string): ConjuredWall | undefined {
    const [x, y] = key.split(',').map(Number);
    return wallAt(this.encounter(), { x, y });
  }

  /** La teinte de la matière : c'est elle qui rend le mur lisible sur le plateau. */
  wallTint(wall: ConjuredWall): string {
    return wallColor(wall);
  }

  /** Part de santé restante d'un mur, pour sa jauge. */
  wallHpPercent(wall: ConjuredWall): number {
    return Math.max(0, Math.round((wall.hp / Math.max(1, wall.maxHp)) * 100));
  }

  /** Ce qu'il faut savoir d'un mur au survol. */
  wallHint(wall: ConjuredWall): string {
    const vie = `${wall.hp}/${wall.maxHp} PV`;
    const duree =
      wall.remaining === WALL_PERMANENT
        ? 'permanent — façonné dans le sol'
        : `${wall.remaining} tour${wall.remaining > 1 ? 's' : ''} avant décomposition`;
    return `${wall.name} — ${vie}, ${duree}`;
  }

  /** Le mur ouvert au clic, dont on lit la fiche. */
  readonly openWall = signal<string | null>(null);

  /** Le mur actuellement détaillé, s'il tient encore debout. */
  readonly inspectedWall = computed<ConjuredWall | undefined>(() => {
    const id = this.openWall();
    return id ? (this.encounter().walls ?? []).find((w) => w.id === id) : undefined;
  });

  /** Ce qui met un mur à bas plus vite : le contondant, et sa propre matière. */
  wallWeaknesses(wall: ConjuredWall): string {
    const def = MATERIALS.find((m) => m.key === wall.material);
    const cles = [WALL_COMMON_WEAKNESS, ...(def?.weaknesses ?? [])];
    return [...new Set(cles)].map((k) => damageLabel(k)).join(', ');
  }

  /** Ce qui l'entame moins. */
  wallResistances(wall: ConjuredWall): string {
    const def = MATERIALS.find((m) => m.key === wall.material);
    return (def?.resistances ?? []).map((k) => damageLabel(k)).join(', ');
  }

  /** Abat le mur d'autorité — la main du MJ. */
  breakWall(wall: ConjuredWall): void {
    this.encounters.dispatch({ type: 'breakWall', wallId: wall.id });
    this.openWall.set(null);
  }

  /* ── Ce qui traîne par terre ──────────────────────────────────────────── */

  /** Ce qui est posé sur une case, en une ligne d'infobulle (ou rien). */
  groundLabel(key: string): string {
    const items = this.encounter().ground?.[key] ?? [];
    return items.length ? items.map((i) => `${i.name} ×${i.qty}`).join(', ') : '';
  }

  /** Les piles qu'un combattant peut atteindre sans bouger. */
  readonly withinReach = computed<{ key: string; pos: GridPos; items: CarriedItem[] }[]>(() => {
    const unit = this.active();
    if (!unit) return [];
    return reachableGround(this.encounter(), unit).map((p) => ({
      key: `${p.pos.x},${p.pos.y}`,
      ...p,
    }));
  });

  /** Ce qui empêche de ramasser, ou `null`. */
  pickUpBlocker(): string | null {
    const unit = this.active();
    if (!unit) return 'Personne ne joue.';
    if (this.phase() === 'combat' && unit.bonusActionUsed) {
      return 'Action bonus déjà dépensée.';
    }
    return null;
  }

  pickUp(at: GridPos, item: string): void {
    const unit = this.active();
    if (!unit || this.pickUpBlocker()) return;
    this.encounters.dispatch({ type: 'pickUp', actorId: unit.id, at, item });
  }

  /* ── L'armement ───────────────────────────────────────────────────────────
     Changer d'arme se paie du même créneau que se baisser ou boire : celui qui
     n'occupe pas le bras qui frappe.
  ─────────────────────────────────────────────────────────────────────────── */

  equip(item: string, slot: 'weapon' | 'offhand'): void {
    const unit = this.active();
    if (!unit || this.pickUpBlocker()) return;
    this.encounters.dispatch({ type: 'equip', actorId: unit.id, item, slot });
  }

  unequip(slot: 'weapon' | 'offhand'): void {
    const unit = this.active();
    if (!unit || this.pickUpBlocker()) return;
    this.encounters.dispatch({ type: 'unequip', actorId: unit.id, slot });
  }

  /** Raison pour laquelle une capacité est indisponible, ou `null`. */
  abilityBlocker(ability: CombatAbility): string | null {
    const unit = this.active();
    if (!unit) return 'Le combat n’a pas commencé.';
    // Un geste d'armement n'est pas une capacité du combattant : `cannotUse`
    // n'a rien à en dire. Ce qui le borne est le créneau des objets.
    if (ability.id.startsWith('switch:') || ability.id.startsWith('stow:')) {
      return this.pickUpBlocker();
    }
    // On teste sur la case du lanceur : les motifs de refus indépendants de la
    // cible (action déjà jouée, mana, statut) remontent tout de suite. On neutralise
    // donc ce qui dépend d'une cible pas encore choisie — un échange refusé
    // faute de porteur SOUS SES PIEDS grimerait le bouton en indisponible.
    const probe = { ...ability, rangeMeters: Infinity, swap: false };
    const refus = cannotUse(this.encounter(), unit, probe, unit.pos);
    if (refus) return refus;
    // L'échange, lui, se juge sur le plateau : sans personne à permuter, il n'y
    // a rien à armer, et le dire vaut mieux que de laisser cliquer dans le vide.
    if (ability.swap) {
      // Le défaut du lanceur d'abord : il lui faut sa PROPRE marque, et ne pas
      // le dire enverrait chercher un porteur alors que le manque est chez soi.
      const ancre = swapAnchorMissing(unit, ability);
      if (ancre) return ancre;
      if (!this.swapCellsFor(unit, ability).size) {
        const marque = ability.swapMark ? statusByKey(ability.swapMark)?.name : undefined;
        return marque
          ? `Personne à portée ne porte votre « ${marque} ».`
          : 'Personne à permuter à portée.';
      }
    }
    return null;
  }

  /**
   * Ce que la capacité infligera réellement, prêt à afficher : les dés PLUS le
   * scaling et les buffs de poing. Le moteur fait le calcul (`abilityDamageRanges`),
   * la vue ne fait que le mettre en forme — le bouton ne peut donc pas annoncer
   * autre chose que ce que l'action fera.
   *
   * Les coups identiques d'un enchaînement sont regroupés : « 3 × 16 contondant »
   * se lit mieux que trois fois la même ligne.
   */
  /**
   * Ce qu'une capacité ACCORDE, en pastilles : bonus de stats et enchantement.
   *
   * Sans ça, une armure de pierre n'affichait rien du tout — ni sa défense, ni
   * la différence entre du grès et du basalte. Le joueur voyait un sort qui
   * « ne fait rien », alors que toute sa valeur est là.
   */
  statChips(unit: Combatant, ability: CombatAbility): string[] {
    const chips: string[] = [];
    for (const mod of ability.mods ?? []) {
      const signe = ability.targets.includes('enemy') && !ability.targets.includes('self') ? '−' : '+';
      chips.push(`${signe}${Math.round(mod.value)} ${this.statLabel(mod.stat)}`);
    }
    // Un revêtement porte ses dégâts dans l'enchantement, pas dans `damages`.
    if (ability.enchant) {
      const d = ability.enchant.damage;
      const label = this.damageTypes.resolve(d.type)?.label ?? d.type;
      const montant = d.min === d.max ? `${d.min}` : `${d.min}–${d.max}`;
      chips.push(`${montant} ${label} / coup`);
    }
    if (ability.raisesWall) {
      chips.push(`mur ${ability.raisesWall.length} cases · ${ability.raisesWall.hp} PV`);
    }
    return chips;
  }

  /** Nom court d'une stat, pour les pastilles. */
  private statLabel(stat: string): string {
    return (
      {
        def_phy: 'Déf. phy',
        def_mag: 'Déf. mag',
        atk_phy: 'Atq. phy',
        atk_mag: 'Atq. mag',
        speed: 'Vitesse',
        hp: 'PV',
        mana: 'Mana',
        endurance: 'End.',
      }[stat] ?? stat
    );
  }

  damageChips(unit: Combatant, ability: CombatAbility): string[] {
    const chips: string[] = [];
    for (const range of abilityDamageRanges(unit, ability)) {
      const label = this.damageTypes.resolve(range.type)?.label ?? range.type;
      const amount = range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
      const previous = chips.length ? chips[chips.length - 1] : null;
      const text = `${amount} ${label}`;
      // Regroupement : on incrémente le compteur du dernier chip s'il est identique.
      const repeated = previous?.match(/^(?:(\d+) × )?(.+)$/);
      if (repeated && repeated[2] === text) {
        chips[chips.length - 1] = `${Number(repeated[1] ?? 1) + 1} × ${text}`;
      } else {
        chips.push(text);
      }
    }
    return chips;
  }

  /**
   * Seuil de touche annoncé sur le bouton, ou `null` pour ce qui ne vise pas.
   *
   * Il est APPROCHÉ : la cible n'est pas encore choisie au moment où le joueur
   * lit ses options, donc ni son esquive naturelle ni la gêne d'un tir à bout
   * portant n'entrent dans le calcul. Le jet exact est détaillé au journal.
   *
   * L'afficher quand même est le point important : décider d'une action sans
   * savoir ce qu'elle risque n'est pas un choix, c'est un pari.
   */
  hitThresholdHint(unit: Combatant, ability: CombatAbility): number | null {
    // `aims` répond exactement à la question posée : cette capacité jette-t-elle
    // le dé ? Exiger des dégâts en plus taisait le seuil des sorts qui VISENT
    // sans blesser — une marque qu'on impose, des fils qu'on noue — alors que ce
    // sont ceux dont on aimerait le plus connaître la chance avant de payer.
    if (!aims(ability)) return null;
    return announcedBreakdown(unit, ability).threshold;
  }

  /**
   * Ce que le seuil affiché comprend, et ce qu'il laisse de côté.
   *
   * Un chiffre sans son mode d'emploi se lit de travers : celui-ci ne tient pas
   * compte de la cible, qui n'est pas encore désignée.
   */
  hitHint(unit: Combatant, ability: CombatAbility): string {
    const socle = announcedBreakdown(unit, ability);
    const lignes = [
      `Score à faire au d20 : ${socle.threshold}+.`,
      explainThreshold(socle),
      'Approché : l’esquive de la cible et la gêne d’un tir à bout portant ne sont pas comptées.',
    ];
    // Un sceau ne se rate que sur qui s'en défend : le dire évite de croire
    // qu'on peut manquer un allié consentant.
    if (ability.requiresHit && !ability.damages.length) {
      lignes.push('Ne se jette que contre une cible hostile — sur soi ou un allié, le sort porte toujours.');
    }
    return lignes.join('\n');
  }

  /**
   * Coût en mana réellement payé, météo et heure du jour comprises. Un sort de
   * ténèbres coûte moins la nuit : le bouton doit le dire.
   */
  manaCost(ability: CombatAbility): number {
    return effectiveManaCost(this.encounter(), ability);
  }

  /** Soin annoncé par une capacité (0 si elle n'en accorde pas). */
  healAmount(unit: Combatant, ability: CombatAbility): number {
    return abilityHealAmount(unit, ability);
  }

  /** Mana rendu annoncé par une capacité (0 si elle n'en rend pas). */
  manaAmount(unit: Combatant, ability: CombatAbility): number {
    return abilityManaAmount(unit, ability);
  }

  /** Distance du combattant actif à une case, pour l'infobulle de portée. */
  distanceTo(pos: GridPos): number {
    const unit = this.active();
    return unit ? unitToCellMeters(unit, pos) : 0;
  }

  /* ── Commandes ────────────────────────────────────────────────────────── */

  start(): void {
    this.mode.set('play');
    this.encounters.dispatch({ type: 'start' });
  }

  endTurn(): void {
    this.armed.set(null);
    this.picked.set([]);
    this.encounters.dispatch({ type: 'endTurn' });
  }

  undo(): void {
    this.armed.set(null);
    this.encounters.undo();
  }

  /* ── La géologie de la scène ──────────────────────────────────────────────
     Ce que le sol offre décide de ce qu'un mage de Terre y vaut : façonner ce
     qui est là ne demande aucune étude et coûte moins cher. Se règle d'un clic
     par région, puis s'affine matériau par matériau.
  ─────────────────────────────────────────────────────────────────────────── */

  readonly earthRegions = MATERIAL_REGIONS;
  readonly earthMaterials = MATERIALS;

  /** La géologie posée sur la scène (vide si rien n'est exploitable). */
  readonly geology = computed<string[]>(() => this.encounter().geology ?? []);

  /** Le panneau de géologie est-il déplié ? */
  readonly geologyOpen = signal(false);

  /** Résumé d'un mot pour le bandeau d'ambiance. */
  readonly geologyLabel = computed<string>(() => {
    const sol = this.geology();
    if (!this.encounter().geology) return 'Géologie —';
    if (!sol.length) return 'Sol stérile';
    const region = MATERIAL_REGIONS.find(
      (r) => r.materials.length === sol.length && r.materials.every((m) => sol.includes(m)),
    );
    return region ? region.name : `${sol.length} matériaux`;
  });

  /** Applique la géologie type d'une région. */
  setRegionGeology(key: string): void {
    const region = MATERIAL_REGIONS.find((r) => r.key === key);
    if (region) this.encounters.dispatch({ type: 'setGeology', materials: [...region.materials] });
  }

  /** Ajoute ou retire un matériau du sol, à la main. */
  toggleGeology(key: string): void {
    const sol = this.geology();
    const materials = sol.includes(key) ? sol.filter((m) => m !== key) : [...sol, key];
    this.encounters.dispatch({ type: 'setGeology', materials });
  }

  /** Une ligne lisible pour l'infobulle d'un matériau. */
  materialHint(m: Material): string {
    return `${m.formation} — ${m.property}. ${m.effect}`;
  }

  setWeather(key: string): void {
    this.encounters.dispatch({ type: 'setWeather', weather: key });
  }

  setDaytime(key: string): void {
    this.encounters.dispatch({ type: 'setDaytime', daytime: key });
  }

  /* ── Hors combat : le temps, la survie, les dépouilles ─────────────────
     Le panneau « camp » remplace l'arène quand la table sort du combat. Il
     partage tout le reste — mêmes combattants, même journal, même horloge —
     parce que ce qui vient de se passer en combat est précisément ce dont on
     s'occupe après.
  ─────────────────────────────────────────────────────────────────────────── */

  /** Phase courante, avec le repli des parties d'avant les phases. */
  readonly phase = computed<EncounterPhase>(() => phaseOf(this.encounter()));
  readonly clock = computed(() => clockOf(this.encounter()));
  readonly clockLabel = computed(() => formatClock(this.clock()));

  /** Activité choisie pour la prochaine tranche de temps. */
  readonly activity = signal<string>(DEFAULT_ACTIVITY);
  /** Durée d'une tranche sur mesure, en minutes. */
  readonly customMinutes = signal(60);
  /** Qui ramasse ce qu'on trouve sur les corps. */
  readonly looterId = signal<string | null>(null);

  readonly activities = ACTIVITIES;
  readonly timeSteps = TIME_STEPS;
  readonly survivalGauges = SURVIVAL_GAUGES;
  readonly notchesLeft = notchesLeft;
  readonly survivalStage = stageOf;
  readonly formatDuration = formatDuration;
  readonly pileSize = pileSize;

  setPhase(phase: EncounterPhase): void {
    this.encounters.dispatch({ type: 'setPhase', phase });
  }

  /** Le moment de la journée suit-il l'horloge, ou le MJ l'a-t-il figé ? */
  readonly daytimeLocked = computed(() => !!this.encounter().daytimeLocked);

  /** Nom du moment de la journée en cours (« Après-midi »). */
  readonly daytimeName = computed(() => {
    const key = this.encounter().daytime;
    return (key ? this.daytimes.find((d) => d.key === key)?.name : undefined) ?? 'Heure indéterminée';
  });

  /** Membres du groupe dont on tient les jauges (ceux qui viennent d'une fiche). */
  readonly party = computed<Combatant[]>(() =>
    this.encounter().combatants.filter((c) => !!c.survival),
  );

  toggleDaytimeLock(): void {
    this.encounters.dispatch({ type: 'lockDaytime', locked: !this.daytimeLocked() });
  }

  /** Fait passer une tranche de temps avec l'activité choisie. */
  passTime(seconds: number): void {
    if (seconds <= 0) return;
    this.encounters.dispatch({ type: 'passTime', seconds, activity: this.activity() });
  }

  /** Tranche sur mesure, saisie en minutes. */
  passCustom(): void {
    this.passTime(Math.round(this.customMinutes() * MINUTE));
  }

  /**
   * Une nuit complète : huit heures de sommeil d'un bloc. Le raccourci le plus
   * utilisé d'une séance, et celui qu'on ne veut pas composer à la main.
   */
  sleep(): void {
    this.encounters.dispatch({ type: 'passTime', seconds: 8 * HOUR, activity: 'sommeil' });
  }

  /**
   * Comble une jauge pour le groupe SANS rien prendre au sac : l'eau d'une
   * rivière, le gibier d'une chasse. C'est au MJ de dire qu'il y en avait.
   */
  restoreAll(gauge: SurvivalKey, source: string): void {
    const def = SURVIVAL_GAUGES.find((g) => g.key === gauge);
    this.encounters.dispatch({
      type: 'restore',
      gauge,
      notches: def?.segments ?? 1,
      source,
      team: 'allies',
    });
  }

  /** Le repas pris sur les vivres : chacun entame son sac, qui se vide. */
  meal(gauge: SurvivalKey): void {
    this.encounters.dispatch({ type: 'meal', gauge, team: 'allies' });
  }

  /** Remplit les outres vides du groupe à une source. */
  refill(): void {
    this.encounters.dispatch({ type: 'refill', team: 'allies' });
  }

  /** La table de chasse, affichée en clair pour que le joueur voie ses chances. */
  readonly huntTable = HUNT_TABLE;

  /** Bonus de Nature du chasseur désigné, ajouté à son jet de chasse. */
  readonly huntBonus = computed(() => huntBonus(this.looter()?.skills));
  /** Les vivres qu'on peut ajouter à la main (achat au village, don). */
  readonly supplies = HUNGER_SUPPLIES;

  /**
   * Lance une battue. **Le moteur jette les dés** — une fois sur quatre on
   * rentre bredouille — et la prise revient à celui qui a lancé la chasse.
   */
  hunt(): void {
    const chasseur = this.looter();
    if (!chasseur) return;
    this.encounters.dispatch({ type: 'hunt', actorId: chasseur.id });
  }

  /** Ajoute des vivres à la main : un achat, un don, une correction du MJ. */
  provision(item: string): void {
    this.encounters.dispatch({
      type: 'provision',
      item,
      qty: 1,
      actorId: this.looter()?.id,
      source: 'ravitaillement',
    });
  }

  /** Corrige une jauge à la main, en cliquant un cran. */
  setSurvival(unit: Combatant, gauge: SurvivalKey, notches: number): void {
    const current = notchesLeft(gauge, unit.survival);
    // Recliquer le cran courant l'efface — même geste que sur la fiche.
    const value = notches === current ? notches - 1 : notches;
    this.encounters.dispatch({ type: 'setSurvival', actorId: unit.id, gauge, notches: value });
  }

  /** Crans d'une jauge, pour le rendu des segments cliquables. */
  gaugeSegments(gauge: SurvivalGauge): number[] {
    return Array.from({ length: gauge.segments }, (_, i) => i + 1);
  }

  /** Ce que la faim, la soif et le sommeil coûtent à ce combattant, en clair. */
  survivalPenalties(unit: Combatant): string {
    const mods = survivalMods(unit.survival);
    if (!mods.length) return '';
    // Un même stat peut être touché par deux besoins : on additionne avant
    // d'afficher, sinon on lirait « Endurance −3, Endurance −4 ».
    const total = new Map<string, number>();
    for (const mod of mods) total.set(mod.stat, (total.get(mod.stat) ?? 0) + mod.value);
    return [...total]
      .map(([stat, value]) => `${STATS.find((s) => s.key === stat)?.label ?? stat} ${value}`)
      .join(' · ');
  }

  /** Ce qui nourrit, dans le sac de ce combattant. */
  edibles(unit: Combatant): CarriedItem[] {
    return unit.inventory.filter((i) => i.qty > 0 && !!nourishmentOf(i));
  }

  eat(unit: Combatant, item: CarriedItem): void {
    this.encounters.dispatch({ type: 'eat', actorId: unit.id, item: item.name });
  }

  /* ── Dépouilles ───────────────────────────────────────────────────────── */

  /** Les corps à terre, seuls fouillables. */
  readonly bodies = computed<Combatant[]>(() => this.encounter().combatants.filter((c) => c.down));

  /**
   * Qui peut ramasser.
   *
   * Le groupe d'abord — c'est lui qui fouille d'ordinaire. Mais une table peut
   * jouer des mercenaires neutres ou une bande adverse : refuser tout porteur
   * quand personne n'est rangé chez les alliés laisserait le butin par terre,
   * ce qui est exactement ce qu'on veut éviter. On retombe donc sur quiconque
   * tient debout et porte un sac.
   */
  readonly looters = computed<Combatant[]>(() => {
    const standing = this.encounter().combatants.filter((c) => !c.down);
    const groupe = standing.filter((c) => c.team === 'allies');
    return groupe.length ? groupe : standing;
  });

  /** Le cadavre ouvert dans le panneau de fouille (désigné sur la grille). */
  readonly lootTargetId = signal<string | null>(null);
  readonly lootTarget = computed<Combatant | undefined>(() => {
    const id = this.lootTargetId();
    return id ? this.encounter().combatants.find((c) => c.id === id) : undefined;
  });

  /** Un corps porte-t-il encore quelque chose à prendre, ou reste-t-il à fouiller ? */
  worthSearching(unit: Combatant): boolean {
    return unit.down && (!unit.searched || this.hasLoot(unit));
  }

  /**
   * Le ramasseur retenu. À défaut de choix explicite, le premier debout —
   * une table ne veut pas désigner un porteur avant chaque ligne de butin.
   */
  readonly looter = computed<Combatant | undefined>(() => {
    const list = this.looters();
    const chosen = list.find((c) => c.id === this.looterId());
    return chosen ?? list[0];
  });

  search(body: Combatant): void {
    this.encounters.dispatch({ type: 'search', targetId: body.id, actorId: this.looter()?.id });
  }

  /** Fouille tous les corps encore intacts, d'un geste. */
  searchAll(): void {
    for (const body of this.bodies()) {
      if (!body.searched) this.search(body);
    }
  }

  takeAll(body: Combatant): void {
    const actor = this.looter();
    if (!actor) return;
    this.encounters.dispatch({ type: 'takeLoot', targetId: body.id, actorId: actor.id });
  }

  takeOne(body: Combatant, item: LootItem): void {
    const actor = this.looter();
    if (!actor) return;
    this.encounters.dispatch({
      type: 'takeLoot',
      targetId: body.id,
      actorId: actor.id,
      item: item.name,
      qty: item.qty,
    });
  }

  /** Reste-t-il quelque chose à prendre sur ce corps ? */
  hasLoot(body: Combatant): boolean {
    return pileSize(body.loot) > 0 || (body.lootGold ?? 0) > 0;
  }

  /* ── Reporter la séance sur les fiches ─────────────────────────────────
     Pendant de « Rafraîchir les fiches » : là, la fiche remonte vers la table ;
     ici, la table redescend vers la fiche. Rien ne part sans un clic — une
     séance rejouée ou un essai ne doit pas saccager les fiches dans le dos du
     MJ —, et l'écart se lit AVANT d'être écrit.
  ─────────────────────────────────────────────────────────────────────────── */

  /** Aperçu en attente de confirmation. `null` = pas de dialogue ouvert. */
  readonly reports = signal<{ report: SheetReport; unit: Combatant; sheet: CharacterSheet }[] | null>(
    null,
  );
  readonly reporting = signal(false);
  readonly reportError = signal<string | null>(null);
  readonly summarize = summarize;

  /** Poids des ressources, pour donner le sien à une dépouille qui entre au sac. */
  private readonly lootWeights = new Map<string, number>();

  /**
   * Prépare l'aperçu : relit chaque fiche liée et calcule l'écart.
   *
   * On relit plutôt que de se fier à l'instantané : la fiche a pu changer
   * ailleurs entre-temps, et écrire par-dessus une version périmée effacerait
   * ce que le joueur y a fait de son côté.
   */
  openReport(): void {
    // Tout pion issu d'une fiche, qu'il tienne des jauges ou non : ses
    // réserves, elles, ont bougé de toute façon.
    const units = this.encounter().combatants.filter(
      (c): c is Combatant & { origin: { kind: 'sheet'; sheetId: string } } => c.origin.kind === 'sheet',
    );
    if (!units.length) {
      this.reportError.set('Aucun personnage lié à une fiche sur cette table.');
      return;
    }

    this.reporting.set(true);
    this.reportError.set(null);
    forkJoin(units.map((u) => this.sheets.get(u.origin.sheetId))).subscribe({
      next: (stored) => {
        this.reporting.set(false);
        this.reports.set(
          units.map((unit, i) => ({
            unit,
            sheet: stored[i].data,
            report: diffAgainstSheet(unit, stored[i].data, stored[i].id),
          })),
        );
      },
      error: () => {
        this.reporting.set(false);
        this.reportError.set('Les fiches n’ont pas pu être relues.');
      },
    });
  }

  closeReport(): void {
    this.reports.set(null);
  }

  /** Écrit l'écart de tout le monde. Une fiche sans écart n'est pas touchée. */
  confirmReport(): void {
    const lines = (this.reports() ?? []).filter((l) => l.report.changed);
    if (!lines.length) {
      this.closeReport();
      return;
    }

    this.reporting.set(true);
    // Les fiches partent UNE PAR UNE (`concatMap`), jamais en rafale. Le
    // magasin du serveur relit puis réécrit le fichier entier : deux écritures
    // qui se chevauchent y mêlaient leurs documents et rendaient toutes les
    // fiches illisibles d'un coup. Le serveur s'en protège désormais aussi,
    // mais rien n'oblige à lui envoyer une bousculade.
    from(lines)
      .pipe(
        concatMap((line) =>
          this.sheets.update(
            line.report.sheetId,
            applyReport(line.sheet, line.report, line.unit, (name) => this.lootWeights.get(name) ?? 0),
          ),
        ),
        toArray(),
      )
      .subscribe({
        next: () => {
          this.reporting.set(false);
          this.closeReport();
          // La liste des fiches porte la date de mise à jour : elle a vieilli.
          this.sheets
            .list()
            .pipe(catchError(() => of([] as CharacterSheetSummary[])))
            .subscribe((list) => this.sheetList.set(list));
        },
        error: () => {
          this.reporting.set(false);
          this.reportError.set(
            'Le report s’est interrompu. Les fiches déjà écrites l’ont été ; les suivantes non.',
          );
        },
      });
  }

  /** Porte la frappe gratuite sur la cible désignée. */
  strikeAt(unit: Combatant): void {
    this.encounters.dispatch({ type: 'freeStrike', targetId: unit.id });
  }

  /** Renonce à la frappe gratuite. */
  skipStrike(): void {
    this.encounters.dispatch({ type: 'skipStrike' });
  }

  adjustHp(unit: Combatant, delta: number): void {
    if (delta < 0) this.encounters.dispatch({ type: 'damage', targetId: unit.id, amount: -delta });
    else this.encounters.dispatch({ type: 'heal', targetId: unit.id, amount: delta });
  }

  applyStatusTo(unit: Combatant, key: string): void {
    if (!key) return;
    this.encounters.dispatch({ type: 'applyStatus', targetId: unit.id, status: key });
  }

  removeStatus(unit: Combatant, key: string): void {
    this.encounters.dispatch({ type: 'clearStatus', targetId: unit.id, status: key });
  }

  /**
   * Infobulle d'une pastille de statut : ce qu'il fait, PAR QUI il a été posé,
   * et jusqu'où le lien tient.
   *
   * L'auteur est l'information qui manquait le plus : une marque, un contrôle,
   * un poison n'ont pas le même sens selon qui les tient — et c'est ce qui dit
   * au joueur quels sorts il peut y accrocher.
   */
  statusTitle(unit: Combatant, status: ActiveStatus): string {
    const def = statusByKey(status.key);
    const lignes = [def?.effect ?? def?.description ?? status.key];

    const source = status.sourceId ? findUnit(this.encounter(), status.sourceId) : undefined;
    if (source) lignes.push(source.id === unit.id ? 'Posé par lui-même.' : `Posé par ${source.name}.`);

    if (status.tetherMeters !== undefined) {
      const ecart = source ? unitDistanceMeters(unit, source) : undefined;
      lignes.push(
        `Ancré à ${status.tetherMeters} m` +
          (ecart !== undefined ? ` — actuellement à ${ecart.toFixed(1)} m` : '') +
          ' : se rompt au-delà.',
      );
    }

    lignes.push('Cliquer pour retirer.');
    return lignes.join('\n');
  }

  /**
   * Ce que ce combattant TIENT sur les autres, en clair — ou `null`.
   *
   * Un marionnettiste ne se lit pas sur ses propres pastilles : ses statuts à
   * lui sont sur d'AUTRES corps. Sans cette ligne, la seule trace de ses fils
   * serait une main manquante que rien n'expliquerait.
   */
  sustainHint(unit: Combatant): string | null {
    const tenus = sustainedBy(this.encounter(), unit);
    if (!tenus.length) return null;
    const mains = handsBound(this.encounter(), unit);
    const qui = tenus.map((t) => t.bearer.name).join(', ');
    const cout =
      mains >= CASTER_HANDS
        ? 'les deux mains prises : déplacement seulement'
        : mains > 0
          ? 'une main prise : plus de main faible'
          : '';
    return `Tient ${qui}${cout ? ` — ${cout}` : ''}`;
  }

  /** Qui tire les ficelles de ce combattant, s'il n'est plus à lui-même. */
  controller(unit: Combatant): Combatant | undefined {
    return controllerOf(this.encounter(), unit);
  }

  rename(name: string): void {
    this.encounters.edit((draft) => {
      draft.name = name;
    });
  }

  resize(width: number, height: number): void {
    this.encounters.edit((draft) => {
      draft.grid = {
        width: Math.max(5, Math.min(60, Math.round(width) || draft.grid.width)),
        height: Math.max(5, Math.min(60, Math.round(height) || draft.grid.height)),
      };
      // Personne ne doit se retrouver hors du plateau après un rétrécissement.
      for (const unit of draft.combatants) {
        unit.pos.x = Math.min(unit.pos.x, draft.grid.width - 1);
        unit.pos.y = Math.min(unit.pos.y, draft.grid.height - 1);
      }
    });
  }

  /* ── Montage de la rencontre ──────────────────────────────────────────── */

  addSheet(summary: CharacterSheetSummary): void {
    this.sheets.get(summary.id).subscribe((stored) => {
      this.encounters.edit((draft) => {
        const team = this.addTeam();
        draft.combatants.push(
          this.factory.fromSheet(stored.data, team, freeSpot(draft, team), stored.id),
        );
      });
    });
  }

  addCreature(index: BestiaryIndexEntry): void {
    this.wiki.load<BestiaryEntry>('bestiary', index.slug).subscribe((entry) => {
      this.encounters.edit((draft) => {
        const team = this.addTeam();
        // Numérotation : « Loup Gris 2 » plutôt que deux pions homonymes.
        const already = draft.combatants.filter(
          (c) => c.origin.kind === 'bestiary' && c.origin.slug === entry.slug,
        ).length;
        draft.combatants.push(
          this.factory.fromBestiary(entry, team, freeSpot(draft, team), already + 1),
        );
      });
    });
  }

  /* ── Rafraîchissement ─────────────────────────────────────────────────
     Un combattant est un INSTANTANÉ : ses stats et ses capacités sont figées
     au moment où on l'ajoute. C'est voulu — monter de niveau en pleine bagarre
     n'a pas de sens, et une fiche modifiée entre deux séances ne doit pas
     changer un combat en cours sous les pieds du MJ.

     Mais l'instantané vieillit : une règle qui change (la maîtrise, un coût,
     un type de dégâts) ne touche pas les pions déjà posés, et l'on croit alors
     que le changement n'a pas pris. C'est à ça que sert `origin`, et c'est ce
     que ces deux commandes rendent enfin possible.
  ─────────────────────────────────────────────────────────────────────────── */

  /** Un combattant peut-il être remonté depuis sa source ? */
  canRefresh(unit: Combatant): boolean {
    return unit.origin.kind === 'sheet' || unit.origin.kind === 'bestiary';
  }

  /**
   * Remonte un combattant depuis sa fiche, en gardant sa place et son état.
   *
   * Les réserves sont conservées **en proportion**, pas en valeur absolue : si
   * la fiche a gagné des points de vie, un blessé à moitié reste à moitié. Les
   * garder en absolu soignerait ou tuerait au rafraîchissement.
   *
   * Les effets temporaires sautent : ils référencent des capacités de l'ancien
   * instantané, et les traîner poserait des buffs orphelins.
   */
  refresh(unit: Combatant): void {
    const rebuild = (fresh: Combatant) => {
      this.encounters.edit((draft) => {
        const index = draft.combatants.findIndex((c) => c.id === unit.id);
        if (index < 0) return;
        const part = (courant: number, ancienMax: number, nouveauMax: number) =>
          ancienMax > 0 ? Math.min(nouveauMax, Math.round((courant / ancienMax) * nouveauMax)) : nouveauMax;

        draft.combatants[index] = {
          ...fresh,
          // L'identité et la place ne bougent pas : l'ordre d'initiative et les
          // effets qui pointent vers ce pion doivent continuer de le trouver.
          id: unit.id,
          name: unit.name,
          team: unit.team,
          pos: { ...unit.pos },
          hp: part(unit.hp, unit.base.hp, fresh.base.hp),
          mana: part(unit.mana, unit.base.mana, fresh.base.mana),
          endurance: part(unit.endurance, unit.base.endurance, fresh.base.endurance),
          moved: unit.moved,
          actionUsed: unit.actionUsed,
          bonusActionUsed: unit.bonusActionUsed,
          reactionUsed: unit.reactionUsed,
          initiative: unit.initiative,
          down: unit.hp <= 0,
          statuses: unit.statuses,
          // L'état du VOYAGE ne se remonte pas depuis la source : les jauges de
          // survie, la bourse et la dépouille déjà fouillée sont ce qui s'est
          // passé à table. Les reprendre de la fiche rassasierait un affamé et
          // ferait repousser un butin déjà ramassé.
          survival: unit.survival ?? fresh.survival,
          purse: unit.purse ?? fresh.purse,
          loot: unit.loot,
          lootGold: unit.lootGold,
          searched: unit.searched,
        };
      });
    };

    if (unit.origin.kind === 'sheet') {
      const sheetId = unit.origin.sheetId;
      this.sheets
        .get(sheetId)
        .subscribe((stored) =>
          rebuild(this.factory.fromSheet(stored.data, unit.team, unit.pos, sheetId)),
        );
      return;
    }
    if (unit.origin.kind === 'bestiary') {
      const slug = unit.origin.slug;
      this.wiki
        .load<BestiaryEntry>('bestiary', slug)
        .subscribe((entry) => rebuild(this.factory.fromBestiary(entry, unit.team, unit.pos)));
    }
  }

  /** Remonte tout le monde d'un coup — après un changement de règle. */
  refreshAll(): void {
    for (const unit of this.encounter().combatants) {
      if (this.canRefresh(unit)) this.refresh(unit);
    }
  }

  removeCombatant(id: string): void {
    this.encounters.edit((draft) => {
      draft.combatants = draft.combatants.filter((c) => c.id !== id);
      draft.order = draft.order.filter((o) => o !== id);
    });
    if (this.selectedId() === id) this.selectedId.set(null);
    if (this.lootTargetId() === id) this.lootTargetId.set(null);
  }

  /* ── Changer un pion de camp ──────────────────────────────────────────
     Retirer puis rajouter marchait, mais coûtait cher : le pion revenait
     neuf, donc sans ses blessures, ses jauges de survie, sa bourse ni sa
     dépouille déjà fouillée. Changer le camp SUR PLACE garde tout ça.
  ─────────────────────────────────────────────────────────────────────────── */

  /**
   * Peut-on remanier la composition ?
   *
   * Pas en plein combat : changer de camp au milieu d'un round retournerait
   * l'ordre d'initiative sous les pieds du MJ, et rendrait alliés des gens
   * qu'on visait il y a trois secondes. Avant le lancement et hors combat, en
   * revanche, c'est exactement le geste qu'on veut — un prisonnier qui rejoint
   * le groupe, un mercenaire qui tourne casaque.
   */
  readonly canEditRoster = computed(() => this.phase() !== 'combat');

  setTeam(unit: Combatant, team: Team): void {
    if (unit.team === team || !this.canEditRoster()) return;
    this.encounters.edit((draft) => {
      const cible = draft.combatants.find((c) => c.id === unit.id);
      if (cible) cible.team = team;
    });
    this.closeMenu();
  }

  /* ── Menu contextuel ──────────────────────────────────────────────────
     Le chemin rapide : clic droit sur un pion, sur la grille comme dans la
     liste. Les mêmes commandes restent dans le panneau du combattant
     sélectionné — un menu qui se cache derrière un clic droit ne doit pas
     être le SEUL endroit où l'on peut faire quelque chose.
  ─────────────────────────────────────────────────────────────────────────── */

  readonly menu = signal<{ unit: Combatant; x: number; y: number } | null>(null);

  openMenu(event: MouseEvent, unit: Combatant): void {
    if (!this.canEditRoster()) return;
    event.preventDefault();
    // Le clic droit n'émet pas de `click` : le menu ne se referme donc pas sur
    // sa propre ouverture. Le prochain clic gauche, lui, le fermera.
    event.stopPropagation();
    this.selectedId.set(unit.id);
    this.menu.set({ unit, x: event.clientX, y: event.clientY });
  }

  closeMenu(): void {
    if (this.menu()) this.menu.set(null);
  }

  /**
   * Sélectionne (ou désélectionne) un combattant, depuis la liste comme depuis
   * le plateau.
   *
   * Hors combat, sélectionner ne fait pas que surligner : c'est ce geste qui
   * **désigne l'acteur** du camp — celui qui chasse, celui qui ramasse. Sans
   * ça, cliquer un personnage dans le groupe ne changeait rien et les boutons
   * continuaient de servir le premier de la liste.
   */
  select(unit: Combatant): void {
    const deja = this.selectedId() === unit.id;
    this.selectedId.set(deja ? null : unit.id);
    // Sélectionner depuis la liste doit permettre de le poser sur le plateau :
    // on quitte donc un éventuel mode de peinture du décor.
    if (this.selectedId() && this.mode() !== 'play') this.mode.set('play');

    if (this.phase() !== 'exploration') return;
    if (unit.down) {
      // Un corps : c'est sa dépouille qu'on veut ouvrir, pas en faire l'acteur.
      this.lootTargetId.set(deja ? null : unit.id);
    } else if (!deja) {
      this.looterId.set(unit.id);
    }
  }

  /**
   * Pose le pion sélectionné — **au montage**, où l'on dessine la scène.
   *
   * Libre par nature : on place un pion où l'on veut, y compris sur une case
   * qu'on transformera ensuite. Ce geste-là n'existe qu'ici.
   */
  private placeSelected(pos: GridPos): void {
    const id = this.selectedId();
    if (!id) return;
    this.encounters.edit((draft) => {
      const unit = draft.combatants.find((c) => c.id === id);
      if (unit) unit.pos = { ...pos };
    });
  }

  /**
   * Marche jusqu'à une case, **hors combat**.
   *
   * Le camp n'emprunte plus le placement libre du montage : le décor s'y
   * applique comme partout ailleurs — murs, portes fermées, eau profonde — mais
   * sans budget de déplacement ni souffle dépensé, puisque personne ne se bat.
   */
  private walkSelected(pos: GridPos): void {
    const id = this.selectedId();
    if (!id) return;
    this.encounters.dispatch({ type: 'walk', actorId: id, to: pos });
  }

  /** Fiches de personnage filtrées par le champ de recherche. */
  readonly filteredSheets = computed(() => {
    const needle = this.sheetFilter().trim().toLowerCase();
    const list = this.sheetList();
    if (!needle) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) || (s.race ?? '').toLowerCase().includes(needle),
    );
  });

  /** Créatures du bestiaire filtrées par le champ de recherche. */
  readonly filteredBestiary = computed(() => {
    const needle = this.bestiaryFilter().trim().toLowerCase();
    const list = this.bestiary();
    if (!needle) return list.slice(0, 40);
    return list.filter((e) => e.name.toLowerCase().includes(needle)).slice(0, 40);
  });

  /* ── Persistance ──────────────────────────────────────────────────────── */

  save(): void {
    this.encounters.save().subscribe({
      next: () => this.encounters.list().subscribe((l) => this.savedList.set(l)),
      error: () => undefined,
    });
  }

  open(summary: EncounterSummary): void {
    this.encounters.load(summary.id).subscribe();
  }

  discard(summary: EncounterSummary): void {
    this.encounters.remove(summary.id).subscribe(() => {
      this.savedList.update((l) => l.filter((e) => e.id !== summary.id));
      if (this.encounters.encounterId() === summary.id) this.encounters.reset();
    });
  }

  fresh(): void {
    this.encounters.reset();
    this.mode.set('play');
    this.armed.set(null);
  }

  /* ── Affichage ────────────────────────────────────────────────────────── */

  hpPercent(unit: Combatant): number {
    return Math.max(0, Math.min(100, (unit.hp / Math.max(1, unit.base.hp)) * 100));
  }

  /** Remplissage de la barre d'endurance, sur la réserve COURANTE (buffs compris). */
  endurancePercent(unit: Combatant): number {
    const max = Math.max(1, effectiveStat(unit, 'endurance'));
    return Math.max(0, Math.min(100, (unit.endurance / max) * 100));
  }

  /** Remplissage de la barre de mana, sur la réserve courante elle aussi. */
  manaPercent(unit: Combatant): number {
    const max = Math.max(1, effectiveStat(unit, 'mana'));
    return Math.max(0, Math.min(100, (unit.mana / max) * 100));
  }

  /** Ordre d'initiative affiché : la liste de tour, ou le roster avant le combat. */
  readonly turnOrder = computed<Combatant[]>(() => {
    const enc = this.encounter();
    if (!enc.started) return enc.combatants;
    return enc.order
      .map((id) => enc.combatants.find((c) => c.id === id))
      .filter((c): c is Combatant => !!c);
  });

  /** Journal du plus récent au plus ancien (on lit ce qui vient d'arriver). */
  readonly recentLog = computed<LogEntry[]>(() => [...this.encounter().log].reverse().slice(0, 60));

  /**
   * Statuts proposés au MJ. Dérivés du catalogue et non d'une liste écrite à la
   * main : un statut ajouté à `status_effects.json` apparaît ici tout seul.
   */
  readonly allStatuses = inject(StatusEffectsService)
    .all()
    .map((s) => ({ key: s.key, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  trackCell = (_: number, cell: Cell): string => cell.key;
  trackUnit = (_: number, unit: Combatant): string => unit.id;
  trackLog = (_: number, entry: LogEntry): number => entry.id;
}
