import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { SeatLayout } from '../core/models';
import { categoriesOf, coupleSet, isCategory, rowNameOf, styleOf } from '../core/layout';

/** A seat as the map draws it. */
export interface SeatItem {
  kind: 'seat';
  row: number;
  col: number;
  /** The number printed in the box: the seat's place along its row. */
  number: number;
  /** The label used in the editor and for screen readers, such as B7. */
  id: string;
  category: string;
  /** A couple seat is joined with its neighbour in pairs. */
  couple: boolean;
  cls: string;
  selected: boolean;
}

export type MapItem =
  | { kind: 'gap' }
  | { kind: 'empty'; row: number; col: number }
  | { kind: 'aisle'; row: number; col: number }
  | { kind: 'blocked'; row: number; col: number }
  | SeatItem
  | { kind: 'pair'; seats: [SeatItem, SeatItem] };

export interface MapRow {
  index: number;
  label: string;
  header: { name: string; price: number } | null;
  items: MapItem[];
}

export interface CellPoint {
  row: number;
  col: number;
}

/** The row or column the editor has selected, if any. */
export interface Focus {
  row: number | null;
  col: number | null;
}

/** Turns a layout into rows of seats, pairing couple seats and naming each row's category. */
export function buildRows(layout: SeatLayout, selected: ReadonlySet<string>, editing: boolean, focus: Focus = { row: null, col: null }): MapRow[] {
  const rows: MapRow[] = [];
  const couples = coupleSet(layout);
  let lastCategory: string | null = null;

  layout.cells.forEach((cells, row) => {
    const firstCategory = cells.find(isCategory) ?? null;
    const header = firstCategory && firstCategory !== lastCategory
      ? { name: firstCategory, price: layout.prices[firstCategory] ?? 0 }
      : null;
    if (firstCategory) lastCategory = firstCategory;

    const name = rowNameOf(layout, row);
    // Each cell becomes one token; seat tokens are numbered along the row.
    const tokens: MapItem[] = [];
    let number = 0;
    cells.forEach((value, col) => {
      if (isCategory(value)) {
        number++;
        const key = `${row},${col}`;
        const isSelected = selected.has(key);
        const focused = focus.row === row || focus.col === col;
        tokens.push({
          kind: 'seat',
          row,
          col,
          number,
          id: `${name}${number}`,
          category: value,
          couple: couples.has(`${row},${col}`),
          cls: `seat ${couples.has(`${row},${col}`) ? 'couple' : styleOf(layout, value)}${isSelected ? ' selected' : ''}${focused ? ' focused' : ''}`,
          selected: isSelected,
        });
      } else if (value === 'blocked') {
        tokens.push({ kind: 'blocked', row, col });
      } else if (editing) {
        tokens.push(value === 'aisle' ? { kind: 'aisle', row, col } : { kind: 'empty', row, col });
      } else {
        tokens.push({ kind: 'gap' });
      }
    });

    rows.push({ index: row, label: name, header, items: pairCouples(tokens) });
  });

  return rows;
}

/**
 * Couple seats are sold in pairs. A run of couple seats is paired from its first seat; a seat left over at the
 * end of an odd run is drawn as an ordinary seat.
 */
function pairCouples(tokens: MapItem[]): MapItem[] {
  const isCouple = (item: MapItem): item is SeatItem => item.kind === 'seat' && item.couple;
  const out: MapItem[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!isCouple(token)) {
      out.push(token);
      i++;
      continue;
    }
    let end = i;
    while (end < tokens.length && isCouple(tokens[end])) end++;
    let k = i;
    while (k + 1 < end) {
      out.push({ kind: 'pair', seats: [tokens[k] as SeatItem, tokens[k + 1] as SeatItem] });
      k += 2;
    }
    if (k < end) {
      const lone = tokens[k] as SeatItem;
      out.push({ ...lone, cls: `seat regular${lone.selected ? ' selected' : ''}` });
    }
    i = end;
  }
  return out;
}

