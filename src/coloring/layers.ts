/**
 * Colour layers: pure list operations (kept apart from the canvas so they can
 * be tested). Index 0 is the bottom layer; the last one is on top.
 */
export type Blend = 'normal' | 'multiply' | 'overlay';
export const BLEND_HE: Record<Blend, string> = { normal: 'רגיל', multiply: 'הכפלה (multiply)', overlay: 'שכבת על (overlay)' };

export interface LayerProps {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: Blend;
}

export const cssBlend = (b: Blend) => (b === 'normal' ? 'normal' : b);
export const compositeOp = (b: Blend): GlobalCompositeOperation => (b === 'normal' ? 'source-over' : b);

let seq = 0;
export const layerId = () => `L${Date.now().toString(36)}${(seq++).toString(36)}`;

/** The next free "שכבה N" name. */
export function nextName(list: { name: string }[]): string {
  let n = list.length + 1;
  const names = new Set(list.map((l) => l.name));
  while (names.has(`שכבה ${n}`)) n++;
  return `שכבה ${n}`;
}

/** Move the item at `from` one step up (+1) or down (-1). Returns the new index. */
export function moveIn<T>(list: T[], from: number, dir: 1 | -1): number {
  const to = from + dir;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return from;
  const [x] = list.splice(from, 1);
  list.splice(to, 0, x);
  return to;
}

/** Which layer stays active after removing `at`. */
export function activeAfterRemove(len: number, at: number, active: number): number {
  if (len <= 1) return 0;
  if (active > at) return active - 1;
  if (active === at) return Math.max(0, Math.min(at, len - 2));
  return active;
}
