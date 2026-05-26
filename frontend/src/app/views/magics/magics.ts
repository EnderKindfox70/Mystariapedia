import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Navbar } from '../../components/navbar/navbar';
import { MagicWritingDirective } from '../../directive/magic-writing.directive';
import { buildSlices, DOMAIN_DISTRIBUTION_CHARTS, PieChart } from './domain-distribution';
import { MistTranslateDirective } from '../../directive/mist-translate.directive';

@Component({
  selector: 'app-magics',
  imports: [CommonModule, Navbar, MagicWritingDirective, RouterLink, MistTranslateDirective],
  templateUrl: './magics.html',
  styleUrl: './magics.css',
})
export class Magics {
  hoveredSlice: { chartKey: string; sliceKey: string } | null = null;

  readonly affinityChart: PieChart = {
    key: 'affinity',
    title: 'Répartition naturelle des affinités magiques',
    center: 'Affinités natives',
    slices: buildSlices([
      {
        key: 'single',
        label: 'Affinité unique',
        value: 76,
        details: "Un seul domaine, accessible à l'éveil",
        color: '#8b6b2f',
      },
      {
        key: 'dual',
        label: 'Deux affinités',
        value: 11,
        details: 'Rares, souvent instables dans leur pratique initiale',
        color: '#6b1f1f',
      },
      {
        key: 'many',
        label: 'Trois affinités ou plus',
        value: 4,
        details: "Exceptionnels, parfois soupçonnés d'ascendance divine non documentée",
        color: '#4b2e59',
      },
      {
        key: 'sealed',
        label: 'Mana impossible à réguler',
        value: 9,
        details: "Ni affinité, ni éveil possible par voie ordinaire",
        color: '#1c1a18',
      },
    ]),
  };

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
