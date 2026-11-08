import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AdminStore } from '../core/admin-store';
import { categoriesOf, categoriesUsed, copyLayout, coupleSet, countSeats, isCategory, lonePartners, remapCouples, rowLabel, rowNameOf } from '../core/layout';
import { LayoutDrafts, sameLayout } from '../core/layout-drafts';
import { CategoryDef, CategoryStyle, CellValue, MIN_PRICE, Screen, SeatLayout } from '../core/models';
import { ToastService } from '../core/toast.service';
import { CellPoint, SeatMapComponent } from '../shared/seat-map.component';
import { SelectFieldComponent, SelectOption } from '../shared/select-field.component';

/** The looks a seat type can have, with the names the admin sees. */
const LOOKS: { key: CategoryStyle; label: string }[] = [
  { key: 'regular', label: 'Single' },
  { key: 'couple', label: 'Couple' },
];

/** The steps a layout is built in. */
const STEPS = [
  { n: 1, title: 'Categories', sub: 'Name and price', hint: '' },
  { n: 2, title: 'Shape', sub: 'Rows and categories', hint: '' },
  { n: 3, title: 'Seats', sub: 'Aisles, single or couple', hint: '' },
] as const;

type Step = 1 | 2 | 3;

/**
 * The layout builder for one screen, opened from the screens list. The layout is built in three steps: shape, seat
 * types, prices. Unsaved work is kept when the admin leaves, so coming back finds it.
 */
