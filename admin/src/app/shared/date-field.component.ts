import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

interface DayCell {
  key: string;
  day: number;
  label: string;
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  disabled: boolean;
}

/** yyyy-mm-dd in local time. */
function keyOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseKey(key: string): Date | null {
  if (!key) return null;
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

let nextId = 0;

/**
 * A date field with a calendar the app draws itself. Days before `min` are disabled. The value is yyyy-mm-dd, so it
 * works with reactive forms like a native date input.
 */
@Component({
  selector: 'app-date-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateFieldComponent), multi: true }],
  host: {
    '(focusout)': 'onFocusOut($event)',
    '(keydown.escape)': 'close($event)',
  },
  template: `
    <button
      type="button"
      class="trigger"
      [id]="inputId()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="open()"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      <span [class.placeholder]="!value()">{{ label() || 'Pick a date' }}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
    </button>

    @if (open()) {
      <div class="calendar" role="dialog" aria-label="Choose a date" [style.top.px]="pos().top" [style.left.px]="pos().left">
        <div class="cal-head">
          <button type="button" class="nav-btn" (click)="shift(-1)" aria-label="Previous month">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <strong aria-live="polite">{{ monthTitle() }}</strong>
          <button type="button" class="nav-btn" (click)="shift(1)" aria-label="Next month">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>

        <div class="grid weekdays" aria-hidden="true">
          @for (w of weekdays; track w) {
            <span>{{ w }}</span>
          }
        </div>

        <div class="grid">
          @for (c of cells(); track c.key) {
            <button
              type="button"
              class="day"
              [class.out]="!c.inMonth"
              [class.today]="c.today"
              [class.picked]="c.selected"
              [disabled]="c.disabled"
              [attr.aria-label]="c.label"
              [attr.aria-pressed]="c.selected"
              (click)="pick(c.key)"
            >{{ c.day }}</button>
          }
        </div>

        <div class="cal-foot">
          <button type="button" class="link" (click)="clear()">Clear</button>
          <button type="button" class="link" (click)="pickToday()" [disabled]="!isSelectable(todayKey)">Today</button>
        </div>
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: block; min-width: 0; }
    .trigger {
      width: 100%;
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      font-weight: 500;
      text-align: left;
    }
    .trigger:hover:not(:disabled) { border-color: var(--text-muted); }
    .trigger[aria-expanded="true"] { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .trigger:disabled { opacity: 0.5; cursor: not-allowed; }
    .trigger > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .trigger .placeholder { color: var(--text-muted); }
    .trigger svg { width: 18px; height: 18px; flex-shrink: 0; fill: none; stroke: var(--text-muted); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .calendar {
      position: fixed;
      z-index: 60;
      width: 320px;
      max-width: calc(100vw - 32px);
      padding: 12px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
    }
    .cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .cal-head strong { font-family: var(--font-display); font-weight: 600; font-size: 1rem; white-space: nowrap; }
    .nav-btn {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border-radius: var(--radius);
      border: 0;
      background: transparent;
    }
    .nav-btn:hover { background: var(--surface-2); }
    .nav-btn svg { width: 18px; height: 18px; fill: none; stroke: var(--text-soft); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
    .weekdays span {
      display: grid;
      place-items: center;
      height: 26px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }
    .day {
      height: 36px;
      border: 0;
      border-radius: var(--radius);
      background: transparent;
      color: var(--text);
      font-size: 0.9rem;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .day:hover:not(:disabled):not(.picked) { background: var(--surface-2); }
    .day.out { color: var(--text-muted); opacity: 0.55; }
    .day:disabled { color: var(--text-muted); opacity: 0.35; cursor: not-allowed; text-decoration: line-through; }
    .day.today { box-shadow: inset 0 0 0 1px var(--text-muted); font-weight: 700; }
    .day.picked { background: var(--brand); color: var(--on-primary); font-weight: 700; box-shadow: none; }
    .cal-foot { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-soft); }
    .link { border: 0; background: transparent; padding: 6px 8px; border-radius: var(--radius-sm); font-weight: 600; color: var(--brand); }
    .link:hover:not(:disabled) { background: var(--surface-2); }
    .link:disabled { opacity: 0.4; cursor: not-allowed; }
  `,
})
export class DateFieldComponent implements ControlValueAccessor {
  /** The earliest date that can be picked, as yyyy-mm-dd. */
  readonly min = input('');
  /** The id of the button inside, so a label's `for` reaches it. */
  readonly inputId = input('');

  readonly weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  readonly todayKey = keyOf(new Date());
  readonly value = signal('');
  readonly open = signal(false);
  readonly disabled = signal(false);
  /** The month shown in the calendar, as the first day of that month. */
  readonly view = signal(startOfMonth(new Date()));
  /** Where the calendar is drawn: fixed to the viewport, above the field when there is no room below. */
  readonly pos = signal({ top: 0, left: 0 });

  readonly label = computed(() => {
    const date = parseKey(this.value());
    return date ? date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
  });

  readonly monthTitle = computed(() => this.view().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));

  /** Six weeks of days, starting on the Sunday on or before the 1st. */
  readonly cells = computed<DayCell[]>(() => {
    const first = this.view();
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const out: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = keyOf(date);
      out.push({
        key,
        day: date.getDate(),
        label: date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        inMonth: date.getMonth() === first.getMonth(),
        today: key === this.todayKey,
        selected: key === this.value(),
        disabled: !this.isSelectable(key),
      });
    }
    return out;
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    // A fixed calendar would drift when the page scrolls, so close it instead.
    // Scrolling inside the calendar itself is fine; scrolling anything else would leave it floating.
    const close = (event: Event) => {
      if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
    };
    document.addEventListener('scroll', close, { capture: true, passive: true });
    inject(DestroyRef).onDestroy(() => document.removeEventListener('scroll', close, { capture: true }));
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  isSelectable(key: string): boolean {
    const min = this.min();
    return !min || key >= min;
  }

  toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    const selected = parseKey(this.value()) ?? new Date();
    this.view.set(startOfMonth(selected));
    this.place();
    this.open.set(true);
  }

  private place(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const height = 390;
    const below = rect.bottom + 4;
    const above = rect.top - height - 4;
    const top = below + height > window.innerHeight && above > 0 ? above : below;
    this.pos.set({ top, left: Math.min(rect.left, window.innerWidth - 336) });
  }

  close(event?: Event): void {
    if (!this.open()) return;
    event?.stopPropagation();
    this.open.set(false);
  }

  shift(months: number): void {
    const current = this.view();
    this.view.set(new Date(current.getFullYear(), current.getMonth() + months, 1));
  }

  pick(key: string): void {
    if (!this.isSelectable(key)) return;
    this.value.set(key);
    this.onChange(key);
    this.onTouched();
    this.open.set(false);
  }

  pickToday(): void {
    this.pick(this.todayKey);
  }

  clear(): void {
    this.value.set('');
    this.onChange('');
    this.onTouched();
    this.open.set(false);
  }

  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.host.nativeElement.contains(next)) return;
    this.open.set(false);
    this.onTouched();
  }
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
