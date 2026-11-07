export interface Movie {
  id: number;
  tmdbId: number;
  title: string;
  genre: string;
  posterUrl: string | null;
  description: string | null;
  durationMinutes: number;
  tmdbRating: number;
  releaseDate: string;
  language: string;
  certificate: string;
  tags: string[];
}

/** A movie can play in several languages, stored as a comma-separated list ("Hindi, Tamil"). */
export function languagesOf(movie: Pick<Movie, 'language'>): string[] {
  return movie.language
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export interface Theater {
  id: number;
  name: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  phoneNumber: string | null;
  distanceKm?: number;
  /** The theatre's logo image, when one is available; otherwise a tile is drawn from its initials. */
  logoUrl?: string | null;
}

export interface Showtime {
  id: number;
  movieId: number;
  theaterId: number;
  showDateTime: string;
  /** The language this show is in: one of the movie's languages. */
  language: string;
  /** 2D, 3D, IMAX or PXL. */
  format: string;
  totalSeats: number;
  availableSeats: number;
  basePrice: number;
}

export interface ShowtimeWithRefs extends Showtime {
  movie: Movie;
  theater: Theater;
}

export type SeatStatus = 'Available' | 'Booked' | 'Blocked';
export type SeatCategory = 'Regular' | 'Premium' | 'Recliner' | 'Couple';

export interface Seat {
  id: string;
  row: string;
  number: number;
  category: SeatCategory;
  price: number;
  status: SeatStatus;
}

export interface SeatRow {
  label: string;
  category: SeatCategory;
  seats: Seat[];
}

export interface SeatMap {
  rows: SeatRow[];
  screenLabel: string;
}

export interface SeatMapResponse {
  seatMap: SeatMap;
  availableSeats: number;
  basePrice: number;
  categories: { name: SeatCategory; price: number }[];
}

export interface MovieListResponse {
  movies: Movie[];
  genres: string[];
  cities: string[];
  languages: string[];
}

export interface ShowtimeListResponse {
  showtimes: ShowtimeWithRefs[];
  theaters: Theater[];
  formats: string[];
  dates: string[];
}

/** Every upcoming show at one theatre, with the days that have any. */
export interface TheatreShowsResponse {
  theater: Theater;
  showtimes: ShowtimeWithRefs[];
  dates: string[];
}

export interface TheaterWithMovies extends Theater {
  movies: { id: number; title: string }[];
}

export interface SearchResponse {
  movies: Movie[];
  theaters: TheaterWithMovies[];
}

export interface CatalogFilters {
  city: string;
  date: string;
  genre: string;
  language: string;
  format: string;
  search: string;
}
