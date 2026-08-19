import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Navbar } from '../../components/navbar/navbar';
import { MagicWritingDirective } from '../../directive/magic-writing.directive';
import { AFFINITY_CHART, DOMAIN_DISTRIBUTION_CHARTS, PieChart } from './domain-distribution';
import { MistTranslateDirective } from '../../directive/mist-translate.directive';
import { CodexButton } from '../../components/codex-button/codex-button';
import { DOMAINS } from '../../domains.catalog';

@Component({
  selector: 'app-magics',
  imports: [CommonModule, Navbar, MagicWritingDirective, RouterLink, MistTranslateDirective, CodexButton],
  templateUrl: './magics.html',
  styleUrl: './magics.css',
})
export class Magics {
  /** Les 12 domaines (catalogue unique) — alimente la grille des domaines. */
  readonly domains = DOMAINS;

  hoveredSlice: { chartKey: string; sliceKey: string } | null = null;

  readonly affinityChart: PieChart = AFFINITY_CHART;

  readonly domainCharts: PieChart[] = DOMAIN_DISTRIBUTION_CHARTS;

  setHoveredSlice(chartKey: string, sliceKey: string): void {
    this.hoveredSlice = { chartKey, sliceKey };
  }

  clearHoveredSlice(): void {
    this.hoveredSlice = null;
  }

  isSliceHighlighted(chartKey: string, sliceKey: string): boolean {
    return (
      this.hoveredSlice?.chartKey === chartKey &&
      this.hoveredSlice.sliceKey === sliceKey
    );
  }

  isChartDimmed(chartKey: string): boolean {
    return this.hoveredSlice?.chartKey === chartKey;
  }
}
