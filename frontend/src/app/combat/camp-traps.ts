/* ──────────────────────────────────────────────────────────────────────────
   LES PIÈGES AUTOUR DU CAMP

   Ce ne sont pas les pièges du plateau (cf. `hazards.ts`), posés sur une case
   pour prendre un adversaire en combat : ceux-ci ceinturent le camp pour la
   nuit. Chacun a son rôle contre qui s'approche — l'un réveille, l'autre
   entrave, le dernier ralentit. Ils ne remplacent pas la garde : ils donnent
   au MJ ce qui arrive à l'intrus, et au camp le temps de réagir.

   Un piège DÉCLENCHÉ ne sert plus à rien tant qu'on ne l'a pas réarmé.
─────────────────────────────────────────────────────────────────────────── */

/** Ce qu'un objet du sac vaut, posé autour du camp. */
export interface CampTrapKind {
  /** Nom de l'objet tel qu'il figure au sac (et au catalogue d'équipement). */
  item: string;
  /** Son rôle, en un mot. */
  role: string;
  /** Ce qu'il fait à qui s'approche : c'est au MJ de s'en servir. */
  effect: string;
}

/**
 * Les pièges qu'on sait poser autour d'un camp. Le fil à clochette ne blesse
 * personne, mais « un garde ne veille jamais aussi bien qu'un fil tendu ».
 */
export const CAMP_TRAP_KINDS: CampTrapKind[] = [
  {
    item: 'Fil de soie et clochette',
    role: 'Alarme',
    effect: 'Réveille le camp dès qu’un intrus franchit le fil : personne n’est surpris dans son sommeil.',
  },
  {
    item: 'Piège à mâchoires',
    role: 'Entrave',
    effect: 'Immobilise et blesse le premier qui met le pied dessus ; le claquement s’entend de tout le camp.',
  },
  {
    item: 'Chausse-trappes',
    role: 'Ralentit',
    effect: 'Font boiter qui approche dans le noir : l’intrus perd son élan, le camp gagne de précieux instants.',
  },
];

const BY_ITEM = new Map(CAMP_TRAP_KINDS.map((k) => [k.item.toLowerCase(), k]));

/** Le rôle de cet objet autour du camp, s'il peut y être posé. */
export const campTrapKind = (item: string): CampTrapKind | undefined => BY_ITEM.get(item.trim().toLowerCase());