@Component({
  selector: 'app-screen-designer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, SeatMapComponent, SelectFieldComponent],
  template: `
    @if (current(); as screen) {
      <header class="page-header">
        <div>
          <nav class="crumbs" aria-label="Breadcrumb">
            <span><a routerLink="/screens">Screens and seats</a></span>
            <span><a [routerLink]="['/screens', id()]">{{ screen.name }}</a></span>
            <span>Edit layout</span>
          </nav>
          <h1>Edit layout</h1>
          <p class="lede num">{{ stats().seats }} seats · {{ stats().aisles }} aisles · {{ stats().blocked }} unavailable · {{ rowCount() }} rows</p>
        </div>
        <div class="segmented" role="group" aria-label="View">
          <button type="button" [attr.aria-pressed]="mode() === 'edit'" (click)="mode.set('edit')">Build</button>
          <button type="button" [attr.aria-pressed]="mode() === 'customer'" (click)="setCustomerMode()">Preview</button>
        </div>
      </header>

      <section class="card designer">

        @if (mode() === 'edit') {
          <nav class="stepper" aria-label="Layout steps">
            <p class="step-count">Step {{ step() }} of {{ steps.length }} <b>· {{ steps[step() - 1].title }}</b></p>
            <ol class="bars">
              @for (s of steps; track s.n) {
                <li>
                  <button type="button" [class.on]="s.n <= step()" [attr.aria-current]="s.n === step() ? 'step' : null" [attr.aria-label]="'Go to step ' + s.n + ': ' + s.title" (click)="goTo(s.n)"></button>
                </li>
              }
            </ol>
          </nav>

          <div class="step-body">
            @if (step() === 1) {
              <section class="cats" aria-label="Categories">
                <div class="cats-head">
                  <div class="cats-title">
                    <p class="section-label">Categories on this screen</p>
                    <p class="step-hint">Create the categories this screen sells, such as Regular or Recliner, and set the default price of each.</p>
                  </div>
                  <button class="btn" type="button" [disabled]="addingCategory()" (click)="addingCategory.set(true)">+ Add category</button>
                </div>
                <div class="cat-head" aria-hidden="true"><span></span><span>Category</span><span>Price</span><span>Seats</span><span></span></div>
                <ul class="cat-list">
                  @for (c of categories(); track c.name) {
                    <li class="cat-row">
                      <span class="dot {{ c.style }}" aria-hidden="true"></span>
                      <input class="input name" maxlength="20" [value]="c.name" [attr.aria-label]="'Name of ' + c.name" (change)="renameCategory(c.name, $any($event.target).value)" />
                                            <label class="price-input">
                        <span aria-hidden="true">₹</span>
                        <input class="num" type="number" min="50" step="10" [value]="draft().prices[c.name] ?? 0" [attr.aria-label]="'Price of ' + c.name" (input)="setPrice(c.name, $any($event.target).value)" />
                      </label>
                      <span class="muted small num">{{ usage()[c.name] ?? 0 }} seats</span>
                      <button
                        type="button"
                        class="remove"
                        [disabled]="(usage()[c.name] ?? 0) > 0"
                        [attr.title]="(usage()[c.name] ?? 0) > 0 ? 'Used by seats. Erase them in step 2 first.' : 'Remove this category'"
                        [attr.aria-label]="'Remove ' + c.name"
                        (click)="removeCategory(c.name)"
                      >×</button>
                    </li>
                  } @empty {
                    <li class="muted empty-note">No categories yet. Add the first one below.</li>
                  }
                </ul>

                @if (addingCategory()) {
                  <form class="new-cat" (submit)="$event.preventDefault(); createType(newName, newPrice)" novalidate>
                    <input #newName class="input name" maxlength="20" placeholder="Category name, e.g. Sofa" aria-label="New category name" />
                                      <label class="price-input">
                      <span aria-hidden="true">₹</span>
                      <input #newPrice class="num" type="number" min="50" step="10" value="180" aria-label="Price of the new category" />
                    </label>
                    <span class="new-actions">
                      <button class="btn primary" type="submit">Add category</button>
                      <button class="btn ghost" type="button" (click)="addingCategory.set(false)">Cancel</button>
                    </span>
                  </form>
                }
                @if (categoryError()) {
                  <p class="error" role="alert">{{ categoryError() }}</p>
                }
              </section>
            }

            @if (step() === 2) {
              <div class="toolbar" role="toolbar" aria-label="Shape tools">
                <div class="tool-group" role="group" aria-label="Select">
                  <button class="chip" type="button" [attr.aria-pressed]="brush() === 'select-row'" (click)="brush.set('select-row')">Select row</button>
                  <button class="chip" type="button" [attr.aria-pressed]="brush() === 'select-col'" (click)="brush.set('select-col')">Select column</button>
                </div>
                <div class="tool-group" role="group" aria-label="Set category of rows">
                  @for (c of categories(); track c.name) {
                    <button class="chip" type="button" [attr.aria-pressed]="brush() === c.name" [attr.title]="'Click rows on the map to put them in ' + c.name" (click)="brush.set(c.name)"><span class="dot {{ c.style }}" aria-hidden="true"></span>{{ c.name }}</button>
                  }
                </div>
                <div class="tool-group" role="group" aria-label="Add">
                  <button class="step" type="button" (click)="addRow()">+ Row</button>
                  <button class="step" type="button" (click)="addColumn()">+ Column</button>
                </div>
                <div class="selection" role="region" aria-label="Selected row or column">
                  @if (selectedRow() !== null) {
                    <span class="sel-name">Row <b>{{ rowNameAt(selectedRow()!) }}</b></span>
                    <button class="chip danger" type="button" (click)="deleteRow()">Delete row</button>
                    <button class="chip" type="button" (click)="clearSelection()">Clear</button>
                  } @else if (selectedCol() !== null) {
                    <span class="sel-name">Column <b>{{ selectedCol()! + 1 }}</b></span>
                    <button class="chip danger" type="button" (click)="deleteColumn()">Delete column</button>
                    <button class="chip" type="button" (click)="clearSelection()">Clear</button>
                  } @else {
                    <span class="muted">Select a row or column to delete it</span>
                  }
                  @if (renameError()) {
                    <span class="error" role="alert">{{ renameError() }}</span>
                  }
                </div>
              </div>


              <div class="assign-grid">
                              <div class="canvas">
                <div class="seat-scroll">
                  <app-seat-map
                    [layout]="draft()"
                    [editing]="true"
                    [focusRow]="selectedRow()"
                    [focusCol]="selectedCol()"
                    [renaming]="renamingRow()"
                    (renameCommit)="commitRowName($event)"
                    (paint)="paint($event)"
                    (rowPick)="pickRow($event)" (rowMove)="moveRow($event.from, $event.name, $event.before)"
                  />
                </div>
              </div>
              </div>
            }

            @if (step() === 3) {
              <div class="toolbar" role="toolbar" aria-label="Seats">
                <div class="tool-group" role="group" aria-label="Seat type">
                  <button class="chip" type="button" [attr.aria-pressed]="brush() === 'single'" (click)="brush.set('single')">Single</button>
                  <button class="chip" type="button" [attr.aria-pressed]="brush() === 'couple'" (click)="brush.set('couple')">Couple</button>
                </div>
                <div class="tool-group" role="group" aria-label="Space">
                  <button class="chip" type="button" [attr.aria-pressed]="brush() === 'aisle'" (click)="brush.set('aisle')"><span class="dot aisle" aria-hidden="true"></span>Aisle</button>
                  <button class="chip" type="button" [attr.aria-pressed]="brush() === 'blocked'" (click)="brush.set('blocked')"><span class="dot blocked" aria-hidden="true"></span>Unavailable</button>
                  <button class="chip" type="button" [attr.aria-pressed]="brush() === ''" (click)="brush.set('')"><span class="dot empty" aria-hidden="true"></span>Erase</button>
                </div>
              </div>
              <p class="hint">Choose Single or Couple, then click seats. Couple seats are joined in pairs on the map.</p>


              <div class="canvas">
                <div class="seat-scroll">
                  <app-seat-map [layout]="draft()" [editing]="true" (paint)="paint($event)" (rowPick)="pickRow($event)" (rowMove)="moveRow($event.from, $event.name, $event.before)" />
                </div>
              </div>

              <div class="checks">
                <h4>Before you save</h4>
                @if (issues().length) {
                  <ul class="issues">
                    @for (issue of issues(); track issue) {
                      <li>{{ issue }}</li>
                    }
                  </ul>
                } @else {
                  <p class="ok-text">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    All checks pass.
                  </p>
                }
              </div>
            }
          </div>
        } @else {
          <div class="canvas">
            <p class="canvas-hint">This is the seat map customers see, using the layout here. Tap seats to try a booking. Nothing is sold.</p>
            <div class="seat-scroll">
              <app-seat-map [layout]="draft()" [editing]="false" [selected]="picks()" (pick)="togglePick($event)" />
            </div>
            <ul class="legend" aria-label="Legend">
              <li><span class="dot regular" aria-hidden="true"></span>Available</li>
              <li><span class="dot selected" aria-hidden="true"></span>Your seats</li>
              <li><span class="dot blocked" aria-hidden="true"></span>Unavailable</li>
            </ul>
          </div>
        }

        <footer class="save-bar" [class.dirty]="dirty()">
          <div class="save-state">
            <strong>{{ dirty() ? 'You have unsaved changes' : 'Everything is saved' }}</strong>
            @if (saveError()) {
              <span class="error" role="alert">{{ saveError() }}</span>
            }
          </div>
          <div class="actions">
            @if (dirty()) {
              <button class="btn ghost" type="button" (click)="discard()">Discard</button>
            }
            @if (mode() === 'edit' && step() < 3) {
              @if (step() > 1) {
                <button class="btn" type="button" (click)="goTo(step() - 1)">Back</button>
              }
              <button class="btn primary" type="button" (click)="goTo(step() + 1)">Next: {{ nextTitle() }}</button>
            } @else {
              @if (mode() === 'edit') {
                <button class="btn" type="button" (click)="goTo(2)">Back</button>
              }
              <button class="btn primary" type="button" [disabled]="!dirty()" (click)="save()">Save layout</button>
            }
          </div>
        </footer>
      </section>
    } @else {
      <section class="card empty">
        <p class="muted">Loading this screen…</p>
      </section>
    }
  `,
  styles: `
    @media (max-width: 640px) {
    }
    .designer { padding: 0; min-width: 0; overflow: hidden; display: flex; flex-direction: column; min-height: calc(100dvh - 250px); }
    .designer > .save-bar { margin-top: auto; }
    .card.empty { padding: 28px; }
    .link { border: 0; background: none; padding: 6px 8px; font-weight: 600; color: var(--brand); }
    .segmented button { white-space: nowrap; }
    @media (max-width: 640px) { .track button { padding: 12px 10px; } .step-title { font-size: 0.85rem; } }
    .stepper { display: block; padding: 16px 20px 14px; border-bottom: 1px solid var(--border-soft); }
    .step-count { margin: 0 0 10px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
    .step-count b { font-weight: 700; color: var(--text-soft); letter-spacing: 0.02em; text-transform: none; }
    .cats-title { display: grid; gap: 4px; }
    .step-hint { margin: 0; font-size: 0.9rem; line-height: 1.5; color: var(--text-muted); }
    .bars { display: flex; gap: 8px; list-style: none; margin: 0; padding: 0; }
    .bars li { flex: 1 1 0; min-width: 0; }
    .bars button { display: block; width: 100%; height: 4px; padding: 0; border: 0; border-radius: 999px; background: var(--surface-3); }
    .bars button.on { background: var(--brand); }
    .bars button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .empty-note { padding: 14px; }
    .cats { padding: 16px 20px 8px; overflow-x: auto; }
    .cats > * { min-width: 760px; }
    .cats-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
    .cats-head .section-label { margin: 0; padding: 0; }
    .cats-head .btn { min-height: 32px; padding: 4px 12px; font-size: 0.85rem; color: var(--text-soft); }
    .cats .section-label { padding: 0 0 10px; }
    .cat-head, .cat-row, .new-cat { display: grid; grid-template-columns: 12px 280px 130px 84px 36px; justify-content: start; column-gap: 20px; align-items: center; gap: 10px 12px; }
    .cat-head { padding: 8px 12px; background: var(--surface-2); border: 1px solid var(--border); border-bottom: 0; border-radius: var(--radius) var(--radius) 0 0; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
    .cat-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: 0 0 var(--radius) var(--radius); overflow: hidden; }
    .cat-row { padding: 12px; background: var(--surface); }
    .cat-row + .cat-row { border-top: 1px solid var(--border-soft); }
    .cat-row .price-input { grid-column: 3; }
    .cat-row > .small { grid-column: 4; white-space: nowrap; }
    .cat-row .remove { grid-column: 5; }
    .new-cat { margin-top: 12px; padding: 12px; border-radius: var(--radius); background: var(--surface-2); }
    .new-cat .name { grid-column: 2; }
    .new-cat .price-input { grid-column: 3; }
    .new-cat .new-actions { grid-column: 4 / -1; display: flex; gap: 8px; white-space: nowrap; }
    .type-row { display: grid; grid-template-columns: 12px minmax(160px, 1fr) 190px; align-items: center; gap: 10px 14px; padding: 12px; background: var(--surface); }
    .type-row + .type-row { border-top: 1px solid var(--border-soft); }
    .type-row .looks { grid-column: 3; }
    .cat-name { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
    .assign-grid { display: grid; gap: 16px; align-items: start; padding: 18px 20px 8px; }
    .assign-grid > .canvas { padding: 0; }
    @media (min-width: 1000px) { .assign-grid { grid-template-columns: minmax(0, 1fr) 300px; } }
    .row-panel { padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
    .row-panel .section-label { padding: 0 0 10px; }
    .section-label { margin: 0; padding: 14px 20px 0; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 20px; background: var(--surface); border-bottom: 1px solid var(--border); }
    .tool-group { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .tool-group + .tool-group { padding-left: 10px; border-left: 1px solid var(--border); }
    .selection { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-left: 8px; padding-left: 16px; border-left: 1px solid var(--border); font-size: 0.9rem; color: var(--text-soft); }
    .sel-name { padding: 0 4px; color: var(--text-muted); }
    .sel-name b { color: var(--text); }
    .chip.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
    .chip.danger:hover { background: var(--danger-soft); border-color: var(--danger); }
    .selection .link { padding: 4px 6px; }
    .selection .link-danger { padding: 4px 6px; }
    .canvas { padding: 18px 20px 8px; }
    .canvas-hint { margin: 0 0 14px; font-size: 0.9rem; color: var(--text-muted); }
    .seat-scroll { overflow-x: auto; padding: 18px 12px 14px; border-radius: var(--radius-lg); background: var(--surface-2); }
    .legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 18px; margin: 14px 0 0; padding: 0; list-style: none; font-size: 0.84rem; color: var(--text-muted); }
    .legend li { display: inline-flex; align-items: center; gap: 7px; }
    .type-panel, .checks { margin-top: 18px; padding: 16px; border-radius: var(--radius-lg); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; }
    .type-panel h4, .checks h4 { font-family: var(--font); font-size: 0.82rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
    .price-name { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-soft); }
    .issues { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; color: var(--warning); font-size: 0.92rem; }
    .ok-text { display: inline-flex; align-items: center; gap: 8px; color: var(--success); font-weight: 600; }
    .ok-text svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .small { font-size: 0.84rem; }
    .save-bar { position: sticky; bottom: 0; z-index: 3; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; background: var(--surface); border-top: 1px solid var(--border); }
    .save-bar.dirty .save-state strong { color: var(--warning); }
    .save-state { display: flex; flex-direction: column; gap: 2px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    @media (max-width: 640px) {
      .toolbar, .structure-bar, .canvas, .step-body, .save-bar, .summary { padding-left: 14px; padding-right: 14px; }
      .time-chip { min-width: 0; flex: 1 1 150px; }
      .type-row { grid-template-columns: auto minmax(0, 1fr) auto; }
      .type-row .looks { grid-column: 1 / -1; grid-row: auto; }
      .type-row .seat-count { grid-column: 2; grid-row: auto; justify-self: start; }
      .type-row .remove { grid-column: 3; grid-row: auto; }
      .price-row { grid-template-columns: minmax(0, 1fr) 150px; }
      .price-row > .small { grid-column: 1; }
    }
    @media (max-width: 640px) {
      .cats { padding: 14px; }
      .cats > * { min-width: 0; }
      .cats-head { flex-wrap: wrap; align-items: flex-start; }
      .cat-head { display: none; }
      .cat-row, .new-cat { grid-template-columns: 10px minmax(0, 1fr) 104px 30px; justify-content: stretch; column-gap: 8px; }
      .cat-row > .muted { display: none; }
      .cat-row .remove { grid-column: 4; }
      .tool-group + .tool-group { padding-left: 0; border-left: 0; }
      .new-cat .new-actions { grid-column: 1 / -1; justify-content: flex-end; }
      .cat-list { border-radius: var(--radius); }
    }
  `,
})
export class ScreenDesignerComponent {
  /** The screen to build, from the route. */
  readonly screenId = input.required<string>();

