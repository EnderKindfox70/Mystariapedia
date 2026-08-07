import { Routes } from '@angular/router';
import { Home } from './views/home/home';
import { Tests } from './views/tests/tests';
import { Magics } from './views/magics/magics';
import { Locations } from './views/locations/locations';
import { Bestiary } from './views/bestiary/bestiary';
import { Artifacts } from './views/artifacts/artifacts';
import { Lore } from './views/lore/lore';
import { Peoples } from './views/peoples/peoples';
import { PeopleEntryComponent } from './views/peoples-entries/peoples-entries';
import { peopleResolver } from './resolvers/people.resolver';
import { Factions } from './views/factions/factions';
import { Alchemy } from './views/alchemy/alchemy';
import { DomainEntryComponent } from './views/domains-entries/domains-entries';
import { SpellEntryComponent } from './views/spells-entries/spells-entries';
import { MagicConstellation } from './views/magic-constellation/magic-constellation';
import { Objects } from './views/objects/objects';
import { Weapons } from './views/weapons/weapons';
import { WeaponEntryComponent } from './views/weapons-entries/weapons-entries';
import { weaponResolver } from './resolvers/weapon.resolver';
import { NaturalResources } from './views/natural-resources/natural-resources';
import { Equipment } from './views/equipment/equipment';
import { equipmentResolver } from './resolvers/equipment.resolver';
import { ResourceEntryComponent } from './views/resources-entries/resources-entries';
import { PotionEntryComponent } from './views/potions-entries/potions-entries';
import { domainResolver } from './resolvers/domain.resolver';
import { resourceResolver } from './resolvers/resource.resolver';
import { potionResolver } from './resolvers/potion.resolver';
import { Login } from './views/auth/login/login';
import { Register } from './views/auth/register/register';
import { Characters } from './views/characters/characters';
import { CharacterSheetEditor } from './views/character-sheet/character-sheet';
import { CombatView } from './views/combat/combat';
import { authGuard } from './services/auth.guard';

export const routes: Routes =
[
    { path: '', component: Home },
    { path: 'home', component: Home },
    { path: 'lore', component: Lore },
    { path: 'lore/peuples', component: Peoples },
    { path: 'lore/peuples/:slug', component: PeopleEntryComponent, resolve: { entry: peopleResolver } },
    { path: 'magics', component: Magics },
    { path: 'magics/constellation', component: MagicConstellation },
    { path: 'magics/spell/:spell', component: SpellEntryComponent },
    { path: 'magics/:domain', component: DomainEntryComponent, resolve: { entry: domainResolver } },
    { path: 'objects', component: Objects },
    { path: 'resources', component: NaturalResources },
    { path: 'resources/:category/:slug', component: ResourceEntryComponent, resolve: { entry: resourceResolver } },
    { path: 'locations', component: Locations },
    // Un seul composant pour tout le codex : le livre reste monté, donc changer
    // de chapitre / de folio / ouvrir une fiche déclenche un feuilletage.
    { path: 'bestiary', redirectTo: 'bestiary/communes', pathMatch: 'full' },
    // « faune » est devenu « communes » : on garde l'ancienne adresse vivante.
    // Chemin absolu : une cible relative se résoudrait sous /bestiary.
    { path: 'bestiary/faune', redirectTo: '/bestiary/communes', pathMatch: 'full' },
    // Les entités anciennes sont devenues un chapitre du bestiaire ; on garde
    // l'ancienne adresse vivante pour les liens déjà dans la nature.
    { path: 'entities', redirectTo: 'bestiary/entites', pathMatch: 'full' },
    { path: 'bestiary/:chapter', component: Bestiary },
    { path: 'bestiary/:chapter/:slug', component: Bestiary },
    { path: 'artifacts', component: Artifacts },
    { path: 'weapons', component: Weapons },
    { path: 'weapons/:category/:slug', component: WeaponEntryComponent, resolve: { entry: weaponResolver } },
    // Matériel non magique. La fiche réutilise la vue des ressources : même
    // gabarit (illustration, informations, propriétés) ; `data` fournit ce qui
    // ne peut pas venir de l'URL (section d'index et lien de retour).
    { path: 'equipment', component: Equipment },
    {
      path: 'equipment/:slug',
      component: ResourceEntryComponent,
      resolve: { entry: equipmentResolver },
      data: { category: 'equipment', categoryLabel: 'Équipement', indexLink: '/equipment', backLabel: "Retour à l'équipement" },
    },
    { path: 'alchemy', component: Alchemy },
    { path: 'alchemy/:slug', component: PotionEntryComponent, resolve: { entry: potionResolver } },
    { path: 'factions', component: Factions },
    { path: 'login', component: Login },
    { path: 'register', component: Register },
    { path: 'characters', component: Characters, canActivate: [authGuard] },
    { path: 'characters/new', component: CharacterSheetEditor, canActivate: [authGuard] },
    { path: 'characters/:id', component: CharacterSheetEditor, canActivate: [authGuard] },
    // Table de combat : les rencontres sont rattachées à leur MJ, donc au compte.
    { path: 'combat', component: CombatView, canActivate: [authGuard] },
    { path: 'tests', component: Tests },
];
