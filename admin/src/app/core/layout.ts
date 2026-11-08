import { CATEGORIES, CategoryDef, CategoryStyle, CellValue, Category, Prices, SeatLayout } from './models';

/** The cell values that are not seat categories. */
const SPECIAL_CELLS = new Set<string>(['aisle', 'blocked', '']);

/** True for a cell that holds a seat category (any name the admin gave one). */
export function isCategory(value: CellValue): value is Category {
  return !SPECIAL_CELLS.has(value);
}

/** The categories every screen starts with. */
export function defaultCategories(): CategoryDef[] {
  return CATEGORIES.map((c) => ({ name: c.name, style: c.key as CategoryStyle }));
}

/** The categories of a layout, in the order the admin set them. */
export function categoriesOf(layout: SeatLayout): CategoryDef[] {
  return layout.categories ?? defaultCategories();
}

/** The look of a category. Unknown names are drawn as regular seats. */
export function styleOf(layout: SeatLayout, name: string): CategoryStyle {
  return categoriesOf(layout).find((c) => c.name === name)?.style ?? 'regular';
}

/** The seats that are sold as couples, as "row,col" keys. */
export function coupleSet(layout: SeatLayout): Set<string> {
  return new Set(layout.couples ?? []);
}

/**
 * Moves the couple seats along with the seats when rows or columns change. `move` gives a seat's new position, or null
 * when the seat no longer exists.
 */
export function remapCouples(couples: string[] | undefined, move: (row: number, col: number) => [number, number] | null): string[] {
  const out: string[] = [];
  for (const key of couples ?? []) {
    const [r, c] = key.split(',').map(Number);
    const next = move(r, c);
    if (next) out.push(`${next[0]},${next[1]}`);
  }
  return out;
}

/** The letter a row is named by when the admin has not named it: A, B, C and so on. */
export function rowLabel(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

/** The name of a row: the admin's name when there is one, otherwise its letter. */
export function rowNameOf(layout: SeatLayout, row: number): string {
  return layout.rowNames?.[row] || rowLabel(row);
}

/** A layout for a new screen: single seats in every row, with a central aisle. The admin adds other seat types. */
export function defaultLayout(rows: number, cols: number): SeatLayout {
  const aisleCol = Math.floor(cols / 2);
  const cells: CellValue[][] = [];
  for (let r = 0; r < rows; r++) {
    const category: Category = CATEGORIES[0].name;
    cells.push(Array.from({ length: cols }, (_, c) => (c === aisleCol ? 'aisle' : category)));
  }
  return { cells, prices: pricesFromBase(180) };
}

/** Each category keeps its usual difference from the regular price. */
export function pricesFromBase(base: number): Prices {
  const prices: Prices = {};
  for (const c of CATEGORIES) prices[c.name] = c.defaultPrice - 180 + base;
  return prices;
}

/** A copy of a layout that shares nothing with the original. */
export function copyLayout(layout: SeatLayout): SeatLayout {
  return {
    cells: layout.cells.map((r) => [...r]),
    prices: { ...layout.prices },
    categories: categoriesOf(layout).map((c) => ({ ...c })),
    rowNames: layout.rowNames ? [...layout.rowNames] : undefined,
    couples: layout.couples ? [...layout.couples] : undefined,
  };
}

export function countSeats(cells: CellValue[][]): number {
  return cells.reduce((n, row) => n + row.filter((v) => isCategory(v) || v === 'blocked').length, 0);
}

/** The categories a layout's cells use, in the order the admin set them. */
export function categoriesUsed(layout: SeatLayout): Category[] {
  const used = new Set<string>();
  for (const row of layout.cells) for (const v of row) if (isCategory(v)) used.add(v);
  return categoriesOf(layout)
    .map((c) => c.name)
    .filter((name) => used.has(name));
}

/**
 * Couple seats are sold as pairs. A run of couple seats in a row is paired from its first seat; an odd seat is left
 * over. `isCouple` says whether the seat at a position is a couple seat.
 */
export function lonePartners(cells: CellValue[][], isCouple: (row: number, col: number) => boolean): number {
  let lone = 0;
  cells.forEach((row, r) => {
    let run = 0;
    row.forEach((v, c) => {
      if (isCategory(v) && isCouple(r, c)) {
        run++;
      } else {
        if (run % 2 === 1) lone++;
        run = 0;
      }
    });
    if (run % 2 === 1) lone++;
  });
  return lone;
}
