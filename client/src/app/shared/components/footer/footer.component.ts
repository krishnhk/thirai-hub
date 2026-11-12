import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { LogoMarkComponent } from '../logo-mark/logo-mark.component';

interface FooterLink {
  label: string;
  path: string;
}

/**
 * Site footer: who we are in one line, where to go next, and what the visitor can do with their own
 * account. The account column asks a signed-out visitor to sign in instead of listing pages that
 * would only bounce them to the login screen.
 */
@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LogoMarkComponent],
  template: `
    <footer class="footer">
      <div class="container inner">
        <div class="brand-block">
          <a class="brand" routerLink="/">
            <app-logo-mark [width]="40" />
            <span class="brand-text">ThiraiHub</span>
          </a>
          <p class="tagline">Book seats at the theatre price. Can't make it? Sell them to someone who can.</p>
        </div>

        <nav class="col" aria-label="Explore">
          <h2>Explore</h2>
          @for (link of explore; track link.path) {
            <a [routerLink]="link.path">{{ link.label }}</a>
          }
        </nav>

        <nav class="col" aria-label="Your account">
          <h2>Your account</h2>
          @if (auth.isLoggedIn()) {
            @for (link of account; track link.path) {
              <a [routerLink]="link.path">{{ link.label }}</a>
            }
          } @else {
            <a routerLink="/sign-in">Sign in</a>
            <a routerLink="/sign-in">Create an account</a>
          }
        </nav>
      </div>

      <div class="container legal">
        <span>© 2026 ThiraiHub</span>
        <span>Demo build · payments are simulated</span>
      </div>
    </footer>
  `,
  styles: `
    .footer {
      margin-top: 48px;
      border-top: 1px solid var(--border-soft);
      background: var(--surface-2);
    }

    .inner {
      display: grid;
      grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr));
      gap: 32px;
      padding-top: 36px;
      padding-bottom: 28px;
    }

    .brand-block {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      max-width: 360px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text);
      text-decoration: none;
    }

    .brand:hover { text-decoration: none; }
    .brand-text { color: #E5484D; text-transform: lowercase; font-weight: 800; font-size: 1.1rem; letter-spacing: -0.02em; }

    .tagline { margin: 0; color: var(--text-soft); font-size: 0.9rem; line-height: 1.55; }

    .col {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 9px;
    }

    .col h2 {
      margin: 0 0 4px;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .col a {
      color: var(--text);
      font-size: 0.92rem;
      text-decoration: none;
    }

    .col a:hover { color: var(--accent); text-decoration: underline; }

    .col a:focus-visible,
    .brand:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }

    .legal {
      display: flex;
      justify-content: space-between;
      gap: 8px 16px;
      flex-wrap: wrap;
      padding-top: 16px;
      padding-bottom: 20px;
      border-top: 1px solid var(--border-soft);
      color: var(--text-muted);
      font-size: 0.78rem;
    }

    @media (max-width: 720px) {
      .inner { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .brand-block { grid-column: 1 / -1; max-width: none; }
    }
  `,
})
export class FooterComponent {
  readonly auth = inject(AuthService);

  readonly explore: FooterLink[] = [
    { label: 'Movies', path: '/movies' },
    { label: 'Resale marketplace', path: '/resale' },
    { label: 'Sell tickets', path: '/resale/sell' },
  ];

  readonly account: FooterLink[] = [
    { label: 'My bookings', path: '/my-bookings' },
    { label: 'Wallet', path: '/wallet' },
    { label: 'Notifications', path: '/notifications' },
    { label: 'Settings', path: '/settings' },
  ];
}
