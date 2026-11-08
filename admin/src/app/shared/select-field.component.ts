import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, forwardRef, inject, input, model, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  value: string;
  label: string;
}

let nextId = 0;

/**
 * A dropdown drawn by the app, not by the browser, so it matches the rest of the admin. Works with reactive forms.
 * Keyboard: arrows move, Enter picks, Escape closes, Tab leaves.
 */
@Component({
  selector: 'app-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectFieldComponent), multi: true }],
  host: {
    '(focusout)': 'onFocusOut($event)',
    '(keydown)': 'onKey($event)',
  },
  template: `
    <button
      type="button"
      class="trigger"
      [id]="inputId()"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listId"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      <span [class.placeholder]="!selectedLabel()">{{ selectedLabel() || placeholder() }}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" /></svg>
    </button>

    @if (open()) {
      <ul
        [id]="listId"
        class="list"
        role="listbox"
        tabindex="-1"
        [style.top.px]="pos().top"
        [style.left.px]="pos().left"
        [style.width.px]="pos().width"
      >
        @for (o of options(); track o.value; let i = $index) {
          <li
            role="option"
            [attr.aria-selected]="o.value === value()"
            [class.active]="i === active()"
            (mousedown)="$event.preventDefault(); pick(i)"
          >
            <span>{{ o.label }}</span>
            @if (o.value === value()) {
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            }
          </li>
        } @empty {
          <li class="none">Nothing to choose from.</li>
        }
      </ul>
    }
  `,
  styles: `
    :host { position: relative; display: block; min-width: 0; }
    .trigger {
      width: 100%;
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      font-weight: 500;
      text-align: left;
    }
    .trigger:hover:not(:disabled) { border-color: var(--text-muted); }
    .trigger:focus-visible,
    .trigger[aria-expanded="true"] { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .trigger:disabled { opacity: 0.5; cursor: not-allowed; }
    .trigger > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .trigger .placeholder { color: var(--text-muted); }
    .trigger svg { width: 16px; height: 16px; flex-shrink: 0; fill: none; stroke: var(--text-muted); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 120ms ease; }
    .trigger[aria-expanded="true"] svg { transform: rotate(180deg); }
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
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 36px;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      color: var(--text);
    }
    .list li.active { background: var(--surface-2); }
    .list li[aria-selected="true"] { font-weight: 700; }
    .list li svg { width: 16px; height: 16px; flex-shrink: 0; fill: none; stroke: var(--brand); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .list li.none { color: var(--text-muted); cursor: default; }
  `,
})
export class SelectFieldComponent implements ControlValueAccessor {
  readonly options = input<SelectOption[]>([]);
  /** The id of the button inside, so a label's `for` reaches it. */
  readonly inputId = input('');
  readonly placeholder = input('Choose');

  readonly listId = `select-list-${nextId++}`;
  /** The chosen value. Parents can bind it with [value] and listen with (valueChange). */
  readonly value = model('');
  readonly open = signal(false);
  readonly active = signal(0);
  readonly disabled = signal(false);
  readonly selectedLabel = computed(() => this.options().find((o) => o.value === this.value())?.label ?? '');

  /** Where the list is drawn: fixed to the viewport, above the trigger when there is no room below. */
  readonly pos = signal({ top: 0, left: 0, width: 0 });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    // A fixed list would drift when the page scrolls, so close it instead.
    // Scrolling inside the list itself is fine; scrolling anything else would leave the list floating.
    const close = (event: Event) => {
      if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
    };
    document.addEventListener('scroll', close, { capture: true, passive: true });
    inject(DestroyRef).onDestroy(() => document.removeEventListener('scroll', close, { capture: true }));
  }

  private place(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const height = Math.min(260, this.options().length * 38 + 12);
    const below = rect.bottom + 4;
    const above = rect.top - height - 4;
    const top = below + height > window.innerHeight && above > 0 ? above : below;
    this.pos.set({ top, left: rect.left, width: rect.width });
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

  toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    const index = this.options().findIndex((o) => o.value === this.value());
    this.active.set(Math.max(index, 0));
    this.place();
    this.open.set(true);
    // Bring the chosen option into view, so the list does not always open at the top.
    setTimeout(() => this.host.nativeElement.querySelector('li[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  }

  pick(index: number): void {
    const option = this.options()[index];
    if (!option) return;
    this.value.set(option.value);
    this.onChange(option.value);
    this.onTouched();
    this.open.set(false);
  }

  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.host.nativeElement.contains(next)) return;
    this.open.set(false);
    this.onTouched();
  }

  onKey(event: KeyboardEvent): void {
    const count = this.options().length;
    if (!this.open()) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.toggle();
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.active.set(Math.min(this.active() + 1, count - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.active.set(Math.max(this.active() - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.pick(this.active());
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      this.open.set(false);
    }
  }
}
