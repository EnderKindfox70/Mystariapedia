import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SurvivalKey } from '../../character/character.types';
import { SURVIVAL_TIERS, SurvivalTier } from '../../character/universe-data';
import { Navbar } from '../../components/navbar/navbar';
import { Pager } from '../../components/pager/pager';
import { usesLabel } from '../../combat/charges';
import { formatClock, formatDuration, MINUTE, TIME_STEPS } from '../../combat/clock';
import { CAMP_TRAP_KINDS, campTrapKind } from '../../combat/camp-traps';
import { CampTrap, CarriedItem, CombatAbility, Combatant, EncounterPhase, Snare } from '../../combat/combat.types';
import { allDaytimes, clockOf, effectiveManaCost, phaseOf } from '../../combat/rules';
import {
  ACTIVITIES,
  FORAGE_SECONDS,
  FORAGE_TABLE,
  HUNGER_SUPPLIES,
  HUNT_SECONDS,
  HUNT_TABLE,
  huntBonus,
  NIGHT_SECONDS,
  nourishmentOf,
  SNARE_CHECK_SECONDS,
  SNARE_ITEM,
  SNARE_SET_SECONDS,
  SNARE_TABLE,
  SNARE_WAIT_SECONDS,
  absoluteSeconds,
  pointsLeft,
  profileOf,
} from '../../combat/survival';
import { edibles, survivalOut, survivalPenalties, survivalRows } from '../../combat/survival-display';
import { xpForCast } from '../../combat/spell-customization';
import { EncounterService } from '../../services/encounter.service';
import { SessionService } from '../../services/session.service';
import { TableRoleService } from '../../services/table-role.service';

/**
 * Un lieu du camp sur lequel on clique.
 *
 * Les positions sont en POURCENTAGE de la scène, pas en pixels : le jour où une
 * image de fond viendra, il suffira de caler `x`/`y` sur le feu ou la rivière
 * qu'elle dessine. `mx`/`my` placent le même lieu sur la scène en portrait du
 * téléphone, qui n'a pas les mêmes proportions.
 */
interface CampSpot {
  key: CampSpotKey;
  label: string;
  glyph: string;
  /** Une ligne pour dire ce qu'on vient y faire. */
  hint: string;
  x: number;
  y: number;
  mx: number;
  my: number;
}

type CampSpotKey = 'feu' | 'couchage' | 'riviere' | 'foret' | 'paquetage' | 'clairiere' | 'pourtour';

/**
 * Le camp, lieu par lieu. Ajouter une mécanique de camp, c'est ajouter un lieu
 * ici et son menu dans le template — rien d'autre ne bouge.
 */
const CAMP_SPOTS: CampSpot[] = [
  { key: 'foret', label: 'Lisière', glyph: '🌲', hint: 'Chasser, cueillir', x: 16, y: 26, mx: 24, my: 14 },
  { key: 'clairiere', label: 'Clairière', glyph: '✦', hint: 'Travailler ses sorts', x: 48, y: 20, mx: 74, my: 30 },
  { key: 'riviere', label: 'Rivière', glyph: '💧', hint: 'Boire, remplir les outres', x: 84, y: 34, mx: 76, my: 60 },
  { key: 'feu', label: 'Feu de camp', glyph: '🔥', hint: 'Manger, boire, se reposer', x: 50, y: 60, mx: 44, my: 46 },
  { key: 'couchage', label: 'Couchage', glyph: '⛺', hint: 'Dormir, tours de garde', x: 22, y: 74, mx: 22, my: 76 },
  { key: 'paquetage', label: 'Paquetage', glyph: '🎒', hint: 'Sacs, objets, vivres', x: 74, y: 80, mx: 62, my: 88 },
  { key: 'pourtour', label: 'Pourtour', glyph: '⚠', hint: 'Pièges autour du camp', x: 90, y: 64, mx: 16, my: 42 },
];

/** Les activités qui se vivent au camp. La marche et l'effort sont du voyage. */
const CAMP_ACTIVITIES = ['repos', 'veille', 'sommeil'];

@Component({
  selector: 'app-camp',
  imports: [NgTemplateOutlet, RouterLink, Navbar, Pager],
  templateUrl: './camp.html',
  styleUrl: './camp.css',
  host: { '(document:keydown.escape)': 'openSpot.set(null)' },
})
export class CampView {
  private readonly encounters = inject(EncounterService);
  readonly roles = inject(TableRoleService);
  readonly session = inject(SessionService);

