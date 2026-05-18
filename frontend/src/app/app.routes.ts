import { Routes } from '@angular/router';
import { Home } from './views/home/home';
import { Tests } from './views/tests/tests';
import { Magics } from './views/magics/magics';
import { Locations } from './views/locations/locations';
import { Bestiary } from './views/bestiary/bestiary';
import { Artifacts } from './views/artifacts/artifacts';
import { Lore } from './views/lore/lore';

export const routes: Routes = 
[
    {path: '', component: Home},
    {path: 'home', component: Home} ,
    {path: 'lore', component: Lore},
    {path: 'magics', component: Magics},
    //{path: 'magics/:domain', component: Magics},
    {path: 'locations', component: Locations},
    {path: 'bestiary', component: Bestiary},
    {path: 'artifacts', component: Artifacts},
    {path: 'tests', component: Tests}
];
