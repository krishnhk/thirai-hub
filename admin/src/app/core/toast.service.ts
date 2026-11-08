import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  bad: boolean;
}

/** Short messages that confirm an action or explain why it did not happen. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  show(text: string, bad = false): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, text, bad }]);
    setTimeout(() => this.toasts.update((list) => list.filter((t) => t.id !== id)), 3200);
  }
}
