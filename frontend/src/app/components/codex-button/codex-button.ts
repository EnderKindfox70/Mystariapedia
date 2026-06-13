import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'codex-button',
  imports: [RouterLink],
  templateUrl: './codex-button.html',
  styleUrl: './codex-button.css',
})
export class CodexButton 
{
  route = input.required<string>();
  label = input.required<string>();
}
