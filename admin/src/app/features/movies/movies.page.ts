import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AdminStore } from '../../core/admin-store';
import { formatDate, formatDuration } from '../../core/format';
import { Movie, PROJECTION_FORMATS } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { tableState } from '../../shared/table';
import { EmptyStateComponent, PageHeaderComponent, PaginatorComponent, SkeletonComponent, SortHeaderComponent } from '../../shared/ui';
import { MOVIE_RUN_LABEL, MovieRun, movieRun, upcomingShowsByMovie } from './movie-data';
import { MovieFormComponent } from './movie-form.component';

interface Row { movie: Movie; run: MovieRun; upcoming: number; }

/** The film catalogue used for scheduling, as poster cards or a table. */
@Component({
  selector: 'app-movies-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, EmptyStateComponent, SkeletonComponent, PaginatorComponent, SortHeaderComponent, IconComponent, MovieFormComponent],
  template: `
    <div class="page">
      <app-page-header title="Movies" [subtitle]="summary()">
        <button type="button" class="btn primary" (click)="formOpen.set(true)"><app-icon name="plus" />Add film</button>
      </app-page-header>

      <section class="card">
        <div class="bar">
          <div class="segmented" role="group" aria-label="Release status">
            @for (r of runs; track r.id) {
              <button type="button" [attr.aria-pressed]="run() === r.id" (click)="run.set(r.id); table.reset()">{{ r.label }} <span class="muted">{{ runCounts()[r.id] }}</span></button>
            }
          </div>
          <span class="spacer"></span>
          <div class="segmented" role="group" aria-label="View">
            <button type="button" [attr.aria-pressed]="view() === 'grid'" aria-label="Poster grid" title="Poster grid" (click)="view.set('grid')"><app-icon name="grid" /></button>
            <button type="button" [attr.aria-pressed]="view() === 'table'" aria-label="Table" title="Table" (click)="view.set('table')"><app-icon name="list" /></button>
          </div>
        </div>
        <div class="filters">
          <div class="field grow">
            <label for="m-search">Search</label>
            <div class="search-input"><app-icon name="search" /><input id="m-search" class="input" type="search" placeholder="Title, director or cast" [value]="query()" (input)="query.set($any($event.target).value); table.reset()" /></div>
          </div>
          <div class="field">
            <label for="m-lang">Language</label>
            <select id="m-lang" class="select" [value]="language()" (change)="language.set($any($event.target).value); table.reset()">
              <option value="">All languages</option>
              @for (l of languages(); track l) { <option [value]="l">{{ l }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="m-genre">Genre</label>
            <select id="m-genre" class="select" [value]="genre()" (change)="genre.set($any($event.target).value); table.reset()">
              <option value="">All genres</option>
              @for (g of genres(); track g) { <option [value]="g">{{ g }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="m-format">Format</label>
            <select id="m-format" class="select" [value]="format()" (change)="format.set($any($event.target).value); table.reset()">
              <option value="">All formats</option>
              @for (f of formats; track f) { <option [value]="f">{{ f }}</option> }
            </select>
          </div>
          @if (filtered().length !== rows().length) {
            <button type="button" class="btn ghost" (click)="clear()">Clear</button>
          }
        </div>

        @if (store.loading()) {
          <app-skeleton [rows]="6" />
        } @else if (!table.total()) {
          <app-empty-state icon="movie" title="No films match" text="Clear the filters, or add the film to the catalogue.">
            <button type="button" class="btn" (click)="clear()">Clear filters</button>
          </app-empty-state>
        } @else if (view() === 'grid') {
          <div class="grid">
            @for (r of table.rows(); track r.movie.id) {
              <a class="tile" [routerLink]="['/movies', r.movie.id]">
                <div class="poster">
                  @if (r.movie.posterUrl) { <img [src]="r.movie.posterUrl" [alt]="r.movie.title + ' poster'" loading="lazy" /> } @else { <span>{{ r.movie.title }}</span> }
                  <span class="cert">{{ r.movie.certification }}</span>
                </div>
                <div class="meta">
                  <strong class="truncate">{{ r.movie.title }}</strong>
                  <small class="truncate">{{ formatDuration(r.movie.runtime) }} · {{ r.movie.languages.join(', ') }}</small>
                  <small class="truncate">{{ r.movie.genres.join(', ') }}</small>
                  <div class="row-wrap foot">
                    <span class="badge {{ runInfo[r.run].tone }}">{{ runInfo[r.run].label }}</span>
                    @if (r.upcoming) { <span class="muted tiny">{{ r.upcoming }} shows</span> }
                  </div>
                </div>
              </a>
            }
          </div>
          <app-paginator [(page)]="table.page" [(pageSize)]="table.size" [total]="table.total()" />
        } @else {
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th><app-sort-header [active]="table.isSorted('title')" [dir]="table.dir()" (toggle)="table.sortBy('title')">Film</app-sort-header></th>
                  <th>Languages</th>
                  <th class="col-genre">Genre</th>
                  <th class="num"><app-sort-header [active]="table.isSorted('runtime')" [dir]="table.dir()" (toggle)="table.sortBy('runtime')">Runtime</app-sort-header></th>
                  <th>Cert.</th>
                  <th><app-sort-header [active]="table.isSorted('release')" [dir]="table.dir()" (toggle)="table.sortBy('release')">Release</app-sort-header></th>
                  <th class="col-fmt">Formats</th>
                  <th class="num"><app-sort-header [active]="table.isSorted('upcoming')" [dir]="table.dir()" (toggle)="table.sortBy('upcoming')">Upcoming shows</app-sort-header></th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (r of table.rows(); track r.movie.id) {
                  <tr class="clickable" (click)="router.navigate(['/movies', r.movie.id])">
                    <td>
                      <div class="cell-title">
                        @if (r.movie.posterUrl) { <img class="poster-thumb" [src]="r.movie.posterUrl" alt="" /> } @else { <span class="poster-thumb"></span> }
                        <span class="min0"><a class="plain" [routerLink]="['/movies', r.movie.id]" (click)="$event.stopPropagation()"><strong>{{ r.movie.title }}</strong></a><small>{{ r.movie.director }}</small></span>
                      </div>
                    </td>
                    <td class="small">{{ r.movie.languages.join(', ') }}</td>
                    <td class="small col-genre">{{ r.movie.genres.join(', ') }}</td>
                    <td class="num">{{ formatDuration(r.movie.runtime) }}</td>
                    <td><span class="tag">{{ r.movie.certification }}</span></td>
                    <td class="nowrap">{{ formatDate(r.movie.releaseDate) }}</td>
                    <td class="col-fmt"><div class="tags">@for (f of r.movie.formats; track f) { <span class="tag">{{ f }}</span> }</div></td>
                    <td class="num">{{ r.upcoming || '—' }}</td>
                    <td><span class="badge {{ runInfo[r.run].tone }}">{{ runInfo[r.run].label }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-paginator [(page)]="table.page" [(pageSize)]="table.size" [total]="table.total()" />
        }
      </section>
    </div>

    @if (formOpen()) {
      <app-movie-form (closed)="formOpen.set(false)" (saved)="router.navigate(['/movies', $event])" />
    }
  `,
  styles: `
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
    .segmented button { display: inline-flex; align-items: center; gap: 4px; }
    .segmented button span { font-size: 0.74rem; }
    .segmented app-icon { width: 16px; height: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; padding: 16px; }
    .tile { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2); color: inherit; overflow: hidden; }
    .tile:hover { border-color: var(--border-strong); background: var(--surface-hover); }
    .poster { position: relative; display: grid; place-items: center; aspect-ratio: 2 / 3; background: var(--surface-3); color: var(--text-muted); font-weight: 700; text-align: center; padding: 0; }
    .poster img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .poster > span:first-child { padding: 12px; }
    .cert { position: absolute; top: 6px; right: 6px; padding: 1px 6px; border-radius: var(--radius-sm); background: var(--chip-bg); color: var(--text-soft); font-size: 0.68rem; font-weight: 700; }
    .meta { display: flex; flex-direction: column; gap: 2px; padding: 9px 10px 10px; min-width: 0; }
    .meta strong { font-size: 0.86rem; }
    .meta small { color: var(--text-muted); font-size: 0.74rem; }
    .foot { margin-top: 6px; gap: 6px; }
    .min0 { min-width: 0; }
    .plain { color: inherit; }
    .plain:hover strong { text-decoration: underline; }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; max-width: 220px; }
    @media (max-width: 1280px) { .col-fmt { display: none; } }
    @media (max-width: 1100px) { .col-genre { display: none; } }
  `,
})
export class MoviesPage {
  protected readonly store = inject(AdminStore);
  protected readonly router = inject(Router);

