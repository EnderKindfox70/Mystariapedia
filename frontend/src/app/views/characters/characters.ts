import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Navbar } from '../../components/navbar/navbar';
import { AuthService } from '../../services/auth.service';
import { CharacterSheetService } from '../../services/character-sheet.service';
import { CharacterSheetSummary } from '../../character/character.types';

@Component({
  selector: 'app-characters',
  imports: [RouterLink, Navbar, DatePipe],
  templateUrl: './characters.html',
  styleUrl: './characters.css',
})
export class Characters {
  private readonly sheets = inject(CharacterSheetService);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly list = signal<CharacterSheetSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly deletingId = signal<string | null>(null);

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.sheets.list().subscribe({
      next: (sheets) => {
        this.list.set(sheets);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger vos fiches.');
        this.loading.set(false);
      },
    });
  }

  remove(sheet: CharacterSheetSummary, event: Event): void {
    event.stopPropagation();
    if (this.deletingId()) return;
    if (!confirm(`Supprimer définitivement la fiche « ${sheet.name} » ?`)) return;
    this.deletingId.set(sheet.id);
    this.sheets.remove(sheet.id).subscribe({
      next: () => {
        this.list.update((items) => items.filter((s) => s.id !== sheet.id));
        this.deletingId.set(null);
      },
      error: () => {
        this.error.set('Suppression impossible.');
        this.deletingId.set(null);
      },
    });
  }
}