/**
 * The seat map. In edit mode each cell can be painted by dragging across it, and a row's letter selects the row;
 * in customer mode seats can be picked. Both use the same seat shapes as ThiraiHub's customer app.
 */
@Component({
  selector: 'app-seat-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  template: `
    <div class="screen-bar"><span>Screen</span></div>
    <div
      class="map"
      role="group"
      aria-label="Seat map"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (click)="onClick($event)"
    >
      @for (row of rows(); track row.index) {
        @if (row.header; as header) {
          <div class="category-break" (dragover)="onDragOver($event)" (drop)="onBreakDrop($event, header.name)">
            <span class="rule"></span>
            <span class="category-name">{{ header.name }} · ₹{{ header.price }}</span>
            <span class="rule"></span>
          </div>
        }
          <div class="row-line" [class.focused]="row.index === focusRow()" [class.editing]="editing()" (dragover)="onDragOver($event)" (drop)="onRowDrop($event, row.index)">
          @if (editing()) {
            <span class="grip" draggable="true" [attr.title]="'Drag to move row ' + row.label" aria-hidden="true" (dragstart)="onRowDragStart($event, row.index)">⋮⋮</span>
          }
          @if (editing()) {
            @if (renaming() === row.index) {
              <input class="row-input" maxlength="4" [value]="row.label" [attr.aria-label]="'Name of row ' + row.label" (keydown.enter)="finishRename(row.index, $any($event.target).value)" (keydown.escape)="finishRename(row.index, null)" (blur)="finishRename(row.index, $any($event.target).value)" />
            } @else {
              <button type="button" class="row-label row-button" [attr.aria-label]="'Rename row ' + row.label" [attr.title]="'Click to rename row ' + row.label" (click)="rowPick.emit(row.index)">{{ row.label }}</button>
            }
          } @else {
            <span class="row-label" aria-hidden="true">{{ row.label }}</span>
          }
          <div class="seats">
            @for (item of row.items; track $index) {
              @switch (item.kind) {
                @case ('gap') {
                  <span class="gap" aria-hidden="true"></span>
                }
                @case ('empty') {
                  <button type="button" class="seat empty" [attr.data-r]="item.row" [attr.data-c]="item.col" aria-label="Empty space"></button>
                }
                @case ('aisle') {
                  <button type="button" class="seat aisle" [attr.data-r]="item.row" [attr.data-c]="item.col" aria-label="Aisle"></button>
                }
                @case ('blocked') {
                  <button type="button" class="seat blocked" [attr.data-r]="item.row" [attr.data-c]="item.col" aria-label="Unavailable seat"></button>
                }
                @case ('pair') {
                  <span class="pair">
                    <ng-container *ngTemplateOutlet="seatTpl; context: { $implicit: item.seats[0] }" />
                    <ng-container *ngTemplateOutlet="seatTpl; context: { $implicit: item.seats[1] }" />
                  </span>
                }
                @case ('seat') {
                  <ng-container *ngTemplateOutlet="seatTpl; context: { $implicit: item }" />
                }
              }
            }
          </div>
          @if (editing()) {
            @if (renaming() === row.index) {
              <input class="row-input" maxlength="4" [value]="row.label" [attr.aria-label]="'Name of row ' + row.label" (keydown.enter)="finishRename(row.index, $any($event.target).value)" (keydown.escape)="finishRename(row.index, null)" (blur)="finishRename(row.index, $any($event.target).value)" />
            } @else {
              <button type="button" class="row-label row-button" [attr.aria-label]="'Rename row ' + row.label" [attr.title]="'Click to rename row ' + row.label" (click)="rowPick.emit(row.index)">{{ row.label }}</button>
            }
          } @else {
            <span class="row-label" aria-hidden="true">{{ row.label }}</span>
          }
        </div>
      }
      @if (editing()) {
        @for (c of emptyCategories(); track c.name) {
          <div class="category-break drop" (dragover)="onDragOver($event)" (drop)="onBreakDrop($event, c.name)">
            <span class="rule"></span>
            <span class="category-name">{{ c.name }} · ₹{{ layout().prices[c.name] ?? 0 }}</span>
            <span class="rule"></span>
          </div>
        }
      }
    </div>

    <ng-template #seatTpl let-seat>
      <button
        type="button"
        [class]="seat.cls"
        [attr.data-r]="seat.row"
        [attr.data-c]="seat.col"
        [attr.aria-label]="seat.category + ' seat ' + seat.id + (seat.selected ? ', your pick' : '')"
        [attr.aria-pressed]="editing() ? null : seat.selected"
      >{{ editing() ? seat.id : seat.number }}</button>
    </ng-template>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .screen-bar {
      height: 46px;
      margin: 4px 0 18px;
      border-radius: 50% / 100% 100% 0 0;
      background: linear-gradient(180deg, color-mix(in srgb, var(--warning) 22%, transparent), transparent);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 8px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--warning);
      border-bottom: 3px solid var(--warning);
    }
    .map { display: flex; flex-direction: column; gap: 7px; min-width: max-content; margin: 0 auto; }
    .category-break { display: flex; align-items: center; gap: 12px; margin: 8px 0 2px; min-width: max-content; }
    .category-break .rule { flex: 1; height: 1px; background: var(--border); }
    .category-name { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-soft); white-space: nowrap; }
    .row-line { display: grid; grid-template-columns: 34px auto 34px; align-items: center; gap: 8px; justify-content: center; border-radius: 10px; padding: 2px 0; }
    .row-line.focused { background: color-mix(in srgb, var(--info) 14%, transparent); }
    .row-label { width: 34px; text-align: center; font-size: 0.74rem; font-weight: 700; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row-button { height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; }
    .row-button:hover { background: var(--surface-3); color: var(--text); }
    .row-input { width: 40px; height: 26px; padding: 0 2px; border: 1px solid var(--accent); border-radius: 6px; background: var(--surface); color: var(--text); text-align: center; font-size: 0.76rem; font-weight: 700; }
    .row-input:focus { outline: none; box-shadow: 0 0 0 3px var(--accent-soft); }
    .seats { display: flex; justify-content: center; gap: 6px; }
    .gap { width: 28px; flex-shrink: 0; }
    .seat {
      width: 28px;
      height: 26px;
      flex-shrink: 0;
      padding: 0;
      border-radius: 6px 6px 3px 3px;
      border: 1px solid var(--text-soft);
      background: transparent;
      color: var(--text-muted);
      font-size: 0.7rem;
      font-weight: 600;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
    }
    .seat.regular { border-color: var(--text-soft); }
    .seat.premium { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
    .seat.recliner { border: 2px solid var(--accent); }
    .seat.couple { border-color: var(--info); }
    .seat.focused { box-shadow: 0 0 0 2px var(--info); border-color: var(--info); }
    .seat:not(:disabled):hover { transform: scale(1.12); border-color: var(--accent); }
    .seat.selected { background: var(--accent); border-color: var(--accent); color: var(--on-primary); transform: scale(1.08); }
    .seat.blocked { background: var(--surface-3); border-color: var(--surface-3); color: var(--text-muted); cursor: not-allowed; }
    .seat.empty { border: 1px dashed var(--border); background: transparent; }
    .seat.aisle { border: 1px dashed var(--text-muted); background: transparent; }
    .seat:disabled { cursor: not-allowed; }
    .category-break.drop { padding: 8px 0; border: 1px dashed var(--border); border-radius: 8px; }
    .category-break.drop:hover { border-color: var(--accent); }
    .grip { justify-self: center; width: 24px; padding: 6px 0; text-align: center; line-height: 1; cursor: grab; color: var(--text-soft); font-size: 1.15rem; letter-spacing: -3px; user-select: none; }
    .row-line.editing { grid-template-columns: 24px 34px auto 34px; }
    .grip:active { cursor: grabbing; }
    .pair { display: inline-flex; }
    .pair .seat:first-child { border-radius: 6px 0 0 3px; }
    .pair .seat:last-child { border-radius: 0 6px 3px 0; }
    .pair .seat + .seat { margin-left: -1px; }
  `,
})
export class SeatMapComponent {
  readonly layout = input.required<SeatLayout>();
  /** In edit mode cells can be painted and the labels show seat ids; in customer mode seats can be picked. */
  readonly editing = input(false);
  /** Keys "row,col" of the seats the customer has picked. */
  readonly selected = input<ReadonlySet<string>>(new Set<string>());
  /** The row or column the editor has selected. */
  readonly focusRow = input<number | null>(null);
  readonly focusCol = input<number | null>(null);
  /** The row whose name is being typed, if any. */
  readonly renaming = input<number | null>(null);

  readonly paint = output<CellPoint>();
  readonly pick = output<CellPoint>();
  /** A row's letter was clicked in edit mode. */
  readonly rowPick = output<number>();
  /** A row name was typed (name) or the typing was cancelled (null). */
  /** A row was dropped under a category break: the row moves there. */
  readonly rowMove = output<{ from: number; name: string | null; before: number | null }>();
  readonly renameCommit = output<{ row: number; name: string | null }>();

  readonly rows = computed(() => buildRows(this.layout(), this.selected(), this.editing(), { row: this.focusRow(), col: this.focusCol() }));

  private painting = false;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    effect(() => {
      if (this.renaming() === null) return;
      setTimeout(() => {
        const field = this.host.nativeElement.querySelector<HTMLInputElement>('input.row-input');
        field?.focus();
        field?.select();
      });
    });
  }

  /** Categories with no rows yet, so they still have a break to drop onto. */
  readonly emptyCategories = computed(() => {
    const used = new Set(this.layout().cells.flat().filter(isCategory));
    return categoriesOf(this.layout()).filter((c) => !used.has(c.name));
  });

  onRowDragStart(event: DragEvent, row: number): void {
    event.dataTransfer?.setData('text/plain', `row:${row}`);
    const source = (event.target as Element | null)?.closest('.row-line');
    if (!(source instanceof HTMLElement) || !event.dataTransfer) return;
    // The whole row is the drag image, so it floats with the cursor while it is dragged.
    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    ghost.style.width = `${source.offsetWidth}px`;
    document.body.appendChild(ghost);
    const rect = source.getBoundingClientRect();
    event.dataTransfer.setDragImage(ghost, event.clientX - rect.left, event.clientY - rect.top);
    setTimeout(() => ghost.remove());
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  /** A row dropped on another row goes in front of it and takes its category. */
  onRowDrop(event: DragEvent, row: number): void {
    event.preventDefault();
    const data = event.dataTransfer?.getData('text/plain') ?? '';
    if (!data.startsWith('row:')) return;
    this.rowMove.emit({ from: Number(data.slice(4)), name: null, before: row });
  }

  onBreakDrop(event: DragEvent, name: string): void {
    event.preventDefault();
    const data = event.dataTransfer?.getData('text/plain') ?? '';
    if (!data.startsWith('row:')) return;
    this.rowMove.emit({ from: Number(data.slice(4)), name, before: null });
  }

  finishRename(row: number, name: string | null): void {
    this.renameCommit.emit({ row, name });
  }

  onPointerDown(event: PointerEvent): void {
    if (!this.editing()) return;
    this.painting = true;
    this.emitFrom(event.target);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.editing() || !this.painting) return;
    const under = document.elementFromPoint(event.clientX, event.clientY);
    this.emitFrom(under);
  }

  onClick(event: MouseEvent): void {
    if (this.editing()) return;
    const cell = this.cellFrom(event.target);
    if (cell) this.pick.emit(cell);
  }

  @HostListener('window:pointerup')
  stopPainting(): void {
    this.painting = false;
  }

  private emitFrom(target: EventTarget | null): void {
    const cell = this.cellFrom(target);
    if (cell) this.paint.emit(cell);
  }

  private cellFrom(target: EventTarget | null): CellPoint | null {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>('[data-r]');
    if (!el || (el as HTMLButtonElement).disabled) return null;
    return { row: Number(el.dataset['r']), col: Number(el.dataset['c']) };
  }
}
