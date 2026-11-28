/**
 * How big the open book and the colouring page appear. Every kind of screen
 * (phone, tablet, computer) keeps its own choice, with a sensible default.
 */
import { prefs } from './store';

export type DeviceKind = 'phone' | 'tablet' | 'desktop';
export type PageFit = 'whole' | 'width';
export interface Sizes { book: number; page: number; fit: PageFit }

export function deviceKind(): DeviceKind {
  let short = 1000, touch = false;
  try { short = Math.min(screen.width, screen.height); touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1; } catch { /* not a browser */ }
  if (short < 600) return 'phone';
  if (touch) return 'tablet';
  return 'desktop';
}
export const DEVICE_HE: Record<DeviceKind, string> = { phone: 'טלפון', tablet: 'טאבלט', desktop: 'מחשב' };

const DEFAULTS: Record<DeviceKind, Sizes> = {
  phone: { book: 100, page: 100, fit: 'whole' },
  tablet: { book: 94, page: 100, fit: 'whole' },
  desktop: { book: 86, page: 96, fit: 'whole' },
};

export function sizes(): Sizes {
  const k = deviceKind();
  return { ...DEFAULTS[k], ...prefs.get<Partial<Sizes>>('sizes.' + k, {}) };
}
export function setSizes(patch: Partial<Sizes>): void {
  const k = deviceKind();
  prefs.set('sizes.' + k, { ...prefs.get<Partial<Sizes>>('sizes.' + k, {}), ...patch });
  dispatchEvent(new Event('resize'));
}
export function resetSizes(): void { prefs.del('sizes.' + deviceKind()); dispatchEvent(new Event('resize')); }
