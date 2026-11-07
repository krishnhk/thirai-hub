import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  MovieListResponse,
  SearchResponse,
  SeatMapResponse,
  ShowtimeListResponse,
  TheatreShowsResponse,
  ShowtimeWithRefs,
} from '../models/catalog.model';
import { API_BASE } from './auth.service';

export interface MovieQuery {
  city?: string;
  date?: string;
  genre?: string;
  language?: string;
  timing?: string;
  search?: string;
}

export interface ShowtimeQuery {
  city?: string;
  theaterId?: string | number;
  date?: string;
  format?: string;
  language?: string;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  getMovies(query: MovieQuery = {}): Observable<MovieListResponse> {
    return this.http.get<MovieListResponse>(`${API_BASE}/movies`, {
      params: this.toParams(query),
    });
  }

  search(q: string, city?: string): Observable<SearchResponse> {
    return this.http.get<SearchResponse>(`${API_BASE}/search`, {
      params: this.toParams({ q: q.trim(), city }),
    });
  }

  getShowtimes(movieId: number, query: ShowtimeQuery = {}): Observable<ShowtimeListResponse> {
    return this.http.get<ShowtimeListResponse>(`${API_BASE}/movies/${movieId}/showtimes`, {
      params: this.toParams(query),
    });
  }

  getTheatreShows(theaterId: number): Observable<TheatreShowsResponse> {
    return this.http.get<TheatreShowsResponse>(`${API_BASE}/theatres/${theaterId}/showtimes`);
  }

  getSeats(showtimeId: number): Observable<SeatMapResponse> {
    return this.http.get<SeatMapResponse>(`${API_BASE}/showtimes/${showtimeId}/seats`);
  }

  getShowtime(showtimeId: number): Observable<{ showtime: ShowtimeWithRefs }> {
    return this.http.get<{ showtime: ShowtimeWithRefs }>(`${API_BASE}/showtimes/${showtimeId}`);
  }

  private toParams(query: object): HttpParams {
    let params = new HttpParams();
    Object.entries(query as Record<string, unknown>).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '' && value !== 'All') {
        params = params.set(key, String(value));
      }
    });
    return params;
  }
}
