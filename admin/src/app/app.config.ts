import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { AdminApi } from './core/admin-api';
import { MockAdminApi } from './core/mock-admin-api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // The prototype keeps data in memory. The real app provides an HTTP implementation of AdminApi instead.
    { provide: AdminApi, useClass: MockAdminApi },
  ],
};
