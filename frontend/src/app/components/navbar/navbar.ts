import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AnimationPreferencesService } from '../../services/animation-preferences.service';

@Component({
  selector: 'navbar',
  imports: [RouterLink],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
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
}
