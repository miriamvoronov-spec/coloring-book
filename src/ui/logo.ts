/** Original logo: an open coloring book with a pencil drawing a trail of stardust. */

export function logoMark(size = 220): string {
  return `
<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="לוגו Miriam Coloring Books">
  <defs>
    <linearGradient id="lg-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff1b8"/><stop offset=".45" stop-color="#f2c75c"/><stop offset="1" stop-color="#b9822a"/>
    </linearGradient>
    <linearGradient id="lg-page" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#f1e2c4"/>
    </linearGradient>
    <linearGradient id="lg-pencil" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e2556f"/><stop offset=".5" stop-color="#ff8aa0"/><stop offset="1" stop-color="#c63f5b"/>
    </linearGradient>
    <radialGradient id="lg-glow" cx=".5" cy=".55" r=".5">
      <stop offset="0" stop-color="#ffd77a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd77a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="120" cy="132" r="110" fill="url(#lg-glow)"/>
  <!-- book cover -->
  <path d="M22 168 Q70 150 120 172 Q170 150 218 168 L218 182 Q170 166 120 188 Q70 166 22 182 Z" fill="#7a3f22" stroke="url(#lg-gold)" stroke-width="3"/>
  <!-- pages -->
  <path d="M30 92 Q74 76 118 96 L118 172 Q74 154 30 168 Z" fill="url(#lg-page)" stroke="#c9a36a" stroke-width="2"/>
  <path d="M210 92 Q166 76 122 96 L122 172 Q166 154 210 168 Z" fill="url(#lg-page)" stroke="#c9a36a" stroke-width="2"/>
  <!-- line art on the left page: a little flower with numbers -->
  <g fill="none" stroke="#3b2a1e" stroke-width="2.2">
    <circle cx="74" cy="122" r="9"/>
    <ellipse cx="74" cy="104" rx="7" ry="10"/><ellipse cx="74" cy="140" rx="7" ry="10"/>
    <ellipse cx="56" cy="122" rx="10" ry="7"/><ellipse cx="92" cy="122" rx="10" ry="7"/>
  </g>
  <path d="M74 104 m-7 0 a7 10 0 1 0 14 0 a7 10 0 1 0 -14 0" fill="#f28fb0" opacity=".85"/>
  <g font-family="Fredoka, sans-serif" font-weight="700" font-size="8" fill="#3b2a1e" text-anchor="middle">
    <text x="74" y="143">2</text><text x="56" y="125">2</text><text x="92" y="125">2</text><text x="74" y="125">1</text>
  </g>
  <!-- stardust trail on the right page -->
  <path class="logo-trail" d="M140 150 C 150 120, 175 140, 182 112 S 200 70, 214 52" fill="none" stroke="url(#lg-gold)" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7"/>
  <g fill="url(#lg-gold)">
    <path class="logo-star s1" d="M168 62 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/>
    <path class="logo-star s2" d="M196 104 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
    <path class="logo-star s3" d="M150 112 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
    <path class="logo-star s4" d="M214 30 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z"/>
  </g>
  <!-- pencil -->
  <g transform="translate(136 156) rotate(-48)">
    <rect x="0" y="-7" width="74" height="14" rx="2" fill="url(#lg-pencil)"/>
    <rect x="62" y="-7" width="12" height="14" fill="#e8d7a8"/><rect x="66" y="-7" width="3" height="14" fill="#c9a36a"/>
    <path d="M0 -7 L-16 0 L0 7 Z" fill="#f3d9a4"/>
    <path d="M-10 -2.6 L-16 0 L-10 2.6 Z" fill="#e2556f"/>
  </g>
</svg>`;
}

export function logoFull(size = 220): string {
  return `<div class="logo">${logoMark(size)}<div class="logo-word" dir="ltr">Miriam<span>Coloring Books</span></div></div>`;
}