  constructor() {
    // Arrivé par le lien d'une table : on s'y assoit.
    const table = inject(ActivatedRoute).snapshot.queryParamMap.get('table');
    if (table) this.session.enter(table);
  }

  readonly encounter = this.encounters.encounter;
  readonly canUndo = this.encounters.canUndo;

  readonly spots = CAMP_SPOTS;
  readonly timeSteps = TIME_STEPS;
  readonly huntTable = HUNT_TABLE;
  readonly forageTable = FORAGE_TABLE;
  readonly huntDuration = formatDuration(HUNT_SECONDS);
  readonly forageDuration = formatDuration(FORAGE_SECONDS);
  readonly supplies = HUNGER_SUPPLIES;
  readonly trainingXp = xpForCast('training');
  readonly combatXp = xpForCast('combat');
  readonly usesLabel = usesLabel;
  readonly survivalRows = survivalRows;
  readonly survivalPenalties = survivalPenalties;
  readonly edibles = edibles;

  /** Les activités du camp, avec leur description pour les bulles d'aide. */
  readonly activities = new Map(
    ACTIVITIES.filter((a) => CAMP_ACTIVITIES.includes(a.key)).map((a) => [a.key, a]),
  );

  /* ── La table ─────────────────────────────────────────────────────────── */

  readonly phase = computed<EncounterPhase>(() => phaseOf(this.encounter()));
  readonly clockLabel = computed(() => formatClock(clockOf(this.encounter())));
  readonly daytimeName = computed(() => {
    const key = this.encounter().daytime;
    return (key ? allDaytimes().find((d) => d.key === key)?.name : undefined) ?? 'Heure indéterminée';
  });

  /** Un combat qui court encore interdit le camp : on ne dresse pas les tentes sous les flèches. */
  readonly fighting = computed(() => this.phase() === 'combat' && !this.encounters.finished());

  /** Le groupe : ceux dont on tient les jauges, c'est-à-dire ceux qui viennent d'une fiche. */
  readonly party = computed<Combatant[]>(() => this.encounter().combatants.filter((c) => !!c.survival));

  /* ── Qui agit ─────────────────────────────────────────────────────────────
     Un seul personnage courant pour tout le camp : c'est lui qui chasse, qui
     travaille un sort, qui mange ce qu'on lui tend et qui reçoit les vivres.
     À défaut de choix, le premier du groupe encore debout.
  ─────────────────────────────────────────────────────────────────────────── */

  readonly selectedId = signal<string | null>(null);

  readonly actor = computed<Combatant | undefined>(() => {
    const groupe = this.party();
    if (!this.roles.isGm()) return groupe.find((c) => this.roles.owns(c));
    return (
      groupe.find((c) => c.id === this.selectedId()) ??
      groupe.find((c) => !c.down && !c.survival?.out) ??
      groupe[0]
    );
  });

  /** Peut-il agir ? Un corps à terre ou sans connaissance ne chasse pas. */
  readonly actorAble = computed(() => {
    const qui = this.actor();
    return !!qui && !qui.down && !qui.survival?.out;
  });

  select(unit: Combatant): void {
    if (!this.roles.can('unit.play', unit)) return;
    // Un autre sac : on le rouvre à sa première page, et ses objets se
    // portent de nouveau sur lui-même.
    if (unit.id !== this.actor()?.id) {
      this.bagPage.set(0);
      this.useTargetId.set(null);
    }
    this.selectedId.set(unit.id);
  }

  outLabel(unit: Combatant): string {
    return survivalOut(unit, this.encounter());
  }

  /* ── Les lieux ────────────────────────────────────────────────────────── */

  /** Le lieu dont le menu est ouvert. */
  readonly openSpot = signal<CampSpotKey | null>(null);

  readonly openedSpot = computed(() => this.spots.find((s) => s.key === this.openSpot()));

  toggleSpot(key: CampSpotKey): void {
    this.openSpot.set(this.openSpot() === key ? null : key);
  }

