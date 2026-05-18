import { Component } from '@angular/core';
import { Navbar } from '../../components/navbar/navbar';
import { MagicWritingDirective } from '../../directive/magic-writing.directive';

@Component({
  selector: 'app-magics',
  imports: [Navbar, MagicWritingDirective],
  templateUrl: './magics.html',
  styleUrl: './magics.css',
})
export class Magics {}
