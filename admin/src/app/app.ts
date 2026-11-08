import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    <div class="toast-wrap" role="status" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class.bad]="t.bad">{{ t.text }}</div>
      }
    </div>
  `,
})
export class App {
  readonly toasts = inject(ToastService);
}
