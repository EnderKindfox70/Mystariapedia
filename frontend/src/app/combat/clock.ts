/* ──────────────────────────────────────────────────────────────────────────
   L'HORLOGE DE LA TABLE

   Une rencontre ne se joue pas hors du temps : entre deux bagarres il y a une
   route à faire, une nuit à passer, une garde à tenir. L'horloge est ce qui
   relie les deux — elle avance de six secondes par round de combat et de ce
   que le MJ décide hors combat, et c'est elle qui use les jauges de survie.

   Tout est compté en **secondes entières**. Une seule unité pour l'horloge et
   pour l'usure : un round de six secondes ne peut pas se perdre dans l'arrondi
   d'une minute, et cent rounds ne dérivent pas d'un cheveu.
─────────────────────────────────────────────────────────────────────────── */

/** Secondes d'une minute, d'une heure, d'un jour — écrites une fois. */
export const MINUTE = 60;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Durée d'un round de combat. Six secondes : le temps d'un échange, la
 * convention de la plupart des tables. C'est ce qui fait qu'un combat de dix
 * rounds n'entame pas la gourde de personne.
 */
export const ROUND_SECONDS = 6;

/** Position dans le temps : le jour de voyage, et l'heure dans ce jour. */
export interface EncounterClock {
  /** Jour de campagne, à partir de 1. */
  day: number;
  /** Secondes écoulées depuis minuit, dans [0, DAY). */
  seconds: number;
}

/** Départ d'une campagne : premier jour, huit heures du matin. */
export const startingClock = (): EncounterClock => ({ day: 1, seconds: 8 * HOUR });

/**
 * Découpage de la journée en moments, dans l'ordre où on les traverse.
 *
 * Les clés sont celles de `daytime.json` : c'est ce catalogue qui porte les
 * modificateurs de magie (la lumière est reine à midi, l'ombre l'est la nuit),
 * l'horloge ne fait que désigner lequel s'applique.
 *
 * La nuit est **coupée en deux** — avant l'aube et après la soirée — parce
 * qu'elle est le seul moment à enjamber minuit. La ranger comme les autres
 * demanderait un cas particulier partout ; l'écrire deux fois n'en demande
 * aucun.
 */
export const DAYTIME_SCHEDULE: { key: string; from: number }[] = [
  { key: 'nuit', from: 0 },
  { key: 'aube', from: 5 * HOUR },
  { key: 'matinee', from: 7 * HOUR },
  { key: 'midi', from: 11 * HOUR },
  { key: 'apres-midi', from: 14 * HOUR },
  { key: 'soiree', from: 18 * HOUR },
  { key: 'nuit', from: 21 * HOUR },
];

/** Ramène des secondes dans [0, DAY), quel que soit le signe reçu. */
const intoDay = (seconds: number): number => ((seconds % DAY) + DAY) % DAY;

/** Moment de la journée à cette heure-là (clé de `daytime.json`). */
export function daytimeAt(clock: EncounterClock): string {
  const seconds = intoDay(clock.seconds);
  let key = DAYTIME_SCHEDULE[0].key;
  for (const slot of DAYTIME_SCHEDULE) {
    if (seconds >= slot.from) key = slot.key;
  }
  return key;
}

/** Première heure du jour où commence ce moment (pour y régler l'horloge). */
export function startOfDaytime(key: string): number | undefined {
  // On cherche à partir de l'aube : régler « nuit » doit poser 21 h, l'heure où
  // la nuit tombe, et non minuit, où elle est déjà à moitié passée.
  const slots = DAYTIME_SCHEDULE.filter((s) => s.from > 0);
  return slots.find((s) => s.key === key)?.from;
}

/** Avance (ou recule) l'horloge, en enjambant autant de minuits qu'il faut. */
export function advanceClock(clock: EncounterClock, seconds: number): EncounterClock {
  const total = clock.seconds + Math.round(seconds);
  const days = Math.floor(total / DAY);
  return { day: Math.max(1, clock.day + days), seconds: intoDay(total) };
}

/** Secondes séparant deux instants (b − a), jours compris. */
export const clockDelta = (a: EncounterClock, b: EncounterClock): number =>
  (b.day - a.day) * DAY + (b.seconds - a.seconds);

/** Heure seule, en « 17h40 ». */
export function formatTime(clock: EncounterClock): string {
  const seconds = intoDay(clock.seconds);
  const h = Math.floor(seconds / HOUR);
  const m = Math.floor((seconds % HOUR) / MINUTE);
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** Date complète, en « Jour 3 — 17h40 ». */
export const formatClock = (clock: EncounterClock): string =>
  `Jour ${clock.day} — ${formatTime(clock)}`;

/**
 * Une durée en toutes lettres : « 40 min », « 2 h », « 1 h 30 ». Sert au
 * journal, où « 5400 s » ne dit rien à personne.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < MINUTE) return `${total} s`;
  if (total < HOUR) return `${Math.round(total / MINUTE)} min`;
  const h = Math.floor(total / HOUR);
  const m = Math.round((total % HOUR) / MINUTE);
  return m ? `${h} h ${m}` : `${h} h`;
}

/**
 * Les pas de temps proposés au MJ hors combat.
 *
 * Volontairement peu nombreux : une table avance par gestes ronds — « on
 * fouille », « on marche jusqu'au soir », « on dort ». Un champ libre reste
 * disponible pour le reste, mais ces cinq-là couvrent la séance.
 */
export const TIME_STEPS: { label: string; seconds: number }[] = [
  { label: '10 min', seconds: 10 * MINUTE },
  { label: '30 min', seconds: 30 * MINUTE },
  { label: '1 h', seconds: HOUR },
  { label: '4 h', seconds: 4 * HOUR },
  { label: '8 h', seconds: 8 * HOUR },
];
