/** Original logo: an open coloring book with a pencil drawing a trail of stardust. */
import { prefs } from '../app/store';
import { logoMedallion, logoMoon, logoPalette } from './logos';

export const LOGO_STYLES: { id: string; name: string }[] = [
  { id: 'book', name: 'חוברת פתוחה' },
  { id: 'medallion', name: 'מדליון זהב' },
  { id: 'palette', name: 'פלטת צבעים' },
  { id: 'moon', name: 'ירח וכוכבים' },
];
const LABEL = 'לוגו Miriam&#39;s Coloring Books';

export function logoMark(size = 220, style = prefs.get('logoStyle', 'book')): string {
  if (style === 'medallion') return logoMedallion(size, LABEL);
  if (style === 'palette') return logoPalette(size, LABEL);
  if (style === 'moon') return logoMoon(size, LABEL);
  return bookLogo(size);
}

function bookLogo(size: number): string {
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="לוגו Miriam&#39;s Coloring Books">
  <defs>
    <linearGradient id="lg-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff4c8"/><stop offset=".5" stop-color="#f0c766"/><stop offset="1" stop-color="#b98a33"/>
    </linearGradient>
    <linearGradient id="lg-cover" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2d3f86"/><stop offset="1" stop-color="#18234f"/>
    </linearGradient>
    <linearGradient id="lg-pageL" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fbf1dc"/><stop offset=".8" stop-color="#fffaf0"/><stop offset="1" stop-color="#e9d6b0"/>
    </linearGradient>
    <linearGradient id="lg-pageR" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#fbf1dc"/><stop offset=".8" stop-color="#fffaf0"/><stop offset="1" stop-color="#e9d6b0"/>
    </linearGradient>
    <linearGradient id="lg-pencil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c9b3ff"/><stop offset=".5" stop-color="#9d7ae6"/><stop offset="1" stop-color="#6f4fc2"/>
    </linearGradient>
    <linearGradient id="lg-dust" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#f0c766" stop-opacity=".2"/><stop offset=".4" stop-color="#ffe7a0"/><stop offset="1" stop-color="#fff8e0"/>
    </linearGradient>
    <radialGradient id="lg-glow" cx=".5" cy=".55" r=".5">
      <stop offset="0" stop-color="#ffdf92" stop-opacity=".35"/><stop offset="1" stop-color="#ffdf92" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="120" cy="140" rx="112" ry="96" fill="url(#lg-glow)"/>
  <ellipse cx="120" cy="196" rx="92" ry="9" fill="#000" opacity=".25"/>
  <!-- covers -->
  <path d="M120 188 C 96 172, 52 170, 12 180 L 12 92 C 50 80, 92 82, 120 98 Z" fill="url(#lg-cover)" stroke="url(#lg-gold)" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M120 188 C 144 172, 188 170, 228 180 L 228 92 C 190 80, 148 82, 120 98 Z" fill="url(#lg-cover)" stroke="url(#lg-gold)" stroke-width="2.4" stroke-linejoin="round"/>
  <!-- page block -->
  <g fill="none" stroke="#d9c49b" stroke-width="1.2">
    <path d="M120 182 C 96 166, 56 164, 20 172"/><path d="M120 179 C 96 163, 56 161, 21 169"/>
    <path d="M120 182 C 144 166, 184 164, 220 172"/><path d="M120 179 C 144 163, 184 161, 219 169"/>
  </g>
  <!-- pages -->
  <path d="M120 176 C 96 160, 58 158, 22 166 L 22 88 C 56 78, 94 80, 120 96 Z" fill="url(#lg-pageL)" stroke="#cfb07a" stroke-width="1.2"/>
  <path d="M120 176 C 144 160, 182 158, 218 166 L 218 88 C 184 78, 146 80, 120 96 Z" fill="url(#lg-pageR)" stroke="#cfb07a" stroke-width="1.2"/>
  <path d="M120 96 L 120 176" stroke="#c9a36a" stroke-width="1.4" opacity=".7"/>
  <!-- a little castle to colour by numbers on the left page -->
  <g transform="translate(71 125) scale(.78) translate(-72 -118)">
  <g stroke="#3b2a1e" stroke-width="1.5" stroke-linejoin="round" fill="none">
    <path d="M64 104 L72 86 L80 104 Z" fill="#f7a8c4"/>
    <rect x="65" y="104" width="14" height="44" fill="#fff"/>
    <path d="M47 114 L54 100 L61 114 Z" fill="#fff"/>
    <rect x="48" y="114" width="12" height="34" fill="#a9d4f5"/>
    <path d="M83 114 L90 100 L97 114 Z" fill="#fff"/>
    <rect x="84" y="114" width="12" height="34" fill="#fff"/>
    <rect x="60" y="126" width="24" height="22" fill="#fff"/>
    <path d="M67.5 148 v-9 a4.5 4.5 0 0 1 9 0 v9" fill="#fff"/>
    <path d="M72 86 v-7 l7 2.5 -7 2.5"/>
  </g>
  <g font-family="Fredoka, 'Varela Round', sans-serif" font-weight="700" font-size="7" fill="#3b2a1e" text-anchor="middle">
    <text x="72" y="119">3</text><text x="90" y="111">1</text><text x="90" y="133">2</text><text x="64" y="136">4</text><text x="72" y="136">4</text>
  </g>
  </g>
  <!-- a trail of twinkling stars rising from the pencil tip -->
  <g fill="url(#lg-gold)" stroke="#b07a26" stroke-width=".5">
    <path class="logo-star s1" d="M150 114.8 Q150.512 117.488 153.2 118 Q150.512 118.512 150 121.2 Q149.488 118.512 146.8 118 Q149.488 117.488 150 114.8Z"/><path class="logo-star s2" d="M160 99.8 Q160.672 103.328 164.2 104 Q160.672 104.672 160 108.2 Q159.328 104.672 155.8 104 Q159.328 103.328 160 99.8Z"/><path class="logo-star s3" d="M172 86.8 Q172.832 91.168 177.2 92 Q172.832 92.832 172 97.2 Q171.168 92.832 166.8 92 Q171.168 91.168 172 86.8Z"/><path class="logo-star s4" d="M182 74.4 Q182.576 77.424 185.6 78 Q182.576 78.576 182 81.6 Q181.424 78.576 178.4 78 Q181.424 77.424 182 74.4Z"/><path class="logo-star s1" d="M190 55.6 Q191.024 60.976 196.4 62 Q191.024 63.024 190 68.4 Q188.976 63.024 183.6 62 Q188.976 60.976 190 55.6Z"/><path class="logo-star s2" d="M198 43.6 Q198.704 47.296 202.4 48 Q198.704 48.704 198 52.4 Q197.296 48.704 193.6 48 Q197.296 47.296 198 43.6Z"/><path class="logo-star s3" d="M208 25.5 Q209.36 32.64 216.5 34 Q209.36 35.36 208 42.5 Q206.64 35.36 199.5 34 Q206.64 32.64 208 25.5Z"/>
    <circle cx="155" cy="112" r="1.2" fill="#e9b94f" stroke="none"/><circle cx="166" cy="99" r="1.4" fill="#e9b94f" stroke="none"/><circle cx="178" cy="86" r="1.1" fill="#e9b94f" stroke="none"/><circle cx="186" cy="70" r="1.5" fill="#e9b94f" stroke="none"/><circle cx="195" cy="55" r="1.2" fill="#e9b94f" stroke="none"/><circle cx="203" cy="42" r="1.3" fill="#e9b94f" stroke="none"/><circle cx="214" cy="46" r="1.0" fill="#e9b94f" stroke="none"/><circle cx="196" cy="72" r="0.9" fill="#e9b94f" stroke="none"/><circle cx="170" cy="108" r="0.9" fill="#e9b94f" stroke="none"/>
  </g>
  <!-- coloured pencil resting on the right page -->
  <g transform="translate(142 134) rotate(38)">
    <path d="M0 0 L12 -5.5 L12 5.5 Z" fill="#f3d9a4"/>
    <path d="M0 0 L5 -2.3 L5 2.3 Z" fill="#7a55d0"/>
    <rect x="12" y="-5.5" width="62" height="11" fill="url(#lg-pencil)"/>
    <path d="M12 -1.8 H74 M12 1.8 H74" stroke="#5a3ea8" stroke-width=".6" opacity=".5"/>
    <rect x="74" y="-5.5" width="7" height="11" fill="url(#lg-gold)"/>
    <rect x="81" y="-5.5" width="6" height="11" rx="2" fill="#6f4fc2"/>
  </g>
</svg>`;
}

export function logoFull(size = 220): string {
  return `<div class="logo">${logoMark(size)}<div class="logo-word" dir="ltr">Miriam&#39;s<span>Coloring Books</span></div></div>`;
}
