import { Component, computed, inject, input, signal } from '@angular/core';
import { StatusEffectsService } from '../../services/status-effects.service';
import {
  affinityLines,
  DANGER_BY_KEY,
  DECAY_STAGES,
  GHOSTS,
  ghostAffinities,
  ghostRangeLines,
  ghostStats,
  necromancyControlRange,
  stageWindow,
  UNDEAD,
  undeadStats,
  veilChance,
} from '../../combat/undead';

/**
 * Les archétypes qu'un sort de la Mort relève ou invoque, en cartes.
 *
 * Le praticien ne choisit jamais la forme : le nécromancien la lit sur le stade
 * de décomposition du corps, le médium la découvre dans le profil de l'âme. La
 * fiche du sort montre donc tout l'éventail, pour qu'on sache à quoi s'attendre.
 */
@Component({
  selector: 'death-archetypes',
  templateUrl: './death-archetypes.html',
  styleUrl: './death-archetypes.css',
})
export class DeathArchetypes {
  private readonly statuses = inject(StatusEffectsService);

  readonly kind = input.required<'undead' | 'ghosts'>();
  readonly note = input<string | undefined>();
  /** Affiche la chance de chaque fantôme de répondre à l'appel. */
  readonly veil = input(false);

  /** Niveau du nécromancien ou du médium, pour lire les stats des invocations. */
  readonly level = signal(5);
  readonly levels = Array.from({ length: 20 }, (_, i) => i + 1);

  readonly undead = computed(() => {
    const niv = this.level();
    return UNDEAD.map((u) => ({
      ...u,
      stageName: DECAY_STAGES.find((s) => s.key === u.stage)?.name ?? u.stage,
      window: stageWindow(u.stage),
      stats: undeadStats(u.key, niv),
      affinities: affinityLines(u.affinities ?? []),
      immunities: (u.statusImmunities ?? []).map((k) => this.statusName(k)),
    }));
  });

  readonly ghosts = computed(() =>
    GHOSTS.map((g) => {
      const tier = DANGER_BY_KEY.get(g.danger)!;
      return {
        ...g,
        dangerName: tier.name,
        upkeep: g.manaModel === 'host-drain' ? null : tier.upkeep,
        chance: veilChance(g.key),
        ranges: ghostRangeLines(g.key),
        stats: ghostStats(g.key, this.level()),
        affinities: affinityLines(ghostAffinities(g.key)),
        self: (g.selfStatuses ?? []).map((k) => this.statusName(k)),
      };
    }),
  );

  /** Portée de contrôle du nécromancien, en clair. */
  readonly controlRange = `${necromancyControlRange(0)} m + 5 m × CHA`;

  statusName(key: string): string {
    return this.statuses.byKey(key)?.name ?? key;
  }

  setLevel(event: Event): void {
    this.level.set(Number((event.target as HTMLSelectElement).value));
  }
}
