import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

type Period = 'AM' | 'PM';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 24-hour "HH:mm" to the label people read, such as "7:10 pm". */
export function labelOf(value: string): string {
  const [h, m] = value.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** A 24-hour "HH:mm" value split into the 12-hour text and AM or PM, as the field shows them. */
function splitValue(value: string): { hm: string; period: Period } {
  const [h, m] = value.split(':').map(Number);
  return { hm: `${h % 12 || 12}:${pad(m)}`, period: h >= 12 ? 'PM' : 'AM' };
}

/** A 12-hour time typed as "h" or "h:mm" plus AM or PM, as "HH:mm", or null when it is not a valid time. */
function joinValue(hm: string, period: Period): string | null {
  const match = hm.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return `${pad((hour % 12) + (period === 'PM' ? 12 : 0))}:${pad(minute)}`;
}

/** Suggested start times: every 15 minutes from 6:00 am to 11:45 pm. Any other time can be entered. */
const SUGGESTIONS: { value: string; label: string }[] = Array.from({ length: 72 }, (_, i) => {
  const minutes = 6 * 60 + i * 15;
  const value = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  return { value, label: labelOf(value) };
});

let nextId = 0;

/**
 * A start-time field: the time is typed as hour and minute, and AM or PM is picked with two buttons. Picking a
 * suggestion sets both. Leaving the field with an invalid time puts back the last valid one.
 */
@Component({
  selector: 'app-time-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeFieldComponent), multi: true }],
  host: {
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <div class="row">
      <input
        [id]="inputId()"
        class="input"
        type="text"
        role="combobox"
        inputmode="numeric"
        autocomplete="off"
        placeholder="7:10"
        maxlength="5"
        [disabled]="disabled()"
        [attr.aria-expanded]="open()"
        aria-autocomplete="list"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="activeId()"
        [value]="hm()"
        (focus)="openList()"
        (click)="openList()"
        (input)="typeHm($event)"
        (blur)="commitHm()"
        (keydown)="key($event)"
      />
      <div class="period" role="group" aria-label="AM or PM">
        <button type="button" [attr.aria-pressed]="period() === 'AM'" [disabled]="disabled()" (mousedown)="$event.preventDefault()" (click)="setPeriod('AM')">AM</button>
        <button type="button" [attr.aria-pressed]="period() === 'PM'" [disabled]="disabled()" (mousedown)="$event.preventDefault()" (click)="setPeriod('PM')">PM</button>
      </div>
    </div>

    @if (open()) {
      <ul
        [id]="listId"
        class="list"
        role="listbox"
        aria-label="Suggested times"
        [style.top.px]="pos().top"
        [style.left.px]="pos().left"
        [style.width.px]="pos().width"
      >
        @for (o of shown(); track o.value; let i = $index) {
          <li
            role="option"
            [id]="listId + '-' + i"
            [attr.aria-selected]="o.value === value()"
            [class.active]="i === active()"
            [class.picked]="o.value === value()"
            (mousedown)="$event.preventDefault(); choose(o.value)"
          >{{ o.label }}</li>
        } @empty {
          <li class="none">Type a time, such as 7:10</li>
        }
      </ul>
    }
  `,
  styles: `
    :host { position: relative; display: block; min-width: 0; }
    .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
    .input { font-variant-numeric: tabular-nums; }
    .period {
      display: inline-flex;
      gap: 2px;
      padding: 3px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      background: var(--surface-2);
    }
    .period button {
      min-width: 46px;
      min-height: 32px;
      padding: 0 10px;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-muted);
      font-size: 0.84rem;
      font-weight: 700;
    }
    .period button:hover:not(:disabled):not([aria-pressed="true"]) { color: var(--text); }
    .period button[aria-pressed="true"] { background: var(--brand); color: var(--on-primary); }
    .period button:disabled { opacity: 0.5; cursor: not-allowed; }
    .list {
      position: fixed;
      z-index: 60;
      max-height: 260px;
      margin: 0;
      padding: 4px;
      list-style: none;
      overflow-y: auto;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-lg);
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
    }
    .list li {
      min-height: 36px;
      display: flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      color: var(--text);
      font-variant-numeric: tabular-nums;
    }
    .list li.active { background: var(--surface-2); }
    .list li.picked { font-weight: 700; }
    .list li.none { color: var(--text-muted); cursor: default; }
  `,
})
export class TimeFieldComponent implements ControlValueAccessor {
  /** The id of the input inside, so a label's `for` reaches it. */
  readonly inputId = input('');
  readonly listId = `time-list-${nextId++}`;

  /** The chosen time as "HH:mm". */
  readonly value = signal('');
  /** The hour and minute as typed, such as "7:10". */
  readonly hm = signal('');
  readonly period = signal<Period>('AM');
  readonly open = signal(false);
  readonly active = signal(0);
  readonly disabled = signal(false);
  readonly pos = signal({ top: 0, left: 0, width: 0 });

  private readonly query = signal('');

  /** The suggestions that match what has been typed, with a typed time that is not a step added in its place. */
  readonly shown = computed(() => {
    const chosen = this.value();
    const base = chosen && !SUGGESTIONS.some((o) => o.value === chosen)
      ? [...SUGGESTIONS, { value: chosen, label: labelOf(chosen) }].sort((a, b) => a.value.localeCompare(b.value))
      : SUGGESTIONS;
    const q = this.query().replace(/\s+/g, '').toLowerCase();
    if (!q) return base;
    return base.filter((o) => o.label.replace(/\s+/g, '').toLowerCase().includes(q));
  });

  readonly activeId = computed(() => (this.open() && this.shown()[this.active()] ? `${this.listId}-${this.active()}` : null));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    // Scrolling inside the list itself is fine; scrolling anything else would leave the list floating.
    const close = (event: Event) => {
      if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
    };
    document.addEventListener('scroll', close, { capture: true, passive: true });
    inject(DestroyRef).onDestroy(() => document.removeEventListener('scroll', close, { capture: true }));
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
    this.showValue(value ?? '');
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

  setPeriod(period: Period): void {
    this.period.set(period);
    const value = joinValue(this.hm(), period);
    if (value) this.setValue(value);
  }

  openList(): void {
    if (this.open()) return;
    this.query.set('');
    this.active.set(Math.max(this.shown().findIndex((o) => o.value === this.value()), 0));
    this.place();
    this.open.set(true);
    // Bring the chosen time into view, so the list does not open at the top every time.
    setTimeout(() => this.host.nativeElement.querySelector('li.picked, li.active')?.scrollIntoView({ block: 'nearest' }));
  }

  typeHm(event: Event): void {
    const field = event.target as HTMLInputElement;
    // Only digits and a colon can be typed; AM and PM are chosen with the buttons.
    const cleaned = field.value.replace(/[^\d:]/g, '').slice(0, 5);
    field.value = cleaned;
    this.hm.set(cleaned);
    this.query.set(cleaned);
    this.active.set(0);
    this.place();
    this.open.set(true);
  }

  choose(value: string): void {
    this.showValue(value);
    this.query.set('');
    this.setValue(value);
    this.onTouched();
    this.open.set(false);
  }

  /** Takes the typed hour and minute when they form a time, or puts back the last valid time. */
  commitHm(): void {
    const value = joinValue(this.hm(), this.period());
    if (value) {
      this.showValue(value);
      this.setValue(value);
    } else {
      this.showValue(this.value());
    }
    this.onTouched();
    this.open.set(false);
  }

  key(event: KeyboardEvent): void {
    const list = this.shown();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.openList();
      this.active.set(Math.min(this.active() + 1, list.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.active.set(Math.max(this.active() - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.open() && list[this.active()] && this.hm() === '') this.choose(list[this.active()].value);
      else this.commitHm();
    } else if (event.key === 'Escape' && this.open()) {
      event.stopPropagation();
      this.open.set(false);
      this.showValue(this.value());
    }
  }

  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.host.nativeElement.contains(next)) return;
    this.onTouched();
  }

  private setValue(value: string): void {
    this.value.set(value);
    this.onChange(value);
  }

  /** Shows a 24-hour value as the typed hour and minute with AM or PM. */
  private showValue(value: string): void {
    if (!value) {
      this.hm.set('');
      this.period.set('AM');
      return;
    }
    const split = splitValue(value);
    this.hm.set(split.hm);
    this.period.set(split.period);
  }

  private place(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const height = 260;
    const below = rect.bottom + 4;
    const above = rect.top - height - 4;
    const top = below + height > window.innerHeight && above > 0 ? above : below;
    this.pos.set({ top, left: rect.left, width: rect.width });
  }
}
