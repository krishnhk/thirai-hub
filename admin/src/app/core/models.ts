/** Seat categories a screen can use, with the price a new layout starts from. */
export const CATEGORIES = [
  { name: 'Premium', key: 'regular', defaultPrice: 180 },
  { name: 'Couple', key: 'regular', defaultPrice: 450 },
] as const;

/** How a seat category is drawn: the look is chosen by the admin, the name is the admin's own. */
export type CategoryStyle = 'recliner' | 'premium' | 'regular' | 'couple';

/** A seat category a screen defines. Its prices are kept by name in the layout's prices. */
export interface CategoryDef {
  name: string;
  style: CategoryStyle;
}

/** The name of a seat category, as the admin wrote it. */
export type Category = string;

/** One cell of a layout: a category name, 'aisle', 'blocked' (unavailable) or '' (empty space). */
export type CellValue = string;

export type Prices = Partial<Record<Category, number>>;

export interface SeatLayout {
  /** Rows from the front (row 0 is the first row). */
  cells: CellValue[][];
  /** The default price for each category used on the screen. */
  prices: Prices;
  /** The screen's categories. Layouts saved before categories could be defined use the defaults. */
  categories?: CategoryDef[];
  /** A name for each row, such as "A" or "Front". Rows without a name are named A, B, C and so on. */
  rowNames?: string[];
  /** The seats sold as couples, as "row,col" keys. Every other seat is a single seat. */
  couples?: string[];
}

export interface Theatre {
  id: number;
  name: string;
  address: string;
  /** The theatre brand logo, shown in the admin frame. */
  logoUrl?: string;
}

export interface Screen {
  id: number;
  theatreId: number;
  name: string;
  /** The kind of auditorium: a regular screen or a premium format such as IMAX. */
  type: ScreenType;
  layout: SeatLayout;
}

export interface Movie {
  id: number;
  title: string;
  minutes: number;
  /** The film poster, portrait 2:3. */
  posterUrl?: string;
}

export interface Show {
  id: number;
  theatreId: number;
  screenId: number;
  movieId: number;
  start: Date;
  format: string;
  language: string;
  prices: Prices;
  published: boolean;
}

export interface NewShow {
  theatreId: number;
  screenId: number;
  movieId: number;
  start: Date;
  format: string;
  language: string;
  prices: Prices;
  published: boolean;
}

/** How a show is projected, chosen for each show. */
export const FORMATS = ['2D', '3D'] as const;
/** The kind of auditorium, chosen when a screen is created. */
export const SCREEN_TYPES = ['Regular', 'IMAX', 'PXL', 'EPIQ', '4DX'] as const;
export type ScreenType = (typeof SCREEN_TYPES)[number];
export const LANGUAGES = ['Tamil', 'Telugu', 'Hindi'] as const;

/** Interval (break) in the middle of a show, in minutes. Shows end this long after the film, so the end time includes it. */
export const INTERVAL_MINUTES = 15;

/** Time a screen is kept free after a film ends, for cleaning. */
export const CLEANING_MINUTES = 20;

/** A category price cannot be lower than this, in rupees. */
export const MIN_PRICE = 50;

/** A show that starts within this many minutes is treated as starting soon. */
export const STARTING_SOON_MINUTES = 30;
