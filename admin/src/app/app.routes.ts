import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';
import { ShellComponent } from './shell/shell.component';
import { ShowsComponent } from './shows/shows.component';
import { ScreenDesignerComponent } from './screens/screen-designer.component';
import { ScreenDetailComponent } from './screens/screen-detail.component';
import { ScreensComponent } from './screens/screens.component';
import { SignInComponent } from './sign-in/sign-in.component';

export const routes: Routes = [
  { path: 'sign-in', title: 'Sign in · ThiraiHub admin', component: SignInComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: 'shows', title: 'Shows · ThiraiHub admin', component: ShowsComponent },
      { path: 'screens', title: 'Screens and seats · ThiraiHub admin', component: ScreensComponent },
      { path: 'screens/:screenId', title: 'Screen · ThiraiHub admin', component: ScreenDetailComponent },
      { path: 'screens/:screenId/edit', title: 'Build layout · ThiraiHub admin', component: ScreenDesignerComponent },
      { path: '', pathMatch: 'full', redirectTo: 'shows' },
    ],
  },
  { path: '**', redirectTo: '' },
];
