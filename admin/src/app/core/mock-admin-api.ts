import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import { AdminApi } from './admin-api';
import { copyLayout, defaultLayout, pricesFromBase } from './layout';
import { Movie, NewShow, Screen, ScreenType, SeatLayout, Show, Theatre } from './models';

/** Example data for the prototype. Replaced by the real API once the backend exists. */
const THEATRES: Theatre[] = [
  { id: 4, name: 'PVR VR Chennai', address: 'VR Chennai Mall, Anna Nagar West', logoUrl: '/theatres/pvr.png' },
  { id: 7, name: 'AGS Cinemas OMR', address: 'Old Mahabalipuram Road, Navlur', logoUrl: '/theatres/ags-logo.png' },
  { id: 8, name: 'Ega Multiplex', address: '810 Poonamallee High Road, Kilpauk', logoUrl: '/theatres/ega-logo.png' },
];

const MOVIES: Movie[] = [
  { id: 1, title: 'Karuppu', minutes: 152, posterUrl: '/posters/karuppu.jpg' },
  { id: 2, title: 'Dragon', minutes: 155, posterUrl: '/posters/dragon.jpg' },
  { id: 3, title: 'Coolie', minutes: 170, posterUrl: '/posters/coolie.jpg' },
  { id: 4, title: 'Good Bad Ugly', minutes: 139, posterUrl: '/posters/good-bad-ugly.jpg' },
  { id: 5, title: 'Scene', minutes: 149, posterUrl: '/posters/scene.jpg' },
];

function at(hour: number, minute: number, plusDays = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * In-memory stand-in for the admin API. Every call returns a copy, so the app cannot change the stored data
 * except through the methods here, the same as it will with a real server.
 */
@Injectable()
export class MockAdminApi extends AdminApi {
  private screenRows: Screen[] = [
    { id: 41, theatreId: 4, name: 'Audi 1', type: 'Regular', layout: defaultLayout(8, 12) },
    { id: 42, theatreId: 4, name: 'Audi 2', type: 'PXL', layout: defaultLayout(6, 10) },
    { id: 71, theatreId: 7, name: 'Screen 1', type: 'IMAX', layout: defaultLayout(6, 10) },
    { id: 81, theatreId: 8, name: 'Hall A', type: 'Regular', layout: defaultLayout(7, 11) },
    { id: 82, theatreId: 8, name: 'Hall B', type: '4DX', layout: defaultLayout(5, 9) },
  ];

  private showRows: Show[] = [
    { id: 1, theatreId: 4, screenId: 41, movieId: 1, start: at(10, 30), format: '2D', language: 'Tamil', prices: pricesFromBase(180), published: true },
    { id: 2, theatreId: 4, screenId: 42, movieId: 2, start: at(14, 0), format: '2D', language: 'Telugu', prices: pricesFromBase(220), published: true },
    { id: 3, theatreId: 4, screenId: 41, movieId: 3, start: at(19, 45), format: '3D', language: 'Tamil', prices: pricesFromBase(250), published: true },
    { id: 4, theatreId: 4, screenId: 41, movieId: 5, start: at(10, 30, 1), format: '2D', language: 'Tamil', prices: pricesFromBase(180), published: false },
  ];

  private nextId = 100;

  theatres(): Observable<Theatre[]> {
    return of(THEATRES.map((t) => ({ ...t })));
  }

  movies(): Observable<Movie[]> {
    return of(MOVIES.map((m) => ({ ...m })));
  }

  screens(theatreId: number): Observable<Screen[]> {
    return of(this.copyScreens(this.screenRows.filter((s) => s.theatreId === theatreId)));
  }

  shows(theatreId: number): Observable<Show[]> {
    return of(this.copyShows(this.showRows.filter((s) => s.theatreId === theatreId)));
  }

  addScreen(theatreId: number, name: string, type: ScreenType): Observable<Screen> {
    const screen: Screen = { id: this.nextId++, theatreId, name, type, layout: defaultLayout(6, 10) };
    this.screenRows.push(screen);
    return of(this.copyScreens([screen])[0]);
  }

  saveLayout(screenId: number, layout: SeatLayout): Observable<Screen> {
    const screen = this.screenRows.find((s) => s.id === screenId);
    if (!screen) throw new Error(`Screen ${screenId} does not exist.`);
    screen.layout = copyLayout(layout);
    return of(this.copyScreens([screen])[0]);
  }

  createShow(show: NewShow): Observable<Show> {
    const created: Show = { ...show, id: this.nextId++, start: new Date(show.start), prices: { ...show.prices } };
    this.showRows.push(created);
    return of(this.copyShows([created])[0]);
  }

  publishShows(showIds: number[]): Observable<number[]> {
    const now = new Date();
    const published: number[] = [];
    for (const show of this.showRows) {
      if (!showIds.includes(show.id) || show.published) continue;
      if (show.start <= now) continue;
      show.published = true;
      published.push(show.id);
    }
    return of(published);
  }

  private copyScreens(list: Screen[]): Screen[] {
    return list.map((s) => ({ ...s, layout: copyLayout(s.layout) }));
  }

  private copyShows(list: Show[]): Show[] {
    return list.map((s) => ({ ...s, start: new Date(s.start), prices: { ...s.prices } }));
  }
}