  /**
   * Le lieu réclame-t-il qu'on s'en occupe ? Le feu quand quelqu'un a faim, la
   * rivière quand quelqu'un a soif, le couchage quand quelqu'un tombe de
   * sommeil. Le camp dit lui-même où aller, sans lire toutes les jauges.
   */
  spotAlert(key: CampSpotKey): boolean {
    const gauge: SurvivalKey | undefined =
      key === 'feu' ? 'hunger' : key === 'riviere' ? 'thirst' : key === 'couchage' ? 'rest' : undefined;
    if (!gauge) return false;
    return this.party().some((unit) => {
      const row = survivalRows(unit).find((r) => r.gauge.key === gauge);
      return !!row && this.atLeast(row.tier, 'modere');
    });
  }

  private atLeast(tier: SurvivalTier, floor: SurvivalTier): boolean {
    return SURVIVAL_TIERS.indexOf(tier) >= SURVIVAL_TIERS.indexOf(floor);
  }

  /* ── Le temps ─────────────────────────────────────────────────────────── */

  /** Durée sur mesure, en minutes, pour qui ne veut pas des tranches toutes faites. */
  readonly customMinutes = signal(60);

  /**
   * Fait passer le temps. `individual` dit ce que certains font à part du
   * groupe — c'est ainsi qu'un seul dort, ou qu'un seul veille.
   */
  passTime(activity: string, seconds: number, individual?: Record<string, string>): void {
    if (seconds <= 0) return;
    this.encounters.dispatch({ type: 'passTime', seconds, activity, individual });
  }

  passCustom(activity: string, individual?: Record<string, string>): void {
    this.passTime(activity, Math.round(this.customMinutes() * MINUTE), individual);
  }

  /** Le personnage courant fait `activity` pendant que le groupe fait autre chose. */
  alone(activity: string): Record<string, string> | undefined {
    const id = this.actor()?.id;
    return id ? { [id]: activity } : undefined;
  }

  /** Toute la nuit de Mystaria d'un bloc, pour tout le groupe : dix heures sur vingt-six. */
  sleep(): void {
    this.passTime('sommeil', NIGHT_SECONDS);
  }

  /** Ceux qui peuvent prendre un tour de garde : debout et conscients. */
  readonly watchers = computed(() => this.party().filter((c) => !c.down && !c.survival?.out));

  /**
   * Une nuit à tours de garde. La nuit est découpée en autant de quarts qu'il
   * y a de veilleurs possibles ; à chaque quart, l'un veille et les autres
   * dorment. Chacun dort donc sa part de la nuit, pas la nuit entière — et la
   * fatigue ne se rembourse qu'au prorata.
   */
  sleepWithWatches(): void {
    const veilleurs = this.watchers();
    if (veilleurs.length < 2) return this.sleep();
    const quart = Math.round(NIGHT_SECONDS / veilleurs.length);
    veilleurs.forEach((garde, i) =>
      this.encounters.dispatch({
        type: 'passTime',
        seconds: quart,
        activity: 'sommeil',
        individual: { [garde.id]: 'veille' },
        note: `Tour de garde ${i + 1}/${veilleurs.length} : ${garde.name}.`,
      }),
    );
  }

  /* ── Le pourtour : les pièges ─────────────────────────────────────────── */

  readonly trapKinds = CAMP_TRAP_KINDS;
  readonly formatDuration = formatDuration;
  readonly campTrapKind = campTrapKind;

  readonly campTraps = computed<CampTrap[]>(() => this.encounter().campTraps ?? []);

  /** Ce que le personnage courant a dans son sac et pourrait poser. */
  readonly trapsInBag = computed(() =>
    (this.actor()?.inventory ?? []).filter((i) => i.qty > 0 && !!campTrapKind(i.name)),
  );

  setTrap(item: string): void {
    const id = this.actor()?.id;
    if (id) this.encounters.dispatch({ type: 'campTrap', act: 'set', actorId: id, item });
  }

  trapAct(act: 'lift' | 'spring' | 'rearm', trap: CampTrap): void {
    this.encounters.dispatch({ type: 'campTrap', act, trapId: trap.id, actorId: this.actor()?.id });
  }

  liftAllTraps(): void {
    this.encounters.dispatch({ type: 'campTrap', act: 'liftAll', actorId: this.actor()?.id });
  }

  ownerName(trap: { ownerId?: string }): string {
    return this.party().find((c) => c.id === trap.ownerId)?.name ?? '—';
  }

  /* ── Le feu : les vivres ──────────────────────────────────────────────── */

