import { describe, expect, it } from 'vitest';
import { History, type Surface } from '../src/app/history';
import { autoSolution, labelRegions, legendLabelFor, opticalCenter, regionAt, regionMask, regionsForLabel } from '../src/app/raster';

/** 20×10 page: a vertical line at x=10 splits it into two closed regions. */
function twoRegions() {
  const W = 20, H = 10;
  const lines = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) lines[y * W + 10] = 1;
  return labelRegions(lines, W, H);
}

describe('regions', () => {
  it('finds closed regions split by a line', () => {
    const m = twoRegions();
    expect(m.count).toBe(2);
    expect(regionAt(m, 2, 2)).not.toBe(regionAt(m, 15, 2));
    expect(m.areas[1] + m.areas[2]).toBe(19 * 10);
  });

  it('a gap in the line joins the regions', () => {
    const W = 20, H = 10;
    const lines = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) if (y !== 5) lines[y * W + 10] = 1;
    expect(labelRegions(lines, W, H).count).toBe(1);
  });

  it('a point on a line resolves to the nearest region', () => {
    const m = twoRegions();
    expect(regionAt(m, 10, 3)).toBeGreaterThan(0);
  });

  it('handles concave regions (U shape) as one region', () => {
    const W = 12, H = 12;
    const lines = new Uint8Array(W * H);
    // a wall from the top down to y=8 in the middle: left and right meet under it
    for (let y = 0; y < 9; y++) lines[y * W + 6] = 1;
    expect(labelRegions(lines, W, H).count).toBe(1);
  });
});

describe('inside the lines mask', () => {
  it('covers the region and the line next to it, never the other region', () => {
    const m = twoRegions();
    const left = regionAt(m, 2, 2);
    const mask = regionMask(m, [left], 2);
    const at = (x: number, y: number) => mask.alpha[(y - mask.rect.y) * mask.rect.w + (x - mask.rect.x)];
    expect(at(3, 4)).toBe(255);
    expect(at(10, 4)).toBe(255); // under the line: no white seam
    expect(mask.rect.x + mask.rect.w).toBeLessThanOrEqual(12); // never reaches x=11+ (the right region)
  });
});

describe('lamp highlight', () => {
  const legend = [{ label: '1', color: '#ff0000' }, { label: '7', color: '#00aa00' }];
  it('maps the current colour to its legend number', () => {
    expect(legendLabelFor(legend, '#00aa00')).toBe('7');
    expect(legendLabelFor(legend, '#05ad03')).toBe('7');
    expect(legendLabelFor(legend, '#0000ff')).toBeNull();
  });
  it('selects every region carrying that number', () => {
    const m = twoRegions();
    const labels = [{ value: '7', x: 3, y: 5 }, { value: '7', x: 15, y: 5 }, { value: '1', x: 15, y: 2 }];
    expect(regionsForLabel(m, labels, '7').sort()).toEqual([1, 2]);
    expect(regionsForLabel(m, labels, '1')).toEqual([regionAt(m, 15, 2)]);
  });
  it('optical centre sits inside the region, away from its edges', () => {
    const m = twoRegions();
    const c = opticalCenter(m, regionAt(m, 2, 2));
    expect(c.x).toBeGreaterThanOrEqual(3);
    expect(c.x).toBeLessThanOrEqual(6);
    expect(regionAt(m, c.x, c.y, 0)).toBe(regionAt(m, 2, 2));
  });
  it('builds an automatic solution from numbers and legend', () => {
    const m = twoRegions();
    const px = autoSolution(m, [{ value: '1', x: 3, y: 3 }], legend);
    expect([...px.slice(0, 3)]).toEqual([255, 0, 0]);
    const right = (2 * 20 + 15) * 4;
    expect([...px.slice(right, right + 3)]).toEqual([255, 255, 255]);
  });
});

describe('undo / redo', () => {
  /** 1-D "canvas" of numbers; patches are slices. */
  function setup() {
    const px = new Array(10).fill(0);
    const surf: Surface<number[]> = {
      read: (x: number, _y: number, w: number) => px.slice(x, x + w),
      write: (p) => { p.data.forEach((v, i) => { px[p.x + i] = v; }); },
    };
    const hist = new History<number[]>(surf, 60);
    const act = (x: number, w: number, v: number) => {
      hist.push({ x, y: 0, w, h: 1, data: surf.read(x, 0, w, 1) });
      for (let i = x; i < x + w; i++) px[i] = v;
    };
    return { px, hist, act };
  }

  it('undoes and redoes in order', () => {
    const { px, hist, act } = setup();
    act(0, 3, 1); act(2, 3, 2);
    expect(px.slice(0, 5)).toEqual([1, 1, 2, 2, 2]);
    hist.undo();
    expect(px.slice(0, 5)).toEqual([1, 1, 1, 0, 0]);
    hist.undo();
    expect(px.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    hist.redo(); hist.redo();
    expect(px.slice(0, 5)).toEqual([1, 1, 2, 2, 2]);
  });

  it('a new action clears redo', () => {
    const { hist, act } = setup();
    act(0, 1, 1); hist.undo();
    expect(hist.canRedo).toBe(true);
    act(1, 1, 5);
    expect(hist.canRedo).toBe(false);
  });

  it('keeps at least 50 actions', () => {
    const { px, hist, act } = setup();
    for (let i = 1; i <= 70; i++) act(0, 1, i);
    let n = 0;
    while (hist.undo()) n++;
    expect(n).toBeGreaterThanOrEqual(50);
    expect(px[0]).toBe(70 - n);
  });
});

import { activeAfterRemove, moveIn, nextName } from '../src/coloring/layers';

describe('colour layers', () => {
  it('moves a layer up and down and stays inside the list', () => {
    const l = ['a', 'b', 'c'];
    expect(moveIn(l, 0, 1)).toBe(1); expect(l).toEqual(['b', 'a', 'c']);
    expect(moveIn(l, 2, 1)).toBe(2); expect(l).toEqual(['b', 'a', 'c']);
    expect(moveIn(l, 1, -1)).toBe(0); expect(l).toEqual(['a', 'b', 'c']);
  });
  it('keeps a sensible active layer after a delete', () => {
    expect(activeAfterRemove(3, 2, 2)).toBe(1);
    expect(activeAfterRemove(3, 0, 2)).toBe(1);
    expect(activeAfterRemove(3, 2, 0)).toBe(0);
    expect(activeAfterRemove(1, 0, 0)).toBe(0);
  });
  it('names new layers without clashing', () => {
    expect(nextName([{ name: 'שכבה 1' }])).toBe('שכבה 2');
    expect(nextName([{ name: 'שכבה 1' }, { name: 'שכבה 3' }])).toBe('שכבה 4');
  });
});
