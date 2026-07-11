import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Navbar } from '../../components/navbar/navbar';
import { PEOPLES } from '../../peoples.catalog';

@Component({
  selector: 'app-peoples',
  imports: [Navbar, RouterLink],
  templateUrl: './peoples.html',
  styleUrl: './peoples.css',
})
export class Peoples {
  /** Catalogue des peuples — alimente la grille. */
  readonly peoples = PEOPLES;
}
