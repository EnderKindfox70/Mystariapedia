import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Navbar } from '../../components/navbar/navbar';
import { MagicWritingDirective } from '../../directive/magic-writing.directive';

@Component({
  selector: 'app-magics',
  imports: [Navbar, MagicWritingDirective, RouterLink],
  templateUrl: './magics.html',
  styleUrl: './magics.css',
})
export class Magics {}
