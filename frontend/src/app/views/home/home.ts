import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthDoor } from '../../components/auth-door/auth-door';

@Component({
  selector: 'app-home',
  imports: [RouterModule, AuthDoor],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  isNavigationOpen = false;

  toggleNavigation(): void {
    this.isNavigationOpen = !this.isNavigationOpen;
  }

  closeNavigation(): void {
    this.isNavigationOpen = false;
  }
}
