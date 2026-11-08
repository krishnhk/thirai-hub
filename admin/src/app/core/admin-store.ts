import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';

import { AdminApi } from './admin-api';
import { AuthService } from './auth.service';
import { Movie, NewShow, Screen, ScreenType, SeatLayout, Show, Theatre } from './models';

/**
 * The data the admin pages share: the theatres the admin can manage, the chosen theatre and its screens and shows.
 * Pages read these signals and call the actions; every change goes through `AdminApi`.
 */
@Injectable({ providedIn: 'root' })
export class AdminStore {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly theatres = signal<Theatre[]>([]);
  readonly movies = signal<Movie[]>([]);
  readonly theatreId = signal<number | null>(null);
  readonly screens = signal<Screen[]>([]);
  readonly shows = signal<Show[]>([]);
  readonly ready = signal(false);

  readonly theatre = computed(() => this.theatres().find((t) => t.id === this.theatreId()) ?? null);

  load(): void {
    this.api
      .theatres()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((all) => {
        // One login, one theatre: keep only the theatre this account manages.
        const mine = all.find((t) => t.id === this.auth.theatreId()) ?? all[0] ?? null;
        this.theatres.set(mine ? [mine] : []);
        this.api
          .movies()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((movies) => {
            this.movies.set(movies);
            this.ready.set(true);
            if (mine) this.selectTheatre(mine.id);
          });
      });
  }

  selectTheatre(theatreId: number): void {
    this.theatreId.set(theatreId);
    this.api
      .screens(theatreId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((screens) => this.screens.set(screens));
    this.api
      .shows(theatreId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((shows) => this.shows.set(shows));
  }

  addScreen(name: string, type: ScreenType, onDone: (screen: Screen) => void): void {
    const theatreId = this.theatreId();
    if (theatreId === null) return;
    this.api
      .addScreen(theatreId, name, type)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((screen) => {
        this.screens.update((list) => [...list, screen]);
        onDone(screen);
      });
  }

  saveLayout(screenId: number, layout: SeatLayout, onDone: (screen: Screen) => void): void {
    this.api
      .saveLayout(screenId, layout)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saved) => {
        this.screens.update((list) => list.map((s) => (s.id === saved.id ? saved : s)));
        onDone(saved);
      });
  }

  createShow(show: NewShow, onDone: (created: Show) => void): void {
    this.api
      .createShow(show)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((created) => {
        this.shows.update((list) => [...list, created]);
        onDone(created);
      });
  }

  publishShows(showIds: number[], onDone: (publishedIds: number[]) => void): void {
    this.api
      .publishShows(showIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((publishedIds) => {
        const published = new Set(publishedIds);
        this.shows.update((list) => list.map((s) => (published.has(s.id) ? { ...s, published: true } : s)));
        onDone(publishedIds);
      });
  }
}