  /**
   * Chacun entame ses rations, ou boit son outre — ou seulement le personnage
   * courant, avec `alone`. Le sac se vide pour de vrai.
   */
  meal(gauge: SurvivalKey, alone = false): void {
    const actorId = alone ? this.actor()?.id : undefined;
    if (alone && !actorId) return;
    this.encounters.dispatch(actorId ? { type: 'meal', gauge, actorId } : { type: 'meal', gauge, team: 'allies' });
  }

  eat(unit: Combatant, item: CarriedItem): void {
    this.encounters.dispatch({ type: 'eat', actorId: unit.id, item: item.name });
  }

  /** Points rendus par un vivre, pour choisir en connaissance de cause. */
  nourishmentPoints(item: CarriedItem): number {
    return nourishmentOf(item)?.points ?? 0;
  }

  /* ── La rivière ───────────────────────────────────────────────────────── */

  /** De l'eau libre : ne coûte rien au sac. C'est au MJ de dire qu'il y en avait. */
  drinkAtSource(alone = false): void {
    const actorId = alone ? this.actor()?.id : undefined;
    if (alone && !actorId) return;
    this.encounters.dispatch(
      actorId
        ? { type: 'restore', gauge: 'thirst', source: 'la source', actorId }
        : { type: 'restore', gauge: 'thirst', source: 'la source', team: 'allies' },
    );
  }

  refill(): void {
    this.encounters.dispatch({ type: 'refill', team: 'allies' });
  }

  /* ── La lisière : la chasse ───────────────────────────────────────────── */

  readonly huntBonus = computed(() => huntBonus(this.actor()?.skills));

  /**
   * Le moteur fait passer le temps de la sortie, puis jette le d100 ; la prise
   * revient à qui est parti. On revient toujours, bredouille ou non.
   */
  goOut(kind: 'hunt' | 'forage'): void {
    const qui = this.actor();
    if (qui && this.actorAble()) this.encounters.dispatch({ type: kind, actorId: qui.id });
  }

  /* ── La lisière : le piège à mâchoires ─────────────────────────────────── */

  readonly snareItem = SNARE_ITEM;
  readonly snareTable = SNARE_TABLE;
  readonly snareSetDuration = formatDuration(SNARE_SET_SECONDS);
  readonly snareCheckDuration = formatDuration(SNARE_CHECK_SECONDS);
  readonly snareWaitDuration = formatDuration(SNARE_WAIT_SECONDS);

  readonly snares = computed<Snare[]>(() => this.encounter().snares ?? []);

  /** Le personnage courant a-t-il un piège à poser ? */
  readonly hasSnare = computed(() =>
    (this.actor()?.inventory ?? []).some((i) => i.name === SNARE_ITEM && i.qty > 0),
  );

  /** Depuis combien de temps il est armé, et s'il vaut déjà le déplacement. */
  snareState(snare: Snare): { since: string; ready: boolean; left: string } {
    const age = absoluteSeconds(clockOf(this.encounter())) - snare.setAt;
    return {
      since: formatDuration(Math.max(0, age)),
      ready: age >= SNARE_WAIT_SECONDS,
      left: formatDuration(Math.max(0, SNARE_WAIT_SECONDS - age)),
    };
  }

  setSnare(): void {
    const id = this.actor()?.id;
    if (id && this.actorAble()) this.encounters.dispatch({ type: 'snare', act: 'set', actorId: id });
  }

  snareAct(act: 'check' | 'lift', snare: Snare): void {
    const id = this.actor()?.id;
    if (id && this.actorAble()) this.encounters.dispatch({ type: 'snare', act, actorId: id, snareId: snare.id });
  }

  /* ── Le paquetage ─────────────────────────────────────────────────────── */

  /**
   * Le sac se feuillette comme sur la fiche : six lignes par page, pour que le
   * menu tienne sans défiler même quand le personnage porte tout un bazar.
   */
  readonly bagPerPage = 6;
  readonly bagPage = signal(0);

  readonly bagPageItems = computed<CarriedItem[]>(() => {
    const debut = this.bagPage() * this.bagPerPage;
    return (this.actor()?.inventory ?? []).slice(debut, debut + this.bagPerPage);
  });