  protected readonly formatDate = formatDate;
  protected readonly formatDuration = formatDuration;
  readonly runInfo = MOVIE_RUN_LABEL;
  readonly formats = PROJECTION_FORMATS;
  readonly runs: { id: '' | MovieRun; label: string }[] = [
    { id: '', label: 'All' }, { id: 'now', label: 'Now showing' }, { id: 'upcoming', label: 'Upcoming' }, { id: 'archived', label: 'Archived' },
  ];

  readonly view = signal<'grid' | 'table'>('grid');
  readonly query = signal('');
  readonly language = signal('');
  readonly genre = signal('');
  readonly format = signal('');
  readonly run = signal<'' | MovieRun>('');
  readonly formOpen = signal(false);

  readonly languages = computed(() => [...new Set(this.store.movies().flatMap((m) => m.languages))].sort());
  readonly genres = computed(() => [...new Set(this.store.movies().flatMap((m) => m.genres))].sort());

  readonly rows = computed<Row[]>(() => {
    const upcoming = upcomingShowsByMovie(this.store);
    const now = this.store.now();
    return this.store.movies().map((movie) => {
      const n = upcoming.get(movie.id)?.length ?? 0;
      return { movie, upcoming: n, run: movieRun(movie, n, now) };
    });
  });

  /** Rows matching every filter except the release status, so the status counts stay useful. */
  private readonly baseFiltered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const l = this.language();
    const g = this.genre();
    const f = this.format();
    return this.rows().filter(({ movie: m }) =>
      (!l || m.languages.includes(l)) && (!g || m.genres.includes(g)) && (!f || m.formats.includes(f as Movie['formats'][number])) &&
      (!q || [m.title, m.director, ...m.cast].some((x) => x.toLowerCase().includes(q))));
  });

  readonly runCounts = computed(() => {
    const rows = this.baseFiltered();
    return { '': rows.length, now: rows.filter((r) => r.run === 'now').length, upcoming: rows.filter((r) => r.run === 'upcoming').length, archived: rows.filter((r) => r.run === 'archived').length };
  });

  readonly filtered = computed(() => {
    const run = this.run();
    return this.baseFiltered().filter((r) => !run || r.run === run);
  });

  readonly table = tableState(this.filtered, {
    title: (r) => r.movie.title,
    runtime: (r) => r.movie.runtime,
    release: (r) => r.movie.releaseDate,
    upcoming: (r) => r.upcoming,
    status: (r) => ['now', 'upcoming', 'archived'].indexOf(r.run) * 1e13 - r.movie.releaseDate.getTime(),
  }, 'status', 'asc', 25);

  readonly summary = computed(() => {
    return `${this.store.movies().length} films · ${this.rows().filter((r) => r.run === 'now').length} now showing · ${this.rows().filter((r) => r.run === 'upcoming').length} upcoming`;
  });

  clear(): void {
    this.query.set(''); this.language.set(''); this.genre.set(''); this.format.set(''); this.run.set(''); this.table.reset();
  }
}
