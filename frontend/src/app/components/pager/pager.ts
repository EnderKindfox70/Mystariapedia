import { Component, computed, effect, input, model } from '@angular/core';

/* ──────────────────────────────────────────────────────────────────────────
   PAGINATION — découpe une liste en pages plutôt qu'en défilement.

   Le composant ne connaît pas la liste : il ne tient que l'index de la page
   courante (`page`, à partir de 0) et sait combien il y a d'éléments en tout.
   C'est l'appelant qui tranche sa liste — il garde ainsi la main sur les
   index réels de ses lignes, dont il a besoin pour ses champs et ses retraits.

       <pager [total]="items.length" [perPage]="6" [(page)]="p" unit="objets" />
       @for (row of items.slice(p * 6, p * 6 + 6); track …) { … }
─────────────────────────────────────────────────────────────────────────── */

@Component({
  selector: 'pager',
  templateUrl: './pager.html',
  styleUrl: './pager.css',
})
export class Pager {
  /** Nombre total d'éléments à paginer. */
  readonly total = input.required<number>();
  /** Éléments par page. À choisir pour qu'une page tienne sans défilement. */
  readonly perPage = input(8);
  /** Index de la page affichée, à partir de 0. Lié dans les deux sens. */
  readonly page = model(0);
  /** Nom de l'unité comptée, pour le décompte (« 12 objets »). */
  readonly unit = input('éléments');
  /** Masque le décompte quand la place manque. */
  readonly showCount = input(true);

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.perPage())));

  /** Premier et dernier rang affichés, en numérotation humaine (1…n). */
  readonly from = computed(() => (this.total() === 0 ? 0 : this.page() * this.perPage() + 1));
  readonly to = computed(() => Math.min(this.total(), (this.page() + 1) * this.perPage()));

  readonly hasPrev = computed(() => this.page() > 0);
  readonly hasNext = computed(() => this.page() < this.pageCount() - 1);

  constructor() {
    // La liste a rétréci sous la page courante (on a retiré des lignes) : on
    // remonte, sinon l'appelant tranche dans le vide et la page paraît cassée.
    effect(() => {
      const last = this.pageCount() - 1;
      if (this.page() > last) this.page.set(last);
    });
  }

  go(delta: number): void {
    const cible = this.page() + delta;
    if (cible < 0 || cible > this.pageCount() - 1) return;
    this.page.set(cible);
  }
}
