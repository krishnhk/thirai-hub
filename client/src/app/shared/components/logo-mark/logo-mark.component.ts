import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** ThiraiHub mark: a wide curved screen over rows of seats, in cinema red. */
@Component({
  selector: 'app-logo-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 9 64 54" [style.width.px]="width()" aria-hidden="true" focusable="false">
      <path d="M5 25Q32 4 59 25" fill="none" stroke="#E5484D" stroke-width="9" stroke-linecap="round" />
      <g fill="#E5484D">
        <circle cx="15" cy="45" r="5.5" />
        <circle cx="32" cy="45" r="5.5" />
        <circle cx="49" cy="45" r="5.5" />
        <circle cx="23.5" cy="57" r="5" />
        <circle cx="40.5" cy="57" r="5" />
      </g>
    </svg>
  `,
  styles: `
    :host { display: inline-flex; flex-shrink: 0; }
    svg { display: block; height: auto; }
  `,
})
export class LogoMarkComponent {
  readonly width = input(40);
}
