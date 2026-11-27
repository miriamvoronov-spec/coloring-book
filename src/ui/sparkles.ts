/** Sparkle and confetti particles on a full-screen canvas overlay. */
import { reducedMotion } from './dom';

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; hue: number; kind: 'spark' | 'confetti'; rot: number; vr: number }

let cvs: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let parts: P[] = [];
let running = false;

function ensure() {
  if (cvs) return;
  cvs = document.createElement('canvas');
  cvs.className = 'fx-layer';
  cvs.setAttribute('aria-hidden', 'true');
  document.body.append(cvs);
  ctx = cvs.getContext('2d');
  const fit = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    cvs!.width = innerWidth * dpr; cvs!.height = innerHeight * dpr;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  addEventListener('resize', fit);
}

function loop() {
  if (!ctx || !cvs) return;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life < p.max);
  for (const p of parts) {
    p.life++;
    p.x += p.vx; p.y += p.vy;
    p.rot += p.vr;
    const t = p.life / p.max;
    if (p.kind === 'spark') {
      p.vy += 0.02; p.vx *= 0.985; p.vy *= 0.985;
      const a = Math.sin(Math.PI * t);
      const s = p.size * (0.6 + 0.4 * Math.sin(p.life * 0.3));
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = a;
      ctx.fillStyle = `hsl(${p.hue} 95% 75%)`;
      ctx.shadowColor = `hsl(${p.hue} 100% 65%)`; ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? s * 0.25 : s;
        const ang = (i * Math.PI) / 4;
        ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      ctx.fill();
      ctx.restore();
    } else {
      p.vy += 0.05; p.vx *= 0.99; p.vy = Math.min(p.vy, 3.2);
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, (1 - t) * 3);
      ctx.fillStyle = `hsl(${p.hue} 85% 62%)`;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
  }
  if (parts.length) requestAnimationFrame(loop); else running = false;
}

function start() { if (!running) { running = true; requestAnimationFrame(loop); } }

const off = () => document.documentElement.classList.contains('no-sparkles');

export function sparkle(x: number, y: number, count = 40, spread = 6): void {
  if (off()) return;
  if (reducedMotion()) count = Math.min(count, 8);
  ensure();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, v = Math.random() * spread;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 0, max: 50 + Math.random() * 50,
      size: 3 + Math.random() * 7, hue: 38 + Math.random() * 20, kind: 'spark', rot: Math.random() * 3, vr: (Math.random() - 0.5) * 0.2 });
  }
  start();
}

/** A trail of sparkles along a path, e.g. behind the pencil in the logo. */
export function sparkleTrail(points: [number, number][], perPoint = 3): void {
  for (const [x, y] of points) sparkle(x, y, perPoint, 1.5);
}

export function confetti(count = 140): void {
  if (off()) count = Math.round(count / 4);
  if (reducedMotion()) return;
  ensure();
  for (let i = 0; i < count; i++) {
    parts.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2,
      life: 0, max: 220 + Math.random() * 120, size: 8 + Math.random() * 8, hue: [42, 340, 200, 120, 280][i % 5] + Math.random() * 10,
      kind: 'confetti', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.25 });
  }
  start();
}
