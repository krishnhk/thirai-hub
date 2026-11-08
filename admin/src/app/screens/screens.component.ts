import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AdminStore } from '../core/admin-store';
import { categoriesOf, categoriesUsed, isCategory } from '../core/layout';
import { SCREEN_TYPES, ScreenType, SeatLayout } from '../core/models';
import { LayoutDrafts } from '../core/layout-drafts';
import { ToastService } from '../core/toast.service';

/**
 * Screens and seats: the screens of this theatre as cards. Choosing a screen opens its details; adding a screen opens
 * its builder straight away.
 */
@Component({
  selector: 'app-screens',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <header class="page-header">
      <div>
        <h1>Screens and seats</h1>
        <p class="lede">Each screen keeps its seat layout, categories and default prices.</p>
      </div>
      <div class="header-actions">
        <button class="btn primary" type="button" [attr.aria-expanded]="adding()" aria-controls="add-screen" (click)="startAdd()">Add screen</button>
      </div>
    </header>

    @if (adding()) {
      <form id="add-screen" class="card add-card" [formGroup]="form" (submit)="create($event)" novalidate>
        <div class="field">
          <label for="new-screen">Screen name</label>
          <input id="new-screen" class="input" maxlength="30" placeholder="e.g. Audi 3" formControlName="name" />
        </div>
        <div class="field">
          <span class="field-label" id="type-label">Screen type</span>
          <div class="segmented" role="radiogroup" aria-labelledby="type-label">
            @for (t of types; track t) {
              <button type="button" role="radio" [attr.aria-checked]="form.controls.type.value === t" [attr.aria-pressed]="form.controls.type.value === t" (click)="form.controls.type.setValue(t)">{{ t }}</button>
            }
          </div>
          <span class="hint">2D or 3D is chosen for each show.</span>
        </div>
        @if (error()) {
          <span class="error" role="alert">{{ error() }}</span>
        }
        <div class="row-end">
          <button class="btn ghost" type="button" (click)="cancelAdd()">Cancel</button>
          <button class="btn primary" type="submit">Create and build layout</button>
        </div>
      </form>
    }

    @if (store.screens().length) {
      <ul class="screen-grid">
        @for (s of store.screens(); track s.id) {
          <li>
            <a class="screen-card" [routerLink]="['/screens', s.id]" [attr.aria-label]="'Open ' + s.name">
              <span class="thumb" aria-hidden="true">
                <span class="thumb-screen"></span>
                <span class="thumb-grid" [style.grid-template-columns]="'repeat(' + (s.layout.cells[0]?.length ?? 1) + ', ' + thumbCell(s.layout) + 'px)'">
                  @for (row of thumb(s.layout); track $index) {
                    @for (c of row; track $index) {
                      <i [class]="c"></i>
                    }
                  }
                </span>
              </span>
              <span class="screen-body">
                <span class="screen-title">
                  <strong>{{ s.name }} <span class="type-tag" [class.regular]="s.type === 'Regular'">{{ s.type }}</span></strong>
                  @if (drafts.isUnsaved(s)) {
                    <span class="badge unsaved">Unsaved</span>
                  }
                </span>
                <dl class="facts num">
                  <div><dt>Seats</dt><dd>{{ seats(s.layout.cells) }}</dd></div>
                  <div><dt>Rows</dt><dd>{{ s.layout.cells.length }}</dd></div>
                  <div><dt>Categories</dt><dd>{{ categoryCount(s.layout) }}</dd></div>
                </dl>
              </span>
              <span class="open">View screen <span aria-hidden="true">→</span></span>
            </a>
          </li>
        }
        <li>
          <button class="add-tile" type="button" (click)="startAdd()">
            <span class="plus" aria-hidden="true">+</span>
            <strong>Add screen</strong>
            <small class="muted">Name it, then build its seats</small>
          </button>
        </li>
      </ul>
    } @else {
      <section class="card empty">
        <p><strong>No screens yet.</strong></p>
        <p class="muted">Add the first screen, then build its seats in three steps.</p>
      </section>
    }
  `,
  styles: `
    .add-card { display: flex; flex-direction: column; gap: 12px; max-width: 520px; padding: 18px; margin-bottom: 20px; }
    .field-label { font-size: 0.82rem; font-weight: 600; color: var(--text-soft); }
    .add-card .segmented { align-self: flex-start; }
    .row-end { display: flex; justify-content: flex-end; gap: 8px; }
    .screen-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .screen-grid > li { display: flex; min-width: 0; }
    .screen-card, .add-tile {
      flex: 1; min-width: 0; display: flex; flex-direction: column;
      border-radius: var(--radius-lg); border: 1px solid var(--border); background: var(--surface);
      color: var(--text); text-decoration: none; box-shadow: var(--shadow-sm);
      transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
    }
    .screen-card:hover { border-color: var(--border-strong); box-shadow: var(--shadow); transform: translateY(-1px); }
    .thumb { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; height: 176px; padding: 18px 20px 16px; border-bottom: 1px solid var(--border-soft); background: var(--surface-2); border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
    .thumb-screen { width: 70%; height: 4px; border-radius: 0 0 50% 50% / 0 0 100% 100%; background: #c08a3e; opacity: 0.8; }
    .thumb-grid { display: grid; gap: 3px; }
    .thumb-grid i { aspect-ratio: 1; border-radius: 2px; background: #9aa6b8; }
    .thumb-grid i.c1 { background: #d48a1f; }
    .thumb-grid i.c2 { background: var(--accent); }
    .thumb-grid i.c3 { background: #8b6cd8; }
    .thumb-grid i.space { background: transparent; }
    .thumb-grid i.off { background: var(--surface-3); }
    .screen-body { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px 6px; }
    .screen-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .screen-title strong { font-size: 1.05rem; letter-spacing: -0.01em; }
    .facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; }
    .facts div + div { padding-left: 12px; border-left: 1px solid var(--border-soft); }
    .facts dt { font-size: 0.72rem; color: var(--text-muted); }
    .facts dd { margin: 0; font-size: 1.05rem; font-weight: 700; }
    .open { margin-top: auto; padding: 10px 18px 14px; font-size: 0.84rem; font-weight: 600; color: var(--accent); }
    .add-tile { align-items: center; justify-content: center; gap: 6px; min-height: 220px; border-style: dashed; border-width: 1.5px; background: transparent; box-shadow: none; }
    .add-tile:hover { border-color: var(--accent); background: var(--surface); }
    .plus { display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 4px; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--border); font-size: 1.3rem; color: var(--text-soft); }
    .add-tile small { font-size: 0.82rem; }
    .empty { padding: 28px; }
    .empty p { margin: 0 0 4px; }
  `,
})
export class ScreensComponent {
  readonly store = inject(AdminStore);
  readonly drafts = inject(LayoutDrafts);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly adding = signal(false);
  readonly error = signal('');
  readonly types = SCREEN_TYPES;
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    type: ['Regular' as ScreenType],
  });

  /** A small picture of the layout for the card: one class per cell, coloured by category. */
  thumb(layout: SeatLayout): string[][] {
    const names = categoriesOf(layout).map((c) => c.name);
    return layout.cells.map((row) => row.map((v) => {
      if (isCategory(v)) return 'c' + Math.min(Math.max(names.indexOf(v), 0), 3);
      return v === 'blocked' ? 'off' : 'space';
    }));
  }

  /** The size of one cell in the card picture, so any layout fits the same box. */
  thumbCell(layout: SeatLayout): number {
    const rows = Math.max(layout.cells.length, 1);
    const cols = Math.max(layout.cells[0]?.length ?? 1, 1);
    return Math.max(3, Math.min(14, Math.floor(126 / rows) - 3, Math.floor(220 / cols) - 3));
  }

  /** How many categories a screen sells. */
  categoryCount(layout: SeatLayout): number {
    return categoriesUsed(layout).length;
  }

  /** Seats a screen sells: its seat-type cells, not aisles or unavailable seats. */
  seats(cells: string[][]): number {
    return cells.reduce((n, row) => n + row.filter((v) => isCategory(v)).length, 0);
  }

  startAdd(): void {
    this.error.set('');
    this.adding.set(true);
  }

  cancelAdd(): void {
    this.adding.set(false);
    this.form.reset();
    this.error.set('');
  }

  /** Creates the screen, then opens its layout builder. */
  create(event: Event): void {
    event.preventDefault();
    this.form.markAllAsTouched();
    const name = this.form.controls.name.value.trim();
    if (name.length < 2) {
      this.error.set('Give the screen a name of at least two characters.');
      return;
    }
    if (this.store.screens().some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      this.error.set(`This theatre already has a screen called ${name}.`);
      return;
    }
    this.error.set('');
    this.store.addScreen(name, this.form.controls.type.value, (screen) => {
      this.cancelAdd();
      this.toast.show(`${screen.name} added. Build its seats in three steps.`);
      void this.router.navigate(['/screens', screen.id, 'edit']);
    });
  }
}
