import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AnimationPreferencesService } from '../../services/animation-preferences.service';

type NavItem = {
  key: string;
  label: string;
  path: string;
  fragment?: string;
  children?: NavItem[];
};

@Component({
  selector: 'navbar',
  imports: [CommonModule, RouterLink],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  isNavigationOpen = false;
  activeGroup: string | null = null;
  searchQuery = '';

  readonly navItems: NavItem[] = [
    { key: 'accueil', label: 'Accueil', path: '/' },
    {
      key: 'lore',
      label: 'Lore',
      path: '/lore',
      children: [
        { key: 'archives-occultes', label: 'Archives occultes', path: '/lore/archives' },
        { key: 'mythes-fondateurs', label: 'Mythes fondateurs', path: '/lore/mythes' },
        { key: 'rituels-oublies', label: 'Rituels oublies', path: '/lore/rituels' },
      ],
    },
    {
      key: 'factions',
      label: 'Factions',
      path: '/factions',
      children: [
        { key: 'ordres-sacres', label: 'Ordres sacres', path: '/factions/ordres' },
        { key: 'cabales-secretes', label: 'Cabales secretes', path: '/factions/cabal' },
        { key: 'heritiers-perdus', label: 'Heritiers perdus', path: '/factions/heritiers' },
      ],
    },
    {
      key: 'magie',
      label: 'Magie',
      path: '/magics',
      children: [
        { key: 'règles fondamentales', label: 'Règles fondamentales', path: '/magics', fragment: 'rules' },
        { key: 'eveil', label: 'Don & Eveil', path: '/magics', fragment: 'awakening' },
        { key: 'domaines', label: 'Domaines', path: '/magics', fragment: 'domains', children: [
          {key: 'fire', label: 'Feu', path: '/magics/fire'}
         ]},
        { key: 'mana', label: 'Mana', path: '/magics', fragment: 'mana' },
        { key: 'Autre disciplines', label: 'Autre disciplines', path: '/magics', fragment: 'other-disciplines' },
        { key: 'Magie non polarisée', label: 'Magie non polarisée', path: '/magics', fragment: 'non-polarized-magic' },
      ],
    },
    {
      key: 'artefacts',
      label: 'Artefacts',
      path: '/artifacts',
      children: [
        { key: 'inventaire', label: 'Inventaire', path: '/artifacts/index' },
        { key: 'armes-armures', label: 'Armes & armures', path: '/artifacts/armes' },
        { key: 'reliques', label: 'Reliques anciennes', path: '/artifacts/reliques' },
        { key: 'grimoires', label: 'Grimoires', path: '/artifacts/grimoires' },
      ],
    },
    {
      key: 'bestiaire',
      label: 'Bestiaire',
      path: '/bestiary',
      children: [
        { key: 'creatures-communes', label: 'Creatures communes', path: '/bestiary/faune' },
        { key: 'creatures-interdites', label: 'Creatures interdites', path: '/bestiary/legendaires' },
        { key: 'entites-anciennes', label: 'Entites anciennes', path: '/entities' },
        { key: 'mutations', label: 'Mutations', path: '/bestiary/mutations' },
        { key: 'archives-disparues', label: 'Archives disparues', path: '/bestiary/archives' },
      ],
    },
    {
      key: 'lieux',
      label: 'Lieux',
      path: '/locations',
      children: [
        { key: 'carte-royaumes', label: 'Carte des royaumes', path: '/locations/carte' },
        { key: 'sites-sacres', label: 'Sites sacres', path: '/locations/sacres' },
        { key: 'ruines-oubliees', label: 'Ruines oubliees', path: '/locations/ruines' },
        { key: 'noeuds-magiques', label: 'Noeuds magiques', path: '/locations/noeuds' },
      ],
    },
    {
      key: 'chronologie',
      label: 'Chronologie',
      path: '/lore',
      fragment: 'chronologie',
      children: [
        { key: 'eres', label: 'Eres anciennes', path: '/lore', fragment: 'chronologie' },
        { key: 'retrait-dieux', label: 'Retrait des dieux', path: '/lore', fragment: 'chronologie' },
        { key: 'archives-datees', label: 'Archives datees', path: '/lore', fragment: 'chronologie' },
      ],
    },
  ];

  constructor(
    private readonly router: Router,
    private readonly animationPreferences: AnimationPreferencesService,
  ) {}

  get magicWritingEnabled() {
    return this.animationPreferences.magicWritingEnabled;
  }

  toggleMagicWriting(): void {
    this.animationPreferences.toggleMagicWriting();
  }

  toggleNavigation(): void {
    this.isNavigationOpen = !this.isNavigationOpen;
  }

  closeNavigation(): void {
    this.isNavigationOpen = false;
    this.activeGroup = null;
    this.searchQuery = '';
  }

  toggleGroup(groupKey: string): void {
    this.activeGroup = this.activeGroup === groupKey ? null : groupKey;
  }

  openGroup(groupKey: string): void {
    this.activeGroup = groupKey;
  }

  updateSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery = input.value;
  }

  clearSearch(): void {
    this.searchQuery = '';
  }

  get searchResults(): NavItem[] {
    const query = this.normalize(this.searchQuery);
    if (!query) return [];

    return this.navItems.flatMap((item) => {
      const entries = [item, ...(item.children ?? [])];
      return entries.filter((entry) => this.normalize(entry.label).includes(query));
    });
  }

  get expandedGroup(): string | null {
    const path = this.router.url.split('?')[0];
    if (path.startsWith('/magics')) return 'magie';
    if (path.startsWith('/artifacts')) return 'artefacts';
    if (path.startsWith('/locations')) return 'lieux';
    if (path.startsWith('/bestiary')) return 'bestiaire';
    if (path.startsWith('/chronology')) return 'chronologie';
    if (path.startsWith('/lore')) return 'lore';
    if (path.startsWith('/factions')) return 'factions';
    return null;
  }

  isGroupOpen(groupKey: string): boolean {
    return this.activeGroup === groupKey;
  }

  @HostListener('document:click', ['$event'])
  closeFloatingPanel(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('navbar')) {
      this.activeGroup = null;
    }
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
