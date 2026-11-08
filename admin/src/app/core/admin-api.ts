import { Observable } from 'rxjs';

import { Movie, NewShow, Prices, Screen, ScreenType, SeatLayout, Show, Theatre } from './models';

/**
 * Everything the admin site reads and writes. The app talks only to this contract. The prototype's in-memory
 * version is `MockAdminApi`; the .NET API with PostgreSQL will provide an HTTP version of the same methods.
 */
export abstract class AdminApi {
  abstract theatres(): Observable<Theatre[]>;
  abstract movies(): Observable<Movie[]>;
  abstract screens(theatreId: number): Observable<Screen[]>;
  abstract shows(theatreId: number): Observable<Show[]>;
  abstract addScreen(theatreId: number, name: string, type: ScreenType): Observable<Screen>;
  abstract saveLayout(screenId: number, layout: SeatLayout): Observable<Screen>;
  abstract createShow(show: NewShow): Observable<Show>;
  /** Publishes the given shows. Returns the ids that were published; shows that have started are skipped. */
  abstract publishShows(showIds: number[]): Observable<number[]>;
}

export type { Prices };
