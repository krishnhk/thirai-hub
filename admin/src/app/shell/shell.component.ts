import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AdminStore } from '../core/admin-store';
import { AuthService } from '../core/auth.service';
import { LayoutDrafts } from '../core/layout-drafts';
import { ToastService } from '../core/toast.service';

/**
 * The frame every signed-in page sits in: a dark navigation sidebar with the account, a top bar with the theatre and
 * today's date, and the page. On phones the sidebar folds into a two-row header: brand and sign out, then the sections.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app" [class.collapsed]="collapsed()">
      <aside class="sidebar" [class.collapsed]="collapsed()">
        <div class="brand">
          <button
            type="button"
            class="logo-tile"
            (click)="toggleCollapsed()"
            [attr.aria-label]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
            [attr.data-tip]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          >
            <svg viewBox="4 12 56 40" focusable="false">
              <path d="M10 16h44a3 3 0 0 1 3 3v8a5 5 0 0 0 0 10v8a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3v-8a5 5 0 0 0 0-10v-8a3 3 0 0 1 3-3z" fill="var(--brand)" />
              <path d="M20 25l12 7-12 7z" fill="var(--on-primary)" />
              <path d="M44 20v24" stroke="var(--on-primary)" stroke-width="2.4" stroke-dasharray="3.5 3.5" />
            </svg>
          </button>
          <span class="brand-name">
            ThiraiHub
            <small class="brand-sub">Theatre admin</small>
            <small class="brand-theatre">{{ theatreName() }}</small>
          </span>
          <button type="button" class="collapse-btn" (click)="toggleCollapsed()" [attr.aria-expanded]="!collapsed()" aria-label="Collapse sidebar" title="Collapse sidebar">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          @if (store.theatre()?.logoUrl; as logo) {
            <span class="theatre-logo phone-only" aria-hidden="true"><img [src]="logo" alt="" /></span>
          }
          <button class="icon-btn phone-only" type="button" (click)="signOut()" aria-label="Sign out" title="Sign out">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l-4 4 4 4M6 12h10" /></svg>
          </button>
        </div>

        <nav class="nav" aria-label="Admin sections">
          <span class="nav-group">Operations</span>
          <a class="nav-link" routerLink="/shows" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }" data-tip="Shows">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
            <span>Shows</span>
          </a>
          <a class="nav-link" routerLink="/screens" routerLinkActive="on" data-tip="Screens and seats">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7c5-2.5 11-2.5 16 0" /><rect x="5" y="11" width="4" height="3.5" rx="1" /><rect x="10" y="11" width="4" height="3.5" rx="1" /><rect x="15" y="11" width="4" height="3.5" rx="1" /><rect x="5" y="16.5" width="4" height="3.5" rx="1" /><rect x="10" y="16.5" width="4" height="3.5" rx="1" /><rect x="15" y="16.5" width="4" height="3.5" rx="1" /></svg>
            <span>Screens and seats</span>
          </a>
        </nav>

        <div class="account">
          <span class="avatar" aria-hidden="true">TA</span>
          <div class="account-text">
            <strong>Theatre admin</strong>
            <small class="num">+91 ••••{{ auth.maskedPhone }}</small>
          </div>
          <button class="signout" type="button" (click)="signOut()" aria-label="Sign out" data-tip="Sign out">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l-4 4 4 4M6 12h10" /></svg>
          </button>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <div class="venue">
            <span class="venue-icon" aria-hidden="true">
              @if (store.theatre()?.logoUrl; as logo) {
                <img [src]="logo" alt="" />
              } @else {
                <svg viewBox="0 0 24 24"><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-6h6v6" /></svg>
              }
            </span>
            <div class="venue-text">
              <small>Theatre</small>
              <strong>{{ theatreName() }}</strong>
            </div>
          </div>
          <div class="top-right">
            <span class="today num">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
              {{ today }}
            </span>
            <span class="top-avatar" aria-hidden="true">TA</span>
          </div>
        </header>

        <main class="content">
          @if (store.ready()) {
            <router-outlet />
          } @else {
            <div class="loading" role="status">Loading your theatre…</div>
          }
        </main>
      </div>
    </div>
  `,
  styles: `
    .app { display: grid; grid-template-columns: 208px minmax(0, 1fr); min-height: 100dvh; }
    svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .sidebar {
      position: sticky; top: 0; z-index: 6;
      height: 100dvh;
      display: flex; flex-direction: column; gap: 18px;
      padding: 14px 10px;
      background: var(--brand);
      color: var(--on-primary);
    }
    .brand { display: flex; align-items: center; gap: 9px; padding: 2px 4px; }
    .logo-tile { position: relative; flex-shrink: 0; display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: var(--on-primary); }
    .logo-tile svg { width: 24px; height: auto; stroke: none; }
    .logo-tile path:last-child { stroke: var(--on-primary); }
    .brand-name { min-width: 0; font-weight: 700; font-size: 0.94rem; line-height: 1.15; letter-spacing: -0.01em; }
    .brand-name small { display: block; font-size: 0.68rem; font-weight: 500; letter-spacing: 0; opacity: 0.6; }
    .brand-theatre { display: none !important; }
    .nav { display: flex; flex-direction: column; gap: 2px; }
    .nav-group { display: block; padding: 0 9px; margin-bottom: 5px; font-size: 0.63rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.45; }
    .nav-link {
      position: relative;
      display: flex; align-items: center; gap: 9px;
      min-height: 35px; padding: 5px 9px;
      border-radius: var(--radius);
      color: rgba(255, 255, 255, 0.72);
      font-size: 0.84rem; font-weight: 600;
      text-decoration: none;
    }
    .nav-link svg { width: 17px; height: 17px; flex-shrink: 0; }
    .nav-link:hover { background: rgba(255, 255, 255, 0.06); color: var(--on-primary); }
    .nav-link.on { background: rgba(255, 255, 255, 0.1); color: var(--on-primary); }
    .nav-link.on::before { content: ''; position: absolute; left: -10px; top: 8px; bottom: 8px; width: 3px; border-radius: 0 3px 3px 0; background: #8aa6ff; }
    .account { margin-top: auto; display: flex; align-items: center; gap: 9px; padding: 9px; border-radius: var(--radius-lg); background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.06); }
    .avatar, .top-avatar { flex-shrink: 0; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; font-size: 0.7rem; font-weight: 700; }
    .avatar { background: #8aa6ff; color: var(--brand); }
    .account-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .account-text strong { font-size: 0.8rem; }
    .account-text small { font-size: 0.72rem; opacity: 0.6; }
    .signout, .icon-btn { position: relative; flex-shrink: 0; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: var(--radius); background: transparent; color: var(--on-primary); }
    .signout:hover, .icon-btn:hover { background: rgba(255, 255, 255, 0.1); }
    .signout svg, .icon-btn svg { width: 18px; height: 18px; }
    .phone-only { display: none; }
    .collapse-btn { flex-shrink: 0; margin-left: auto; display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: var(--radius); background: rgba(255, 255, 255, 0.08); color: var(--on-primary); }
    .collapse-btn:hover { background: rgba(255, 255, 255, 0.16); }
    .collapse-btn svg { width: 16px; height: 16px; stroke-width: 2; }

    .main { min-width: 0; display: flex; flex-direction: column; }
    .topbar {
      position: sticky; top: 0; z-index: 4;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      height: 60px; padding: 0 clamp(16px, 3vw, 32px);
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
    }
    .venue { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .venue-icon, .theatre-logo { flex-shrink: 0; display: grid; place-items: center; width: 40px; height: 40px; padding: 5px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border); color: var(--text-soft); }
    .venue-icon img, .theatre-logo img { width: 100%; height: 100%; object-fit: contain; }
    .theatre-logo { width: 34px; height: 34px; padding: 4px; border: 0; }
    .sidebar .theatre-logo { display: none; }
    .venue-icon svg { width: 18px; height: 18px; }
    .venue-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
    .venue-text small { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
    .venue-text strong { font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .top-right { display: flex; align-items: center; gap: 14px; }
    .today { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; background: var(--surface-2); font-size: 0.82rem; font-weight: 600; color: var(--text-soft); }
    .today svg { width: 15px; height: 15px; color: var(--text-muted); }
    .top-avatar { background: var(--brand); color: var(--on-primary); }
    .content { flex: 1; min-width: 0; width: 100%; padding: 28px clamp(16px, 3vw, 32px) 56px; }
    .loading { padding: 60px 0; text-align: center; color: var(--text-muted); }

    /* Tooltips for the logo, the rail icons and sign out */
    .logo-tile::after,
    .sidebar.collapsed .nav-link::after,
    .sidebar.collapsed .signout::after {
      content: attr(data-tip);
      position: absolute; left: calc(100% + 14px); top: 50%; transform: translateY(-50%);
      padding: 6px 10px; border-radius: var(--radius);
      background: var(--brand); color: var(--on-primary); box-shadow: var(--shadow-lg);
      font-size: 0.8rem; font-weight: 600; white-space: nowrap;
      opacity: 0; pointer-events: none; transition: opacity 120ms ease;
    }
    .logo-tile:hover::after, .logo-tile:focus-visible::after,
    .sidebar.collapsed .nav-link:hover::after, .sidebar.collapsed .nav-link:focus-visible::after,
    .sidebar.collapsed .signout:hover::after { opacity: 1; }
    .logo-tile:focus-visible { outline: 2px solid var(--on-primary); outline-offset: 2px; }
    /* Expanded, the logo is only the logo: no click and no tooltip */
    .sidebar:not(.collapsed) .logo-tile { pointer-events: none; cursor: default; }

    @media (min-width: 900px) {
      .app.collapsed { grid-template-columns: 68px minmax(0, 1fr); }
      .sidebar.collapsed { padding: 16px 10px; }
      .sidebar.collapsed .brand { justify-content: center; padding: 2px 0; }
      .sidebar.collapsed .brand-name,
      .sidebar.collapsed .nav-group,
      .sidebar.collapsed .account-text,
      .sidebar.collapsed .avatar,
      .sidebar.collapsed .collapse-btn,
      .sidebar.collapsed .nav-link span { display: none; }
      .sidebar.collapsed .nav-link { justify-content: center; padding: 8px 0; }
      .sidebar.collapsed .nav-link.on::before { left: -10px; }
      .sidebar.collapsed .account { justify-content: center; padding: 6px 0; background: none; border: 0; }
    }

    /* Phones: a two-row header with the brand and sign out, then the sections */
    @media (max-width: 899px) {
      .app { grid-template-columns: minmax(0, 1fr); }
      .sidebar { position: sticky; top: 0; z-index: 5; height: auto; gap: 12px; padding: 12px 14px; }
      .brand { padding: 0; }
      .brand-sub { display: none !important; }
      .brand-theatre { display: block !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .collapse-btn, .account, .nav-group, .topbar { display: none; }
      .phone-only { display: grid; }
      .phone-only:first-of-type { margin-left: auto; }
      .brand .phone-only { margin-left: 0; }
      .brand-name { flex: 1; }
      .sidebar .theatre-logo { display: grid; }
      .nav { flex-direction: row; gap: 4px; padding: 3px; border-radius: var(--radius); background: rgba(255, 255, 255, 0.06); }
      .nav-link { flex: 1; justify-content: center; min-height: 34px; padding: 6px 8px; font-size: 0.84rem; }
      .nav-link span { white-space: nowrap; }
      .nav-link.on { background: var(--on-primary); color: var(--brand); }
      .nav-link.on::before { display: none; }
      .content { padding: 20px 14px 48px; }
    }
  `,
})
export class ShellComponent implements OnInit {
  readonly store = inject(AdminStore);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly drafts = inject(LayoutDrafts);

  /** Whether the sidebar is folded to an icon rail on wide screens. */
  readonly collapsed = signal(false);

  /** Today's date, shown in the top bar. */
  readonly today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  ngOnInit(): void {
    this.store.load();
  }

  theatreName(): string {
    return this.store.theatre()?.name ?? 'Your theatre';
  }

  toggleCollapsed(): void {
    this.collapsed.update((value) => !value);
  }

  signOut(): void {
    this.auth.signOut();
    this.drafts.clearAll();
    this.toast.show('Signed out.');
    void this.router.navigateByUrl('/sign-in');
  }
}
