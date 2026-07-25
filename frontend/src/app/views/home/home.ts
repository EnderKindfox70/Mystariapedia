import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthDoor } from '../../components/auth-door/auth-door';
import { DOMAINS } from '../../domains.catalog';

@Component({
  selector: 'app-home',
  imports: [RouterModule, AuthDoor],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  /** Les 12 domaines (catalogue unique) — bande d'icônes du pied de page. */
  readonly domains = DOMAINS;

  /** Icône de repli quand un domaine n'a pas encore d'icône propre. */
  readonly defaultDomainIcon = '/resources/media/icons/magic.svg';

  isNavigationOpen = false;

  toggleNavigation(): void {
    this.isNavigationOpen = !this.isNavigationOpen;
  }

  closeNavigation(): void {
    this.isNavigationOpen = false;
  }
}
