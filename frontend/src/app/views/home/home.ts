import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterModule],
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