  readonly store = inject(AdminStore);
  private readonly drafts = inject(LayoutDrafts);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly steps = STEPS;
  readonly looks = LOOKS;
  readonly countSeats = countSeats;

  readonly id = computed(() => Number(this.screenId()));
  readonly current = computed<Screen | null>(() => this.store.screens().find((s) => s.id === this.id()) ?? null);

  readonly step = signal<Step>(1);
  readonly nextTitle = computed(() => STEPS.find((s) => s.n === this.step() + 1)?.title ?? '');

  readonly saveError = signal('');
  readonly renameError = signal('');
  readonly categoryError = signal('');
  readonly newLook = signal<CategoryStyle>('regular');
  /** Whether the "new seat type" form is open. */
  readonly creating = signal(false);
  /** Whether the new category form is open. */
  readonly addingCategory = signal(false);

  /** The layout being edited. Changes stay here until the layout is saved. */
  readonly draft = signal<SeatLayout>({ cells: [], prices: {} });
  /** What a click does in the seat map: a seat type name, 'aisle', 'blocked', '' (erase), or a row or column selector. */
  readonly brush = signal<string>('select-row');
  readonly selectedRow = signal<number | null>(null);
  readonly selectedCol = signal<number | null>(null);
  /** The row whose letter is being typed over, if any. */
  readonly renamingRow = signal<number | null>(null);
  readonly mode = signal<'edit' | 'customer'>('edit');
  readonly picks = signal<ReadonlySet<string>>(new Set());

