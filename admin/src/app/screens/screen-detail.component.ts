import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AdminStore } from '../core/admin-store';
import { categoriesOf, coupleSet, isCategory } from '../core/layout';
import { LayoutDrafts } from '../core/layout-drafts';
import { Screen } from '../core/models';
import { SeatMapComponent } from '../shared/seat-map.component';

/**
 * One screen's details: its seat map, how many seats it has, and each seat type with its price. Editing the layout is a
 * separate step, opened from "Edit layout".
 */
@Component({
  selector: 'app-screen-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SeatMapComponent],
  template: `
    @if (current(); as s) {
      <header class="page-header">
        <div>
          <nav class="crumbs" aria-label="Breadcrumb"><span><a routerLink="/screens">Screens and seats</a></span><span>{{ s.name }}</span></nav>
          <h1>{{ s.name }} <span class="type-tag" [class.regular]="s.type === 'Regular'">{{ s.type }}</span></h1>
          <p class="lede">The seat map customers book from, and the default price of each category.</p>
        </div>
        <div class="header-actions">
          <a class="btn primary" [routerLink]="['/screens', s.id, 'edit']">Edit layout</a>
        </div>
      </header>

      @if (drafts.isUnsaved(s)) {
        <p class="notice" role="status">
          You have unsaved changes for this screen. <a [routerLink]="['/screens', s.id, 'edit']">Continue editing</a>
        </p>
      }

      <div class="kpi-bar facts" role="list" aria-label="Screen summary">
        <div class="kpi" role="listitem"><span>Seats on sale</span><b class="num">{{ seatCount() }}</b></div>
        <div class="kpi" role="listitem"><span>Rows</span><b class="num">{{ s.layout.cells.length }}</b></div>
        <div class="kpi" role="listitem"><span>Categories</span><b class="num">{{ rows().length }}</b></div>
        <div class="kpi" role="listitem"><span>Price range</span><b class="num">{{ priceRange() }}</b></div>
      </div>

      <section class="card map-card" [attr.aria-label]="'Seat map of ' + s.name">
        <header class="card-head"><h2>Seat map</h2><span class="muted small">As customers see it</span></header>
        <div class="seat-scroll">
          <app-seat-map [layout]="s.layout" [editing]="false" />
        </div>
      </section>

      <section class="card types-card">
        <header class="card-head"><h2>Categories and prices</h2><span class="muted small">Default prices, changeable per show</span></header>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Seat type</th>
                <th scope="col">Seats</th>
                <th scope="col">Price (₹)</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.name) {
                <tr>
                  <td><span class="type"><span class="dot {{ r.style }}" aria-hidden="true"></span><strong>{{ r.name }}</strong></span></td>
                  <td class="muted">{{ r.look }}</td>
                  <td class="num">{{ r.seats }}</td>
                  <td class="num">{{ r.price ?? 'Not set' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="muted">No categories yet. Edit the layout to add one.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else {
      <section class="card empty"><p class="muted">Loading this screen…</p></section>
    }
  `,
  styles: `
    .header-actions .btn { text-decoration: none; }
    .notice { margin: 0 0 16px; padding: 10px 14px; border-radius: var(--radius); background: var(--warning-soft); color: var(--warning); font-size: 0.88rem; }
    .notice a { font-weight: 700; color: inherit; }
    .card-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 12px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
    .card-head h2 { font-size: 0.98rem; }
    .small { font-size: 0.82rem; }
    .map-card .seat-scroll { overflow-x: auto; margin: 16px; padding: 16px 10px 12px; border-radius: var(--radius-lg); background: var(--surface-2); }
    .types-card { margin-top: 16px; overflow: hidden; }
    .types-card .data-table td:first-child, .types-card .data-table th:first-child { padding-left: 18px; }
    .type { display: inline-flex; align-items: center; gap: 10px; }
    .empty { padding: 28px; }
  `,
})
export class ScreenDetailComponent {
  /** The screen to show, from the route. */
  readonly screenId = input.required<string>();

  readonly store = inject(AdminStore);
  readonly drafts = inject(LayoutDrafts);
  private readonly router = inject(Router);

  readonly id = computed(() => Number(this.screenId()));
  readonly current = computed<Screen | null>(() => this.store.screens().find((s) => s.id === this.id()) ?? null);

  /** The seat types of the screen, with how many seats use each and its price. */
  readonly rows = computed(() => {
    const s = this.current();
    if (!s) return [];
    const layout = s.layout;
    const couples = coupleSet(layout);
    const counts: Record<string, number> = {};
    const coupled: Record<string, number> = {};
    layout.cells.forEach((row, r) => row.forEach((v, c) => {
      if (!isCategory(v)) return;
      counts[v] = (counts[v] ?? 0) + 1;
      if (couples.has(`${r},${c}`)) coupled[v] = (coupled[v] ?? 0) + 1;
    }));
    return categoriesOf(layout).map((c) => ({
      name: c.name,
      style: c.style,
      look: seatTypeOf(coupled[c.name] ?? 0, counts[c.name] ?? 0),
      seats: counts[c.name] ?? 0,
      price: layout.prices[c.name] ?? null,
    })).filter((r) => r.seats > 0);
  });

  /** The lowest and highest default price of the categories in use, such as "₹180–450". */
  readonly priceRange = computed(() => {
    const prices = this.rows().map((r) => r.price).filter((p): p is number => p !== null);
    if (!prices.length) return '—';
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    return lo === hi ? `₹${lo}` : `₹${lo}–${hi}`;
  });

  /** The seats a screen sells: its seat-type cells, not aisles or unavailable seats. */
  readonly seatCount = computed(() => {
    const s = this.current();
    return s ? s.layout.cells.reduce((n, row) => n + row.filter((v) => isCategory(v)).length, 0) : 0;
  });

  constructor() {
    // A screen that does not exist (or no longer does) goes back to the list.
    effect(() => {
      const ready = this.store.ready();
      const missing = !this.current();
      untracked(() => {
        if (ready && missing) void this.router.navigateByUrl('/screens');
      });
    });
  }
}

/** The seat type of a category: Single, Couple, or Mixed when some of its seats are joined in pairs. */
function seatTypeOf(coupled: number, total: number): string {
  if (total === 0 || coupled === 0) return 'Single';
  return coupled === total ? 'Couple' : 'Mixed';
}
