import { AdminStore } from '../../core/admin-store';
import { startOfDay } from '../../core/format';
import { Movie, Show } from '../../core/models';

export type MovieRun = 'now' | 'upcoming' | 'archived';

export const MOVIE_RUN_LABEL: Record<MovieRun, { label: string; tone: string }> = {
  now: { label: 'Now showing', tone: 'success' },
  upcoming: { label: 'Upcoming release', tone: 'info' },
  archived: { label: 'Archived', tone: 'neutral' },
};

/** Posters already in the app's public folder. */
export const POSTER_FILES = [
  '29', 'baththa', 'coolie', 'couple-friendly', 'dc', 'dorothy', 'dragon', 'good-bad-ugly', 'jailer-2', 'jana-nayagan',
  'karuppu', 'madharaasi', 'modha-rathiri', 'retro', 'scene', 'thaai-kizhavi', 'thug-life', 'with-love',
];

export const LANGUAGES = ['Tamil', 'Telugu', 'Hindi', 'Malayalam', 'Kannada', 'English'];
export const GENRES = ['Action', 'Comedy', 'Drama', 'Thriller', 'Crime', 'Romance', 'Fantasy', 'Horror', 'Family', 'Animation', 'Science fiction', 'Documentary'];

/** Upcoming (not yet ended, not cancelled) shows of each film, in the console's scope. */
export function upcomingShowsByMovie(store: AdminStore): Map<string, Show[]> {
  const now = store.now();
  const map = new Map<string, Show[]>();
  for (const s of store.scopedShows()) {
    if (s.cancellation || store.showEnd(s) <= now) continue;
    const list = map.get(s.movieId);
    if (list) list.push(s); else map.set(s.movieId, [s]);
  }
  for (const list of map.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime());
  return map;
}

/**
 * Upcoming: not released yet. Now showing: released and has upcoming shows. Archived: released
 * with nothing scheduled.
 */
export function movieRun(movie: Movie, upcomingShows: number, now: Date): MovieRun {
  if (startOfDay(movie.releaseDate) > startOfDay(now)) return 'upcoming';
  return upcomingShows ? 'now' : 'archived';
}
