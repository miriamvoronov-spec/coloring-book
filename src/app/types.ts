/** Data model shared by the screens, the importer and storage. */

export type Direction = 'ltr' | 'rtl';
export type PageKind = 'cover' | 'coloring' | 'back';

export interface Category {
  id: string;
  name: string;
  icon: string;
  order: number;
  /** Built-in categories keep their role even after a rename. */
  role?: 'claude' | 'imported';
}

export interface Label {
  value: string;
  /** Position in page pixels (centre of the number). */
  x: number;
  y: number;
  /** Font size in page pixels. */
  size: number;
  confidence?: number;
  uncertain?: boolean;
}

export interface LegendEntry {
  label: string;
  color: string;
}

export interface BookMeta {
  id: string;
  categoryId: string;
  title: string;
  coverColor: string;
  direction: Direction;
  madeWithClaude: boolean;
  pageIds: string[];
  createdAt: number;
  demo?: boolean;
  /** Drawing style of a book made with Claude; its well-done page matches it. */
  style?: string;
  favorite?: boolean;
  current?: boolean;
  /** When she pressed "סיימתי" for this book. */
  finishedAt?: number;
  /** Books made with Claude have a tune of their own unless she turned it off. */
  music?: boolean;
}

export interface PageRec {
  id: string;
  bookId: string;
  kind: PageKind;
  width: number;
  height: number;
  /** Covers: the colour picture. Coloring pages: black line art on white. */
  image: Blob;
  labels: Label[];
  legend: LegendEntry[];
  /** True when the numbers are already printed inside `image`. */
  numbersInImage: boolean;
  solution?: Blob;
  title?: string;
}

export interface PaintLayerRec { id: string; name: string; visible: boolean; locked: boolean; opacity: number; blend: string; blob: Blob }

export interface PaintRec {
  pageId: string;
  /** Every visible layer flattened: thumbnails, backups, older versions. */
  color: Blob;
  updatedAt: number;
  layers?: PaintLayerRec[];
  active?: number;
}
