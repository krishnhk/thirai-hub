import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Only a signed-in admin can open the admin pages. */
export const authGuard: CanActivateFn = () => {
  if (inject(AuthService).signedIn()) return true;
  return inject(Router).createUrlTree(['/sign-in']);
};
