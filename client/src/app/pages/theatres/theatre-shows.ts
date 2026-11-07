import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Movie, ShowtimeWithRefs, Theater } from '../../core/models/catalog.model';
import { CatalogService } from '../../core/services/catalog.service';
import { DayStripComponent, buildStripDays, dayKey } from '../../shared/components/day-strip/day-strip.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { TheatreLogoComponent } from '../../shared/components/theatre-logo/theatre-logo.component';
import { ShowTimePipe } from '../../shared/pipes/date.pipes';

/** The shows of one language within a film, on the day being looked at. */
interface LanguageShows {
  language: string;
  showtimes: ShowtimeWithRefs[];
}

/** One film on the day being looked at, with its shows split by language. */
interface FilmShows {
  movie: Movie;
  languages: LanguageShows[];
}

/** One theatre's shows, day by day: pick a day, then its shows grouped by language and film. */
@Component({
  selector: 'app-theatre-shows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DayStripComponent,
    EmptyStateComponent,
    LoadingSpinnerComponent,
    TheatreLogoComponent,
    ShowTimePipe,
  ],
  templateUrl: './theatre-shows.html',
  styleUrl: './theatre-shows.css',
})
export class TheatreShowsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly theater = signal<Theater | null>(null);
  readonly showtimes = signal<ShowtimeWithRefs[]>([]);
  readonly dates = signal<string[]>([]);
  /** The day being looked at, as yyyy-mm-dd. */
  readonly selectedDate = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly stripDays = computed(() => buildStripDays(new Set(this.dates())));

  /** The films on the selected day; under each, its shows split by language. */
  readonly filmsOnDay = computed<FilmShows[]>(() => {
    const day = this.selectedDate();
    const films = new Map<number, { movie: Movie; languages: Map<string, ShowtimeWithRefs[]> }>();
    for (const showtime of this.showtimes()) {
      if (day && dayKey(new Date(showtime.showDateTime)) !== day) {
        continue;
      }
      const film = films.get(showtime.movieId) ?? { movie: showtime.movie, languages: new Map() };
      const shows = film.languages.get(showtime.language) ?? [];
      shows.push(showtime);
      film.languages.set(showtime.language, shows);
      films.set(showtime.movieId, film);
    }
    return [...films.values()].map((film) => ({
      movie: film.movie,
      languages: [...film.languages.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([language, showtimes]) => ({ language, showtimes })),
    }));
  });

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.load(Number(params.get('theatreId'))));
  }

  selectDate(day: string): void {
    this.selectedDate.set(day);
  }

  goToSeats(showtime: ShowtimeWithRefs): void {
    void this.router.navigate(['/book', showtime.id, 'seats']);
  }

  private load(theaterId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.catalog.getTheatreShows(theaterId).subscribe({
      next: (response) => {
        this.theater.set(response.theater);
        this.showtimes.set(response.showtimes);
        this.dates.set(response.dates);
        this.selectedDate.set(this.firstDay(response.dates));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('We could not load this theatre right now.');
        this.loading.set(false);
      },
    });
  }

  /** Today, or the first day after it that has shows; otherwise the first day there is. */
  private firstDay(dates: string[]): string | null {
    const today = dayKey(new Date());
    return dates.find((day) => day >= today) ?? dates[0] ?? null;
  }
}