  readonly categories = computed<CategoryDef[]>(() => categoriesOf(this.draft()));
  /** The seat type chosen for painting, or null when a space tool is chosen. */
  readonly selectedType = computed<CategoryDef | null>(() => this.categories().find((c) => c.name === this.brush()) ?? null);
  /** The couple seats of the layout, as "row,col" keys. */
  readonly coupleKeys = computed(() => coupleSet(this.draft()));
  readonly usedCategories = computed(() => categoriesUsed(this.draft()));
  /** Each row with its seat count and the category its seats belong to ("Mixed" when they differ). */
  /** Rows grouped under their category, in category order; rows with mixed seats come last. */
  readonly groups = computed(() => {
    const rows = this.rowSummaries();
    const cats = this.categories();
    const out: { name: string; price: number | null; seats: number; rows: typeof rows }[] = cats.map((c) => {
      const list = rows.filter((r) => r.category === c.name);
      return { name: c.name, price: this.draft().prices[c.name] ?? 0, seats: list.reduce((n, r) => n + r.seats, 0), rows: list };
    });
    const rest = rows.filter((r) => !cats.some((c) => c.name === r.category));
    if (rest.length) out.push({ name: 'Mixed', price: null, seats: rest.reduce((n, r) => n + r.seats, 0), rows: rest });
    return out;
  });
  readonly categoryOptions = computed<SelectOption[]>(() => this.categories().map((c) => ({ value: c.name, label: c.name })));
  readonly rowSummaries = computed(() => {
    const layout = this.draft();
    return layout.cells.map((row, index) => {
      const seatTypes = row.filter(isCategory);
      const names = [...new Set(seatTypes)];
      const category = names.length === 0 ? '' : names.length === 1 ? names[0] : 'Mixed';
      return { index, label: rowNameOf(layout, index), seats: seatTypes.length, category };
    });
  });
  readonly rowCount = computed(() => this.draft().cells.length);

