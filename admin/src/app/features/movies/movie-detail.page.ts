import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ALL_THEATRES, AdminStore } from '../../core/admin-store';
import { addDays, formatDate, formatDay, formatDuration, formatMoneyShort, formatNumber, formatTime } from '../../core/format';
import { EmptyStateComponent, KpiCardComponent, MeterComponent, PageHeaderComponent, PaginatorComponent, SkeletonComponent, StatusBadgeComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { tableState } from '../../shared/table';
import { MOVIE_RUN_LABEL, movieRun, upcomingShowsByMovie } from './movie-data';
import { MovieFormComponent } from './movie-form.component';

/** One film: metadata, synopsis, credits, its numbers and its upcoming shows. */
@Component({
  selector: 'app-movie-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, KpiCardComponent, StatusBadgeComponent, EmptyStateComponent, SkeletonComponent, MeterComponent, PaginatorComponent, IconComponent, MovieFormComponent],
  template: `
    @if (movie(); as m) {
      <div class="page">
        <app-page-header [title]="m.title" [subtitle]="m.certification + ' · ' + formatDuration(m.runtime) + ' · ' + m.genres.join(', ')" [crumbs]="[{ label: 'Movies', link: '/movies' }, { label: m.title }]">
          <button type="button" class="btn" (click)="formOpen.set(true)"><app-icon name="edit" />Edit film</button>
          <a class="btn primary" routerLink="/shows/new"><app-icon name="plus" />Schedule a show</a>
        </app-page-header>

        @if (store.loading()) {
          <section class="card"><app-skeleton [rows]="8" /></section>
        } @else {
          <div class="top">
            <div class="poster">@if (m.posterUrl) { <img [src]="m.posterUrl" [alt]="m.title + ' poster'" /> } @else { <span>{{ m.title }}</span> }</div>
            <div class="stack">
              <div class="kpis">
                <app-kpi-card label="Upcoming shows" icon="calendar" [value]="upcoming().length" [hint]="published() + ' published · ' + (upcoming().length - published()) + ' draft'" />
                <app-kpi-card label="Sold, last 7 days" icon="ticket" [value]="week().seats" [hint]="week().shows + ' shows run'" />
                <app-kpi-card label="Gross, 7 days" icon="rupee" [value]="week().gross" [hint]="week().occupancy + '% average occupancy'" />
              </div>
              <section class="card">
                <div class="card-head"><h2>Film details</h2><span class="badge {{ run().tone }}">{{ run().label }}</span></div>
                <div class="card-body cols">
                  <dl class="facts">
                    <dt>Release date</dt><dd>{{ formatDate(m.releaseDate) }}</dd>
                    <dt>Runtime</dt><dd>{{ formatDuration(m.runtime) }} ({{ m.runtime }} min)</dd>
                    <dt>Certification</dt><dd><span class="tag">{{ m.certification }}</span></dd>
                    <dt>Languages</dt><dd>{{ m.languages.join(', ') }}</dd>
                    <dt>Formats</dt><dd><div class="tags">@for (f of m.formats; track f) { <span class="tag">{{ f }}</span> }</div></dd>
                  </dl>
                  <dl class="facts">
                    <dt>Genre</dt><dd>{{ m.genres.join(', ') }}</dd>
                    <dt>Director</dt><dd>{{ m.director }}</dd>
                    <dt>Cast</dt><dd class="wrap">{{ m.cast.join(', ') || '—' }}</dd>
                  </dl>
                </div>
                <div class="card-foot synopsis"><p class="soft">{{ m.synopsis }}</p></div>
              </section>
            </div>
          </div>

          <section class="card">
            <div class="card-head">
              <div><h2>Upcoming shows</h2><p class="muted tiny">{{ scopeLabel() }}</p></div>
              <a class="btn sm" routerLink="/shows/new"><app-icon name="plus" />Schedule a show</a>
            </div>
            @if (table.total()) {
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>Start</th><th>Screen</th><th>Version</th><th>Status</th><th class="num">Sold</th><th>Occupancy</th></tr></thead>
                  <tbody>
                    @for (s of table.rows(); track s.id) {
                      <tr class="clickable" (click)="router.navigate(['/shows', s.id])">
                        <td class="nowrap"><a class="plain" [routerLink]="['/shows', s.id]" (click)="$event.stopPropagation()"><strong>{{ formatTime(s.start) }}</strong></a><small class="block muted">{{ formatDay(s.start) }}</small></td>
                        <td><span class="nowrap">{{ store.screen(s.screenId)?.name }}</span><small class="block muted">{{ store.theatre(s.theatreId)?.name }}</small></td>
                        <td class="nowrap small">{{ s.format }} · {{ s.language }}</td>
                        <td><div class="badges"><app-status-badge [status]="s.publication" />@if (store.showStatus(s) === 'running') { <app-status-badge status="running" /> }</div></td>
                        <td class="num">{{ store.soldSeats(s.id) }} / {{ store.capacity(s.screenId) }}</td>
                        <td><app-meter [value]="store.occupancy(s)" /></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <app-paginator [(page)]="table.page" [(pageSize)]="table.size" [total]="table.total()" />
            } @else {
              <app-empty-state icon="calendar" title="No upcoming shows" [text]="run().label === 'Upcoming release' ? 'This film releases on ' + formatDate(m.releaseDate) + '. Schedule shows from that date.' : 'Schedule a show to put this film on sale.'">
                <a class="btn primary" routerLink="/shows/new"><app-icon name="plus" />Schedule a show</a>
              </app-empty-state>
            }
          </section>
        }
      </div>

      @if (formOpen()) {
        <app-movie-form [movie]="m" (closed)="formOpen.set(false)" />
      }
    } @else {
      <div class="page">
        <app-page-header title="Film not found" [crumbs]="[{ label: 'Movies', link: '/movies' }, { label: 'Not found' }]" />
        <section class="card">
          <app-empty-state icon="movie" title="This film is not in the catalogue" text="The link may be wrong.">
            <a class="btn" routerLink="/movies">Back to movies</a>
          </app-empty-state>
        </section>
      </div>
    }
  `,
  styles: `
    .top { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (max-width: 900px) { .top { grid-template-columns: 140px minmax(0, 1fr); } }
    @media (max-width: 640px) { .top { grid-template-columns: minmax(0, 1fr); } .poster { max-width: 160px; } .kpis { grid-template-columns: minmax(0, 1fr); } }
    .poster { display: grid; place-items: center; aspect-ratio: 2 / 3; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface-3); overflow: hidden; color: var(--text-muted); font-weight: 700; text-align: center; }
    .poster img { width: 100%; height: 100%; object-fit: cover; }
    .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    @media (max-width: 1100px) { .num, .data-table th, .data-table td { padding-left: 10px; padding-right: 10px; } }
    .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; }
    @media (max-width: 1100px) { .cols { grid-template-columns: minmax(0, 1fr); } }
    .synopsis { display: block; font-size: 0.86rem; line-height: 1.55; }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .wrap { font-weight: 500; }
    .block { display: block; font-size: 0.74rem; }
    .badges { display: flex; flex-wrap: nowrap; gap: 4px; }
    .plain { color: var(--text); }
    .plain:hover { text-decoration: underline; }
  `,
})
export class MovieDetailPage {
  protected readonly store = inject(AdminStore);
  protected readonly router = inject(Router);

  readonly movieId = input.required<string>();

  protected readonly formatDate = formatDate;
  protected readonly formatDay = formatDay;
  protected readonly formatTime = formatTime;
  protected readonly formatDuration = formatDuration;

  readonly formOpen = signal(false);
  readonly movie = computed(() => this.store.movie(this.movieId()));

  readonly upcoming = computed(() => upcomingShowsByMovie(this.store).get(this.movieId()) ?? []);
  readonly published = computed(() => this.upcoming().filter((s) => s.publication === 'published').length);
  readonly run = computed(() => {
    const m = this.movie();
    return MOVIE_RUN_LABEL[m ? movieRun(m, this.upcoming().length, this.store.now()) : 'archived'];
  });
  readonly scopeLabel = computed(() => {
    const id = this.store.selectedTheatreId();
    return id === ALL_THEATRES ? 'All theatres, excluding cancelled shows' : `${this.store.theatre(id)?.name ?? ''} only`;
  });

  /** Shows of this film that started in the last seven days, in scope. */
  readonly week = computed(() => {
    const now = this.store.now();
    const from = addDays(now, -7);
    const shows = this.store.scopedShows().filter((s) => s.movieId === this.movieId() && !s.cancellation && s.publication === 'published' && s.start >= from && s.start <= now);
    const seats = shows.reduce((n, s) => n + this.store.soldSeats(s.id), 0);
    const cap = shows.reduce((n, s) => n + this.store.capacity(s.screenId), 0);
    return {
      shows: shows.length,
      seats: formatNumber(seats),
      gross: formatMoneyShort(shows.reduce((n, s) => n + this.store.revenue(s.id), 0)),
      occupancy: cap ? Math.round((seats / cap) * 100) : 0,
    };
  });

  readonly table = tableState(this.upcoming, { start: (s) => s.start }, 'start');
}