  /**
   * Ce qu'on peut FAIRE d'une ligne du sac au camp : les gestes d'objet qui la
   * consomment et qui se portent sur soi ou sur un allié — une fiole, un
   * bandage, un venin à étaler. Ce qui se lance sur un ennemi ou se pose au
   * sol (filet, piège) n'a rien à faire autour du feu.
   */
  itemUses(item: CarriedItem): CombatAbility[] {
    if (item.qty <= 0) return [];
    return (this.actor()?.abilities ?? []).filter(
      (a) =>
        a.kind === 'item' &&
        a.consumes?.item === item.name &&
        !a.placesHazard &&
        a.targets.some((t) => t === 'self' || t === 'ally'),
    );
  }

  /** Sur qui porter l'objet : soi-même par défaut. */
  readonly useTargetId = signal<string | null>(null);

  readonly useTarget = computed<Combatant | undefined>(
    () => this.party().find((c) => c.id === this.useTargetId()) ?? this.actor(),
  );

  /** L'objet vise-t-il le personnage choisi ? Un geste « sur soi » ne se donne pas. */
  canUseOn(ability: CombatAbility): boolean {
    const cible = this.useTarget();
    if (!cible || cible.id === this.actor()?.id) return ability.targets.includes('self') || ability.shape.kind === 'self';
    return ability.targets.includes('ally') && ability.shape.kind !== 'self';
  }

  useItem(ability: CombatAbility): void {
    const qui = this.actor();
    const cible = this.useTarget();
    if (!qui || !this.actorAble()) return;
    this.encounters.dispatch({
      type: 'campUse',
      actorId: qui.id,
      abilityId: ability.id,
      targetId: cible && cible.id !== qui.id ? cible.id : undefined,
    });
  }

  /**
   * Poids du sac, là où le catalogue le connaît. `partial` dit qu'une ligne au
   * moins n'a pas de poids : le total est alors un minimum, pas une pesée.
   */
  readonly bagWeight = computed(() => {
    const sac = this.actor()?.inventory ?? [];
    const kg = sac.reduce((sum, i) => sum + (i.weightKg ?? 0) * i.qty, 0);
    return { kg: Math.round(kg * 10) / 10, partial: sac.some((i) => i.qty > 0 && i.weightKg === undefined) };
  });

  /** Des vivres sans jet : un achat à l'étape, un don, une correction. */
  provision(item: string): void {
    this.encounters.dispatch({
      type: 'provision',
      item,
      qty: 1,
      actorId: this.actor()?.id,
      source: 'ravitaillement',
    });
  }

  /* ── La clairière : travailler un sort ────────────────────────────────── */

  readonly trainableSpells = computed(() => {
    const unit = this.actor();
    if (!unit || unit.origin.kind !== 'sheet') return [];
    const vus = new Set<string>();
    return unit.abilities
      .filter((a) => a.kind === 'spell' && !!a.ref)
      .filter((a) => !vus.has(a.ref!) && vus.add(a.ref!))
      .map((a) => {
        const cost = effectiveManaCost(this.encounter(), a, unit);
        return { ref: a.ref!, name: a.name, seances: unit.spellTraining?.[a.ref!] ?? 0, cost, affordable: unit.mana >= cost };
      });
  });

  /**
   * Une séance de travail sur un sort : elle coûte la mana du sort. L'XP, elle,
   * n'est écrite sur la fiche qu'au report.
   */
  trainSpell(ref: string, delta: 1 | -1 = 1): void {
    const id = this.actor()?.id;
    if (id) this.encounters.dispatch({ type: 'trainSpell', actorId: id, ref, delta });
  }

  /* ── Le groupe ────────────────────────────────────────────────────────── */

  /** Correction du MJ, d'un pas de points. */
  adjustSurvival(unit: Combatant, gauge: SurvivalKey, delta: number): void {
    const points = pointsLeft(gauge, unit.survival, profileOf(unit.attributes)) + delta;
    this.encounters.dispatch({ type: 'setSurvival', actorId: unit.id, gauge, points });
  }

  /* ── La table ─────────────────────────────────────────────────────────── */

  /** Dresser le camp après le montage ou la dernière chute. */
  enterCamp(): void {
    this.encounters.dispatch({ type: 'setPhase', phase: 'exploration' });
  }

  undo(): void {
    this.encounters.undo();
  }

  /** Le journal du camp : c'est là qu'on lit ce que la chasse a rendu. */
  readonly recentLog = computed(() => [...this.encounter().log].reverse().slice(0, 40));
}
