import { Routes } from '@angular/router';
import { Home } from './views/home/home';
import { Tests } from './views/tests/tests';
import { Magics } from './views/magics/magics';
import { Locations } from './views/locations/locations';
import { Bestiary } from './views/bestiary/bestiary';
import { Artifacts } from './views/artifacts/artifacts';
import { Lore } from './views/lore/lore';
import { Factions } from './views/factions/factions';
import { Entities } from './entities/entities';
import { Fire } from './views/domains/fire/fire';
import { Water } from './views/domains/water/water';
import { Earth } from './views/domains/earth/earth';
import { Air } from './views/domains/air/air';
import { Electricity } from './views/domains/electricity/electricity';
import { Plant } from './views/domains/plant/plant';
import { Light } from './views/domains/light/light';
import { Darkness } from './views/domains/darkness/darkness';
import { Life } from './views/domains/life/life';
import { Death } from './views/domains/death/death';
import { Time } from './views/domains/time/time';
import { Space } from './views/domains/space/space';

export const routes: Routes = 
[
    {path: '', component: Home},
    {path: 'home', component: Home} ,
    {path: 'lore', component: Lore},
    {path: 'magics', component: Magics},
    {path: 'magics/fire', component: Fire},
    {path: 'magics/water', component: Water},
    {path: 'magics/earth', component: Earth},
    {path: 'magics/air', component: Air},
    {path: 'magics/electricity', component: Electricity},
    {path: 'magics/plant', component: Plant},
    {path: 'magics/light', component: Light},
    {path: 'magics/darkness', component: Darkness},
    {path: 'magics/life', component: Life},
    {path: 'magics/death', component: Death},
    {path: 'magics/time', component: Time},
    {path: 'magics/space', component: Space},
    {path: 'locations', component: Locations},
    {path: 'entities', component: Entities},
    {path: 'bestiary', component: Bestiary},
    {path: 'artifacts', component: Artifacts},
    {path: 'factions' , component: Factions},
    {path: 'tests', component: Tests}
];