  /** How many cells use each seat type. */
  readonly usage = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const row of this.draft().cells) for (const v of row) if (isCategory(v)) counts[v] = (counts[v] ?? 0) + 1;
    return counts;
  });

  readonly dirty = computed(() => {
    const screen = this.current();
    return !!screen && !sameLayout(this.draft(), screen.layout);
  });

  readonly stats = computed(() => {
    const cells = this.draft().cells;
    let seats = 0;
    let blocked = 0;
    let aisles = 0;
    for (const row of cells) {
      for (const v of row) {
        if (v === 'blocked') blocked++;
        else if (v === 'aisle') aisles++;
        else if (isCategory(v)) seats++;
      }
    }
    return { seats, blocked, aisles, lone: lonePartners(cells, (r, c) => this.coupleKeys().has(`${r},${c}`)) };
  });

  /** Everything that would stop the layout from saving, shown as the admin works. */
  readonly issues = computed(() => {
    const layout = this.draft();
    const out: string[] = [];
    if (countSeats(layout.cells) === 0) out.push('Add at least one seat in step 2.');
    const lone = lonePartners(layout.cells, (r, c) => this.coupleKeys().has(`${r},${c}`));
    if (lone > 0) out.push(`${lone} couple seat${lone === 1 ? '' : 's'} without a partner beside ${lone === 1 ? 'it' : 'them'}. Couple seats come in pairs.`);
    for (const c of this.usedCategories()) {
      if (!((layout.prices[c] ?? 0) >= MIN_PRICE)) out.push(`The ${c} price must be at least ₹${MIN_PRICE}.`);
    }
    return out;
  });

  private loaded = false;

  constructor() {
    // Open the screen's work once it is known: its unsaved changes if it has any, otherwise its saved layout.
    effect(() => {
      const screen = this.current();
      untracked(() => {
        if (screen && !this.loaded) {
          this.loaded = true;
          this.draft.set(copyLayout(this.drafts.get(screen.id) ?? screen.layout));
        } else if (!screen && this.store.ready()) {
          void this.router.navigateByUrl('/screens');
        }
      });
    });

    // Leaving with unsaved changes keeps them; leaving with none clears any old copy.
    inject(DestroyRef).onDestroy(() => {
      const screen = this.current();
      if (!screen) return;
      if (this.dirty()) this.drafts.set(screen.id, this.draft());
      else this.drafts.clear(screen.id);
    });
  }

  goTo(step: number): void {
    const next = Math.min(3, Math.max(1, step)) as Step;
    this.step.set(next);
    if (next === 2) {
      this.brush.set('select-row');
    } else {
      this.clearSelection();
      if (next === 3) this.brush.set('couple');
    }
  }

  rowNameAt(row: number): string {
    return rowNameOf(this.draft(), row);
  }

  styleFor(name: string): CategoryStyle {
    return this.categories().find((c) => c.name === name)?.style ?? 'regular';
  }

  setCustomerMode(): void {
    this.picks.set(new Set());
    this.clearSelection();
    this.mode.set('customer');
  }

  discard(): void {
    const screen = this.current();
    if (!screen) return;
    this.drafts.clear(screen.id);
    this.draft.set(copyLayout(screen.layout));
    this.clearSelection();
    this.saveError.set('');
  }

  paint(cell: CellPoint): void {
    const brush = this.brush();
    if (brush === 'select-row') {
      this.selectRow(cell.row);
      return;
    }
    if (brush === 'select-col') {
      this.selectColumn(cell.col);
      return;
    }
    if (this.step() === 2) {
      // A category tool paints whole rows: click any seat of a row to put the row in that category.
      if (this.categories().some((c) => c.name === brush)) this.assignRow(cell.row, brush);
      return;
    }
    if (this.step() !== 3) return;
    this.draft.update((layout) => {
      const cells = layout.cells.map((row) => [...row]);
      const key = `${cell.row},${cell.col}`;
      const couples = new Set(layout.couples ?? []);
      const current = cells[cell.row]?.[cell.col];
      if (current === undefined) return layout;
      if (brush === 'single' || brush === 'couple') {
        if (isCategory(current)) {
          if (brush === 'couple') couples.add(key);
          else couples.delete(key);
        }
      } else {
        cells[cell.row][cell.col] = brush;
        couples.delete(key);
      }
      return { ...layout, cells, couples: [...couples] };
    });
    this.saveError.set('');
  }

  /** A click on a row letter selects that row only on step 1 with the Select row tool; other tools keep their own action. */
  pickRow(row: number): void {
    // Renaming selects nothing, so it works on every step and with every tool.
    this.clearSelection();
    this.renamingRow.set(row);
  }

  /** Saves a typed row name (or ends the typing when the name is null). */
  commitRowName(event: { row: number; name: string | null }): void {
    if (this.renamingRow() === null) return;
    this.renamingRow.set(null);
    if (event.name === null) return;
    this.renameRow(event.row, event.name);
  }

  selectRow(row: number): void {
    if (this.step() !== 2) this.goTo(2);
    this.selectedRow.set(row);
    this.selectedCol.set(null);
    this.renameError.set('');
  }

  selectColumn(col: number): void {
    this.selectedCol.set(col);
    this.selectedRow.set(null);
    this.renameError.set('');
  }

  clearSelection(): void {
    this.renamingRow.set(null);
    this.selectedRow.set(null);
    this.selectedCol.set(null);
    this.renameError.set('');
  }

  renameRow(row: number, value: string): void {
    const name = value.trim();
    if (!name || name.length > 4) {
      this.renameError.set('Use 1 to 4 characters for a row name.');
      return;
    }
    const layout = this.draft();
    // The same name is no change, so leaving the name box unchanged keeps the layout clean.
    if (name === rowNameOf(layout, row)) {
      this.renameError.set('');
      return;
    }
    const names = layout.cells.map((_, i) => rowNameOf(layout, i));
    names[row] = name;
    if (names.filter((n) => n.toLowerCase() === name.toLowerCase()).length > 1) {
      this.renameError.set('Another row already has that name.');
      return;
    }
    this.renameError.set('');
    this.draft.set({ ...layout, rowNames: names });
    this.saveError.set('');
  }

  deleteRow(): void {
    const row = this.selectedRow();
    const layout = this.draft();
    if (row === null || layout.cells.length <= 1) return;
    this.draft.set({
      ...layout,
      cells: layout.cells.filter((_, i) => i !== row),
      rowNames: layout.rowNames ? layout.rowNames.filter((_, i) => i !== row) : undefined,
      couples: remapCouples(layout.couples, (r, c) => (r === row ? null : [r > row ? r - 1 : r, c])),
    });
    this.afterStructureChange();
  }

  deleteColumn(): void {
    const col = this.selectedCol();
    const layout = this.draft();
    if (col === null || (layout.cells[0]?.length ?? 0) <= 1) return;
    this.draft.set({
      ...layout,
      cells: layout.cells.map((row) => row.filter((_, i) => i !== col)),
      couples: remapCouples(layout.couples, (r, c) => (c === col ? null : [r, c > col ? c - 1 : c])),
    });
    this.afterStructureChange();
  }

  togglePick(cell: CellPoint): void {
    const key = `${cell.row},${cell.col}`;
    const next = new Set(this.picks());
    if (next.has(key)) {
      next.delete(key);
    } else {
      if (next.size >= 8) {
        this.toast.show('A customer can book up to 8 seats at a time.', true);
        return;
      }
      next.add(key);
    }
    this.picks.set(next);
  }

  setPrice(category: string, value: string): void {
    const price = Number(value);
    this.draft.update((layout) => ({ ...layout, prices: { ...layout.prices, [category]: price } }));
    this.saveError.set('');
  }

  setLook(name: string, look: CategoryStyle): void {
    this.draft.update((layout) => ({
      ...layout,
      categories: categoriesOf(layout).map((c) => (c.name === name ? { ...c, style: look } : c)),
    }));
  }

  /** Creates a seat type from the step 2 form, then clears the form. */
  /** Adds a category from the step 2 form: its name, seat type and default price. */
  createType(nameInput: HTMLInputElement, priceInput: HTMLInputElement): void {
    const price = Number(priceInput.value);
    if (!(price >= MIN_PRICE)) {
      this.categoryError.set(`The price must be at least ₹${MIN_PRICE}.`);
      return;
    }
    if (this.addCategory(nameInput.value, price)) {
      nameInput.value = '';
      this.addingCategory.set(false);
    }
  }

  /** Adds a seat type. It starts at the regular price, which the admin sets in step 3. Returns true when added. */
  addCategory(value: string, price: number): boolean {
    const name = value.trim();
    const error = this.checkName(name);
    if (error) {
      this.categoryError.set(error);
      return false;
    }
    const layout = this.draft();
    const start = price;
    this.categoryError.set('');
    this.draft.set({
      ...layout,
      categories: [...categoriesOf(layout), { name, style: this.newLook() }],
      prices: { ...layout.prices, [name]: start },
    });
    this.brush.set(name);
    this.toast.show(`${name} created. Paint seats with it in step 2.`);
    return true;
  }

  /** Renames a seat type everywhere it is used: its seats, its price and its place in the list. */
  renameCategory(oldName: string, value: string): void {
    const name = value.trim();
    if (name === oldName) return;
    const error = this.checkName(name, oldName);
    if (error) {
      this.categoryError.set(error);
      return;
    }
    const layout = this.draft();
    const prices: Record<string, number | undefined> = { ...layout.prices };
    prices[name] = prices[oldName];
    delete prices[oldName];
    this.categoryError.set('');
    this.draft.set({
      ...layout,
      categories: categoriesOf(layout).map((c) => (c.name === oldName ? { ...c, name } : c)),
      cells: layout.cells.map((row) => row.map((v) => (v === oldName ? name : v))),
      prices,
    });
    if (this.brush() === oldName) this.brush.set(name);
  }

  removeCategory(name: string): void {
    if ((this.usage()[name] ?? 0) > 0) {
      this.categoryError.set(`${name} still has seats. Move or erase them before removing it.`);
      return;
    }
    const layout = this.draft();
    const prices: Record<string, number | undefined> = { ...layout.prices };
    delete prices[name];
    const remaining = categoriesOf(layout).filter((c) => c.name !== name);
    this.categoryError.set('');
    this.draft.set({ ...layout, categories: remaining, prices });
    if (this.brush() === name) this.brush.set(remaining[0]?.name ?? 'aisle');
  }

  save(): void {
    const screen = this.current();
    if (!screen) return;
    const problem = this.issues()[0];
    if (problem) {
      this.saveError.set(problem);
      this.goTo(this.issues()[0]?.includes('price') ? 1 : 2);
      return;
    }
    const layout = this.draft();
    const seats = countSeats(layout.cells);
    this.saveError.set('');
    this.store.saveLayout(screen.id, layout, (saved) => {
      this.drafts.clear(screen.id);
      this.draft.set(copyLayout(saved.layout));
      this.toast.show(`Layout saved for ${saved.name}: ${seats} seats.`);
    });
  }

  private afterStructureChange(): void {
    this.clearSelection();
    this.picks.set(new Set());
    this.saveError.set('');
  }

  /** Checks a seat type name: present, short enough, and not already used by another seat type. */
  private checkName(name: string, except?: string): string {
    if (!name) return 'Give the seat type a name.';
    if (name.length > 20) return 'Use 20 characters or fewer for a seat type name.';
    const taken = categoriesOf(this.draft()).some((c) => c.name !== except && c.name.toLowerCase() === name.toLowerCase());
    return taken ? `There is already a seat type called ${name}.` : '';
  }

  /** A new row or column is filled with the current seat type, or the first seat type when a tool is picked. */
  private fill(): CellValue {
    const brush = this.brush();
    const names = this.categories().map((c) => c.name);
    if (names.includes(brush)) return brush;
    return names[0] ?? '';
  }

  addRow(): void {
    this.draft.update((layout) => {
      const cols = layout.cells[0]?.length ?? 10;
      const index = layout.cells.length;
      // A new row copies the category of the row above, unless a category tool is picked.
      const names = this.categories().map((c) => c.name);
      const above = layout.cells[index - 1]?.find(isCategory);
      const value = names.includes(this.brush()) ? this.brush() : (above ?? this.fill());
      return {
        ...layout,
        cells: [...layout.cells, Array.from({ length: cols }, () => value)],
        rowNames: layout.rowNames ? [...layout.rowNames, rowLabel(index)] : undefined,
      };
    });
  }






  /**
   * Moves a row. Dropped on a category break it goes to the end of that group; dropped on a row it goes in front of
   * that row. Either way the row takes the category, and its name moves with it.
   */
  moveRow(from: number, name: string | null, before: number | null = null): void {
    const layout = this.draft();
    if (before === from) return;
    const names = layout.cells.map((_, i) => rowNameOf(layout, i));
    const cells = layout.cells.map((r) => [...r]);
    const category = name ?? (before === null ? '' : (cells[before].find(isCategory) ?? ''));
    if (!category) return;
    const moved = cells[from].map((v) => (isCategory(v) ? category : v));
    const movedName = names[from];
    cells.splice(from, 1);
    names.splice(from, 1);
    let at: number;
    if (before === null) {
      at = cells.length;
      cells.forEach((r, i) => {
        if (r.find(isCategory) === category) at = i + 1;
      });
    } else {
      at = before > from ? before - 1 : before;
    }
    cells.splice(at, 0, moved);
    names.splice(at, 0, movedName);
    const couples = remapCouples(layout.couples, (r, c) => {
      const j = r === from ? at : r > from ? r - 1 : r;
      return [j >= at && r !== from ? j + 1 : j, c];
    });
    this.draft.set({ ...layout, cells, rowNames: names, couples });
    this.saveError.set('');
  }

  /** Sets every seat of a row to a category. */
  assignRow(row: number, name: string): void {
    this.draft.update((layout) => {
      const cells = layout.cells.map((r) => [...r]);
      cells[row] = cells[row].map((v) => (isCategory(v) ? name : v));
      return { ...layout, cells };
    });
    this.saveError.set('');
  }

  addColumn(): void {
    this.draft.update((layout) => ({ ...layout, cells: layout.cells.map((row) => [...row, this.fill()]) }));
  }
}
