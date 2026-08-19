import { WEAPON_CATEGORY_BY_KEY } from './abilities';
import { CarriedItem, Combatant, GridPos, MetalItem } from './combat.types';
import { MATERIAL_BY_KEY } from './materials';

/* ── Ce que le magnétisme peut saisir ──────────────────────────────────────
   Le fer et l'acier, et eux seuls. Chaque objet dit DE QUOI il est fait, et
   c'est la matière qui décide : le plomb d'une bille de fronde, le bronze d'un
   astrolabe et l'or d'une chevalière sont des métaux sans être magnétiques.
   Plus aucun drapeau à tenir à jour objet par objet — la physique s'en charge.

   Rien n'est mis en cache : ce qu'un combattant porte change en plein combat.
   On le désarme, il vide son sac, il ramasse. Une liste figée à l'ouverture
   de la rencontre aurait promis des prises qui n'existent plus.
─────────────────────────────────────────────────────────────────────────── */

/**
 * Ce qu'un objet de sac inflige quand on le projette, faute d'être une arme.
 *
 * La masse fait tout : une enclume de forge n'arrive pas comme un briquet. Le
 * type reste contondant quel que soit l'objet — ce qui tranche vraiment, ce
 * sont les armes, et celles-ci portent déjà leur propre type.
 */
export function heftDamage(weightKg: number | undefined): { min: number; max: number; type: string } {
  const kg = Math.max(0, weightKg ?? 0.5);
  return {
    min: 1 + Math.floor(kg),
    max: 2 + Math.ceil(kg * 2),
    type: 'bludgeoning',
  };
}

/** Ce qu'un projectile ferreux (flèche, carreau) vaut lancé à la main du champ. */
const AMMO_THROWN = { min: 1, max: 3, type: 'piercing' };

/**
 * Part des dégâts d'une matière que vaut un objet quelconque qu'on lui projette.
 *
 * Une barre de fer lancée ne vaut pas une lame de fer façonnée par un sort : le
 * champ donne l'élan, la forme ne s'en mêle pas. Un tiers rend l'objet trouvé
 * intéressant sans concurrencer un vrai sort de Terre.
 */
const SCRAP_SHARE = 1 / 3;

/**
 * Ce qu'un objet inflige d'après SA MATIÈRE, quand on la connaît.
 *
 * Mieux que la masse seule : un couteau d'acier et une marmite de fer ne pèsent
 * pas la même chose et ne blessent pas de la même façon. Rend `undefined` pour
 * un objet dont la matière n'est pas au catalogue — la masse prend alors le
 * relais.
 */
function materialThrown(material: string | undefined): { min: number; max: number; type: string } | undefined {
  const def = material ? MATERIAL_BY_KEY.get(material) : undefined;
  if (!def) return undefined;
  return {
    min: Math.max(1, Math.round(def.damage.min * SCRAP_SHARE)),
    max: Math.max(2, Math.round(def.damage.max * SCRAP_SHARE)),
    type: def.damageType,
  };
}

/**
 * Tout le ferreux qu'un combattant porte, arme au poing comprise.
 *
 * L'ARMURE N'Y EST PAS, volontairement. Une cotte de mailles se lace, se
 * sangle et se porte à même le corps : un champ la tire avec son homme, il ne
 * la lui retire pas. Elle rend son porteur sensible aux champs — c'est
 * `bearsMetal` qui s'en occupe — sans jamais devenir une prise.
 */
export function metalCarriedBy(unit: Combatant): MetalItem[] {
  const items: MetalItem[] = [];

  for (const ability of unit.abilities) {
    if (ability.kind !== 'weapon' || !ability.metallic) continue;
    // Une arme lancée vaut ce qu'elle vaut en main : c'est la même lame.
    const first = ability.damages[0];
    items.push({
      name: ability.name,
      source: 'weapon',
      abilityId: ability.id,
      wield: ability.wield,
      thrown: first
        ? { min: first.min, max: first.max, type: first.type }
        : heftDamage(undefined),
    });
  }

  for (const line of unit.inventory) {
    if (!line.metallic || line.qty <= 0) continue;
    items.push({
      name: line.name,
      source: 'bag',
      wield: line.weapon,
      thrown:
        line.kind === 'ammunition'
          ? { ...AMMO_THROWN }
          : (materialThrown(line.material) ?? heftDamage(line.weightKg)),
    });
  }

  return items;
}

/**
 * Tout le ferreux qu'un combattant peut SAISIR pour le projeter : ce qu'il
 * porte, plus ce qui traîne à ses pieds.
 *
 * Un champ magnétique n'a pas besoin qu'on se baisse — c'est même sa raison
 * d'être. Une épée tombée à côté de soi est aussi disponible qu'une dague au
 * sac, et c'est ce qui rend un champ de bataille jonché de ferraille plus
 * dangereux qu'un pré.
 */
export function metalWithinGrasp(
  unit: Combatant,
  ground: { pos: GridPos; items: CarriedItem[] }[],
): MetalItem[] {
  const items = metalCarriedBy(unit);
  for (const pile of ground) {
    for (const line of pile.items) {
      if (!line.metallic || line.qty <= 0) continue;
      items.push({
        name: line.name,
        source: 'ground',
        at: pile.pos,
        wield: line.weapon,
        thrown: line.weapon
          ? { min: line.weapon.source.minDamage, max: line.weapon.source.maxDamage, type: weaponThrownType(line) }
          : line.kind === 'ammunition'
            ? { ...AMMO_THROWN }
            : (materialThrown(line.material) ?? heftDamage(line.weightKg)),
      });
    }
  }
  return items;
}

/**
 * Le type de dégâts d'une arme ramassée au sol, quand on la lance.
 *
 * Une lame taille, une masse écrase : c'est la catégorie de l'arme qui le dit,
 * pas son poids. Faute de catégorie connue, elle arrive comme une masse.
 */
function weaponThrownType(line: CarriedItem): string {
  const category = line.weapon?.source.weaponCategory;
  return (category && WEAPON_CATEGORY_BY_KEY.get(category)?.damageType) || 'bludgeoning';
}

/**
 * Le combattant porte-t-il du métal sur lui ?
 *
 * C'est la question que pose un bouclier électromagnétique, et elle est plus
 * large que « peut-on lui prendre quelque chose » : l'armure compte, alors
 * qu'elle ne s'arrache pas. Un chevalier en plaques est refoulé même les mains
 * vides ; un bretteur en cuir passe, sauf s'il tient encore sa rapière.
 */
export function bearsMetal(unit: Combatant): boolean {
  if (unit.metallicArmor) return true;
  return metalCarriedBy(unit).length > 0;
}

/** La prise désignée, ou la première venue quand le joueur n'a rien choisi. */
export function pickMetal(items: MetalItem[], name: string | undefined): MetalItem | undefined {
  if (!items.length) return undefined;
  return items.find((i) => i.name === name) ?? items[0];
}
