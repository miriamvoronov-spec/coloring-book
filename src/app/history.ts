/**
 * Undo/redo stack of patch swaps. Each entry holds the pixels of a rectangle
 * as they were before the action. Undo swaps them with the current pixels,
 * so the same entry then serves as the redo patch.
 */

export interface Patch<T> { x: number; y: number; w: number; h: number; data: T; layer?: string }

export interface Surface<T> {
  read(x: number, y: number, w: number, h: number, layer?: string): T;
  write(p: Patch<T>): void;
}

export class History<T> {
  private undoStack: Patch<T>[] = [];
  private redoStack: Patch<T>[] = [];
  constructor(private surface: Surface<T>, public limit = 60) {}

  /** Record the "before" pixels of an action that is about to be (or was just) applied. */
  push(before: Patch<T>): void {
    this.undoStack.push(before);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get size(): number { return this.undoStack.length; }

  undo(): boolean { return this.swap(this.undoStack, this.redoStack); }
  redo(): boolean { return this.swap(this.redoStack, this.undoStack); }

  clear(): void { this.undoStack = []; this.redoStack = []; }

  private swap(from: Patch<T>[], to: Patch<T>[]): boolean {
    const p = from.pop();
    if (!p) return false;
    const now = this.surface.read(p.x, p.y, p.w, p.h, p.layer);
    this.surface.write(p);
    to.push({ ...p, data: now });
    return true;
  }
}
