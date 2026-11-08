import { Injectable } from '@angular/core';

import { copyLayout } from './layout';
import { Screen, SeatLayout } from './models';

/** Two layouts are the same when they draw and price the same, whether or not they list their defaults. */
export function sameLayout(a: SeatLayout, b: SeatLayout): boolean {
  return JSON.stringify(copyLayout(a)) === JSON.stringify(copyLayout(b));
}

/**
 * Unsaved layout changes. The designer keeps a screen's work here when the admin leaves it, so coming back finds the
 * changes still there. Signing out clears everything.
 */
@Injectable({ providedIn: 'root' })
export class LayoutDrafts {
  private readonly drafts = new Map<number, SeatLayout>();

  get(screenId: number): SeatLayout | undefined {
    return this.drafts.get(screenId);
  }

  set(screenId: number, layout: SeatLayout): void {
    this.drafts.set(screenId, copyLayout(layout));
  }

  clear(screenId: number): void {
    this.drafts.delete(screenId);
  }

  clearAll(): void {
    this.drafts.clear();
  }

  /** True when a screen has unsaved changes that differ from its saved layout. */
  isUnsaved(screen: Screen): boolean {
    const draft = this.drafts.get(screen.id);
    return !!draft && !sameLayout(draft, screen.layout);
  }
}
