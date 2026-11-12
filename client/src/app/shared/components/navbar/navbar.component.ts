import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import { LocationService } from '../../../core/services/location.service';
import { NotificationService } from '../../../core/services/notification.service';
import { TimeAgoPipe } from '../../pipes/date.pipes';
import { LogoMarkComponent } from '../logo-mark/logo-mark.component';

@Component({
  selector: 'app-navbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LogoMarkComponent, TimeAgoPipe],
  template: `
    <header class="navbar">
      <div class="container inner">
        <a class="brand" routerLink="/" (click)="closeAll()">
          <app-logo-mark [width]="42" />
          <span class="brand-text">ThiraiHub</span>
        </a>

        <nav class="links" [class.sub-page]="!isTopLevel()" aria-label="Main">
          <a routerLink="/movies" routerLinkActive="active" (click)="closeAll()">Movies</a>
          <a routerLink="/resale" routerLinkActive="active" (click)="closeAll()">Resale</a>
          @if (auth.isLoggedIn()) {
            <a routerLink="/my-bookings" routerLinkActive="active" (click)="closeAll()">My Bookings</a>
          }
        </nav>

        <div class="actions">
          <a class="icon-btn" routerLink="/search" routerLinkActive="active" aria-label="Search" (click)="closeAll()">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </a>

          @if (location.city(); as city) {
            <button type="button" class="city-btn" aria-label="Change city" (click)="location.openPicker()">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                <path
                  d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
                <circle cx="12" cy="9.5" r="2.5" fill="currentColor" />
              </svg>
              <span class="city-name">{{ city }}</span>
            </button>
          }

          @if (auth.isLoggedIn()) {
            <button
              type="button"
              class="icon-btn bell"
              [attr.aria-label]="'Notifications'"
              (click)="toggleNotifications($event)"
            >
              🔔
              @if (notifications.unreadCount() > 0) {
                <span class="dot-badge">{{ notifications.unreadCount() }}</span>
              }
            </button>

            <button type="button" class="avatar" (click)="toggleAccount($event)" aria-label="Account">
              @if (auth.user()?.profileImageUrl; as photo) {
                <img [src]="photo" alt="" />
              } @else {
                {{ auth.initials() }}
              }
            </button>
          } @else {
            <a class="btn btn-sm" routerLink="/sign-in" (click)="closeAll()">Sign in</a>
          }

        </div>
      </div>

      @if (notificationsOpen()) {
        <div class="dropdown notifications">
          <div class="dropdown-head">
            <strong>Notifications</strong>
            <button type="button" class="btn btn-ghost btn-sm" (click)="markAllRead()">Mark all read</button>
          </div>
          <div class="dropdown-body">
            @if (notifications.notifications().length === 0) {
              <p class="text-sm text-muted">No notifications yet.</p>
            }
            @for (item of notifications.notifications(); track item.id) {
              <a
                class="notification"
                [class.unread]="!item.isRead"
                [routerLink]="item.link ?? '/'"
                (click)="closeAll()"
              >
                <strong class="text-sm">{{ item.title }}</strong>
                <span class="text-xs text-muted">{{ item.body }}</span>
                <span class="text-xs text-muted">{{ item.createdAt | timeAgo }}</span>
              </a>
            }
          </div>
        </div>
      }

      @if (accountOpen()) {
        <div class="dropdown account">
          <div class="dropdown-head column">
            <strong>{{ auth.displayName() }}</strong>
            <span class="text-xs text-muted">{{ auth.user()?.phoneNumber }}</span>
          </div>
          <a routerLink="/profile" (click)="closeAll()">My profile</a>
          <a routerLink="/wallet" (click)="closeAll()">Wallet</a>
          <a routerLink="/settings" (click)="closeAll()">Settings</a>
          <button type="button" class="logout" (click)="logout()">Sign out</button>
        </div>
      }
    </header>
  `,
  styles: `
    /* The host is what sticks: its parent is the whole page, so the bar stays at the top while the page scrolls. */
    :host {
      display: block;
      position: sticky;
      top: 0;
      z-index: 120;
    }

    .navbar {
      position: relative;
      z-index: 120;
      background: var(--nav-bg);
      backdrop-filter: var(--glass-blur);
      -webkit-backdrop-filter: var(--glass-blur);
      border-bottom: 1px solid var(--glass-edge);
    }

    .inner {
      height: var(--nav-height);
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .brand { display: flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; flex-shrink: 0; }
    .brand:hover { text-decoration: none; }

    .city-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
    }

    .city-btn:hover { background: var(--surface-2); }

    .brand-text { color: #E5484D; text-transform: lowercase; font-weight: 800; font-size: 1.08rem; letter-spacing: -0.02em; }

    .links { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }

    .links a {
      padding: 8px 12px;
      border-radius: 999px;
      color: var(--text-soft);
      font-size: 0.9rem;
      font-weight: 500;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    .links a:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }
    .links a.active { background: var(--brand-soft); color: var(--text); }


    .actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }

    .bell { position: relative; font-size: 1rem; }

    .dot-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: var(--hot);
      color: var(--on-primary);
      font-size: 0.65rem;
      font-weight: 700;
      display: grid;
      place-items: center;
    }

    .dropdown {
      position: absolute;
      right: 20px;
      top: calc(var(--nav-height) + 6px);
      width: min(360px, calc(100vw - 28px));
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
      animation: pop-in 150ms ease;
    }

    .dropdown-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border-soft);
    }

    .dropdown-head.column { flex-direction: column; align-items: flex-start; gap: 4px; }

    .dropdown-body { max-height: 380px; overflow-y: auto; }

    .dropdown a,
    .dropdown .logout {
      display: block;
      width: 100%;
      text-align: left;
      padding: 11px 14px;
      color: var(--text-soft);
      background: none;
      border: none;
      border-bottom: 1px solid var(--border-soft);
      cursor: pointer;
      font-size: 0.9rem;
    }

    .dropdown a:hover,
    .dropdown .logout:hover { background: var(--surface-2); color: var(--text); text-decoration: none; }

    .notification { display: flex; flex-direction: column; gap: 2px; }
    .notification.unread { background: color-mix(in srgb, var(--accent) 8%, transparent); }

    /* On a phone the links drop below the bar as a row of buttons, so nothing hides behind a menu. */
    @media (max-width: 900px) {
      .inner { height: auto; min-height: var(--nav-height); flex-wrap: wrap; row-gap: 0; }
      .brand { min-height: var(--nav-height); }
      .links {
        order: 3;
        flex: 0 0 100%;
        gap: 6px;
        padding: 0 0 10px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .links::-webkit-scrollbar { display: none; }
      .links a {
        flex: 1 0 auto;
        justify-content: center;
        padding: 8px 10px;
        border: 1px solid var(--border);
        background: var(--surface);
        font-size: 0.82rem;
      }
      .links a.active { background: var(--brand); border-color: var(--brand); color: var(--on-primary); }
      /* Only the main tabs show the button row; any page opened from one of them hides it. */
      .links.sub-page { display: none; }
    }

    @media (max-width: 520px) {
      .inner { gap: 8px; }
      .actions { gap: 6px; }
      .brand-text { font-size: 1rem; }
      .city-name { display: none; }
      .city-btn { padding: 0 10px; }
    }

    /* Very narrow phones: the city is a single value, so its pin steps aside to keep the icons on one row. */
    @media (max-width: 360px) {
      .city-btn { display: none; }
      .links a { padding: 8px 8px; font-size: 0.78rem; }
    }
  `,
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  readonly notifications = inject(NotificationService);
  readonly location = inject(LocationService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly notificationsOpen = signal(false);
  readonly accountOpen = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** True on the home page and the four main tabs themselves, not on pages opened from them. */
  readonly isTopLevel = computed(() => {
    const path = this.url().split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    return ['/', '/movies', '/resale', '/my-bookings', '/my-bookings/theatres', '/resale/sell', '/resale/sell/listings'].includes(path);
  });

  constructor() {
    if (this.auth.isLoggedIn()) {
      this.notifications.load().subscribe({ error: () => undefined });
    }
  }

  toggleNotifications(event: Event): void {
    event.stopPropagation();
    this.accountOpen.set(false);
    this.notificationsOpen.update((open) => !open);
    if (this.notificationsOpen() && this.notifications.notifications().length === 0) {
      this.notifications.load().subscribe({ error: () => undefined });
    }
  }

  toggleAccount(event: Event): void {
    event.stopPropagation();
    this.notificationsOpen.set(false);
    this.accountOpen.update((open) => !open);
  }

  closeAll(): void {
    this.notificationsOpen.set(false);
    this.accountOpen.set(false);
  }

  markAllRead(): void {
    this.notifications.markAllRead().subscribe({ error: () => undefined });
  }

  logout(): void {
    this.closeAll();
    this.auth.logout();
    this.router.navigateByUrl('/');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.notificationsOpen.set(false);
      this.accountOpen.set(false);
    }
  }
}
